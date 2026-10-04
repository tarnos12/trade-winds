// === CC: save-migration test — a pre-CC save (retired/renamed goods + retired
// buildings) loads clean, is remapped, and produces no NaN. Drives the PURE_CORE
// pure helpers Sim.CC_migrateGoods (good/building renames) + Research.normalize
// (research-id migration). Evals the code between the PURE_CORE markers only.
//   node test/migration.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings; this.Research=Research;", sandbox);
const { CONFIG, Sim, Research } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } }

// Deep-scan for any NaN / non-finite number in a value.
function hasNaN(v, seen) {
  seen = seen || new Set();
  if (typeof v === "number") return !Number.isFinite(v);
  if (!v || typeof v !== "object" || seen.has(v)) return false;
  seen.add(v);
  for (const k in v) if (hasNaN(v[k], seen)) return true;
  return false;
}

// A representative pre-CC (v1/TV2-era) save fragment.
function makeOldSave() {
  return {
    tick: 0,
    treasury: 1000,
    towns: [{
      id: 1, q: 0, r: 0, level: 2, gold: 500,
      pop: { peasants: 4, workers: 2, burghers: 1 },
      // retired/renamed goods + a collision (cloth AND clothes both present → sum)
      stock: { beer: 10, tools: 6, jewelry: 3, furniture: 5, cloth: 4, clothes: 2, wood: 20 },
      prices: { beer: 14, tools: 22, jewelry: 54, furniture: 64, cloth: 20 },
      demand: { beer: 1, tools: 2 },
      buildings: [
        { typeId: "weaver", q: 1, r: 0, workers: 2, built: true, delivered: { cloth: 1 } },
        { typeId: "smelter", q: 2, r: 0, workers: 2, built: true, delivered: { tools: 1 } },
        { typeId: "hut", q: 0, r: 1, workers: 0, built: true, upgradeLevel: 1,
          pendingUpgrade: { toLevel: 2, delivered: { furniture: 1 } } },
      ],
    }],
    carts: [
      { fromId: 1, toId: 1, goodId: "tools", qty: 5, cargo: [{ goodId: "jewelry", qty: 2 }] },
    ],
    warehouse: { beer: 3, tools: 2 },
    castleStock: { furniture: 1 },
    castleReserved: { cloth: 1 },
    castleTrade: { jewelry: 1 },
    research: { unlocked: ["unlock_smelter", "unlock_weaver", "unlock_miner", "crop_rotation"], active: null, progress: 7, spent: 42, queue: [] },
  };
}

// ---- pre-conditions: the retired good/building ids are GONE from CONFIG. ----
ok("retired goods absent from CONFIG.goods", ["beer", "tools", "jewelry", "furniture", "cloth"].every(g => !CONFIG.goods[g]));
ok("rename targets present in CONFIG.goods", ["mead", "iron_tool", "gold_ring", "chairs", "clothes"].every(g => !!CONFIG.goods[g]));
ok("weaver absent, tailoring present", !CONFIG.buildings.weaver && !!CONFIG.buildings.tailoring);
ok("smelter absent from CONFIG.buildings (left inert on load)", !CONFIG.buildings.smelter);
ok("migration helper is pure/reachable in PURE_CORE", typeof Sim.CC_migrateGoods === "function");

// ---- run the migration ----
const st = makeOldSave();
Sim.CC_migrateGoods(st);
st.research = Research.normalize(st.research);

const t = st.towns[0];

// ---- goods remapped in every good-keyed map, collisions summed ----
ok("stock: old good keys removed", ["beer", "tools", "jewelry", "furniture", "cloth"].every(g => !(g in t.stock)));
ok("stock: beer→mead", t.stock.mead === 10);
ok("stock: tools→iron_tool", t.stock.iron_tool === 6);
ok("stock: jewelry→gold_ring", t.stock.gold_ring === 3);
ok("stock: furniture→chairs", t.stock.chairs === 5);
ok("stock: cloth→clothes SUMS into existing clothes (4+2=6)", t.stock.clothes === 6);
ok("stock: unrelated good untouched", t.stock.wood === 20);
ok("prices remapped", t.prices.mead === 14 && t.prices.iron_tool === 22 && !("beer" in t.prices) && !("cloth" in t.prices));
ok("demand remapped", t.demand.mead === 1 && t.demand.iron_tool === 2);

// ---- buildings: weaver→tailoring; smelter left inert; delivered maps remapped ----
ok("weaver building remapped to tailoring", t.buildings[0].typeId === "tailoring");
ok("weaver.delivered remapped (cloth→clothes)", t.buildings[0].delivered.clothes === 1 && !("cloth" in t.buildings[0].delivered));
ok("smelter building left as-is (inert; typeId unchanged, absent from CONFIG)",
   t.buildings[1].typeId === "smelter" && !CONFIG.buildings.smelter);
