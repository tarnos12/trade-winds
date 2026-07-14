// Headless test for Trade Winds item U — the DATA-DRIVEN MISSION ENGINE
// (EngineDev reworks src/tutorial.js into it; see
// docs/proposals/MISSION_EDITOR_BRIEF.md "THE SCHEMA" + evaluation rules).
//
// Two independent parts:
//   A) SCHEMA ROUND-TRIP  — a sample authored mission set stringifies and
//      re-parses to an identical structure and passes shape validation. Pure
//      JSON; runs and enforces NOW (no engine needed).
//   B) OBJECTIVE / MISSION EVALUATION — each objective type satisfied at the
//      right counter value; retroactive=true reads the lifetime counter,
//      retroactive=false reads counter-baseline; a mission with unmet prereqs
//      is NOT active; a mission completes only when ALL objectives are met.
//      Part B binds to EngineDev's PURE evaluator (see BINDING below). Until
//      that evaluator is exposed inside PURE_CORE, Part B reports PENDING and
//      does not fail the run (staged, per QA brief) — while Part A stays green.
//
//   node test/mission.test.js
//
// NOTE: src/tutorial.js currently lives BELOW PURE_CORE_END and is DOM-coupled,
// so the engine's OBJECTIVE EVALUATION must be exposed as a pure, browser-free
// function to be headlessly testable. Coordinated with EngineDev; BINDING below
// is the single lock-point once the exact name/signature is confirmed.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0, pending = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); }
}
function todo(name) { pending++; console.error("  … PENDING (engine not built): " + name); }

// ========================================================================
// PART A — SCHEMA ROUND-TRIP + shape validation (pure JSON, enforced now).
// ========================================================================
// A representative authored mission set exercising ALL FOUR objective types,
// the retroactive flag (default true + an explicit false), grid positions, and
// a prereq flowchart edge (m2 depends on m1).
const SAMPLE = {
  version: 1,
  missions: [
    {
      id: "m1", name: "First Foundations", icon: "🏗",
      pos: { col: 0, row: 0 }, retroactive: true, prereqs: [],
      objectives: [
        { type: "construct", building: "any", count: 1 },
        { type: "construct", building: "lumberjack", count: 2 },
      ],
    },
    {
      id: "m2", name: "Trade & Taxes", icon: "💰",
      pos: { col: 1, row: 0 }, retroactive: false, prereqs: ["m1"],
      objectives: [
        { type: "trade_good", good: "potato", count: 20 },
        { type: "upgrade", building: "any", count: 1 },
        { type: "earn_tax", amount: 500 },
      ],
    },
  ],
};

// Round-trip: stringify -> parse -> deep-equal.
{
  const rt = JSON.parse(JSON.stringify(SAMPLE));
  ok("schema: sample mission set round-trips (stringify->parse identical)",
     JSON.stringify(rt) === JSON.stringify(SAMPLE));
  ok("schema: version is 1", rt.version === 1);
  ok("schema: missions is a non-empty array", Array.isArray(rt.missions) && rt.missions.length === 2);
}

