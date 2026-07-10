// Headless test for Trade Winds P4-A — the pure Research layer (tech tree data +
// engine: canStart gating, start/tick spending treasury to completion, has()).
// Evals the code between the PURE_CORE markers in index.html — no browser needed.
//   node test/research.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Research=Research;this.Sim=Sim; this.ResearchEconomy=ResearchEconomy;", sandbox);
const { CONFIG, Research, ResearchEconomy, Sim } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

function mkState(over) {
  return Object.assign({ treasury: 0, research: Research.fresh() }, over);
}
// Run n full research ticks.
function tick(st, n) { for (let i = 0; i < n; i++) Research.tick(st); }
// CRE: fill the castle stockpile so a node's materials requirement is satisfied
// (mirrors what the castle's traders would deliver). Copies node.materials.
function fillMats(st, id) {
  if (!st.castleStock) st.castleStock = {};
  const mats = (Research.get(id) || {}).materials || {};
  for (const gid in mats) st.castleStock[gid] = (st.castleStock[gid] || 0) + mats[gid];
}

// =========================================================================
// Catalog shape — RT-A tiered tree: 15 kingdom + one unlock node per
// non-startUnlocked building + one node per ladder level. Counts derived from
// CONFIG (no magic numbers), so the test tracks the real data model.
// =========================================================================
const NON_STARTERS = Object.values(CONFIG.buildings).filter(b => !b.startUnlocked);
const LADDER_LEVELS = Object.values(CONFIG.upgrades).reduce((n, a) => n + a.length, 0);
const KINGDOM_COUNT = 15;
const EXPECT = KINGDOM_COUNT + NON_STARTERS.length + LADDER_LEVELS;   // ARISTOFIX: 15 + 27 + 9 = 51 (aristocrat ladder removed)
ok("expected node count derived from CONFIG (15 kingdom + unlocks + ladder levels)", CONFIG.research.length === EXPECT);
ok("EXPECT resolves to 51", EXPECT === 51);
// The 3 kingdom branches remain 5 nodes each.
ok("kingdom branches × 5 nodes", ["production", "logistics", "administration"].every(b => Research.nodesIn(b).length === 5));
ok("branches() is the 3 kingdom branches, development dropped",
  Research.branches().length === 3 && Research.branches().indexOf("development") < 0);
// === CC: bands() API — 5 bands (aristocrat added above burgher). ===
ok("bands() lists all five bands (incl. aristocrat)", (() => {
  const b = Research.bands();
  return b.length === 5 && ["peasant", "worker", "burgher", "aristocrat", "kingdom"].every(x => b.indexOf(x) >= 0);
})());
ok("aristocrat band sits above burgher, below kingdom", (() => {
  const b = Research.bands();
  return b.indexOf("aristocrat") > b.indexOf("burgher") && b.indexOf("aristocrat") < b.indexOf("kingdom");
})());
ok("kingdom band has 15 nodes", Research.nodesInBand("kingdom").length === KINGDOM_COUNT);
ok("peasant+worker+burgher+aristocrat bands hold every unlock + upgrade node",
  Research.nodesInBand("peasant").length + Research.nodesInBand("worker").length
    + Research.nodesInBand("burgher").length + Research.nodesInBand("aristocrat").length
    === NON_STARTERS.length + LADDER_LEVELS);
// === CC: retired unlock nodes are gone; every new building has a node. ===
ok("unlock_smelter + unlock_weaver removed from tree", !Research.get("unlock_smelter") && !Research.get("unlock_weaver"));
ok("new building unlock nodes all present", ["unlock_tailoring", "unlock_charcoal_burner", "unlock_stonetool_maker", "unlock_oil_maker", "unlock_forge", "unlock_armory", "unlock_pottery_workshop", "unlock_distillery", "unlock_goldsmith", "unlock_lamp_maker", "unlock_carpentry", "unlock_luxury_tailor", "unlock_aristocrat_home"].every(id => { const n = Research.get(id); return n && n.kind === "unlock"; }));
ok("aristocrat_home has NO upgrade nodes (1 slot, non-upgradable — author)",
  !Research.get("upg_aristocrat_home_l2") && !Research.get("upg_aristocrat_home_l3"));
// === CC: retired research-node id migration (old saves normalize forward). ===
ok("Research.normalize migrates unlock_smelter/unlock_weaver → forge/tailoring", (() => {
  const r = Research.normalize({ unlocked: ["unlock_smelter", "unlock_weaver", "unlock_miner", "crop_rotation"] });
  return r.unlocked.indexOf("unlock_forge") >= 0 && r.unlocked.indexOf("unlock_tailoring") >= 0
    && r.unlocked.indexOf("unlock_iron_mine") >= 0 && r.unlocked.indexOf("crop_rotation") >= 0
    && r.unlocked.indexOf("unlock_smelter") < 0 && r.unlocked.indexOf("unlock_weaver") < 0;
})());
ok("every node assigned to a real band", CONFIG.research.every(n => Research.bands().indexOf(n.band) >= 0));
ok("every node has required fields (incl. band, kind, pos)", CONFIG.research.every(n =>
  n.id && n.branch && n.name && n.desc && typeof n.cost === "number" &&
  typeof n.timeTicks === "number" && Array.isArray(n.prereqs) && n.effect && typeof n.effect === "object" &&
  typeof n.band === "string" && typeof n.kind === "string" &&
  n.pos && Number.isInteger(n.pos.col) && Number.isInteger(n.pos.row)));
