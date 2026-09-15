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
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Buildings=Buildings; this.Research=Research;", sandbox);
const { CONFIG, HexMath, Buildings, Research } = sandbox;

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
  // === TV2: broad BARREN patch (generic buildable ground) around (5,0), r=3 ===
  for (const c of HexMath.range(5, 0, 3)) hexes.set(...hx(c.q, c.r, "barren"));
  // castle hex exists on the map too (buildable ground, per MapGen)
  hexes.set(...hx(0, 0, "barren"));
  // a couple of hexes near the castle so castle-gap tests have real hexes
  hexes.set(...hx(1, 0, "barren"));
  hexes.set(...hx(2, 0, "barren"));
  // terrain overrides (all adjacent to town center (5,0) unless noted)
  hexes.set(...hx(6, 0, "forest"));         // lumberjack (adj to A center)
  hexes.set(...hx(5, 1, "fertile"));        // farm/shepherd (adj to A center)
  hexes.set(...hx(6, -1, "iron_deposit"));  // iron_mine   (adj to A center)
  hexes.set(...hx(3, 0, "water"));          // water body (dist 2 from A)
  hexes.set(...hx(4, 0, "fish"));           // fish tile adj to A → fishery sits on it
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
// 1) slotCap by town level = 8 / 12 / 17 / 24 (EC-A -> BAL2 -> Phase-2 victory-pass
//    retune: L3/L4 widened so a connected city can host the full T3 luxury chain +
//    aristocrat housing; index 0 unused; fallback 3).
// ============================================================================
ok("slotCap(1) === 8", Buildings.slotCap(1) === 8);
ok("slotCap(2) === 12", Buildings.slotCap(2) === 12);
ok("slotCap(3) === 17", Buildings.slotCap(3) === 17);
ok("slotCap(4) === 24", Buildings.slotCap(4) === 24);
ok("slotCap(unknown) falls back to 3", Buildings.slotCap(99) === 3);

// ============================================================================
// 2) CONFIG.town + catalog sanity (shared data contract).
// ============================================================================
ok("CONFIG.town.slotCap = [0,8,12,17,24]", JSON.stringify(CONFIG.town.slotCap) === JSON.stringify([0, 8, 12, 17, 24]));
ok("CONFIG.town.castle = {q:0,r:0}", CONFIG.town.castle && CONFIG.town.castle.q === 0 && CONFIG.town.castle.r === 0);
ok("CONFIG.town.baseWorkers.peasants is 0 (population is housing-driven)",
   typeof CONFIG.town.baseWorkers.peasants === "number" && CONFIG.town.baseWorkers.peasants >= 0);
// EV3: a new city starts with 20 wood (a basic peasant need — firewood).
ok("CONFIG.town.startStock is { wood: 60, potato: 20 }", CONFIG.town.startStock.wood === 60 && CONFIG.town.startStock.potato === 20);
// EV3: per-city storage cap.
ok("CONFIG.town.storageCap === 80", CONFIG.town.storageCap === 80);
ok("CONFIG.town.foundCost === 1000", CONFIG.town.foundCost === 1000 && Buildings.foundCost() === 1000);
ok("basic house (hut) shelters 2", CONFIG.buildings.hut.houseCapacity === 2);
// v0.49: T1 starters now cost WOOD (built over time), delivered from the city's
// stock. farm (a research unlock) stays gold-only.
ok("T1 producer starters are wood-only (lumberjack/potato_farm)", [
  "lumberjack", "potato_farm",
].every(id => { const c = CONFIG.buildings[id].cost; return c.wood > 0 && !c.gold; }));
// v0.51: the hut (L1 house) costs 10 wood + 300 gold.
ok("hut L1 costs 10 wood + 300 gold", CONFIG.buildings.hut.cost.wood === 10 && CONFIG.buildings.hut.cost.gold === 300);
ok("farm stays gold-only", (() => { const c = CONFIG.buildings.farm.cost; return c.gold > 0 && !c.wood; })());
// v0.49: exact wood costs.
ok("starter costs: lumberjack 10 / hut 10 / potato_farm 10 / sawmill 20 (wood)",
  CONFIG.buildings.lumberjack.cost.wood === 10 && CONFIG.buildings.hut.cost.wood === 10 &&
  CONFIG.buildings.potato_farm.cost.wood === 10 && CONFIG.buildings.sawmill.cost.wood === 20);
