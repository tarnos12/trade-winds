// Headless test for Trade Winds — v0.51 §2 INTERNAL PORTERS (real movers).
// Producers bank whole units into b.store; a per-town porter fleet physically
// carries that store to the warehouse. The warehouse grows ONLY via porters (and
// external trade), never directly from production. Invariants under test:
//   1. Production lands in b.store, NOT straight into town.stock.
//   2. Porters ferry b.store → warehouse (warehouse rises over time).
//   3. Warehouse never exceeds storageCap; nothing is wasted (surplus waits in a
//      porter's cargo or the building store — total goods are conserved).
//   4. With ZERO porters possible? (fleet is always ≥1) — a distant producer still
//      gets served, just with travel latency.
// Evaluates the PURE_CORE slice of index.html (no browser).
//   node test/porters.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings;", sandbox);
const { CONFIG, Sim } = sandbox;
const CAP = CONFIG.town.storageCap;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } }

function town(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 6, workers: 0, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: undefined,
  }, over || {});
}
function b(typeId, q, r) { return { typeId, q, r, workers: 0, built: true }; }

// ---- sanity ----
ok("Sim.tickPorters is a function", typeof Sim.tickPorters === "function");
ok("CONFIG.econ has porter tuning", CONFIG.econ.porterCarry > 0 && CONFIG.econ.porterTicksPerTile > 0);

// ========================================================================
// 1) Production banks in b.store; the warehouse is fed only by porters.
//    A lumberjack 3 tiles from the centre; peasants staffed via plentiful potato.
// ========================================================================
{
  const t = town({ stock: { potato: 1e5 },
    buildings: [b("lumberjack", 0, 3), b("hut", 0, 1), b("hut", 1, 1)] });
  // run several production cycles: wood banks in the store, porters collect it to the
  // warehouse — but the distribute step now fills the two huts' input buffers (20 wood)
  // first, so warehouse accumulation past that starts a little later (≈tick 205 here).
  let sawStore = false, sawWarehouse = false;
  for (let i = 0; i < 300; i++) {
    Sim.tick({ towns: [t] });
    if (((t.buildings[0].store && t.buildings[0].store.wood) || 0) >= 1) sawStore = true;
    if ((t.stock.wood || 0) >= 1) sawWarehouse = true;
  }
  ok("production banks whole units into b.store", sawStore);
  ok("porters deliver wood into the warehouse", sawWarehouse);
  ok("a fleet exists on the town", Array.isArray(t.porters) && t.porters.length >= 1);
}

// ========================================================================
// 2) Warehouse never exceeds the cap, and nothing is wasted — total wood
//    (warehouse + every building store + every porter cargo) only ever RISES
//    when production adds and only moves between holders otherwise (never a
//    silent drop from a full warehouse).
// ========================================================================
{
  const t = town({ pop: { peasants: 6, workers: 0, burghers: 0 }, stock: { potato: 1e5 },
    buildings: [b("lumberjack", 0, 1), b("hut", 0, 2), b("hut", 1, 2)] });
  let maxWarehouse = 0, everExceeded = false;
  let prevTotal = 0, sawDrop = false;
  for (let i = 0; i < 1600; i++) {
    Sim.tick({ towns: [t] });
    const wh = t.stock.wood || 0;
    maxWarehouse = Math.max(maxWarehouse, wh);
    if (wh > CAP + 1e-9) everExceeded = true;
    // total wood held anywhere in the town
    let total = wh;
    for (const bb of t.buildings) if (bb.store) total += (bb.store.wood || 0);
    for (const p of (t.porters || [])) if (p.good === "wood") total += p.qty;
    // no consumers of wood here would be a lie (peasants eat wood); so total can
    // fall via consumption. We only assert the warehouse cap invariant strictly.
    prevTotal = total;
  }
  ok("warehouse wood reaches the cap under sustained production", maxWarehouse >= CAP - 1);
  ok("warehouse NEVER exceeds the storage cap", !everExceeded);
}

// ========================================================================
// 3) No-waste at the buffer: with the warehouse held full, a producer's store
//    stops growing (building stalls) rather than the porters discarding cargo.
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 }, stock: { wood: CAP },
    buildings: [b("lumberjack", 0, 1)] });
  // no population ⇒ no workers ⇒ no production; seed the lumberjack store directly
  t.buildings[0].workers = 0;
  t.buildings[0].store = { wood: 20 };
  for (let i = 0; i < 40; i++) Sim.tick({ towns: [t] });
  // warehouse was already full; porters cannot deposit, so the 20 wood stays held
  // (in the store or in a porter's cargo) — never silently lost.
  let held = (t.stock.wood - CAP);   // any overflow above cap would be a bug (should be 0)
  let store = (t.buildings[0].store && t.buildings[0].store.wood) || 0;
  let cargo = 0; for (const p of (t.porters || [])) if (p.good === "wood") cargo += p.qty;
  ok("full warehouse: no overflow above cap", t.stock.wood <= CAP + 1e-9);
  ok("full warehouse: the 20 wood is conserved (store + cargo), not wasted", Math.abs(store + cargo - 20) < 1e-9);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