ok("node kinds are kingdom|unlock|upgrade", CONFIG.research.every(n => ["kingdom", "unlock", "upgrade"].indexOf(n.kind) >= 0));
// CRE: every node carries a materials requirement (goodId → positive qty of real goods).
ok("every node has a materials requirement", CONFIG.research.every(n =>
  n.materials && typeof n.materials === "object" && Object.keys(n.materials).length > 0 &&
  Object.keys(n.materials).every(g => !!CONFIG.goods[g] && n.materials[g] > 0)));
ok("node ids are unique", new Set(CONFIG.research.map(n => n.id)).size === EXPECT);
ok("all prereqs reference real nodes", CONFIG.research.every(n =>
  n.prereqs.every(p => !!Research.get(p))));
// The 3 kingdom branches each still form a single chain (one prereq-less root).
ok("each kingdom branch has exactly one root (no prereqs)", Research.branches().every(b =>
  Research.nodesIn(b).filter(n => n.prereqs.length === 0).length === 1));

// -- RT-A: DAG is acyclic and every prereq resolves (whole forest). --
ok("prereq graph is acyclic", (() => {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = {};
  CONFIG.research.forEach(n => color[n.id] = WHITE);
  let acyclic = true;
  function visit(id) {
    color[id] = GREY;
    const node = Research.get(id);
    for (const p of (node.prereqs || [])) {
      if (!Research.get(p)) { acyclic = false; continue; }
      if (color[p] === GREY) { acyclic = false; }
      else if (color[p] === WHITE) visit(p);
    }
    color[id] = BLACK;
  }
  CONFIG.research.forEach(n => { if (color[n.id] === WHITE) visit(n.id); });
  return acyclic;
})());

// -- RT-A: every non-starter building has a matching unlock_<id> node whose id
// equals the building's unlockedBy, kind:"unlock", carrying the building's tier band. --
ok("every non-starter building maps to its unlock node", NON_STARTERS.every(b => {
  const node = Research.get("unlock_" + b.id);
  if (!node || node.kind !== "unlock" || node.buildingId !== b.id) return false;
  if (b.unlockedBy !== node.id) return false;
  // === TV2: researchBand overrides the node's tree lane (farm: peasant-staffed
  // but its unlock lives in the worker band). ===
  const tier = b.researchBand || b.workerTier || b.houseTier;
  return node.band === tier;
}));
ok("no unlock node points at a nonexistent building", CONFIG.research
  .filter(n => n.kind === "unlock")
  .every(n => CONFIG.buildings[n.buildingId] && !CONFIG.buildings[n.buildingId].startUnlocked));

// -- RT-A: every ladder entry has its own per-level upgrade node with chained
// prereqs (l3 requires l2, l4 requires l3; l2 prereq = unlock node or [] for
// startUnlocked buildings). --
ok("every ladder level has a matching upgrade node + chained prereqs", Object.entries(CONFIG.upgrades).every(([typeId, ladder]) => {
  const b = CONFIG.buildings[typeId];
  return ladder.every(entry => {
    const node = Research.get("upg_" + typeId + "_l" + entry.level);
    if (!node || node.kind !== "upgrade" || node.buildingId !== typeId || node.level !== entry.level) return false;
    if (entry.unlockedBy !== node.id) return false;              // ladder gate points at THIS node
    if (entry.level === 2) {
      // l2 prereq = the building's unlock node, or [] when the building is startUnlocked.
      if (b.startUnlocked) return node.prereqs.length === 0;
      return node.prereqs.length === 1 && node.prereqs[0] === "unlock_" + typeId;
    }
    // l3/l4 chain from the previous level.
    return node.prereqs.indexOf("upg_" + typeId + "_l" + (entry.level - 1)) >= 0;
  });
}));

// =========================================================================
// canStart gating — prereqs, funds, single-active, already-done
// =========================================================================
(() => {
  const st = mkState({ treasury: 100000 });
  ok("root available immediately", Research.canStart(st, "crop_rotation"));
  ok("gated node not startable without prereq", !Research.canStart(st, "deep_veins"));
  ok("gated node reports unavailable", !Research.isAvailable(st, "deep_veins"));
  ok("root reports available", Research.isAvailable(st, "crop_rotation"));
})();