// v0.49: potato_farm — a startUnlocked wood-cost food extractor on fertile terrain.
ok("potato_farm exists (fertile extractor → potato, startUnlocked, wood cost)", (() => {
  const p = CONFIG.buildings.potato_farm;
  return p && p.kind === "extractor" && p.terrain === "fertile" && p.workerTier === "peasant" &&
    p.output && p.output.goodId === "potato" && p.startUnlocked === true &&
    p.cost && p.cost.wood > 0 && !p.cost.gold;
})());
const kinds = Object.values(CONFIG.buildings).map(b => b.kind);
ok("catalog has extractors/processors/houses", kinds.includes("extractor") && kinds.includes("processor") && kinds.includes("house"));
// === TV2: extractors are peasant- OR worker-staffed (T2 mines are worker) ===
ok("extractors are peasant- or worker-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "extractor").every(b => b.workerTier === "peasant" || b.workerTier === "worker"));
// Processors are worker-staffed, except the starter sawmill which is peasant-run (basic wood→planks).
// === CC: processors are peasant / worker / burgher(citizen)-staffed. ===
ok("processors are peasant/worker/burgher-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "processor").every(b => ["peasant", "worker", "burgher"].indexOf(b.workerTier) >= 0));
ok("houses declare houseTier + houseCapacity, no output/workers",
  Object.values(CONFIG.buildings).filter(b => b.kind === "house").every(b => b.houseTier && b.houseCapacity > 0 && !b.output && !b.workerSlots));
ok("expected extractor ids present", ["lumberjack", "farm", "iron_mine", "quarry", "fishery", "shepherd", "clay_pit", "coal_mine", "gold_mine"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "extractor"));
// === CC: smelter/weaver RETIRED; new worker + citizen processors present. ===
ok("smelter + weaver retired (removed from catalog)", !CONFIG.buildings.smelter && !CONFIG.buildings.weaver);
ok("expected WORKER processor ids present", ["sawmill", "mill", "bakery", "brewery", "brickworks", "tailoring", "charcoal_burner", "stonetool_maker", "oil_maker"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "processor"));
// Phase-2 victory pass re-tiered pottery_workshop + carpentry to WORKER-staffed (with
// a burgher research band, lamp_maker precedent) so their T3 inputs (pottery, chairs)
// can be produced before a full burgher workforce exists — un-gating the aristocrat
// chain. The remaining luxury processors stay burgher-staffed.
ok("expected LUXURY processor ids present + correctly tiered", (() => {
  const burgherMade = ["forge", "armory", "distillery", "goldsmith", "luxury_tailor"];
  const workerMadeCitizenBand = ["pottery_workshop", "carpentry"];
  return burgherMade.every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "processor" && CONFIG.buildings[id].workerTier === "burgher")
      && workerMadeCitizenBand.every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "processor" && CONFIG.buildings[id].workerTier === "worker" && CONFIG.buildings[id].researchBand === "burgher");
})());
// BAL2 bootstrap staffing: lamp (citizen BASIC) is worker-made; coal (worker BASIC)
// is peasant-made via Charcoal Burning — research bands preserved via researchBand.
ok("lamp_maker is worker-staffed with citizen-band research", CONFIG.buildings.lamp_maker.workerTier === "worker" && CONFIG.buildings.lamp_maker.researchBand === "burgher");
ok("charcoal_burner is peasant-staffed with worker-band research", CONFIG.buildings.charcoal_burner.workerTier === "peasant" && CONFIG.buildings.charcoal_burner.researchBand === "worker");
ok("new processors sit on any land (terrain:null)", ["tailoring", "charcoal_burner", "stonetool_maker", "oil_maker", "forge", "armory", "pottery_workshop", "distillery", "goldsmith", "lamp_maker", "carpentry", "luxury_tailor"].every(id => CONFIG.buildings[id].terrain === null));
ok("expected house ids present", ["hut", "cottage", "manor"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "house"));
// === CC: aristocrat_home — houseTier 'aristocrat'. Item-O 1:1 housing pass set
//     ALL house base capacity to 2 (aristocrat_home 1 -> 2), still non-upgradable. ===
ok("aristocrat_home present (houseTier aristocrat, capacity 2)",
  CONFIG.buildings.aristocrat_home && CONFIG.buildings.aristocrat_home.kind === "house"
  && CONFIG.buildings.aristocrat_home.houseTier === "aristocrat" && CONFIG.buildings.aristocrat_home.houseCapacity === 2);
