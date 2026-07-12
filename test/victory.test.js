// Headless characterization test for the NEW victory rule (Balance & Post-Victory
// pass): victory = a town has a BUILT aristocrat_home AND its aristocrat-tier
// happiness >= CONFIG.victory.aristocratHappiness. Evals the PURE_CORE block from
// index.html and drives the pinned `Victory.check(state)` detector directly.
//   node test/victory.test.js
//
// API (pinned with EconDev, Phase-2 contract 2A):
//   Victory.check(state) -> state ; sets state.victory=true when some town qualifies;
//   LATCHES (early-returns if state.victory already true); pure, reads state only.
//   Threshold lives in CONFIG.victory.aristocratHappiness (frozen 2A value: 99.5) —
//   assert against the CONFIG key, never a hardcoded literal, so a tuning nudge in
//   the number doesn't break these tests.
//
// NOTE: `Victory`/`CONFIG.victory` are added by EconDev in slice 2A. Until the Lead
// builds 2A into index.html this suite FAILS CLEANLY on the first assertion (API
// present) rather than crashing — that red is expected pre-2A and turns green once
// 2A lands. Do NOT hardcode the victory tick anywhere (n/a here; playthrough-only).
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
  m[1] + "\nthis.CONFIG=CONFIG;" +
         // Victory lands in 2A — export defensively so a pre-2A eval doesn't throw.
         "\nthis.Victory=(typeof Victory!=='undefined')?Victory:undefined;",
  sandbox
);
const { CONFIG, Victory } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

// --- API presence gate (fails cleanly pre-2A instead of crashing) -------------
const apiReady = !!(Victory && typeof Victory.check === "function"
                    && CONFIG && CONFIG.victory && typeof CONFIG.victory.aristocratHappiness === "number");
ok("Victory.check + CONFIG.victory.aristocratHappiness present (built in 2A)", apiReady);
if (!apiReady) {
  console.error("victory: API not yet in build (expected until Lead builds 2A) — " + pass + " passed, " + fail + " FAILED");
  process.exit(1);
}

const T = CONFIG.victory.aristocratHappiness;   // threshold (frozen 2A: 99.5)
ok("threshold is a sane percentage (0,100]", T > 0 && T <= 100);

// --- helpers ------------------------------------------------------------------
const homeBuilt    = () => ({ typeId: "aristocrat_home", built: true });
const homeScaffold = () => ({ typeId: "aristocrat_home", built: false });
function mkTown(over) {
  return Object.assign({ id: 1, buildings: [], tierHappiness: { aristocrats: null },
                         pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 } }, over);
}
function mkState(towns) { return { towns, victory: false }; }
// Fresh single-town state: a built home + a given aristocrat tierHappiness value.
function withHome(th, opts) {
  opts = opts || {};
  const home = (opts.scaffold ? homeScaffold() : homeBuilt());
  return mkState([ mkTown({ buildings: [home], tierHappiness: { aristocrats: th },
                            pop: { aristocrats: th == null ? 0 : 1 } }) ]);
}

// --- 1. Detector truth table --------------------------------------------------
(function () {
  // built home + happiness at/over threshold => WIN
  let s = withHome(100);            Victory.check(s); ok("built home @100% wins", s.victory === true);
  s = withHome(T);                  Victory.check(s); ok("built home @threshold wins", s.victory === true);

  // boundary: just under threshold => NO win (locks strict >= T)
  s = withHome(T - 0.1);            Victory.check(s); ok("built home just under threshold does NOT win", s.victory !== true);

  // partial happiness => NO win
  s = withHome(70);                 Victory.check(s); ok("built home @70% does NOT win", s.victory !== true);

  // empty home (no aristocrats living there => tierHappiness.aristocrats null) => NO false-win
  s = withHome(null);               Victory.check(s); ok("built-but-empty home (null happiness) does NOT win", s.victory !== true);

  // home still a scaffold (built:false) even at 100% => NO win
  s = withHome(100, { scaffold: true }); Victory.check(s); ok("scaffold home @100% does NOT win", s.victory !== true);

  // no aristocrat_home at all, town otherwise 100% happy => NO win
  s = mkState([ mkTown({ buildings: [{ typeId: "manor", built: true }], tierHappiness: { aristocrats: 100 }, pop: { aristocrats: 1 } }) ]);
  Victory.check(s); ok("no aristocrat_home => no win even at 100% aris happiness", s.victory !== true);
})();

// --- 2. Return value + purity -------------------------------------------------
(function () {
  const s = withHome(100);
  const ret = Victory.check(s);
  ok("check returns the state (chainable)", ret === s);
})();

// --- 3. Multi-town: ANY qualifying town wins ----------------------------------
(function () {
  const loser = mkTown({ id: 1, buildings: [homeBuilt()], tierHappiness: { aristocrats: 80 }, pop: { aristocrats: 1 } });
  const winner = mkTown({ id: 2, buildings: [homeBuilt()], tierHappiness: { aristocrats: 100 }, pop: { aristocrats: 1 } });
  const s = mkState([loser, winner]);
  Victory.check(s);
  ok("victory fires if ANY town (not just #1) qualifies", s.victory === true);
})();

// --- 4. Latch: once won, a later non-qualifying scan does not un-win ----------
(function () {
  const s = withHome(100); Victory.check(s); ok("won on first check", s.victory === true);
  // now degrade every town below threshold and re-check — must stay won (latch)
  s.towns[0].tierHappiness.aristocrats = 50;
  Victory.check(s);
  ok("victory latches (stays true after town drops below threshold)", s.victory === true);
  // and an already-true state is a no-op even with zero towns
  const s2 = { towns: [], victory: true };
  Victory.check(s2);
  ok("check on already-victorious state is a safe no-op", s2.victory === true);
})();

// --- 5. Save/load: victory survives a JSON round-trip + detector re-agrees -----
(function () {
  const s = withHome(100); Victory.check(s);
  const round = JSON.parse(JSON.stringify(s));
  ok("victory flag preserved across JSON round-trip", round.victory === true);
  // a fresh not-yet-won state round-trips, then the detector fires post-load
  const pre = withHome(100);                    // victory:false, qualifying town
  const reloaded = JSON.parse(JSON.stringify(pre));
  ok("pre-victory state loads with victory false", reloaded.victory === false);
  Victory.check(reloaded);
  ok("detector re-derives victory after load", reloaded.victory === true);
})();

// -----------------------------------------------------------------------------
if (fail) { console.error(`victory: ${pass} passed, ${fail} FAILED`); process.exit(1); }
console.log(`victory: ${pass} passed`);
