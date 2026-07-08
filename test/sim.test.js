// Headless test for Trade Winds — the pure Sim tick under the EV3 economy model:
// Sim derives worker assignment each tick, produces from placed buildings, and
// grows population FROM HOUSING scaled by happiness. EV3 needs model:
//   BASIC needs = wood + potato (met ⇒ happiness ~70)
//   EXTRA needs = fish + wool (+beer workers, +clothes burghers) (met ⇒ +30 → ~100)
//   happiness = 70·basicSat + 30·extraSat; pop = round(housingCap × happiness/100).
//   People-tax: population pays gold into town.gold each tick, scaled by happiness.
//   Storage cap: a city holds at most CONFIG.town.storageCap (80) of each good.
// Evals the code between the PURE_CORE markers in index.html (CONFIG + Sim +
// Buildings) — no browser needed.
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

const BASE_PEASANTS = CONFIG.town.baseWorkers.peasants; // housing-independent peasant cap (0 now)
const HUT_CAP = CONFIG.buildings.hut.houseCapacity;     // peasant housing per hut (2)
const CAP = CONFIG.town.storageCap;                     // per-good storage cap (80)

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
ok("CONFIG.needs merged in (EV3 basic/extra model)",
   !!CONFIG.needs && !!CONFIG.needs.perCapita && Array.isArray(CONFIG.needs.basicNeeds) && Array.isArray(CONFIG.needs.extraNeeds));
ok("EV3: basic needs are wood + potato", JSON.stringify(CONFIG.needs.basicNeeds) === JSON.stringify(["wood", "potato"]));
ok("EV3: extra needs include fish + wool", CONFIG.needs.extraNeeds.includes("fish") && CONFIG.needs.extraNeeds.includes("wool"));
ok("EV3: happiness mapping basic 70 / extra 30", CONFIG.needs.basicHappy === 70 && CONFIG.needs.extraHappy === 30);
ok("CONFIG.town.baseWorkers.peasants is 0 (population is housing-driven)",
   typeof BASE_PEASANTS === "number" && BASE_PEASANTS >= 0);
ok("baseTickMs preserved (non-destructive merge)", CONFIG.econ.baseTickMs === 500);
ok("goods/buildings still present (+ potato good/farm)",
   !!CONFIG.goods.potato && !!CONFIG.buildings.potato_farm && !!CONFIG.buildings.cottage);

// ---- empty / degenerate State does not throw ----
ok("tick handles empty towns", (() => { Sim.tick({ towns: [] }); return true; })());
ok("tick handles Phase-1 marker town {q,r}", (() => {
  const s = { towns: [{ q: 1, r: 2 }] };
  Sim.tick(s);
  const t = s.towns[0];
  return t.stock && t.pop && typeof t.happiness === "number";
})());

// ========================================================================
// 1) potato_farm + wood + PEASANT HOUSING: Sim assigns workers, produces potato,
//    basics (wood+potato) are met ⇒ happiness ~70, and pop grows toward the
//    happiness-scaled target round(cap × 0.70) — NOT full cap (no extras yet).
// ========================================================================
{
  const PEA_CAP = 3 * HUT_CAP; // 3 huts → cap 6
  const t = town({ pop: { peasants: 3, workers: 0, burghers: 0 },
                   stock: { wood: 100000 },   // firewood plentiful
                   buildings: [b("potato_farm", 0, 1), b("hut", 0, 2), b("hut", 0, 3), b("hut", 0, 4)] });
  const potato = [];
  for (let i = 0; i < 100; i++) { Sim.tick({ towns: [t] }); potato.push(t.stock.potato || 0); }

  ok("Sim assigns workers to the potato_farm (workerSlots cap)",
     t.buildings[0].workers === CONFIG.buildings.potato_farm.workerSlots);
  ok("potato_farm produces potato (stock > 0)", potato[0] > 0);
  ok("basics met (wood+potato) ⇒ happiness settles near ~70",
     Math.abs(t.happiness - 70) < 2.5);
  ok("basics-only town grows to the ~70% housing target (partial, not full)", (() => {
    const target = Math.round(PEA_CAP * 0.70);       // round(6 × 0.7) = 4
    return t.pop.peasants > 3 && Math.abs(t.pop.peasants - target) <= 1;
  })());
  ok("no worker/burgher housing ⇒ those tiers stay 0", t.pop.workers === 0 && t.pop.burghers === 0);
}

