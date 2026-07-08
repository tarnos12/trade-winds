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
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Research=Research; this.ResearchEconomy=ResearchEconomy;", sandbox);
const { CONFIG, Research, ResearchEconomy } = sandbox;

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
// Catalog shape
// =========================================================================
ok("19 research nodes", CONFIG.research.length === 19);   // RU-A: +4 development nodes
// RU-A: 3 core branches × 5 nodes + a development branch of 4 nodes.
ok("core branches × 5 nodes", ["production", "logistics", "administration"].every(b => Research.nodesIn(b).length === 5));
ok("development branch has 4 nodes", Research.nodesIn("development").length === 4);
ok("branches() includes development (4 branches)", Research.branches().length === 4 && Research.branches().indexOf("development") >= 0);
ok("every node has required fields", CONFIG.research.every(n =>
  n.id && n.branch && n.name && n.desc && typeof n.cost === "number" &&
  typeof n.timeTicks === "number" && Array.isArray(n.prereqs) && n.effect && typeof n.effect === "object"));
// CRE: every node carries a materials requirement (goodId → positive qty of real goods).
ok("every node has a materials requirement", CONFIG.research.every(n =>
  n.materials && typeof n.materials === "object" && Object.keys(n.materials).length > 0 &&
  Object.keys(n.materials).every(g => !!CONFIG.goods[g] && n.materials[g] > 0)));
ok("node ids are unique", new Set(CONFIG.research.map(n => n.id)).size === 19);   // RU-A: 19 total
ok("all prereqs reference real nodes", CONFIG.research.every(n =>
  n.prereqs.every(p => !!Research.get(p))));
ok("each branch has exactly one root (no prereqs)", Research.branches().every(b =>
  Research.nodesIn(b).filter(n => n.prereqs.length === 0).length === 1));

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
  const node = Research.get("deep_veins");   // { stone, ore }
  const st = mkState({ castleStock: {} });
  ok("materialsSatisfied false when empty", !ResearchEconomy.materialsSatisfied(st, node));
  ok("remaining equals requirement when empty", ResearchEconomy.remaining(st, node, "ore") === node.materials.ore);
  st.castleStock.stone = node.materials.stone;
  st.castleStock.ore = node.materials.ore;
  ok("materialsSatisfied true once covered", ResearchEconomy.materialsSatisfied(st, node));
  ok("remaining zero once covered", ResearchEconomy.remaining(st, node, "ore") === 0);
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

// Panel CLOSED → no NEW dispatches (in-flight carts, if any, may still finish).
(() => {
  const city = mkCity({ stock: { wood: 500, stone: 500 } });
  const st = mkState({ treasury: 100000, towns: [city], roads: new Set(), carts: [], researchSeed: 3 });
  Research.start(st, "crop_rotation");
  for (let i = 0; i < 50; i++) { ResearchEconomy.tick(st, false); Research.tick(st); }
  ok("closed panel dispatches no castle traders", ResearchEconomy.activeCastleCarts(st) === 0);
  ok("closed panel gathers no materials", (st.castleStock.wood || 0) === 0 && (st.castleStock.stone || 0) === 0);
  ok("node stays active (stalled) while the panel is closed", st.research.active === "crop_rotation");
  // Re-open → it now proceeds.
  let done = false;
  for (let i = 0; i < 300 && !done; i++) { ResearchEconomy.tick(st, true); Research.tick(st); if (Research.has(st, "crop_rotation")) done = true; }
  ok("re-opening the panel resumes and completes it", done);
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
// === RU-A: development branch — unlock nodes exist, gated, unlock normally ===
(() => {
  const devIds = ["hut_upgrades", "lumberjack_upgrades", "farm_upgrades", "sawmill_upgrades"];
  ok("4 development nodes exist", devIds.every(id => !!Research.get(id) && Research.get(id).branch === "development"));
  const st = mkState({ treasury: 100000 });
  ok("dev root available, others gated", Research.isAvailable(st, "hut_upgrades")
    && !Research.isAvailable(st, "lumberjack_upgrades"));
  ok("dev nodes locked before research", devIds.every(id => !Research.has(st, id)));
  fillMats(st, "hut_upgrades");
  Research.start(st, "hut_upgrades");
  tick(st, Research.get("hut_upgrades").timeTicks);
  ok("dev root unlocks via normal flow", Research.has(st, "hut_upgrades"));
  ok("next dev node available after prereq", Research.canStart(st, "lumberjack_upgrades"));
})();
// === /RU-A ===================================================================

console.log(`research: ${pass}/${pass + fail} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
