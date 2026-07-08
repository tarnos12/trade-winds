// Headless test for Trade Winds P5-A — research EFFECTS wired into gameplay.
// The pure Research layer only made effects queryable; this verifies they now
// actually change Sim/Trade/Buildings behaviour, and — crucially — that a state
// with NO research is byte-for-byte identical to the pre-P5-A baseline (the
// guards must be inert). Evals the PURE_CORE region of index.html (CONFIG + Sim +
// Buildings + Pathing + Trade + Research).
//   node test/research_effects.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim;" +
         "this.Buildings=Buildings; this.Pathing=Pathing; this.Trade=Trade; this.Research=Research;",
  sandbox
);
const { CONFIG, HexMath, Sim, Buildings, Pathing, Trade, Research } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
const K = (q, r) => HexMath.key(q, r);

// A research bag with a given set of nodes already unlocked (no active project).
function withResearch(unlocked) {
  return { unlocked: unlocked.slice(), active: null, progress: 0, spent: 0 };
}

// ---- Production: a single town with one producer, ticked once. --------------
function prodTown(typeId, extraStock) {
  return {
    id: 1, q: 0, r: 0, level: 4, gold: 0,
    pop: { peasants: 8, workers: 8, burghers: 0 },
    stock: Object.assign({ wood: 200, grain: 200, ore: 200, wool: 200 }, extraStock || {}),
    prices: {}, demand: {}, happiness: 100,
    buildings: [{ typeId, q: 0, r: 1, workers: 0 }],
  };
}
// Grain (or `good`) held after one Sim.tick, given an unlocked research set.
function stockAfterTick(typeId, good, unlocked) {
  const town = prodTown(typeId);
  const state = { towns: [town] };
  if (unlocked) state.research = withResearch(unlocked);
  Sim.tick(state);
  return town.stock[good] || 0;
}

// =========================================================================
// 1) Production output multipliers (globalOutput / extractorOutput /
//    mineOutput / processorOutput). Consumption is identical across the A/B
//    pair (same pop), so any surplus difference is pure production.
// =========================================================================
(() => {
  const base   = stockAfterTick("farm", "grain", null);
  const extract = stockAfterTick("farm", "grain", ["crop_rotation"]);        // extractorOutput 1.2
  const global  = stockAfterTick("farm", "grain", ["industrialize"]);         // globalOutput 1.25 (no prereq gate at effect level)
  ok("extractorOutput raises farm production vs no-research", extract > base);
  ok("globalOutput raises farm production vs no-research", global > base);

  // mineOutput stacks on top of extractorOutput for a hills/mountains extractor.
  const mineBase = stockAfterTick("miner", "ore", ["crop_rotation"]);         // extractor only
  const mineDeep = stockAfterTick("miner", "ore", ["crop_rotation", "deep_veins"]); // + mineOutput 1.25
  ok("mineOutput further raises miner (ore) production", mineDeep > mineBase);

  // A NON-mine extractor is untouched by mineOutput.
  const farmDeepless = stockAfterTick("farm", "grain", ["crop_rotation"]);
  const farmDeep     = stockAfterTick("farm", "grain", ["crop_rotation", "deep_veins"]);
  ok("mineOutput does NOT touch a farm (not a mine)", Math.abs(farmDeep - farmDeepless) < 1e-9);

  // processorOutput lifts a processor (mill: grain→flour); extractorOutput does not.
  const millBase = stockAfterTick("mill", "flour", null);
  const millRes  = stockAfterTick("mill", "flour", ["guild_halls"]);          // processorOutput 1.2
  ok("processorOutput raises mill (flour) production vs no-research", millRes > millBase);
  const millExtract = stockAfterTick("mill", "flour", ["crop_rotation"]);      // extractor tech only
  ok("extractorOutput does NOT touch a processor", Math.abs(millExtract - millBase) < 1e-9);
})();

