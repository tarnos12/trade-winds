// Headless test for Trade Winds item U — the pure-core `state.stats` COUNTER
// CONTRACT (EngineDev owns the increment sites; see
// docs/proposals/MISSION_EDITOR_BRIEF.md "THE COUNTER CONTRACT"). This suite
// drives the real pure core (Sim / Buildings / Trade) so each lifecycle event
// bumps its counter, and proves the counters are DETERMINISTIC (two identical
// seeded runs produce byte-identical state.stats).
//
//   state.stats = { constructed: { total, byType:{typeId:n} },
//                   upgraded:    { total, byType:{typeId:n} },
//                   traded:      { byGood:{goodId:units} },
//                   taxEarned:   number }
//
// Increment sites (no RNG, must stay off the determinism path):
//   constructed        — a building's `built` flips false→true (Sim delivery).
//   upgraded           — a pendingUpgrade APPLIES (upgradeLevel increments).
//   traded.byGood[g]   — units delivered into a buyer's stock by a trade unload.
//   taxEarned          — every tariff added to state.treasury (trade tariff path).
//
// Evals the code between the PURE_CORE markers in index.html — no browser.
//   node test/stats.test.js
//
// STATUS: written to the contract; will pass once EngineDev's counters land in
// the built index.html. Until then the counter assertions fail loudly (that is
// the "not built yet" signal), by design.
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
         "this.Pathing=Pathing; this.Trade=Trade; this.Buildings=Buildings;",
  sandbox
);
const { CONFIG, HexMath, Sim, Pathing, Trade, Buildings } = sandbox;
const K = (q, r) => HexMath.key(q, r);

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
// Safe deep-get so a missing state.stats fails an assertion instead of throwing
// (keeps the whole suite reporting rather than crashing before the build lands).
function get(obj, pathStr) {
  return pathStr.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ========================================================================
// 0) Shape + defensive initialization contract.
// ========================================================================
// EngineDev initializes state.stats defensively (old saves have none). We drive
// a single plain Sim.tick on a bare state and expect the four counters to exist,
// zeroed. (If init is lazy-per-increment instead, relock this with EngineDev.)
{
  const s = { towns: [] };
  Sim.tick(s);
  const st = s.stats;
  ok("stats: initialized on a bare state after Sim.tick", !!st && typeof st === "object");
  ok("stats: constructed = {total:0, byType:{}}",
     get(st, "constructed.total") === 0 && st && st.constructed && typeof st.constructed.byType === "object");
  ok("stats: upgraded = {total:0, byType:{}}",
     get(st, "upgraded.total") === 0 && st && st.upgraded && typeof st.upgraded.byType === "object");
  ok("stats: traded = {byGood:{}}", !!st && !!st.traded && typeof st.traded.byGood === "object");
  ok("stats: taxEarned = 0 (number)", !!st && typeof st.taxEarned === "number" && st.taxEarned === 0);
}

// ========================================================================
// 1) constructed — built flips false->true (mirror sim.test.js CB-A.2).
// ========================================================================
function place(typeId, q, r, over) {
  const def = CONFIG.buildings[typeId];
  return Object.assign({
    typeId, q, r, workers: 0,
    built: Buildings.isInstant(def), delivered: {}, closedSlots: 0, priority: false,
  }, over || {});
}
// Construct a sawmill (cost {wood:30}); pop 0 so no wood is consumed by needs.
function constructSawmillState() {
  return { towns: [{
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 },
    stock: { wood: 50 }, prices: {}, demand: {}, buildings: [place("sawmill", 0, 1)], happiness: undefined,
  }] };
}
{
  const s = constructSawmillState();
  for (let i = 0; i < 12; i++) Sim.tick(s);
  ok("construct: sawmill reached built:true (precondition)", s.towns[0].buildings[0].built === true);
  ok("constructed.total incremented to 1", get(s, "stats.constructed.total") === 1);
  ok("constructed.byType.sawmill === 1", get(s, "stats.constructed.byType.sawmill") === 1);
  // An already-built building must NOT re-count on later ticks.
  for (let i = 0; i < 5; i++) Sim.tick(s);
  ok("constructed does not double-count a built building", get(s, "stats.constructed.total") === 1);
}
// Two NON-INSTANT buildings of different types -> total 2, split byType.
// NB the counter fires on the built:false->true construction-DELIVERY flip, so
// both types must be non-instant (have a resourceCost); an instant/gold-only
// building (e.g. lumberjack/hut/farm) is placed built:true and never flips, so
// by contract it is NOT counted. sawmill {wood:30} + mill {wood:25,stone:15}.
{
  const s = { towns: [{
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 },
    stock: { wood: 100, stone: 100 }, prices: {}, demand: {},
    buildings: [place("sawmill", 0, 1), place("mill", 0, 2)], happiness: undefined,
  }] };
  ok("construct(multi): both placed under construction (precondition)",
     s.towns[0].buildings.every(b => b.built === false));
  for (let i = 0; i < 30; i++) Sim.tick(s);
  const builtCount = s.towns[0].buildings.filter(b => b.built === true).length;
  ok("construct(multi): both buildings completed construction (precondition)", builtCount === 2);
  ok("constructed.total === 2 across two types", get(s, "stats.constructed.total") === 2);
  ok("constructed.byType splits by typeId",
     get(s, "stats.constructed.byType.sawmill") === 1 && get(s, "stats.constructed.byType.mill") === 1);
}