(() => {
  const st = mkState({ treasury: 100 });   // crop_rotation costs 150
  ok("cannot start when treasury < cost", !Research.canStart(st, "crop_rotation"));
  ok("but it is still 'available' (funds independent of prereqs)", Research.isAvailable(st, "crop_rotation"));
  st.treasury = 150;
  ok("affordable at exactly cost", Research.canStart(st, "crop_rotation"));
})();

(() => {
  const st = mkState({ treasury: 100000 });
  Research.start(st, "crop_rotation");
  ok("start sets active", st.research.active === "crop_rotation");
  ok("start deducts nothing up front", st.treasury === 100000);
  ok("cannot start a second node while one is active", !Research.canStart(st, "paved_roads"));
})();

// =========================================================================
// start + tick to completion — spends treasury, unlocks, has() reflects it
// =========================================================================
(() => {
  const node = Research.get("crop_rotation");
  const st = mkState({ treasury: 500 });
  fillMats(st, "crop_rotation");   // CRE: castle traders have delivered the materials
  ok("has() false before completion", !Research.has(st, "crop_rotation"));
  Research.start(st, "crop_rotation");
  tick(st, node.timeTicks - 1);
  ok("still active one tick before done", st.research.active === "crop_rotation");
  ok("not yet unlocked mid-way", !Research.has(st, "crop_rotation"));
  const before = st.treasury;
  tick(st, 1);   // final tick
  ok("active cleared on completion", st.research.active === null);
  ok("progress reset on completion", st.research.progress === 0);
  ok("unlocked contains node", st.research.unlocked.indexOf("crop_rotation") >= 0);
  ok("has() true after completion", Research.has(st, "crop_rotation"));
  ok("total spent equals cost", Math.abs((500 - st.treasury) - node.cost) < 1e-6);
  ok("last installment was charged", st.treasury < before);
  ok("prereq now unlocks the next node", Research.canStart(st, "deep_veins"));
})();

// =========================================================================
// Proportional spend & stalling when treasury can't cover the installment
// =========================================================================
(() => {
  const node = Research.get("crop_rotation");   // cost 150, 20 ticks → 7.5/tick
  const st = mkState({ treasury: 150 });
  Research.start(st, "crop_rotation");
  tick(st, 10);   // half the ticks
  ok("spends ~proportionally (half cost by half time)",
    Math.abs((150 - st.treasury) - node.cost / 2) < 1e-6);
  ok("still researching at the halfway point", st.research.active === "crop_rotation");
})();

(() => {
  const node = Research.get("crop_rotation");
  const st = mkState({ treasury: 150 });
  fillMats(st, "crop_rotation");   // CRE: materials on hand, so gold is the only brake here
  Research.start(st, "crop_rotation");
  tick(st, 5);
  const spentBefore = st.research.spent;
  st.treasury = 0;              // player drains the coffers elsewhere
  const progAt = st.research.progress;
  tick(st, 10);                // should stall — no funds
  ok("stalls when treasury can't fund the installment", st.research.progress === progAt);
  ok("no gold spent while stalled", st.research.spent === spentBefore && st.treasury === 0);
  ok("still active (not completed for free) while stalled", st.research.active === "crop_rotation");
  st.treasury = 1000;          // refill
  tick(st, node.timeTicks);    // more than enough to finish
  ok("resumes and completes once funded", Research.has(st, "crop_rotation"));
})();

// =========================================================================
// Determinism — same inputs → identical state
// =========================================================================
(() => {
  function run() {
    const st = mkState({ treasury: 5000 });
    fillMats(st, "paved_roads"); fillMats(st, "larger_carts");
    Research.start(st, "paved_roads");
    tick(st, Research.get("paved_roads").timeTicks);
    Research.start(st, "larger_carts");
    tick(st, Research.get("larger_carts").timeTicks);
    return JSON.stringify(st.research) + "|" + st.treasury + "|" + JSON.stringify(st.castleStock);
  }
  const a = run();
  ok("deterministic across identical runs", a === run());
  ok("both queued nodes complete when materials + gold present", a.indexOf('"paved_roads"') >= 0 && a.indexOf('"larger_carts"') >= 0);
})();

// =========================================================================
// CRE — materials gate: a node stalls at full progress without materials, and
// completes (consuming them) once the castle stockpile covers the requirement.
// =========================================================================
(() => {
  const node = Research.get("crop_rotation");   // needs { wood, stone }
  const st = mkState({ treasury: 5000 });        // plenty of gold, NO materials yet
  Research.start(st, "crop_rotation");
  tick(st, node.timeTicks + 5);                  // run well past the labour clock
  ok("stalls at full labour progress without materials", st.research.active === "crop_rotation");
  ok("progress caps at timeTicks while waiting on materials", st.research.progress === node.timeTicks);
  ok("gold fully paid but node not unlocked", !Research.has(st, "crop_rotation") && st.research.spent === node.cost);
  // Deliver the materials (as the castle's traders would) → next tick completes.
  fillMats(st, "crop_rotation");
  tick(st, 1);
  ok("completes the tick materials arrive", Research.has(st, "crop_rotation"));
  ok("no extra gold charged after the labour clock filled", Math.abs((5000 - st.treasury) - node.cost) < 1e-6);
  ok("materials consumed from the castle stockpile on completion",
    (st.castleStock.wood || 0) === 0 && (st.castleStock.stone || 0) === 0);
})();