// =========================================================================
// 2) Housing bonus (royal_census 1.15×) — Buildings.housingCapacity(town,state).
//    No-state call must return the base capacity (buildings.test.js contract).
// =========================================================================
(() => {
  const town = { buildings: [
    { typeId: "hut", q: 0, r: 1 },       // EC-A: peasant 2
    { typeId: "cottage", q: 1, r: 0 },   // EC-A: worker 3
    { typeId: "manor", q: 0, r: 2 },     // EC-A: burgher 4
  ] };
  const base = Buildings.housingCapacity(town);
  ok("housingCapacity base (no state) unchanged", base.peasants === 2 && base.workers === 3 && base.burghers === 4);
  const noState = Buildings.housingCapacity(town, { research: withResearch([]) });
  ok("housingCapacity with empty research == base", noState.peasants === 2 && noState.workers === 3 && noState.burghers === 4);
  const boosted = Buildings.housingCapacity(town, { research: withResearch(["royal_census"]) });
  ok("housingBonus scales all tiers (×1.15)",
    Math.abs(boosted.peasants - 2.3) < 1e-9 && Math.abs(boosted.workers - 3.45) < 1e-9 && Math.abs(boosted.burghers - 4.6) < 1e-9);
})();

// =========================================================================
// 3) Slot bonus (town_charters +1) — Buildings.slotCap(level,state).
//    No-state call must return the base cap (buildings.test.js contract).
// =========================================================================
(() => {
  ok("slotCap base by level unchanged (no state)",
    Buildings.slotCap(1) === 7 && Buildings.slotCap(2) === 9 && Buildings.slotCap(3) === 11 && Buildings.slotCap(4) === 13);
  ok("slotCap with empty research == base", Buildings.slotCap(2, { research: withResearch([]) }) === 9);
  ok("slotBonus adds +1 slot", Buildings.slotCap(2, { research: withResearch(["town_charters"]) }) === 10);
})();

// =========================================================================
// 4) Trade — a fixed 3-town network, ticked identically with/without research.
// =========================================================================
function mkTradeTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 4, gold: 500000,
    pop: { peasants: 10, workers: 6, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100,
  }, over);
}
const ROAD_LINE = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
function buildTradeState(seed, unlocked, farmLevel) {
  const roads = new Set();
  for (const [q, r] of ROAD_LINE) roads.add(K(q, r));
  const towns = [
    mkTradeTown({ id: 1, q: 0, r: 0, level: farmLevel || 4, buildings: [{ typeId: "farm", workers: 3 }, { typeId: "farm", workers: 3 }], stock: { grain: 5000 } }),
    mkTradeTown({ id: 2, q: 6, r: 0, buildings: [{ typeId: "miner", workers: 3 }, { typeId: "miner", workers: 3 }], stock: { ore: 5000 } }),
    mkTradeTown({ id: 3, q: 3, r: 1, buildings: [{ typeId: "mill", workers: 2 }], stock: { grain: 500 } }),
  ];
  const st = { roads, towns, carts: [], treasury: 0, tradeSeed: seed >>> 0 };
  if (unlocked) st.research = withResearch(unlocked);
  return st;
}
function runTrade(st, n) { for (let i = 0; i < n; i++) { Sim.tick(st); Trade.tick(st); } }

// --- 4a) tariffBonus raises treasury per trade (same seed, same flows). ------
(() => {
  Pathing.invalidate();
  const base = buildTradeState(2024, null);        runTrade(base, 150);
  Pathing.invalidate();
  const taxed = buildTradeState(2024, ["tax_ledgers", "bureaucracy"]); // +0.03 +0.07 = 0.35 tariff
  runTrade(taxed, 150);
  ok("baseline network earns tariff", base.treasury > 0);
  ok("tariffBonus raises treasury vs baseline", taxed.treasury > base.treasury);
})();