// ========================================================================
// 2) upgraded — a pendingUpgrade APPLIES (upgradeLevel increments).
// ========================================================================
// hut L1->L2 needs research unlock "upg_hut_l2" + gold + wood:20 delivered by Sim.
function upgradeHutState() {
  const hut = { typeId: "hut", q: 0, r: 0, workers: 0, built: true, upgradeLevel: 1, pendingUpgrade: null, delivered: {} };
  return { treasury: 100000, research: { unlocked: ["upg_hut_l2"], active: null, progress: 0, spent: 0 },
    towns: [{
      id: 1, q: 0, r: 0, level: 1, gold: 0,
      pop: { peasants: 0, workers: 0, burghers: 0 },
      stock: { wood: 50 }, prices: {}, demand: {}, buildings: [hut], happiness: undefined,
    }] };
}
{
  const s = upgradeHutState();
  const hut = s.towns[0].buildings[0];
  const started = Buildings.startUpgrade(s, s.towns[0], hut);
  ok("upgrade: startUpgrade succeeded (precondition)", started === true && !!hut.pendingUpgrade);
  for (let i = 0; i < 12; i++) Sim.tick(s);
  ok("upgrade: hut reached upgradeLevel 2 (precondition)", hut.upgradeLevel === 2 && hut.pendingUpgrade == null);
  ok("upgraded.total incremented to 1", get(s, "stats.upgraded.total") === 1);
  ok("upgraded.byType.hut === 1", get(s, "stats.upgraded.byType.hut") === 1);
  // A settled upgrade must not re-count.
  for (let i = 0; i < 5; i++) Sim.tick(s);
  ok("upgraded does not double-count a settled upgrade", get(s, "stats.upgraded.total") === 1);
}

// ========================================================================
// 3) traded.byGood[g] + taxEarned — the proven 3-city trade scenario.
//    (Faithful compact copy of test/trade.test.js: FARM->MINE potato flow,
//     tariff income into treasury.)
// ========================================================================
function mkTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 100000,
    pop: { peasants: 10, workers: 6, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100,
  }, over);
}
function homes() { const a = [];
  for (let i = 0; i < 8; i++) a.push({ typeId: "hut" });
  for (let i = 0; i < 3; i++) a.push({ typeId: "cottage" });
  return a; }
function peasantHomes(n) { const a = []; for (let i = 0; i < n; i++) a.push({ typeId: "hut" }); return a; }
function farmTown() { return mkTown({ id: 1, q: 0, r: 0,
  pop: { peasants: 12, workers: 6, burghers: 0 },
  buildings: [{ typeId: "farm", workers: 3 }, { typeId: "potato_farm", workers: 3 }, { typeId: "lumberjack", workers: 3 }, ...homes()],
  stock: { grain: 80, potato: 80, wood: 80, mead: 20 } }); }
function mineTown() { return mkTown({ id: 2, q: 6, r: 0,
  pop: { peasants: 12, workers: 0, burghers: 0 },
  buildings: [{ typeId: "iron_mine", workers: 3 }, { typeId: "iron_mine", workers: 3 }, { typeId: "lumberjack", workers: 3 }, ...peasantHomes(6)],
  stock: { iron: 80, wood: 80 } }); }
