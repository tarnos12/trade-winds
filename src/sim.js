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
    //   EXTRA (luxury) needs add the remaining extraHappy (+30 ⇒ ~100). They do NOT
    //   gate growth (removed in CC→BAL2): population follows housing × happiness,
    //   so luxuries only lift happiness above 70 (bonus tax, work speed).
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
    growthThreshold: 0.9999, // LEGACY, unread: the luxury growth gate it drove was removed (CC→BAL2)
    declineThreshold: 0.5,   // sustained satisfaction below this => decline
    declineAfterTicks: 3,    // consecutive low ticks before a tier declines
    growthRate: 0.0095,      // v0.51: fraction of the gap-to-target a tier gains per tick — paced so a fresh cluster of cities takes ~3 game-minutes to grow into a happy, self-sustaining 2-per-hut population (was 0.03; nudged from 0.008 to absorb the distribute-porter fill latency)
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
  if (!state) return { constructed: { total: 0, byType: {} }, upgraded: { total: 0, byType: {} }, traded: { byGood: {} }, taxEarned: 0, founded: 0, researched: 0 };
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
  // DESIGN PASS: peak kingdom population (victory recap). Old saves seed it from now.
  if (typeof st.peakPop !== "number") st.peakPop = Sim.kingdomPop(state);
  // v0.51: cities founded + research completed (onboarding missions). Old saves seed
  // them from the live state so a returning player's progress still counts.
  if (typeof st.founded !== "number") st.founded = Array.isArray(state.towns) ? state.towns.length : 0;
  if (typeof st.researched !== "number")
    st.researched = (state.research && Array.isArray(state.research.unlocked)) ? state.research.unlocked.length : 0;
  state.stats = st;
  return st;
};
// Total population across every town (all four tiers). Pure, allocation-free.
Sim.kingdomPop = function (state) {
  let n = 0;
  for (const t of ((state && state.towns) || [])) {
    const p = t && t.pop; if (!p) continue;
    n += (p.peasants || 0) + (p.workers || 0) + (p.burghers || 0) + (p.aristocrats || 0);
  }
  return n;
};
// Increment the "building constructed" counter (built false→true). typeId optional.
Sim.statConstructed = function (state, typeId) {
  const st = Sim.ensureStats(state);
  st.constructed.total += 1;
  if (typeId) st.constructed.byType[typeId] = (st.constructed.byType[typeId] || 0) + 1;
};
// v0.51: a city was founded / a research node completed (onboarding objectives).
Sim.statFounded = function (state) { Sim.ensureStats(state).founded += 1; };
Sim.statResearched = function (state) { Sim.ensureStats(state).researched += 1; };
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
    case "found_city": return stats.founded || 0;      // v0.51: cities founded
    case "research":   return stats.researched || 0;   // v0.51: research nodes completed
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
      tip: typeof m.tip === "string" ? m.tip : "",   // v0.51: optional one-line hint shown under the objectives
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

// DESIGN PASS: 'Next up' preview. The mission that follows `id` in prereq order: the
// first mission (set order) that lists `id` as a prereq and is neither active nor
// complete in `ev` (an evaluate() result). Falls back to null. Pure; used by
// Tutorial.render to show a greyed "Next: …" line under the primary mission so the
// player can prepare (e.g. build the Research Center during the m2 tariff wait).
MissionEngine.nextMission = function (missionSet, ev, id) {
  const set = (missionSet && Array.isArray(missionSet.missions)) ? missionSet : null;
  if (!set || !id) return null;
  const byId = (ev && ev.byId) || {};
  for (const m of set.missions) {
    if (!m || !Array.isArray(m.prereqs) || m.prereqs.indexOf(id) < 0) continue;
    const r = byId[m.id];
    if (r && (r.active || r.complete)) continue;
    return m;
  }
  return null;
};

// First sentence of a tip (up to and including the first '.', '!' or '?' that is
// followed by whitespace or the end). A tip with no terminator is returned whole.
MissionEngine.firstSentence = function (tip) {
  if (typeof tip !== "string") return "";
  const s = tip.trim();
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(s);
  return m ? m[0] : s;
};

