// Headless test for Trade Winds T4 — the pure Sim production/consumption tick.
// Evals the code between the PURE_CORE markers in index.html (CONFIG + Sim,
// including the SIM-CORE block) — no browser needed.
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
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim;", sandbox);
const { CONFIG, Sim } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

// --- Town builders (shared Town contract shape) -----------------------
function town(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: undefined,
  }, over || {});
}
function totalPop(t) { return t.pop.peasants + t.pop.workers + t.pop.burghers; }

// ---- sanity: Sim.tick exists and did not clobber priceFor ----
ok("Sim.tick is a function", typeof Sim.tick === "function");
ok("Sim.priceFor still present (not clobbered)", typeof Sim.priceFor === "function");
ok("CONFIG.needs merged in", !!CONFIG.needs && !!CONFIG.needs.perCapita);
ok("baseTickMs preserved (non-destructive merge)", CONFIG.econ.baseTickMs === 500);
ok("goods/buildings still present (T5 consumed)", !!CONFIG.goods.grain && !!CONFIG.buildings.farm);

// ---- empty / degenerate State does not throw ----
ok("tick handles empty towns", (() => { Sim.tick({ towns: [] }); return true; })());
ok("tick handles Phase-1 marker town {q,r}", (() => {
  const s = { towns: [{ q: 1, r: 2 }] };
  Sim.tick(s);
  const t = s.towns[0];
  return t.stock && t.pop && typeof t.happiness === "number";
})());

// ========================================================================
// 1) A town with a farm + workers GROWS its grain stock over ticks.
// ========================================================================
{
  const t = town({ pop: { peasants: 5, workers: 0, burghers: 0 },
                    buildings: [{ typeId: "farm", q: 0, r: 1, workers: 3 }] });
  const grain = [];
  for (let i = 0; i < 6; i++) { Sim.tick({ towns: [t] }); grain.push(t.stock.grain || 0); }

  ok("farm produces grain (stock > 0)", grain[0] > 0);
  ok("grain stock strictly grows each tick", grain.every((g, i) => i === 0 || g > grain[i - 1]));
  ok("well-fed town stays happy (~100)", t.happiness > 95);
  ok("well-fed town population grows toward cap", totalPop(t) > 5);
  ok("grain surplus pushes price below base", (() => {
    for (let i = 0; i < 40; i++) Sim.tick({ towns: [t] });
    return t.prices.grain < CONFIG.goods.grain.basePrice;
  })());
}

// ========================================================================
// 2) A foodless town STARVES: satisfaction falls, then population declines.
// ========================================================================
{
  const t = town({ pop: { peasants: 10, workers: 0, burghers: 0 } }); // no buildings, no food
  const startPop = totalPop(t);

  Sim.tick({ towns: [t] });
  ok("no food => happiness collapses after 1 tick", t.happiness < 50);

  // population must not drop instantly (needs a sustained low streak)
  ok("population survives the first starving tick", totalPop(t) === startPop);

  for (let i = 0; i < 8; i++) Sim.tick({ towns: [t] });
  ok("sustained starvation shrinks population", totalPop(t) < startPop);
  ok("population never goes negative", totalPop(t) >= 0);
  ok("food scarcity pushes grain price up toward ceiling", t.prices.grain > CONFIG.goods.grain.basePrice);
}

// ========================================================================
// 2b) Full "grow and starve" arc on one town: grow while fed, then cut food.
// ========================================================================
{
  const t = town({ pop: { peasants: 6, workers: 0, burghers: 0 },
                   stock: { grain: 500 } }); // stocked pantry, no production
  for (let i = 0; i < 10; i++) Sim.tick({ towns: [t] });
  const grownPop = totalPop(t);
  ok("fed-from-stock town grows", grownPop > 6);

  t.stock.grain = 0; // famine
  for (let i = 0; i < 10; i++) Sim.tick({ towns: [t] });
  ok("town starves once the pantry is empty", totalPop(t) < grownPop);
}

// ========================================================================
// 3) Sim.tick is deterministic: same state in => same state out.
// ========================================================================
{
  const base = town({ pop: { peasants: 4, workers: 2, burghers: 1 },
                      stock: { grain: 12, flour: 4, beer: 3, clothes: 2 },
                      buildings: [
                        { typeId: "farm", q: 0, r: 1, workers: 3 },
                        { typeId: "mill", q: 1, r: 0, workers: 2 },
                      ] });
  const a = JSON.parse(JSON.stringify(base));
  const b = JSON.parse(JSON.stringify(base));
  for (let i = 0; i < 5; i++) { Sim.tick({ towns: [a] }); Sim.tick({ towns: [b] }); }
  ok("deterministic: identical states stay identical", JSON.stringify(a) === JSON.stringify(b));

  // and a single tick is a pure function of its input (no hidden global drift)
  const c = JSON.parse(JSON.stringify(base));
  const d = JSON.parse(JSON.stringify(base));
  Sim.tick({ towns: [c] });
  Sim.tick({ towns: [d] });
  ok("deterministic: single tick reproducible", JSON.stringify(c) === JSON.stringify(d));
}

// ========================================================================
// 4) Processor honours inputs: mill turns grain into flour, consuming grain.
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 3, burghers: 0 },
                   stock: { grain: 100 },
                   buildings: [{ typeId: "mill", q: 0, r: 1, workers: 2 }] });
  const g0 = t.stock.grain;
  Sim.tick({ towns: [t] });
  ok("mill consumes grain input", t.stock.grain < g0);
  ok("mill produces flour output", (t.stock.flour || 0) > 0);
}

// ========================================================================
// 5) Missing inputs => processor idles (no negative stock, no phantom output).
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 3, burghers: 0 },
                   stock: {}, // no grain
                   buildings: [{ typeId: "mill", q: 0, r: 1, workers: 2 }] });
  Sim.tick({ towns: [t] });
  ok("idle processor makes no flour", !(t.stock.flour > 0));
  ok("no negative stock from missing inputs", Object.values(t.stock).every(v => v >= 0));
}

// ========================================================================
// 6) Labour pool caps total workers across buildings.
// ========================================================================
{
  const t = town({ pop: { peasants: 2, workers: 0, burghers: 0 }, // only 2 labourers
                   buildings: [
                     { typeId: "farm", q: 0, r: 1, workers: 3 },  // wants 3
                     { typeId: "farm", q: 0, r: 2, workers: 3 },  // wants 3 more
                   ] });
  Sim.tick({ towns: [t] });
  // 2 labourers at rate 2 with happiness 1.2x, minus ~0.2 grain eaten (foodReq 0.2)
  // => at most 2*2*1.2 = 4.8 grain produced total; a labour-unbounded sim would make 9.6.
  ok("labour pool caps production across buildings", (t.stock.grain || 0) <= 4.8 + 1e-9);
  ok("labour-capped town still produced something", (t.stock.grain || 0) > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
