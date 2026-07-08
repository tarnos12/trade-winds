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
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings; this.Ledger=Ledger;", sandbox);
const { CONFIG, Sim, Buildings, Ledger } = sandbox;

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

// ========================================================================
// CB-A) Construction & building logistics: built/delivery/priority/closedSlots.
// ========================================================================

// Mimic the UI placement push (built decided by Buildings.isInstant).
function place(typeId, q, r, over) {
  const def = CONFIG.buildings[typeId];
  return Object.assign({
    typeId, q, r, workers: 0,
    built: Buildings.isInstant(def), delivered: {}, closedSlots: 0, priority: false,
  }, over || {});
}

// CB-A.1) An UNBUILT building gets 0 workers and produces nothing — even with
// ample labour AND its production input on the shelf. (mill: cost {wood,stone},
// input {grain}. Stock has grain but NO wood/stone, so it never gets built.)
{
  const t = town({ pop: { peasants: 0, workers: 20, burghers: 0 },
                   stock: { grain: 1000 },
                   buildings: [place("mill", 0, 1)] });
  ok("CB-A: mill placed under construction (built:false)", t.buildings[0].built === false);
  for (let i = 0; i < 10; i++) Sim.tick({ towns: [t] });
  ok("CB-A: unbuilt building is assigned 0 workers", t.buildings[0].workers === 0);
  ok("CB-A: unbuilt building produces nothing (no flour)", !(t.stock.flour > 0));
  ok("CB-A: unbuilt building never builds without materials", t.buildings[0].built === false);
}

// CB-A.2) Construction delivery: materials move from town.stock into the
// building until its resource cost is met, then it flips built:true. delivered
// equals the resource cost; town.stock drops by exactly the delivered amount.
{
  const rc = Buildings.resourceCost(CONFIG.buildings.sawmill); // { wood: 30 }
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },   // pop 0 → no wood consumption
                   stock: { wood: 50 },   // below storageCap (80) so the clamp doesn't confound accounting
                   buildings: [place("sawmill", 0, 1)] });
  const wood0 = t.stock.wood;
  for (let i = 0; i < 12; i++) Sim.tick({ towns: [t] });
  ok("CB-A: delivery flips the building to built:true", t.buildings[0].built === true);
  ok("CB-A: delivered equals the resource cost",
     JSON.stringify(t.buildings[0].delivered) === JSON.stringify(rc));
  ok("CB-A: town.stock dropped by EXACTLY the delivered amount",
     t.stock.wood === wood0 - rc.wood);
}

// CB-A.3) Delivery respects the shared per-tick budget. PP-A: the budget now
// scales with the town's internal transporters (deliveryRate x transporterCount).
// A single unbuilt building receives at most that budget in one tick.
{
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                   stock: { wood: 50 },
                   buildings: [place("sawmill", 0, 1)] });   // L1 town => 4 transporters => budget 20
  Sim.tick({ towns: [t] });
  const moved = t.buildings[0].delivered.wood || 0;
  const budget = CONFIG.town.deliveryRate * Buildings.transporterCount(t);
  ok("CB-A/PP-A: one tick delivers at most deliveryRate x transporterCount", moved === budget);
  ok("CONFIG.town.deliveryRate === 5", CONFIG.town.deliveryRate === 5);
  ok("PP-A: L1 town runs transportersByLevel[1] transporters", Buildings.transporterCount(t) === CONFIG.town.transportersByLevel[1]);
}

// CB-A.4) An unbuilt building's remaining need is published to town.demand so
// the external trader buys the construction materials (mill: wood 25, stone 15;
// pop 0 and no materials in stock ⇒ demand is purely construction demand).
{
  const t = town({ pop: { peasants: 0, workers: 0, burghers: 0 },
                   stock: {},
                   buildings: [place("mill", 0, 1)] });
  Sim.tick({ towns: [t] });
  const cost = CONFIG.buildings.mill.cost;
  ok("CB-A: unbuilt building's remaining need appears in town.demand",
     t.demand.wood === cost.wood && t.demand.stone === cost.stone);
}

