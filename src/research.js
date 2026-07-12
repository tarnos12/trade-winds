// === RESEARCH-CORE START ===  (P4-A / slot #2 — research tree data + pure engine)
// Pure data + pure functions only (GDD §7.1). No DOM, no canvas, no Math.random,
// no I/O — deterministic so it runs headless and inside the fixed timestep.
// Contract: state.research = { unlocked:[ids], active:<id|null>, progress:<ticks>,
// spent:<gold paid so far on the active node> }.
//
// 3 core branches × 5 nodes + a "development" branch (RU-A: 4 per-building
// upgrade-unlock nodes, chained). Each node:
//   { id, branch, name, desc, cost(gold), timeTicks, prereqs:[ids], effect }
// `effect` is a plain data bag of queryable flags/multipliers. This slice does
// NOT wire the effects into Sim/Trade/Buildings (those live in other fenced
// regions) — instead it keeps them as data any system can read later via
// Research.has(state, id) / Research.effect(state, key).
Object.assign(CONFIG, {
  research: [
    // === RT-A: tiered tree nodes. Kingdom nodes keep their ids + gameplay
    // effects and become the band:"kingdom" side column (3 chains × 5). Building
    // gating moved OUT to per-building unlock_* / per-level upg_* nodes below;
    // band/kind/pos are additive layout+semantic fields RT-B renders. ===
    // ---- Production (kingdom): bigger yields from the same land/workers ----
    { id: "crop_rotation",   branch: "production",     band: "kingdom", kind: "kingdom", pos: { col: 0, row: 0 }, name: "Crop Rotation",     desc: "Farms & extractors yield more from every worker.", cost: 150,  timeTicks: 20, prereqs: [],                 effect: { extractorOutput: 1.2 } },
    { id: "deep_veins",      branch: "production",     band: "kingdom", kind: "kingdom", pos: { col: 0, row: 1 }, name: "Deep Veins",        desc: "Miners & quarries strike richer seams.",           cost: 350,  timeTicks: 30, prereqs: ["crop_rotation"],  effect: { mineOutput: 1.25 } },
    { id: "guild_halls",     branch: "production",     band: "kingdom", kind: "kingdom", pos: { col: 0, row: 2 }, name: "Guild Halls",       desc: "Workshops (processors) craft faster.",             cost: 700,  timeTicks: 45, prereqs: ["deep_veins"],     effect: { processorOutput: 1.2 } },
    { id: "master_crafts",   branch: "production",     band: "kingdom", kind: "kingdom", pos: { col: 0, row: 3 }, name: "Master Craftsmen",  desc: "Tier-3 processors gain a further boost.",          cost: 1400, timeTicks: 60, prereqs: ["guild_halls"],    effect: { processorOutput: 1.35 } },
    { id: "industrialize",   branch: "production",     band: "kingdom", kind: "kingdom", pos: { col: 0, row: 4 }, name: "Industrialization", desc: "A global lift to all production.",                  cost: 2800, timeTicks: 80, prereqs: ["master_crafts"],  effect: { globalOutput: 1.25 } },
    // ---- Logistics (kingdom): move more goods, further, cheaper ----
    { id: "paved_roads",     branch: "logistics",      band: "kingdom", kind: "kingdom", pos: { col: 1, row: 0 }, name: "Paved Roads",       desc: "Carts travel roads faster.",                       cost: 200,  timeTicks: 20, prereqs: [],                 effect: { paved_roads: true } },
    { id: "larger_carts",    branch: "logistics",      band: "kingdom", kind: "kingdom", pos: { col: 1, row: 1 }, name: "Larger Carts",      desc: "Each cart hauls a bigger load.",                   cost: 400,  timeTicks: 30, prereqs: ["paved_roads"],    effect: { cartCapacity: 1.5 } },
    { id: "extra_caravan",   branch: "logistics",      band: "kingdom", kind: "kingdom", pos: { col: 1, row: 2 }, name: "Extra Caravan",     desc: "One more cart can be on the road at once.",        cost: 800,  timeTicks: 45, prereqs: ["larger_carts"],   effect: { extraCarts: 1 } },
    { id: "warehousing",     branch: "logistics",      band: "kingdom", kind: "kingdom", pos: { col: 1, row: 3 }, name: "Warehousing",       desc: "The King's warehouse holds more goods.",           cost: 1500, timeTicks: 60, prereqs: ["extra_caravan"],  effect: { warehouseCap: 200 } },
    { id: "trade_network",   branch: "logistics",      band: "kingdom", kind: "kingdom", pos: { col: 1, row: 4 }, name: "Trade Networks",    desc: "Two more caravans join the roads.",                cost: 3000, timeTicks: 80, prereqs: ["warehousing"],    effect: { extraCarts: 2 } },
    // ---- Administration (kingdom): squeeze more coin & growth from the realm ----
    { id: "tax_ledgers",     branch: "administration", band: "kingdom", kind: "kingdom", pos: { col: 2, row: 0 }, name: "Tax Ledgers",       desc: "A little extra tariff on every trade.",            cost: 200,  timeTicks: 20, prereqs: [],                 effect: { tariffBonus: 0.03 } },
    { id: "tariff_office",   branch: "administration", band: "kingdom", kind: "kingdom", pos: { col: 2, row: 1 }, name: "Tariff Office",     desc: "Unlocks a slider to set the tariff rate.",         cost: 450,  timeTicks: 30, prereqs: ["tax_ledgers"],     effect: { tariff_slider: true } },
    { id: "royal_census",    branch: "administration", band: "kingdom", kind: "kingdom", pos: { col: 2, row: 2 }, name: "Royal Census",      desc: "Houses shelter more population.",                  cost: 900,  timeTicks: 45, prereqs: ["tariff_office"],   effect: { housingBonus: 1.15 } },
    { id: "town_charters",   branch: "administration", band: "kingdom", kind: "kingdom", pos: { col: 2, row: 3 }, name: "Town Charters",     desc: "Every town gains an extra build slot.",            cost: 1700, timeTicks: 60, prereqs: ["royal_census"],   effect: { slotBonus: 1 } },
    { id: "bureaucracy",     branch: "administration", band: "kingdom", kind: "kingdom", pos: { col: 2, row: 4 }, name: "Grand Bureaucracy", desc: "A hefty standing tariff bonus.",                   cost: 3400, timeTicks: 80, prereqs: ["town_charters"],  effect: { tariffBonus: 0.07 } },

    // ---- Unlock nodes: one per non-startUnlocked building (effect:{} — gate
    // only). band = building's tier; branch mirrors band for legacy grouping. ----
    // === TREELAYOUT (edge-length fix): pos.col = node's topological layer WITHIN
    // its band (band roots = col 0; a node = 1 + max col of its same-band prereqs)
    // so every within-band prereq edge spans exactly 1 column — no long diagonals.
    // pos.row spreads siblings (barycentric-ish, de-collided). Cross-band children
    // sit at a col near their parent's so those edges stay near-vertical (span ≤2).
    // Anchors/upgrade pips mirror their building card's pos (see TT_STARTERS). ===
    { id: "unlock_quarry",   branch: "peasant", band: "peasant", kind: "unlock", buildingId: "quarry",   pos: { col: 0, row: 1 }, name: "Quarry",   desc: "Unlocks the Quarry.",   cost: 120,  timeTicks: 12, prereqs: [],                  effect: {} },
    { id: "unlock_fishery",  branch: "peasant", band: "peasant", kind: "unlock", buildingId: "fishery",  pos: { col: 0, row: 2 }, name: "Fishery",  desc: "Unlocks the Fishery.",  cost: 120,  timeTicks: 12, prereqs: [],                  effect: {} },
    { id: "unlock_shepherd", branch: "peasant", band: "peasant", kind: "unlock", buildingId: "shepherd", pos: { col: 0, row: 3 }, name: "Sheep Farm", desc: "Unlocks the Sheep Farm.", cost: 180,  timeTicks: 14, prereqs: [],                  effect: {} },   // === TV2-FIX: root node — wool is a core peasant need, not gated behind fish ===
    { id: "unlock_mill",     branch: "worker",  band: "worker",  kind: "unlock", buildingId: "mill",     pos: { col: 0, row: 0 }, name: "Mill",     desc: "Unlocks the Mill.",     cost: 300,  timeTicks: 20, prereqs: ["unlock_quarry"],   effect: {} },
    { id: "unlock_cottage",  branch: "worker",  band: "worker",  kind: "unlock", buildingId: "cottage",  pos: { col: 0, row: 3 }, name: "Cottage",  desc: "Unlocks the Cottage.",  cost: 300,  timeTicks: 20, prereqs: ["unlock_quarry"],   effect: {} },
    { id: "unlock_brewery",  branch: "worker",  band: "worker",  kind: "unlock", buildingId: "brewery",  pos: { col: 1, row: 0 }, name: "Brewery",  desc: "Unlocks the Brewery.",  cost: 350,  timeTicks: 22, prereqs: ["unlock_mill"],     effect: {} },
    { id: "unlock_bakery",   branch: "worker",  band: "worker",  kind: "unlock", buildingId: "bakery",   pos: { col: 1, row: 1 }, name: "Bakery",   desc: "Unlocks the Bakery.",   cost: 500,  timeTicks: 28, prereqs: ["unlock_mill"],     effect: {} },
    // === TV2: worker-band unlock nodes — mines/pit/brickworks + wheat farm ===
    { id: "unlock_iron_mine",  branch: "worker", band: "worker", kind: "unlock", buildingId: "iron_mine",  pos: { col: 0, row: 1 }, name: "Iron Mine",  desc: "Unlocks the Iron Mine.",  cost: 200, timeTicks: 15, prereqs: ["unlock_quarry"],     effect: {} },
    { id: "unlock_coal_mine",  branch: "worker", band: "worker", kind: "unlock", buildingId: "coal_mine",  pos: { col: 1, row: 2 }, name: "Coal Mine",  desc: "Unlocks the Coal Mine.",  cost: 260, timeTicks: 18, prereqs: ["unlock_iron_mine"],  effect: {} },
    { id: "unlock_gold_mine",  branch: "worker", band: "worker", kind: "unlock", buildingId: "gold_mine",  pos: { col: 1, row: 3 }, name: "Gold Mine",  desc: "Unlocks the Gold Mine.",  cost: 400, timeTicks: 24, prereqs: ["unlock_iron_mine"],  effect: {} },
    { id: "unlock_clay_pit",   branch: "worker", band: "worker", kind: "unlock", buildingId: "clay_pit",   pos: { col: 0, row: 2 }, name: "Clay Pit",   desc: "Unlocks the Clay Pit.",   cost: 220, timeTicks: 16, prereqs: ["unlock_quarry"],     effect: {} },
    { id: "unlock_brickworks", branch: "worker", band: "worker", kind: "unlock", buildingId: "brickworks", pos: { col: 1, row: 4 }, name: "Brickworks", desc: "Unlocks the Brickworks.", cost: 300, timeTicks: 20, prereqs: ["unlock_clay_pit"],    effect: {} },
    { id: "unlock_farm",       branch: "peasant", band: "peasant", kind: "unlock", buildingId: "farm",       pos: { col: 1, row: 1 }, name: "Wheat Farm", desc: "Unlocks the Wheat Farm.", cost: 250, timeTicks: 16, prereqs: ["unlock_quarry"],   effect: {} },
    // === CC: new WORKER-band processor unlock nodes (all roots → col 0) ===
    { id: "unlock_tailoring",       branch: "worker", band: "worker", kind: "unlock", buildingId: "tailoring",       pos: { col: 0, row: 5 }, name: "Tailoring",        desc: "Unlocks Tailoring (wool → clothes).",       cost: 350, timeTicks: 22, prereqs: ["unlock_shepherd"],   effect: {} },
    { id: "unlock_charcoal_burner", branch: "worker", band: "worker", kind: "unlock", buildingId: "charcoal_burner", pos: { col: 0, row: 6 }, name: "Charcoal Burning",  desc: "Unlocks Charcoal Burning (wood → coal).",   cost: 300, timeTicks: 20, prereqs: [],                    effect: {} },
    { id: "unlock_stonetool_maker", branch: "worker", band: "worker", kind: "unlock", buildingId: "stonetool_maker", pos: { col: 0, row: 4 }, name: "StoneTools Maker",  desc: "Unlocks the StoneTools Maker.",             cost: 380, timeTicks: 24, prereqs: ["unlock_quarry"],     effect: {} },
    { id: "unlock_oil_maker",       branch: "worker", band: "worker", kind: "unlock", buildingId: "oil_maker",       pos: { col: 0, row: 7 }, name: "Oil Maker",        desc: "Unlocks the Oil Maker (fish → oil).",       cost: 360, timeTicks: 22, prereqs: ["unlock_fishery"],    effect: {} },
    { id: "unlock_manor",    branch: "burgher", band: "burgher", kind: "unlock", buildingId: "manor",    pos: { col: 0, row: 0 }, name: "Manor",    desc: "Unlocks the Manor.",    cost: 800,  timeTicks: 40, prereqs: ["unlock_cottage"],  effect: {} },
    // === CC: CITIZEN-band processor unlock nodes ===
    { id: "unlock_forge",            branch: "burgher", band: "burgher", kind: "unlock", buildingId: "forge",            pos: { col: 0, row: 1 }, name: "Forge",         desc: "Unlocks the Forge (wood + iron → iron tool).",     cost: 500,  timeTicks: 28, prereqs: ["unlock_iron_mine"],                    effect: {} },
    { id: "unlock_armory",           branch: "burgher", band: "burgher", kind: "unlock", buildingId: "armory",           pos: { col: 1, row: 0 }, name: "Armory",        desc: "Unlocks the Armory (coal + iron → iron armor).",   cost: 700,  timeTicks: 34, prereqs: ["unlock_forge", "unlock_coal_mine"],       effect: {} },
    { id: "unlock_pottery_workshop", branch: "burgher", band: "burgher", kind: "unlock", buildingId: "pottery_workshop", pos: { col: 0, row: 2 }, name: "Pottery",       desc: "Unlocks the Pottery (clay → pottery).",            cost: 500,  timeTicks: 28, prereqs: ["unlock_clay_pit"],                     effect: {} },
    { id: "unlock_distillery",       branch: "burgher", band: "burgher", kind: "unlock", buildingId: "distillery",       pos: { col: 1, row: 2 }, name: "Distillery",    desc: "Unlocks the Distillery (mead + pottery → brandy).",cost: 800,  timeTicks: 40, prereqs: ["unlock_brewery", "unlock_pottery_workshop"], effect: {} },
    { id: "unlock_goldsmith",        branch: "burgher", band: "burgher", kind: "unlock", buildingId: "goldsmith",        pos: { col: 1, row: 1 }, name: "Goldsmith",     desc: "Unlocks the Goldsmith (gold + iron tool → ring).", cost: 900,  timeTicks: 44, prereqs: ["unlock_gold_mine", "unlock_forge"],        effect: {} },
    { id: "unlock_lamp_maker",       branch: "burgher", band: "burgher", kind: "unlock", buildingId: "lamp_maker",       pos: { col: 0, row: 3 }, name: "Lamp Maker",    desc: "Unlocks the Lamp Maker (oil → lamp).",             cost: 600,  timeTicks: 32, prereqs: ["unlock_oil_maker"],                    effect: {} },
    { id: "unlock_carpentry",        branch: "burgher", band: "burgher", kind: "unlock", buildingId: "carpentry",        pos: { col: 0, row: 4 }, name: "Carpentry",     desc: "Unlocks Carpentry (planks + oil → chairs).",       cost: 700,  timeTicks: 36, prereqs: ["unlock_oil_maker"],                    effect: {} },
    { id: "unlock_luxury_tailor",    branch: "burgher", band: "burgher", kind: "unlock", buildingId: "luxury_tailor",    pos: { col: 2, row: 1 }, name: "Luxury Tailor", desc: "Unlocks the Luxury Tailor (clothes + ring → finery).", cost: 1100, timeTicks: 50, prereqs: ["unlock_tailoring", "unlock_goldsmith"],  effect: {} },
    // === CC: ARISTOCRAT band — home unlock + capacity ladder ===
    { id: "unlock_aristocrat_home", branch: "aristocrat", band: "aristocrat", kind: "unlock", buildingId: "aristocrat_home", pos: { col: 0, row: 0 }, name: "Aristocrats Home", desc: "Unlocks the Aristocrats Home.", cost: 1500, timeTicks: 60, prereqs: ["unlock_manor", "unlock_luxury_tailor"], effect: {} },

    // ---- Upgrade nodes: one per ladder level (replaces the 4 dev nodes). l2
    // prereq = [] for these startUnlocked buildings; l3/l4 chain from l2/l3. ----
    { id: "upg_hut_l2",        branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "hut",        level: 2, pos: { col: 0, row: 0 }, name: "Sturdy Hut",     desc: "Unlocks the Hut level 2 upgrade.",        cost: 150, timeTicks: 12, prereqs: [],                        effect: {} },
    { id: "upg_hut_l3",        branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "hut",        level: 3, pos: { col: 0, row: 0 }, name: "Fine Hut",       desc: "Unlocks the Hut level 3 upgrade.",        cost: 250, timeTicks: 16, prereqs: ["upg_hut_l2"],            effect: {} },
    { id: "upg_hut_l4",        branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "hut",        level: 4, pos: { col: 0, row: 0 }, name: "Grand Hut",      desc: "Unlocks the Hut level 4 upgrade.",        cost: 400, timeTicks: 22, prereqs: ["upg_hut_l3"],            effect: {} },
    { id: "upg_lumberjack_l2", branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "lumberjack", level: 2, pos: { col: 1, row: 0 }, name: "Sharpened Axes", desc: "Unlocks the Lumberjack level 2 upgrade.", cost: 200, timeTicks: 14, prereqs: [],                        effect: {} },
    { id: "upg_lumberjack_l3", branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "lumberjack", level: 3, pos: { col: 1, row: 0 }, name: "Logging Camp",   desc: "Unlocks the Lumberjack level 3 upgrade.", cost: 400, timeTicks: 22, prereqs: ["upg_lumberjack_l2"],     effect: {} },
    { id: "upg_farm_l2",       branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "farm",       level: 2, pos: { col: 1, row: 1 }, name: "Better Plows",   desc: "Unlocks the Farm level 2 upgrade.",       cost: 200, timeTicks: 14, prereqs: ["unlock_farm"],           effect: {} },
    { id: "upg_farm_l3",       branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "farm",       level: 3, pos: { col: 1, row: 1 }, name: "Great Estate",   desc: "Unlocks the Farm level 3 upgrade.",       cost: 400, timeTicks: 22, prereqs: ["upg_farm_l2"],           effect: {} },
    { id: "upg_sawmill_l2",    branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "sawmill",    level: 2, pos: { col: 3, row: 0 }, name: "Water Wheel",    desc: "Unlocks the Sawmill level 2 upgrade.",    cost: 250, timeTicks: 16, prereqs: [],                        effect: {} },
    { id: "upg_sawmill_l3",    branch: "peasant", band: "peasant", kind: "upgrade", buildingId: "sawmill",    level: 3, pos: { col: 3, row: 0 }, name: "Great Sawmill",  desc: "Unlocks the Sawmill level 3 upgrade.",    cost: 500, timeTicks: 26, prereqs: ["upg_sawmill_l2"],        effect: {} },
    // === ARISTOFIX: no aristocrat_home upgrade nodes (1 slot, non-upgradable). ===
    // === /RT-A + /CC =======================================================
  ],
});