// Partial materials do NOT complete the node (every required good must be met).
(() => {
  const node = Research.get("crop_rotation");
  const st = mkState({ treasury: 5000, castleStock: { wood: node.materials.wood } }); // stone missing
  Research.start(st, "crop_rotation");
  tick(st, node.timeTicks + 3);
  ok("partial materials keep the node stalled", !Research.has(st, "crop_rotation") && st.research.active === "crop_rotation");
  ok("delivered-but-unused materials are NOT consumed while stalled", (st.castleStock.wood || 0) === node.materials.wood);
})();

// materialsSatisfied / remaining helpers behave.
(() => {
  const node = Research.get("deep_veins");   // === TV2: { stone, iron } ===
  const st = mkState({ castleStock: {} });
  ok("materialsSatisfied false when empty", !ResearchEconomy.materialsSatisfied(st, node));
  ok("remaining equals requirement when empty", ResearchEconomy.remaining(st, node, "iron") === node.materials.iron);
  st.castleStock.stone = node.materials.stone;
  st.castleStock.iron = node.materials.iron;
  ok("materialsSatisfied true once covered", ResearchEconomy.materialsSatisfied(st, node));
  ok("remaining zero once covered", ResearchEconomy.remaining(st, node, "iron") === 0);
})();

// =========================================================================
// effect() aggregation (queryable flags other systems read)
// =========================================================================
(() => {
  const st = mkState({ treasury: 100000 });
  st.research.unlocked = ["tax_ledgers", "bureaucracy"];   // 0.03 + 0.07 tariffBonus
  ok("additive effect sums across unlocked nodes",
    Math.abs(Research.effect(st, "tariffBonus", 0) - 0.10) < 1e-9);
  ok("boolean flag OR", Research.effect(mkState({ research: { unlocked: ["paved_roads"], active: null, progress: 0, spent: 0 } }), "paved_roads", false) === true);
  ok("multiplier effect multiplies", (() => {
    const s = mkState(); s.research.unlocked = ["guild_halls", "master_crafts"]; // 1.2 * 1.35
    return Math.abs(Research.effect(s, "processorOutput", 1) - 1.62) < 1e-9;
  })());
  ok("fallback returned for untouched key", Research.effect(mkState(), "nope", 42) === 42);
})();

// =========================================================================
// normalize() — defensive save loading
// =========================================================================
(() => {
  ok("normalize handles undefined", JSON.stringify(Research.normalize(undefined)) === JSON.stringify(Research.fresh()));
  const cleaned = Research.normalize({ unlocked: ["crop_rotation", "bogus"], active: "ghost", progress: 5, spent: 9 });
  ok("normalize drops unknown unlocked ids", cleaned.unlocked.length === 1 && cleaned.unlocked[0] === "crop_rotation");
  ok("normalize clears invalid active + its progress", cleaned.active === null && cleaned.progress === 0 && cleaned.spent === 0);
})();

// =========================================================================
// CRE — castle traders end-to-end (dispatch → buy → deliver → complete), and the
// "only while the panel is selected" gate. A city sits adjacent to the castle
// hex (0,0) with a big surplus of the node's materials, so a road is unnecessary.
// =========================================================================
function mkCity(over) {
  return Object.assign({ id: 1, q: 1, r: 0, level: 1, gold: 0,
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100 }, over);
}
(() => {
  const node = Research.get("crop_rotation");   // needs { wood:20, stone:10 }
  const city = mkCity({ stock: { wood: 500, stone: 500 } });
  const st = mkState({ treasury: 100000, towns: [city], roads: new Set(), carts: [], researchSeed: 1 });
  Research.start(st, "crop_rotation");

  // Panel OPEN → castle dispatches buyers, gathers materials, node completes.
  let done = false, sawCart = false;
  for (let i = 0; i < 300 && !done; i++) {
    ResearchEconomy.tick(st, true);
    if (ResearchEconomy.activeCastleCarts(st) > 0) sawCart = true;
    Research.tick(st);
    if (Research.has(st, "crop_rotation")) done = true;
  }
  ok("a castle trader was dispatched", sawCart);
  ok("castle traders never exceed the cap", true /* enforced below */);
  ok("materials gathered and node completed", done);
  ok("selling city was paid (no tariff — got full value)", city.gold > 0);
  ok("castle materials consumed on completion (≈0 left)",
    (st.castleStock.wood || 0) < node.materials.wood && (st.castleStock.stone || 0) < node.materials.stone);
})();

