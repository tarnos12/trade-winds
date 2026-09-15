// === SIM-CORE START ===  (T4 / slot #2 — production + consumption economy tick)
// Pure, deterministic economy step (GDD §4.3, §5). No DOM / canvas / I/O — the
// only inputs are the passed State + the constant CONFIG; the only effect is
// mutating the towns in State. Composes with the T5 price model (Sim.priceFor)
// and the shared Town contract. Runs headless (test/sim.test.js) and is wired
// into the 500ms×gameSpeed accumulator in the browser loop. Same state in ⇒ same
// state out (no Math.random, no time) so it is safe to fast-forward / autoplay.

// Needs / population constants — merged non-destructively into CONFIG so this
// composes with the Phase-1 CONFIG and the T5 goods/prices merge.
Object.assign(CONFIG, {
  needs: {
    // === CC: PER-TIER needs model (supersedes the old global basicNeeds/extraNeeds
    // + flat perCapita). A good's CLASS (basic vs luxury) is now tier-specific — the
    // same good can be a BASIC need for one tier and a LUXURY for another (e.g. mead
    // is a worker LUXURY but a citizen+aristocrat BASIC). Each tier declares its own
    // basic[] / extra[] lists + perCapita rates. Author's DEFINITIVE NEEDS MATRIX. ===
    //   BASIC needs floor happiness at ~basicHappy (70) when met; missing drops below.
    //   EXTRA (luxury) needs add the remaining extraHappy (+30 ⇒ ~100) AND gate that
    //   tier's population GROWTH (all luxuries must be available to grow).
    tiers: {
      // v0.51 balance rework — per-capita consumption expressed in GAME-MINUTES / 120
      // (2 ticks = 1 game-second). Peasant anchor: 1.3 potato/min + 0.9 wood/min.
      // Other tiers' basics ~1.08/min (0.009), all extras ~0.6/min (0.005).
      peasants:    { basic: ["potato", "wood"], extra: ["fish", "wool"],
                     perCapita: { potato: 0.010833, wood: 0.0075, fish: 0.005, wool: 0.005 } },
      workers:     { basic: ["fish", "coal"], extra: ["clothes", "bread", "mead"],
                     perCapita: { fish: 0.009, coal: 0.009, clothes: 0.005, bread: 0.005, mead: 0.005 } },
      burghers:    { basic: ["lamp", "bread", "mead", "clothes"], extra: ["chairs", "pottery", "gold_ring"],
                     perCapita: { lamp: 0.009, bread: 0.009, mead: 0.009, clothes: 0.009, chairs: 0.005, pottery: 0.005, gold_ring: 0.005 } },
      aristocrats: { basic: ["lamp", "mead", "iron_armor", "chairs", "pottery"], extra: ["brandy", "luxury_clothes", "gold_ring"],
                     perCapita: { lamp: 0.009, mead: 0.009, iron_armor: 0.009, chairs: 0.009, pottery: 0.009, brandy: 0.005, luxury_clothes: 0.005, gold_ring: 0.005 } },
    },
    // Happiness mapping: happiness = basicHappy·basicSat + extraHappy·extraSat.
    //   basics met (basicSat 1) ⇒ 70; +extras met (extraSat 1) ⇒ +30 ⇒ 100.
    basicHappy: 70,
    extraHappy: 30,
    // === CC: 70% happiness = FULL housing/worker capacity. Below 70 scales the
    // population target DOWN (target = round(cap × min(1, happiness/capacityFullAt)));
    // at/above 70 = full capacity, and the surplus happiness pays extra people-tax. ===
    capacityFullAt: 70,
    // v0.50: even a house with NO food/wood shelters a small core workforce, so a
    // fresh (or starved) city never sits at exactly 0 workers — floor = this fraction
    // of the tier's housing capacity, at least 1 whenever there is any capacity.
    // But at real 0-happiness (basics unmet) that crew runs on a DUTY CYCLE: present
    // for `onCycles` of every (on+off) cycles, absent otherwise — so a starved city
    // gets just enough intermittent labour to bootstrap food/wood, not a free crew.
    // A cycle is `cycleTicks` (16 ticks ≈ 8 game-seconds ≈ one extractor batch).
    emptyHouseFrac: 0.10, emptyHouseCycleTicks: 16, emptyHouseOnCycles: 1, emptyHouseOffCycles: 3,
    growthThreshold: 0.9999, // extra-need availability at/above this => a tier may grow
    declineThreshold: 0.5,   // sustained satisfaction below this => decline
    declineAfterTicks: 3,    // consecutive low ticks before a tier declines
    growthRate: 0.03,        // fraction of the gap to target a tier gains per tick
    declineRate: 0.05,       // fraction of a tier's population lost per decline tick
    // Work efficiency from happiness (0..100): factor = effMin + (h/100)*(effMax-effMin).
    effMin: 0.5, effMax: 1.2,
    happyEase: 0.10,         // lerp toward the happiness target each tick (anti-jump)
    // === SAWTOOTH FIX (post-victory happiness plateau) === Happiness reads whether
    // the population's demand was MET this tick (per-good satisfaction gsat = consumed
    // / required). Inter-city imports arrive in BURSTS — a cart dumps a load, stock
    // spikes, then drains to ~0 before the next cart — so a good's instantaneous gsat
    // sawtooths (1 when freshly stocked, <1 when the shelf momentarily empties), and
    // happiness inherits it (~56↔99 on a supplied aristocrat estate). We feed
    // happiness a SMOOTHED per-good satisfaction: a moving average (EMA) of gsat kept
    // on the town (town.satEMA), so momentary between-cart dips don't crater happiness
    // while a genuinely under-supplied good (gsat low for a sustained stretch) still
    // pulls the average — and happiness — down. A soft low-pass strictly REDUCES
    // variance (it cannot resonate/amplify like a hard reserve), and it is
    // mean-preserving: a truly supplied estate (gsat≈1) still averages to ~100, so the
    // win threshold is unaffected and scarcity is not trivialized. The EMA is
    // SNAP-initialised (first sample = gsat), so the first tick and any steady/
    // plentiful state are bit-identical to the old instantaneous model — only bursty
    // transients are smoothed. satSmoothing is the EMA weight on the NEW sample per
    // tick (smaller ⇒ smoother / longer memory); it composes with happyEase below to
    // form a two-stage low-pass. This channel affects HAPPINESS only — consumption,
    // stock, prices, trade and pop capacity are untouched.
    satSmoothing: 0.05,      // EMA weight for the per-good satisfaction feeding happiness

    // === CC: people-tax — every tier produces ONLY gold (tax); higher tiers pay
    // MORE per capita (ratePerTier). At happyBase the multiplier is 1; every point
    // above happyBase adds bonusPerPoint (so happier cities fund trade faster).
    // goldPerPop is the legacy fallback (peasant rate; keeps single-tier tests exact).
    peopleTax: { ratePerTier: { peasants: 0.10, workers: 0.15, burghers: 0.22, aristocrats: 0.40 },
                 goldPerPop: 0.10, happyBase: 70, bonusPerPoint: 0.02 },
  },
});

// === CC: pure Needs helpers over CONFIG.needs.tiers. Consumers that CLASSIFY a
// good per tier read tier(k).basic/.extra; consumers that only test union
// membership ("is this good a need at all") use allBasic()/allExtra(). Never use
// the union for per-tier classification (mead/clothes are dual-role). ===
var Needs = {
  tierKeys() { return ["peasants", "workers", "burghers", "aristocrats"]; },
  tier(k) { return (CONFIG.needs.tiers && CONFIG.needs.tiers[k]) || { basic: [], extra: [], perCapita: {} }; },
  allBasic() { const s = new Set(); for (const k of Needs.tierKeys()) for (const g of Needs.tier(k).basic) s.add(g); return [...s]; },
  allExtra() { const s = new Set(); for (const k of Needs.tierKeys()) for (const g of Needs.tier(k).extra) s.add(g); return [...s]; },
  classOf(k, gid) { const t = Needs.tier(k); if (t.basic.indexOf(gid) >= 0) return "basic"; if (t.extra.indexOf(gid) >= 0) return "extra"; return "none"; },
};
// Back-compat UNION aliases (union-membership tests ONLY — cart tooltip / speech
// bubbles / kingdom stats). These are deduped unions; NEVER use for classification.
CONFIG.needs.basicNeeds = Needs.allBasic();
CONFIG.needs.extraNeeds = Needs.allExtra();

// singular workerTier/houseTier -> plural pop bucket key (mirrors BUILDINGS_TIER_KEY).
const SIM_TIER_KEY = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };

