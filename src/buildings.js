// === BUILDINGS-CORE START ===  (TI-A / slot #2 — placement rules + housing)
// Pure, deterministic placement/housing helpers for player-placed buildings.
// No DOM / canvas / Math.random / I/O — reads the game State + CONFIG + HexMath
// and mutates nothing. Composes with the redesigned CONFIG.buildings + CONFIG.town
// above. Headless-tested in test/buildings.test.js.
var Buildings = (typeof Buildings !== "undefined" && Buildings) || {};

// tier singular (workerTier/houseTier) -> plural pop bucket key.
const BUILDINGS_TIER_KEY = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };  // === CC ===

// Player-placeable building slots by town-center level (GDD §4.1: 3/5/7/9).
// Index 0 is unused; unknown levels fall back to 3. Optional `state`: when passed,
// P5-A applies the `slotBonus` research effect (town_charters → +1 slot). Callers
// without research (e.g. buildings.test.js) omit it and get the base cap.
Buildings.slotCap = function (level, state) {
  const caps = CONFIG.town.slotCap;
  let cap = caps[level] || 3;
  if (state && typeof Research !== "undefined" && Research.effect) {
    cap += Research.effect(state, "slotBonus", 0);   // additive (sums unlocked nodes)
  }
  return cap;
};

// Every placed building — house or producer — consumes one slot.
Buildings.usedSlots = function (town) {
  return (town && Array.isArray(town.buildings)) ? town.buildings.length : 0;
};

// === PP-A === Internal haulers a town runs — scales the construction/upgrade
// delivery budget (deliveryRate × count). Level-based (index = level; formula
// level+3 out of range), floored at 1 so an unlevelled town still delivers.
Buildings.transporterCount = function (town) {
  const lvl = (town && town.level) || 1;
  const arr = CONFIG.town && CONFIG.town.transportersByLevel;
  const v = (arr && arr[lvl] != null) ? arr[lvl] : lvl + 3;
  return Math.max(1, Math.round(v));
};
// === /PP-A ===

// Sum houseCapacity of placed houses, grouped by the tier they house.
// Returns { peasants, workers, burghers }. Optional `state`: when passed, P5-A
// scales housing by the `housingBonus` research effect (royal_census → houses
// shelter more). Callers without research (e.g. buildings.test.js) omit it and
// get the base capacity.
Buildings.housingCapacity = function (town, state) {
  const cap = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };   // === CC: 4th tier ===
  const list = (town && Array.isArray(town.buildings)) ? town.buildings : [];
  for (const b of list) {
    if (!b || b.built === false) continue;   // BAL2: scaffolds don't house anyone; !b guards a null array element (corrupt save)
    const def = CONFIG.buildings[b.typeId];
    if (!def || def.kind !== "house") continue;
    const key = BUILDINGS_TIER_KEY[def.houseTier];
    if (!key) continue;
    // === RU-A: upgrade capacityPlus adds to each house's contribution ===
    cap[key] += (def.houseCapacity || 0) + (Buildings.upgradeEffect(b).capacityPlus || 0);
    // === /RU-A ===
  }
  if (state && typeof Research !== "undefined" && Research.effect) {
    const hb = Research.effect(state, "housingBonus", 1);   // multiplier (1x default)
    if (hb !== 1) { cap.peasants *= hb; cap.workers *= hb; cap.burghers *= hb; cap.aristocrats *= hb; }  // === CC ===
  }
  return cap;
};

// === CB-A: construction data helpers ========================================
// Buildings under construction: a placed building is `built:false` until its
// RESOURCE cost (non-gold) has been delivered from the town's own stock. A
// building with no resource cost (gold-only or free) is "instant" — built the
// moment it is placed. These helpers are pure (read CONFIG + the passed args).

// The non-gold portion of a building def's cost (its construction materials).
Buildings.resourceCost = function (def) {
  const out = {};
  if (!def || !def.cost) return out;
  for (const gid in def.cost) {
    if (gid === "gold") continue;
    if (def.cost[gid] > 0) out[gid] = def.cost[gid];
  }
  return out;
};

// True when a def has NO resource cost → it is built instantly on placement.
Buildings.isInstant = function (def) {
  for (const _ in Buildings.resourceCost(def)) return false;
  return true;
};