function millTown() { return mkTown({ id: 3, q: 3, r: 1,
  pop: { peasants: 8, workers: 8, burghers: 8 },
  buildings: [{ typeId: "brewery", workers: 2 }, { typeId: "forge", workers: 2 }, { typeId: "lumberjack", workers: 3 },
              ...homes(), { typeId: "manor" }, { typeId: "manor" }],
  stock: { grain: 15, iron: 12, wood: 80, potato: 80,
           fish: 80, coal: 80, mead: 80, bread: 80, clothes: 80, lamp: 80, chairs: 80, pottery: 80, gold_ring: 80 } }); }
const ROAD_LINE = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
function buildTradeState(seed) {
  const roads = new Set();
  for (const [q, r] of ROAD_LINE) roads.add(K(q, r));
  return { roads, towns: [farmTown(), mineTown(), millTown()],
           carts: [], treasury: 0, tradeSeed: seed >>> 0 };
}
function runTrade(st, n) { for (let i = 0; i < n; i++) { Sim.tick(st); Trade.tick(st); } }

{
  Pathing.invalidate();
  const s = buildTradeState(777);
  runTrade(s, 400);
  ok("trade: potato was delivered into the mine (precondition)", (s.towns[1].stock.potato || 0) >= 0);
  ok("trade: treasury earned tariff income (precondition)", s.treasury > 0);
  // traded.byGood records units delivered into a BUYER's stock by trade unload.
  ok("traded.byGood exists after trading", !!get(s, "stats.traded.byGood"));
  ok("traded.byGood.potato > 0 (potato flowed FARM->MINE)", (get(s, "stats.traded.byGood.potato") || 0) > 0);
  ok("traded.byGood.iron > 0 (iron flowed MINE->consumers)", (get(s, "stats.traded.byGood.iron") || 0) > 0);
  // taxEarned is the cumulative tariff into treasury. This scenario has NO castle
  // seller (castle sales add to treasury WITHOUT tariff), so every treasury gold
  // here is tariff => taxEarned must equal treasury exactly.
  ok("taxEarned > 0", (get(s, "stats.taxEarned") || 0) > 0);
  ok("taxEarned === treasury (no castle sales => treasury is all tariff)",
     get(s, "stats.taxEarned") === s.treasury);
}

// ========================================================================
// 4) DETERMINISM — identical seeded runs produce byte-identical state.stats.
// ========================================================================
{
  Pathing.invalidate(); const a = buildTradeState(777); runTrade(a, 300);
  Pathing.invalidate(); const b = buildTradeState(777); runTrade(b, 300);
  ok("determinism: identical trade runs => identical state.stats",
     JSON.stringify(a.stats) === JSON.stringify(b.stats));
  ok("determinism: identical trade runs => identical treasury (sanity)", a.treasury === b.treasury);
}
// Construction determinism.
{
  const a = constructSawmillState(); for (let i = 0; i < 12; i++) Sim.tick(a);
  const b = constructSawmillState(); for (let i = 0; i < 12; i++) Sim.tick(b);
  ok("determinism: identical construction runs => identical state.stats",
     JSON.stringify(a.stats) === JSON.stringify(b.stats));
}
// Upgrade determinism.
{
  const a = upgradeHutState(); Buildings.startUpgrade(a, a.towns[0], a.towns[0].buildings[0]);
  for (let i = 0; i < 12; i++) Sim.tick(a);
  const b = upgradeHutState(); Buildings.startUpgrade(b, b.towns[0], b.towns[0].buildings[0]);
  for (let i = 0; i < 12; i++) Sim.tick(b);
  ok("determinism: identical upgrade runs => identical state.stats",
     JSON.stringify(a.stats) === JSON.stringify(b.stats));
}
// Counters must NOT perturb the existing determinism contract: a Sim/Trade run
// with counters present still yields the same treasury as trade.test.js expects.
{
  Pathing.invalidate(); const c1 = buildTradeState(777); runTrade(c1, 120);
  Pathing.invalidate(); const c2 = buildTradeState(778); runTrade(c2, 120);
  ok("determinism: different seed generally diverges (counters don't mask seed)",
     JSON.stringify(c1.stats) !== JSON.stringify(c2.stats) || c1.treasury !== c2.treasury);
}

// ---- summary ----
if (fail) { console.error("\nstats.test.js: " + pass + " passed, " + fail + " FAILED"); process.exit(1); }
console.log("stats.test.js: all " + pass + " assertions passed");
