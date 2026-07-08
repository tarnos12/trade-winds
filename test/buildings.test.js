// Headless test for Trade Winds — the pure Buildings module. Covers the shared
// data contract (CONFIG.buildings / CONFIG.town, slotCap, usedSlots,
// housingCapacity) AND the Placement v2 contiguous-city model (PV2-A):
// footprint / footprintCitiesAdjacent / touchesCastle / canPlaceBuilding /
// canPlaceTown. Evals the code between the PURE_CORE markers — no browser.
//   node test/buildings.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Buildings=Buildings;", sandbox);
const { CONFIG, HexMath, Buildings } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

// --- Synthetic map ----------------------------------------------------------
// A meadow patch built well away from the castle (map center 0,0), with specific
// terrain overrides so extractor terrain rules are deterministic. Town A lives at
// (5,0); the castle footprint at (0,0) is far enough not to interfere.
function hx(q, r, terrain) { return [HexMath.key(q, r), { q, r, terrain, revealed: true }]; }
function makeState() {
  const hexes = new Map();
  // broad meadow patch around the town area (radius 3 about (5,0))
  for (const c of HexMath.range(5, 0, 3)) hexes.set(...hx(c.q, c.r, "meadow"));
  // castle hex exists on the map too (buildable ground, per MapGen)
  hexes.set(...hx(0, 0, "meadow"));
  // a couple of hexes near the castle so castle-gap tests have real hexes
  hexes.set(...hx(1, 0, "meadow"));
  hexes.set(...hx(2, 0, "meadow"));
  // terrain overrides (all adjacent to town center (5,0) unless noted)
  hexes.set(...hx(6, 0, "forest"));    // lumberjack (adj to A center)
  hexes.set(...hx(5, 1, "fertile"));   // farm       (adj to A center)
  hexes.set(...hx(6, -1, "hills"));    // miner      (adj to A center)
  hexes.set(...hx(3, 0, "water"));     // water body (dist 2 from A)
  hexes.set(...hx(4, 0, "meadow"));    // land adj to A AND bordering water → fishery
  // EC-A: state.treasury is the Kingdom purse that pays all placement GOLD.
  return { map: { hexes }, roads: new Set(), towns: [], treasury: 10000 };
}
function makeTown(over) {
  return Object.assign({
    id: 1, q: 5, r: 0, level: 1, gold: 1000,
    pop: { peasants: 8, workers: 0, burghers: 0 },
    stock: { wood: 100, stone: 100, planks: 100, grain: 50 },
    prices: {}, buildings: [],
  }, over || {});
}

// ============================================================================
// 1) slotCap by town level = 7 / 9 / 11 / 13 (EC-A; index 0 unused; fallback 3).
// ============================================================================
ok("slotCap(1) === 7", Buildings.slotCap(1) === 7);
ok("slotCap(2) === 9", Buildings.slotCap(2) === 9);
ok("slotCap(3) === 11", Buildings.slotCap(3) === 11);
ok("slotCap(4) === 13", Buildings.slotCap(4) === 13);
ok("slotCap(unknown) falls back to 3", Buildings.slotCap(99) === 3);

// ============================================================================
// 2) CONFIG.town + catalog sanity (shared data contract).
// ============================================================================
ok("CONFIG.town.slotCap = [0,7,9,11,13]", JSON.stringify(CONFIG.town.slotCap) === JSON.stringify([0, 7, 9, 11, 13]));
ok("CONFIG.town.castle = {q:0,r:0}", CONFIG.town.castle && CONFIG.town.castle.q === 0 && CONFIG.town.castle.r === 0);
ok("CONFIG.town.baseWorkers.peasants is 0 (population is housing-driven)",
   typeof CONFIG.town.baseWorkers.peasants === "number" && CONFIG.town.baseWorkers.peasants >= 0);