// Remaining construction materials a placed building still needs =
// resourceCost(def) − delivered, positive remainders only. A built building (or
// a legacy one lacking the `built` flag → treated as built) needs nothing.
Buildings.constructionNeed = function (b) {
  if (!b || b.built !== false) return {};
  const rc = Buildings.resourceCost(CONFIG.buildings[b.typeId]);
  const delivered = b.delivered || {};
  const out = {};
  for (const gid in rc) {
    const rem = rc[gid] - (delivered[gid] || 0);
    if (rem > 1e-6) out[gid] = rem;   // epsilon: float-dust remainders count as done
  }
  return out;
};
// === /CB-A ===================================================================

// === RU-A: per-building upgrade data + pure helpers =========================
// Two-part upgrades: a "development" research node unlocks the POSSIBILITY of a
// building's upgrades (Part 1); the player then buys a specific upgrade LEVEL on
// a building (Part 2) — gold charged at purchase, resources delivered from the
// town's own stock over time (reusing the CB-A construction-delivery step).
// CONFIG.upgrades[typeId] = ordered array of level entries (level>=2), each:
//   { level, name, unlockedBy:<researchNodeId>, cost:{gold, <good>...},
//     effect:{ capacityPlus?, slotPlus?, outputMult?, basicConsumptionMult? } }
// Ladders are defined for the 4 starter buildings only.
Object.assign(CONFIG, {
  upgrades: {
    // === RT-A: each ladder entry gated by its OWN per-level unlock node ===
    hut: [
      { level: 2, name: "Sturdy Hut",   unlockedBy: "upg_hut_l2", cost: { gold: 150, wood: 20 },           effect: { capacityPlus: 1 } },
      { level: 3, name: "Fine Hut",     unlockedBy: "upg_hut_l3", cost: { gold: 300, wood: 30, stone: 10 }, effect: { capacityPlus: 1 } },
      { level: 4, name: "Grand Hut",    unlockedBy: "upg_hut_l4", cost: { gold: 600, wood: 40, stone: 20 }, effect: { capacityPlus: 1, basicConsumptionMult: 0.7 } },
    ],
    lumberjack: [
      { level: 2, name: "Sharpened Axes", unlockedBy: "upg_lumberjack_l2", cost: { gold: 200, wood: 20 },           effect: { outputMult: 1.25 } },
      { level: 3, name: "Logging Camp",   unlockedBy: "upg_lumberjack_l3", cost: { gold: 450, wood: 30, stone: 15 }, effect: { outputMult: 1.5 } },
    ],
    farm: [
      { level: 2, name: "Better Plows",  unlockedBy: "upg_farm_l2", cost: { gold: 200, wood: 20 },           effect: { outputMult: 1.25 } },
      { level: 3, name: "Great Estate",  unlockedBy: "upg_farm_l3", cost: { gold: 450, wood: 30, stone: 15 }, effect: { outputMult: 1.5 } },
    ],
    sawmill: [
      { level: 2, name: "Water Wheel",   unlockedBy: "upg_sawmill_l2", cost: { gold: 220, wood: 25 },           effect: { outputMult: 1.25 } },
      { level: 3, name: "Great Sawmill", unlockedBy: "upg_sawmill_l3", cost: { gold: 480, wood: 35, stone: 15, stone_tools: 5 }, effect: { outputMult: 1.5, slotPlus: 1 } },   // === STWIRE: a building that CONSUMES stone_tools (author: "used by some buildings later"). Optional upgrade (sawmill works at L2); delivery just waits if no stone_tools producer exists, and the TRADEFIX purpose-check keeps traders from chasing an unavailable good — no soft-lock. ===
    ],
    // === /RT-A ===
    // === ARISTOFIX: aristocrat_home has NO upgrade ladder (author: Aristocrats have
    // exactly 1 slot and cannot be upgraded). Ladder + its research nodes removed. ===
  },
});

// The upgrade ladder for a building type (or [] when it has none).
Buildings.upgradeLadder = function (typeId) {
  return (CONFIG.upgrades && CONFIG.upgrades[typeId]) || [];
};

// The ladder entry for a specific level, or null.
Buildings.upgradeAt = function (typeId, level) {
  const ladder = Buildings.upgradeLadder(typeId);
  for (let i = 0; i < ladder.length; i++) if (ladder[i].level === level) return ladder[i];
  return null;
};

