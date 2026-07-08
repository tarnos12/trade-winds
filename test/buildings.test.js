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
  return { map: { hexes }, roads: new Set(), towns: [] };
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
// 1) slotCap by town level = 3 / 5 / 7 / 9 (index 0 unused; fallback 3).
// ============================================================================
ok("slotCap(1) === 3", Buildings.slotCap(1) === 3);
ok("slotCap(2) === 5", Buildings.slotCap(2) === 5);
ok("slotCap(3) === 7", Buildings.slotCap(3) === 7);
ok("slotCap(4) === 9", Buildings.slotCap(4) === 9);
ok("slotCap(unknown) falls back to 3", Buildings.slotCap(99) === 3);

// ============================================================================
// 2) CONFIG.town + catalog sanity (shared data contract).
// ============================================================================
ok("CONFIG.town.slotCap = [0,3,5,7,9]", JSON.stringify(CONFIG.town.slotCap) === JSON.stringify([0, 3, 5, 7, 9]));
ok("CONFIG.town.castle = {q:0,r:0}", CONFIG.town.castle && CONFIG.town.castle.q === 0 && CONFIG.town.castle.r === 0);
ok("CONFIG.town.baseWorkers.peasants set", CONFIG.town.baseWorkers.peasants > 0);
ok("CONFIG.town.startStock has food buffer", CONFIG.town.startStock.grain > 0 && CONFIG.town.startStock.fish > 0 && CONFIG.town.startStock.bread > 0);
const kinds = Object.values(CONFIG.buildings).map(b => b.kind);
ok("catalog has extractors/processors/houses", kinds.includes("extractor") && kinds.includes("processor") && kinds.includes("house"));
ok("extractors are peasant-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "extractor").every(b => b.workerTier === "peasant"));
ok("processors are worker-staffed", Object.values(CONFIG.buildings).filter(b => b.kind === "processor").every(b => b.workerTier === "worker"));
ok("houses declare houseTier + houseCapacity, no output/workers",
  Object.values(CONFIG.buildings).filter(b => b.kind === "house").every(b => b.houseTier && b.houseCapacity > 0 && !b.output && !b.workerSlots));
ok("expected extractor ids present", ["lumberjack", "farm", "miner", "quarry", "fishery", "shepherd"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "extractor"));
ok("expected processor ids present", ["sawmill", "mill", "bakery", "brewery", "smelter", "weaver"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "processor"));
ok("expected house ids present", ["hut", "cottage", "manor"].every(id => CONFIG.buildings[id] && CONFIG.buildings[id].kind === "house"));

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
  const town = makeTown({ level: 1, buildings: [
    { typeId: "hut", q: 6, r: 0, workers: 0 },
    { typeId: "hut", q: 5, r: 1, workers: 0 },
    { typeId: "hut", q: 5, r: -1, workers: 0 },
  ] });
  st.towns.push(town);
  ok("usedSlots counts all placed buildings", Buildings.usedSlots(town) === 3);
  // (4,1) borders the center → contiguous, but the level-1 cap (3) is full.
  const capped = Buildings.canPlaceBuilding(st, "cottage", 4, 1);
  ok("over slot cap → not ok + 'slot'", capped.ok === false && /slot/i.test(capped.reason));
}

// ============================================================================
// 9) affordability is charged to the OWNER town.
// ============================================================================
{
  const st = makeState();
  const brokeGold = makeTown({ gold: 0 });
  st.towns.push(brokeGold);
  const noGold = Buildings.canPlaceBuilding(st, "lumberjack", 6, 0);
  ok("owner has no gold → not ok + 'gold'", noGold.ok === false && /gold/i.test(noGold.reason));

  const st2 = makeState();
  const noStone = makeTown({ gold: 1000, stock: { wood: 100 } }); // lumberjack needs stone
  st2.towns.push(noStone);
  const short = Buildings.canPlaceBuilding(st2, "lumberjack", 6, 0);
  ok("owner missing resource → not ok + 'stone'", short.ok === false && /stone/i.test(short.reason));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