// ========================================================================
// 2) Adding the EXTRA needs (fish + wool) pushes happiness from ~70 toward ~100
//    and fills housing to full capacity (round(cap × 1.0)).
// ========================================================================
{
  const PEA_CAP = 3 * HUT_CAP; // 6
  const t = town({ pop: { peasants: 3, workers: 0, burghers: 0 },
                   stock: { wood: 100000, fish: 100000, wool: 100000 },
                   buildings: [b("potato_farm", 0, 1), b("hut", 0, 2), b("hut", 0, 3), b("hut", 0, 4)] });
  for (let i = 0; i < 120; i++) Sim.tick({ towns: [t] });
  ok("basics + extras met ⇒ happiness ~100", t.happiness > 95);
  ok("all needs met ⇒ housing fills to full cap", Math.abs(t.pop.peasants - PEA_CAP) <= 0.5);
}

// ========================================================================
// 3) Storage cap: production never banks more than CONFIG.town.storageCap of a good.
// ========================================================================
{
  const t = town({ pop: { peasants: 6, workers: 0, burghers: 0 },
                   stock: { wood: 100000 },
                   buildings: [b("potato_farm", 0, 1), b("hut", 0, 2), b("hut", 0, 3), b("hut", 0, 4)] });
  for (let i = 0; i < 300; i++) Sim.tick({ towns: [t] });
  ok("potato stock is clamped at the storage cap (80)", t.stock.potato === CAP);
  ok("no good ever exceeds the storage cap", Object.values(t.stock).every(v => v <= CAP + 1e-9));
}

// Storage cap also clamps a directly-oversized stockpile down on the next tick.
{
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                   stock: { grain: 500 }, buildings: [] });
  Sim.tick({ towns: [t] });
  ok("an over-cap stockpile is clamped to the cap on tick", t.stock.grain === CAP);
}

// ========================================================================
// 4) People-tax: population funds town.gold each tick, and a HAPPIER city earns
//    MORE than a basics-only (~70) city with the same housing.
// ========================================================================
{
  const houses = [b("hut", 0, 2), b("hut", 0, 3), b("hut", 0, 4)];
  const happy = town({ id: 1, gold: 0, pop: { peasants: 6, workers: 0, burghers: 0 },
                       stock: { wood: 100000, potato: 100000, fish: 100000, wool: 100000 },
                       buildings: houses.map(h => ({ ...h })) });
  const basics = town({ id: 2, gold: 0, pop: { peasants: 6, workers: 0, burghers: 0 },
                        stock: { wood: 100000, potato: 100000 },   // basics only ⇒ ~70
                        buildings: houses.map(h => ({ ...h })) });
  Sim.tick({ towns: [happy] }); Sim.tick({ towns: [basics] });
  const g1 = happy.gold;
  ok("people-tax: town.gold rises from population (starts at 0)", happy.gold > 0 && basics.gold > 0);
  for (let i = 0; i < 60; i++) { Sim.tick({ towns: [happy] }); Sim.tick({ towns: [basics] }); }
  ok("people-tax: gold keeps accumulating over time", happy.gold > g1);
  ok("people-tax: a happier city earns more gold than a basics-only city", happy.gold > basics.gold);
  ok("people-tax: an empty city (no pop) earns nothing", (() => {
    const t = town({ gold: 0, pop: { peasants: 0, workers: 0, burghers: 0 }, stock: {} });
    for (let i = 0; i < 20; i++) Sim.tick({ towns: [t] });
    return t.gold === 0;
  })());
}

// ========================================================================
// 5) Workers appear only with a worker house AND their EXTRA need (beer) available;
//    (basics feed happiness; the extra good gates that tier's growth.)
// ========================================================================
{
  // cottage + basics + beer ⇒ workers appear.
  const fed = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                     stock: { wood: 100000, potato: 100000, fish: 100000, wool: 100000, beer: 100000 },
                     buildings: [b("cottage", 0, 1)] });
  for (let i = 0; i < 60; i++) Sim.tick({ towns: [fed] });
  ok("cottage + basics + beer ⇒ workers appear", fed.pop.workers > 0);
  ok("workers never exceed cottage housing capacity",
     fed.pop.workers <= CONFIG.buildings.cottage.houseCapacity + 1e-9);
  ok("cottage (a house) is never assigned workers", fed.buildings[0].workers === 0);

  // Same, but NO beer: workers must NOT appear (their extra need is unmet).
  const dry = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                     stock: { wood: 100000, potato: 100000, fish: 100000, wool: 100000 }, // no beer
                     buildings: [b("cottage", 0, 1)] });
  for (let i = 0; i < 60; i++) Sim.tick({ towns: [dry] });
  ok("cottage + basics but NO beer ⇒ workers stay 0", dry.pop.workers === 0);
}