// The bundled DEFAULT mission set — the original 5-mission onboarding arc ported to
// typed objectives (construct/upgrade/trade_good/earn_tax). Steps that don't map to
// a counter (found town, lay road, unlock tech, victory) use the CLOSEST objective.
// All retroactive (default) so a returning player's lifetime progress counts; the
// prereq chain m1→…→m7 keeps them in teaching order.
MissionEngine.DEFAULT = {
  version: 1,
  // v0.51 onboarding pass: the chain now TEACHES the core loop in the order the game
  // needs it — found a city → a second city trades and earns the King's tariff (the
  // player's only income) → the Research Center (every upgrade and most buildings are
  // research-locked) → then grow, trade, and reach the win. Each mission carries a
  // one-line `tip` rendered under its objectives.
  missions: [
    // DESIGN PASS: specialisation is taught from minute one. The old m1 recipe (Lumberjack
    // + Potato Farm + 2 Huts) built a self-sufficient city that exports nothing (0 g/min
    // tariff); a Timber town + a Farm town with the SAME building count earn ~9 g/min
    // (test/opening.test.js). CONFIG.town.startStock.potato 40 feeds the Timber town's
    // 4 peasants for ~7.7 min until the Farm town exports.
    { id: "m1", name: "Found Your Realm", icon: "🏰", pos: { col: 0, row: 0 }, retroactive: true, prereqs: [],
      tip: "🏗 Build → City beside a forest, then 🌾 Peasant: two Lumberjacks and two Huts — your Timber town.",
      objectives: [
        { type: "found_city", count: 1 },                             // found your first city
        { type: "construct", building: "lumberjack", count: 2 },      // its speciality: wood
        { type: "construct", building: "hut",        count: 2 },      // peasants to staff it
      ] },
    { id: "m2", name: "Trade Winds", icon: "🪙", pos: { col: 1, row: 0 }, retroactive: true, prereqs: ["m1"],
      tip: "Found a Farm town on fertile land away from the castle: two Potato Farms and two Huts, no Lumberjack. Each city buys the other's surplus and the King taxes every sale — watch 👑 +g/min beside your gold.",
      objectives: [
        { type: "found_city", count: 2 },                             // a trading partner
        { type: "construct", building: "potato_farm", count: 2 },     // its speciality: food
        { type: "earn_tax",   amount: 10 },                           // your first tariffs (early trade is small — just see it arrive)
      ] },
    { id: "m3", name: "The King's Scholars", icon: "🔬", pos: { col: 2, row: 0 }, retroactive: true, prereqs: ["m2"],
      tip: "⭐ Special → Research Center beside the castle, then open 🔬. Research Quarry first — city buildings and upgrades need stone. ⚠ marks research no city can supply yet; its tooltip names the research that fixes it. No stone in sight? Send your Scout (top-left) to explore.",
      objectives: [
        { type: "construct", building: "research_center", count: 1 },
        { type: "research",  count: 1 },
      ] },
    { id: "m4", name: "A Growing Town", icon: "🌾", pos: { col: 3, row: 0 }, retroactive: true, prereqs: ["m3"],
      // DESIGN PASS: a Sawmill eats 5 wood/min and its 2 peasants starve the wood export
      // unless the Timber town grows a 3rd Hut first; ⬆ lives on the BUILDING panel.
      tip: "A Sawmill needs 2 free peasants — build a 3rd Hut in your Timber town first (a Sawmill eats 5 wood/min). For your first ⬆ research Sturdy Hut or Water Wheel in 🔬 (a Lumberjack ⬆ needs 20 🪵 stocked first), then press ⬆ in that building's panel (not the city's). A building pauses while it upgrades.",
      objectives: [
        { type: "construct", building: "sawmill", count: 1 }, // build a workshop (processor)
        { type: "upgrade",   building: "any",     count: 1 }, // raise a building a level
      ] },
    { id: "m5", name: "Trade Routes", icon: "🛣", pos: { col: 4, row: 0 }, retroactive: true, prereqs: ["m4"],
      tip: "Roads speed traders on long routes. A city that makes everything it needs exports nothing — give each new city a speciality.",
      objectives: [
        { type: "trade_good", good: "potato", count: 20 },  // goods flow between towns
        { type: "earn_tax",   amount: 150 },                // lifetime tariff — ~12 g/min with 3 trading cities (customs valuation)
      ] },
    { id: "m6", name: "The King's Works", icon: "🏗", pos: { col: 5, row: 0 }, retroactive: true, prereqs: ["m5"],
      tip: "👷 badges mark buildings short of workers — build a Hut in that city (☆ Priority only reshuffles the workers a city already has). Short of gold? Take 1k from a city's panel (its people are unhappy for a minute).",
      objectives: [
        { type: "construct", building: "any", count: 8 },   // a productive realm to fund the King's works
        { type: "upgrade",   building: "any", count: 3 },   // advance your buildings
      ] },
    { id: "m7", name: "The Good Life", icon: "👑", pos: { col: 6, row: 0 }, retroactive: true, prereqs: ["m6"],
      tip: "Victory: an Aristocrat's House at 100% happiness.",
      objectives: [
        { type: "construct", building: "manor",          count: 1 },  // raise a citizen (burgher) class
        { type: "construct", building: "aristocrat_home", count: 1 }, // the top of the economy
        { type: "earn_tax",  amount: 1000 },                          // a thriving kingdom (lifetime tariff)
      ] },
  ],
};

// Alias: the Lead/QA referred to this pure module as `Missions`; expose both names
// (same object) so tests can capture either from the vm sandbox.
var Missions = MissionEngine;
// === /MISSION-ENGINE ===

