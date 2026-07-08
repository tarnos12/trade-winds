// Headless test for Trade Winds — the pure Sim tick under the Town Interiors
// model (TI-B): Sim derives worker assignment each tick, produces from placed
// buildings, and grows population FROM HOUSING (base peasants + houses) as each
// tier's needs are met. Evals the code between the PURE_CORE markers in
// index.html (CONFIG + Sim + Buildings) — no browser needed.
//   node test/sim.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings;", sandbox);
const { CONFIG, Sim, Buildings } = sandbox;

const BASE_PEASANTS = CONFIG.town.baseWorkers.peasants; // housing-independent peasant cap

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

// --- Town builders (shared Town contract shape) -----------------------
// NB: buildings are placed with workers:0 — Sim ASSIGNS workers each tick.
function town(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: undefined,
  }, over || {});
}
function b(typeId, q, r) { return { typeId, q, r, workers: 0 }; }
function totalPop(t) { return t.pop.peasants + t.pop.workers + t.pop.burghers; }

// ---- sanity: Sim.tick exists and did not clobber priceFor ----
ok("Sim.tick is a function", typeof Sim.tick === "function");
ok("Sim.priceFor still present (not clobbered)", typeof Sim.priceFor === "function");
ok("Buildings.housingCapacity present (TI-A merged)", typeof Buildings.housingCapacity === "function");
ok("CONFIG.needs merged in", !!CONFIG.needs && !!CONFIG.needs.perCapita);
ok("CONFIG.town.baseWorkers.peasants set", BASE_PEASANTS > 0);
ok("baseTickMs preserved (non-destructive merge)", CONFIG.econ.baseTickMs === 500);
ok("goods/buildings still present", !!CONFIG.goods.grain && !!CONFIG.buildings.farm && !!CONFIG.buildings.cottage);

// ---- empty / degenerate State does not throw ----
ok("tick handles empty towns", (() => { Sim.tick({ towns: [] }); return true; })());
ok("tick handles Phase-1 marker town {q,r}", (() => {
  const s = { towns: [{ q: 1, r: 2 }] };
  Sim.tick(s);
  const t = s.towns[0];
  return t.stock && t.pop && typeof t.happiness === "number";
})());

// ========================================================================
// 1) A town with a farm + base peasants: Sim ASSIGNS workers and it produces
//    grain; pop grows toward the base-peasant cap (no houses yet).
// ========================================================================
{
  const t = town({ pop: { peasants: 5, workers: 0, burghers: 0 },
                   buildings: [b("farm", 0, 1)] });
  const grain = [];
  for (let i = 0; i < 6; i++) { Sim.tick({ towns: [t] }); grain.push(t.stock.grain || 0); }

  ok("Sim assigns workers to the farm (workerSlots cap)", t.buildings[0].workers === CONFIG.buildings.farm.workerSlots);
  ok("farm produces grain (stock > 0)", grain[0] > 0);
  ok("grain stock strictly grows each tick", grain.every((g, i) => i === 0 || g > grain[i - 1]));
  ok("well-fed town stays happy (~100)", t.happiness > 95);
  ok("well-fed town population grows toward base cap", totalPop(t) > 5 && t.pop.peasants <= BASE_PEASANTS + 1e-9);
  ok("no houses ⇒ workers/burghers stay 0", t.pop.workers === 0 && t.pop.burghers === 0);
  ok("grain surplus pushes price below base", (() => {
    for (let i = 0; i < 40; i++) Sim.tick({ towns: [t] });
    return t.prices.grain < CONFIG.goods.grain.basePrice;
  })());
}

// ========================================================================
// 2) Population is capped by HOUSING. No houses ⇒ peasants cap at baseWorkers,
//    workers/burghers stay 0 even with beer+clothes on the shelf.
// ========================================================================
{
  const t = town({ pop: { peasants: 6, workers: 0, burghers: 0 },
                   stock: { grain: 1000, beer: 1000, clothes: 1000 } });
  for (let i = 0; i < 60; i++) Sim.tick({ towns: [t] });
  ok("peasants grow but never exceed baseWorkers cap", t.pop.peasants > 6 && t.pop.peasants <= BASE_PEASANTS + 1e-9);
  ok("no worker/burgher housing ⇒ those tiers stay 0", t.pop.workers === 0 && t.pop.burghers === 0);
}

// ========================================================================
// 3) Housing generates population: a cottage (worker house) lets WORKERS
//    appear — but ONLY when food (+beer) is satisfied.
// ========================================================================
{
  // With beer in stock: workers appear.
  const fed = town({ pop: { peasants: BASE_PEASANTS, workers: 0, burghers: 0 },
                     stock: { grain: 1000, beer: 1000 },
                     buildings: [b("cottage", 0, 1)] });
  for (let i = 0; i < 40; i++) Sim.tick({ towns: [fed] });
  ok("cottage + food + beer ⇒ workers appear", fed.pop.workers > 0);
  ok("workers never exceed cottage housing capacity",
     fed.pop.workers <= CONFIG.buildings.cottage.houseCapacity + 1e-9);
  ok("cottage (a house) is never assigned workers", fed.buildings[0].workers === 0);

  // Same, but NO beer: workers must NOT appear (their need is unmet).
  const dry = town({ pop: { peasants: BASE_PEASANTS, workers: 0, burghers: 0 },
                     stock: { grain: 1000 },   // food only, no beer
                     buildings: [b("cottage", 0, 1)] });
  for (let i = 0; i < 40; i++) Sim.tick({ towns: [dry] });
  ok("cottage + food but NO beer ⇒ workers stay 0", dry.pop.workers === 0);
}

