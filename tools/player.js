"use strict";
// BAL2 — the shared "scripted player": builds a resource-rich controlled map on a
// fixed seed, founds 3 complementary cities, connects roads to the castle, and
// runs a deterministic greedy build/research/level/upgrade policy while ticking
// the full economy. Snapshots every N ticks. Reusable by the tuner.
//
// Geography assumption (documented): each city is seeded with a broad palette of
// adjacent deposits so EVERY chain is locally buildable. This isolates ECONOMY
// balance (rates/prices/caps/perCapita) from map RNG — if a chain still stalls
// here, it is a genuine balance/logic bug, not bad luck in deposit placement.
const path = require("path");
const { loadCore } = require("./lib.js");

const HTML = process.env.TW_HTML || path.join(__dirname, "..", "index.html");

function build() {
  const C = loadCore(HTML);
  const { CONFIG, HexMath, Sim, Trade, Buildings, Research, ResearchEconomy,
          CastleMarket, Market, Town, Castle, Quests } = C;
  const K = (q, r) => HexMath.key(q, r);

  // ---- controlled map -----------------------------------------------------
  const hexes = new Map();
  const put = (q, r, terrain) => hexes.set(K(q, r), { q, r, terrain, revealed: true });
  const RAD = 44;
  for (const c of HexMath.range(0, 0, RAD)) put(c.q, c.r, "barren");
  put(0, 0, "barren"); // castle hex

  // City centers (mutually distant so footprints never fuse; gap from castle).
  const CENTERS = [ { q: 14, r: 0 }, { q: 0, r: 14 }, { q: -14, r: 14 }, { q: 0, r: -14 } ];   // BAL2b: 4th city — the citizen district
  // Terrain seeded around each center, mirroring a sensible city siting: the
  // FOOD/WOOD terrain a peasant base needs (fertile/forest/fish) sits at radius 1
  // (immediately buildable from the center); the mined deposits sit at radius 2-3
  // (reached as the city grows outward). Only the 6 directional spokes per ring
  // are overwritten — every other near hex stays barren buildable ground.
  // BAL2: fill the whole radius-3 disk around each center with an ABUNDANT terrain
  // mix (not just the 6 spokes). The old spoke-only seeding gave each city just 3
  // fertile hexes total (2 easily reachable) — not enough for potato_farm + farm +
  // shepherd, so the grain/wool worker-luxury chain was geography-starved. Filling
  // the disk guarantees every chain is locally buildable, which is exactly the
  // "isolate ECONOMY balance from map RNG" intent documented above. R1 = pure
  // peasant base (food/wood/fish, immediately buildable); R2/R3 add the mined
  // deposits + more food/wood (reached as the footprint grows outward).
  // Each ring mixes RESOURCE terrain (extractor sites) with BARREN (plain buildable
  // land for houses + processors). The player reserves resource hexes for extractors,
  // so without enough barren there is nowhere to raise huts/cottages/processors.
  // Radius-4 disk: R1 = peasant base terrain, R2/R3 = the mined deposits (2-3 of
  // EACH so an extractor always has a reachable site — a single dist-2 deposit was
  // often left un-contiguous and never mined, starving e.g. the whole gold→ring→
  // aristocrat chain), R4 = mostly barren so a big self-sufficient capital has room
  // for its many houses + processors. Barren also seeds stepping-stones in every
  // direction so the outer deposits become reachable as the footprint grows.
  const FILL = {
    1: ["fertile", "forest", "fish", "barren", "fertile", "forest"],
    2: ["barren", "stone_deposit", "iron_deposit", "clay_deposit", "coal_deposit",
        "gold_deposit", "barren", "fish", "fertile", "forest", "iron_deposit", "coal_deposit"],
    3: ["barren", "barren", "gold_deposit", "clay_deposit", "stone_deposit", "barren",
        "fertile", "forest", "fish", "barren", "iron_deposit", "coal_deposit",
        "gold_deposit", "barren", "fertile", "barren", "forest", "barren"],
    4: ["barren", "barren", "barren", "fertile", "barren", "barren", "forest", "barren",
        "stone_deposit", "fish", "barren", "clay_deposit", "barren", "fertile", "barren",
        "barren", "forest", "gold_deposit", "barren", "fish", "barren", "barren", "barren", "barren"],
  };
  for (const ctr of CENTERS) {
    const disk = HexMath.range(ctr.q, ctr.r, 4);
    const idx = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const h of disk) {
      const d = HexMath.dist(ctr.q, ctr.r, h.q, h.r);
      if (d === 0) continue;            // town-center hex stays barren
      const pal = FILL[d]; if (!pal) continue;
      put(h.q, h.r, pal[idx[d]++ % pal.length]);
    }
  }

  // ---- state --------------------------------------------------------------
  const state = {
    map: { seed: "bal2", radius: RAD, hexes },
    roads: new Set(),
    towns: [],
    carts: [],
    treasury: 10000,
    tariffRate: CONFIG.trade.tariffRate,
    research: Research.fresh(),
    market: Market && Market.fresh ? Market.fresh() : { hist: {}, head: 0, len: 0 },
    warehouse: {},
    // Seed the castle material store from CONFIG.researchEconomy.starterStock, exactly
    // as the real game does (index.html newGame). This is what lets the FIRST Research
    // Center be built (build cost stone:20/wood:10) before any city produces a surplus.
    castleStock: Object.assign({}, (CONFIG.researchEconomy && CONFIG.researchEconomy.starterStock) || {}),
    researchSeed: 0x9e3779b9 | 0,
    castleTrade: {},
    castleReserved: {},
    castleMarketSeed: 0x2545f491 | 0,
    prestige: 0,
    castleLevel: 1,
    quest: null,
    victory: false,
    _questSeq: 0,
    tradeSeed: 0x5bd1e995 | 0,
    tick: 0,
  };

  function makeTown(q, r) {
    const town = {
      id: state.towns.length + 1, q, r, level: 1, gold: 1000,
      pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
      stock: { ...CONFIG.town.startStock }, prices: {}, buildings: [], happiness: 50,
    };
    for (const id of Object.keys(CONFIG.goods)) Sim.priceFor(town, id);
    return town;
  }

  // Found the 3 cities.
  for (const ctr of CENTERS) {
    const res = Buildings.canPlaceTown(state, ctr.q, ctr.r);
    if (!res.ok) throw new Error("cannot found town at " + K(ctr.q, ctr.r) + ": " + res.reason);
    Buildings.chargeFounding(state);
    state.towns.push(makeTown(ctr.q, ctr.r));
  }

  // ---- roads: connect castle + all centers via hex lines ------------------
  function hexLine(a, b) {
    const N = HexMath.dist(a.q, a.r, b.q, b.r);
    const out = [];
    for (let i = 0; i <= N; i++) {
      const t = N === 0 ? 0 : i / N;
      const q = a.q + (b.q - a.q) * t;
      const r = a.r + (b.r - a.r) * t;
      out.push(HexMath.hexRound(q, r));
    }
    return out;
  }
  const nodes = [{ q: 0, r: 0 }, ...CENTERS];
  // Phase-2 victory pass: City#4 (the aristocrat/citizen district) is now CONNECTED —
  // castle-D + A-D + C-D — so its T3-luxury chain + aristocrat_home can build, trade,
  // and populate. (Pre-2A this "collapsed the deterministic run"; the 2A economy rework
  // — wider slot caps, worker-tiered pottery/carpentry, un-gated aristocrat research —
  // makes the 4-city trade network the intended shape.) Determinism is by seed, not by
  // matching the old 3-city curve.
  const links = [[0, 1], [1, 2], [1, 3], [0, 2], [2, 3], [0, 4], [1, 4], [3, 4]];
  for (const [i, j] of links) {
    for (const h of hexLine(nodes[i], nodes[j])) {
      // don't road a town center hex
      if (CENTERS.some(c => c.q === h.q && c.r === h.r)) continue;
      state.roads.add(K(h.q, h.r));
    }
  }

  // ---------------------------------------------------------------------------
  // Placement helper — find the FIRST valid hex for a building type near a town
  // using the REAL Buildings.canPlaceBuilding, then charge + add it.
  // ---------------------------------------------------------------------------
  // Terrains an extractor needs — a sane player never wastes them on a house or
  // processor (which build fine on plain barren ground).
  const EXTRACTOR_TERRAINS = new Set();
  for (const d of Object.values(CONFIG.buildings)) if (d.kind === "extractor" && d.terrain) EXTRACTOR_TERRAINS.add(d.terrain);

  function placeBuilding(town, typeId) {
    const def = CONFIG.buildings[typeId];
    if (!def) return false;
    // candidate hexes: all map hexes within radius 6 of the town center
    const cand = HexMath.range(town.q, town.r, 6);
    // extractors: only their terrain; others: buildable land, but NEVER on a hex
    // that some extractor needs (don't pave farmland/forest with a house).
    cand.sort((a, b) => HexMath.dist(a.q, a.r, town.q, town.r) - HexMath.dist(b.q, b.r, town.q, town.r));
    for (const c of cand) {
      if (def.kind !== "extractor") {
        const hx = hexes.get(K(c.q, c.r));
        if (hx && EXTRACTOR_TERRAINS.has(hx.terrain)) continue; // reserve resource terrain
      }
      const r = Buildings.canPlaceBuilding(state, typeId, c.q, c.r);
      if (r.ok && r.town === town) {
        Buildings.chargeBuilding(state, town, typeId);
        town.buildings.push({ typeId, q: c.q, r: c.r, workers: 0, built: Buildings.isInstant(def) ? true : false, delivered: {} });
        return true;
      }
    }
    return false;
  }

  // ---- Research Center: place it next to the castle at setup ---------------
  // The tech tree is PAUSED until a built Research Center exists (centerSpeed 0 =
  // no accrual/consumption). A rational player builds it immediately — it costs
  // only 300g + stone:20/wood:10, all covered by the castle's starterStock. Place
  // it on the first free castle-adjacent buildable hex (not on a road/town/castle);
  // Research.tickCenter then delivers the materials from castleStock over ~6 ticks.
  const castle = Buildings.castleHex ? (function () {
    const c = (CONFIG.town && CONFIG.town.castle) || { q: 0, r: 0 }; return c;
  })() : { q: 0, r: 0 };
  let centerPlaced = false;
  for (const n of HexMath.neighbors(castle.q, castle.r)) {
    const res = Buildings.placeResearchCenter(state, n.q, n.r);
    if (res.ok) { centerPlaced = true; break; }
  }
  if (!centerPlaced) throw new Error("player.js: could not place Research Center adjacent to the castle");

  return { C, state, placeBuilding, makeTown, CENTERS };
}

// One economy step — full accumulator order (minus Events/Tutorial, which are
// opportunities/UI and irrelevant to steady-state balance).
function step(C, state) {
  const { Sim, Trade, Market, ResearchEconomy, CastleMarket, Research, Quests } = C;
  Sim.tick(state);
  Trade.tick(state);
  if (Market && Market.tick) Market.tick(state);
  ResearchEconomy.tick(state);
  CastleMarket.tick(state);
  // Slice A: deliver materials from castleStock into the Research Center
  // (build/upgrade) AFTER the buyers stock the castle, BEFORE research runs —
  // mirrors the real game's accumulator order (index.html main loop). Without
  // this the center never finishes construction, so research stays PAUSED and
  // the whole tier progression stalls at peasants.
  if (Research.tickCenter) Research.tickCenter(state);
  Research.tick(state);
  Quests.tick(state);
}

module.exports = { build, step };