// CB-A.5) A gold-only founding-kit starter comes out built:true and functions
// EXACTLY as a legacy building (no built field) — same production.
{
  ok("CB-A: gold-only starter is instant (built:true on placement)",
     place("potato_farm", 0, 1).built === true && place("hut", 0, 2).built === true);
  const houses = () => [place("hut", 0, 2), place("hut", 0, 3), place("hut", 0, 4)];
  const modern = town({ id: 1, pop: { peasants: 3, workers: 0, burghers: 0 },
                        stock: { wood: 100000 },
                        buildings: [place("potato_farm", 0, 1), ...houses()] });
  const legacy = town({ id: 2, pop: { peasants: 3, workers: 0, burghers: 0 },
                        stock: { wood: 100000 },
                        buildings: [b("potato_farm", 0, 1), b("hut", 0, 2), b("hut", 0, 3), b("hut", 0, 4)] });
  for (let i = 0; i < 50; i++) { Sim.tick({ towns: [modern] }); Sim.tick({ towns: [legacy] }); }
  ok("CB-A: instant starter produces potato", modern.stock.potato > 0);
  ok("CB-A: instant starter behaves identically to a legacy building",
     Math.abs((modern.stock.potato || 0) - (legacy.stock.potato || 0)) < 1e-9 &&
     modern.pop.peasants === legacy.pop.peasants);
}

// CB-A.6) closedSlots reduces assigned workers by that many (effective slots).
{
  const t = town({ pop: { peasants: 10, workers: 0, burghers: 0 },
                   stock: { wood: 100000 },
                   buildings: [place("lumberjack", 0, 1, { closedSlots: 1 })] });
  Sim.tick({ towns: [t] });
  const full = CONFIG.buildings.lumberjack.workerSlots; // 3
  ok("CB-A: closedSlots:1 → assigned workers = slots − 1", t.buildings[0].workers === full - 1);

  const t2 = town({ pop: { peasants: 10, workers: 0, burghers: 0 },
                    stock: { wood: 100000 },
                    buildings: [place("lumberjack", 0, 1, { closedSlots: full + 5 })] });
  Sim.tick({ towns: [t2] });
  ok("CB-A: closedSlots ≥ slots → 0 workers (never negative)", t2.buildings[0].workers === 0);
}

// CB-A.7) Priority buildings are staffed FIRST — even when a non-priority one
// comes earlier in the array. Pool of 3 peasants, two 3-slot lumberjacks: the
// priority one gets all 3, the other gets 0.
{
  const t = town({ pop: { peasants: 3, workers: 0, burghers: 0 },
                   stock: { wood: 100000 },
                   buildings: [
                     place("lumberjack", 0, 1, { priority: false }),  // earlier in array
                     place("lumberjack", 0, 2, { priority: true }),   // but priority
                   ] });
  Sim.tick({ towns: [t] });
  ok("CB-A: priority building staffed first (gets the whole pool)", t.buildings[1].workers === 3);
  ok("CB-A: non-priority building left unstaffed when pool is exhausted", t.buildings[0].workers === 0);
}