// The 10-trader cap is respected even with many needed materials + big demand.
(() => {
  const city = mkCity({ stock: { wood: 9999, stone: 9999 } });
  const st = mkState({ treasury: 1e9, towns: [city], roads: new Set(), carts: [], researchSeed: 7 });
  Research.start(st, "warehousing");   // needs { planks:40, stone:30 } — but only stone is available
  let maxSeen = 0;
  for (let i = 0; i < 20; i++) { ResearchEconomy.tick(st, true); maxSeen = Math.max(maxSeen, ResearchEconomy.activeCastleCarts(st)); }
  ok("never dispatches more than maxTraders at once", maxSeen <= CONFIG.researchEconomy.maxTraders);
})();

// RT-A2: AUTONOMOUS buying — the panel gate is gone. Buyers dispatch and the node
// completes with the `open` flag FALSE (proving no UI flag is involved).
(() => {
  const city = mkCity({ stock: { wood: 500, stone: 500 } });
  const st = mkState({ treasury: 100000, towns: [city], roads: new Set(), carts: [], researchSeed: 3 });
  Research.start(st, "crop_rotation");
  let done = false, sawCart = false;
  for (let i = 0; i < 300 && !done; i++) {
    ResearchEconomy.tick(st, false);   // flag FALSE — used to suppress dispatch
    if (ResearchEconomy.activeCastleCarts(st) > 0) sawCart = true;
    Research.tick(st);
    if (Research.has(st, "crop_rotation")) done = true;
  }
  ok("autonomous buying dispatches a trader with open=false", sawCart);
  ok("autonomous buying gathers materials and completes with open=false", done);
  ok("selling city paid under autonomous buying", city.gold > 0);
})();

// RT-A2: also autonomous when tick() is called with NO second argument at all.
(() => {
  const city = mkCity({ stock: { wood: 500, stone: 500 } });
  const st = mkState({ treasury: 100000, towns: [city], roads: new Set(), carts: [], researchSeed: 5 });
  Research.start(st, "crop_rotation");
  let done = false;
  for (let i = 0; i < 300 && !done; i++) { ResearchEconomy.tick(st); Research.tick(st); if (Research.has(st, "crop_rotation")) done = true; }
  ok("autonomous buying works with tick(state) and no flag", done);
})();

// Determinism of the castle-trade scenario (seeded).
(() => {
  function run() {
    const city = mkCity({ stock: { wood: 500, stone: 500 } });
    const st = mkState({ treasury: 100000, towns: [city], roads: new Set(), carts: [], researchSeed: 42 });
    Research.start(st, "crop_rotation");
    for (let i = 0; i < 60; i++) { ResearchEconomy.tick(st, true); Research.tick(st); }
    return JSON.stringify({ has: Research.has(st, "crop_rotation"), gold: city.gold, treas: Math.round(st.treasury * 100) });
  }
  ok("castle-trade scenario is deterministic", run() === run());
})();

// =========================================================================
// === RT-A: retired development ids gone; per-level upgrade nodes present ===
(() => {
  const devIds = ["hut_upgrades", "lumberjack_upgrades", "farm_upgrades", "sawmill_upgrades"];
  ok("the 4 development ids no longer exist", devIds.every(id => Research.get(id) === null));
  const upgNodes = ["upg_hut_l2", "upg_hut_l3", "upg_hut_l4", "upg_lumberjack_l2", "upg_lumberjack_l3",
    "upg_farm_l2", "upg_farm_l3", "upg_sawmill_l2", "upg_sawmill_l3"];
  ok("all 9 per-level upgrade nodes exist with kind:upgrade + peasant band", upgNodes.every(id => {
    const n = Research.get(id);
    return n && n.kind === "upgrade" && n.band === "peasant";
  }));
  ok("upg_hut_l4 carries buildingId+level", (() => {
    const n = Research.get("upg_hut_l4");
    return n.buildingId === "hut" && n.level === 4;
  })());
})();

// -- RT-A: normalize migrates old development ids to their full level sets --
(() => {
  const cleaned = Research.normalize({ unlocked: ["hut_upgrades", "crop_rotation", "bogus"] });
  ok("migrate expands hut_upgrades → all 3 hut level nodes",
    ["upg_hut_l2", "upg_hut_l3", "upg_hut_l4"].every(id => cleaned.unlocked.indexOf(id) >= 0));
  ok("migrate keeps legacy kingdom id crop_rotation", cleaned.unlocked.indexOf("crop_rotation") >= 0);
  ok("migrate drops unknown id", cleaned.unlocked.indexOf("bogus") < 0);
  ok("migrate result has exactly the expected 4 ids", cleaned.unlocked.length === 4);
  const multi = Research.normalize({ unlocked: ["lumberjack_upgrades", "sawmill_upgrades"] });
  ok("migrate expands multiple dev ids", multi.unlocked.length === 4 &&
    ["upg_lumberjack_l2", "upg_lumberjack_l3", "upg_sawmill_l2", "upg_sawmill_l3"].every(id => multi.unlocked.indexOf(id) >= 0));
})();

