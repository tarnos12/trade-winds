// Headless regression for design pass #4 — the taught OPENING must start the tariff loop.
// The onboarding (MissionEngine.DEFAULT m1/m2) now builds a Timber town (2 Lumberjacks +
// 2 Huts) and a Farm town (2 Potato Farms + 2 Huts). This runs that layout in PURE_CORE
// (Sim.tick + Trade.tick, 2 L1 cities with 8 road hexes between them) and checks it earns
// real tariff without costing either city population or happiness — and contrasts it with
// the old self-sufficient recipe (Lumberjack + Potato Farm + 2 Huts in EACH city), which
// trades nothing. Cities seed CONFIG.town.startStock like the real game.
//   node test/opening.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sb = {};
vm.createContext(sb);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim; this.Trade=Trade; this.MissionEngine=MissionEngine;", sb);
const { CONFIG, HexMath, Sim, Trade, MissionEngine } = sb;

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) pass++; else { fail++; console.error("  ✗ " + name + (info ? "  [" + info + "]" : "")); }
}
const K = (q, r) => HexMath.key(q, r);
const TPM = 120;   // 2 ticks = 1 game-second → 120 ticks per game-minute

function town(id, q, types, hutsN) {
  const b = []; let i = 1;
  for (const t of types) b.push({ typeId: t, q, r: i++, workers: 0, built: true });
  for (let h = 0; h < hutsN; h++) b.push({ typeId: "hut", q: q + 1, r: h, workers: 0, built: true });
  return { id, q, r: 0, level: 1, gold: 500, pop: { peasants: 2, workers: 0, burghers: 0, aristocrats: 0 },
    stock: Object.assign({}, CONFIG.town.startStock), prices: {}, demand: {}, buildings: b };
}
function world(a, b) {
  const roads = new Set(); for (let q = 1; q < 8; q++) roads.add(K(q, 0));
  return { roads, towns: [town(1, 0, a, 2), town(2, 8, b, 2)], carts: [], treasury: 0, tradeSeed: 7, tick: 0 };
}
function run(st, minutes) {
  for (let i = 0; i < minutes * TPM; i++) { Sim.tick(st); Trade.tick(st); }
  return st;
}
const tariff = (st) => (st.stats && st.stats.taxEarned) || 0;
const fmt = (t) => "pop" + (t.pop.peasants || 0).toFixed(2) + " h" + (t.happiness || 0).toFixed(1) + " pot" + Math.round(t.stock.potato || 0);

// ---- the DEFAULT m1/m2 recipe matches the layout this test runs -----------------
{
  const D = MissionEngine.DEFAULT.missions;
  const need = (mm, b) => (mm.objectives.find(o => o.type === "construct" && o.building === b) || {}).count || 0;
  ok("m1 asks for 2 Lumberjacks + 2 Huts", need(D[0], "lumberjack") === 2 && need(D[0], "hut") === 2);
  ok("m2 asks for 2 Potato Farms", need(D[1], "potato_farm") === 2);
}

// ---- B: Timber town | Farm town (the taught opening) -----------------------------
const B = run(world(["lumberjack", "lumberjack"], ["potato_farm", "potato_farm"]), 20);
{
  const tB = tariff(B);
  ok("specialised opening earns ≥ 120 tariff in 20 game-min (measured ~188 at potato 20)", tB >= 120, tB.toFixed(1));
  for (const t of B.towns) {
    ok("city #" + t.id + " keeps pop ≥ 3.9", (t.pop.peasants || 0) >= 3.9, fmt(t));
    ok("city #" + t.id + " keeps happiness ≥ 69", (t.happiness || 0) >= 69, fmt(t));
  }
  const byGood = (B.stats.traded && B.stats.traded.byGood) || {};
  ok("both staples cross the road (potato → Timber, wood → Farm)", (byGood.potato || 0) > 0 && (byGood.wood || 0) > 0, JSON.stringify(byGood));
}

// ---- A: the old self-sufficient recipe in both cities trades nothing ------------
const A = run(world(["lumberjack", "potato_farm"], ["lumberjack", "potato_farm"]), 20);
ok("old autarkic opening earns (almost) no tariff — why m1/m2 changed", tariff(A) < 10, tariff(A).toFixed(1));
ok("specialised opening out-earns the autarkic one by ≥ 100 tariff", tariff(B) - tariff(A) >= 100);

// ---- the Timber town's start potato bridges the wait for the Farm town -----------
// Porters move stock into the Huts' larders, so city stock hits 0 before the people
// go hungry; the real signal is happiness/pop. With potato 20 a lone Timber town
// starved at ~4.4 game-min; with 40 it holds until ~8.2 (≈ 7.7 min of food).
{
  const st = { roads: new Set(), towns: [town(1, 0, ["lumberjack", "lumberjack"], 2)], carts: [], treasury: 0, tradeSeed: 7, tick: 0 };
  run(st, 7);
  const t = st.towns[0];
  ok("start potato feeds a lone Timber town ≥ 7 game-min (pop ≥ 3.9, happiness ≥ 69)",
     (t.pop.peasants || 0) >= 3.9 && (t.happiness || 0) >= 69, fmt(t));
}

// Determinism: the same opening replays to the same tariff.
{
  const B2 = run(world(["lumberjack", "lumberjack"], ["potato_farm", "potato_farm"]), 20);
  ok("specialised opening is deterministic", tariff(B2) === tariff(B));
}

if (fail) { console.error("opening.test.js: " + pass + " passed, " + fail + " FAILED"); process.exit(1); }
console.log("opening.test.js: " + pass + " assertions passed (tariff B " + tariff(B).toFixed(1) + " vs A " + tariff(A).toFixed(1) + ")");