// === RU-A: per-building upgrade wiring (end-to-end through Sim.tick) ========
{
  const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-6);

  // -- outputMult: a farm at upgradeLevel 2 produces 1.25× the grain (grain is
  //    NOT a need good, so nothing consumes it — the stock IS the production). --
  {
    const mk = (lvl) => town({
      pop: { peasants: 3, workers: 0, burghers: 0 },
      stock: { wood: 1000, potato: 1000, fish: 1000, wool: 1000 },
      buildings: [place("farm", 0, 1, { upgradeLevel: lvl })],
    });
    const t1 = mk(1), t2 = mk(2);
    Sim.tick({ towns: [t1] });
    Sim.tick({ towns: [t2] });
    ok("RU-A: upgradeLevel 2 farm yields 1.25× grain", t1.stock.grain > 0 && near(t2.stock.grain / t1.stock.grain, 1.25, 1e-6));
  }

  // -- slotPlus: sawmill at L3 (base 2 slots + 1) staffs 3 workers from a big pool
  //    (built:true so an under-construction sawmill isn't skipped). --
  {
    const t = town({
      pop: { peasants: 10, workers: 0, burghers: 0 },
      stock: { wood: 1000 },
      buildings: [place("sawmill", 0, 1, { built: true, upgradeLevel: 3 })],
    });
    Sim.tick({ towns: [t] });
    ok("RU-A: slotPlus raises staffed workers to workerSlots+1", t.buildings[0].workers === 3);
  }

  // -- housing capacityPlus raises the population ceiling: two self-sufficient
  //    towns (all needs produced locally); the hut-L3 town settles at a higher
  //    peasant count than the hut-L1 town (cap 4 vs 2). --
  {
    const mk = (lvl) => town({
      level: 3, pop: { peasants: 12, workers: 0, burghers: 0 },
      stock: { wood: 60, potato: 60, fish: 60, wool: 60 },
      buildings: [
        place("hut", 0, 1, { upgradeLevel: lvl }),
        place("potato_farm", 0, 2, { built: true }),
        place("lumberjack", 0, 3, { built: true }),
        place("fishery", 1, 1, { built: true }),
        place("shepherd", 1, 2, { built: true }),
      ],
    });
    const t1 = mk(1), t3 = mk(3);
    for (let i = 0; i < 600; i++) { Sim.tick({ towns: [t1] }); Sim.tick({ towns: [t3] }); }
    ok("RU-A: capacityPlus lifts pop ceiling above the base hut cap", t3.pop.peasants > t1.pop.peasants + 0.5);
  }

  // -- basicConsumptionMult: a hut-L4 town burns less wood+potato but the SAME
  //    fish+wool (extra needs are unscaled). Stock stays under storageCap so the
  //    consumption difference isn't masked by the end-of-tick clamp. --
  {
    const mk = (lvl) => town({
      pop: { peasants: 2, workers: 0, burghers: 0 },
      stock: { wood: 50, potato: 50, fish: 50, wool: 50 },
      buildings: [place("hut", 0, 1, { upgradeLevel: lvl })],
    });
    const tHi = mk(1), tLo = mk(4);   // L4 hut cuts basic consumption to 0.7×
    Sim.tick({ towns: [tHi] });
    Sim.tick({ towns: [tLo] });
    ok("RU-A: L4 hut consumes less wood", tLo.stock.wood > tHi.stock.wood);
    ok("RU-A: L4 hut consumes less potato", tLo.stock.potato > tHi.stock.potato);
    ok("RU-A: extra needs (fish) consumed equally", near(tLo.stock.fish, tHi.stock.fish, 1e-9));
    ok("RU-A: extra needs (wool) consumed equally", near(tLo.stock.wool, tHi.stock.wool, 1e-9));
  }

  // -- pending upgrade: its material need shows in demand, drains stock over
  //    ticks, and flips upgradeLevel when delivered. --
  {
    // PP-A: L1 budget is deliveryRate x 4 = 20. The sawmill L2 upgrade needs wood:25
    // (> budget), so it stays pending after one tick and completes over several.
    const t = town({
      pop: { peasants: 0, workers: 0, burghers: 0 },
      stock: { wood: 100 },
      buildings: [place("sawmill", 0, 1, { upgradeLevel: 1, pendingUpgrade: { toLevel: 2, delivered: {} } })],
    });
    Sim.tick({ towns: [t] });   // sawmill L2 needs wood:25; budget 20 < 25 => still pending
    const bld = t.buildings[0];
    ok("RU-A: pending upgrade adds its need to town demand", (t.demand.wood || 0) > 0);
    ok("RU-A: pending upgrade still pending after one tick", bld.pendingUpgrade && bld.upgradeLevel === 1);
    ok("RU-A: delivery drains town stock", t.stock.wood < 100);
    for (let i = 0; i < 20; i++) Sim.tick({ towns: [t] });
    ok("RU-A: upgrade completes → upgradeLevel 2", bld.upgradeLevel === 2);
    ok("RU-A: pendingUpgrade cleared on completion", bld.pendingUpgrade === null);
  }
}
// === /RU-A =================================================================