// -- RT-A: an unlock node gates its building and unlocks via the normal flow --
(() => {
  const st = mkState({ treasury: 100000 });
  ok("root unlock nodes available immediately", Research.isAvailable(st, "unlock_quarry") && Research.isAvailable(st, "unlock_fishery"));
  // === TV2-FIX: shepherd decoupled from the fishery — wool is a core peasant
  // need, so unlock_shepherd is a ROOT of the peasant band (prereqs []). ===
  ok("unlock_shepherd is a root (no prereqs)", Research.get("unlock_shepherd").prereqs.length === 0);
  ok("unlock_shepherd available immediately (not gated by fishery)", Research.isAvailable(st, "unlock_shepherd"));
  ok("dependent unlock node gated before prereq", !Research.isAvailable(st, "unlock_iron_mine"));
  ok("iron_mine building gated before its unlock node", !Research.has(st, "unlock_quarry") && CONFIG.buildings.iron_mine.unlockedBy === "unlock_iron_mine");
  fillMats(st, "unlock_quarry");
  Research.start(st, "unlock_quarry");
  tick(st, Research.get("unlock_quarry").timeTicks);
  ok("unlock_quarry unlocks via normal start→tick flow", Research.has(st, "unlock_quarry"));
  ok("unlock_iron_mine now available after its prereq", Research.canStart(st, "unlock_iron_mine"));
})();
// === /RT-A ===================================================================

// =========================================================================
// === RT-A2: research queue (enqueue/dequeue/isQueued + auto-start in tick) ===
// =========================================================================
(() => {
  // fresh() carries an empty queue.
  ok("fresh() has an empty queue array", Array.isArray(Research.fresh().queue) && Research.fresh().queue.length === 0);

  // enqueue validity rules.
  const st = mkState({ treasury: 1e6 });
  ok("enqueue valid node returns true", Research.enqueue(st, "crop_rotation") === true);
  ok("isQueued true after enqueue", Research.isQueued(st, "crop_rotation"));
  ok("enqueue unknown id → false", Research.enqueue(st, "does_not_exist") === false);
  ok("enqueue duplicate → false, queue length unchanged", (() => {
    const before = st.research.queue.length;
    const r = Research.enqueue(st, "crop_rotation");
    return r === false && st.research.queue.length === before;
  })());

  const st2 = mkState({ treasury: 1e6 });
  st2.research.unlocked = ["crop_rotation"];
  ok("enqueue already-unlocked id → false", Research.enqueue(st2, "crop_rotation") === false);

  const st3 = mkState({ treasury: 1e6 });
  Research.start(st3, "crop_rotation");
  ok("enqueue active id → false", Research.enqueue(st3, "crop_rotation") === false);

  // dequeue.
  const st4 = mkState({ treasury: 1e6 });
  Research.enqueue(st4, "crop_rotation");
  ok("dequeue removes and returns true", Research.dequeue(st4, "crop_rotation") === true && !Research.isQueued(st4, "crop_rotation"));
  ok("dequeue of absent id → false", Research.dequeue(st4, "crop_rotation") === false);
})();

// normalize sanitization of the queue.
(() => {
  const cleaned = Research.normalize({
    unlocked: ["crop_rotation"],
    active: "paved_roads", progress: 3, spent: 10,
    queue: ["deep_veins", "deep_veins", "crop_rotation", "paved_roads", "bogus", 42, null, "guild_halls"],
  });
  ok("normalize drops duplicate queue ids", cleaned.queue.filter(x => x === "deep_veins").length === 1);
  ok("normalize drops already-unlocked queue id", cleaned.queue.indexOf("crop_rotation") < 0);
  ok("normalize drops active-collision queue id", cleaned.queue.indexOf("paved_roads") < 0);
  ok("normalize drops unknown/non-string queue ids", cleaned.queue.indexOf("bogus") < 0 && cleaned.queue.every(x => typeof x === "string"));
  ok("normalize keeps valid queue entries in order", cleaned.queue[0] === "deep_veins" && cleaned.queue[1] === "guild_halls");
  ok("normalize coerces non-array queue → []", Array.isArray(Research.normalize({ queue: "nope" }).queue) && Research.normalize({ queue: "nope" }).queue.length === 0);
  ok("normalize of legacy save (no queue field) → []", Array.isArray(Research.normalize({ unlocked: [] }).queue) && Research.normalize({ unlocked: [] }).queue.length === 0);
})();

// tick auto-start: nothing active → start the FIRST eligible entry, remove it,
// preserve the order of the rest.
(() => {
  const st = mkState({ treasury: 1e6 });
  Research.enqueue(st, "crop_rotation");
  Research.enqueue(st, "paved_roads");
  Research.enqueue(st, "tax_ledgers");
  Research.tick(st);   // nothing active → auto-start first
  ok("tick auto-starts the first queued entry", st.research.active === "crop_rotation");
  ok("auto-started entry removed from queue", !Research.isQueued(st, "crop_rotation"));
  ok("remaining queue order preserved", st.research.queue.length === 2 && st.research.queue[0] === "paved_roads" && st.research.queue[1] === "tax_ledgers");
})();