// Sim ticks per game-second — the per-second material metering below advances one
// "second" every this-many Sim ticks (2 at the 500ms base clock). Derived from
// CONFIG.econ so a different baseTickMs stays correct; never hard-coded.
const TICKS_PER_SEC = Math.max(1, Math.round(1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500)));

// Pure research engine. All queries take `state` and never mutate CONFIG.
const Research = {
  // The blank shape newGame/loadGame should install (also used to repair saves).
  // Slice A: per-second metering bag — completedSec (whole game-seconds drained),
  // subTick (0..TICKS_PER_SEC accumulator), consumed (gid→qty already drawn from
  // castleStock for the active node). No more gold `progress`/`spent`.
  fresh() { return { unlocked: [], active: null, queue: [], completedSec: 0, subTick: 0, consumed: {} }; },
  // Defensive normalizer for loaded/foreign data.
  normalize(r) {
    const f = Research.fresh();
    if (!r || typeof r !== "object") return f;
    // === RT-A: migrate retired development-branch ids → their per-level upgrade
    // nodes so old saves keep their unlocked value. Expand, then drop unknowns,
    // then dedupe. Legacy kingdom ids survive the filter unchanged. ===
    const MIGRATE_MAP = {
      hut_upgrades:        ["upg_hut_l2", "upg_hut_l3", "upg_hut_l4"],
      lumberjack_upgrades: ["upg_lumberjack_l2", "upg_lumberjack_l3"],
      farm_upgrades:       ["upg_farm_l2", "upg_farm_l3"],
      sawmill_upgrades:    ["upg_sawmill_l2", "upg_sawmill_l3"],
      unlock_miner:        ["unlock_iron_mine"],   // === TV2: renamed node ===
      // === CC: retired building unlock nodes → their functional replacements.
      // Forge (citizen) replaces the Smelter (iron_tool); Tailoring (worker)
      // replaces the Weaver (clothes). Old saves keep an equivalent unlock. ===
      unlock_smelter:      ["unlock_forge"],
      unlock_weaver:       ["unlock_tailoring"],
    };
    const rawUnlocked = Array.isArray(r.unlocked) ? r.unlocked : [];
    const expanded = [];
    for (const id of rawUnlocked) {
      if (MIGRATE_MAP[id]) expanded.push(...MIGRATE_MAP[id]);
      else expanded.push(id);
    }
    f.unlocked = [...new Set(expanded.filter(id => !!Research.get(id)))];
    // === /RT-A ===
    f.active = (typeof r.active === "string" && Research.get(r.active)) ? r.active : null;
    // === RT-A2: sanitize the research queue (ordered node ids). Drop
    // unknown/duplicate ids, ids already unlocked, and the currently-active id;
    // coerce a non-array (or missing, legacy save) to []. f.active/f.unlocked are
    // already computed above, so the collision checks are valid here. ===
    const rawQ = Array.isArray(r.queue) ? r.queue : [];
    const seenQ = new Set();
    f.queue = rawQ.filter(id =>
      typeof id === "string" && Research.get(id) &&
      f.unlocked.indexOf(id) < 0 && id !== f.active &&
      !seenQ.has(id) && (seenQ.add(id), true));
    // === /RT-A2 ===
    // === Slice A: sanitize the per-second metering fields against the active node.
    // No valid active project → zeroed. consumed keeps only real material gids,
    // each clamped to that node's requirement. ===
    if (f.active) {
      const M = (Research.get(f.active) || {}).materials || {};
      f.completedSec = (typeof r.completedSec === "number" && r.completedSec >= 0) ? Math.floor(r.completedSec) : 0;
      f.subTick = (typeof r.subTick === "number" && r.subTick >= 0) ? Math.min(TICKS_PER_SEC, Math.floor(r.subTick)) : 0;
      f.consumed = {};
      const rc = (r && typeof r.consumed === "object" && r.consumed) || {};
      for (const gid in M) {
        const v = rc[gid];
        if (typeof v === "number" && v > 0) f.consumed[gid] = Math.min(M[gid], Math.floor(v));
      }
    } else {
      f.completedSec = 0; f.subTick = 0; f.consumed = {};
    }
    return f;
  },
  get(id) {
    const list = CONFIG.research || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  },
  all() { return CONFIG.research || []; },
  branches() { return ["production", "logistics", "administration"]; },   // RT-A: kingdom side-column branches (dropped development)
  nodesIn(branch) { return Research.all().filter(n => n.branch === branch); },
  // === RT-A: bands API — RT-B renders the tiered tree by band. ===
  bands() { return ["peasant", "worker", "burgher", "aristocrat", "kingdom"]; },   // === CC: 4th pop band ===
  nodesInBand(band) { return Research.all().filter(n => n.band === band); },
  // === /RT-A ===

  has(state, id) {
    return !!(state && state.research && state.research.unlocked.indexOf(id) >= 0);
  },
  isActive(state, id) {
    return !!(state && state.research && state.research.active === id);
  },
  prereqsMet(state, node) {
    return (node.prereqs || []).every(p => Research.has(state, p));
  },
  // Available = prereqs met and not already unlocked/active (ignores funds).
  isAvailable(state, id) {
    const node = Research.get(id);
    if (!node) return false;
    if (Research.has(state, id) || Research.isActive(state, id)) return false;
    return Research.prereqsMet(state, node);
  },
  // canStart requires only: state has research, no other active project, not
  // already unlocked, prereqs met. Slice A dropped the gold gate — research no
  // longer costs treasury; it's paid in MATERIALS metered per game-second in tick().
  canStart(state, id) {
    const node = Research.get(id);
    if (!node || !state || !state.research) return false;
    if (state.research.active) return false;         // one project at a time
    if (Research.has(state, id)) return false;       // already researched
    if (!Research.prereqsMet(state, node)) return false;
    return true;
  },
  // Deduct NOTHING at start — materials are drawn from state.castleStock over time
  // in tick() (Slice A). Resets the per-second metering bag for the new project.
  start(state, id) {
    if (!Research.canStart(state, id)) return false;
    state.research.active = id;
    state.research.completedSec = 0;
    state.research.subTick = 0;
    state.research.consumed = {};
    return true;
  },

  // === Slice A: Research Center helpers ===================================
  // Center level: 0 when there is no center or it's still under construction
  // (research PAUSED); otherwise the center's level (default 1).
  centerLevel(state) {
    if (!state || !state.researchCenter || !state.researchCenter.built) return 0;
    const lvl = state.researchCenter.level || 1;
    const max = (((CONFIG.researchCenter && CONFIG.researchCenter.levels) || []).length - 1) || 1;
    return Math.min(Math.max(1, max), Math.max(1, lvl));   // clamp: never index past the levels table
  },
  // Research SPEED (materials/game-second) from the center's level; 0 = paused.
  centerSpeed(state) {
    const lvl = Research.centerLevel(state);
    const cfg = lvl ? (CONFIG.researchCenter.levels[lvl]) : null;
    return cfg ? cfg.speed : 0;   // defensive: a missing level yields 0, never throws
  },
  // Pure per-second equal-DRAIN plan for a node's materials at speed S. Returns
  // { T, rate, gids }: gids = the material ids; T = whole game-seconds to finish
  // (ceil(maxAmt / S)); rate[gid] = the per-second draw of gid, scaled so the
  // LARGEST material empties exactly at S/sec and everything finishes together.
  // Empty materials → { T:0, rate:{}, gids:[] }.
  consumptionPlan(materials, S) {
    const gids = Object.keys(materials || {});
    if (!gids.length) return { T: 0, rate: {}, gids: [] };
    let maxAmt = 0;
    for (const g of gids) if (materials[g] > maxAmt) maxAmt = materials[g];
    const T = Math.ceil(maxAmt / S);
    const rate = {};
    for (const g of gids) rate[g] = materials[g] * S / maxAmt;
    return { T, rate, gids };
  },
  // Positive remaining build-materials for a PLACED, UNBUILT center (cost minus
  // already-delivered). {} when there's no center, it's built, or nothing's left.
  centerConstructionNeed(state) {
    const c = state && state.researchCenter;
    if (!c || c.built) return {};
    const cost = (CONFIG.researchCenter.build && CONFIG.researchCenter.build.cost) || {};
    const out = {};
    for (const gid in cost) {
      const rem = cost[gid] - ((c.delivered && c.delivered[gid]) || 0);
      if (rem > 0) out[gid] = rem;
    }
    return out;
  },
  // Positive remaining upgrade-materials for a built center with a pendingUpgrade
  // (cost minus delivered), EXCLUDING the gold key (gold is paid at purchase).
  centerUpgradeNeed(state) {
    const c = state && state.researchCenter;
    if (!c || !c.built || !c.pendingUpgrade) return {};
    const cost = c.pendingUpgrade.cost || {};
    const del = c.pendingUpgrade.delivered || {};
    const out = {};
    for (const gid in cost) {
      if (gid === "gold") continue;
      const rem = cost[gid] - (del[gid] || 0);
      if (rem > 0) out[gid] = rem;
    }
    return out;
  },
  // Pure construction/upgrade DELIVERY step: moves materials FROM state.castleStock
  // into the center's delivered maps, up to deliveryRate items/tick total. When the
  // construction need empties → built=true; when a pending upgrade's need empties →
  // apply the new level and clear pendingUpgrade. Wired AFTER ResearchEconomy.tick.
  tickCenter(state) {
    const c = state && state.researchCenter;
    if (!c) return;
    const stock = state.castleStock || (state.castleStock = {});
    let budget = CONFIG.researchCenter.deliveryRate;
    if (!c.built) {
      if (!c.delivered) c.delivered = {};
      const need = Research.centerConstructionNeed(state);
      for (const gid in need) {
        if (budget <= 0) break;
        const move = Math.min(need[gid], stock[gid] || 0, budget);
        if (move > 0) {
          stock[gid] = (stock[gid] || 0) - move;
          c.delivered[gid] = (c.delivered[gid] || 0) + move;
          budget -= move;
        }
      }
      if (Object.keys(Research.centerConstructionNeed(state)).length === 0) c.built = true;
      return;
    }
    if (c.pendingUpgrade) {
      const pu = c.pendingUpgrade;
      if (!pu.delivered) pu.delivered = {};
      const need = Research.centerUpgradeNeed(state);
      for (const gid in need) {
        if (budget <= 0) break;
        const move = Math.min(need[gid], stock[gid] || 0, budget);
        if (move > 0) {
          stock[gid] = (stock[gid] || 0) - move;
          pu.delivered[gid] = (pu.delivered[gid] || 0) + move;
          budget -= move;
        }
      }
      if (Object.keys(Research.centerUpgradeNeed(state)).length === 0) {
        c.level = pu.toLevel; c.pendingUpgrade = null;
      }
    }
  },
  // === /Slice A helpers ==================================================
  // Advance the active project one tick (Slice A — per-second equal-drain metering).
  // Research is powered by the Research Center: its SPEED (centerSpeed) sets how many
  // material-units/game-second are drawn from state.castleStock. Each game-second is
  // TICKS_PER_SEC sim ticks; on a second boundary we ATOMICALLY draw that second's
  // planned delta of EVERY material (all-or-nothing on availability), so materials
  // deplete together and a shortfall pauses the whole node until stock arrives. No
  // center (speed 0) → paused (no accrual, no consumption). Zero-material node →
  // instant complete.
  tick(state) {
    if (!state || !state.research) return;
    const R = state.research;
    // normalize bag defaults (defensive against partial/legacy in-memory state)
    if (!Array.isArray(R.unlocked)) R.unlocked = [];
    if (!Array.isArray(R.queue)) R.queue = [];
    if (typeof R.completedSec !== "number") R.completedSec = 0;
    if (typeof R.subTick !== "number") R.subTick = 0;
    if (!R.consumed || typeof R.consumed !== "object") R.consumed = {};
    // === RT-A2: nothing active → scan the queue IN ORDER and start the FIRST
    // entry whose prereqs are met (canStart gates single-active + prereqs; funds
    // gate removed). Entries with unmet prereqs stay put, order preserved. ===
    if (!R.active && R.queue.length) {
      for (let i = 0; i < R.queue.length; i++) {
        if (Research.canStart(state, R.queue[i])) {
          Research.start(state, R.queue[i]);
          R.queue.splice(i, 1);
          break;
        }
      }
    }
    // === /RT-A2 ===
    if (!R.active) return;
    const node = Research.get(R.active);
    if (!node) { R.active = null; R.completedSec = 0; R.subTick = 0; R.consumed = {}; return; }
    const M = node.materials || {};
    const gids = Object.keys(M);
    const S = Research.centerSpeed(state);
    if (S === 0) return;   // no center / under construction → PAUSED (even a zero-material node waits for a center)
    if (!gids.length) {   // zero-material node → complete instantly (center present)
      if (R.unlocked.indexOf(node.id) < 0) R.unlocked.push(node.id);
      R.active = null; R.completedSec = 0; R.subTick = 0; R.consumed = {};
      return;
    }
    R.subTick = Math.min(TICKS_PER_SEC, R.subTick + 1);
    if (R.subTick < TICKS_PER_SEC) return;   // not a game-second boundary yet

    // --- Second boundary: draw this second's equal-drain delta, atomically. ---
    const rate = Research.consumptionPlan(M, S).rate;
    const e = R.completedSec + 1;
    const stock = state.castleStock || (state.castleStock = {});
    const delta = {};
    let affordable = true;
    for (const gid of gids) {
      const target = Math.min(M[gid], Math.floor(rate[gid] * e));
      const d = Math.max(0, target - (R.consumed[gid] || 0));
      delta[gid] = d;
      if ((stock[gid] || 0) < d) affordable = false;
    }
    if (!affordable) return;   // stays pinned at TICKS_PER_SEC, retries next tick
    for (const gid of gids) {
      if (delta[gid] > 0) {
        stock[gid] = (stock[gid] || 0) - delta[gid];
        R.consumed[gid] = (R.consumed[gid] || 0) + delta[gid];
      }
    }
    R.completedSec++;
    R.subTick = 0;

    // Completion: every material fully consumed → unlock and reset.
    let complete = true;
    for (const gid of gids) if ((R.consumed[gid] || 0) < M[gid]) { complete = false; break; }
    if (complete) {
      if (R.unlocked.indexOf(node.id) < 0) R.unlocked.push(node.id);
      R.active = null; R.completedSec = 0; R.subTick = 0; R.consumed = {};
    }
  },

  // Fraction 0..1 of the active project completed (0 if none) — material-based:
  // total materials consumed / total materials required.
  activeFraction(state) {
    if (!state || !state.research || !state.research.active) return 0;
    const node = Research.get(state.research.active);
    if (!node) return 0;
    const M = node.materials || {};
    let tot = 0; for (const gid in M) tot += M[gid];
    if (!tot) return 1;   // active but zero-material → treat as complete
    const consumed = state.research.consumed || {};
    let cons = 0; for (const gid in M) cons += Math.min(M[gid], consumed[gid] || 0);
    return Math.max(0, Math.min(1, cons / tot));
  },
  // Aggregate an effect value across all UNLOCKED nodes so other systems can read
  // research without this file reaching into theirs. Multiplier keys (…Output,
  // …Capacity, …_mul) multiply; boolean flags OR; everything else sums. Returns
  // `fallback` when no unlocked node touches the key.
  effect(state, key, fallback) {
    let acc = null;
    const unlocked = (state && state.research && state.research.unlocked) || [];
    for (let i = 0; i < unlocked.length; i++) {
      const node = Research.get(unlocked[i]);
      if (!node || !node.effect || !(key in node.effect)) continue;
      const v = node.effect[key];
      if (typeof v === "boolean") acc = (acc || false) || v;
      else if (/Output$|Capacity$|_mul$/.test(key)) acc = (acc == null ? 1 : acc) * v;
      else acc = (acc == null ? 0 : acc) + v;   // additive default
    }
    return acc == null ? fallback : acc;
  },

  // === RT-A2: research queue — ordered node ids the player lines up while a
  // project is active. tick() auto-starts the first eligible entry (see below).
  // enqueue allows queuing a node whose prereqs are NOT yet met (they may be
  // satisfied by an earlier queue entry); validity = real node, not already
  // unlocked, not active, not already queued. ===
  isQueued(state, id) {
    return !!(state && state.research && Array.isArray(state.research.queue)
      && state.research.queue.indexOf(id) >= 0);
  },
  enqueue(state, id) {
    if (!state || !state.research) return false;
    if (!Array.isArray(state.research.queue)) state.research.queue = [];
    if (!Research.get(id)) return false;
    if (Research.has(state, id) || Research.isActive(state, id)) return false;
    if (Research.isQueued(state, id)) return false;
    state.research.queue.push(id);
    return true;
  },
  dequeue(state, id) {
    if (!state || !state.research || !Array.isArray(state.research.queue)) return false;
    const i = state.research.queue.indexOf(id);
    if (i < 0) return false;
    state.research.queue.splice(i, 1);
    return true;
  },
  // === /RT-A2 ===
};

// === RESEARCH-CORE END ===
