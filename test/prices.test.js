// Headless test for Trade Winds T5 — goods/buildings catalog + local price model.
// Evals the pure code between the PURE_CORE markers in index.html (which now
// contains the GOODS-PRICES block) — no browser needed.
//   node test/prices.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim;", sandbox);
const { CONFIG, Sim } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// Build a fresh town (no stored prices) for a given stock/demand of one good.
function town(goodId, stock, demand) {
  return { id: 1, stock: { [goodId]: stock }, demand: { [goodId]: demand }, prices: {} };
}

// ---- catalog: goods ----
const EXPECTED = {
  // === CC: content chains v2 → 26 goods. T1 unchanged (8). T2 (10): planks/flour/
  // coal/gold/bricks + mead (was beer) + iron_tool (was tools) + clothes (moved
  // down from T3) + stone_tools + oil. T3 (8): bread + pottery/brandy/lamp/
  // iron_armor/luxury_clothes (new) + gold_ring (was jewelry) + chairs (was furniture).
  // Retired: cloth (+ weaver). ===
  1: ["wood", "stone", "iron", "clay", "grain", "potato", "fish", "wool"],
  2: ["planks", "iron_tool", "flour", "mead", "clothes", "stone_tools", "oil", "coal", "gold", "bricks"],
  3: ["bread", "pottery", "lamp", "iron_armor", "chairs", "gold_ring", "brandy", "luxury_clothes"],
};
// CC → 26 goods (tier1=8, tier2=10, tier3=8).
const enumeratedCount = EXPECTED[1].length + EXPECTED[2].length + EXPECTED[3].length;
ok("goods count matches enumerated list (26)", Object.keys(CONFIG.goods).length === enumeratedCount);
// === CC: a processed good's basePrice sits above the summed price of its inputs
// (positive labour margin) — a sanity floor on the new chains.
ok("processed goods priced above their input cost", Object.values(CONFIG.goods).every(g => {
  if (!g.inputs) return true;
  let inCost = 0;
  for (const inId in g.inputs) inCost += (CONFIG.goods[inId].basePrice || 0) * g.inputs[inId];
  return g.basePrice > inCost;
}));
for (const tier of [1, 2, 3]) {
  for (const id of EXPECTED[tier]) {
    ok(`good ${id} exists in tier ${tier}`, CONFIG.goods[id] && CONFIG.goods[id].tier === tier);
  }
}
ok("every good has valid tier 1-3", Object.values(CONFIG.goods).every(g => [1, 2, 3].includes(g.tier)));
ok("every good has id matching its key", Object.entries(CONFIG.goods).every(([k, g]) => g.id === k));
ok("every good has positive basePrice", Object.values(CONFIG.goods).every(g => typeof g.basePrice === "number" && g.basePrice > 0));
ok("all inputs reference real good ids", Object.values(CONFIG.goods).every(g =>
  !g.inputs || Object.keys(g.inputs).every(inId => CONFIG.goods[inId])));
ok("all input quantities positive", Object.values(CONFIG.goods).every(g =>
  !g.inputs || Object.values(g.inputs).every(q => q > 0)));
ok("basePrice climbs by tier (avg)", (() => {
  const avg = t => { const gs = Object.values(CONFIG.goods).filter(g => g.tier === t); return gs.reduce((s, g) => s + g.basePrice, 0) / gs.length; };
  return avg(1) < avg(2) && avg(2) < avg(3);
})());

// ---- catalog: buildings ----
ok("at least 6 buildings", Object.keys(CONFIG.buildings).length >= 6);
for (const id of ["lumberjack", "iron_mine", "farm", "fishery", "mill", "bakery"]) {
  ok(`building ${id} exists`, !!CONFIG.buildings[id]);
}
// Producers (extractors + processors) have an output good + worker slots; houses don't.
const producers = Object.values(CONFIG.buildings).filter(b => b.kind !== "house");
ok("every producer has valid output good", producers.every(b =>
  b.output && CONFIG.goods[b.output.goodId] && b.output.ratePerWorker > 0));
ok("every producer has workerSlots >= 1", producers.every(b => b.workerSlots >= 1));
ok("every building has a cost object", Object.values(CONFIG.buildings).every(b => b.cost && typeof b.cost === "object"));
ok("building inputs reference real goods", Object.values(CONFIG.buildings).every(b =>
  !b.inputs || Object.keys(b.inputs).every(inId => CONFIG.goods[inId])));