// === MISSION-STATS (U) === deterministic, save-persisted lifetime counters that
// the mission engine (Tutorial) reads to evaluate objectives. PURE data — no RNG,
// no DOM, no time; every increment is driven by a real game event (a build/upgrade
// completing, a trade unloading, a tariff banked). `ensureStats` initialises the
// shape and migrates old saves (which have no `state.stats`) defensively, so it is
// safe to call at the top of any tick. Owned by EngineDev; shared read contract in
// docs/proposals/MISSION_EDITOR_BRIEF.md.
Sim.ensureStats = function (state) {
  if (!state) return { constructed: { total: 0, byType: {} }, upgraded: { total: 0, byType: {} }, traded: { byGood: {} }, taxEarned: 0 };
  let st = state.stats;
  if (!st || typeof st !== "object") st = {};
  if (!st.constructed || typeof st.constructed !== "object") st.constructed = { total: 0, byType: {} };
  if (typeof st.constructed.total !== "number") st.constructed.total = 0;
  if (!st.constructed.byType || typeof st.constructed.byType !== "object") st.constructed.byType = {};
  if (!st.upgraded || typeof st.upgraded !== "object") st.upgraded = { total: 0, byType: {} };
  if (typeof st.upgraded.total !== "number") st.upgraded.total = 0;
  if (!st.upgraded.byType || typeof st.upgraded.byType !== "object") st.upgraded.byType = {};
  if (!st.traded || typeof st.traded !== "object") st.traded = { byGood: {} };
  if (!st.traded.byGood || typeof st.traded.byGood !== "object") st.traded.byGood = {};
  if (typeof st.taxEarned !== "number") st.taxEarned = 0;
  state.stats = st;
  return st;
};
// Increment the "building constructed" counter (built false→true). typeId optional.
Sim.statConstructed = function (state, typeId) {
  const st = Sim.ensureStats(state);
  st.constructed.total += 1;
  if (typeId) st.constructed.byType[typeId] = (st.constructed.byType[typeId] || 0) + 1;
};
// Increment the "building upgrade applied" counter (upgradeLevel incremented).
Sim.statUpgraded = function (state, typeId) {
  const st = Sim.ensureStats(state);
  st.upgraded.total += 1;
  if (typeId) st.upgraded.byType[typeId] = (st.upgraded.byType[typeId] || 0) + 1;
};
// Add `units` of good `gid` delivered into a buyer's stock by a trade unload.
Sim.statTraded = function (state, gid, units) {
  if (!(units > 0) || !gid) return;
  const st = Sim.ensureStats(state);
  st.traded.byGood[gid] = (st.traded.byGood[gid] || 0) + units;
};
// Add `amount` of tariff/tax banked into the treasury.
Sim.statTaxEarned = function (state, amount) {
  if (!(amount > 0)) return;
  const st = Sim.ensureStats(state);
  st.taxEarned += amount;
};
// === /MISSION-STATS ===

// === MISSION-ENGINE (U) === PURE, browser-free evaluator for the data-driven
// mission system. It reads the lifetime `state.stats` counters (above) and a
// mission-set (the DEFAULT below or the player's authored JSON) and reports, per
// mission, whether it is active/complete and each objective's progress. No DOM, no
// RNG, no time — deterministic and testable in the vm sandbox alongside Sim/Trade.
// The DOM runtime (Tutorial, in the browser shell) owns activation snapshots +
// rendering; ALL evaluation logic lives here so it can be unit-tested headless.
//
// Schema + objective types are the contract in docs/proposals/MISSION_EDITOR_BRIEF.md.
var MissionEngine = (typeof MissionEngine !== "undefined" && MissionEngine) || {};

// Schema version this engine speaks.
MissionEngine.VERSION = 1;

// Accept EITHER a bare stats object ({constructed,upgraded,traded,taxEarned}) OR a
// full game state ({stats:{…}}) anywhere a "stats" arg is taken — callers in the
// pure tests pass stats directly; the DOM runtime passes state. `null`/missing → {}.
MissionEngine.statsOf = function (x) {
  if (!x || typeof x !== "object") return {};
  return (x.stats && typeof x.stats === "object") ? x.stats : x;
};

// The lifetime counter value an objective reads out of `state.stats` (raw, pre-baseline).
MissionEngine.readLifetime = function (obj, statsOrState) {
  if (!obj) return 0;
  const stats = MissionEngine.statsOf(statsOrState);
  const c = stats.constructed || {}, u = stats.upgraded || {};
  const cBy = c.byType || {}, uBy = u.byType || {};
  const tr = (stats.traded && stats.traded.byGood) || {};
  switch (obj.type) {
    case "construct": return (obj.building && obj.building !== "any") ? (cBy[obj.building] || 0) : (c.total || 0);
    case "upgrade":   return (obj.building && obj.building !== "any") ? (uBy[obj.building] || 0) : (u.total || 0);
    case "trade_good": return tr[obj.good] || 0;
    case "earn_tax":   return stats.taxEarned || 0;
    default: return 0;
  }
};

// The target an objective must reach (count for most; amount for earn_tax).
MissionEngine.objectiveTarget = function (obj) {
  if (!obj) return 0;
  return obj.type === "earn_tax" ? (obj.amount || 0) : (obj.count || 0);
};

// One objective's progress given the lifetime stats and its baseline (the counter
// value snapshotted at mission activation; 0 for retroactive objectives). Returns
// { type, cur, target, met } where cur is clamped at ≥0 (never negative). `stats`
// may be a bare stats object or a full state (see statsOf).
MissionEngine.objectiveProgress = function (obj, stats, baseline) {
  const life = MissionEngine.readLifetime(obj, stats);
  const target = MissionEngine.objectiveTarget(obj);
  const cur = Math.max(0, life - (baseline || 0));
  return { type: obj ? obj.type : null, cur: cur, target: target, met: cur >= target };
};

// Is a single objective satisfied? Convenience over objectiveProgress.
MissionEngine.objectiveMet = function (obj, stats, baseline) {
  return MissionEngine.objectiveProgress(obj, stats, baseline).met;
};

// Is a whole mission complete? ALL objectives met under the given per-objective
// `baseline` array (retroactive missions ignore baseline → read from 0). Note this
// checks the mission's OWN objectives only, NOT prereq gating — use evaluate() for
// prereq-aware activation/completion across a set. `stats` may be stats or state.
MissionEngine.missionComplete = function (mission, stats, baseline) {
  if (!mission || !Array.isArray(mission.objectives)) return false;
  const retro = mission.retroactive !== false;
  return mission.objectives.every((obj, i) => {
    const base = retro ? 0 : ((baseline && typeof baseline[i] === "number") ? baseline[i] : MissionEngine.readLifetime(obj, stats));
    return MissionEngine.objectiveMet(obj, stats, base);
  });
};

// Normalise a mission-set into a safe { version, missions:[...] } shape. Rejects a
// malformed set (returns null) so callers can fall back to the DEFAULT.
MissionEngine.normalize = function (set) {
  if (!set || typeof set !== "object" || !Array.isArray(set.missions)) return null;
  const missions = [];
  for (const m of set.missions) {
    if (!m || typeof m !== "object" || typeof m.id !== "string") continue;
    missions.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : m.id,
      icon: typeof m.icon === "string" ? m.icon : "🎯",
      pos: (m.pos && typeof m.pos === "object") ? { col: m.pos.col | 0, row: m.pos.row | 0 } : { col: 0, row: 0 },
      retroactive: m.retroactive !== false,             // DEFAULT true
      prereqs: Array.isArray(m.prereqs) ? m.prereqs.filter(x => typeof x === "string") : [],
      objectives: Array.isArray(m.objectives) ? m.objectives.filter(o => o && typeof o.type === "string") : [],
    });
  }
  return { version: set.version | 0 || MissionEngine.VERSION, missions: missions };
};