// Is the given upgrade level unlocked by research? Entries without unlockedBy are
// always unlocked; a missing entry is never unlocked.
Buildings.upgradeUnlocked = function (state, typeId, level) {
  const entry = Buildings.upgradeAt(typeId, level);
  if (!entry) return false;
  if (!entry.unlockedBy) return true;
  return (typeof Research !== "undefined" && Research.has) ? Research.has(state, entry.unlockedBy) : false;
};

// The next available (level+1) upgrade entry for a building IF it exists AND is
// unlocked, else null. Legacy buildings default to upgradeLevel 1.
Buildings.nextUpgrade = function (state, b) {
  if (!b) return null;
  const lvl = b.upgradeLevel || 1;
  const entry = Buildings.upgradeAt(b.typeId, lvl + 1);
  return (entry && Buildings.upgradeUnlocked(state, b.typeId, lvl + 1)) ? entry : null;
};

// Can the player start the next upgrade on this building? Gold-gated only —
// resources are delivered over time (like CB-A construction), not required up
// front. Returns {ok:true} or {ok:false, reason}.
Buildings.canStartUpgrade = function (state, town, b) {
  if (!b) return { ok: false, reason: "No building" };
  if (b.built === false) return { ok: false, reason: "Under construction" };
  if (b.pendingUpgrade) return { ok: false, reason: "Upgrade in progress" };
  const nxt = Buildings.nextUpgrade(state, b);
  if (!nxt) return { ok: false, reason: "No upgrade available" };
  if ((state.treasury || 0) < (nxt.cost.gold || 0)) return { ok: false, reason: "Not enough gold" };
  return { ok: true };
};

// Charge the upgrade's GOLD to the treasury and mark the building pending. The
// resources are delivered from town stock over time by the Sim delivery step.
Buildings.startUpgrade = function (state, town, b) {
  if (!Buildings.canStartUpgrade(state, town, b).ok) return false;
  const nxt = Buildings.nextUpgrade(state, b);
  state.treasury = (state.treasury || 0) - (nxt.cost.gold || 0);
  b.pendingUpgrade = { toLevel: nxt.level, delivered: {} };
  return true;
};

// The non-gold (resource) portion of an upgrade level's cost.
Buildings.upgradeResourceCost = function (typeId, level) {
  const out = {};
  const entry = Buildings.upgradeAt(typeId, level);
  if (!entry || !entry.cost) return out;
  for (const gid in entry.cost) {
    if (gid === "gold") continue;
    if (entry.cost[gid] > 0) out[gid] = entry.cost[gid];
  }
  return out;
};

// Remaining materials a pending upgrade still needs = resourceCost − delivered,
// positive remainders only. {} when nothing is pending.
Buildings.upgradeConstructionNeed = function (b) {
  if (!b || !b.pendingUpgrade) return {};
  const rc = Buildings.upgradeResourceCost(b.typeId, b.pendingUpgrade.toLevel);
  const delivered = b.pendingUpgrade.delivered || {};
  const out = {};
  for (const gid in rc) {
    const rem = rc[gid] - (delivered[gid] || 0);
    if (rem > 1e-6) out[gid] = rem;   // epsilon: float-dust remainders count as done
  }
  return out;
};

// Aggregate the effect of ALL applied upgrade levels (2..upgradeLevel):
// capacityPlus/slotPlus are SUMMED (default 0); outputMult/basicConsumptionMult
// are MULTIPLIED (default 1). Identity when b is missing or still at level 1.
Buildings.upgradeEffect = function (b) {
  const agg = { capacityPlus: 0, slotPlus: 0, outputMult: 1, basicConsumptionMult: 1 };
  if (!b) return agg;
  const lvl = b.upgradeLevel || 1;
  if (lvl < 2) return agg;
  const ladder = Buildings.upgradeLadder(b.typeId);
  for (let i = 0; i < ladder.length; i++) {
    const e = ladder[i];
    if (e.level < 2 || e.level > lvl || !e.effect) continue;
    if (typeof e.effect.capacityPlus === "number") agg.capacityPlus += e.effect.capacityPlus;
    if (typeof e.effect.slotPlus === "number") agg.slotPlus += e.effect.slotPlus;
    if (typeof e.effect.outputMult === "number") agg.outputMult *= e.effect.outputMult;
    if (typeof e.effect.basicConsumptionMult === "number") agg.basicConsumptionMult *= e.effect.basicConsumptionMult;
  }
  return agg;
};