// === DESIGN PASS #3: SMARTER STAFFING ======================================
// Worker assignment, derived every tick by Sim.tick (and dry-run by the UI's ☆
// preview). Four passes, array order within each (deterministic):
//   1. SELF-FEED — a producer whose output is a BASIC need of the tier that staffs
//      it (peasants: potato/wood; workers: coal) goes first, up to its full slots,
//      while the town holds under CONFIG.econ.selfFeedCoverSec game-seconds of that
//      good (warehouse + house buffers ÷ the present tiers' consumption). A ☆ can no
//      longer strip the only Potato Farm and starve the city that staffs it.
//   2. ☆ priority, not blocked.   3. the rest, not blocked.
//   4. BLOCKED producers (output store full, or waiting on an upgrade; ☆ first) — last, so
//      their crews work somewhere useful (CONFIG.econ.staffBlockedLast).
// "Full" has hysteresis: it trips at storeCap − 1 and clears only once the store has
// drained a whole batch, so porters' 10-unit pickups don't make crews flicker; self-feed
// likewise holds until the cover reaches selfFeedReleaseMult × selfFeedCoverSec.
// Input-starved processors are deliberately NOT blocked: an unstaffed processor gets
// no input-buffer target, so demoting it would keep it starved.
// dry=false WRITES b.workers / b._blocked / b.blockedReason / b.selfFeedGood and
// returns null; dry=true mutates nothing and returns the planned workers per index.
const STAFF_TIER_POP = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };
Sim.staffTown = function (town, dry) {
  const buildings = (town && Array.isArray(town.buildings)) ? town.buildings : [];
  const n = buildings.length;
  const plan = dry ? new Array(n).fill(0) : null;
  const pop = (town && town.pop) || {};
  const stock = (town && town.stock) || {};
  const E = CONFIG.econ || {};
  const N = CONFIG.needs;
  const baseTickMs = E.baseTickMs || 500;
  const prodIntervalSec = E.productionIntervalSec || { extractor: 8, processor: 12 };
  const blockedLast = E.staffBlockedLast !== false;
  const coverTicks = (E.selfFeedCoverSec || 0) * (1000 / baseTickMs);
  const releaseMult = Math.max(1, E.selfFeedReleaseMult || 1);
  const pool = {
    peasant: pop.peasants || 0,
    worker:  pop.workers  || 0,
    burgher: pop.burghers || 0,
    aristocrat: pop.aristocrats || 0,   // === CC: aristocrats staff nothing (no aristocrat producers) — harmless ===
  };
  // Lazily-built per-good cover (ticks of consumption on hand) for the self-feed pass.
  let houseHave = null, bcm = null, lcm = null;
  const coverCache = {};
  // Returns the cover in TICKS of good g (Infinity when nobody present eats it).
  const coverOf = (g) => {
    if (g in coverCache) return coverCache[g];
    if (!houseHave) {
      houseHave = {};
      for (const hb of buildings) {
        const hd = hb && CONFIG.buildings[hb.typeId];
        if (!hd || hd.kind !== "house" || hb.built === false || !hb.inbuf) continue;
        for (const k in hb.inbuf) houseHave[k] = (houseHave[k] || 0) + (hb.inbuf[k] || 0);
      }
      const one = { peasants: 1, workers: 1, burghers: 1, aristocrats: 1 };
      bcm = (typeof Buildings !== "undefined" && Buildings.basicConsumptionMult) ? Buildings.basicConsumptionMult(town) : one;
      lcm = (typeof Buildings !== "undefined" && Buildings.luxuryConsumptionMult) ? Buildings.luxuryConsumptionMult(town) : one;
    }
    let perTick = 0;   // the PRESENT tiers' draw of g (same formula as the consumption step)
    for (const tk in N.tiers) {
      const np = pop[tk] || 0, spec = N.tiers[tk];
      if (np <= 0 || !spec.perCapita[g]) continue;
      perTick += spec.perCapita[g] * np * (spec.basic.indexOf(g) >= 0 ? (bcm[tk] || 1) : (lcm[tk] || 1));
    }
    const have = (stock[g] || 0) + (houseHave[g] || 0);
    return (coverCache[g] = perTick > 0 ? have / perTick : Infinity);
  };
  // Classify: 0 unstaffable · 1 self-feed · 2 ☆ · 3 normal · 4 blocked ☆ · 5 blocked.
  const cls = new Uint8Array(n);
  const eff = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const b = buildings[i];
    if (!b) continue;
    const type = CONFIG.buildings[b.typeId];
    if (b.built === false || !type || type.kind === "house" || !type.workerTier || !(type.workerSlots > 0)) {
      if (!dry) {
        b.workers = 0;
        if (b._blocked) b._blocked = false;
        if (b.blockedReason) b.blockedReason = null;
        if (b.selfFeedGood) b.selfFeedGood = null;
      }
      continue;
    }
    // === RU-A: upgrade slotPlus adds effective worker slots ===
    const upg = (typeof Buildings !== "undefined" && Buildings.upgradeEffect) ? Buildings.upgradeEffect(b) : {};
    eff[i] = Math.max(0, type.workerSlots + (upg.slotPlus || 0) - (b.closedSlots || 0));
    // BLOCKED? (pending upgrade, or a full output store with hysteresis)
    let full = false;
    const out = type.output;
    if (out) {
      const storeCap = type.storeCap || E.buildingStoreCap || 30;
      const buf = (b._prodAcc || 0) + ((b.store && b.store[out.goodId]) || 0);
      if (b._blocked) {
        const sec = (typeof type.cycleSec === "number") ? type.cycleSec : (prodIntervalSec[type.kind] || 0);
        const batch = Math.max(1, (out.ratePerWorker || 0) * eff[i] * Math.round(sec * (1000 / baseTickMs)) * (upg.outputMult || 1));
        full = buf > Math.max(1, storeCap - batch);
      } else {
        full = buf >= storeCap - 1;
      }
    }
    const reason = b.pendingUpgrade ? "upgrading" : (full ? "full" : null);
    // SELF-FEED? engages under coverTicks; once engaged it holds until the cover is
    // selfFeedReleaseMult× that, so the crew doesn't bounce on every batch.
    const tierSpec = N.tiers[STAFF_TIER_POP[type.workerTier]];
    const sfGood = (out && !reason && coverTicks > 0 && tierSpec && tierSpec.basic.indexOf(out.goodId) >= 0 &&
      coverOf(out.goodId) < coverTicks * (b.selfFeedGood === out.goodId ? releaseMult : 1)) ? out.goodId : null;
    if (!dry) {
      if (!!b._blocked !== full) b._blocked = full;
      if ((b.blockedReason || null) !== reason) b.blockedReason = reason;
      if ((b.selfFeedGood || null) !== sfGood) b.selfFeedGood = sfGood;
    }
    if (sfGood) cls[i] = 1;
    else if (reason && blockedLast) cls[i] = b.priority ? 4 : 5;
    else cls[i] = b.priority ? 2 : 3;
  }
  for (let pass = 1; pass <= 5; pass++) {
    for (let i = 0; i < n; i++) {
      if (cls[i] !== pass) continue;
      const b = buildings[i];
      const tier = CONFIG.buildings[b.typeId].workerTier;
      const avail = pool[tier] || 0;
      const take = Math.min(eff[i], avail);
      const w = take > 0 ? take : 0;
      pool[tier] = avail - w;
      if (dry) plan[i] = w; else b.workers = w;
    }
  }
  return plan;
};
// === /DESIGN PASS #3 ========================================================

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
      if (town._buildT >= buildTicks) {
        town.built = true; town._buildT = buildTicks;
        town.builtTick = State.tick || 0;   // v0.52.1: city age for the alert/bubble grace windows (Sim.cityAgeTicks)
        // v0.51 SELL-GATE: on finishing construction, open a no-export grace window so a
        // brand-new city doesn't dump its founding stock before the player has placed its
        // huts (Trade reads town._sellHold; it ticks down below).
        town._sellHold = Math.max(0, Math.round(((CONFIG.trade && CONFIG.trade.sellGraceSec) || 30) * (1000 / baseTickMs)));
      }
      else continue;   // still building — skip everything else this tick
    }
    if ((town._sellHold || 0) > 0) town._sellHold--;   // count down the post-construction export grace
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
    // DESIGN PASS #6: CONSUMPTION demand (residents + processor inputs) is also tallied
    // on its own — Sim.priceFor prices against this rate only; construction bills and the
    // research share stay in `demand` (trade buy targets) but no longer pin prices.
    const consDemand = {};
    const addConsDemand = (g, amt) => { if (amt > 0) { consDemand[g] = (consDemand[g] || 0) + amt; addDemand(g, amt); } };

    // Work efficiency from the PREVIOUS tick's happiness (default 100 => 1.2x).
    const h = (typeof town.happiness === "number") ? town.happiness : 100;
    const hf = N.effMin + (Math.min(100, Math.max(0, h)) / 100) * (N.effMax - N.effMin);

    // --- 0. Worker assignment (derived every tick) ---------------------
    // DESIGN PASS #3: Sim.staffTown (above) — self-feed basics first when the city
    // runs low, then ☆, then array order, blocked producers (full store / upgrading)
    // last. Unbuilt buildings and houses get 0. Sim WRITES b.workers here.
    Sim.staffTown(town, false);

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
      // DESIGN PASS (#2) BOOTSTRAP: an unbuilt producer whose OWN construction needs
      // the good it makes (Lumberjack ← 10 wood), in a town with no BUILT producer of
      // that good, is served FIRST, and the remaining need of those producers is held
      // back from every other site — else "huts first" spent the start wood and the
      // Lumberjack could never be finished (wood 0 forever). `boot` stays null on the
      // hot path once a town has its producers built.
      let boot = null;   // gid → units reserved for unbuilt self-bootstrapping producers
      for (const b of buildings) {
        if (!b || b.built !== false) continue;
        const def = CONFIG.buildings[b.typeId];
        const og = def && def.output && def.output.goodId;
        if (!og) continue;
        const cn = Buildings.constructionNeed(b);
        if (!(cn[og] > 0)) continue;
        let hasBuilt = false;
        for (const o of buildings) {
          if (o && o.built !== false && CONFIG.buildings[o.typeId] && CONFIG.buildings[o.typeId].output &&
              CONFIG.buildings[o.typeId].output.goodId === og) { hasBuilt = true; break; }
        }
        if (hasBuilt) continue;
        if (!boot) boot = {};
        boot[og] = (boot[og] || 0) + cn[og];
        targets.push({ b, kind: "build", boot: og });
      }
      const nBoot = targets.length;
      const isBoot = (b) => { for (let i = 0; i < nBoot; i++) if (targets[i].b === b) return true; return false; };
      for (const b of buildings) if (b && b.built === false && b.priority && !(nBoot && isBoot(b))) targets.push({ b, kind: "build" });
      for (const b of buildings) if (b && b.pendingUpgrade && b.priority)   targets.push({ b, kind: "upgrade" });
      for (const b of buildings) if (b && b.built === false && !b.priority && !(nBoot && isBoot(b))) targets.push({ b, kind: "build" });
      for (const b of buildings) if (b && b.pendingUpgrade && !b.priority)  targets.push({ b, kind: "upgrade" });
      // v0.52.1 RESIDENT RESERVE: construction/upgrade sites (never a BOOTSTRAP producer —
      // it is the cure for that very shortage) leave ~CONFIG.town.basicReserveMin game-min
      // of the present tiers' BASIC use in the warehouse, so a Hut L2 can't take the
      // peasants' last wood. Computed only when a non-boot site exists (cold path).
      const resv = (targets.length > nBoot) ? Sim.basicReserve(town) : null;
      for (const t of targets) {
        const b = t.b;
        if (t.kind === "build" && !b.delivered) b.delivered = {};
        if (t.kind === "upgrade" && !b.pendingUpgrade.delivered) b.pendingUpgrade.delivered = {};
        const dst = t.kind === "build" ? b.delivered : b.pendingUpgrade.delivered;
        const need = t.kind === "build" ? Buildings.constructionNeed(b) : Buildings.upgradeConstructionNeed(b);
        for (const gid in need) {
          if (budget <= 0) break;
          const have = stock[gid] || 0;
          // BOOTSTRAP: non-producer sites may only take stock above the reserve(s) —
          // the unbuilt self-producer's remaining need + the residents' basic reserve.
          let hold = 0;
          if (!t.boot) {
            if (boot && boot[gid] > 0) hold += boot[gid];
            if (resv && resv[gid] > 0) hold += resv[gid];
          }
          const avail = hold > 0 ? Math.max(0, have - hold) : have;
          const move = Math.min(need[gid], avail, budget);
          if (move > 0) {
            stock[gid] = have - move; dst[gid] = (dst[gid] || 0) + move; budget -= move;
            if (t.boot === gid) boot[gid] = Math.max(0, boot[gid] - move);   // delivered → no longer reserved
          }
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
          if (!b.inbuf || typeof b.inbuf !== "object") b.inbuf = {};   // v0.51 §2: processors consume inputs from their OWN buffer (porters fill it)…
          for (const gid in inputs) {
            const qty = inputs[gid];
            // …preferring that buffer, but falling back to the town warehouse when it runs
            // thin mid-transit. Real gating is at the TOWN level (buffer + warehouse both
            // empty ⇒ genuine shortage), not a per-building logistics cliff.
            if (qty > 0) effW = Math.min(effW, ((b.inbuf[gid] || 0) + (stock[gid] || 0) - (b._inAcc[gid] || 0)) / qty);
            addConsDemand(gid, qty * w);
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
          if (!b.inbuf || typeof b.inbuf !== "object") b.inbuf = {};
          for (const gid in inputs) {
            let consumed = Math.floor(b._inAcc[gid] || 0);
            if (consumed > 0) {
              b._inAcc[gid] -= consumed;
              const fromBuf = Math.min(consumed, b.inbuf[gid] || 0);   // v0.51 §2: drain the processor's own input buffer first…
              if (fromBuf > 0) { b.inbuf[gid] = clamp0((b.inbuf[gid] || 0) - fromBuf); consumed -= fromBuf; }
              if (consumed > 0) stock[gid] = clamp0((stock[gid] || 0) - consumed);   // …then the town warehouse as the reserve
            }
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
    // v0.51 §2 (distribute): population eats from HOUSE input buffers, which porters
    // physically fill from the warehouse — so the town-wide "available" of a good is the
    // SUM across houses of b.inbuf[good], and consuming it drains those buffers. If
    // porters can't keep the houses supplied the town starves even with a full warehouse.
    const houseList = [];
    const houseAvail = {};
    for (const hb of buildings) {
      const hdef = hb && CONFIG.buildings[hb.typeId];
      if (!hdef || hdef.kind !== "house" || hb.built === false) continue;
      houseList.push(hb);
      if (hb.inbuf) for (const g in hb.inbuf) houseAvail[g] = (houseAvail[g] || 0) + (hb.inbuf[g] || 0);
    }
    const drainHouses = (g, n) => {
      let left = n;
      for (const h of houseList) {
        if (left <= 0) break;
        const has = (h.inbuf && h.inbuf[g]) || 0;
        if (has <= 0) continue;
        const t = Math.min(has, left);
        h.inbuf[g] = has - t; left -= t;
      }
    };
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
      for (const gid of spec.basic) { if (((houseAvail[gid] || 0) + (stock[gid] || 0)) <= 0) { basicsOk = false; break; } }
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
      addConsDemand(gid, req);
      const have = (houseAvail[gid] || 0) + (stock[gid] || 0);  // v0.51 §2: house buffers (porter-delivered) + the town warehouse as reserve
      gsatRaw[gid] = req > 0 ? Math.min(have, req) / req : 1;   // real fractional demand vs shelf
      const cc = (town._consCarry[gid] || 0) + (consume[gid] || 0);   // §6: accrue only GATED (physically-eaten) demand
      let take = Math.floor(cc);
      if (take > have) take = have;                             // clamp ≥0 — can't consume what isn't there
      if (take > 0) {                                           // drain the house buffers first, then the warehouse reserve
        const fromHouses = Math.min(take, houseAvail[gid] || 0);
        if (fromHouses > 0) drainHouses(gid, fromHouses);
        const fromStock = take - fromHouses;
        if (fromStock > 0) stock[gid] = clamp0((stock[gid] || 0) - fromStock);
      }
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
    // DESIGN PASS: tierNeedHappiness = the same eased per-tier value WITHOUT tempMod
    // (Give/Take). Victory reads min(tierHappiness, tierNeedHappiness), so a Give can
    // no longer bridge a missing luxury while a Take still delays the win. Derived
    // state: seeded from tierHappiness when absent, so no save migration.
    if (!town.tierNeedHappiness || typeof town.tierNeedHappiness !== "object") town.tierNeedHappiness = {};
    if (totalPop > 0) {
      let wsum = 0, hsum = 0;
      for (const tk of ["peasants", "workers", "burghers", "aristocrats"]) {   // === CC: 4 tiers ===
        const n = pop[tk] || 0;
        if (n <= 0) { town.tierHappiness[tk] = null; town.tierNeedHappiness[tk] = null; continue; }
        let bs = classSatTier(tk, N.tiers[tk].basic); if (bs === null) bs = 1;   // === CC: per-tier basic list ===
        let es = classSatTier(tk, N.tiers[tk].extra); if (es === null) es = 1;   // === CC: per-tier extra list ===
        const hNeed = N.basicHappy * bs + N.extraHappy * es;
        const ht = Math.max(0, Math.min(100, hNeed + tempMod));
        const prevT = (typeof town.tierHappiness[tk] === "number") ? town.tierHappiness[tk]
                    : (prevAgg != null ? prevAgg : ht);
        const eased = prevT + (ht - prevT) * N.happyEase;
        const htN = Math.max(0, Math.min(100, hNeed));
        const prevN = (typeof town.tierNeedHappiness[tk] === "number") ? town.tierNeedHappiness[tk] : prevT;
        town.tierNeedHappiness[tk] = prevN + (htN - prevN) * N.happyEase;
        town.tierHappiness[tk] = eased;
        wsum += n; hsum += n * eased;
      }
      town.happiness = wsum > 0 ? hsum / wsum : (prevAgg != null ? prevAgg : 0);
    } else {
      town.tierHappiness = { peasants: null, workers: null, burghers: null, aristocrats: null };  // === CC ===
      town.tierNeedHappiness = { peasants: null, workers: null, burghers: null, aristocrats: null };
      const hTarget = Math.max(0, Math.min(100,
        N.basicHappy * basicSat + N.extraHappy * extraSat + tempMod));
      const hPrev = (prevAgg != null) ? prevAgg : hTarget;
      town.happiness = hPrev + (hTarget - hPrev) * N.happyEase; // ease (snap on first read)
    }
    // === /PP-A ===

    // --- 4. Population from housing scales with happiness --------------
    // Effective target per tier = round(capacity × min(1, happiness/capacityFullAt)).
    // A tier grows toward its target; neither basics nor luxuries gate growth
    // directly — both feed happiness, which scales the target. Over target, the
    // tier declines after a sustained low streak.
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
    town.consDemand = consDemand;   // DESIGN PASS #6 (rebuilt every tick; old saves self-heal)
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
  // DESIGN PASS: track the kingdom's peak population for the victory recap.
  const popNow = Sim.kingdomPop(State);
  if (popNow > State.stats.peakPop) State.stats.peakPop = popNow;
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
  const dwellTicks = Math.max(1, Math.round((E.porterDwellSec || 0.3) * 1000 / (E.baseTickMs || 500)));   // enter/leave pause, in ticks
  const buildings = Array.isArray(town.buildings) ? town.buildings : [];
  // Fleet size: at least the town's base hauler count, but scaled so every producer
  // that currently has goods waiting can be served — otherwise a handful of porters
  // would starve a big city's producers (their stores fill, they stall). Capped so it
  // stays "a small fleet" and bounds work per tick.
  const base = (typeof Buildings !== "undefined" && Buildings.transporterCount)
    ? Buildings.transporterCount(town) : 4;
  let waiting = 0, consumers = 0;
  for (const b of buildings) {
    if (!b || b.built === false) continue;
    if (b.store) { for (const g in b.store) { if ((b.store[g] || 0) >= 1) { waiting++; break; } } }
    const def = CONFIG.buildings[b.typeId];
    if (def && (def.kind === "house" || def.inputs)) consumers++;   // distribute demand
  }
  const maxFleet = (E.porterMaxFleet || 20);
  // enough porters to both collect from producers with a load AND keep consumers'
  // input buffers topped up (roughly one porter per active job, capped).
  const need = Math.max(1, Math.min(maxFleet, Math.max(base, waiting + Math.ceil(consumers / 2))));

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
  // v0.51 §2 (distribute): the goods a building wants in its OWN input buffer, and the
  // per-good target (≈ inbufTargetSec game-seconds of its consumption, floored so a
  // porter load is worthwhile). Houses want their tier's basics + extras; processors
  // want their recipe inputs. Consumption/production read these buffers (below).
  const N2 = CONFIG.needs || {};
  const TIERKEY = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };
  const tgtSec = (E.inbufTargetSec || 30);
  const inbufWants = (b) => {
    const def = CONFIG.buildings[b.typeId];
    if (!def || def.built === false) return null;
    const out = {};
    if (def.kind === "house") {
      const spec = N2.tiers && N2.tiers[TIERKEY[def.houseTier]];
      if (!spec) return null;
      const cap = def.houseCapacity || 0;
      // Houses keep a lean buffer (about one porter carry-load) so a hut doesn't starve
      // between porter trips, without hoarding standing inventory that would spike the
      // import demand of a marginal-supply cluster into a boom-bust.
      for (const g of (spec.basic || [])) out[g] = Math.max(carryCap, Math.ceil((spec.perCapita[g] || 0) * cap * 2 * tgtSec));
      for (const g of (spec.extra || [])) out[g] = Math.max(carryCap, Math.ceil((spec.perCapita[g] || 0) * cap * 2 * tgtSec));
    } else if (def.inputs) {
      if ((b.workers || 0) <= 0) return null;   // an idle processor (no workers) consumes nothing → don't hoard inputs
      for (const g in def.inputs) out[g] = Math.max(carryCap, Math.ceil((def.inputs[g] || 0) * (def.workerSlots || 1) * 2 * tgtSec));
    } else return null;
    return out;
  };
  const anyBuildingAt = (q, r) => {
    for (const b of buildings) if (b && b.built !== false && b.q === q && b.r === r) return b;
    return null;
  };
  // Goods already committed to distribute (loaded on a porter en route to a consumer),
  // so a second porter doesn't over-draw the warehouse for the same good.
  const outbound = {};
  for (const p of P) if (p.phase === "toConsumer" && p.good) outbound[p.good] = (outbound[p.good] || 0) + p.qty;

  for (const p of P) {
    // Paused inside a building / at the centre (entering or leaving): just wait out the dwell.
    if ((p.wait || 0) > 0) { p.wait--; continue; }
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
        p.job = "collect";
        p.phase = "toBuilding"; p.prog = 0; p.good = best.g; p.qty = 0;
        p.bq = best.b.q; p.br = best.b.r; p.legTicks = legTicksFor(best.b.q, best.b.r);
        inbound[best.g] = (inbound[best.g] || 0) + bestQ;   // reserve the room now
        continue;
      }
      // No collect job → DISTRIBUTE: carry a consumable from the warehouse OUT to the
      // house/processor most below its input-buffer target (deterministic pick). The
      // load leaves the warehouse now; consumption/production reads that buffer.
      let db = null, dbQ = 0, dbKey = null;
      for (const b of buildings) {
        if (!b || b.built === false) continue;
        const wants = inbufWants(b);
        if (!wants) continue;
        for (const g in wants) {
          const have = (b.inbuf && b.inbuf[g]) || 0;
          const deficit = wants[g] - have;
          if (deficit < 1) continue;
          const wh = (stock[g] || 0) - (outbound[g] || 0);
          if (wh < 1) continue;
          const q = Math.min(carryCap, Math.floor(deficit), Math.floor(wh));
          if (q < 1) continue;
          const key = b.q + "," + b.r + ":" + g;
          if (q > dbQ || (q === dbQ && dbKey !== null && key < dbKey)) { db = { b: b, g: g }; dbQ = q; dbKey = key; }
        }
      }
      if (db) {
        stock[db.g] = (stock[db.g] || 0) - dbQ;                 // ship it out of the warehouse now
        p.job = "distribute";
        p.phase = "toConsumer"; p.prog = 0; p.good = db.g; p.qty = dbQ;
        p.bq = db.b.q; p.br = db.b.r; p.legTicks = legTicksFor(db.b.q, db.b.r);
        p.wait = dwellTicks;                                     // loading up at the warehouse before heading out
        outbound[db.g] = (outbound[db.g] || 0) + dbQ;
      }
      continue;
    }
    if (p.phase === "toConsumer") {
      if (p.leaving) { p.leaving = false; p.inside = false; p.phase = "idle"; p.good = null; p.job = null; continue; }   // left the building
      p.prog += 1 / (p.legTicks || 1);
      if (p.prog < 1) continue;
      p.prog = 1;
      if (!p.inside) { p.inside = true; p.wait = dwellTicks; continue; }   // step inside, pause, then unload
      const b = anyBuildingAt(p.bq, p.br);
      if (b) {
        if (!b.inbuf || typeof b.inbuf !== "object") b.inbuf = {};
        const wants = inbufWants(b);
        const target = (wants && wants[p.good]) || carryCap;
        const room = Math.max(0, target - (b.inbuf[p.good] || 0));
        const drop = Math.min(p.qty, room);
        if (drop > 0) { b.inbuf[p.good] = (b.inbuf[p.good] || 0) + drop; p.qty -= drop; }
      }
      if (p.qty > 0) { stock[p.good] = (stock[p.good] || 0) + p.qty; p.qty = 0; }   // return any leftover (never wasted)
      p.leaving = true; p.wait = dwellTicks;                  // pause before stepping back out
      continue;
    }
    if (p.phase === "toBuilding") {
      p.prog += 1 / (p.legTicks || 1);
      if (p.prog < 1) continue;
      p.prog = 1;
      if (!p.inside) { p.inside = true; p.wait = dwellTicks; continue; }   // step inside, pause, then load
      p.inside = false;
      const b = buildingAt(p.bq, p.br, p.good);
      const avail = (b && b.store && b.store[p.good]) || 0;
      const room = roomFor(p.good);   // recompute at pickup (inbound reservation already applied)
      const load = Math.min(carryCap, Math.floor(avail), Math.floor(room));
      if (load >= 1) {
        b.store[p.good] -= load; p.qty = load;
        p.phase = "toWarehouse"; p.prog = 0;
        p.wait = dwellTicks;                                   // pause (loaded) before stepping back out
      } else {
        p.phase = "idle"; p.good = null; p.qty = 0;   // nothing left to grab (another porter beat us)
      }
      continue;
    }
    if (p.phase === "toWarehouse") {
      p.prog += 1 / (p.legTicks || 1);
      if (p.prog < 1) continue;
      p.prog = 1;
      if (!p.inside) { p.inside = true; p.wait = dwellTicks; continue; }   // step into the warehouse, pause, then unload
      const room = roomFor(p.good);
      const drop = Math.min(p.qty, room);
      if (drop > 0) { stock[p.good] = (stock[p.good] || 0) + drop; p.qty -= drop; }
      if (p.qty <= 0) { p.phase = "idle"; p.good = null; p.qty = 0; p.inside = false; }
      // else: warehouse full — keep the cargo and retry next tick (never wasted).
      continue;
    }
    // Unknown phase (corrupt/legacy save): reset to idle.
    p.phase = "idle"; p.good = null; p.qty = 0; p.prog = 0; p.inside = false; p.leaving = false; p.wait = 0;
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
// { prog, working, starved, status, kind, out, intervalTicks } for a producing
// building, or null for a house / non-producer. `prog` (0..1) is how far this building
// is toward its next whole-unit batch RELEASE (the same _prodTimer countdown Sim.tick
// advances); at interval 0 (release-every-tick kinds) it reports the banked fraction.
// DESIGN PASS #13: `status` says WHY a bar isn't moving, mirroring Sim.tick's stall gates:
//   upgrading      — pending upgrade (production stops)
//   warehouseFull  — own store full AND the city warehouse holds storageCap of the good
//                    (porters have nowhere to unload — the real block, not the porters)
//   awaitingPorter — own store full, warehouse has room: a porter will empty it
//   noWorkers      — nobody staffed
//   noInputs       — a processor with < 1 whole unit of an input in its buffer + warehouse
//   working
// Staffing's "full" flag (b.blockedReason) also reads as full while it has pulled the crew off.
// When not working the DISPLAYED prog freezes at its last working value (a UI memo in a
// WeakMap — _prodTimer is never touched, so batch cadence and determinism are unchanged).
// The interval honours type.cycleSec (same rule as Sim.tick's intervalTicksFor).
const BP_FROZEN = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
Sim.buildingStatus = function (town, b) {
  const def = b && CONFIG.buildings[b.typeId];
  if (!def || !def.output || def.kind === "house") return null;
  if (b.pendingUpgrade || b.blockedReason === "upgrading") return "upgrading";
  const g = def.output.goodId;
  const storeCap = def.storeCap || (CONFIG.econ && CONFIG.econ.buildingStoreCap) || 30;
  const buffered = (b._prodAcc || 0) + ((b.store && b.store[g]) || 0);
  // Staffing's "full" flag holds (hysteresis) while porters drain the store; it only
  // reads as full while the crew is actually OFF the building — a staffed building
  // below storeCap passes Sim.tick's stall gate and really is producing (review fix).
  if (buffered >= storeCap - 1e-9 || (b.blockedReason === "full" && !((b.workers || 0) > 0))) {
    const cap = CONFIG.town && CONFIG.town.storageCap;
    const whStock = (town && town.stock && town.stock[g]) || 0;
    return (cap && whStock >= cap) ? "warehouseFull" : "awaitingPorter";
  }
  if (!((b.workers || 0) > 0) || b.built === false) return "noWorkers";
  if (def.inputs) {
    const stock = (town && town.stock) || {};
    for (const gid in def.inputs) {
      if (((b.inbuf && b.inbuf[gid]) || 0) + (stock[gid] || 0) < 1) return "noInputs";
    }
  }
  return "working";
};
Sim.buildingProgress = function (state, town, b) {
  const def = b && CONFIG.buildings[b.typeId];
  if (!def || !def.output || def.kind === "house") return null;
  const baseTickMs = (CONFIG.econ && CONFIG.econ.baseTickMs) || 500;
  const psec = (CONFIG.econ && CONFIG.econ.productionIntervalSec) || {};
  const sec = (typeof def.cycleSec === "number") ? def.cycleSec : (psec[def.kind] || 0);
  const intervalTicks = Math.round(sec * (1000 / baseTickMs));
  const status = Sim.buildingStatus(town, b);
  const working = status === "working";
  let prog = 0;
  if (intervalTicks > 0) {
    const t = (typeof b._prodTimer === "number") ? b._prodTimer : intervalTicks;
    prog = Math.max(0, Math.min(1, 1 - t / intervalTicks));
  } else {
    prog = Math.max(0, Math.min(1, (b._prodAcc || 0) % 1));
  }
  if (BP_FROZEN) {
    if (working) BP_FROZEN.set(b, prog);
    else prog = BP_FROZEN.has(b) ? BP_FROZEN.get(b) : 0;
  } else if (!working) prog = 0;
  return { prog, working, starved: status === "noInputs", status, intervalTicks, kind: def.kind, out: def.output.goodId };
};

// DESIGN PASS #13: nominal per-minute flows of one producer at its CURRENT staffing,
// mirroring Sim.tick's production maths: output = ratePerWorker × workers × hf (town
// happiness from the last tick) × research × upgrade outputMult; inputs = recipe qty ×
// workers (inputs are not scaled by hf/research/upgrades in Sim.tick). `workers`
// overrides the staffed count (e.g. full slots for a "when staffed" preview). Pure.
Sim.buildingRates = function (state, town, b, workers) {
  const def = b && CONFIG.buildings[b.typeId];
  if (!def || !def.output || def.kind === "house") return null;
  const E = CONFIG.econ || {}, N = CONFIG.needs || {};
  const perMin = E.ticksPerMin || 120;
  const w = (typeof workers === "number") ? workers : (b.pendingUpgrade ? 0 : (b.workers || 0));
  const h = (town && typeof town.happiness === "number") ? town.happiness : 100;
  const effMin = (typeof N.effMin === "number") ? N.effMin : 1, effMax = (typeof N.effMax === "number") ? N.effMax : 1;
  const hf = effMin + (Math.min(100, Math.max(0, h)) / 100) * (effMax - effMin);
  let resMult = 1;
  if (typeof Research !== "undefined" && Research.effect && state) {
    resMult = Research.effect(state, "globalOutput", 1);
    if (def.kind === "extractor") {
      resMult *= Research.effect(state, "extractorOutput", 1);
      if (MINE_TERRAINS[def.terrain]) resMult *= Research.effect(state, "mineOutput", 1);
    } else if (def.kind === "processor") {
      resMult *= Research.effect(state, "processorOutput", 1);
    }
  }
  const upgMult = (typeof Buildings !== "undefined" && Buildings.upgradeEffect) ? (Buildings.upgradeEffect(b).outputMult || 1) : 1;
  const inPerMin = {};
  if (def.inputs) for (const gid in def.inputs) inPerMin[gid] = def.inputs[gid] * w * perMin;
  return { good: def.output.goodId, outPerMin: def.output.ratePerWorker * w * hf * resMult * upgMult * perMin, inPerMin, workers: w, hf };
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
  const GOODMAPS = ["stock", "prices", "demand", "consDemand", "reserved", "produced", "consumed", "delivered", "need"];
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

// === NEED-COVERAGE (DESIGN PASS) === READ-ONLY shortage signals for the UI (map alert
// icons, speech bubbles, Event Log). One shared definition so the bubble, the alert
// and the Event Log agree. Iterates only the tiers PRESENT in the town (pop > 0) and
// their own per-tier basic/extra lists — never the cross-tier union. Stock counts the
// warehouse PLUS every house's porter-filled buffer (b.inbuf), since that is what the
// residents actually eat from. Never writes state; call it from a throttled poll, not
// per frame. Returns [{ gid, cls:"basic"|"extra", perMin, have, coverMin, inbound,
// hasLocalProducer, staffed, satEMA }], present tiers in order, basics before extras.
Sim.needCoverage = function (state, town) {
  const out = [];
  if (!town || !town.pop) return out;
  const pop = town.pop;
  const ticksPerMin = 60000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);   // 120
  const B = (typeof Buildings !== "undefined") ? Buildings : null;
  const bcm = (B && B.basicConsumptionMult) ? B.basicConsumptionMult(town) : {};
  const lcm = (B && B.luxuryConsumptionMult) ? B.luxuryConsumptionMult(town) : {};
  const idx = {};                                      // gid -> entry
  for (const k of Needs.tierKeys()) {
    const n = pop[k] || 0;
    if (!(n > 0)) continue;
    const spec = Needs.tier(k), rates = spec.perCapita || {};
    const addList = (list, cls, mult) => {
      for (const gid of list) {
        let e = idx[gid];
        if (!e) {
          e = idx[gid] = { gid, cls, perMin: 0, have: 0, coverMin: Infinity, inbound: 0,
            hasLocalProducer: false, staffed: false, satEMA: 1 };
          out.push(e);
        } else if (cls === "basic") e.cls = "basic";   // dual-role good: basic wins
        e.perMin += (rates[gid] || 0) * n * mult * ticksPerMin;
      }
    };
    addList(spec.basic, "basic", bcm[k] || 1);
    addList(spec.extra, "extra", lcm[k] || 1);
  }
  if (!out.length) return out;
  const stock = town.stock || {};
  for (const e of out) e.have = stock[e.gid] || 0;
  for (const b of (town.buildings || [])) {
    if (!b || b.built === false) continue;
    const def = CONFIG.buildings[b.typeId];
    if (!def) continue;
    if (def.kind === "house" && b.inbuf) {
      for (const gid in b.inbuf) if (idx[gid]) idx[gid].have += b.inbuf[gid] || 0;
    }
    const og = def.output && def.output.goodId;
    if (og && idx[og]) {
      idx[og].hasLocalProducer = true;
      if (b.workers > 0 || !(def.workerSlots > 0)) idx[og].staffed = true;
    }
  }
  // Units on the road TO this town: a buyer's own carts (cargo not yet unloaded) and
  // H sell-cargo other cities are shipping here.
  for (const c of (state && state.carts) || []) {
    if (!c || c.done || c.kind === "castle") continue;
    if (c.fromId === town.id) {
      const items = Array.isArray(c.cargo) ? c.cargo : (c.goodId ? [c] : []);
      for (const it of items) {
        const e = idx[it.goodId];
        if (e) e.inbound += Math.max(0, (it.qty || 0) - (it.unloaded || 0));
      }
    }
    if (c.toId === town.id && Array.isArray(c.sellCargo)) {
      for (const it of c.sellCargo) { const e = it && idx[it.goodId]; if (e) e.inbound += it.qty || 0; }
    }
  }
  const sat = town.satEMA || {};
  for (const e of out) {
    if (e.perMin > 0) e.coverMin = e.have / e.perMin;
    if (typeof sat[e.gid] === "number") e.satEMA = sat[e.gid];
  }
  return out;
};

// Basic-need shortage flags with hysteresis. `prev` = the flags returned last time
// ({gid:true}); returns a NEW object (never mutates town/prev). Raise: a present
// tier's basic good has < raiseCoverMin minutes of cover, nothing inbound, and no
// staffed local producer (or one that is visibly failing: satEMA < satOk). Clear:
// cover back above clearCoverMin (or the tier left). A city under construction has none.
Sim.shortageAlerts = function (state, town, prev, cov) {
  const next = {};
  if (!town || town.built === false) return next;
  const A = CONFIG.alerts || {};
  const raise = (typeof A.raiseCoverMin === "number") ? A.raiseCoverMin : 2;
  const clear = (typeof A.clearCoverMin === "number") ? A.clearCoverMin : 4;
  const satOk = (typeof A.satOk === "number") ? A.satOk : 0.9;
  for (const e of (cov || Sim.needCoverage(state, town))) {
    if (e.cls !== "basic" || !(e.perMin > 0)) continue;
    if (prev && prev[e.gid]) { if (!(e.coverMin > clear)) next[e.gid] = true; continue; }
    if (e.coverMin < raise && !(e.inbound > 0) && (!e.staffed || e.satEMA < satOk)) next[e.gid] = true;
  }
  return next;
};

// The present-tier BASIC good whose shelves (warehouse + homes) are empty right now,
// or null — the "We don't have any X!" speech bubble. Never a luxury, never another
// tier's basic (a peasant-only city can't complain about fish).
Sim.emptyBasicNeed = function (state, town, cov) {
  for (const e of (cov || Sim.needCoverage(state, town)))
    if (e.cls === "basic" && e.perMin > 0 && e.have < 0.5) return e.gid;
  return null;
};
// v0.52.1: units of each present-tier BASIC good the warehouse keeps back from
// construction/upgrade delivery — `mins` (default CONFIG.town.basicReserveMin) game-
// minutes of the residents' basic use (same per-capita × house-upgrade multiplier as
// consumption). Returns null when nothing is reserved (no residents / knob 0). Pure.
Sim.basicReserve = function (town, mins) {
  const m = (typeof mins === "number") ? mins : ((CONFIG.town && CONFIG.town.basicReserveMin) || 0);
  if (!(m > 0) || !town || !town.pop) return null;
  const tpm = 60000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);   // ticks per game-minute
  const bcm = (typeof Buildings !== "undefined" && Buildings.basicConsumptionMult) ? Buildings.basicConsumptionMult(town) : {};
  let out = null;
  for (const k of Needs.tierKeys()) {
    const n = town.pop[k] || 0;
    if (!(n > 0)) continue;
    const spec = Needs.tier(k), rates = spec.perCapita || {};
    for (const gid of spec.basic) {
      const r = (rates[gid] || 0) * n * (bcm[k] || 1) * tpm * m;
      if (r > 0) { if (!out) out = {}; out[gid] = (out[gid] || 0) + r; }
    }
  }
  return out;
};

// v0.52.1: game-ticks since the city finished construction (town.builtTick; older
// saves fall back to foundedTick + buildSec). Infinity when unknown (legacy cities are
// old news) and 0 while still under construction. Pure.
Sim.cityAgeTicks = function (state, town) {
  if (!town) return Infinity;
  if (town.built === false) return 0;
  const now = (state && typeof state.tick === "number") ? state.tick : 0;
  const tps = 1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);
  let at = null;
  if (typeof town.builtTick === "number") at = town.builtTick;
  else if (typeof town.foundedTick === "number") at = town.foundedTick + Math.round(((CONFIG.town && CONFIG.town.buildSec) || 10) * tps);
  return at === null ? Infinity : Math.max(0, now - at);
};
// v0.52.1: free homes for a pop tier (housing capacity − residents; may be negative).
Sim.freeHousing = function (state, town, tierKey) {
  if (!town || !tierKey) return 0;
  const cap = (typeof Buildings !== "undefined" && Buildings.housingCapacity) ? Buildings.housingCapacity(town, state) : {};
  return (cap[tierKey] || 0) - ((town.pop && town.pop[tierKey]) || 0);
};
// v0.52.1: is an idle producer (0 workers) worth an Event Log line? Not while its
// worker tier is still moving into free homes (free housing ≥ 0.5 — the normal
// first-minute ramp), nor within CONFIG.alerts.idleGraceSec of the city completing.
// Only when that tier's homes are full is "no free peasants — build Huts" true.
Sim.idleIsNews = function (state, town, def) {
  if (!town || !def) return false;
  const key = SIM_TIER_KEY[def.workerTier];
  if (key && Sim.freeHousing(state, town, key) >= 0.5) return false;
  const tps = 1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);
  const grace = ((CONFIG.alerts && typeof CONFIG.alerts.idleGraceSec === "number") ? CONFIG.alerts.idleGraceSec : 60) * tps;
  return Sim.cityAgeTicks(state, town) >= grace;
};
// v0.52.1: the "We dream of X — research Y" bubble waits until a luxury's tier really
// lives here (> CONFIG.alerts.dreamMinPop residents) and the city is settled
// (≥ dreamMinAgeSec game-s since completion). Returns the tier keys that may dream.
Sim.dreamTiers = function (state, town) {
  const out = [];
  if (!town || !town.pop || town.built === false) return out;
  const A = CONFIG.alerts || {};
  const tps = 1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);
  const minAge = ((typeof A.dreamMinAgeSec === "number") ? A.dreamMinAgeSec : 150) * tps;
  if (Sim.cityAgeTicks(state, town) < minAge) return out;
  const minPop = (typeof A.dreamMinPop === "number") ? A.dreamMinPop : 1;
  for (const k of Needs.tierKeys()) if ((town.pop[k] || 0) > minPop) out.push(k);
  return out;
};
// === /NEED-COVERAGE ===
// === SIM-CORE END ===
