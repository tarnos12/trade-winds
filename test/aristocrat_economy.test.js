// Characterization / achievability lock for the NEW victory (Balance & Post-Victory
// pass): drive the REAL Sim tick on a town with a BUILT aristocrat_home and a fully
// stocked aristocrat pantry, and assert (1) aristocrat happiness eases up to the win
// threshold and `Victory.check` fires, and (2) removing ANY single aristocrat good
// (basic OR extra) caps happiness below the threshold and Victory.check does NOT fire
// — proving the win gate transitively forces the ENTIRE T3 economy (the design intent).
//
// This replaces the removed castle-L5 "victory reachable" assertions in balance.test.js.
// It is pure-Sim (no harness/geography) so it is Round-1 safe. It does NOT hard-code any
// victory tick — it asserts the happiness/flag outcome after a fixed drive horizon.
//   node test/aristocrat_economy.test.js
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
  m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings;" +
         "\nthis.Victory=(typeof Victory!=='undefined')?Victory:undefined;",
  sandbox
);
const { CONFIG, Sim, Buildings, Victory } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

// --- API gate (fails cleanly if 2A's Victory/CONFIG.victory not yet in the build) ---
const apiReady = !!(Victory && typeof Victory.check === "function"
                    && CONFIG && CONFIG.victory && typeof CONFIG.victory.aristocratHappiness === "number");
ok("Victory.check + CONFIG.victory present (built in 2A)", apiReady);
if (!apiReady) {
  console.error("aristocrat_economy: API not yet in build (expected until Lead builds 2A) — "
    + pass + " passed, " + fail + " FAILED");
  process.exit(1);
}

const T = CONFIG.victory.aristocratHappiness;          // 99.5
const A = CONFIG.needs.tiers.aristocrats;              // basic[] + extra[] lists
const ALL = [...A.basic, ...A.extra];
const HORIZON = 600;                                   // happyEase(0.10) asymptotes well within this

// Build a town with `homes` built aristocrat_homes and a seeded aristocrat pop.
function mkTown() {
  return {
    id: 1, q: 0, r: 0, level: 4, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 1 },
    stock: {}, prices: {}, demand: {}, happiness: undefined,
    buildings: [{ typeId: "aristocrat_home", q: 0, r: 1, workers: 0, built: true, delivered: {}, closedSlots: 0 }],
  };
}
// Drive the Sim `HORIZON` ticks, refilling the given goods to storageCap each tick
// (aristocrat goods are imported here — no local T3 producer — so the shelf must be
// topped up to model a supplied economy). Returns the final town.
function drive(goodsToStock) {
  const t = mkTown();
  const CAP = CONFIG.town.storageCap;
  for (let i = 0; i < HORIZON; i++) {
    for (const g of goodsToStock) t.stock[g] = CAP;
    Sim.tick({ towns: [t] });
  }
  return t;
}

// --- 1. ACHIEVABLE: full pantry => aristocrat happiness hits the win + Victory.check fires ---
(function () {
  const t = drive(ALL);
  ok("aristocrats present in a supplied aristocrat_home", (t.pop.aristocrats || 0) > 0.9);
  ok("aristocrat happiness reaches the win threshold (>= " + T + ")",
     typeof t.tierHappiness.aristocrats === "number" && t.tierHappiness.aristocrats >= T,
     "th=" + (t.tierHappiness.aristocrats || 0).toFixed(3));
  const state = { towns: [t], victory: false };
  Victory.check(state);
  ok("Victory.check fires on the fully-supplied aristocrat_home", state.victory === true);
})();

// --- 2. DESIGN INTENT: every aristocrat good is load-bearing --------------------
// Drop exactly one need good at a time; happiness must fall below the win threshold
// and Victory.check must NOT fire. This is what makes the win transitively require
// the whole T3 set (lamp/mead/iron_armor/chairs/pottery + brandy/luxury_clothes/gold_ring).
(function () {
  let allCapped = true, anyFalseWin = false;
  for (const missing of ALL) {
    const stocked = ALL.filter(g => g !== missing);
    const t = drive(stocked);
    const th = t.tierHappiness.aristocrats;
    const capped = typeof th === "number" && th < T;
    if (!capped) { allCapped = false; console.error("    (missing " + missing + " still reached " + (th||0).toFixed(2) + ")"); }
    const state = { towns: [t], victory: false };
    Victory.check(state);
    if (state.victory) { anyFalseWin = true; console.error("    (false win with " + missing + " missing)"); }
  }
  ok("removing ANY single aristocrat good caps happiness below the win threshold", allCapped);
  ok("no false victory when any aristocrat good is missing", !anyFalseWin);
})();

// --- 3. Determinism: same drive => identical final aristocrat happiness ----------
(function () {
  const a = drive(ALL).tierHappiness.aristocrats;
  const b = drive(ALL).tierHappiness.aristocrats;
  ok("aristocrat happiness drive is deterministic (bit-identical)", a === b);
})();

// -----------------------------------------------------------------------------
if (fail) { console.error(`aristocrat_economy: ${pass} passed, ${fail} FAILED`); process.exit(1); }
console.log(`aristocrat_economy: ${pass} passed`);