// Capacity-weighted basic-consumption multiplier per pop tier, from house
// upgrades. For each tier: Σ(cap_i × bcm_i) / Σ(cap_i) over that tier's houses
// (cap includes capacityPlus). Defaults to 1 when a tier has no houses.
Buildings.basicConsumptionMult = function (town) {
  const res = { peasants: 1, workers: 1, burghers: 1, aristocrats: 1 };   // === CC ===
  const acc = { peasants: { w: 0, wm: 0 }, workers: { w: 0, wm: 0 }, burghers: { w: 0, wm: 0 }, aristocrats: { w: 0, wm: 0 } };
  const list = (town && Array.isArray(town.buildings)) ? town.buildings : [];
  for (const b of list) {
    if (!b || b.built === false) continue;   // BAL2: scaffolds don't house anyone; !b guards a null array element (corrupt save)
    const def = CONFIG.buildings[b.typeId];
    if (!def || def.kind !== "house") continue;
    const key = BUILDINGS_TIER_KEY[def.houseTier];
    if (!key) continue;
    const eff = Buildings.upgradeEffect(b);
    const cap = (def.houseCapacity || 0) + eff.capacityPlus;
    if (cap <= 0) continue;
    acc[key].w += cap;
    acc[key].wm += cap * eff.basicConsumptionMult;
  }
  for (const key in acc) if (acc[key].w > 0) res[key] = acc[key].wm / acc[key].w;
  return res;
};
// === /RU-A ==================================================================

// === PLACEMENT V2 (PV2-A) — contiguous-city model ===========================
// Cities grow as CONTIGUOUS clusters. A building belongs to the single city
// whose FOOTPRINT it borders; the map-center castle carries a footprint too, so
// different cities (and the castle) can never be adjacent — always a 1-hex gap.
// Radius is gone from the model (CONFIG.town.radius is retained but unused).

// The castle hub hex (map center). It is the King's hub, NOT a buildable city,
// but its footprint enforces the gap rule around it.
Buildings.castleHex = function () {
  const c = (CONFIG.town && CONFIG.town.castle) || { q: 0, r: 0 };
  return { q: c.q, r: c.r };
};

// Footprint of a town = its center hex PLUS all its building hexes, as hex keys.
Buildings.footprint = function (town) {
  const keys = [];
  if (!town) return keys;
  keys.push(HexMath.key(town.q, town.r));
  const list = Array.isArray(town.buildings) ? town.buildings : [];
  for (const b of list) keys.push(HexMath.key(b.q, b.r));
  return keys;
};

// The DISTINCT towns whose footprint is adjacent to (q,r). Returns an array of
// 0 (touches no city), 1 (the owner), or ≥2 (would fuse cities — invalid) towns.
Buildings.footprintCitiesAdjacent = function (state, q, r) {
  const out = [];
  const towns = (state && Array.isArray(state.towns)) ? state.towns : [];
  const nbrSet = new Set(HexMath.neighbors(q, r).map(n => HexMath.key(n.q, n.r)));
  for (const t of towns) {
    if (Buildings.footprint(t).some(k => nbrSet.has(k))) out.push(t);
  }
  return out;
};

// True if (q,r) is the castle hex itself or one of its 6 neighbours.
Buildings.touchesCastle = function (state, q, r) {
  const c = Buildings.castleHex();
  if (c.q === q && c.r === r) return true;
  return HexMath.neighbors(q, r).some(n => n.q === c.q && n.r === c.r);
};