ok("aristocrat_home has NO upgrade ladder (1 slot, non-upgradable — author)",
  Buildings.upgradeLadder("aristocrat_home").length === 0
  && !Buildings.upgradeAt("aristocrat_home", 2));
// === CC: housingCapacity reports the aristocrats bucket. ===
{
  const t = makeTown({ buildings: [{ typeId: "aristocrat_home", q: 6, r: 0, workers: 0, upgradeLevel: 1 }] });
  ok("housingCapacity returns aristocrats bucket (cap 2)", Buildings.housingCapacity(t).aristocrats === 2);
  // ARISTOFIX: no ladder — an aristocrat_home always shelters exactly 2, whatever the (spurious) level.
  const t3 = makeTown({ buildings: [{ typeId: "aristocrat_home", q: 6, r: 0, workers: 0, upgradeLevel: 3 }] });
  ok("aristocrat_home always shelters 2 (non-upgradable)", Buildings.housingCapacity(t3).aristocrats === 2);
}

// ---- BAL: per-building research unlock ----
// === TV2: farm dropped from starters (now unlock_farm); potato_farm is a starter ===
const STARTERS = ["hut", "lumberjack", "potato_farm", "sawmill"];
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
  ok("iron_mine on adjacent iron_deposit → ok", Buildings.canPlaceBuilding(st, "iron_mine", 6, -1).ok === true);
  ok("fishery on the fish tile → ok", Buildings.canPlaceBuilding(st, "fishery", 4, 0).ok === true);
  ok("sawmill (processor) on adjacent land → ok", Buildings.canPlaceBuilding(st, "sawmill", 5, -1).ok === true);
  ok("hut (house) on adjacent land → ok", Buildings.canPlaceBuilding(st, "hut", 4, 1).ok === true);
}