// === PP-A: per-tier happiness + income, houseIncome, transporter delivery =====
{
  const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);
  const homesFor = (peas, work, burg) => {
    const a = [];
    for (let i = 0; i < peas; i++) a.push(place("hut", i, 3));       // 2 peasant cap each
    for (let i = 0; i < work; i++) a.push(place("cottage", i, 4));   // 3 worker cap each
    for (let i = 0; i < burg; i++) a.push(place("manor", i, 5));     // 4 burgher cap each
    return a;
  };

  // -- transporter-scaled construction delivery: L4 delivers more/tick than L1. --
  {
    const mk = (lvl) => town({ level: lvl, pop: { peasants: 0, workers: 0, burghers: 0 },
                               stock: { wood: 200 }, buildings: [place("sawmill", 0, 1)] });
    const t1 = mk(1), t4 = mk(4);
    Sim.tick({ towns: [t1] }); Sim.tick({ towns: [t4] });
    const d1 = t1.buildings[0].delivered.wood || 0, d4 = t4.buildings[0].delivered.wood || 0;
    ok("PP-A: transporterCount L1=4, L4=7", Buildings.transporterCount(t1) === 4 && Buildings.transporterCount(t4) === 7);
    ok("PP-A: L4 delivers more construction material per tick than L1", d4 > d1);
    ok("PP-A: L1 delivers deliveryRate x 4", d1 === CONFIG.town.deliveryRate * 4);
    ok("PP-A: transporterCount floors at 1 for an unlevelled town", Buildings.transporterCount({}) >= 1);
  }

  // -- single-tier equivalence: a peasant-only town's happiness matches the OLD
  //    aggregate model bit-exactly, and income uses that same happiness. ONE tick. --
  {
    const t = town({ level: 1, gold: 0,
      pop: { peasants: 8, workers: 0, burghers: 0 },
      stock: { wood: 100, potato: 100, fish: 100, wool: 100 },
      buildings: homesFor(5, 0, 0) });
    Sim.tick({ towns: [t] });
    ok("PP-A: single-tier tierHappiness.peasants == town.happiness", near(t.tierHappiness.peasants, t.happiness));
    ok("PP-A: single-tier empty tiers are null", t.tierHappiness.workers === null && t.tierHappiness.burghers === null);
    const pt = CONFIG.needs.peopleTax;
    const oldMult = 1 + Math.max(0, t.happiness - pt.happyBase) * pt.bonusPerPoint;
    const oldTotal = t.pop.peasants * pt.goldPerPop * oldMult;
    const tierTotal = t.tierIncome.peasants + t.tierIncome.workers + t.tierIncome.burghers;
    ok("PP-A: single-tier income == old aggregate formula", near(tierTotal, oldTotal));
    ok("PP-A: Sum tierIncome == the gold credited this tick", near(tierTotal, t.gold));
    ok("PP-A: tierIncome all in the peasant bucket", t.tierIncome.workers === 0 && t.tierIncome.burghers === 0);
  }

  // -- weighted average: workers (beer met) end HAPPIER than burghers (clothes
  //    missing); town.happiness is their pop-weighted average. ONE tick (pre-growth pop). --
  {
    const t = town({ level: 3, gold: 0,
      pop: { peasants: 0, workers: 6, burghers: 3 },
      stock: { wood: 500, potato: 500, fish: 500, wool: 500, beer: 500, clothes: 0 },
      buildings: homesFor(0, 3, 2) });
    Sim.tick({ towns: [t] });
    ok("PP-A: workers (beer met) happier than burghers (clothes missing)",
       t.tierHappiness.workers > t.tierHappiness.burghers);
    ok("PP-A: town.happiness sits between the two present tiers",
       t.happiness <= t.tierHappiness.workers + 1e-9 && t.happiness >= t.tierHappiness.burghers - 1e-9);
    const wavg = (6 * t.tierHappiness.workers + 3 * t.tierHappiness.burghers) / 9;
    ok("PP-A: town.happiness == pop-weighted avg of present tiers", near(t.happiness, wavg, 1e-9));
    ok("PP-A: Sum tierIncome == people-tax credited (mixed tiers)",
       near(t.tierIncome.workers + t.tierIncome.burghers + t.tierIncome.peasants, t.gold, 1e-9) && t.gold > 0);
    ok("PP-A: peasant tier absent -> tierIncome.peasants 0", t.tierIncome.peasants === 0);
  }

  // -- houseIncome attributes a tier's income across its houses by capacity share. --
  {
    const bigHut = place("hut", 0, 3, { upgradeLevel: 2 });   // +1 capacity from L2 (cap 3)
    const smallHut = place("hut", 1, 3);                       // base cap 2
    const t = town({ level: 1, gold: 0,
      pop: { peasants: 5, workers: 0, burghers: 0 },
      stock: { wood: 200, potato: 200, fish: 200, wool: 200 },
      buildings: [bigHut, smallHut] });
    Sim.tick({ towns: [t] });
    const iBig = Sim.houseIncome(t, bigHut), iSmall = Sim.houseIncome(t, smallHut);
    ok("PP-A: houseIncome present as a function", typeof Sim.houseIncome === "function");
    ok("PP-A: bigger house earns a larger income share", iBig > iSmall && iSmall > 0);
    ok("PP-A: Sum houseIncome over a tier == tierIncome[tier]", near(iBig + iSmall, t.tierIncome.peasants, 1e-9));
    ok("PP-A: split follows capacity share (3:2)", near(iBig / iSmall, 3 / 2, 1e-6));
    ok("PP-A: houseIncome returns 0 for a non-house", Sim.houseIncome(t, place("sawmill", 2, 3)) === 0);
  }

  // -- ledger tax hook: after a Sim tick the town's ledger tally.tax == people-tax. --
  {
    const t = town({ level: 1, gold: 0,
      pop: { peasants: 6, workers: 0, burghers: 0 },
      stock: { wood: 100, potato: 100, fish: 100, wool: 100 },
      buildings: homesFor(4, 0, 0) });
    Sim.tick({ towns: [t] });
    ok("PP-A: Sim records people-tax into the ledger", near(t.ledger.tally.tax, t.tierIncome.peasants, 1e-9) && t.ledger.tally.tax > 0);
    ok("PP-A: ledger sampled gold history once this tick", Array.isArray(t.ledger.hist) && t.ledger.hist.length === 1);
  }
}
// === /PP-A ====================================================================

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