// May `typeId` be built at hex (q,r)? Resolves the OWNING city by footprint
// adjacency. Returns { ok:true, town } (town = the city that gains the building)
// or { ok:false, reason:"…" }. Pure: reads only, no mutation.
Buildings.canPlaceBuilding = function (state, typeId, q, r) {
  const def = CONFIG.buildings[typeId];
  if (!def) return { ok: false, reason: "Unknown building type" };

  const map = state && state.map;
  const hex = map && map.hexes && map.hexes.get(HexMath.key(q, r));
  if (!hex) return { ok: false, reason: "No hex here" };

  // (1) terrain / buildable-land rule.
  const terr = hex.terrain;
  const terrDef = CONFIG.terrain[terr];
  const isLand = !!(terrDef && terrDef.buildable);
  if (def.kind === "extractor" && def.adjacent) {
    // sits on buildable land bordering the required terrain (e.g. fishery→water)
    if (!isLand) return { ok: false, reason: "Needs buildable land" };
    const near = HexMath.neighbors(q, r).some(n => {
      const nh = map.hexes.get(HexMath.key(n.q, n.r));
      return nh && nh.terrain === def.adjacent;
    });
    if (!near) return { ok: false, reason: "Must border " + def.adjacent };
  } else if (def.kind === "extractor") {
    // sits directly on its resource hex (may be non-town-buildable, e.g. mountains)
    if (terr !== def.terrain) return { ok: false, reason: "Needs " + def.terrain + " terrain" };
  } else {
    // processor / house: any buildable land hex.
    if (!isLand) return { ok: false, reason: "Needs buildable land" };
    // === TV2: snow (and any houseOnly terrain) accepts houses only ===
    if (terrDef.houseOnly && def.kind !== "house")
      return { ok: false, reason: "Only houses can be built on " + terr };
  }

  // (2) hex must be free: not the castle, not any town center, not any existing
  //     building of any town. M: a ROAD may share the hex — roads are a separate
  //     layer, so building placement no longer rejects a road tile.
  const key = HexMath.key(q, r);
  const castle = Buildings.castleHex();
  if (castle.q === q && castle.r === r) return { ok: false, reason: "The castle is here" };
  if (Array.isArray(state.towns)) {
    for (const t of state.towns) {
      if (t.q === q && t.r === r) return { ok: false, reason: "A town center is here" };
      const bl = Array.isArray(t.buildings) ? t.buildings : [];
      for (const b of bl) if (b.q === q && b.r === r) return { ok: false, reason: "A building is already here" };
    }
  }

  // (3) contiguity: exactly ONE city footprint may border this hex.
  const cities = Buildings.footprintCitiesAdjacent(state, q, r);
  if (cities.length === 0) return { ok: false, reason: "Must touch a city" };
  if (cities.length >= 2) return { ok: false, reason: "Would join two cities — leave a gap" };
  const owner = cities[0];

  // (4) keep the gap to the castle.
  if (Buildings.touchesCastle(state, q, r)) return { ok: false, reason: "Too close to the castle" };

  // (5) slot cap of the OWNING town (P5-A: town_charters research grants +1 slot).
  if (Buildings.usedSlots(owner) >= Buildings.slotCap(owner.level, state)) {
    return { ok: false, reason: "No free building slots" };
  }

  // (6) affordability (CB-A money model): only the GOLD cost is checked at
  //     placement, billed to the KINGDOM treasury (state.treasury). RESOURCE
  //     costs are NO LONGER required up front — a building may be placed "under
  //     construction" and its traders buy the materials (delivered over time by
  //     the Sim construction step). (town.gold is the trade budget — untouched.)
  const cost = def.cost || {};
  if ((cost.gold || 0) > (state.treasury || 0)) return { ok: false, reason: "Kingdom treasury lacks gold" };

  return { ok: true, town: owner };
};

// May a NEW town center be founded at (q,r)? Enforces the gap rule: buildable
// land, hex free, and not adjacent to any existing city footprint nor touching
// the castle. Returns { ok:true } | { ok:false, reason:"…" }.
Buildings.canPlaceTown = function (state, q, r) {
  const map = state && state.map;
  const hex = map && map.hexes && map.hexes.get(HexMath.key(q, r));
  if (!hex) return { ok: false, reason: "No hex here" };
  const terrDef = CONFIG.terrain[hex.terrain];
  if (!(terrDef && terrDef.buildable)) return { ok: false, reason: "Needs buildable land" };

  // EC-A: founding a city is paid from the Kingdom treasury.
  const foundCost = Buildings.foundCost();
  if ((state.treasury || 0) < foundCost) return { ok: false, reason: "Treasury too low — need " + foundCost + " gold to found" };

  const key = HexMath.key(q, r);
  if (state.roads && state.roads.has(key)) return { ok: false, reason: "A road is here" };
  const castle = Buildings.castleHex();
  if (castle.q === q && castle.r === r) return { ok: false, reason: "The castle is here" };
  if (Array.isArray(state.towns)) {
    for (const t of state.towns) {
      if (t.q === q && t.r === r) return { ok: false, reason: "A town center is here" };
      const bl = Array.isArray(t.buildings) ? t.buildings : [];
      for (const b of bl) if (b.q === q && b.r === r) return { ok: false, reason: "A building is here" };
    }
  }

  // Gap rule: an isolated site only — not bordering any city, not near the castle.
  if (Buildings.footprintCitiesAdjacent(state, q, r).length > 0) {
    return { ok: false, reason: "Too close to another city" };
  }
  if (Buildings.touchesCastle(state, q, r)) {
    return { ok: false, reason: "Too close to the castle" };
  }
  return { ok: true };
};