// ============================================================================
// 4b) TV2 placement rules — deposits gate their extractor, fish-only fishery,
//     snow houses-only, mountains fully blocked, generic tiles accept any.
// ============================================================================
{
  const st = makeState();
  const town = makeTown();
  st.towns.push(town);
  // Place an iron_mine at (6,-1) so the deposit hexes around it are contiguous
  // to the city (footprint = {center (5,0), (6,-1)}).
  town.buildings.push({ typeId: "iron_mine", q: 6, r: -1, workers: 0 });
  const H = st.map.hexes;
  H.set(...hx(5, -1, "snow"));           // houses only, borders center
  H.set(...hx(4, 1, "desert"));          // generic ground, borders center
  H.set(...hx(6, -2, "clay_deposit"));   // borders iron_mine (6,-1)
  H.set(...hx(7, -2, "coal_deposit"));   // borders iron_mine (6,-1)
  H.set(...hx(7, -1, "gold_deposit"));   // borders iron_mine (6,-1)
  H.set(...hx(4, -1, "mountains"));      // obstacle

  // deposits accept only their matching extractor
  ok("clay_pit on clay_deposit → ok", Buildings.canPlaceBuilding(st, "clay_pit", 6, -2).ok === true);
  ok("coal_mine on coal_deposit → ok", Buildings.canPlaceBuilding(st, "coal_mine", 7, -2).ok === true);
  ok("gold_mine on gold_deposit → ok", Buildings.canPlaceBuilding(st, "gold_mine", 7, -1).ok === true);
  ok("iron_mine on generic ground → not ok (needs deposit)", Buildings.canPlaceBuilding(st, "iron_mine", 4, 1).ok === false);
  ok("clay_pit on wrong deposit → not ok", Buildings.canPlaceBuilding(st, "clay_pit", 7, -2).ok === false);

  // fishery is fish-only; plain water rejects it
  ok("fishery on plain water → not ok", Buildings.canPlaceBuilding(st, "fishery", 3, 0).ok === false);

  // snow: houses only
  const houseSnow = Buildings.canPlaceBuilding(st, "hut", 5, -1);
  ok("house on snow → ok", houseSnow.ok === true);
  const procSnow = Buildings.canPlaceBuilding(st, "sawmill", 5, -1);
  ok("processor on snow → not ok + 'houses'", procSnow.ok === false && /house/i.test(procSnow.reason));

  // generic ground accepts processor + house
  ok("processor on desert → ok", Buildings.canPlaceBuilding(st, "sawmill", 4, 1).ok === true);
  ok("house on fertile → ok", Buildings.canPlaceBuilding(st, "hut", 5, 1).ok === true);

  // mountains fully block building
  ok("building on mountains → not ok", Buildings.canPlaceBuilding(st, "sawmill", 4, -1).ok === false);
  // terrain roadability flags (pathing / road tool honour these)
  ok("mountains/water/fish not roadable, ground is", CONFIG.terrain.mountains.road === false &&
     CONFIG.terrain.water.road === false && CONFIG.terrain.fish.road === false &&
     CONFIG.terrain.barren.road === true && CONFIG.terrain.snow.road === true);
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

  // ITEM M: a road may SHARE a building hex — roads are a separate layer, so
  // canPlaceBuilding no longer rejects a road tile (the rejection was removed;
  // canPlaceTown / canPlaceResearchCenter still block roads). A road hex adjacent
  // to the city is therefore a VALID building placement now, resolving the owner.
  st.roads.add(HexMath.key(5, -1));
  const onRoad = Buildings.canPlaceBuilding(st, "hut", 5, -1);
  ok("road hex is now placeable (item-M: roads share the hex, resolves owner)",
     onRoad.ok === true && onRoad.town === town);

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
  // BAL2: level-1 cap is 8 — fill the cap so the next placement is rejected. (Only
  // the usedSlots count matters here, so the filler hexes need not be valid placements.)
  const CAP1 = Buildings.slotCap(1);
  const fill = [];
  // v0.51: the city centre occupies one slot, so CAP1-1 buildings fills the cap.
  for (let i = 0; i < CAP1 - 1; i++) fill.push({ typeId: "hut", q: 10 + i, r: 3, workers: 0 });
  const town = makeTown({ level: 1, buildings: fill });
  st.towns.push(town);
  ok("usedSlots counts the city centre + placed buildings", Buildings.usedSlots(town) === CAP1);
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
  // v0.49: starters cost no gold, so test the gold gate with a gold-cost building (mill).
  const noGold = Buildings.canPlaceBuilding(st, "mill", 5, -1);
  ok("empty treasury → not ok + 'gold'", noGold.ok === false && /gold/i.test(noGold.reason));
  // v0.49: a wood-cost starter IS placeable with an empty treasury (no gold required).
  ok("wood-cost starter places with empty treasury", Buildings.canPlaceBuilding(st, "lumberjack", 6, 0).ok === true);

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
    Object.keys(Buildings.resourceCost(CONFIG.buildings.farm)).length === 0);
  ok("resourceCost handles a def with no cost", (() => {
    const r = Buildings.resourceCost({});
    return r && typeof r === "object" && Object.keys(r).length === 0;
  })());

  // isInstant: gold-only / free → instant; any material cost → not instant.
  // v0.49: T1 starters now cost wood → NOT instant; farm (gold-only) is instant.
  ok("isInstant true for a gold-only building (farm)", Buildings.isInstant(CONFIG.buildings.farm) === true);
  ok("isInstant false for wood-cost starters (hut/lumberjack/potato_farm)",
    ["hut", "lumberjack", "potato_farm"].every(id => Buildings.isInstant(CONFIG.buildings[id]) === false));
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

