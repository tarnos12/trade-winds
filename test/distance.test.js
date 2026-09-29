// Headless test for the design-pass DISTANCE rule (plan item 7): a trader's leg takes
// longer on a longer route, so roads and city placement matter.
//  - progress per tick = min(cartSpeed, CONFIG.trade.cartTilesPerTick / pathSteps)
//    × paved × (off-road ? offRoadSpeedMult : 1) — Trade.legSpeed, shared by town
//    traders and the castle's royal buyers (which now also honour the off-road ×0.5);
//  - routes of ≤ 8 hexes are byte-for-byte unchanged vs the legacy length-blind rule;
//  - on a 20-hex route a road delivers ≥ 1.4× the potato of the off-road route.
// Reuses the customs.test.js FARM→MINE world with the importer at distance D.
//   node test/distance.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim; this.Trade=Trade; this.ResearchEconomy=ResearchEconomy; this.Pathing=Pathing;", sandbox);
const { CONFIG, HexMath, Sim, Trade, ResearchEconomy, Pathing } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } }
const K = (q, r) => HexMath.key(q, r);
const near = (a, b) => Math.abs(a - b) < 1e-12;
const pathOf = steps => Array.from({ length: steps + 1 }, (_, i) => K(i, 0));

// --- 1. Trade.legSpeed: short routes keep the base rate, long ones scale 1/steps ----
const TPT = CONFIG.trade.cartTilesPerTick;
ok("cartTilesPerTick defaults to 2", TPT === 2);
ok("8-hex route keeps the old 0.25/tick (4-tick leg)", Trade.legSpeed(0.25, { path: pathOf(8) }) === 0.25);
ok("3-hex route keeps the old 0.25/tick", Trade.legSpeed(0.25, { path: pathOf(3) }) === 0.25);
ok("20-hex route: 2/20 = 0.1/tick (10-tick leg)", near(Trade.legSpeed(0.25, { path: pathOf(20) }), 0.1));
ok("45-hex route: 2/45 per tick", near(Trade.legSpeed(0.25, { path: pathOf(45) }), 2 / 45));
ok("a cart with no path (legacy) keeps the base rate", Trade.legSpeed(0.25, {}) === 0.25);
CONFIG.trade.cartTilesPerTick = 0;
ok("cartTilesPerTick 0 = legacy length-blind legs", Trade.legSpeed(0.25, { path: pathOf(45) }) === 0.25);
CONFIG.trade.cartTilesPerTick = TPT;

// --- 2. Castle royal buyers: same per-hex rule + the off-road ×0.5 they used to skip ---
function castleCart(steps, road) {
  const c = { id: 1, kind: "castle", fromId: ResearchEconomy.CASTLE_ID, toId: 99, goodId: "wood", qty: 1,
    unitBuy: 1, agreedGold: 1, path: pathOf(steps), progress: 0, phase: "outbound", done: false };
  if (road !== undefined) c.road = road;
  const st = { towns: [], carts: [c], treasury: 0, tick: 0, researchSeed: 3 };
  ResearchEconomy.tick(st, true);
  return c.progress;
}
ok("royal buyer, 4-hex road route: unchanged 0.5/tick", near(castleCart(4, true), 0.5));
ok("royal buyer, 20-hex road route: 2/20 = 0.1/tick", near(castleCart(20, true), 0.1));
ok("royal buyer, 20-hex off-road route: 0.1 × 0.5 = 0.05/tick", near(castleCart(20, false), 0.05));
ok("royal buyer, 4-hex off-road route: 0.5 × 0.5 = 0.25/tick", near(castleCart(4, false), 0.25));
ok("pre-pass in-flight royal buyer (no road flag) is treated as on-road", near(castleCart(4), 0.5));

// --- 3. The customs.test.js FARM→MINE world with the importer D hexes away ---------
function mkTown(over) {
  return Object.assign({ id: 1, q: 0, r: 0, level: 1, gold: 100000,
    pop: { peasants: 10, workers: 0, burghers: 0 }, stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100 }, over);
}
const huts = n => Array.from({ length: n }, () => ({ typeId: "hut" }));
function world(D, road) {
  const farm = mkTown({ id: 1, q: 0, r: 0, pop: { peasants: 12, workers: 0, burghers: 0 },
    buildings: [...Array.from({ length: 6 }, () => ({ typeId: "potato_farm", workers: 2 })), { typeId: "lumberjack", workers: 2 }, ...huts(6)],
    stock: { potato: 80, wood: 80 } });
  const mine = mkTown({ id: 2, q: D, r: 0, pop: { peasants: 20, workers: 0, burghers: 0 },
    buildings: [{ typeId: "lumberjack", workers: 2 }, ...huts(10)], stock: { wood: 80 } });
  const roads = new Set();
  if (road) for (let q = 1; q < D; q++) roads.add(K(q, 0));
  return { roads, towns: [farm, mine], carts: [], treasury: 0, tradeSeed: 7, tick: 0 };
}
const TICKS = 2400;   // 20 game-minutes
function trial(D, road, tpt) {
  const saved = CONFIG.trade.cartTilesPerTick;
  CONFIG.trade.cartTilesPerTick = tpt;
  Pathing.invalidate();   // routes are memoized by endpoint keys — a fresh road set needs a fresh cache
  const st = world(D, road);
  try { for (let i = 0; i < TICKS; i++) { Sim.tick(st); Trade.tick(st); } }
  finally { CONFIG.trade.cartTilesPerTick = saved; }
  return st;
}
const ser = st => JSON.stringify(st, (k, v) => v instanceof Set ? [...v] : v);
const potato = st => ((st.stats && st.stats.traded && st.stats.traded.byGood) || {}).potato || 0;

// D ≤ 8: the whole end state matches the legacy (length-blind) rule byte-for-byte.
for (const D of [3, 6, 8]) for (const road of [true, false]) {
  ok(`D=${D} ${road ? "road" : "off-road"}: identical to legacy legs`, ser(trial(D, road, TPT)) === ser(trial(D, road, 0)));
}

// D = 20: a road now matters — it roughly halves the leg time vs open ground.
const r20 = trial(20, true, TPT), o20 = trial(20, false, TPT);
const pR = potato(r20), pO = potato(o20);
ok(`D=20 potato traded on both routes (${pR} / ${pO})`, pR > 0 && pO > 0);
ok(`D=20 road delivers ≥ 1.4× the off-road potato (${pR} vs ${pO}, ${(pR / Math.max(1, pO)).toFixed(2)}×)`, pR >= 1.4 * pO);
// Distance is no longer free: the 20-hex off-road importer gets less than a nearby one.
const o6 = trial(6, false, TPT);
ok(`D=20 off-road delivers less than D=6 off-road (${pO} < ${potato(o6)})`, pO < potato(o6));
// And under the legacy rule every distance was identical (the audit's finding) — guard
// that the new rule is what makes the difference.
ok("legacy rule was distance-blind: D=20 road == D=3 road (sanity)",
  potato(trial(20, true, 0)) === potato(trial(3, true, 0)));
// Determinism: same inputs ⇒ same bytes.
ok("D=20 road run is deterministic", ser(trial(20, true, TPT)) === ser(r20));

console.log(`distance.test.js: ${pass} passed, ${fail} failed  (D=20 road ${pR} vs off-road ${pO})`);
process.exit(fail ? 1 : 0);