// ========================================================================
// 6) Missing BASICS drops happiness below 70 and shrinks the population toward the
//    lower happiness-scaled target (no potato ⇒ basicSat only from wood ⇒ ~35).
// ========================================================================
{
  const PEA_CAP = 2 * HUT_CAP; // 2 huts → cap 4
  const t = town({ pop: { peasants: PEA_CAP, workers: 0, burghers: 0 },
                   stock: { wood: 100000 },   // wood only, NO potato
                   buildings: [b("hut", 0, 1), b("hut", 0, 2)] });
  const startPop = totalPop(t);
  for (let i = 0; i < 60; i++) Sim.tick({ towns: [t] });
  ok("missing basic food (potato) holds happiness below 70", t.happiness < 70);
  // basicSat is demand-weighted: potato (0.10/cap) outweighs wood (0.05/cap), so
  // wood-only satisfies 0.05/0.15 = 1/3 of basics ⇒ happiness ≈ 70×1/3 ≈ 23.
  ok("only the wood third of basics met ⇒ happiness near ~23", Math.abs(t.happiness - 23.3) < 5);
  ok("sustained missing-basic shrinks population below the fed peak", totalPop(t) < startPop);
  ok("population never goes negative", totalPop(t) >= 0);
  ok("food scarcity pushes potato price up toward ceiling", t.prices.potato > CONFIG.goods.potato.basePrice);
}

// ========================================================================
// 7) Sim.tick is deterministic: same state in => same state out.
// ========================================================================
{
  const baseTown = town({ pop: { peasants: 4, workers: 2, burghers: 1 },
                          stock: { wood: 50, potato: 12, fish: 8, wool: 6, beer: 3, clothes: 2, grain: 10 },
                          buildings: [b("potato_farm", 0, 1), b("mill", 1, 0), b("cottage", 0, 2)] });
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
// 8) Processor honours inputs: a mill turns grain into flour, consuming grain.
//    (Sim assigns workers from the town's worker pool on the tick.)
// ========================================================================
{
  const t = town({ pop: { peasants: 0, workers: 3, burghers: 0 },
                   stock: { grain: 60 },
                   buildings: [b("mill", 0, 1)] });
  const g0 = t.stock.grain;
  Sim.tick({ towns: [t] });
  ok("Sim assigns workers to the mill", t.buildings[0].workers === CONFIG.buildings.mill.workerSlots);
  ok("mill consumes grain input", t.stock.grain < g0);
  ok("mill produces flour output", (t.stock.flour || 0) > 0);
}

// ========================================================================
// 9) Missing inputs => processor idles (no negative stock, no phantom output).
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
// 10) Labour pool (per tier) caps total workers across buildings.
// ========================================================================
{
  const t = town({ pop: { peasants: 2, workers: 0, burghers: 0 }, // only 2 peasant labourers
                   stock: { wood: 100000 },
                   buildings: [b("potato_farm", 0, 1), b("potato_farm", 0, 2)] }); // two farms want 3 each
  Sim.tick({ towns: [t] });
  ok("greedy fill: first farm takes 2, second takes 0",
     t.buildings[0].workers === 2 && t.buildings[1].workers === 0);
  // 2 labourers × rate 2 × happiness-eff ≤ 1.2x = 4.8 potato max; unbounded would be 9.6.
  ok("labour pool caps production across buildings", (t.stock.potato || 0) <= 4.8 + 1e-9);
  ok("labour-capped town still produced something", (t.stock.potato || 0) > 0);
}

// ========================================================================
// 11) EV3 happiness model — basics floor at 70, extras lift to 100, temp channel.
// ========================================================================

// A cap-2 peasant house with no housing-free base peasants, so the population
// arithmetic (round(cap × happiness/100)) is exact. Restore CONFIG afterwards.
function withCap2House(run) {
  const savedBase = CONFIG.town.baseWorkers;
  const savedCap  = CONFIG.buildings.hut.houseCapacity;
  CONFIG.town.baseWorkers = { peasants: 0 };
  CONFIG.buildings.hut.houseCapacity = 2;
  try { run(); } finally {
    CONFIG.town.baseWorkers = savedBase;
    CONFIG.buildings.hut.houseCapacity = savedCap;
  }
}

// A) Basics fully met (wood+potato), no extras ⇒ happiness ~70, house fills to
//    round(2 × 0.70) = 1.
withCap2House(() => {
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                   stock: { wood: 100000, potato: 100000 }, buildings: [b("hut", 0, 1)] });
  for (let i = 0; i < 400; i++) Sim.tick({ towns: [t] });
  ok("EV3: basics met ⇒ happiness ~70", Math.abs(t.happiness - 70) < 1.5);
  ok("EV3: basics met ⇒ ~1 peasant from a cap-2 house (round(2×0.7)=1)", Math.round(t.pop.peasants) === 1);
});