// === RU-A: per-building upgrade helpers ====================================
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const stWith = (unlocked, over) => Object.assign({ treasury: 0, research: { unlocked: unlocked || [], active: null, progress: 0, spent: 0 } }, over);

  // -- ladder / lookup --
  ok("upgradeLadder(hut) has 4 entries", Buildings.upgradeLadder("hut").length === 4);
  ok("upgradeLadder(iron_mine) empty", Buildings.upgradeLadder("iron_mine").length === 0);
  ok("upgradeAt(hut,4) is the final-consumption entry", Buildings.upgradeAt("hut", 4).effect.basicConsumptionMult === 0.7);
  ok("upgradeAt(iron_mine,2) is null", Buildings.upgradeAt("iron_mine", 2) === null);

  // -- research gating of nextUpgrade --
  const hutB = { typeId: "hut", q: 0, r: 0, upgradeLevel: 1, pendingUpgrade: null };
  ok("nextUpgrade null while research locked", Buildings.nextUpgrade(stWith([]), hutB) === null);
  ok("nextUpgrade returns L2 once unlocked", (Buildings.nextUpgrade(stWith(["upg_hut_l2"]), hutB) || {}).level === 2);

  // -- canStartUpgrade gating --
  // v0.51: hut upgrades are MATERIAL-ONLY (no gold) → low gold no longer blocks.
  ok("canStartUpgrade not gold-gated for a material-only upgrade", (() => {
    const r = Buildings.canStartUpgrade(stWith(["upg_hut_l2"], { treasury: 0 }), {}, hutB);
    return r.ok === true;
  })());
  ok("canStartUpgrade ok with unlock", Buildings.canStartUpgrade(stWith(["upg_hut_l2"], { treasury: 100000 }), {}, hutB).ok === true);
  ok("canStartUpgrade blocked while pending", (() => {
    const r = Buildings.canStartUpgrade(stWith(["upg_hut_l2"], { treasury: 100000 }), {}, { typeId: "hut", upgradeLevel: 1, pendingUpgrade: { toLevel: 2, delivered: {} } });
    return !r.ok && r.reason === "Upgrade in progress";
  })());
  ok("canStartUpgrade blocked while under construction", (() => {
    const r = Buildings.canStartUpgrade(stWith(["upg_hut_l2"], { treasury: 100000 }), {}, { typeId: "hut", upgradeLevel: 1, pendingUpgrade: null, built: false });
    return !r.ok && r.reason === "Under construction";
  })());

  // -- startUpgrade charges gold only, sets pending --
  {
    const st = stWith(["upg_hut_l2"], { treasury: 100000 });
    const town = { stock: { wood: 50 } };
    const b = { typeId: "hut", upgradeLevel: 1, pendingUpgrade: null };
    const okStart = Buildings.startUpgrade(st, town, b);
    ok("startUpgrade returns true", okStart === true);
    ok("startUpgrade charges no gold (material-only)", st.treasury === 100000);
    ok("startUpgrade sets pending toLevel 2", b.pendingUpgrade && b.pendingUpgrade.toLevel === 2);
    ok("startUpgrade delivered starts empty", b.pendingUpgrade && Object.keys(b.pendingUpgrade.delivered).length === 0);
    ok("startUpgrade leaves town stock untouched", town.stock.wood === 50);
  }

  // -- resource cost / construction need --
  {
    const rc = Buildings.upgradeResourceCost("hut", 2);
    ok("upgradeResourceCost(hut,2) == {wood:30, planks:10}", rc.wood === 30 && rc.planks === 10 && Object.keys(rc).length === 2);
    const need = Buildings.upgradeConstructionNeed({ typeId: "hut", pendingUpgrade: { toLevel: 2, delivered: { wood: 5 } } });
    ok("upgradeConstructionNeed subtracts delivered", need.wood === 25 && need.planks === 10);
    ok("upgradeConstructionNeed empty when no pending", Object.keys(Buildings.upgradeConstructionNeed({ typeId: "hut" })).length === 0);
  }

  // -- effect aggregation --
  {
    const he = Buildings.upgradeEffect({ typeId: "hut", upgradeLevel: 4 });
    // v0.51: L2+L3 add +1 slot each (capacityPlus 2); L4 = −30% basic (no slot).
    ok("hut L4 aggregate effect", he.capacityPlus === 2 && he.slotPlus === 0 && near(he.outputMult, 1) && near(he.basicConsumptionMult, 0.7));
    const he5 = Buildings.upgradeEffect({ typeId: "hut", upgradeLevel: 5 });
    ok("hut L5 adds −30% luxury", he5.capacityPlus === 2 && near(he5.basicConsumptionMult, 0.7) && near(he5.luxuryConsumptionMult, 0.7));
    const se = Buildings.upgradeEffect({ typeId: "sawmill", upgradeLevel: 3 });
    ok("sawmill L3 aggregate effect", se.slotPlus === 1 && near(se.outputMult, 1.25 * 1.5));
    const id = Buildings.upgradeEffect({ typeId: "hut", upgradeLevel: 1 });
    ok("level-1 effect is identity", id.capacityPlus === 0 && near(id.outputMult, 1) && near(id.basicConsumptionMult, 1));
  }

  // -- housingCapacity reflects capacityPlus (no state → no research bonus) --
  {
    const town = { buildings: [{ typeId: "hut", upgradeLevel: 3, pendingUpgrade: null }] };
    ok("housingCapacity includes capacityPlus", Buildings.housingCapacity(town).peasants === 2 + 2);
  }

  // -- basicConsumptionMult capacity-weighting --
  {
    const one = { buildings: [{ typeId: "hut", upgradeLevel: 4 }] };
    ok("basicConsumptionMult single L4 hut ≈ 0.7", near(Buildings.basicConsumptionMult(one).peasants, 0.7));
    const two = { buildings: [{ typeId: "hut", upgradeLevel: 4 }, { typeId: "hut", upgradeLevel: 1 }] };
    // v0.51: L4 cap = 2 + capacityPlus(2) = 4 @ 0.7 ; L1 cap = 2 @ 1.0 → (4*0.7 + 2*1.0)/6
    ok("basicConsumptionMult weighted across huts", near(Buildings.basicConsumptionMult(two).peasants, (4 * 0.7 + 2 * 1.0) / 6));
    ok("basicConsumptionMult defaults 1 with no houses", Buildings.basicConsumptionMult({ buildings: [] }).workers === 1);
  }
}
// === /RU-A =================================================================