// ========================================================================
// 4) A foodless town STARVES: happiness collapses, then population declines
//    (only after a sustained low-satisfaction streak, not instantly).
// ========================================================================
{
  const t = town({ pop: { peasants: BASE_PEASANTS, workers: 0, burghers: 0 } }); // no food
  const startPop = totalPop(t);
  ok("starting pop is within housing capacity (no instant clamp)", startPop === BASE_PEASANTS);

  Sim.tick({ towns: [t] });
  ok("no food => happiness collapses after 1 tick", t.happiness < 50);
  ok("population survives the first starving tick", totalPop(t) === startPop);

  for (let i = 0; i < 8; i++) Sim.tick({ towns: [t] });
  ok("sustained starvation shrinks population", totalPop(t) < startPop);
  ok("population never goes negative", totalPop(t) >= 0);
  ok("food scarcity pushes grain price up toward ceiling", t.prices.grain > CONFIG.goods.grain.basePrice);
}

// ========================================================================
// 4b) Full "grow then starve" arc: grow from stocked pantry, then cut food.
// ========================================================================
{
  const t = town({ pop: { peasants: 4, workers: 0, burghers: 0 },
                   stock: { grain: 500 } });  // stocked pantry, no production
  for (let i = 0; i < 10; i++) Sim.tick({ towns: [t] });
  const grownPop = totalPop(t);
  ok("fed-from-stock town grows toward base cap", grownPop > 4 && t.pop.peasants <= BASE_PEASANTS + 1e-9);

  t.stock.grain = 0; // famine
  for (let i = 0; i < 12; i++) Sim.tick({ towns: [t] });
  ok("town starves once the pantry is empty", totalPop(t) < grownPop);
}

// ========================================================================
// 5) Sim.tick is deterministic: same state in => same state out.
// ========================================================================
{
  const baseTown = town({ pop: { peasants: 4, workers: 2, burghers: 1 },
                          stock: { grain: 12, flour: 4, beer: 3, clothes: 2 },
                          buildings: [b("farm", 0, 1), b("mill", 1, 0), b("cottage", 0, 2)] });
  const a = JSON.parse(JSON.stringify(baseTown));
  const bb = JSON.parse(JSON.stringify(baseTown));
  for (let i = 0; i < 5; i++) { Sim.tick({ towns: [a] }); Sim.tick({ towns: [bb] }); }
  ok("deterministic: identical states stay identical", JSON.stringify(a) === JSON.stringify(bb));

  const c = JSON.parse(JSON.stringify(baseTown));
  const d = JSON.parse(JSON.stringify(baseTown));
  Sim.tick({ towns: [c] });
  Sim.tick({ towns: [d] });
  ok("deterministic: single tick reproducible", JSON.stringify(c) === JSON.stringify(d));
}

// ========================================================================
// 6) Processor honours inputs: a mill turns grain into flour, consuming grain.
//    (Sim assigns workers from the town's worker pool on the tick.)
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 3, burghers: 0 },
                   stock: { grain: 100 },
                   buildings: [b("mill", 0, 1)] });
  const g0 = t.stock.grain;
  Sim.tick({ towns: [t] });
  ok("Sim assigns workers to the mill", t.buildings[0].workers === CONFIG.buildings.mill.workerSlots);
  ok("mill consumes grain input", t.stock.grain < g0);
  ok("mill produces flour output", (t.stock.flour || 0) > 0);
}

// ========================================================================
// 7) Missing inputs => processor idles (no negative stock, no phantom output).
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 3, burghers: 0 },
                   stock: {}, // no grain
                   buildings: [b("mill", 0, 1)] });
  Sim.tick({ towns: [t] });
  ok("idle processor makes no flour", !(t.stock.flour > 0));
  ok("no negative stock from missing inputs", Object.values(t.stock).every(v => v >= 0));
}

// ========================================================================
// 8) Labour pool (per tier) caps total workers across buildings.
// ========================================================================
{
  const t = town({ pop: { peasants: 2, workers: 0, burghers: 0 }, // only 2 peasant labourers
                   buildings: [b("farm", 0, 1), b("farm", 0, 2)] }); // two farms want 3 each
  Sim.tick({ towns: [t] });
  ok("greedy fill: first farm takes 2, second takes 0",
     t.buildings[0].workers === 2 && t.buildings[1].workers === 0);
  // 2 labourers × rate 2 × happiness 1.2x = 4.8 grain max; unbounded would be 9.6.
  ok("labour pool caps production across buildings", (t.stock.grain || 0) <= 4.8 + 1e-9);
  ok("labour-capped town still produced something", (t.stock.grain || 0) > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
