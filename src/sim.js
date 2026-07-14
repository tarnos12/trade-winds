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
      peasants:    { basic: ["potato", "wood"], extra: ["fish", "wool"],
                     perCapita: { potato: 0.10, wood: 0.05, fish: 0.05, wool: 0.03 } },
      workers:     { basic: ["fish", "coal"], extra: ["clothes", "bread", "mead"],
                     perCapita: { fish: 0.05, coal: 0.05, clothes: 0.03, bread: 0.03, mead: 0.05 } },
      burghers:    { basic: ["lamp", "bread", "mead", "clothes"], extra: ["chairs", "pottery", "gold_ring"],
                     perCapita: { lamp: 0.03, bread: 0.04, mead: 0.04, clothes: 0.03, chairs: 0.02, pottery: 0.02, gold_ring: 0.01 } },
      aristocrats: { basic: ["lamp", "mead", "iron_armor", "chairs", "pottery"], extra: ["brandy", "luxury_clothes", "gold_ring"],
                     perCapita: { lamp: 0.03, mead: 0.04, iron_armor: 0.02, chairs: 0.02, pottery: 0.02, brandy: 0.02, luxury_clothes: 0.01, gold_ring: 0.01 } },
    },
    // Happiness mapping: happiness = basicHappy·basicSat + extraHappy·extraSat.
    //   basics met (basicSat 1) ⇒ 70; +extras met (extraSat 1) ⇒ +30 ⇒ 100.
    basicHappy: 70,
    extraHappy: 30,
    // === CC: 70% happiness = FULL housing/worker capacity. Below 70 scales the
    // population target DOWN (target = round(cap × min(1, happiness/capacityFullAt)));
    // at/above 70 = full capacity, and the surplus happiness pays extra people-tax. ===
    capacityFullAt: 70,
    growthThreshold: 0.9999, // extra-need availability at/above this => a tier may grow
    declineThreshold: 0.5,   // sustained satisfaction below this => decline
    declineAfterTicks: 3,    // consecutive low ticks before a tier declines
    growthRate: 0.03,        // fraction of the gap to target a tier gains per tick
    declineRate: 0.05,       // fraction of a tier's population lost per decline tick
    // Work efficiency from happiness (0..100): factor = effMin + (h/100)*(effMax-effMin).
    effMin: 0.5, effMax: 1.2,
    happyEase: 0.10,         // lerp toward the happiness target each tick (anti-jump)
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

  for (const town of State.towns) {
    if (!town) continue;
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
        let done = true;
        for (const gid in remain) { done = false; addDemand(gid, remain[gid]); }
        if (done) {
          if (t.kind === "build") { b.built = true; Sim.statConstructed(State, b.typeId); }   // MISSION-STATS: construction complete (built false→true)
          else { b.upgradeLevel = b.pendingUpgrade.toLevel; b.pendingUpgrade = null; Sim.statUpgraded(State, b.typeId); }   // MISSION-STATS: upgrade applied
        }
      }
    }
    // === /CB-A + /RU-A (moved above production by WOODFIX) ============

    // --- 1. Production -------------------------------------------------
    // Each staffed building outputs ratePerWorker × assignedWorkers × happiness,
    // consuming its inputs (processors); throughput is throttled by missing inputs.
    for (const b of buildings) {
      if (!b || b.built === false) continue;   // CB-A: unbuilt buildings don't produce; !b guards a null array element (matches assignWorkers/target-loop siblings) so a corrupt entry can't deref null → throw
      const type = CONFIG.buildings[b.typeId];
      if (!type || !type.output) continue;
      const w = b.workers || 0;
      if (w <= 0) continue;
      // Inputs cap effective workers; record full desired input as demand.
      let effW = w;
      const inputs = type.inputs;
      if (inputs) {
        for (const gid in inputs) {
          const qty = inputs[gid];
          if (qty > 0) effW = Math.min(effW, (stock[gid] || 0) / qty);
          addDemand(gid, qty * w);
        }
      }
      if (effW <= 0) continue;          // inputs missing → building idles this tick
      if (inputs) for (const gid in inputs) stock[gid] = clamp0((stock[gid] || 0) - inputs[gid] * effW);
      const out = type.output;
      // P4-C hook: a "bumper harvest" event boosts farm output (light, guarded).
      const evMult = (type.id === "farm" && typeof Events !== "undefined" && Events.farmMultiplier)
        ? Events.farmMultiplier(State) : 1;
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
      stock[out.goodId] = (stock[out.goodId] || 0) + out.ratePerWorker * effW * hf * evMult * resMult * upgMult;
      // === /RU-A ===
    }

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

    const required = {};                 // goodId -> units the population wants this tick
    const tierReq = { peasants: {}, workers: {}, burghers: {}, aristocrats: {} };  // === PP-A / CC === per-tier required
    // === RU-A: capacity-weighted basic-consumption reduction from house upgrades.
    // Only BASIC-need goods (this tier's basic[]) are scaled; extra-need goods are not.
    const bcm = (typeof Buildings !== "undefined" && Buildings.basicConsumptionMult)
      ? Buildings.basicConsumptionMult(town) : { peasants: 1, workers: 1, burghers: 1, aristocrats: 1 };
    // === CC: iterate per-tier lists (tiers[k].perCapita + per-tier basic classification) ===
    for (const tierKey in N.tiers) {
      const n = pop[tierKey] || 0;
      if (n <= 0) continue;
      const spec = N.tiers[tierKey];
      const rates = spec.perCapita;
      const tierBcm = bcm[tierKey] || 1;
      for (const gid in rates) {
        const isBasic = spec.basic.indexOf(gid) >= 0;   // CC: class is per-TIER, not global
        const amt = rates[gid] * n * (isBasic ? tierBcm : 1);
        required[gid] = (required[gid] || 0) + amt;
        tierReq[tierKey][gid] = (tierReq[tierKey][gid] || 0) + amt;  // === PP-A ===
      }
    }
    // === /RU-A + /CC ===
    const gsat = {};                     // per-good satisfaction (0..1) for demanded goods
    for (const gid in required) {
      const req = required[gid];
      addDemand(gid, req);
      const have = stock[gid] || 0;
      const consume = Math.min(have, req);
      stock[gid] = have - consume;
      gsat[gid] = req > 0 ? consume / req : 1;
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
      const target = Math.round(cap * capFrac);
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
    // P4-C hook: a "demand craze" event triples one good's demand (price rises).
    if (typeof Events !== "undefined" && Events.crazeGood) {
      const cg = Events.crazeGood(State);
      if (cg) demand[cg] = Events.adjustDemand(State, cg, demand[cg] || 0);
    }
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