ok("processors declare inputs (mill, bakery)", !!CONFIG.buildings.mill.inputs && !!CONFIG.buildings.bakery.inputs);

// ---- econ constants ----
ok("bufferTarget ~= 2.0", approx(CONFIG.econ.bufferTarget, 2.0, 1e-9));
ok("baseTickMs preserved (non-destructive merge)", CONFIG.econ.baseTickMs === 500);
ok("terrain preserved (non-destructive merge)", !!CONFIG.terrain && !!CONFIG.terrain.forest);

// ---- price model (DESIGN PASS #6: unit-correct) ----
// Re-baselined: the old model divided stock by PER-TICK demand × 2 with a 0.5/tick
// floor, so every real city sat on the floor (ratio = stock) and prices were binary
// (0.4× or 1.6×) and identical in every city. Now: ratio = stock / (max(0.5/min,
// consDemand×120) × coverMin 2); target = base × clamp(1.9 − ratio, 0.4, 1.9).
const E = CONFIG.econ;
const TPM = E.ticksPerMin;
const base = CONFIG.goods.wood.basePrice;
ok("econ: ticksPerMin 120 (2 ticks = 1 game-second)", TPM === 120 && approx(60000 / E.baseTickMs, TPM, 1e-9));
ok("econ: coverMin 2, minDemandPerMin 0.5, ceil 1.9, floor 0.4",
  E.coverMin === 2 && E.minDemandPerMin === 0.5 && E.priceCeilMult === 1.9 && E.priceFloorMult === 0.4);
ok("Sim.coverRatio / Sim.hasMarket / Sim.consDemandOf exported",
  typeof Sim.coverRatio === "function" && typeof Sim.hasMarket === "function" && typeof Sim.consDemandOf === "function");

// Helper: a fresh town whose consumption is `perMin` units/min and whose stock gives
// the requested cover ratio (demand stored per TICK, as Sim.tick publishes it).
function priceAtRatio(ratio, perMin) {
  const pm = perMin || 10;
  const stock = ratio * pm * E.coverMin;
  return Sim.priceFor(town("wood", stock, pm / TPM), "wood");
}
ok("coverRatio is unit-correct (stock vs MINUTES of use)", (() => {
  const t = town("wood", 40, 10 / TPM);         // 10/min, 40 held = 4 min = 2 × coverMin
  return approx(Sim.coverRatio(t, "wood"), 2, 1e-9);
})());
ok("surplus (ratio ≥ 1.5) => price at 0.4x floor", approx(priceAtRatio(100), base * 0.4, 1e-6) && approx(priceAtRatio(1.5), base * 0.4, 1e-6));
ok("empty shelf with real demand => 1.9x ceiling", approx(priceAtRatio(0), base * 1.9, 1e-6));
ok("ratio 0.9 => price == basePrice", approx(priceAtRatio(0.9), base, 1e-6));
ok("ratio 1.0 (comfortable) => 0.9x base", approx(priceAtRatio(1.0), base * 0.9, 1e-6));
ok("price falls monotonically as cover rises",
  priceAtRatio(0) > priceAtRatio(0.3) && priceAtRatio(0.3) > priceAtRatio(0.9) && priceAtRatio(0.9) > priceAtRatio(1.2));
ok("clamp never exceeds the 1.9x ceiling or drops below 0.4x", [0, 0.01, 0.5, 1, 3, 1e6].every(r => {
  const p = priceAtRatio(r); return p <= base * 1.9 + 1e-9 && p >= base * 0.4 - 1e-9;
}));

// The audited bug: an 8-peasant city eats ~0.06 wood/tick (7.2/min). City A holds 7
// (≈1 min of use), city B holds 80. They must NOT price wood the same any more.
ok("real per-tick demand: 7 wood is scarce, 80 wood is surplus (cities differ ≥3×)", (() => {
  const pA = Sim.priceFor(town("wood", 7, 0.06), "wood");
  const pB = Sim.priceFor(town("wood", 80, 0.06), "wood");
  return pA > base * 1.3 && approx(pB, base * 0.4, 1e-6) && pA / pB >= 3;
})());
// Tiny demand hits the 0.5/min floor: 0.001/tick (0.12/min) with 1 unit held ⇒ ratio 1.
ok("demand floor is 0.5 per MINUTE", approx(Sim.coverRatio(town("wood", 1, 0.001), "wood"), 1, 1e-9));

