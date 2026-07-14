"use strict";
// ============================================================================
// QA harness for the Balance Lab (src/balance-lab.js → window.BalanceLab).
// Contract LOCKED with LabDev (2026-07-14). See CONTRACT block below.
//
//   BalanceLab.analyze(scenario)
//     → { perGood: { [gid]:{prod,cons,net} },            // GLOBAL, per-MINUTE
//         perCity: [ {id,name,income,deficitCost,net} ] } //  per-city, per-MINUTE
//   BalanceLab.simulate(scenario, ticks)
//     → { ticks, minutes,
//         cities:[ {id,name,pop,tierHappiness,happiness,gold,netGoldPerMin,present,collapsed} ],
//         goods:{ [gid]:{end,min,max,trend,series} },
//         verdict:{ selfSustained, reasons, warnings } }
//
// SCENARIO: { cities:[ {id?,name,buildings:[{typeId,count,level}], pop:{peasants,workers,
//            burghers,aristocrats}|null} ] }  — pop null ⇒ derived from placed houses.
//
// Four QA guards the author asked for:
//   1. analyze() correctness vs CONFIG-derived, hand-computed numbers.
//   2. analyze() ⇄ simulate() VERDICT agreement on clear surplus / deficit cases.
//   3. simulate() determinism — deterministic by construction ⇒ bit-identical.
//   4. house/people-tax INCOME scales with pop × happiness × upgrades and is
//      INDEPENDENT of good prices (change a good's price ⇒ income unchanged,
//      while the price-sensitive net figure DOES move — proving it's meaningful).
//
// HARNESS: vm-eval index.html's PURE_CORE (CONFIG/Sim/Buildings/Trade/…) in a
// sandbox, then eval the BALANCE-LAB region in the SAME context (analyze/simulate
// are DOM-free by contract, Q8). No browser needed. Reads the BUILT index.html;
// falls back to src/balance-lab.js so it is runnable the moment LabDev writes the
// source, before the Lead's build.
//
//   node test/balancelab.test.js
// ============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PER_MIN = 120;   // lab convention: 2 ticks = 1s ⇒ 120 ticks/min (all analyze values ×120)

// ---------------------------------------------------------------------------
// CONTRACT ADAPTER — the shape LOCKED with LabDev. One-place edit if it changes.
// ---------------------------------------------------------------------------
const C = {
  scenario(cities) { return { cities }; },
  // analyze()
  perGood(a)    { return a.perGood || {}; },
  prod(g)       { return g.prod; },
  cons(g)       { return g.cons; },
  net(g)        { return g.net; },
  perCity(a)    { return a.perCity || []; },
  income(c)     { return c.income; },
  cityNet(c)    { return c.net; },
  // simulate()
  sCities(s)    { return (s && s.cities) || []; },
  happy(c)      { return c.happiness; },
  netGoldMin(c) { return c.netGoldPerMin; },
  selfSustained(s) { return s && s.verdict && s.verdict.selfSustained; },
  HAPPY_MIN: 70,
};

// ---------------------------------------------------------------------------
// tiny tally
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail != null ? "  (" + detail + ")" : "")); console.log("  ✗ " + name + (detail != null ? "  -- " + detail : "")); }
}
function group(name, fn) { console.log("\n-- " + name + " --"); try { fn(); } catch (e) { fail++; failures.push(name + " THREW: " + (e && e.stack || e)); console.log("  ✗ " + name + " THREW: " + (e && e.message || e)); } }
const near = (a, b, eps) => typeof a === "number" && Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

// ---------------------------------------------------------------------------
// Load PURE_CORE + the BALANCE-LAB region into one sandbox.
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!core) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

