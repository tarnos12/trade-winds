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
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Research=Research;", sandbox);
const { CONFIG, Research } = sandbox;

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

// =========================================================================
// Catalog shape
// =========================================================================
ok("15 research nodes", CONFIG.research.length === 15);
ok("3 branches × 5 nodes", Research.branches().every(b => Research.nodesIn(b).length === 5));
ok("every node has required fields", CONFIG.research.every(n =>
  n.id && n.branch && n.name && n.desc && typeof n.cost === "number" &&
  typeof n.timeTicks === "number" && Array.isArray(n.prereqs) && n.effect && typeof n.effect === "object"));
ok("node ids are unique", new Set(CONFIG.research.map(n => n.id)).size === 15);
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
    Research.start(st, "paved_roads");
    tick(st, Research.get("paved_roads").timeTicks);
    Research.start(st, "larger_carts");
    tick(st, Research.get("larger_carts").timeTicks);
    return JSON.stringify(st.research) + "|" + st.treasury;
  }
  ok("deterministic across identical runs", run() === run());
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
console.log(`research: ${pass}/${pass + fail} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