// A minimal, standalone validator encoding the brief's schema (QA-owned; NOT the
// engine). It proves the sample is well-formed and rejects malformed sets — the
// authoring tool (EditorDev) and the engine (EngineDev) both build to this shape.
const OBJ_TYPES = ["construct", "upgrade", "trade_good", "earn_tax"];
function validateMissionSet(set) {
  const errs = [];
  if (!set || typeof set !== "object") { errs.push("set not object"); return errs; }
  if (set.version !== 1) errs.push("version must be 1");
  if (!Array.isArray(set.missions)) { errs.push("missions must be array"); return errs; }
  const ids = new Set();
  for (const mm of set.missions) {
    if (!mm || typeof mm.id !== "string" || !mm.id) { errs.push("mission id must be non-empty string"); continue; }
    if (ids.has(mm.id)) errs.push("duplicate mission id: " + mm.id);
    ids.add(mm.id);
    if (typeof mm.name !== "string") errs.push(mm.id + ": name must be string");
    if (!mm.pos || typeof mm.pos.col !== "number" || typeof mm.pos.row !== "number")
      errs.push(mm.id + ": pos.col/row must be ints");
    if (mm.retroactive !== undefined && typeof mm.retroactive !== "boolean")
      errs.push(mm.id + ": retroactive must be boolean");
    if (!Array.isArray(mm.prereqs)) errs.push(mm.id + ": prereqs must be array");
    if (!Array.isArray(mm.objectives) || mm.objectives.length === 0)
      errs.push(mm.id + ": objectives must be non-empty array");
    for (const o of (mm.objectives || [])) {
      if (!OBJ_TYPES.includes(o.type)) { errs.push(mm.id + ": bad objective type " + o.type); continue; }
      if (o.type === "construct" || o.type === "upgrade") {
        if (typeof o.building !== "string") errs.push(mm.id + ": " + o.type + " needs building (id or 'any')");
        if (typeof o.count !== "number" || o.count <= 0) errs.push(mm.id + ": " + o.type + " needs positive count");
      } else if (o.type === "trade_good") {
        if (typeof o.good !== "string") errs.push(mm.id + ": trade_good needs good id");
        if (typeof o.count !== "number" || o.count <= 0) errs.push(mm.id + ": trade_good needs positive count");
      } else if (o.type === "earn_tax") {
        if (typeof o.amount !== "number" || o.amount <= 0) errs.push(mm.id + ": earn_tax needs positive amount");
      }
    }
    // prereqs must reference existing mission ids.
    for (const p of (mm.prereqs || [])) if (!set.missions.some(x => x.id === p))
      errs.push(mm.id + ": prereq references unknown mission " + p);
  }
  return errs;
}
{
  const errs = validateMissionSet(SAMPLE);
  ok("schema: sample validates clean (no errors): " + (errs.join("; ") || "ok"), errs.length === 0);
  // Malformed sets are rejected.
  ok("schema: rejects unknown objective type",
     validateMissionSet({ version: 1, missions: [{ id: "x", name: "", pos: { col: 0, row: 0 }, prereqs: [],
       objectives: [{ type: "mine", count: 1 }] }] }).length > 0);
  ok("schema: rejects duplicate mission ids",
     validateMissionSet({ version: 1, missions: [
       { id: "d", name: "", pos: { col: 0, row: 0 }, prereqs: [], objectives: [{ type: "earn_tax", amount: 1 }] },
       { id: "d", name: "", pos: { col: 1, row: 0 }, prereqs: [], objectives: [{ type: "earn_tax", amount: 1 }] },
     ] }).length > 0);
  ok("schema: rejects prereq referencing unknown mission",
     validateMissionSet({ version: 1, missions: [{ id: "a", name: "", pos: { col: 0, row: 0 }, prereqs: ["ghost"],
       objectives: [{ type: "earn_tax", amount: 1 }] }] }).length > 0);
  ok("schema: retroactive defaults acceptably (undefined allowed, treated true)",
     validateMissionSet({ version: 1, missions: [{ id: "a", name: "", pos: { col: 0, row: 0 }, prereqs: [],
       objectives: [{ type: "earn_tax", amount: 1 }] }] }).length === 0);
}

// ========================================================================
// PART B — OBJECTIVE / MISSION EVALUATION (binds to EngineDev's pure API).
// ========================================================================
// Load PURE_CORE so any pure evaluator EngineDev exposes there is in scope.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
// Export a broad set of candidate globals; whichever EngineDev exposes wins.
vm.runInContext(
  m[1] + "\nthis.CONFIG=CONFIG;" +
  "this.MissionEngine=(typeof MissionEngine!=='undefined')?MissionEngine:undefined;" +
  "this.Missions=(typeof Missions!=='undefined')?Missions:undefined;" +
  "this.MissionEval=(typeof MissionEval!=='undefined')?MissionEval:undefined;",
  sandbox
);

// ---- BINDING (single lock-point; confirm exact names with EngineDev) --------
// We need two pure entry points. Bind each from the first candidate that exists.
//   objMet(objective, stats, baseline)  -> boolean (or {met})   : one objective
//   evalSet(missionSet, stats, progress) -> per-mission {active, complete, objectives}
// `progress` carries which missions are already COMPLETE (unlocks dependents)
// and, for retroactive:false missions, the per-mission stats BASELINE snapshot.
const Eng = sandbox.MissionEngine || sandbox.Missions || sandbox.MissionEval || null;
function pick(obj, names) { for (const n of names) if (obj && typeof obj[n] === "function") return obj[n].bind(obj); return null; }
const objMetFn = Eng && pick(Eng, ["objectiveMet", "objMet", "isObjectiveMet", "objectiveSatisfied"]);
const objProgFn = Eng && pick(Eng, ["objectiveProgress", "objProgress", "progressFor"]);
const evalSetFn = Eng && pick(Eng, ["evaluate", "evalSet", "evaluateSet", "tickSet", "compute"]);
const engineAvailable = !!(objMetFn || objProgFn || evalSetFn);