// Back-compat wrapper for existing callers that pass an explicit `town`. Placement
// v2 resolves the owner by adjacency; this thin shim keeps the old signature by
// requiring the resolved owner to BE the passed town (so a building can only be
// added to the town the caller intended). PV2-B will migrate callers to
// canPlaceBuilding directly. Returns { ok:true } | { ok:false, reason }.
Buildings.canPlace = function (state, town, typeId, q, r) {
  if (!town) return { ok: false, reason: "No town" };
  const res = Buildings.canPlaceBuilding(state, typeId, q, r);
  if (!res.ok) return res;
  if (res.town !== town) return { ok: false, reason: "Not adjacent to this city" };
  return { ok: true };
};

// === EC-A money model ========================================================
// The Kingdom treasury (state.treasury) pays all placement GOLD; a city's own
// stock pays building RESOURCE costs; town.gold (the trade budget) is untouched.

// Treasury gold required to found a new city center.
Buildings.foundCost = function () {
  return (CONFIG.town && CONFIG.town.foundCost) || 1000;
};

// Deduct a building's cost at placement: only the GOLD → state.treasury (CB-A).
// RESOURCE costs are NO LONGER deducted here — construction materials are
// delivered from town.stock over time by the Sim construction step. Assumes
// canPlaceBuilding already passed. Mutates state only.
Buildings.chargeBuilding = function (state, town, typeId) {
  const def = CONFIG.buildings[typeId];
  if (!def || !town) return;
  const cost = def.cost || {};
  state.treasury = (state.treasury || 0) - (cost.gold || 0);
  // === MISSION-STATS === an INSTANT (gold-only/free) building is placed built:true
  // and NEVER trips the Sim delivery flip that counts a construction, so count it
  // HERE at placement — otherwise "construct" mission objectives (incl. the early
  // hut/farm/lumberjack, all instant) could never complete. Non-instant buildings
  // are placed built:false and counted by Sim when their materials finish delivering,
  // so this branch (instant only) never double-counts. chargeBuilding is a placement
  // (player-action) hook, not part of the seeded pure tick, so determinism is intact.
  if (Buildings.isInstant(def) && typeof Sim !== "undefined" && Sim.statConstructed) Sim.statConstructed(state, typeId);
};

// Deduct the founding cost from the treasury (call once when a city is placed).
Buildings.chargeFounding = function (state) {
  state.treasury = (state.treasury || 0) - Buildings.foundCost();
};

// Treasury gold to lay one road hex (bridges over water cost more — not yet
// placeable since water is not roadable).
Buildings.roadCost = function () {
  return (CONFIG.town && typeof CONFIG.town.roadCost === "number") ? CONFIG.town.roadCost : 5;
};
// === PLACEMENT V2 (PV2-A) END ================================================

// === RESEARCH CENTER (Slice B) — placement + upgrade API =====================
// The Research Center is a UNIQUE castle-side building: adjacent to the castle
// (never a city building), it powers the tech tree (see Research.tickCenter,
// which delivers its materials from state.castleStock over time). These are pure
// state mutators/queries — no DOM, no canvas. Rendering/placement UX is Slice C.

// Convenience accessor for the single center (or null).
Buildings.researchCenter = function (state) {
  return (state && state.researchCenter) || null;
};