// Consumption-only pricing: construction bills / research share live in town.demand
// (trade still buys them) but priceFor reads town.consDemand when Sim published it.
ok("construction bill in demand does NOT pin the price at the cap", (() => {
  const t = town("wood", 20, 16.06);            // 16 = a sawmill's remaining bill (lump), 0.06 eaten/tick
  t.consDemand = { wood: 0.06 };
  const p = Sim.priceFor(t, "wood");            // 20 / (7.2 × 2) = 1.39 ⇒ 0.51× base
  return approx(p, base * (1.9 - 20 / 14.4), 1e-6) && p < base;
})());
ok("consDemandOf falls back to demand for an un-ticked town", approx(Sim.consDemandOf(town("wood", 0, 0.3), "wood"), 0.3, 1e-12));
ok("consDemandOf prefers consDemand once published", (() => {
  const t = town("wood", 0, 5); t.consDemand = {}; return Sim.consDemandOf(t, "wood") === 0;
})());

// No market: nothing stocked AND nothing consumed ⇒ basePrice (UI shows "—").
ok("no stock + no demand => basePrice, hasMarket false", (() => {
  const t = town("wood", 0, 0);
  return approx(Sim.priceFor(t, "wood"), base, 1e-9) && !Sim.hasMarket(t, "wood");
})());
ok("construction-only demand (consDemand 0, stock 0) => no market => basePrice", (() => {
  const t = town("wood", 0, 16); t.consDemand = {};
  return approx(Sim.priceFor(t, "wood"), base, 1e-9) && !Sim.hasMarket(t, "wood");
})());
ok("stock with no consumption => a market (surplus floor)", (() => {
  const t = town("wood", 5, 0);
  return Sim.hasMarket(t, "wood") && approx(Sim.priceFor(t, "wood"), base * 0.4, 1e-6);
})());

// ---- smoothing: prices move gradually, not instantly ----
const t = town("wood", 0, 10 / TPM);   // empty shelf, real demand; target = 1.9x base
t.prices.wood = base;                  // pre-seed a stored price != target
const target = base * 1.9;
const step1 = Sim.priceFor(t, "wood");
ok("one tick moves 10% toward target", approx(step1, base + (target - base) * E.priceSmoothing, 1e-9));
ok("one tick does NOT jump to target", step1 < target);
const step2 = Sim.priceFor(t, "wood");
ok("second tick moves further toward target", step2 > step1 && step2 < target);
ok("price converges toward target over many ticks", (() => {
  const tc = town("wood", 0, 10 / TPM); tc.prices.wood = base;
  for (let i = 0; i < 200; i++) Sim.priceFor(tc, "wood");
  return approx(tc.prices.wood, target, 1e-3);
})());

// First read with no stored price snaps to target (so surplus/scarcity land at once).
ok("first read snaps to target (no jitter warm-up)", approx(Sim.priceFor(town("wood", 1e6, 10), "wood"), base * 0.4, 1e-6));

// priceFor is pure/deterministic: same inputs -> same output.
ok("deterministic for identical fresh towns", priceAtRatio(0.5) === priceAtRatio(0.5));

// Unknown good id is handled gracefully.
ok("unknown good => 0", Sim.priceFor(town("wood", 5, 5), "notagood") === 0);

// demand floor prevents divide-by-zero blowups.
ok("zero demand handled (no NaN/Infinity)", (() => {
  const p = Sim.priceFor(town("wood", 5, 0), "wood");
  return isFinite(p) && p >= base * 0.4 && p <= base * 1.9;
})());

// ---- Sim.tick publishes consDemand (residents + processor inputs only) ----
ok("Sim.tick: consDemand = consumption only; a construction site stays out of it", (() => {
  const st = { towns: [{
    id: 1, q: 0, r: 0, level: 1, gold: 0, pop: { peasants: 4, workers: 0, burghers: 0 },
    stock: { wood: 10, potato: 10 }, prices: {}, demand: {}, happiness: 70,
    buildings: [{ typeId: "hut", q: 1, r: 0, workers: 0 }, { typeId: "hut", q: 0, r: 1, workers: 0 },
                { typeId: "sawmill", q: 1, r: -1, workers: 0, built: false, delivered: {} }],
  }] };
  Sim.tick(st);
  const T = st.towns[0];
  const cd = T.consDemand || {}, d = T.demand || {};
  // wood is both eaten (consDemand) and owed to the sawmill site (demand only)
  return cd.wood > 0 && cd.wood < 0.5 && d.wood > cd.wood + 1 && cd.potato > 0 && approx(cd.potato, d.potato, 1e-12);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