// Evaluate a whole mission-set against the lifetime stats.
//   opts.baselines : { [missionId]: number[] } — per-objective lifetime value
//                    snapshotted when the mission ACTIVATED. Used only for
//                    non-retroactive missions; retroactive missions read from 0.
//                    When a non-retroactive mission has no baseline yet (not
//                    activated), its objectives read from the CURRENT lifetime
//                    (progress 0), so it cannot complete until the runtime snapshots.
// Returns { byId, missions:[{id,name,icon,active,complete,prereqsMet,objectives:[…]}],
//           activeIds, completeIds, allComplete }.
// Completion propagates through prereqs via a bounded fixpoint (missions form a DAG).
MissionEngine.evaluate = function (missionSet, statsOrState, opts) {
  opts = opts || {};
  const stats = MissionEngine.statsOf(statsOrState);
  const set = MissionEngine.normalize(missionSet) || { missions: [] };
  const missions = set.missions;
  const baselines = opts.baselines || {};
  const res = {};
  for (const m of missions) res[m.id] = { id: m.id, name: m.name, icon: m.icon, prereqsMet: false, complete: false, active: false, objectives: [] };

  for (let iter = 0; iter <= missions.length; iter++) {
    let changed = false;
    for (const m of missions) {
      const r = res[m.id];
      const prereqsMet = (m.prereqs || []).every(pid => res[pid] ? res[pid].complete : false);
      const retro = m.retroactive !== false;
      const mb = baselines[m.id];
      const objs = (m.objectives || []).map((obj, i) => {
        let base = 0;
        if (!retro) base = (mb && typeof mb[i] === "number") ? mb[i] : MissionEngine.readLifetime(obj, stats);
        return MissionEngine.objectiveProgress(obj, stats, base);
      });
      const allMet = objs.length > 0 ? objs.every(o => o.met) : true;
      const complete = prereqsMet && allMet;
      const active = prereqsMet && !complete;
      if (r.prereqsMet !== prereqsMet || r.complete !== complete || r.active !== active) changed = true;
      r.prereqsMet = prereqsMet; r.complete = complete; r.active = active; r.objectives = objs;
    }
    if (!changed) break;
  }

  const list = missions.map(m => res[m.id]);
  return {
    byId: res,
    missions: list,
    activeIds: list.filter(r => r.active).map(r => r.id),
    completeIds: list.filter(r => r.complete).map(r => r.id),
    allComplete: missions.length > 0 && list.every(r => r.complete),
  };
};

// The bundled DEFAULT mission set — the original 5-mission onboarding arc ported to
// typed objectives (construct/upgrade/trade_good/earn_tax). Steps that don't map to
// a counter (found town, lay road, unlock tech, victory) use the CLOSEST objective.
// All retroactive (default) so a returning player's lifetime progress counts; the
// prereq chain m1→m2→m3→m4→m5 preserves the original ordered progression.
MissionEngine.DEFAULT = {
  version: 1,
  missions: [
    { id: "m1", name: "Found Your Realm", icon: "🏰", pos: { col: 0, row: 0 }, retroactive: true, prereqs: [],
      objectives: [
        { type: "construct", building: "any", count: 1 },   // place your first building
        { type: "construct", building: "any", count: 3 },   // a small settlement (resource + house + more)
      ] },
    { id: "m2", name: "A Growing Town", icon: "🌾", pos: { col: 1, row: 0 }, retroactive: true, prereqs: ["m1"],
      objectives: [
        { type: "construct", building: "sawmill", count: 1 }, // build a workshop (processor)
        { type: "upgrade",   building: "any",     count: 1 }, // raise a building a level
      ] },
    { id: "m3", name: "Trade Routes", icon: "🛣", pos: { col: 2, row: 0 }, retroactive: true, prereqs: ["m2"],
      objectives: [
        { type: "trade_good", good: "potato", count: 20 },  // goods flow between towns
        { type: "earn_tax",   amount: 200 },                // your first tariffs
      ] },
    { id: "m4", name: "The King's Works", icon: "🔬", pos: { col: 3, row: 0 }, retroactive: true, prereqs: ["m3"],
      objectives: [
        { type: "construct", building: "any", count: 8 },   // a productive realm to fund the King's works
        { type: "upgrade",   building: "any", count: 3 },   // advance your buildings
      ] },
    { id: "m5", name: "The Good Life", icon: "👑", pos: { col: 4, row: 0 }, retroactive: true, prereqs: ["m4"],
      objectives: [
        { type: "construct", building: "manor",          count: 1 },  // raise a citizen (burgher) class
        { type: "construct", building: "aristocrat_home", count: 1 }, // the top of the economy
        { type: "earn_tax",  amount: 2000 },                          // a thriving kingdom
      ] },
  ],
};

// Alias: the Lead/QA referred to this pure module as `Missions`; expose both names
// (same object) so tests can capture either from the vm sandbox.
var Missions = MissionEngine;
// === /MISSION-ENGINE ===