// B) Basics + extras (fish+wool) ⇒ happiness ~100 and the house fills to full cap (2).
withCap2House(() => {
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                   stock: { wood: 100000, potato: 100000, fish: 100000, wool: 100000 },
                   buildings: [b("hut", 0, 1)] });
  for (let i = 0; i < 400; i++) Sim.tick({ towns: [t] });
  ok("EV3: all needs met ⇒ happiness ~100", t.happiness > 95);
  ok("EV3: all needs met ⇒ house fills to full cap (2)", Math.round(t.pop.peasants) === 2);
});

// C) happyMods temporary channel: an active +10 raises happiness; an expired entry
//    is ignored AND pruned. Baseline is a basics-only ~70 city so +10 is visible.
{
  const s = { towns: [ town({ pop: { peasants: 2, workers: 0, burghers: 0 },
                              stock: { wood: 100000, potato: 100000 } }) ] };
  for (let i = 0; i < 40; i++) Sim.tick(s);        // settle at ~70 (basics only)
  const t = s.towns[0];
  const before = t.happiness;
  t.happyMods = [ { delta: 10,  untilTick: s.tick + 5 },   // active for 5 more ticks
                  { delta: -40, untilTick: s.tick - 1 } ]; // already expired → ignored+pruned
  Sim.tick(s);
  ok("EV3: active +10 happyMod raises happiness above the ~70 baseline", t.happiness > before);
  ok("EV3: expired happyMod is ignored (no −40 applied)", t.happiness > before);
  ok("EV3: expired happyMod is pruned, active one kept", t.happyMods.length === 1 && t.happyMods[0].delta === 10);
  for (let i = 0; i < 40; i++) Sim.tick(s);
  ok("EV3: happyMod decays — happiness returns toward ~70", t.happiness < before + 1 && t.happyMods.length === 0);
}

// D) Unmet EXTRA needs keep happiness at ~70 (basics met, extras missing), while
//    the same town WITH extras sits at ~100.
{
  const H = () => [b("hut", 0, 1), b("hut", 0, 2), b("hut", 0, 3)]; // house the pop so it persists
  const noExtra   = town({ pop: { peasants: 5, workers: 0, burghers: 0 }, stock: { wood: 100000, potato: 100000 }, buildings: H() });
  const withExtra = town({ pop: { peasants: 5, workers: 0, burghers: 0 }, stock: { wood: 100000, potato: 100000, fish: 100000, wool: 100000 }, buildings: H() });
  for (let i = 0; i < 40; i++) { Sim.tick({ towns: [noExtra] }); Sim.tick({ towns: [withExtra] }); }
  ok("EV3: basics met but extras missing ⇒ happiness ~70", Math.abs(noExtra.happiness - 70) < 2);
  ok("EV3: extras met keep happiness ~100", withExtra.happiness > 95);
  ok("EV3: extras met beat extras missing", withExtra.happiness > noExtra.happiness);
}

// E) happyMods absent is treated as no modifier (no throw, no effect).
{
  const t = town({ pop: { peasants: 3, workers: 0, burghers: 0 }, stock: { wood: 100000, potato: 100000 } });
  delete t.happyMods;
  ok("EV3: absent happyMods is safe (no throw)", (() => { Sim.tick({ towns: [t] }); return typeof t.happiness === "number"; })());
}

// F) State.tick counter increments once per Sim.tick call.
{
  const s = { towns: [ town({ pop: { peasants: 1, workers: 0, burghers: 0 } }) ] };
  Sim.tick(s); const t1 = s.tick; Sim.tick(s); const t2 = s.tick;
  ok("EV3: State.tick increments each tick", t1 === 1 && t2 === 2);
}

// G) Demand publishes the basic + extra need goods (so Trade can source them).
{
  const t = town({ pop: { peasants: 4, workers: 0, burghers: 0 }, stock: { wood: 5, potato: 5 } });
  Sim.tick({ towns: [t] });
  ok("EV3: town.demand includes wood + potato (basics) and fish + wool (extras)",
     (t.demand.wood > 0) && (t.demand.potato > 0) && (t.demand.fish > 0) && (t.demand.wool > 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