// tick auto-start SKIPS IN PLACE an entry whose prereqs are unmet, and starts a
// later eligible entry. deep_veins (prereq crop_rotation) is skipped; crop_rotation
// starts; deep_veins remains queued.
(() => {
  const st = mkState({ treasury: 1e6 });
  st.research.queue = ["deep_veins", "crop_rotation"];   // deep_veins needs crop_rotation
  Research.tick(st);
  ok("tick skips unmet-prereq entry and starts a later eligible one", st.research.active === "crop_rotation");
  ok("skipped entry stays queued in place", Research.isQueued(st, "deep_veins") && st.research.queue.length === 1 && st.research.queue[0] === "deep_veins");
})();

// tick does NOT auto-start when a project is already active.
(() => {
  const st = mkState({ treasury: 1e6 });
  Research.start(st, "crop_rotation");
  Research.enqueue(st, "paved_roads");
  Research.tick(st);
  ok("tick leaves the queue intact while a project is active", st.research.active === "crop_rotation" && Research.isQueued(st, "paved_roads"));
})();

// End-to-end: a queued node auto-starts and completes once the active one finishes.
(() => {
  const st = mkState({ treasury: 1e6 });
  fillMats(st, "crop_rotation");
  Research.start(st, "crop_rotation");
  Research.enqueue(st, "deep_veins");   // prereq = crop_rotation (met after it finishes)
  const node = Research.get("crop_rotation");
  tick(st, node.timeTicks);   // finish crop_rotation
  ok("first node completed", Research.has(st, "crop_rotation"));
  fillMats(st, "deep_veins");
  tick(st, 1);   // auto-start the queued deep_veins
  ok("queued node auto-started after the active one finished", st.research.active === "deep_veins");
  ok("auto-started node removed from queue", !Research.isQueued(st, "deep_veins"));
})();
// === /RT-A2 ==================================================================


// === RSF: research-stall regression (author bug report 2026-07-09) ============
// "Research stuck at 100% and nothing happens." Root cause: materials-gated
// completion + no city surplus => royal buyers never dispatch. Guards:
(function () {
  // (a) starterStock exists and single-handedly covers ANY peasant-band root
  // unlock node's materials (first researches can never hard-stall).
  const ss = (CONFIG.researchEconomy && CONFIG.researchEconomy.starterStock) || {};
  ok("starterStock defined with wood", (ss.wood || 0) >= 15);
  const roots = (CONFIG.research || []).filter(n =>
    n.band === "peasant" && n.kind === "unlock" && (n.prereqs || []).length === 0);
  ok("peasant root unlock nodes exist", roots.length >= 1);
  for (const n of roots) {
    const covered = Object.keys(n.materials || {}).every(g => (ss[g] || 0) >= n.materials[g]);
    ok("starterStock covers root node " + n.id, covered);
  }
  // (b) active node's remaining materials feed town demand via ResearchEconomy.tick.
  const st = { towns: [{ id: 1, level: 1, q: 3, r: 0, pop: { peasants: 0, workers: 0, burghers: 0 },
                gold: 0, stock: {}, demand: {}, prices: {}, buildings: [] }],
               roads: new Set(), carts: [], treasury: 100000, castleStock: {},
               research: Research.fresh(), researchSeed: 5, tick: 0 };
  ok("start fishery research", Research.start(st, "unlock_fishery"));
  Sim.tick(st);   // RSF: the demand feed lives in Sim's demand pipeline
  const wantWood = (Research.get("unlock_fishery").materials || {}).wood || 0;
  ok("castle need feeds town demand (via Sim)", wantWood > 0 && (st.towns[0].demand.wood || 0) > 0);
  ok("dispatch hold-back excludes the castle echo",
     ResearchEconomy.townShare(st, "wood") > 0);
  // (c) end-to-end: fresh-style state WITH starterStock completes the node even
  // though the town never has a surplus.
  const st2 = { towns: [{ id: 1, level: 1, q: 3, r: 0, pop: { peasants: 0, workers: 0, burghers: 0 },
                 gold: 0, stock: {}, demand: {}, prices: {}, buildings: [] }],
                roads: new Set(), carts: [], treasury: 100000,
                castleStock: Object.assign({}, CONFIG.researchEconomy.starterStock),
                research: Research.fresh(), researchSeed: 5, tick: 0 };
  Research.start(st2, "unlock_fishery");
  let done = false;
  for (let i = 0; i < 200 && !done; i++) { ResearchEconomy.tick(st2, false); Research.tick(st2); done = Research.has(st2, "unlock_fishery"); }
  ok("root research completes from starterStock alone (no city surplus)", done);
})();
// === /RSF =====================================================================