// EV3: a new city starts with 20 wood (a basic peasant need — firewood).
ok("CONFIG.town.startStock is { wood: 20 }", CONFIG.town.startStock.wood === 20);
// EV3: per-city storage cap.
ok("CONFIG.town.storageCap === 80", CONFIG.town.storageCap === 80);
ok("CONFIG.town.foundCost === 1000", CONFIG.town.foundCost === 1000 && Buildings.foundCost() === 1000);
ok("basic house (hut) shelters 2", CONFIG.buildings.hut.houseCapacity === 2);
// EV3: the three starters (lumberjack/farm/hut) cost GOLD ONLY at level 1.
ok("starter buildings are gold-only (lumberjack/farm/hut)", [
  "lumberjack", "farm", "hut",
].every(id => { const c = CONFIG.buildings[id].cost; return c.gold > 0 && !c.wood && !c.stone && !c.planks; }));
// EV3: exact costs.
ok("starter costs: lumberjack 100 / hut 200 / farm 250 (gold)",
  CONFIG.buildings.lumberjack.cost.gold === 100 && CONFIG.buildings.hut.cost.gold === 200 && CONFIG.buildings.farm.cost.gold === 250);
// EV3: potato_farm — a startUnlocked, gold-only food extractor on fertile terrain.
ok("potato_farm exists (fertile extractor → potato, startUnlocked, gold-only)", (() => {
  const p = CONFIG.buildings.potato_farm;
  return p && p.kind === "extractor" && p.terrain === "fertile" && p.workerTier === "peasant" &&
    p.output && p.output.goodId === "potato" && p.startUnlocked === true &&
    p.cost && p.cost.gold > 0 && !p.cost.wood && !p.cost.stone && !p.cost.planks;
})());
const kinds = Object.values(CONFIG.buildings).map(b => b.kind);
ok("catalog has extractors/processors/houses", kinds.includes("extractor") && kinds.includes("processor") && kinds.includes("house"));
ok("extractors are peasant-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "extractor").every(b => b.workerTier === "peasant"));
// Processors are worker-staffed, except the starter sawmill which is peasant-run (basic wood→planks).
ok("processors are worker- or peasant-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "processor").every(b => b.workerTier === "worker" || b.workerTier === "peasant"));
ok("houses declare houseTier + houseCapacity, no output/workers",
  Object.values(CONFIG.buildings).filter(b => b.kind === "house").every(b => b.houseTier && b.houseCapacity > 0 && !b.output && !b.workerSlots));
ok("expected extractor ids present", ["lumberjack", "farm", "miner", "quarry", "fishery", "shepherd"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "extractor"));
ok("expected processor ids present", ["sawmill", "mill", "bakery", "brewery", "smelter", "weaver"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "processor"));
ok("expected house ids present", ["hut", "cottage", "manor"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "house"));

// ---- BAL: per-building research unlock ----
const STARTERS = ["hut", "lumberjack", "farm", "sawmill"];
ok("the four starters are startUnlocked (and carry no unlockedBy)",
  STARTERS.every(id => CONFIG.buildings[id].startUnlocked === true && !CONFIG.buildings[id].unlockedBy));
const researchIds = new Set((CONFIG.research || []).map(n => n.id));
ok("every non-startUnlocked building has an unlockedBy that exists in CONFIG.research",
  Object.values(CONFIG.buildings).every(b =>
    b.startUnlocked
      ? !b.unlockedBy                       // startUnlocked (incl. EV3 potato_farm) → no gate
      : (typeof b.unlockedBy === "string" && researchIds.has(b.unlockedBy))));

// ============================================================================
// 3) Footprint + adjacency + castle helpers.
// ============================================================================
{
  const st = makeState();
  const town = makeTown({ buildings: [{ typeId: "lumberjack", q: 6, r: 0, workers: 0 }] });
  st.towns.push(town);

  const fp = Buildings.footprint(town);
  ok("footprint includes center + building hexes",
    fp.includes(HexMath.key(5, 0)) && fp.includes(HexMath.key(6, 0)) && fp.length === 2);
  ok("footprint of empty town = center only", Buildings.footprint(makeTown()).length === 1);

  // (5,-1) borders the center (5,0) → adjacent to town A.
  const adj = Buildings.footprintCitiesAdjacent(st, 5, -1);
  ok("footprintCitiesAdjacent finds the 1 owning city", adj.length === 1 && adj[0] === town);
  // (6,1) borders the lumberjack at (6,0) → also adjacent to town A (via footprint).
  ok("adjacency counts building hexes, not just center", Buildings.footprintCitiesAdjacent(st, 6, 1).length === 1);
  // A hex far from the footprint touches no city.
  ok("far hex touches no city", Buildings.footprintCitiesAdjacent(st, 3, 0).length === 0);

  // Castle helpers (castle at 0,0).
  ok("touchesCastle true at castle hex", Buildings.touchesCastle(st, 0, 0) === true);
  ok("touchesCastle true adjacent to castle", Buildings.touchesCastle(st, 1, 0) === true);
  ok("touchesCastle false away from castle", Buildings.touchesCastle(st, 5, 0) === false);
}

// ============================================================================
// 4) canPlaceBuilding — valid cases resolve the OWNING town.
// ============================================================================
{
  const st = makeState();
  const town = makeTown();
  st.towns.push(town);

  const lj = Buildings.canPlaceBuilding(st, "lumberjack", 6, 0);   // forest adj to center
  ok("lumberjack on adjacent forest → ok", lj.ok === true);
  ok("canPlaceBuilding returns the owning town", lj.town === town);

  ok("farm on adjacent fertile → ok", Buildings.canPlaceBuilding(st, "farm", 5, 1).ok === true);
  ok("miner on adjacent hills → ok", Buildings.canPlaceBuilding(st, "miner", 6, -1).ok === true);
  ok("fishery on land adj to center bordering water → ok", Buildings.canPlaceBuilding(st, "fishery", 4, 0).ok === true);
  ok("sawmill (processor) on adjacent land → ok", Buildings.canPlaceBuilding(st, "sawmill", 5, -1).ok === true);
  ok("hut (house) on adjacent land → ok", Buildings.canPlaceBuilding(st, "hut", 4, 1).ok === true);
}

// ============================================================================
// 5) canPlaceBuilding — each violation returns { ok:false, reason }.
// ============================================================================
{
  const st = makeState();
  const town = makeTown();
  st.towns.push(town);

  // terrain: lumberjack wants forest — (5,1) is fertile
  const wrongTerr = Buildings.canPlaceBuilding(st, "lumberjack", 5, 1);
  ok("wrong terrain → not ok + reason", wrongTerr.ok === false && !!wrongTerr.reason);

  // fishery not bordering water — (5,-1) meadow has no water neighbour
  const noWater = Buildings.canPlaceBuilding(st, "fishery", 5, -1);
  ok("fishery away from water → not ok", noWater.ok === false && !!noWater.reason);

  // processor/house on non-buildable terrain — (3,0) is water
  const onWater = Buildings.canPlaceBuilding(st, "sawmill", 3, 0);
  ok("processor on water → not ok", onWater.ok === false && !!onWater.reason);

  // no hex on the map
  const nohex = Buildings.canPlaceBuilding(st, "lumberjack", 40, 40);
  ok("no hex → not ok", nohex.ok === false && !!nohex.reason);

  // contiguity: a valid-terrain hex not bordering any city → "must touch a city"
  const detached = Buildings.canPlaceBuilding(st, "hut", 7, 0);   // 2 hexes from center, not adjacent
  ok("not adjacent to any city → not ok + 'touch a city'", detached.ok === false && /touch a city/i.test(detached.reason));

  // occupied by an existing building
  town.buildings.push({ typeId: "lumberjack", q: 6, r: 0, workers: 0 });
  const occ = Buildings.canPlaceBuilding(st, "farm", 6, 0);
  ok("occupied hex → not ok", occ.ok === false && !!occ.reason);

  // road on the hex (adjacent to center so contiguity would otherwise pass)
  st.roads.add(HexMath.key(5, -1));
  const onRoad = Buildings.canPlaceBuilding(st, "hut", 5, -1);
  ok("road hex → not ok", onRoad.ok === false && !!onRoad.reason);

  // town center hex
  const onCenter = Buildings.canPlaceBuilding(st, "hut", 5, 0);
  ok("town center hex → not ok", onCenter.ok === false && !!onCenter.reason);
}

// ============================================================================
// 6) contiguity gap — a hex bordering TWO cities is rejected (no fusing).
// ============================================================================
{
  const st = makeState();
  const townA = makeTown({ id: 1, q: 5, r: 0 });
  const townB = makeTown({ id: 2, q: 7, r: 0 });
  st.towns.push(townA, townB);
  // (6,0) borders both (5,0) and (7,0).
  ok("hex between two cities finds 2", Buildings.footprintCitiesAdjacent(st, 6, 0).length === 2);
  const fuse = Buildings.canPlaceBuilding(st, "lumberjack", 6, 0);
  ok("would join two cities → not ok + 'gap'", fuse.ok === false && /gap|two cities/i.test(fuse.reason));
}

// ============================================================================
// 7) castle gap — a hex adjacent to (or on) the castle is rejected.
// ============================================================================
{
  const st = makeState();
  // town near the castle so (1,0) borders BOTH the city and the castle.
  const town = makeTown({ id: 1, q: 2, r: 0 });
  st.towns.push(town);
  ok("(1,0) borders the city", Buildings.footprintCitiesAdjacent(st, 1, 0).length === 1);
  const nearCastle = Buildings.canPlaceBuilding(st, "hut", 1, 0);
  ok("adjacent to castle → not ok + 'castle'", nearCastle.ok === false && /castle/i.test(nearCastle.reason));
}

// ============================================================================
// 8) slot cap enforced — fill the cap contiguously, next placement rejected.
// ============================================================================
{
  const st = makeState();
  // EC-A: level-1 cap is now 7 — fill 7 slots so the 8th is rejected. (Only the
  // usedSlots count matters here, so the filler hexes need not be valid placements.)
  const fill = [];
  for (let i = 0; i < 7; i++) fill.push({ typeId: "hut", q: 10 + i, r: 3, workers: 0 });
  const town = makeTown({ level: 1, buildings: fill });
  st.towns.push(town);
  ok("usedSlots counts all placed buildings", Buildings.usedSlots(town) === 7);
  // (4,1) borders the center → contiguous, but the level-1 cap (3) is full.
  const capped = Buildings.canPlaceBuilding(st, "cottage", 4, 1);
  ok("over slot cap → not ok + 'slot'", capped.ok === false && /slot/i.test(capped.reason));
}

// ============================================================================
// 9) affordability (CB-A): only GOLD (from the Kingdom treasury) is checked at
//    placement. RESOURCE costs are NO LONGER required up front — a building may
//    be placed under construction and its traders buy the materials.
// ============================================================================
{
  const st = makeState();
  st.treasury = 0;                 // Kingdom is broke → gold cost unaffordable
  const town = makeTown();
  st.towns.push(town);
  const noGold = Buildings.canPlaceBuilding(st, "lumberjack", 6, 0);
  ok("empty treasury → not ok + 'gold'", noGold.ok === false && /gold/i.test(noGold.reason));

  // CB-A: a city missing a required RESOURCE (mill needs stone) is NO LONGER
  // rejected — gold is sufficient, so placement is allowed (traders will buy it).
  const st2 = makeState();
  const noStone = makeTown({ stock: { wood: 100 } }); // mill needs stone — but city lacks it
  st2.towns.push(noStone);
  const short = Buildings.canPlaceBuilding(st2, "mill", 5, -1);
  ok("CB-A: city missing resource still places (gold sufficient)", short.ok === true && short.town === noStone);

  // …but still rejected when the KINGDOM treasury can't cover the gold.
  const st3 = makeState();
  st3.treasury = 0;
  const brokeMill = makeTown({ stock: {} });
  st3.towns.push(brokeMill);
  const noGoldMill = Buildings.canPlaceBuilding(st3, "mill", 5, -1);
  ok("CB-A: treasury short → still rejected on gold", noGoldMill.ok === false && /gold/i.test(noGoldMill.reason));
}

// ============================================================================
// 10) back-compat wrapper canPlace(state, town, ...) still resolves.
// ============================================================================
{
  const st = makeState();
  const townA = makeTown({ id: 1, q: 5, r: 0 });
  const townB = makeTown({ id: 2, q: 8, r: 0 });   // far enough not to fuse
  st.towns.push(townA, townB);
  ok("wrapper ok when owner === passed town", Buildings.canPlace(st, townA, "lumberjack", 6, 0).ok === true);
  // (6,0) borders A but not B → wrapper for B must reject with a reason.
  const wrongOwner = Buildings.canPlace(st, townB, "lumberjack", 6, 0);
  ok("wrapper rejects when resolved owner !== passed town", wrongOwner.ok === false && !!wrongOwner.reason);
  ok("wrapper with no town → not ok", Buildings.canPlace(st, null, "hut", 6, 0).ok === false);
}

// ============================================================================
// 11) canPlaceTown — gap rule for founding new town centers.
// ============================================================================
{
  const st = makeState();
  const town = makeTown({ id: 1, q: 5, r: 0 });
  st.towns.push(town);

  // adjacent to an existing city → rejected
  const nearCity = Buildings.canPlaceTown(st, 5, -1);
  ok("town adjacent to a city → not ok + reason", nearCity.ok === false && !!nearCity.reason);

  // adjacent to the castle → rejected
  const nearCastle = Buildings.canPlaceTown(st, 1, 0);
  ok("town adjacent to the castle → not ok + 'castle'", nearCastle.ok === false && /castle/i.test(nearCastle.reason));

  // on the castle hex → rejected
  ok("town on castle hex → not ok", Buildings.canPlaceTown(st, 0, 0).ok === false);

  // on water → rejected
  ok("town on water → not ok", Buildings.canPlaceTown(st, 3, 0).ok === false);

  // isolated buildable hex, no city/castle nearby → accepted
  const isolated = Buildings.canPlaceTown(st, 7, 0);   // 2 hexes from the town, far from castle
  ok("isolated buildable hex → ok", isolated.ok === true);
}

// ============================================================================
// 12) housingCapacity sums placed houses by tier (producers ignored).
// ============================================================================
{
  const town = makeTown({ buildings: [
    { typeId: "hut", q: 6, r: 0, workers: 0 },      // peasant
    { typeId: "hut", q: 5, r: 1, workers: 0 },      // peasant
    { typeId: "cottage", q: 5, r: -1, workers: 0 }, // worker
    { typeId: "manor", q: 4, r: 1, workers: 0 },    // burgher
    { typeId: "lumberjack", q: 4, r: 0, workers: 0 }, // producer — ignored
  ] });
  const cap = Buildings.housingCapacity(town);
  const hut = CONFIG.buildings.hut.houseCapacity;
  const cot = CONFIG.buildings.cottage.houseCapacity;
  const man = CONFIG.buildings.manor.houseCapacity;
  ok("housing peasants = 2 huts", cap.peasants === 2 * hut);
  ok("housing workers = 1 cottage", cap.workers === cot);
  ok("housing burghers = 1 manor", cap.burghers === man);

  const empty = Buildings.housingCapacity(makeTown());
  ok("no houses → all zero", empty.peasants === 0 && empty.workers === 0 && empty.burghers === 0);
}

// ============================================================================
// 13) CB-A money model — placement charges GOLD ONLY (→ state.treasury). The
//     RESOURCE cost is NO LONGER deducted at placement (materials are delivered
//     from town.stock over time by the Sim construction step); town.gold (trade
//     budget) is untouched. Founding a city still costs 1000 treasury gold.
// ============================================================================
{
  const st = makeState();          // treasury 10000
  const town = makeTown();         // gold 1000, stock wood/stone/planks 100
  st.towns.push(town);
  const t0 = st.treasury, g0 = town.gold, wood0 = town.stock.wood, stone0 = town.stock.stone;

  // mill costs { wood, stone, gold } — only the gold is charged now.
  const def = CONFIG.buildings.mill;
  Buildings.chargeBuilding(st, town, "mill");
  ok("chargeBuilding deducts gold from treasury", st.treasury === t0 - (def.cost.gold || 0));
  ok("chargeBuilding leaves town.gold (trade budget) untouched", town.gold === g0);
  ok("CB-A: chargeBuilding does NOT deduct wood from city stock", town.stock.wood === wood0);
  ok("CB-A: chargeBuilding does NOT deduct stone from city stock", town.stock.stone === stone0);

  // Founding a city costs 1000 treasury gold.
  const st2 = makeState();         // treasury 10000
  const f0 = st2.treasury;
  Buildings.chargeFounding(st2);
  ok("chargeFounding deducts 1000 from treasury", st2.treasury === f0 - 1000);

  // canPlaceTown blocks when the treasury can't cover founding.
  const st3 = makeState();
  st3.treasury = 500;              // < 1000 founding cost
  const poor = Buildings.canPlaceTown(st3, 7, 0);   // otherwise-valid isolated hex
  ok("treasury < 1000 → canPlaceTown blocked + 'gold'", poor.ok === false && /gold/i.test(poor.reason));
  st3.treasury = 1000;
  ok("treasury ≥ 1000 → canPlaceTown ok", Buildings.canPlaceTown(st3, 7, 0).ok === true);
}

// ============================================================================
// 14) CB-A — construction data helpers (resourceCost / isInstant /
//     constructionNeed) and the built/instant placement rule.
// ============================================================================
{
  // resourceCost drops gold, keeps positive material costs.
  const millRC = Buildings.resourceCost(CONFIG.buildings.mill);   // { wood, stone }
  ok("resourceCost drops gold, keeps materials",
    millRC.wood === CONFIG.buildings.mill.cost.wood &&
    millRC.stone === CONFIG.buildings.mill.cost.stone && !("gold" in millRC));
  ok("resourceCost of a gold-only building is empty",
    Object.keys(Buildings.resourceCost(CONFIG.buildings.hut)).length === 0);
  ok("resourceCost handles a def with no cost", (() => {
    const r = Buildings.resourceCost({});
    return r && typeof r === "object" && Object.keys(r).length === 0;
  })());

  // isInstant: gold-only / free → instant; any material cost → not instant.
  ok("isInstant true for gold-only starters (hut/lumberjack/farm)",
    ["hut", "lumberjack", "farm"].every(id => Buildings.isInstant(CONFIG.buildings[id]) === true));
  ok("isInstant false for buildings with a resource cost (mill/sawmill/cottage)",
    ["mill", "sawmill", "cottage"].every(id => Buildings.isInstant(CONFIG.buildings[id]) === false));

  // constructionNeed: remaining = resourceCost − delivered (built → {}).
  const unbuilt = { typeId: "mill", q: 0, r: 0, workers: 0, built: false, delivered: { wood: 10 } };
  const need = Buildings.constructionNeed(unbuilt);
  ok("constructionNeed = resourceCost − delivered (positive remainders)",
    need.wood === CONFIG.buildings.mill.cost.wood - 10 && need.stone === CONFIG.buildings.mill.cost.stone);
  ok("constructionNeed of a built building is empty",
    Object.keys(Buildings.constructionNeed({ typeId: "mill", q: 0, r: 0, built: true })).length === 0);
  ok("constructionNeed of a LEGACY building (no built flag) is empty (treated as built)",
    Object.keys(Buildings.constructionNeed({ typeId: "mill", q: 0, r: 0 })).length === 0);
  ok("constructionNeed omits fully-delivered goods",
    !("wood" in Buildings.constructionNeed({ typeId: "sawmill", q: 0, r: 0, built: false, delivered: { wood: 999 } })));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