// --- 4b) extraCarts lifts the per-city external-trader cap. The buy model runs
//        ONE external trader per city (base cap 1); extraCarts (+3) lets a chronic
//        BUYER run more concurrent traders. We probe the grain-less MINE (id 2),
//        which is perpetually short grain and re-dispatches until it hits the cap. --
(() => {
  function maxBuyerCarts(unlocked) {
    Pathing.invalidate();
    const st = buildTradeState(55, unlocked);       // mine (id 2) buys grain from the farm
    let mx = 0;
    for (let i = 0; i < 120; i++) {
      Sim.tick(st); Trade.tick(st);
      const n = st.carts.filter(c => !c.done && c.fromId === 2).length; // the mine's live traders
      if (n > mx) mx = n;
    }
    return mx;
  }
  const base = maxBuyerCarts(null);
  const more = maxBuyerCarts(["extra_caravan", "trade_network"]); // +1 +2 = +3 traders
  ok("baseline city runs a single external trader (cap 1)", base === 1);
  ok("extraCarts lets a city run more than one external trader", more > base);
})();

// --- 4c) cartCapacity — larger traders haul a bigger load. The buy load is capped
//        by shortfall too, so we use a grain-HUNGRY city (huge pop, no grain) whose
//        shortfall exceeds cart capacity, making capacity the binding constraint. --
(() => {
  function bigBuyerState(unlocked) {
    const roads = new Set();
    for (const [q, r] of ROAD_LINE) roads.add(K(q, r));
    const huts = []; for (let i = 0; i < 120; i++) huts.push({ typeId: "hut", q: i, r: 2 }); // EC-A hut cap 2 → 120 huts house ~240
    const towns = [
      mkTradeTown({ id: 1, q: 0, r: 0, buildings: [{ typeId: "farm", workers: 3 }, { typeId: "farm", workers: 3 }], stock: { grain: 5000 } }),
      mkTradeTown({ id: 2, q: 6, r: 0, pop: { peasants: 200, workers: 0, burghers: 0 }, buildings: huts, stock: { grain: 0 } }),
    ];
    const st = { roads, towns, carts: [], treasury: 0, tradeSeed: 7 };
    if (unlocked) st.research = withResearch(unlocked);
    return st;
  }
  Pathing.invalidate();
  const base = bigBuyerState(null);
  for (let i = 0; i < 40 && base.carts.length === 0; i++) { Sim.tick(base); Trade.tick(base); }
  const baseQty = base.carts.length ? base.carts[0].qty : 0;
  Pathing.invalidate();
  const big = bigBuyerState(["paved_roads", "larger_carts"]); // cartCapacity 1.5×
  for (let i = 0; i < 40 && big.carts.length === 0; i++) { Sim.tick(big); Trade.tick(big); }
  const bigQty = big.carts.length ? big.carts[0].qty : 0;
  ok("baseline cart qty ≤ base cartCapacity", baseQty > 0 && baseQty <= CONFIG.trade.cartCapacity);
  ok("cartCapacity research lets a cart haul more than the base capacity", bigQty > CONFIG.trade.cartCapacity);
})();

// =========================================================================
// 5) No-research behaviour is IDENTICAL to a state with no `research` key.
//    (Guards must be inert: same seed ⇒ byte-identical outcome.)
// =========================================================================
(() => {
  Pathing.invalidate();
  const noKey = buildTradeState(4242, null); delete noKey.research; runTrade(noKey, 120);
  Pathing.invalidate();
  const emptyR = buildTradeState(4242, []);  runTrade(emptyR, 120);   // research present but empty
  ok("no research key ≡ empty research: identical treasury",
    noKey.treasury === emptyR.treasury);
  ok("no research key ≡ empty research: identical cart count",
    noKey.carts.length === emptyR.carts.length);
  ok("no research key ≡ empty research: identical mine grain stock",
    (noKey.towns[1].stock.grain || 0) === (emptyR.towns[1].stock.grain || 0));
})();

// =========================================================================
// 6) Determinism — identical research runs produce identical outcomes.
// =========================================================================
(() => {
  function run() {
    Pathing.invalidate();
    const st = buildTradeState(313, ["crop_rotation", "deep_veins", "tax_ledgers", "larger_carts", "paved_roads", "extra_caravan"]);
    runTrade(st, 140);
    return st.treasury + "|" + st.carts.length + "|" + (st.towns[1].stock.grain || 0);
  }
  ok("research effects are deterministic across identical runs", run() === run());
})();

// =========================================================================
console.log(`\nresearch_effects: ${pass}/${pass + fail} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