// May a Research Center be placed at hex (q,r)? Rules (INVERSE of a city
// building): exactly one center allowed; must be ADJACENT to the castle but NOT
// on the castle hex; buildable land; hex free (no road/town center/building/
// water); and the Kingdom treasury must cover the build gold. Pure: reads only.
Buildings.canPlaceResearchCenter = function (state, q, r) {
  if (state && state.researchCenter) return { ok: false, reason: "Research Center already built" };

  const map = state && state.map;
  const hex = map && map.hexes && map.hexes.get(HexMath.key(q, r));
  if (!hex) return { ok: false, reason: "No hex here" };

  // (1) adjacency to the castle — beside it, never on it.
  const castle = Buildings.castleHex();
  if (castle.q === q && castle.r === r) return { ok: false, reason: "The castle is here" };
  if (!Buildings.touchesCastle(state, q, r)) return { ok: false, reason: "Must be next to the castle" };

  // (2) buildable land (same terrain gate a processor/house uses).
  const terrDef = CONFIG.terrain[hex.terrain];
  if (!(terrDef && terrDef.buildable)) return { ok: false, reason: "Needs buildable land" };

  // (3) hex must be free: no road, no town center, no town building.
  const key = HexMath.key(q, r);
  if (state.roads && state.roads.has(key)) return { ok: false, reason: "A road is here" };
  if (Array.isArray(state.towns)) {
    for (const t of state.towns) {
      if (t.q === q && t.r === r) return { ok: false, reason: "A town center is here" };
      const bl = Array.isArray(t.buildings) ? t.buildings : [];
      for (const b of bl) if (b.q === q && b.r === r) return { ok: false, reason: "A building is already here" };
    }
  }

  // (4) affordability — build gold billed to the Kingdom treasury.
  const buildGold = (CONFIG.researchCenter && CONFIG.researchCenter.build && CONFIG.researchCenter.build.gold) || 0;
  if ((state.treasury || 0) < buildGold) return { ok: false, reason: "Kingdom treasury lacks gold" };

  return { ok: true };
};

// Place the Research Center at (q,r): validates, deducts the build GOLD from the
// treasury, and creates the under-construction center. Materials are then metered
// in from state.castleStock over time by Research.tickCenter (NOT delivered here).
Buildings.placeResearchCenter = function (state, q, r) {
  const res = Buildings.canPlaceResearchCenter(state, q, r);
  if (!res.ok) return res;
  const buildGold = (CONFIG.researchCenter && CONFIG.researchCenter.build && CONFIG.researchCenter.build.gold) || 0;
  state.treasury = (state.treasury || 0) - buildGold;
  state.researchCenter = { q, r, built: false, delivered: {}, level: 1, pendingUpgrade: null };
  return { ok: true };
};

// The next-level config for the built center, or null (no built center, already
// at max, or an upgrade is already pending).
Buildings.centerNextUpgrade = function (state) {
  const c = state && state.researchCenter;
  if (!c || !c.built || c.pendingUpgrade) return null;
  const levels = (CONFIG.researchCenter && CONFIG.researchCenter.levels) || [];
  return levels[(c.level || 1) + 1] || null;
};

// May the center be upgraded now? Requires a built center, a next level, no
// pending upgrade, and treasury ≥ the next level's gold cost.
Buildings.canUpgradeCenter = function (state) {
  const c = state && state.researchCenter;
  if (!c || !c.built) return { ok: false, reason: "No Research Center" };
  if (c.pendingUpgrade) return { ok: false, reason: "Upgrade in progress" };
  const nxt = Buildings.centerNextUpgrade(state);
  if (!nxt) return { ok: false, reason: "Already at max level" };
  const gold = (nxt.cost && nxt.cost.gold) || 0;
  if ((state.treasury || 0) < gold) return { ok: false, reason: "Not enough gold" };
  return { ok: true };
};

// Start a center upgrade: charge the next level's GOLD to the treasury and mark
// the center pending. Non-gold materials are delivered from state.castleStock
// over time by Research.tickCenter, which applies the new level when complete.
Buildings.startCenterUpgrade = function (state) {
  if (!Buildings.canUpgradeCenter(state).ok) return { ok: false, reason: "Cannot upgrade" };
  const c = state.researchCenter;
  const nxt = Buildings.centerNextUpgrade(state);
  const gold = (nxt.cost && nxt.cost.gold) || 0;
  state.treasury = (state.treasury || 0) - gold;
  // NOTE: Research.centerUpgradeNeed (Slice A) reads pendingUpgrade.cost to meter
  // the non-gold materials from castleStock, so snapshot the level's cost here.
  c.pendingUpgrade = { toLevel: (c.level || 1) + 1, cost: Object.assign({}, nxt.cost || {}), delivered: {} };
  return { ok: true };
};
// === /RESEARCH CENTER (Slice B) ==============================================
// === BUILDINGS-CORE END ===