// ============================================================================
// 15) RESEARCH CENTER (Slice B) — config sanity + placement + upgrade API.
// ============================================================================
{
  const RC = CONFIG.researchCenter;

  // -- config shape sanity --
  ok("CONFIG.researchCenter exists (name/glyph)", !!RC && typeof RC.name === "string" && typeof RC.glyph === "string");
  ok("researchCenter build.gold > 0", RC.build && RC.build.gold > 0);
  ok("researchCenter build.cost keys are real goods",
    Object.keys(RC.build.cost || {}).every(g => !!CONFIG.goods[g]));
  ok("researchCenter levels[1].speed === 2", RC.levels[1].speed === 2);
  ok("researchCenter speeds strictly increase across levels", (() => {
    let prev = -Infinity;
    for (let i = 1; i < RC.levels.length; i++) {
      if (!(RC.levels[i].speed > prev)) return false;
      prev = RC.levels[i].speed;
    }
    return true;
  })());
  ok("every researchCenter upgrade cost good is real", (() => {
    for (let i = 2; i < RC.levels.length; i++) {
      const cost = RC.levels[i].cost || {};
      for (const g in cost) if (!CONFIG.goods[g]) return false;
    }
    return true;
  })());

  // -- canPlaceResearchCenter: OK adjacent to the castle on buildable land --
  // makeState() has barren hexes at (1,0) and (2,0) beside the castle (0,0).
  {
    const st = makeState();
    ok("center OK on buildable land adjacent to castle", Buildings.canPlaceResearchCenter(st, 1, 0).ok === true);

    // on the castle hex → rejected
    ok("center on castle hex → not ok", Buildings.canPlaceResearchCenter(st, 0, 0).ok === false);

    // NOT adjacent to the castle → rejected (5,0 is far away)
    const far = Buildings.canPlaceResearchCenter(st, 5, 0);
    ok("center not adjacent to castle → not ok + reason", far.ok === false && /castle/i.test(far.reason));

    // water hex adjacent-ish → rejected (buildable land gate). (3,0) is water but not
    // castle-adjacent; use a fabricated water hex next to the castle.
    st.map.hexes.set(HexMath.key(-1, 0), { q: -1, r: 0, terrain: "water", revealed: true });
    const onWater = Buildings.canPlaceResearchCenter(st, -1, 0);
    ok("center on water → not ok", onWater.ok === false && !!onWater.reason);

    // road on the hex → rejected
    const st2 = makeState();
    st2.roads.add(HexMath.key(1, 0));
    ok("center on a road hex → not ok", Buildings.canPlaceResearchCenter(st2, 1, 0).ok === false);

    // occupied by a town building → rejected
    const st3 = makeState();
    st3.towns.push(makeTown({ q: 2, r: 0, buildings: [{ typeId: "hut", q: 1, r: 0, workers: 0 }] }));
    ok("center on an occupied hex → not ok", Buildings.canPlaceResearchCenter(st3, 1, 0).ok === false);

    // treasury too low → rejected
    const st4 = makeState();
    st4.treasury = RC.build.gold - 1;
    const poor = Buildings.canPlaceResearchCenter(st4, 1, 0);
    ok("treasury < build.gold → not ok + 'gold'", poor.ok === false && /gold/i.test(poor.reason));
  }

  // -- placeResearchCenter deducts gold + sets the under-construction shape --
  {
    const st = makeState();
    const t0 = st.treasury;
    const res = Buildings.placeResearchCenter(st, 1, 0);
    ok("placeResearchCenter returns ok", res.ok === true);
    ok("placeResearchCenter deducts build.gold from treasury", st.treasury === t0 - RC.build.gold);
    const c = st.researchCenter;
    ok("center shape: built:false, level:1, delivered:{}, pendingUpgrade:null",
      c && c.built === false && c.level === 1 && c.delivered && Object.keys(c.delivered).length === 0 && c.pendingUpgrade === null);
    ok("center records its hex", c.q === 1 && c.r === 0);
    ok("researchCenter(state) convenience returns it", Buildings.researchCenter(st) === c);

    // exactly one center: a second placement is rejected.
    const second = Buildings.canPlaceResearchCenter(st, 2, 0);
    ok("second center → not ok + 'already'", second.ok === false && /already/i.test(second.reason));
    ok("placeResearchCenter refuses a second center", Buildings.placeResearchCenter(st, 2, 0).ok === false);
  }

  // -- centerNextUpgrade / canUpgradeCenter / startCenterUpgrade --
  {
    // unbuilt center → no upgrade offered
    const stUnbuilt = makeState();
    stUnbuilt.researchCenter = { q: 1, r: 0, built: false, delivered: {}, level: 1, pendingUpgrade: null };
    ok("centerNextUpgrade null while unbuilt", Buildings.centerNextUpgrade(stUnbuilt) === null);

    // built L1 with funds → next upgrade is L2, upgrade allowed
    const st = makeState();
    st.treasury = 100000;
    st.researchCenter = { q: 1, r: 0, built: true, delivered: {}, level: 1, pendingUpgrade: null };
    const nxt = Buildings.centerNextUpgrade(st);
    ok("centerNextUpgrade of built L1 → level 2", nxt && nxt.level === 2);
    ok("canUpgradeCenter ok with funds", Buildings.canUpgradeCenter(st).ok === true);

    const g0 = st.treasury;
    const up = Buildings.startCenterUpgrade(st);
    ok("startCenterUpgrade returns ok", up.ok === true);
    ok("startCenterUpgrade deducts levels[2].cost.gold", st.treasury === g0 - RC.levels[2].cost.gold);
    const pu = st.researchCenter.pendingUpgrade;
    ok("pendingUpgrade set toLevel 2 with empty delivered", pu && pu.toLevel === 2 && pu.delivered && Object.keys(pu.delivered).length === 0);
    ok("pendingUpgrade snapshots cost (so Research.centerUpgradeNeed meters materials)",
      pu.cost && pu.cost.planks === RC.levels[2].cost.planks && pu.cost.stone === RC.levels[2].cost.stone);

    // while pending → no further upgrade + startCenterUpgrade refused
    ok("centerNextUpgrade null while pending", Buildings.centerNextUpgrade(st) === null);
    ok("canUpgradeCenter blocked while pending", Buildings.canUpgradeCenter(st).ok === false);
    ok("startCenterUpgrade refused while pending", Buildings.startCenterUpgrade(st).ok === false);

    // gold too low → blocked
    const stPoor = makeState();
    stPoor.treasury = 0;
    stPoor.researchCenter = { q: 1, r: 0, built: true, delivered: {}, level: 1, pendingUpgrade: null };
    const poorUp = Buildings.canUpgradeCenter(stPoor);
    ok("canUpgradeCenter blocked when gold too low", poorUp.ok === false && /gold/i.test(poorUp.reason));

    // at max level → no next upgrade
    const stMax = makeState();
    stMax.treasury = 100000;
    stMax.researchCenter = { q: 1, r: 0, built: true, delivered: {}, level: RC.levels.length - 1, pendingUpgrade: null };
    ok("centerNextUpgrade null at max level", Buildings.centerNextUpgrade(stMax) === null);
    ok("canUpgradeCenter blocked at max level", Buildings.canUpgradeCenter(stMax).ok === false);
  }
}
// === /RESEARCH CENTER (Slice B) =============================================