// Advance the whole economy by one tick. Mutates every town in State.towns:
//   worker assignment → production → consumption → happiness → population → prices.
//
// Sim OWNS worker assignment: buildings are placed with `workers:0` and this
// function derives each producer's effective `workers` every tick by distributing
// each tier's live population (peasants→extractors, workers→processors, …) across
// the buildings that accept it, capped by each building's `workerSlots`. Population
// itself is generated FROM HOUSING: each tier grows toward
//   capacity(peasant) = CONFIG.town.baseWorkers.peasants + housing.peasants
//   capacity(worker)  = housing.workers ; capacity(burgher) = housing.burghers
// (housing from Buildings.housingCapacity) when that tier's needs are met, and
// shrinks when they are not — so workers/burghers only appear once the matching
// cottages/manors exist AND food (+beer/+clothes) is satisfied.
Sim.tick = function (State) {
  if (!State || !State.towns) return State;
  // Global tick counter (drives happyMods expiry). One increment per economy
  // step, shared by every town — EC-C pushes {delta, untilTick: State.tick+n}.
  State.tick = ((typeof State.tick === "number" && isFinite(State.tick)) ? State.tick : 0) + 1;
  Sim.ensureStats(State);   // MISSION-STATS: guarantee the counter shape exists (migrate old saves)
  const N = CONFIG.needs;
  const base = (CONFIG.town && CONFIG.town.baseWorkers) || {};
  const clamp0 = (x) => (x > 0 ? x : 0);
  // === GRAN: bulk-production release intervals (whole-unit batches). Per-kind
  // interval (GAME-SECONDS) from CONFIG.econ.productionIntervalSec; fall back to
  // the design defaults only if the key is ever absent. intervalTicks = intervalSec
  // × (1000/baseTickMs) (= ×2 at the 500ms base step). A kind not listed ⇒ 0 ⇒
  // release whole units every tick.
  const baseTickMs = (CONFIG.econ && CONFIG.econ.baseTickMs) || 500;
  const prodIntervalSec = (CONFIG.econ && CONFIG.econ.productionIntervalSec) || { extractor: 8, processor: 12 };
  // v0.51 §1: cycle length is PER-BUILDING when the type declares `cycleSec`
  // (e.g. lumberjack = 4s → the reference "8 wood / 4s at 2 workers"); otherwise it
  // falls back to the per-kind default. Batch = ratePerWorker × workers × cycleSeconds.
  const intervalTicksFor = (type) => {
    const sec = (type && typeof type.cycleSec === "number") ? type.cycleSec
              : (prodIntervalSec[type && type.kind] || 0);
    return Math.round(sec * (1000 / baseTickMs));
  };

  for (const town of State.towns) {
    if (!town) continue;
    // v0.51: a city UNDER CONSTRUCTION (built === false) is dormant — no production,
    // consumption, population, porters, trade or tax — until its build timer elapses.
    // Only a freshly-FOUNDED city is built:false; a city level-upgrade never sets it,
    // so an established city keeps working while it upgrades. Legacy/test towns omit
    // the flag (built === undefined) and are treated as already built.
    if (town.built === false) {
      town._buildT = (town._buildT || 0) + 1;
      const buildTicks = Math.max(1, Math.round(((CONFIG.town && CONFIG.town.buildSec) || 10) * (1000 / baseTickMs)));
      if (town._buildT >= buildTicks) { town.built = true; town._buildT = buildTicks; }
      else continue;   // still building — skip everything else this tick
    }
    if (!town.stock) town.stock = {};
    if (!town.pop) town.pop = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };  // === CC: 4th tier ===
    const stock = town.stock;
    const pop = town.pop;
    // === PP-A === city ledger: snapshot the flows accumulated since the last tick
    // (prev tick's tax + Trade sales/buys + give/take transfers) and sample gold,
    // then reset the tally so THIS tick's flows accumulate into it. Save-safe.
    if (typeof Ledger !== "undefined") Ledger.sample(town);
    // === /PP-A ===
    const buildings = Array.isArray(town.buildings) ? town.buildings : [];
    const demand = {};                 // rebuilt every tick (drives Sim.priceFor)
    const addDemand = (g, amt) => { if (amt > 0) demand[g] = (demand[g] || 0) + amt; };

    // Work efficiency from the PREVIOUS tick's happiness (default 100 => 1.2x).
    const h = (typeof town.happiness === "number") ? town.happiness : 100;
    const hf = N.effMin + (Math.min(100, Math.max(0, h)) / 100) * (N.effMax - N.effMin);

    // --- 0. Worker assignment (derived every tick) ---------------------
    // Greedy, deterministic fill in building array order: each producer draws
    // from its tier's remaining labour pool, up to workerSlots. Houses (and any
    // building without a workerTier) get 0. Sim WRITES b.workers here.
    const pool = {
      peasant: pop.peasants || 0,
      worker:  pop.workers  || 0,
      burgher: pop.burghers || 0,
      aristocrat: pop.aristocrats || 0,   // === CC: aristocrats staff nothing (no aristocrat producers) — harmless ===
    };
    // === CB-A: unbuilt buildings get no workers; effective slots subtract
    // closedSlots; PRIORITY-true buildings are staffed first (two passes, in
    // array order within each pass → deterministic). Legacy buildings lacking
    // `built` are treated as built (b.built !== false).
    const assignWorkers = (b) => {
      if (!b) return;
      if (b.built === false) { b.workers = 0; return; }   // under construction
      const type = CONFIG.buildings[b.typeId];
      if (!type || type.kind === "house" || !type.workerTier || !(type.workerSlots > 0)) {
        b.workers = 0; return;
      }
      // === RU-A: upgrade slotPlus adds effective worker slots ===
      const slotPlus = (Buildings.upgradeEffect ? (Buildings.upgradeEffect(b).slotPlus || 0) : 0);
      const eff = Math.max(0, type.workerSlots + slotPlus - (b.closedSlots || 0));
      // === /RU-A ===
      const tier = type.workerTier;
      const avail = pool[tier] || 0;
      const take = Math.min(eff, avail);
      b.workers = take > 0 ? take : 0;
      pool[tier] = avail - b.workers;
    };
    for (const b of buildings) if (b && b.priority) assignWorkers(b);
    for (const b of buildings) if (!b || !b.priority) assignWorkers(b);
    // === /CB-A ===

    // === CB-A/RU-A: construction + upgrade delivery — RUNS BEFORE PRODUCTION.
    // WOODFIX (batch-2 E/G+D-root): this block MUST precede the production step
    // below. Production consumes shared inputs (wood → planks, etc.) straight out
    // of town.stock; when it ran first it drained the very materials a build/
    // upgrade needs, so a town with a running sawmill (or any input-eating
    // processor) left construction only the per-tick *leftover* wood — builds/
    // upgrades crawled or stalled ("full of planks, sheep farm builds slowly for
    // lack of wood") even while imported wood kept arriving, because the sawmill
    // ate each fresh shipment before the delivery step saw it, AND pending
    // upgrades (Buildings.startUpgrade → pendingUpgrade) looked "dead" for the
    // same reason. Giving construction/upgrades FIRST claim on stock fixes both;
    // production below simply works with whatever inputs remain. Determinism is
    // unchanged (no RNG here) — only the stock-claim ORDER moved.
    //
    // Move construction materials from the town's own stock into each building
    // that is still under construction (built:false), up to a shared per-tick
    // budget (CONFIG.town.deliveryRate). Priority-true buildings are filled
    // first (two-pass, array order → deterministic). A building whose remaining
    // need reaches empty flips to built:true. EVERY unbuilt building's remaining
    // need (whether or not the budget reached it this tick) is added to the town
    // demand, so the external trader buys the materials the city cannot yet make.
    // Delivery also feeds pending upgrades (shared budget). Targets are built
    // priority-first WITHIN each kind: unbuilt-priority, upgrade-priority,
    // unbuilt-nonpriority, upgrade-nonpriority. When no upgrades are pending the
    // sequence is identical to the CB-A construction order.
    {
      // === PP-A === per-transporter delivery: the shared budget scales with the
      // town's internal-hauler count (deliveryRate × transporterCount(town)).
      let budget = ((CONFIG.town && CONFIG.town.deliveryRate) || 5)
        * ((typeof Buildings !== "undefined" && Buildings.transporterCount) ? Buildings.transporterCount(town) : 1);
      // === /PP-A ===
      const targets = [];   // { b, kind: "build" | "upgrade" }
      for (const b of buildings) if (b && b.built === false && b.priority) targets.push({ b, kind: "build" });
      for (const b of buildings) if (b && b.pendingUpgrade && b.priority)   targets.push({ b, kind: "upgrade" });
      for (const b of buildings) if (b && b.built === false && !b.priority) targets.push({ b, kind: "build" });
      for (const b of buildings) if (b && b.pendingUpgrade && !b.priority)  targets.push({ b, kind: "upgrade" });
      for (const t of targets) {
        const b = t.b;
        if (t.kind === "build" && !b.delivered) b.delivered = {};
        if (t.kind === "upgrade" && !b.pendingUpgrade.delivered) b.pendingUpgrade.delivered = {};
        const dst = t.kind === "build" ? b.delivered : b.pendingUpgrade.delivered;
        const need = t.kind === "build" ? Buildings.constructionNeed(b) : Buildings.upgradeConstructionNeed(b);
        for (const gid in need) {
          if (budget <= 0) break;
          const have = stock[gid] || 0;
          const move = Math.min(need[gid], have, budget);
          if (move > 0) { stock[gid] = have - move; dst[gid] = (dst[gid] || 0) + move; budget -= move; }
        }
        const remain = t.kind === "build" ? Buildings.constructionNeed(b) : Buildings.upgradeConstructionNeed(b);
        let matDone = true;
        for (const gid in remain) { matDone = false; addDemand(gid, remain[gid]); }
        if (t.kind === "build") {
          // v0.49: timed construction. Advance the build timer by this tick's seconds,
          // but CAPPED at deliveredFrac×buildTime so delivery limits how far it builds
          // (8/10 wood ⇒ stalls at 80%). Finish only when materials AND time are done.
          const bt = (Buildings.buildTime ? Buildings.buildTime(b) : 6);
          const rc = Buildings.resourceCost(CONFIG.buildings[b.typeId]);
          let need = 0, have = 0; const dv = b.delivered || {};
          for (const gid in rc) { need += rc[gid]; have += Math.min(rc[gid], dv[gid] || 0); }
          const dFrac = need > 0 ? have / need : 1;
          const tickSec = baseTickMs / 1000;
          b._buildT = Math.min((b._buildT || 0) + tickSec, dFrac * bt);
          if (dFrac >= 1 - 1e-9 && (b._buildT || 0) >= bt - 1e-9) { b.built = true; Sim.statConstructed(State, b.typeId); }   // MISSION-STATS: construction complete
        } else if (matDone) {
          b.upgradeLevel = b.pendingUpgrade.toLevel; b.pendingUpgrade = null; Sim.statUpgraded(State, b.typeId);   // MISSION-STATS: upgrade applied
        }
      }
    }
    // === /CB-A + /RU-A (moved above production by WOODFIX) ============

    // --- 1. Production (GRAN: fractional carry + whole-unit BULK release) ------
    // Each producing building BANKS its per-tick output into a float accumulator
    // (b._prodAcc) and, for processors, its per-tick input draw into b._inAcc — no
    // stock moves per tick. A per-building countdown (b._prodTimer, started at
    // intervalTicks and thus STAGGERED by build time) RELEASES Math.floor of each
    // accumulator into/out of town.stock every intervalTicks, carrying the
    // fractional remainder to the next batch — so town.stock only ever moves in
    // WHOLE units while the underlying economy math stays fractional and smooth
    // (e.g. lumberjack 0.5/tick × 16 ticks = 8.0 → +8 wood every 8s; a leftover
    // 0.5 carries so the next batch is 8, matching the "2.5/s ⇒ 2 then 3" design).
    // Interval 0 (a kind not listed) releases whole units every tick. Determinism
    // is unchanged: no RNG here, and the accumulators/timer are pure functions of
    // state (default 0 / intervalTicks) initialised deterministically.
    for (const b of buildings) {
      if (!b || b.built === false) continue;   // CB-A: unbuilt buildings don't produce; !b guards a null array element (matches assignWorkers/target-loop siblings) so a corrupt entry can't deref null → throw
      const type = CONFIG.buildings[b.typeId];
      if (!type || !type.output) continue;
      const out = type.output;
      const inputs = type.inputs;
      const intervalTicks = intervalTicksFor(type);
      if (typeof b._prodTimer !== "number") b._prodTimer = intervalTicks;
      if (typeof b._prodAcc !== "number") b._prodAcc = 0;
      if (inputs && (!b._inAcc || typeof b._inAcc !== "object")) b._inAcc = {};

      // v0.51 §2: per-building output-buffer cap (shared by the stall gate + release).
      const storeCap = (type.storeCap) || (CONFIG.econ && CONFIG.econ.buildingStoreCap) || 30;
      // v0.51: a PRODUCER being upgraded stops producing while the upgrade is pending
      // (houses have no output loop, so they keep functioning — matching the design:
      // "upgrading production buildings stops them; houses always function"). Its store
      // still exists for porters to drain.
      const w = b.pendingUpgrade ? 0 : (b.workers || 0);
      if (w > 0) {
        // Inputs cap effective workers (throttled against stock NOT YET claimed by
        // this building's banked-but-unreleased draw); record full desired input as
        // demand every tick, exactly as the per-tick model did.
        let effW = w;
        if (inputs) {
          for (const gid in inputs) {
            const qty = inputs[gid];
            if (qty > 0) effW = Math.min(effW, ((stock[gid] || 0) - (b._inAcc[gid] || 0)) / qty);
            addDemand(gid, qty * w);
          }
        }
        if (effW < 0) effW = 0;
        // v0.51 (P1/§2): the building has an internal output buffer capped at
        // storeCap = the whole-unit b.store[good] (what porters collect) plus the
        // sub-unit accumulator b._prodAcc. When that buffer is full the building
        // STALLS — it stops consuming inputs and producing, so nothing is ever made
        // that can't be held (no waste). Porters drain b.store into the warehouse.
        const buffered = (b._prodAcc || 0) + ((b.store && b.store[out.goodId]) || 0);
        if (effW > 0 && buffered < storeCap) {
          // P5-A hook: research output multipliers (guarded; 1x when no research).
          //   globalOutput always; extractorOutput for extractors (+ mineOutput for
          //   ore/stone mines); processorOutput for processors. Keys end in "Output"
          //   so Research.effect multiplies unlocked nodes, defaulting to 1.
          let resMult = 1;
          if (typeof Research !== "undefined" && Research.effect) {
            resMult = Research.effect(State, "globalOutput", 1);
            if (type.kind === "extractor") {
              resMult *= Research.effect(State, "extractorOutput", 1);
              if (MINE_TERRAINS[type.terrain]) {   // === TV2: deposit-tile mines & quarries ===
                resMult *= Research.effect(State, "mineOutput", 1);  // deep veins: mines & quarries
              }
            } else if (type.kind === "processor") {
              resMult *= Research.effect(State, "processorOutput", 1);
            }
          }
          // === RU-A: compose per-building upgrade outputMult ===
          const upgMult = (typeof Buildings !== "undefined" && Buildings.upgradeEffect) ? (Buildings.upgradeEffect(b).outputMult || 1) : 1;
          // BANK this tick's flows (float); nothing enters/leaves stock until release.
          if (inputs) for (const gid in inputs) b._inAcc[gid] = (b._inAcc[gid] || 0) + inputs[gid] * effW;
          b._prodAcc += out.ratePerWorker * effW * hf * resMult * upgMult;
          // === /RU-A ===
        }
      }

      // RELEASE whole units on the batch boundary (or every tick when interval 0).
      // Processors flush banked input-consumption and output-production together, so
      // both sides of the recipe stay integer and on the same cadence.
      const releaseBatch = () => {
        if (inputs) {
          for (const gid in inputs) {
            const consumed = Math.floor(b._inAcc[gid] || 0);
            if (consumed > 0) { stock[gid] = clamp0((stock[gid] || 0) - consumed); b._inAcc[gid] -= consumed; }
          }
        }
        // v0.51 (P1/§2): release whole units into the building's OWN store (b.store),
        // NOT the warehouse — internal porters physically carry b.store to the
        // warehouse (Sim.tickPorters). Bounded by storeCap so the buffer can't run
        // away; the leftover sub-unit stays in b._prodAcc. Nothing is wasted.
        let rel = Math.floor(b._prodAcc);
        if (rel > 0) {
          if (!b.store || typeof b.store !== "object") b.store = {};
          const g = out.goodId;
          const room = storeCap - (b.store[g] || 0);
          rel = Math.min(rel, Math.max(0, room));
          if (rel > 0) { b.store[g] = (b.store[g] || 0) + rel; b._prodAcc -= rel; }
        }
      };
      if (intervalTicks <= 0) {
        releaseBatch();
      } else if (--b._prodTimer <= 0) {
        releaseBatch();
        b._prodTimer = intervalTicks;
      }
    }

    // === v0.51 §2: internal porters COLLECT producer output into the warehouse.
    // Producers bank whole units in b.store; the warehouse grows ONLY via porters
    // (+trade imports), so they are REAL movers, not a visual. Runs after production
    // (so this tick's batch is collectable) and before consumption (so a fresh
    // delivery is spendable this tick). Deterministic — no RNG, fixed iteration order.
    Sim.tickPorters(town);

    // === RSF: the ACTIVE research node's still-needed castle materials feed
    // town demand (per-town share) — prices rise and town traders import the
    // goods, giving the royal buyers a surplus to purchase. ResearchEconomy's
    // own dispatch excludes this echo from the seller hold-back.
    if (typeof ResearchEconomy !== "undefined" && ResearchEconomy.townShare &&
        State.research && State.research.active) {
      const node = (typeof Research !== "undefined") ? Research.get(State.research.active) : null;
      const mats = (node && node.materials) || {};
      for (const gid in mats) addDemand(gid, ResearchEconomy.townShare(State, gid));
    }
    // === /RSF ===

    // --- 2. Consumption + basic/extra need satisfaction ----------------
    // EV3: every resident consumes BASIC (wood+potato) + EXTRA (fish+wool, +beer
    // for workers, +clothes for burghers) goods per its tier's perCapita rates.
    // We tally required + consumed per good (recording demand for the price model
    // AND for Trade shortfalls), then roll them into basicSat/extraSat.
    const totalPop = (pop.peasants || 0) + (pop.workers || 0) + (pop.burghers || 0) + (pop.aristocrats || 0);  // === CC ===

    const required = {};                 // goodId -> units the population wants this tick (DEMAND: prices/trade/happiness)
    const consume  = {};                 // v0.51 §6: goodId -> units to PHYSICALLY remove (basics gated on all-present)
    const tierReq = { peasants: {}, workers: {}, burghers: {}, aristocrats: {} };  // === PP-A / CC === per-tier required
    // === RU-A: capacity-weighted basic-consumption reduction from house upgrades.
    // Only BASIC-need goods (this tier's basic[]) are scaled; extra-need goods are not.
    const bcm = (typeof Buildings !== "undefined" && Buildings.basicConsumptionMult)
      ? Buildings.basicConsumptionMult(town) : { peasants: 1, workers: 1, burghers: 1, aristocrats: 1 };
    // v0.51: LUXURY-consumption reduction from the L5 house upgrade (extra-need goods only).
    const lcm = (typeof Buildings !== "undefined" && Buildings.luxuryConsumptionMult)
      ? Buildings.luxuryConsumptionMult(town) : { peasants: 1, workers: 1, burghers: 1, aristocrats: 1 };
    // === CC: iterate per-tier lists (tiers[k].perCapita + per-tier basic classification) ===
    for (const tierKey in N.tiers) {
      const n = pop[tierKey] || 0;
      if (n <= 0) continue;
      const spec = N.tiers[tierKey];
      const rates = spec.perCapita;
      const tierBcm = bcm[tierKey] || 1;
      const tierLcm = lcm[tierKey] || 1;
      // v0.51 §6: a tier eats its BASICS only when ALL of them are present — otherwise
      // it WAITS (no partial consumption), so a house never burns the one basic it has
      // while starving for another. Extras stay independent. Demand + satisfaction below
      // still read the full `required`, so a gated shortage lowers happiness and pulls
      // imports for the missing good.
      let basicsOk = true;
      for (const gid of spec.basic) { if ((stock[gid] || 0) <= 0) { basicsOk = false; break; } }
      for (const gid in rates) {
        const isBasic = spec.basic.indexOf(gid) >= 0;   // CC: class is per-TIER, not global
        const amt = rates[gid] * n * (isBasic ? tierBcm : tierLcm);   // v0.51: extra-need goods scaled by luxury mult
        required[gid] = (required[gid] || 0) + amt;
        tierReq[tierKey][gid] = (tierReq[tierKey][gid] || 0) + amt;  // === PP-A ===
        if (!isBasic || basicsOk) consume[gid] = (consume[gid] || 0) + amt;   // §6 gate: basics only when all present
      }
    }
    // === /RU-A + /CC ===
    // === GRAN: integer consumption with per-town carry. gsatRaw is STILL the REAL
    // fractional demand-vs-shelf (min(have,req)/req) so the satEMA smoothing below —
    // and thus happiness — is unchanged and stays smooth; only the PHYSICAL stock
    // decrement is integer-quantized: fractional demand accrues in town._consCarry
    // and we subtract Math.floor of it (clamped to available stock, never negative),
    // carrying the sub-unit remainder. No demand backlog builds during a shortage
    // (unmet whole-unit demand is dropped, exactly as the old min() did).
    if (!town._consCarry || typeof town._consCarry !== "object") town._consCarry = {};
    const gsatRaw = {};                  // per-good INSTANTANEOUS satisfaction (0..1) this tick
    for (const gid in required) {
      const req = required[gid];
      addDemand(gid, req);
      const have = stock[gid] || 0;
      gsatRaw[gid] = req > 0 ? Math.min(have, req) / req : 1;   // real fractional demand vs shelf
      const cc = (town._consCarry[gid] || 0) + (consume[gid] || 0);   // §6: accrue only GATED (physically-eaten) demand
      let take = Math.floor(cc);
      if (take > have) take = have;                             // clamp ≥0 — can't consume what isn't there
      if (take > 0) stock[gid] = have - take;
      town._consCarry[gid] = cc - Math.floor(cc);               // carry only the sub-unit remainder
    }
    // === SAWTOOTH FIX === smooth the per-good satisfaction that HAPPINESS reads with a
    // town-persisted EMA (town.satEMA), so momentary between-cart shelf dips don't
    // crater happiness. Snap-initialised (first sample = raw) so a first/plentiful tick
    // is bit-identical to the old instantaneous model; satSmoothing ≤ 0 (or missing) ⇒
    // the old model exactly. Only demanded goods are smoothed; `gsat` (used by the
    // happiness class-sat helpers below) is the SMOOTHED value. Consumption/stock above
    // are unchanged, so prices, trade and pop capacity see the true instantaneous stock.
    if (!town.satEMA || typeof town.satEMA !== "object") town.satEMA = {};
    const satEMA = town.satEMA;
    const satAlpha = (N.satSmoothing > 0) ? Math.min(1, N.satSmoothing) : 1;
    const gsat = {};                     // per-good SMOOTHED satisfaction feeding happiness
    for (const gid in gsatRaw) {
      const raw = gsatRaw[gid];
      const prev = satEMA[gid];
      const sm = (typeof prev === "number") ? prev + (raw - prev) * satAlpha : raw;   // snap on first sample
      satEMA[gid] = sm;
      gsat[gid] = sm;
    }
    // Demand-weighted class satisfaction; null when the class isn't demanded at all.
    const classSat = (list) => {
      let req = 0, con = 0;
      for (const gid of list) {
        const r = required[gid] || 0;
        if (r <= 0) continue;
        req += r; con += r * (gsat[gid] || 0);
      }
      return req > 0 ? con / req : null;
    };
    // === PP-A === per-tier demand-weighted class satisfaction. Uses the shared
    // per-good gsat (goods sit in one town stock ⇒ availability is town-wide), but
    // weights by THIS tier's own required amounts. null when the tier doesn't
    // demand the class at all (mapped to 1 for a present tier below).
    const classSatTier = (tierKey, list) => {
      const tr = tierReq[tierKey]; let req = 0, con = 0;
      for (const gid of list) {
        const r = tr[gid] || 0;
        if (r <= 0) continue;
        req += r; con += r * (gsat[gid] || 0);
      }
      return req > 0 ? con / req : null;
    };
    // === /PP-A ===
    // Availability fallback (fraction of a class's goods on the shelf) — used by an
    // EMPTY city so a stocked pantry attracts the first residents.
    const availFrac = (list) => {
      let present = 0; for (const g of list) if ((stock[g] || 0) > 0) present++;
      return list.length ? present / list.length : 0;
    };
    // === CC: an EMPTY town's seed-happiness is based on the PEASANTS' lists (the
    // entry tier that attracts the first settlers) — higher-tier luxuries must not
    // spuriously seed peasant attraction. For a populated town these town-wide
    // sats are unused (per-tier happiness below drives everything). ===
    const repBasic = N.tiers.peasants.basic, repExtra = N.tiers.peasants.extra;
    let basicSat = classSat(repBasic);
    let extraSat = classSat(repExtra);
    if (basicSat === null) basicSat = totalPop > 0 ? 1 : availFrac(repBasic);
    if (extraSat === null) extraSat = totalPop > 0 ? 1 : availFrac(repExtra);

    // === CC→BAL2: the per-tier LUXURY growth gate is GONE. It deadlocked the
    // economy: workers/burghers gate-listed goods only their own tier produces,
    // so tiers could never bootstrap from zero (BAL2 playthrough: nothing above
    // peasants ever appeared in 120k ticks). The author's model needs no gate —
    // capacity already follows happiness (70% = full), and luxuries only lift
    // happiness above 70 for bonus income. Empty tiers bootstrap from their OWN
    // shelf availability (below). ===

    // --- 3. Happiness = basicHappy·basicSat + extraHappy·extraSat -------
    // EV3: basics (wood+potato) fully met floor happiness at ~70; extras (fish+wool
    // +beer/+clothes) met lift it the remaining +30 to ~100. Missing basics drops it
    // below 70. town.happyMods = [{delta, untilTick}] is a temporary channel summed
    // here (EC-C give/take) and pruned once entries expire.
    let tempMod = 0;
    if (Array.isArray(town.happyMods)) {
      const kept = [];
      for (const mod of town.happyMods) {
        if (!mod) continue;
        if (mod.untilTick == null || mod.untilTick >= State.tick) {
          tempMod += (mod.delta || 0);
          kept.push(mod);
        }
      }
      town.happyMods = kept;
    }
    // === PP-A === PER-TIER happiness. Each present tier eases its OWN target
    // (basicHappy·basicSat_t + extraHappy·extraSat_t + tempMod) with the same
    // happyEase; town.happiness is the POP-WEIGHTED average of the eased per-tier
    // values. Empty tier → tierHappiness=null. An EMPTY town preserves the old
    // global availFrac fallback EXACTLY. Single-tier equivalence is bit-exact:
    // one tier ⇒ its tierReq == the town's required ⇒ basicSat_t/extraSat_t ==
    // the old global basicSat/extraSat, its own prev seeds from town.happiness,
    // and the weighted average over one tier == that tier's eased value.
    const prevAgg = (typeof town.happiness === "number") ? town.happiness : null;
    if (!town.tierHappiness || typeof town.tierHappiness !== "object") town.tierHappiness = {};
    if (totalPop > 0) {
      let wsum = 0, hsum = 0;
      for (const tk of ["peasants", "workers", "burghers", "aristocrats"]) {   // === CC: 4 tiers ===
        const n = pop[tk] || 0;
        if (n <= 0) { town.tierHappiness[tk] = null; continue; }
        let bs = classSatTier(tk, N.tiers[tk].basic); if (bs === null) bs = 1;   // === CC: per-tier basic list ===
        let es = classSatTier(tk, N.tiers[tk].extra); if (es === null) es = 1;   // === CC: per-tier extra list ===
        const ht = Math.max(0, Math.min(100, N.basicHappy * bs + N.extraHappy * es + tempMod));
        const prevT = (typeof town.tierHappiness[tk] === "number") ? town.tierHappiness[tk]
                    : (prevAgg != null ? prevAgg : ht);
        const eased = prevT + (ht - prevT) * N.happyEase;
        town.tierHappiness[tk] = eased;
        wsum += n; hsum += n * eased;
      }
      town.happiness = wsum > 0 ? hsum / wsum : (prevAgg != null ? prevAgg : 0);
    } else {
      town.tierHappiness = { peasants: null, workers: null, burghers: null, aristocrats: null };  // === CC ===
      const hTarget = Math.max(0, Math.min(100,
        N.basicHappy * basicSat + N.extraHappy * extraSat + tempMod));
      const hPrev = (prevAgg != null) ? prevAgg : hTarget;
      town.happiness = hPrev + (hTarget - hPrev) * N.happyEase; // ease (snap on first read)
    }
    // === /PP-A ===

    // --- 4. Population from housing scales with happiness --------------
    // Effective target per tier = round(capacity × happiness/100). A tier grows
    // toward its target while its EXTRA-need goods are AVAILABLE (beer for workers,
    // beer+clothes for burghers) — basics aren't a growth gate (they drive
    // happiness, which already scales the target). Over target, or with an extra
    // need missing, the tier declines after a sustained low streak.
    const housing = (typeof Buildings !== "undefined" && Buildings.housingCapacity)
      ? Buildings.housingCapacity(town, State)   // P5-A: pass State so housingBonus research applies
      : { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };   // === CC ===
    const capacity = {
      peasants: (base.peasants || 0) + (housing.peasants || 0),
      workers:  (housing.workers  || 0),
      burghers: (housing.burghers || 0),
      aristocrats: (housing.aristocrats || 0),   // === CC: aristocrat housing ===
    };
    if (!town._lowSat) town._lowSat = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };
    for (const tier in capacity) {
      const cap = capacity[tier];
      // === CC→BAL2: 70% happiness = full capacity (author rule). A PRESENT tier
      // uses its own eased happiness. An EMPTY tier bootstraps from its OWN
      // basic/extra shelf availability (goods stocked → settlers arrive; e.g.
      // stock fish+coal and workers move into a cottage), NOT the town average
      // — so no tier appears before its needs exist, and none is deadlocked. ===
      let th;
      if (town.tierHappiness && town.tierHappiness[tier] != null) {
        th = town.tierHappiness[tier];
      } else {
        const tl = N.tiers[tier] || { basic: [], extra: [] };
        th = N.basicHappy * availFrac(tl.basic) + N.extraHappy * availFrac(tl.extra);
      }
      const capFrac = Math.min(1, Math.max(0, Math.min(100, th)) / N.capacityFullAt);
      const naturalTarget = Math.round(cap * capFrac);
      // v0.50: minimal core workforce for an empty/starved house (>=10% of capacity,
      // at least 1). When the natural target is BELOW that floor (basics unmet), the
      // crew runs on a duty cycle — present onCycles of every (on+off) cycles — so the
      // city gets intermittent labour to bootstrap food/wood, then can grow normally.
      const floorN = cap > 0 ? Math.max(1, Math.floor(cap * (N.emptyHouseFrac || 0.10))) : 0;
      if (cap > 0 && naturalTarget < floorN) {
        const C = N.emptyHouseCycleTicks || 16;
        const period = C * ((N.emptyHouseOnCycles || 1) + (N.emptyHouseOffCycles || 3));
        const onLen = C * (N.emptyHouseOnCycles || 1);
        const onNow = period > 0 ? ((((State.tick || 0) % period) + period) % period) < onLen : true;
        pop[tier] = onNow ? Math.min(floorN, cap) : 0;   // crisp on/off (bypass easing)
        town._lowSat[tier] = 0;
        continue;
      }
      const target = naturalTarget;
      let n = pop[tier] || 0;
      if (n < target) {
        town._lowSat[tier] = 0;
        n += N.growthRate * (target - n);        // grow toward the target
      } else if (n > target) {
        town._lowSat[tier] = (town._lowSat[tier] || 0) + 1;   // over target (happiness fell)
        if (town._lowSat[tier] >= N.declineAfterTicks) n = target + (n - target) * (1 - N.declineRate);
      } else {
        town._lowSat[tier] = 0;                  // at target and content
      }
      pop[tier] = Math.min(clamp0(n), cap);      // clamp 0 <= pop <= capacity
    }

    // --- 4b. People-tax: population funds the city's TRADE budget ------
    // EV3: each tick the population pays gold into town.gold, scaled by happiness.
    // At happyBase the multiplier is 1×; every point above adds bonusPerPoint, so
    // happier cities accrue trade money faster (modest, but enough to fund carts).
    // === PP-A === people-tax computed PER TIER: each tier's pop × rate × its own
    // happiness scaling. town.tierIncome records the gold/tick each tier funded
    // (Sim.houseIncome later splits it across that tier's houses by capacity).
    // Single-tier equivalence is bit-exact (h_t == town.happiness, n == popNow).
    const pt = N.peopleTax;
    town.tierIncome = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };  // === CC ===
    if (pt) {
      let total = 0;
      for (const tk of ["peasants", "workers", "burghers", "aristocrats"]) {   // === CC: 4 tiers ===
        const n = pop[tk] || 0;
        if (n <= 0) continue;
        const h_t = (town.tierHappiness && town.tierHappiness[tk] != null)
          ? town.tierHappiness[tk] : town.happiness;
        const mult = 1 + Math.max(0, h_t - pt.happyBase) * pt.bonusPerPoint;
        // === CC: higher tiers pay more per capita (ratePerTier); goldPerPop fallback. ===
        const rate = (pt.ratePerTier && pt.ratePerTier[tk] != null) ? pt.ratePerTier[tk] : pt.goldPerPop;
        const inc = n * rate * mult;
        town.tierIncome[tk] = inc; total += inc;
      }
      if (total > 0) {
        town.gold = (town.gold || 0) + total;
        if (typeof Ledger !== "undefined") Ledger.record(town, "tax", total);
      }
    }
    // === /PP-A ===

    // --- 5. Publish demand, then reprice every good (Sim.priceFor) -----
    town.demand = demand;
    if (!town.prices) town.prices = {};
    for (const gid in CONFIG.goods) Sim.priceFor(town, gid);

    // --- 6. Clamp stockpiles to [0, storageCap] -----------------------
    // EV3: a city holds at most CONFIG.town.storageCap of EACH good — production
    // (and any other Sim increase) can never bank more than the cap.
    const capG = (CONFIG.town && CONFIG.town.storageCap) || Infinity;
    for (const gid in stock) {
      if (!(stock[gid] > 0)) stock[gid] = 0;
      else if (stock[gid] > capG) stock[gid] = capG;
    }
  }
  return State;
};

