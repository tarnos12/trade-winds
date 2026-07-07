// Headless test for Trade Winds TI-A — the pure Buildings module (placement
// rules + housing model) and the redesigned CONFIG.buildings / CONFIG.town.
// Evals the code between the PURE_CORE markers in index.html — no browser.
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

// --- Synthetic map: a controlled patch of terrain around center (0,0) --------
// We hand-build hexes so terrain/radius are deterministic (not seed-dependent).
function hx(q, r, terrain) { return [HexMath.key(q, r), { q, r, terrain, revealed: true }]; }
function makeState() {
  const hexes = new Map([
    hx(0, 0, "meadow"),     // town center (buildable land)
    hx(1, 0, "forest"),     // dist 1 — valid lumberjack hex
    hx(0, 1, "fertile"),    // dist 1 — valid farm hex
    hx(1, -1, "hills"),     // dist 1 — valid miner hex
    hx(-1, 0, "water"),     // dist 1 — not buildable
    hx(-1, 1, "meadow"),    // dist 1 — land bordering water (-1,0) → fishery
    hx(2, 0, "meadow"),     // dist 2 — buildable land, in radius
    hx(2, -1, "meadow"),    // dist 2 — spare land
    hx(0, 2, "meadow"),     // dist 2 — spare land
    hx(3, 0, "forest"),     // dist 3 — OUT of radius (forest)
  ]);
  return {
    map: { hexes },
    roads: new Set(),
    towns: [],
  };
}
function makeTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 1000,
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
ok("CONFIG.town.radius = 2", CONFIG.town.radius === 2);
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
// 3) canPlace — valid case: lumberjack on an in-radius forest hex, affordable.
// ============================================================================
{
  const st = makeState();
  const town = makeTown();
  st.towns.push(town);
  const res = Buildings.canPlace(st, town, "lumberjack", 1, 0);
  ok("lumberjack on valid forest hex → ok", res.ok === true);

  // fishery: land hex (-1,1) bordering water (-1,0)
  ok("fishery on land bordering water → ok", Buildings.canPlace(st, town, "fishery", -1, 1).ok === true);
  // processor on any buildable land in radius
  ok("sawmill on buildable land → ok", Buildings.canPlace(st, town, "sawmill", 2, 0).ok === true);
  // house on any buildable land in radius
  ok("hut on buildable land → ok", Buildings.canPlace(st, town, "hut", 0, 2).ok === true);
}

// ============================================================================
// 4) canPlace — each violation returns { ok:false, reason }.
// ============================================================================
{
  const st = makeState();
  const town = makeTown();
  st.towns.push(town);

  // (b) wrong terrain — lumberjack wants forest, (0,1) is fertile
  const wrong = Buildings.canPlace(st, town, "lumberjack", 0, 1);
  ok("wrong terrain → not ok + reason", wrong.ok === false && typeof wrong.reason === "string");

  // (b) fishery not bordering water — (2,0) meadow has no water neighbor here
  const noWater = Buildings.canPlace(st, town, "fishery", 2, 0);
  ok("fishery away from water → not ok + reason", noWater.ok === false && !!noWater.reason);

  // (b) processor/house on non-buildable terrain — (-1,0) is water
  const onWater = Buildings.canPlace(st, town, "sawmill", -1, 0);
  ok("processor on water → not ok + reason", onWater.ok === false && !!onWater.reason);

  // (a) out of radius — (3,0) is forest but dist 3 > radius 2
  const far = Buildings.canPlace(st, town, "lumberjack", 3, 0);
  ok("out of radius → not ok + reason", far.ok === false && /radius/i.test(far.reason));

  // (a) no hex on the map
  const nohex = Buildings.canPlace(st, town, "lumberjack", 9, 9);
  ok("no hex → not ok + reason", nohex.ok === false && !!nohex.reason);

  // (c) occupied by an existing building of this town
  town.buildings.push({ typeId: "lumberjack", q: 1, r: 0, workers: 0 });
  const occ = Buildings.canPlace(st, town, "farm", 1, 0);
  ok("occupied hex → not ok + reason", occ.ok === false && !!occ.reason);

  // (c) road on the hex
  st.roads.add(HexMath.key(0, 1));
  const onRoad = Buildings.canPlace(st, town, "farm", 0, 1);
  ok("road hex → not ok + reason", onRoad.ok === false && !!onRoad.reason);

  // (c) town center hex
  const onCenter = Buildings.canPlace(st, town, "hut", 0, 0);
  ok("town center hex → not ok + reason", onCenter.ok === false && !!onCenter.reason);
}

// (c) another town's center
{
  const st = makeState();
  const town = makeTown();
  const other = makeTown({ id: 2, q: 2, r: 0 });
  st.towns.push(town, other);
  const onOther = Buildings.canPlace(st, town, "hut", 2, 0);
  ok("another town's center → not ok + reason", onOther.ok === false && !!onOther.reason);
}

// (d) over slot cap — level 1 cap = 3, fill 3 slots then attempt a 4th
{
  const st = makeState();
  const town = makeTown({ level: 1, buildings: [
    { typeId: "hut", q: 0, r: 1, workers: 0 },
    { typeId: "hut", q: 2, r: 0, workers: 0 },
    { typeId: "hut", q: 0, r: 2, workers: 0 },
  ] });
  st.towns.push(town);
  ok("usedSlots counts all placed buildings", Buildings.usedSlots(town) === 3);
  const capped = Buildings.canPlace(st, town, "lumberjack", 1, 0);
  ok("over slot cap → not ok + reason", capped.ok === false && /slot/i.test(capped.reason));
}

// (e) unaffordable — no gold / no resources
{
  const st = makeState();
  const brokeGold = makeTown({ gold: 0 });
  st.towns.push(brokeGold);
  const noGold = Buildings.canPlace(st, brokeGold, "lumberjack", 1, 0);
  ok("no gold → not ok + reason", noGold.ok === false && /gold/i.test(noGold.reason));

  const st2 = makeState();
  const noStone = makeTown({ gold: 1000, stock: { wood: 100 } }); // lumberjack needs stone
  st2.towns.push(noStone);
  const short = Buildings.canPlace(st2, noStone, "lumberjack", 1, 0);
  ok("missing resource → not ok + reason", short.ok === false && /stone/i.test(short.reason));
}

// ============================================================================
// 5) housingCapacity sums placed houses by tier (producers ignored).
// ============================================================================
{
  const town = makeTown({ buildings: [
    { typeId: "hut", q: 0, r: 1, workers: 0 },      // peasant +10
    { typeId: "hut", q: 2, r: 0, workers: 0 },      // peasant +10
    { typeId: "cottage", q: 0, r: 2, workers: 0 },  // worker +8
    { typeId: "manor", q: 2, r: -1, workers: 0 },   // burgher +5
    { typeId: "lumberjack", q: 1, r: 0, workers: 0 }, // producer — ignored
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