// Stats fixture builder matching the counter contract.
function mkStats(o) {
  o = o || {};
  return {
    constructed: { total: (o.constructed && o.constructed.total) || 0, byType: (o.constructed && o.constructed.byType) || {} },
    upgraded:    { total: (o.upgraded && o.upgraded.total) || 0,       byType: (o.upgraded && o.upgraded.byType) || {} },
    traded:      { byGood: (o.traded && o.traded.byGood) || {} },
    taxEarned:   o.taxEarned || 0,
  };
}
// Adapter: is a single objective met given stats (+ optional baseline)?
function objIsMet(obj, stats, baseline) {
  if (objMetFn) { const r = objMetFn(obj, stats, baseline); return (r && typeof r === "object") ? !!r.met : !!r; }
  if (objProgFn) { const p = objProgFn(obj, stats, baseline); return !!(p && (p.met || (p.have != null && p.need != null && p.have >= p.need))); }
  return null; // unresolved
}

if (!engineAvailable) {
  todo("objective evaluation — each of construct/upgrade/trade_good/earn_tax at threshold");
  todo("retroactive=true reads lifetime counter");
  todo("retroactive=false reads counter - baseline");
  todo("prereq gating — mission with unmet prereqs is NOT active");
  todo("mission completes only when ALL objectives met");
} else {
  // -- B1) Each objective type satisfied at the right counter value ----------
  if (objMetFn || objProgFn) {
    // construct any: need 1
    ok("obj: construct/any met at total>=count",
       objIsMet({ type: "construct", building: "any", count: 1 }, mkStats({ constructed: { total: 1 } })) === true);
    ok("obj: construct/any UNmet below count",
       objIsMet({ type: "construct", building: "any", count: 2 }, mkStats({ constructed: { total: 1 } })) === false);
    // construct specific building: reads byType, not total
    ok("obj: construct/lumberjack met at byType>=count",
       objIsMet({ type: "construct", building: "lumberjack", count: 2 },
                mkStats({ constructed: { total: 5, byType: { lumberjack: 2 } } })) === true);
    ok("obj: construct/lumberjack UNmet when byType short (ignores unrelated total)",
       objIsMet({ type: "construct", building: "lumberjack", count: 2 },
                mkStats({ constructed: { total: 5, byType: { lumberjack: 1, sawmill: 4 } } })) === false);
    // upgrade any + specific
    ok("obj: upgrade/any met at total>=count",
       objIsMet({ type: "upgrade", building: "any", count: 1 }, mkStats({ upgraded: { total: 1 } })) === true);
    ok("obj: upgrade/hut met at byType>=count",
       objIsMet({ type: "upgrade", building: "hut", count: 2 },
                mkStats({ upgraded: { total: 3, byType: { hut: 2 } } })) === true);
    // trade_good
    ok("obj: trade_good met at byGood>=count",
       objIsMet({ type: "trade_good", good: "potato", count: 20 },
                mkStats({ traded: { byGood: { potato: 20 } } })) === true);
    ok("obj: trade_good UNmet below count",
       objIsMet({ type: "trade_good", good: "potato", count: 20 },
                mkStats({ traded: { byGood: { potato: 19 } } })) === false);
    // earn_tax
    ok("obj: earn_tax met at taxEarned>=amount",
       objIsMet({ type: "earn_tax", amount: 500 }, mkStats({ taxEarned: 500 })) === true);
    ok("obj: earn_tax UNmet below amount",
       objIsMet({ type: "earn_tax", amount: 500 }, mkStats({ taxEarned: 499 })) === false);

    // -- B2) retroactive vs baseline (counter - baseline) --------------------
    // Confirmed: objectiveMet(obj, stats, baseline) where baseline is a NUMBER =
    // the objective's lifetime counter snapshotted at activation. retro reads
    // baseline 0/omitted; non-retro reads cur = max(0, lifetime - baseline).
    // Lifetime counter = 10 constructed; mission activated when 8 were already built.
    const life = mkStats({ constructed: { total: 10, byType: { hut: 10 } } });
    const obj3 = { type: "construct", building: "any", count: 3 };
    // retroactive=true reads lifetime (10 >= 3 => met). baseline 0/omitted models retro.
    ok("retroactive=true reads lifetime counter (10>=3 met, baseline 0)",
       objIsMet(obj3, life, 0) === true);
    // retroactive=false reads counter - baseline (10-8=2 < 3 => NOT met).
    const fromZero = objIsMet(obj3, life, 8);
    if (fromZero === null) todo("retroactive=false baseline arg (evaluator ignores baseline param)");
    else ok("retroactive=false reads counter-baseline (10-8=2 < 3 => NOT met)", fromZero === false);
    // And once three MORE are built from-zero it flips: 13-8=5 >= 3.
    const life2 = mkStats({ constructed: { total: 13, byType: { hut: 13 } } });
    const fromZero2 = objIsMet(obj3, life2, 8);
    if (fromZero2 !== null) ok("retroactive=false satisfied once counter-baseline>=count", fromZero2 === true);
    // objectiveProgress exposes cur/target/met directly — verify the arithmetic.
    if (objProgFn) {
      const p = objProgFn(obj3, life, 8);
      ok("objectiveProgress: cur = max(0, lifetime-baseline) = 2, target 3, met false",
         p && p.cur === 2 && p.target === 3 && p.met === false);
    }
  } else {
    todo("objective-level evaluation (no objectiveMet/objectiveProgress helper exposed)");
  }

  // -- B3) prereq gating + mission-complete (set-level evaluator) ------------
  if (evalSetFn) {
    const set = SAMPLE;
    // Confirmed shape: evaluate(...) -> { byId:{id:{active,complete,prereqsMet,objectives}}, ... }.
    // Completion is prereq-GATED and derived from stats (a fixpoint), NOT a passed
    // `completed` list; retroactive:false objectives read lifetime - baselines[mid][i].
    function viewOf(res, id) { return (res && res.byId && res.byId[id]) ? res.byId[id] : null; }

    // No baselines, empty stats: m1 (no prereqs) is active; m2 (prereq m1 incomplete) is NOT.
    let res0 = null; try { res0 = evalSetFn(set, mkStats({}), { baselines: {} }); } catch (e) { res0 = null; }
    const v1 = viewOf(res0, "m1"), v2 = viewOf(res0, "m2");
    if (v1 && v2) {
      ok("prereq: root mission m1 is ACTIVE with no prereqs", v1.active === true);
      ok("prereq: m2 is NOT active while its prereq m1 is incomplete", v2.active === false);
      ok("complete: m1 NOT complete with zero stats", v1.complete === false);

      // Satisfy m1's objectives fully: construct/any>=1 AND construct/lumberjack>=2.
      const s1 = mkStats({ constructed: { total: 3, byType: { lumberjack: 2, sawmill: 1 } } });
      const res1 = evalSetFn(set, s1, { baselines: {} });
      const v1b = viewOf(res1, "m1"), v2b = viewOf(res1, "m2");
      ok("complete: m1 completes only when ALL its objectives met", v1b && v1b.complete === true);
      // m1 complete => m2's prereq is now met => m2 becomes active (but not yet complete:
      // m2 is retroactive:false with no baseline, so its objectives read progress 0).
      ok("prereq: m2 becomes ACTIVE once m1 is complete", v2b && v2b.active === true && v2b.prereqsMet === true);
      ok("complete: m2 not complete yet (non-retro, no baseline => progress 0)", v2b && v2b.complete === false);

      // m2 completion is prereq-GATED: needs m1 satisfied (constructed) AND all three
      // of m2's own objectives, with a per-objective baseline (activated at zero => [0,0,0]).
      const m1part = { constructed: { total: 3, byType: { lumberjack: 2, sawmill: 1 } } };
      const bl = { baselines: { m2: [0, 0, 0] } };  // m2 objectives: [trade_good, upgrade, earn_tax]
      const s2partial = mkStats(Object.assign({}, m1part,
        { traded: { byGood: { potato: 20 } }, upgraded: { total: 1 } }));   // earn_tax missing
      const v2c = viewOf(evalSetFn(set, s2partial, bl), "m2");
      ok("complete: m2 NOT complete while one objective (earn_tax) unmet", v2c && v2c.complete === false);
      const s2full = mkStats(Object.assign({}, m1part,
        { traded: { byGood: { potato: 20 } }, upgraded: { total: 1 }, taxEarned: 500 }));
      const v2d = viewOf(evalSetFn(set, s2full, bl), "m2");
      ok("complete: m2 completes when ALL objectives met (prereq + baseline supplied)",
         v2d && v2d.complete === true);
      // allComplete reflects the whole set finishing.
      const resAll = evalSetFn(set, s2full, bl);
      ok("complete: allComplete true when every mission is complete", resAll && resAll.allComplete === true);
    } else {
      todo("set-level evaluate() return shape unrecognized — confirm shape with EngineDev");
    }
  } else {
    todo("set-level evaluate() (prereq gating + mission-complete) not exposed");
  }
}

// ---- summary ----
if (pending) console.error("\nmission.test.js: " + pending + " engine assertion group(s) PENDING a build with EngineDev's pure evaluator.");
if (fail) { console.error("mission.test.js: " + pass + " passed, " + fail + " FAILED, " + pending + " pending"); process.exit(1); }
console.log("mission.test.js: " + pass + " assertions passed" + (pending ? " (" + pending + " engine group(s) staged/pending)" : ""));
