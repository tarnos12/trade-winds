// Headless balance test for Trade Winds — v0.51 per-minute rate rework.
// The author's 4-city scenario (placed instantly, connected by road):
//   City #1: 2 lumberjacks + 2 huts   (exports wood)
//   City #2: 2 potato farms + 2 huts  (exports potato)
//   City #3: 2 sawmills + 2 huts      (exports planks, imports food)
//   City #4: 4 huts, no producers     (imports everything, funds it with tax)
// Each city should reach ~2 happy peasants per hut (no luxury) once trade settles.
// Anchors under test: lumberjack 15 wood/min (2 workers, 16s cycle); potato farm
// 12/min; peasant 1.3 potato + 0.9 wood per minute.
//   node test/balance_cities.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: PURE_CORE markers not found"); process.exit(1); }
const s = {};
vm.createContext(s);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Trade=Trade; this.HexMath=HexMath; this.Pathing=Pathing;", s);
const { CONFIG, Sim, Trade, HexMath, Pathing } = s;
const K = (q, r) => HexMath.key(q, r);

let pass = 0, fail = 0;
function ok(name, cond, note) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (note ? "  -- " + note : "")); } }

// --- anchor rates -----------------------------------------------------------
const PER_MIN = 120;   // 2 ticks = 1 game-second ⇒ 120 ticks/min
const lj = CONFIG.buildings.lumberjack, pf = CONFIG.buildings.potato_farm;
const woodPerMin = lj.output.ratePerWorker * lj.workerSlots * PER_MIN;
const potPerMin = pf.output.ratePerWorker * pf.workerSlots * PER_MIN;
ok("lumberjack makes 15 wood/min at 2 workers", Math.abs(woodPerMin - 15) < 0.6, "got " + woodPerMin.toFixed(1));
ok("potato farm makes 12 potato/min at 2 workers", Math.abs(potPerMin - 12) < 0.6, "got " + potPerMin.toFixed(1));
const potPc = CONFIG.needs.tiers.peasants.perCapita.potato * PER_MIN;
const woodPc = CONFIG.needs.tiers.peasants.perCapita.wood * PER_MIN;
ok("peasant eats ~1.3 potato/min", Math.abs(potPc - 1.3) < 0.05, "got " + potPc.toFixed(2));
ok("peasant eats ~0.9 wood/min", Math.abs(woodPc - 0.9) < 0.05, "got " + woodPc.toFixed(2));

// --- 4-city scenario --------------------------------------------------------
function bld(typeId, q, r) { return { typeId, q, r, workers: 0, built: true }; }
function city(id, cx, producers) {
  const b = [];
  const nb = HexMath.neighbors(cx, 0);
  let i = 0;
  const huts = (id === 4) ? 4 : 2;
  for (let h = 0; h < huts; h++) { b.push(bld("hut", nb[i].q, nb[i].r)); i++; }
  for (const pt of producers) { b.push(bld(pt, nb[i].q, nb[i].r)); i++; }
  return { id, q: cx, r: 0, level: 1, gold: 5000, built: true,
    pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
    stock: { ...CONFIG.town.startStock }, prices: {}, demand: {}, buildings: b, happiness: 50 };  // real game seeds startStock
}
const C1 = city(1, 0, ["lumberjack", "lumberjack"]);
const C2 = city(2, 6, ["potato_farm", "potato_farm"]);
const C3 = city(3, 12, ["sawmill", "sawmill"]);
const C4 = city(4, 18, []);
const roads = new Set();
for (let q = -1; q <= 19; q++) roads.add(K(q, 0));
const st = { towns: [C1, C2, C3, C4], carts: [], treasury: 100000, tradeSeed: 1, roads, tick: 0, map: { hexes: new Map() } };
for (let q = -2; q <= 20; q++) for (let r = -2; r <= 2; r++) st.map.hexes.set(K(q, r), { q, r, terrain: "fertile" });
if (Pathing && Pathing.invalidate) Pathing.invalidate();

const pk = (t) => (t.pop.peasants || 0);
const hp = (t) => t.happiness || 0;

// The cluster should take REAL time to grow — it must NOT already be full at ~1 minute
// (living off the starting stock alone), it should be well on its way by ~3 minutes, and
// fully grown to a happy 2-per-hut by ~4 minutes. (Growth is paced by CONFIG.needs.growthRate.)
function runTo(min) { const target = Math.round(min * PER_MIN); while (st.tick < target) { st.tick++; Sim.tick(st); Trade.tick(st); } }
runTo(1);
ok("at ~1 min the cluster is NOT yet full (growth takes real time)", pk(C1) < 3.5 && pk(C4) < 6,
   "1m C1 " + pk(C1).toFixed(1) + " C4 " + pk(C4).toFixed(1));
runTo(3);
ok("by ~3 min the producer cities are well grown toward a full 2-per-hut (~3 of 4)", [C1, C2, C3].every(t => pk(t) >= 2.8),
   "3m " + [C1, C2, C3].map(t => "C" + t.id + " " + pk(t).toFixed(1)).join(" "));
runTo(4.5);
// City #1/#2/#3 have 2 huts (cap 2 each ⇒ 4 peasants at full); City #4 has 4 huts (8).
ok("City #1 (wood) reaches ~2 peasants/hut", pk(C1) >= 3.5, "pop " + pk(C1).toFixed(1));
ok("City #2 (potato) reaches ~2 peasants/hut", pk(C2) >= 3.5, "pop " + pk(C2).toFixed(1));
ok("City #3 (sawmill) reaches ~2 peasants/hut", pk(C3) >= 3.5, "pop " + pk(C3).toFixed(1));
ok("City #4 (importer) reaches most of its housing", pk(C4) >= 6, "pop " + pk(C4).toFixed(1));
ok("all four cities are happy (basics met, no luxury)", [C1, C2, C3, C4].every(t => hp(t) >= 65),
   [C1, C2, C3, C4].map(t => "C" + t.id + " h" + Math.round(hp(t))).join(" "));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