ok("smelter.delivered remapped (tools→iron_tool)", t.buildings[1].delivered.iron_tool === 1);
ok("pendingUpgrade.delivered remapped (furniture→chairs)", t.buildings[2].pendingUpgrade.delivered.chairs === 1);

// ---- carts: goodId + cargo remapped ----
ok("cart goodId remapped (tools→iron_tool)", st.carts[0].goodId === "iron_tool");
ok("cart cargo remapped (jewelry→gold_ring)", st.carts[0].cargo[0].goodId === "gold_ring");

// ---- castle/warehouse maps remapped ----
ok("warehouse remapped", st.warehouse.mead === 3 && st.warehouse.iron_tool === 2);
ok("castleStock remapped", st.castleStock.chairs === 1);
ok("castleReserved remapped", st.castleReserved.clothes === 1);
ok("castleTrade remapped", st.castleTrade.gold_ring === 1);

// ---- research ids migrated forward, retired ids dropped ----
ok("research: unlock_smelter→unlock_forge", st.research.unlocked.indexOf("unlock_forge") >= 0);
ok("research: unlock_weaver→unlock_tailoring", st.research.unlocked.indexOf("unlock_tailoring") >= 0);
ok("research: unlock_miner→unlock_iron_mine", st.research.unlocked.indexOf("unlock_iron_mine") >= 0);
ok("research: legacy kingdom node survives", st.research.unlocked.indexOf("crop_rotation") >= 0);
ok("research: retired ids gone", st.research.unlocked.indexOf("unlock_smelter") < 0 && st.research.unlocked.indexOf("unlock_weaver") < 0);

// ---- Slice A: normalize migrates the gold-clock bag → per-second metering bag ----
ok("research: normalized bag has the per-second metering fields", st.research.completedSec === 0 && st.research.subTick === 0 && st.research.consumed && typeof st.research.consumed === "object");
ok("research: retired progress/spent fields dropped by normalize", !("spent" in st.research) && !("progress" in st.research));

// ---- no NaN anywhere after migration ----
ok("no NaN / non-finite number anywhere in the migrated save", !hasNaN(st));

// ---- Sim.tick runs one step on the migrated save without throwing / NaN ----
ok("Sim.tick runs on the migrated save without throwing", (() => {
  try { Sim.tick(st); return true; } catch (e) { console.error("    " + e); return false; }
})());
ok("no NaN after a Sim tick on the migrated save", !hasNaN(st.towns[0].stock) && !hasNaN(st.towns[0].pop) && Number.isFinite(st.towns[0].happiness));

// ---- MUTATION-SANITY 2: migration is IDEMPOTENT (running it twice == once). ----
{
  const once = makeOldSave(); Sim.CC_migrateGoods(once);
  const twice = makeOldSave(); Sim.CC_migrateGoods(twice); Sim.CC_migrateGoods(twice);
  ok("CC/mutation: migration is idempotent (twice === once)", JSON.stringify(once) === JSON.stringify(twice));
  // and a second pass leaves NO legacy key behind.
  const t2 = twice.towns[0];
  ok("CC/mutation: no legacy good key remains after a double migration",
     ["beer", "tools", "jewelry", "furniture", "cloth"].every(g => !(g in t2.stock) && !(g in t2.prices)));
}

// ---- P4 REGRESSION: a corrupt array ELEMENT (null building) must not freeze the
// game. saveShapeOk only checks array TYPES, not entries, so a `null` inside a
// town's buildings[] loads. Sim.tick's production loop now guards `!b` (matching
// its assignWorkers/target-loop siblings) so the null is skipped instead of
// deref'ing null.typeId → throw → escaped rAF → permanent freeze (same class as
// the P2 roads/fog freeze). (loadGame's boundary filter, which physically DROPS
// the null, lives in the DOM shell outside PURE_CORE and isn't reachable here;
// this covers the pure-core throw site — the actual crash point.)
{
  const town = {
    id: 1, q: 0, r: 0, level: 2, gold: 100,
    pop: { peasants: 4, workers: 2, burghers: 1 },
    stock: { wood: 20 },
    buildings: [
      { typeId: "lumberjack", q: 1, r: 0, workers: 1, built: true },
      null,   // corrupt element — slips past saveShapeOk's type-only check
    ],
  };
  const st = { tick: 0, treasury: 100, towns: [town], carts: [] };
  ok("P4: Sim.tick does NOT throw on a null building entry", (() => {
    try { Sim.tick(st); return true; } catch (e) { console.error("    " + e); return false; }
  })());
  ok("P4: no NaN after ticking a save with a null building entry", !hasNaN(st.towns[0].stock) && !hasNaN(st.towns[0].pop));
}

// ---- a clean (already-CC) save is a no-op ----
{
  const clean = { towns: [{ id: 1, stock: { mead: 5, iron_tool: 3, clothes: 2 }, buildings: [] }], carts: [] };
  const before = JSON.stringify(clean);
  Sim.CC_migrateGoods(clean);
  ok("CC: migrating an already-migrated save is a no-op", JSON.stringify(clean) === before);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