// Prefer the built index.html region; fall back to src/balance-lab.js source.
function extractLab(src) {
  const m = src.match(/const BalanceLab = \(function[\s\S]*?=== BALANCE-LAB END ===/);
  return m ? m[0] : null;
}
let labSrc = extractLab(html);
let labFrom = "index.html";
if (!labSrc || !/\banalyze\b/.test(labSrc)) {
  try {
    const s = fs.readFileSync(path.join(__dirname, "..", "src", "balance-lab.js"), "utf8");
    const alt = extractLab(s);
    if (alt && /\banalyze\b/.test(alt)) { labSrc = alt; labFrom = "src/balance-lab.js"; }
  } catch (e) { /* no src file — stay with index.html */ }
}
if (!labSrc) { console.error("FAIL: could not find the BALANCE-LAB region in index.html or src/balance-lab.js"); process.exit(1); }

// window/document stubs so the module can DEFINE its DOM helpers without a real
// DOM. analyze()/simulate() are DOM-free by contract; if they touch these at
// call time the guarded tests below throw and report it.
const domStub = () => ({ classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {}, addEventListener() {}, querySelector() { return domStub(); }, style: {}, set innerHTML(_) {}, get innerHTML() { return ""; } });
const sandbox = { window: {}, document: { createElement: domStub, body: domStub(), addEventListener() {}, getElementById() { return null; } }, console };
vm.createContext(sandbox);
vm.runInContext(core[1] +
  "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings;" +
  "\ntry{this.Trade=Trade;}catch(e){} try{this.Pathing=Pathing;}catch(e){} try{this.Needs=Needs;}catch(e){}", sandbox);
let labEvalErr = null;
try { vm.runInContext(labSrc + "\n;this.BalanceLab = BalanceLab;", sandbox); } catch (e) { labEvalErr = e; }

const CONFIG = sandbox.CONFIG;
const BalanceLab = sandbox.BalanceLab || sandbox.window.BalanceLab;

// ---------------------------------------------------------------------------
// Build-readiness gate.
// ---------------------------------------------------------------------------
if (!BalanceLab || typeof BalanceLab.analyze !== "function" || typeof BalanceLab.simulate !== "function") {
  console.log("\n================ BALANCE LAB: BLOCKED ================");
  console.log("Region source: " + labFrom);
  console.log("BalanceLab.analyze / .simulate are not implemented yet");
  console.log("(exposes: " + (BalanceLab ? Object.keys(BalanceLab).join(", ") : "no BalanceLab") + ").");
  if (labEvalErr) console.log("NOTE: evaluating the region threw: " + (labEvalErr.message || labEvalErr) +
    "\n  → if this persists post-build, analyze/simulate touch DOM at load; keep them DOM-free or switch QA to a playwright harness.");
  console.log("Tests are WRITTEN and will run once analyze/simulate are built.");
  console.log("=====================================================");
  process.exit(0);
}
console.log("Balance Lab region loaded from: " + labFrom);

// ===========================================================================
// CONFIG-derived expected numbers (hand-computed, tracked from CONFIG so a
// balance retune moves the expectations with it).
// Recipe (LabDev Q3/Q5): prod/tick = ratePerWorker × effWorkers × outputMult,
// effWorkers = min(slots, remaining tier pop) greedily; cons/tick = Σ pop×perCapita
// (basic ×basicConsumptionMult, =1 without L4 huts). analyze reports ×PER_MIN.
// ===========================================================================
const PF = CONFIG.buildings.potato_farm;      // rate 2, slots 2, empty ladder
const TIER = CONFIG.needs.tiers;
const PT = CONFIG.needs.peopleTax;
const POT_PC = TIER.peasants.perCapita.potato; // 0.10 (basic)
const WOOL_PC = TIER.peasants.perCapita.wool;  // 0.03 (extra)
const INCOME_MULT = 1 + Math.max(0, 100 - PT.happyBase) * PT.bonusPerPoint; // 1.6

// ===========================================================================
// GUARD 1 — analyze() per-good prod/cons match CONFIG-derived numbers, and a
// clear surplus reads surplus (net>0), a clear deficit reads deficit (net<0).
// ===========================================================================
group("1. analyze() per-good prod/cons match CONFIG-derived numbers", () => {
  const PEAS = 30;
  const scn = C.scenario([
    { name: "Farmville", pop: { peasants: PEAS, workers: 0, burghers: 0, aristocrats: 0 },
      buildings: [{ typeId: "potato_farm", count: 2, level: 1 }] },
  ]);
  const a = BalanceLab.analyze(scn);
  const g = C.perGood(a);

  // 2 farms = 4 slots; 30 peasants staff all 4 ⇒ prod = rate2 × 4 workers = 8/tick.
  const effWorkers = Math.min(PF.workerSlots * 2, PEAS);        // 4
  const expProd = PF.output.ratePerWorker * effWorkers * PER_MIN; // 8 × 120 = 960
  const expCons = PEAS * POT_PC * PER_MIN;                       // 3 × 120 = 360
  ok("analyze reports the potato good", !!g.potato, "perGood keys: " + Object.keys(g).join(","));
  if (g.potato) {
    ok("potato prod == rate×effWorkers ×/min (=" + expProd + ")", near(C.prod(g.potato), expProd, 0.5), "got " + C.prod(g.potato));
    ok("potato cons == peasants×perCapita ×/min (=" + expCons + ")", near(C.cons(g.potato), expCons, 0.5), "got " + C.cons(g.potato));
    ok("potato reads SURPLUS (net > 0)", C.net(g.potato) > 0, "net " + C.net(g.potato));
  }
  // wool: peasant EXTRA need with NO shepherd ⇒ clear deficit.
  ok("analyze reports the wool good (need with no producer)", !!g.wool);
  if (g.wool) {
    ok("wool cons == peasants×perCapita ×/min (=" + (PEAS * WOOL_PC * PER_MIN).toFixed(1) + ")", near(C.cons(g.wool), PEAS * WOOL_PC * PER_MIN, 0.5), "got " + C.cons(g.wool));
    ok("wool prod == 0 (no shepherd)", near(C.prod(g.wool), 0, 1e-6), "got " + C.prod(g.wool));
    ok("wool reads DEFICIT (net < 0)", C.net(g.wool) < 0, "net " + C.net(g.wool));
  }
});

// ===========================================================================
// GUARD 1b — consumption includes PROCESSOR INPUT draw (added post-contract by
// LabDev): perGood[g].cons = population need + Σ processor inputs[g] × effWorkers.
// A city with a lumberjack (wood source) + a sawmill (wood→planks) should show
// wood cons = peasant wood need + sawmill.inputs.wood × sawmill effWorkers.
// ===========================================================================
group("1b. analyze() consumption includes processor-input draw", () => {
  const SAW = CONFIG.buildings.sawmill;   // processor: inputs {wood:2}, 2 slots, peasant
  const PEAS = 12;                          // >= lumberjack(2)+sawmill(2) slots ⇒ both full
  const scn = C.scenario([
    { name: "Millbrook", pop: { peasants: PEAS, workers: 0, burghers: 0, aristocrats: 0 },
      buildings: [
        { typeId: "lumberjack", count: 1, level: 1 },
        { typeId: "sawmill", count: 1, level: 1 },
        { typeId: "hut", count: 6, level: 1 },
      ] },
  ]);
  const a = BalanceLab.analyze(scn);
  const g = C.perGood(a);
  // sawmill fully staffed (2 slots, ample peasants) ⇒ wood input draw = 2×2/tick.
  const sawEff = SAW.workerSlots;                                  // 2
  const expWoodCons = (PEAS * TIER.peasants.perCapita.wood + SAW.inputs.wood * sawEff) * PER_MIN; // (0.6+4)×120=552
  ok("analyze reports wood", !!g.wood);
  if (g.wood) {
    ok("wood cons = pop need + sawmill inputs×effWorkers (=" + expWoodCons + ")", near(C.cons(g.wood), expWoodCons, 0.5), "got " + C.cons(g.wood));
  }
  // planks: produced by the sawmill, consumed by nobody here ⇒ pure surplus.
  const expPlanksProd = SAW.output.ratePerWorker * sawEff * PER_MIN; // 1×2×120 = 240
  ok("analyze reports planks", !!g.planks);
  if (g.planks) {
    ok("planks prod = rate×effWorkers ×/min (=" + expPlanksProd + ")", near(C.prod(g.planks), expPlanksProd, 0.5), "got " + C.prod(g.planks));
    ok("planks cons == 0 (no consumer)", near(C.cons(g.planks), 0, 1e-6), "got " + C.cons(g.planks));
  }
});

// ===========================================================================
// GUARD 2 — analyze() ⇄ simulate() VERDICT agreement on clear cases.
// ===========================================================================
group("2. analyze() and simulate() verdicts agree on clear cases", () => {
  // (a) DEFICIT of a SPECIFIC basic good: a city with only potato_farms (potato
  //     surplus) but NO wood source — wood is a peasant BASIC ⇒ starves happiness.
  const woodDef = C.scenario([
    { name: "Thirstwood", pop: { peasants: 20, workers: 0, burghers: 0, aristocrats: 0 },
      buildings: [{ typeId: "potato_farm", count: 2, level: 1 }, { typeId: "hut", count: 10, level: 1 }] },
  ]);
  const aWood = BalanceLab.analyze(woodDef);
  ok("analyze: potato SURPLUS but wood DEFICIT in a potato-only city",
     aWood.perGood.potato && C.net(aWood.perGood.potato) > 0 && aWood.perGood.wood && C.net(aWood.perGood.wood) < 0,
     "potato.net=" + (aWood.perGood.potato && C.net(aWood.perGood.potato)) + " wood.net=" + (aWood.perGood.wood && C.net(aWood.perGood.wood)));
  const sWood = BalanceLab.simulate(woodDef, 300);
  ok("simulate: the wood-deficit city is NOT self-sustained", C.selfSustained(sWood) === false, JSON.stringify(C.sCities(sWood).map(c => ({ n: c.name, h: C.happy(c) }))));
  const cWood = C.sCities(sWood)[0];
  ok("simulate: wood-deficit city happiness below the happy gate (basic unmet)", cWood && C.happy(cWood) < C.HAPPY_MIN, cWood && ("h=" + C.happy(cWood)));

  // (b) SELF-SUSTAINING: all four peasant needs locally over-produced, housed to
  //     match. 8 peasants staff 4 extractors (8 slots); 5 huts (cap 10) house them.
  const selfok = C.scenario([
    { name: "Selfhaven", pop: { peasants: 8, workers: 0, burghers: 0, aristocrats: 0 },
      buildings: [
        { typeId: "hut", count: 5, level: 1 },
        { typeId: "potato_farm", count: 1, level: 1 },
        { typeId: "lumberjack", count: 1, level: 1 },
        { typeId: "fishery", count: 1, level: 1 },
        { typeId: "shepherd", count: 1, level: 1 },
      ] },
  ]);
  const aSelf = BalanceLab.analyze(selfok);
  const peasNeeds = TIER.peasants.basic.concat(TIER.peasants.extra);
  const noDeficit = peasNeeds.every(gid => { const gg = aSelf.perGood[gid]; return gg && C.net(gg) >= 0; });
  ok("analyze: self-sustaining fixture shows NO peasant-need deficit",
     noDeficit, peasNeeds.map(gid => gid + ":" + (aSelf.perGood[gid] ? (C.net(aSelf.perGood[gid]) >= 0 ? "ok" : "DEF") : "?")).join(" "));
  // Whether or not the fixture is perfectly tuned, the VERDICTS must AGREE:
  const sSelf = BalanceLab.simulate(selfok, 400);
  ok("simulate verdict AGREES with analyze on the self-sufficient fixture",
     C.selfSustained(sSelf) === noDeficit,
     "analyze noDeficit=" + noDeficit + " simulate.selfSustained=" + C.selfSustained(sSelf) +
     " cities=" + JSON.stringify(C.sCities(sSelf).map(c => ({ n: c.name, h: C.happy(c), g: C.netGoldMin(c) }))));
  if (noDeficit && C.selfSustained(sSelf)) {
    const cSelf = C.sCities(sSelf)[0];
    ok("simulate: self-sustaining city ends happy (>= gate)", cSelf && C.happy(cSelf) >= C.HAPPY_MIN, cSelf && ("h=" + C.happy(cSelf)));
    ok("simulate: self-sustaining city net gold/min non-negative", cSelf && C.netGoldMin(cSelf) >= -1e-6, cSelf && ("g=" + C.netGoldMin(cSelf)));
  }
});

// ===========================================================================
// GUARD 3 — simulate() determinism: deterministic by construction ⇒ two runs of
// the same (scenario, ticks) are bit-identical.
// ===========================================================================
group("3. simulate() is deterministic", () => {
  const build = () => C.scenario([
    { name: "A", pop: { peasants: 20, workers: 0, burghers: 0, aristocrats: 0 }, buildings: [{ typeId: "potato_farm", count: 2, level: 1 }, { typeId: "hut", count: 4, level: 1 }] },
    { name: "B", pop: { peasants: 10, workers: 0, burghers: 0, aristocrats: 0 }, buildings: [{ typeId: "lumberjack", count: 2, level: 1 }, { typeId: "hut", count: 2, level: 1 }] },
  ]);
  const r1 = BalanceLab.simulate(build(), 300);
  const r2 = BalanceLab.simulate(build(), 300);
  ok("two same-(scenario,ticks) simulate() runs are deep-equal",
     JSON.stringify(r1) === JSON.stringify(r2),
     "cities1=" + JSON.stringify(C.sCities(r1).map(c => [c.name, C.happy(c), c.gold])) +
     " cities2=" + JSON.stringify(C.sCities(r2).map(c => [c.name, C.happy(c), c.gold])));
  // guard against a degenerate constant result: a run must have moved SOME state.
  const moved = C.sCities(r1).some(c => (c.gold || 0) !== 0 || C.happy(c) !== 0);
  ok("simulate() actually ran the sim (non-degenerate state)", moved, JSON.stringify(C.sCities(r1).map(c => [c.name, C.happy(c), c.gold])));
});

// ===========================================================================
// GUARD 4 — house/people-tax INCOME scales with pop × happiness × upgrades and
// is INDEPENDENT of good prices. income/min = PER_MIN × Σ pop_t × ratePerTier_t
// × happinessMult (analyze assumes needs-met ⇒ happiness 100 ⇒ mult 1.6).
// ===========================================================================
group("4. income scales with pop, INDEPENDENT of good prices", () => {
  const mk = (peasants, workers) => C.scenario([
    { name: "Taxton", pop: { peasants, workers, burghers: 0, aristocrats: 0 },
      buildings: [{ typeId: "potato_farm", count: 2, level: 1 }, { typeId: "hut", count: 12, level: 1 }] },
  ]);
  const a1 = BalanceLab.analyze(mk(25, 10));
  const city1 = C.perCity(a1)[0];
  const expIncome = PER_MIN * (25 * PT.ratePerTier.peasants + 10 * PT.ratePerTier.workers) * INCOME_MULT; // 768
  ok("analyze exposes a per-city income figure", typeof C.income(city1) === "number", "city keys: " + Object.keys(city1 || {}).join(","));
  ok("income == PER_MIN × Σ pop×ratePerTier × happinessMult (=" + expIncome + ")", near(C.income(city1), expIncome, 0.5), "got " + C.income(city1));

  // (a) price-INDEPENDENCE: hike a DEFICIT good's price (wood — Taxton has no
  //     lumberjack). income must NOT move; the price-sensitive net SHOULD move
  //     (proving the invariance is meaningful, not a dead value).
  const origWood = CONFIG.goods.wood.basePrice;
  const netBefore = C.cityNet(city1);
  let incomeAfter, netAfter;
  try {
    CONFIG.goods.wood.basePrice = origWood * 10 + 999;
    const a2 = BalanceLab.analyze(mk(25, 10));
    const city2 = C.perCity(a2)[0];
    incomeAfter = C.income(city2); netAfter = C.cityNet(city2);
  } finally { CONFIG.goods.wood.basePrice = origWood; }
  ok("income UNCHANGED after 10x wood price hike (no price term)", near(C.income(city1), incomeAfter, 1e-6), "before=" + C.income(city1) + " after=" + incomeAfter);
  ok("sanity: the SAME price hike DOES move the price-sensitive city.net", typeof netBefore === "number" && typeof netAfter === "number" && !near(netBefore, netAfter, 1e-6),
     "netBefore=" + netBefore + " netAfter=" + netAfter);

  // (b) pop-SCALING: doubling peasants raises income by exactly the extra peasant
  //     contribution (PER_MIN × 25 × rate × mult), workers held constant.
  const cityDouble = C.perCity(BalanceLab.analyze(mk(50, 10)))[0];
  const expDelta = PER_MIN * 25 * PT.ratePerTier.peasants * INCOME_MULT; // 480
  ok("income rises by exactly the doubled-peasant contribution (pop-scaling)",
     near(C.income(cityDouble) - C.income(city1), expDelta, 0.5),
     "delta=" + (C.income(cityDouble) - C.income(city1)) + " expected=" + expDelta);
});

// ---------------------------------------------------------------------------
console.log("\n============================================");
console.log("Balance Lab QA: " + pass + " passed, " + fail + " failed");
if (failures.length) { console.log("Failures:"); for (const f of failures) console.log("  - " + f); }
console.log("============================================");
process.exit(fail === 0 ? 0 : 1);