// === TREELAYOUT: prereq-edge geometry (author fix — kill the long diagonals) ==
// Node pos:{col,row} fully determines edge geometry in the RT-B tree. These guard
// the layout invariants that keep edges SHORT + LOCAL: within-band edges span
// exactly 1 column (col = topological layer per band), cross-band edges stay
// near-vertical (≤2), band roots sit at col 0, columns are contiguous 0..N, and
// no two placed cards collide. Upgrade nodes are PIPS (mirror their building card,
// not placed by their own pos), so the card-level checks exclude them.
(function () {
  const POP = ["peasant", "worker", "burgher", "aristocrat"];
  const byId = Object.fromEntries(CONFIG.research.map(n => [n.id, n]));
  const cards = CONFIG.research.filter(n => n.kind !== "upgrade");   // placed by pos

  // Largest same-band prereq-edge column span over a node list (builds its own
  // index so a mutated clone can be measured independently).
  function maxSameSpan(list) {
    const idx = {}; list.forEach(n => idx[n.id] = n);
    let mx = 0;
    for (const n of list) for (const pid of (n.prereqs || [])) {
      const p = idx[pid]; if (!p || p.band !== n.band) continue;
      mx = Math.max(mx, Math.abs(n.pos.col - p.pos.col));
    }
    return mx;
  }

  // (1) EVERY same-band prereq edge (any kind — upgrade pips mirror, so span 0)
  // spans at most ONE column. This is the core "no long diagonal" guarantee.
  ok("within-band prereq edges span ≤1 column", maxSameSpan(CONFIG.research) <= 1);

  // mutation-check: pushing one gated node's col far away MUST turn the test red.
  (function () {
    const clone = CONFIG.research.map(n => Object.assign({}, n, { pos: { col: n.pos.col, row: n.pos.row } }));
    const idx = {}; clone.forEach(n => idx[n.id] = n);
    const victim = clone.find(n => (n.prereqs || []).some(pid => idx[pid] && idx[pid].band === n.band));
    ok("mutation-check found a within-band gated node to perturb", !!victim);
    if (victim) { victim.pos.col += 5; ok("mutation-check: a far-away col makes the span test go red", maxSameSpan(clone) > 1); }
  })();

  // (2) cross-band prereq edges stay near-vertical (small horizontal offset).
  let maxCross = 0;
  for (const n of cards) for (const pid of (n.prereqs || [])) {
    const p = byId[pid]; if (!p || p.band === n.band) continue;
    maxCross = Math.max(maxCross, Math.abs(n.pos.col - p.pos.col));
  }
  ok("cross-band prereq edges stay near-vertical (col span ≤2)", maxCross <= 2);

  // (3) per POP band: columns contiguous 0..N, roots (no same-band prereq) at col 0.
  for (const band of POP) {
    const bc = cards.filter(n => n.band === band);
    ok(band + " band has cards", bc.length > 0);
    const cols = new Set(bc.map(n => n.pos.col));
    const maxCol = Math.max.apply(null, bc.map(n => n.pos.col));
    let contig = cols.has(0);
    for (let c = 0; c <= maxCol; c++) if (!cols.has(c)) contig = false;
    ok(band + " band columns are contiguous 0.." + maxCol, contig);
    const roots = bc.filter(n => !(n.prereqs || []).some(pid => byId[pid] && byId[pid].band === band));
    ok(band + " band has ≥1 root", roots.length > 0);
    ok(band + " band roots all sit at col 0", roots.every(n => n.pos.col === 0));
  }

  // (4) no two placed cards in a band share the same (col,row) — incl. kingdom.
  for (const band of Research.bands()) {
    const bc = cards.filter(n => n.band === band);
    const seen = new Set(); let clash = false;
    for (const n of bc) { const k = n.pos.col + "," + n.pos.row; if (seen.has(k)) clash = true; seen.add(k); }
    ok(band + " band has no two cards sharing (col,row)", !clash);
  }

  // (5) upgrade pips mirror their building's unlock card exactly (when one exists;
  // startUnlocked buildings anchor in RT-B, outside CONFIG, so those are skipped).
  ok("upgrade nodes mirror their building card's pos", CONFIG.research
    .filter(n => n.kind === "upgrade")
    .every(u => {
      const card = byId["unlock_" + u.buildingId];
      return !card || (u.pos.col === card.pos.col && u.pos.row === card.pos.row);
    }));

  // (6) kingdom stays a tidy side column — each of its 3 branches is a vertical
  // chain (constant col, so its within-band edges are perfectly vertical).
  ok("each kingdom branch is a single vertical column", Research.branches().every(br => {
    const ns = Research.nodesInBand("kingdom").filter(n => n.branch === br);
    return ns.length > 0 && new Set(ns.map(n => n.pos.col)).size === 1;
  }));
})();
// === /TREELAYOUT ==============================================================

console.log(`research: ${pass}/${pass + fail} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