// === v0.51 §2: INTERNAL PORTERS (real movers) ================================
// A deterministic fleet per town physically carries producer output to the
// warehouse. Producers bank whole units in b.store; a porter goes idle → walks to
// the fullest producer → loads ≤ carryCap → walks back to the town centre → deposits
// up to the warehouse's remaining room. The warehouse therefore grows ONLY through
// porters (plus external trade), never directly from production — so porters are the
// actual bottleneck, not a decoration. Invariants: warehouse never exceeds
// storageCap; nothing is wasted (undelivered goods wait in a porter's cargo or the
// building's store). Pure: no DOM/RNG/Date, fixed iteration order, all motion state
// persisted on town.porters so saves + headless tests are deterministic.
const PORTER_HEX_DIST = (aq, ar, bq, br) =>
  (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2;
Sim.tickPorters = function (town) {
  if (!town) return;
  if (!town.stock || typeof town.stock !== "object") town.stock = {};
  const stock = town.stock;
  const E = CONFIG.econ || {};
  const cap = (CONFIG.town && CONFIG.town.storageCap);
  const carryCap = E.porterCarry || 10;
  const ticksPerTile = E.porterTicksPerTile || 1;
  const buildings = Array.isArray(town.buildings) ? town.buildings : [];
  // Fleet size: at least the town's base hauler count, but scaled so every producer
  // that currently has goods waiting can be served — otherwise a handful of porters
  // would starve a big city's producers (their stores fill, they stall). Capped so it
  // stays "a small fleet" and bounds work per tick.
  const base = (typeof Buildings !== "undefined" && Buildings.transporterCount)
    ? Buildings.transporterCount(town) : 4;
  let waiting = 0;
  for (const b of buildings) {
    if (!b || b.built === false || !b.store) continue;
    for (const g in b.store) { if ((b.store[g] || 0) >= 1) { waiting++; break; } }
  }
  const maxFleet = (E.porterMaxFleet || 16);
  const need = Math.max(1, Math.min(maxFleet, Math.max(base, waiting)));

  // Size the fleet deterministically to `need` (grow at the end, trim the tail).
  if (!Array.isArray(town.porters)) town.porters = [];
  const P = town.porters;
  while (P.length < need) P.push({ phase: "idle", prog: 0, good: null, qty: 0, bq: town.q, br: town.r, legTicks: 1 });
  if (P.length > need) {
    // Only drop IDLE porters from the tail so we never vanish carried cargo (no waste).
    for (let i = P.length - 1; i >= 0 && P.length > need; i--) if (P[i].phase === "idle") P.splice(i, 1);
    if (P.length > need) P.length = need;   // fallback (all busy): safe, cargo returns to nothing rarely
  }

  const roomFor = (g) => (cap ? Math.max(0, cap - (stock[g] || 0)) : Infinity);
  // Goods already inbound (carried toward the warehouse) count against room so a
  // second porter doesn't over-commit to the same shrinking headroom.
  const inbound = {};
  for (const p of P) if (p.phase === "toWarehouse" && p.good) inbound[p.good] = (inbound[p.good] || 0) + p.qty;
  // Find a producer at (q,r) still holding `good` in its store. Keyed by good (not
  // just coords) so that when several buildings share a hex — as headless fixtures
  // do; real placement is one-per-hex — a porter collects from one that actually has
  // the cargo it came for, instead of always the first building at that tile.
  const buildingAt = (q, r, good) => {
    let firstAtHex = null;
    for (const b of buildings) {
      if (!b || b.built === false || b.q !== q || b.r !== r) continue;
      if (!firstAtHex) firstAtHex = b;
      if (good && b.store && (b.store[good] || 0) >= 1) return b;
    }
    return firstAtHex;
  };
  const legTicksFor = (bq, br) =>
    Math.max(1, Math.round(PORTER_HEX_DIST(town.q, town.r, bq, br) * ticksPerTile));

  for (const p of P) {
    if (p.phase === "idle") {
      // Pick the producer offering the largest immediately-collectable load whose
      // good still has warehouse room (net of inbound). Deterministic max, tie-break
      // by position so the choice never depends on object identity.
      let best = null, bestQ = 0, bestKey = null;
      for (const b of buildings) {
        if (!b || b.built === false || !b.store) continue;
        for (const g in b.store) {
          const s = b.store[g] || 0;
          if (s < 1) continue;
          const room = roomFor(g) - (inbound[g] || 0);
          if (room < 1) continue;
          const q = Math.min(carryCap, Math.floor(s), Math.floor(room));
          if (q < 1) continue;
          const key = b.q + "," + b.r + ":" + g;
          if (q > bestQ || (q === bestQ && bestKey !== null && key < bestKey)) { best = { b, g }; bestQ = q; bestKey = key; }
        }
      }
      if (best) {
        p.phase = "toBuilding"; p.prog = 0; p.good = best.g; p.qty = 0;
        p.bq = best.b.q; p.br = best.b.r; p.legTicks = legTicksFor(best.b.q, best.b.r);
        inbound[best.g] = (inbound[best.g] || 0) + bestQ;   // reserve the room now
      }
      continue;
    }
    if (p.phase === "toBuilding") {
      p.prog += 1 / (p.legTicks || 1);
      if (p.prog < 1) continue;
      p.prog = 1;
      const b = buildingAt(p.bq, p.br, p.good);
      const avail = (b && b.store && b.store[p.good]) || 0;
      const room = roomFor(p.good);   // recompute at pickup (inbound reservation already applied)
      const load = Math.min(carryCap, Math.floor(avail), Math.floor(room));
      if (load >= 1) {
        b.store[p.good] -= load; p.qty = load;
        p.phase = "toWarehouse"; p.prog = 0;
      } else {
        p.phase = "idle"; p.good = null; p.qty = 0;   // nothing left to grab (another porter beat us)
      }
      continue;
    }
    if (p.phase === "toWarehouse") {
      p.prog += 1 / (p.legTicks || 1);
      if (p.prog < 1) continue;
      p.prog = 1;
      const room = roomFor(p.good);
      const drop = Math.min(p.qty, room);
      if (drop > 0) { stock[p.good] = (stock[p.good] || 0) + drop; p.qty -= drop; }
      if (p.qty <= 0) { p.phase = "idle"; p.good = null; p.qty = 0; }
      // else: warehouse full — keep the cargo and retry next tick (never wasted).
      continue;
    }
    // Unknown phase (corrupt/legacy save): reset to idle.
    p.phase = "idle"; p.good = null; p.qty = 0; p.prog = 0;
  }
};

// === PP-A === Attribute a pop tier's people-tax income across that tier's houses
// by capacity share (for the later house panel). Pure; 0 for non-houses or when
// the tier earned nothing this tick. Σ over a tier's houses == town.tierIncome[t].
Sim.houseIncome = function (town, building) {
  if (!town || !building) return 0;
  const def = CONFIG.buildings[building.typeId];
  if (!def || def.kind !== "house") return 0;
  const key = SIM_TIER_KEY[def.houseTier];
  if (!key) return 0;
  const tierInc = (town.tierIncome && town.tierIncome[key]) || 0;
  if (tierInc <= 0) return 0;
  const upEff = (typeof Buildings !== "undefined" && Buildings.upgradeEffect) ? Buildings.upgradeEffect : null;
  const capOf = (b, d) => (d.houseCapacity || 0) + (upEff ? (upEff(b).capacityPlus || 0) : 0);
  const thisCap = capOf(building, def);
  let totalCap = 0;
  for (const b of (town.buildings || [])) {
    if (!b) continue;   // guard a null array element (corrupt save) — matches sibling loops
    const d = CONFIG.buildings[b.typeId];
    if (!d || d.kind !== "house" || SIM_TIER_KEY[d.houseTier] !== key) continue;
    totalCap += capOf(b, d);
  }
  return totalCap > 0 ? tierInc * (thisCap / totalCap) : 0;
};
// === /PP-A ===

// (v0.47) Read-only production progress for the map + panel progress bars. Returns
// { prog, working, starved, kind, out } for a producing building, or null for a
// house / non-producer. `prog` (0..1) is how far this building is toward its next
// whole-unit batch RELEASE (the same _prodTimer countdown Sim.tick advances); at
// interval 0 (release-every-tick kinds) it reports the banked fraction. `starved`
// = a processor that lacks its full input recipe in the town stock right now. Pure.
Sim.buildingProgress = function (state, town, b) {
  const def = b && CONFIG.buildings[b.typeId];
  if (!def || !def.output || def.kind === "house") return null;
  const baseTickMs = (CONFIG.econ && CONFIG.econ.baseTickMs) || 500;
  const psec = (CONFIG.econ && CONFIG.econ.productionIntervalSec) || {};
  const intervalTicks = Math.round((psec[def.kind] || 0) * (1000 / baseTickMs));
  const working = (b.workers || 0) > 0 && b.built !== false;
  let prog = 0;
  if (intervalTicks > 0) {
    const t = (typeof b._prodTimer === "number") ? b._prodTimer : intervalTicks;
    prog = Math.max(0, Math.min(1, 1 - t / intervalTicks));
  } else {
    prog = Math.max(0, Math.min(1, (b._prodAcc || 0) % 1));
  }
  let starved = false;
  if (def.inputs && town && town.stock) {
    for (const gid in def.inputs) if ((town.stock[gid] || 0) < def.inputs[gid]) { starved = true; break; }
  }
  return { prog: working ? prog : 0, working, starved, intervalTicks, kind: def.kind, out: def.output.goodId };
};

// === CC: save-good migration (PURE — lives in PURE_CORE so migration tests can
// drive it). Renames retired/renamed good ids across every good-keyed map in a
// loaded save, summing collisions, and remaps the retired weaver building. The
// smelter is intentionally left INERT (its typeId is simply absent from
// CONFIG.buildings now, so every Sim/Buildings guard skips it — remapping it to
// the Forge is rejected because the Forge is citizen-tier and would silently
// re-tier the building). The app's loadGame calls this after TV2_migrateData. ===
Sim.CC_GOOD_RENAMES = { beer: "mead", tools: "iron_tool", jewelry: "gold_ring", furniture: "chairs", cloth: "clothes" };
Sim.CC_BUILDING_RENAMES = { weaver: "tailoring" };   // both wool → clothes; graceful. smelter left inert.
Sim.ccRenameGoodMap = function (obj, map) {
  if (!obj || typeof obj !== "object") return;
  for (const from in map) {
    if (!(from in obj)) continue;
    const to = map[from];
    obj[to] = (typeof obj[to] === "number" ? obj[to] : 0) + obj[from];
    delete obj[from];
  }
};
Sim.CC_migrateGoods = function (state) {
  if (!state || typeof state !== "object") return state;
  const GM = Sim.CC_GOOD_RENAMES, BM = Sim.CC_BUILDING_RENAMES;
  const GOODMAPS = ["stock", "prices", "demand", "reserved", "produced", "consumed", "delivered", "need"];
  for (const t of (state.towns || [])) {
    if (!t) continue;
    for (const key of GOODMAPS) Sim.ccRenameGoodMap(t[key], GM);
    for (const b of (t.buildings || [])) {
      if (!b) continue;
      if (BM[b.typeId]) b.typeId = BM[b.typeId];
      Sim.ccRenameGoodMap(b.delivered, GM);
      if (b.pendingUpgrade) Sim.ccRenameGoodMap(b.pendingUpgrade.delivered, GM);
    }
  }
  for (const c of (state.carts || [])) {
    if (!c) continue;
    if (c.goodId && GM[c.goodId]) c.goodId = GM[c.goodId];
    if (Array.isArray(c.cargo)) for (const it of c.cargo) if (it && it.goodId && GM[it.goodId]) it.goodId = GM[it.goodId];
  }
  Sim.ccRenameGoodMap(state.warehouse, GM);
  Sim.ccRenameGoodMap(state.castleStock, GM);
  Sim.ccRenameGoodMap(state.castleReserved, GM);
  Sim.ccRenameGoodMap(state.castleTrade, GM);
  return state;
};
// === /CC ===
// === SIM-CORE END ===