// === v0.51 §11 — connectivity cascade =======================================
{
  const hut = (q, r) => ({ typeId: "hut", q, r });
  // centre (0,0) with a chain A(0,1) - B(0,2) - C(0,3)
  const town = { q: 0, r: 0, buildings: [hut(0, 1), hut(0, 2), hut(0, 3)] };
  const orph = (keys) => Buildings.cascadeOrphans(town, keys).orphans.map(b => b.q + "," + b.r).sort();
  ok("§11: removing a mid-chain building orphans everything past it",
     JSON.stringify(orph([HexMath.key(0, 2)])) === JSON.stringify(["0,3"]));
  ok("§11: removing the building next to the centre orphans the whole branch",
     JSON.stringify(orph([HexMath.key(0, 1)])) === JSON.stringify(["0,2", "0,3"]));
  ok("§11: removing a leaf orphans nothing", Buildings.cascadeOrphans(town, [HexMath.key(0, 3)]).orphans.length === 0);
  ok("§11: removing the centre orphans every building", Buildings.cascadeOrphans(town, [HexMath.key(0, 0)]).orphans.length === 3);
  // a branch that stays connected via a sibling is NOT orphaned
  const town2 = { q: 0, r: 0, buildings: [hut(0, 1), hut(1, 0), hut(1, 1)] };  // two centre-adjacent + one bridging
  ok("§11: a building with another path to the centre survives",
     Buildings.cascadeOrphans(town2, [HexMath.key(0, 1)]).orphans.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
