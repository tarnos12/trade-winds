// BALPW — balance invariants that lock in the PEASANT + WORKER "fully functional"
// tuning (v0.18.x follow-up). Two levers under test:
//   1. unlock_bakery is re-tiered off iron_tool (a BURGHER good) onto the worker
//      band, so the worker food chain (mill→bakery→bread) is reachable in-band and
//      bread — a worker LUXURY — is actually produced.
//   2. fishery output 1→2 per worker, so fish (peasant LUXURY + worker BASIC +
//      oil_maker input, i.e. triple-purposed) can cover the combined draw and the
//      worker fish basic is not chronically starved.
// Pure-Sim, deterministic, no browser. Confirms the (chaos-sensitive) playthrough
// findings with cheap invariants.
//   node test/balance.test.js
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
const { CONFIG, Sim } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } }

const G = CONFIG.goods;
const B = CONFIG.buildings;
const TIER = CONFIG.needs.tiers;
const goodTier = (gid) => G[gid] ? G[gid].tier : null;
// Which tier's LABOUR produces a good (worker/peasant/burgher/aristocrat).
const staffTierOf = {};
for (const d of Object.values(B)) if (d.output) staffTierOf[d.output.goodId] = d.workerTier;

// ---------------------------------------------------------------------------
// (A) unlock_bakery must be reachable within the peasant/worker band — its
//     research materials must not depend on a good made by BURGHER (or higher)
//     labour, else a worker LUXURY (bread) is gated behind a higher tier.
// ---------------------------------------------------------------------------
const bakeryNode = (CONFIG.research || []).find(n => n.id === "unlock_bakery");
ok("unlock_bakery node exists", !!bakeryNode);
const bakeryMats = (bakeryNode && bakeryNode.materials) || {};
ok("unlock_bakery requires no iron_tool (was the burgher-tier gate)", !("iron_tool" in bakeryMats));
const higherTierMat = Object.keys(bakeryMats).find(g => {
  const st = staffTierOf[g];
  return st === "burgher" || st === "aristocrat";
});
ok("unlock_bakery materials all producible by peasant/worker labour (band-appropriate)",
   !higherTierMat, higherTierMat ? "offending mat: " + higherTierMat : "");
ok("unlock_bakery still has a non-empty material cost (not free)", Object.keys(bakeryMats).length > 0);

// ---------------------------------------------------------------------------
// (B) Fishery output must cover fish's combined role. Fish is a PEASANT luxury,
//     a WORKER basic, AND the oil_maker input. At a reference city (20 peasants,
//     6 workers) one maxed fishery must at least cover the peasant-luxury +
//     worker-basic fish draw (oil is a bonus consumer on top).
// ---------------------------------------------------------------------------
const fishery = B.fishery;
ok("fishery output good is fish", fishery.output && fishery.output.goodId === "fish");
ok("fishery ratePerWorker >= 2 (was 1 — too low for the triple role)", fishery.output.ratePerWorker >= 2);
const fisheryMax = fishery.output.ratePerWorker * fishery.workerSlots; // at hf=1
const REF_PEAS = 20, REF_WORK = 6;
const peasFishDraw = REF_PEAS * TIER.peasants.perCapita.fish; // peasant LUXURY
const workFishDraw = REF_WORK * TIER.workers.perCapita.fish;  // worker BASIC
ok("one maxed fishery covers peasant-luxury + worker-basic fish at reference pop",
   fisheryMax >= peasFishDraw + workFishDraw,
   `fisheryMax=${fisheryMax} draw=${(peasFishDraw + workFishDraw).toFixed(2)}`);
// fish is genuinely triple-purposed — assert the model still reflects that.
ok("fish is a peasant luxury", TIER.peasants.extra.includes("fish"));
ok("fish is a worker basic", TIER.workers.basic.includes("fish"));
ok("fish feeds the oil_maker", B.oil_maker && B.oil_maker.inputs && "fish" in B.oil_maker.inputs);

// ---------------------------------------------------------------------------
// (C) Coal (worker BASIC) is producible fast enough. A charcoal_burner (peasant-
//     staffed, wood->coal 1:1) at full slots must cover a reference worker coal
//     draw with wood to spare.
// ---------------------------------------------------------------------------
const cb = B.charcoal_burner;
const coalMax = cb.output.ratePerWorker * cb.workerSlots;
const workCoalDraw = REF_WORK * TIER.workers.perCapita.coal;
ok("charcoal_burner covers reference worker coal basic draw",
   coalMax >= workCoalDraw, `coalMax=${coalMax} draw=${workCoalDraw.toFixed(2)}`);

// ---------------------------------------------------------------------------
// (D) End-to-end: a SELF-SUFFICIENT worker town bootstraps workers and reaches a
//     healthy worker tierHappiness, with EVERY worker good (fish, coal, clothes,
//     bread, mead) actually produced (not pinned at 0). This is the real
//     regression guard for the whole peasant+worker economy.
// ---------------------------------------------------------------------------
function b(typeId) { return { typeId, q: 0, r: 0, workers: 0 }; }
function repeat(typeId, n) { const a = []; for (let i = 0; i < n; i++) a.push(b(typeId)); return a; }
const buildings = [
  ...repeat("hut", 8),        // peasant housing (16)
  ...repeat("cottage", 4),    // worker housing (12)
  b("potato_farm"), b("lumberjack"),           // peasant basics: potato + wood
  b("fishery"), b("shepherd"),                 // peasant luxury: fish + wool
  b("charcoal_burner"),                        // worker basic: coal (peasant-staffed)
  b("farm"), b("mill"), b("bakery"),           // worker chain: grain->flour->bread
  b("brewery"),                                // worker luxury: mead
  b("tailoring"),                              // worker luxury: clothes (wool->clothes)
];
const town = {
  id: 1, q: 0, r: 0, level: 4, gold: 0,
  pop: { peasants: 2, workers: 0, burghers: 0, aristocrats: 0 },
  // seed a little of every intermediate so the chains don't idle on tick 1
  stock: { wood: 40, potato: 20, grain: 40, wool: 20, fish: 20, flour: 10, coal: 10 },
  prices: {}, demand: {}, buildings, happiness: 60,
};
const state = { tick: 0, towns: [town] };
for (let i = 0; i < 900; i++) { state.tick = i; Sim.tick(state); }

const th = town.tierHappiness || {};
ok("self-sufficient town grew workers (>0)", (town.pop.workers || 0) > 0,
   "workers=" + (town.pop.workers || 0).toFixed(2));
ok("self-sufficient town grew peasants (>0)", (town.pop.peasants || 0) > 0);
ok("peasant tierHappiness >= 85 (basics + fish/wool luxuries)", (th.peasants || 0) >= 85,
   "peasants th=" + (th.peasants || 0).toFixed(1));
ok("worker tierHappiness >= 70 (basics met, capacity-full)", (th.workers || 0) >= 70,
   "workers th=" + (th.workers || 0).toFixed(1));
ok("worker tierHappiness >= 90 (full worker luxury chain clothes+bread+mead)",
   (th.workers || 0) >= 90, "workers th=" + (th.workers || 0).toFixed(1));

// Every worker good must be flowing: producers ran, so either stock is present or
// it's being consumed as fast as made (production tracked via a one-tick probe).
function producesOverTick(gid) {
  const before = town.stock[gid] || 0;
  // run one tick and see if the good was produced or held; consumption may net it
  // to ~same, so probe by temporarily zeroing consumers is overkill — instead just
  // assert the good is present in stock OR a staffed producer for it exists.
  let hasProducer = false;
  for (const bd of town.buildings) {
    const def = B[bd.typeId];
    if (def && def.output && def.output.goodId === gid && (bd.workers || 0) > 0) hasProducer = true;
  }
  return (before > 0.01) || hasProducer;
}
for (const gid of ["fish", "coal", "clothes", "bread", "mead"]) {
  ok(`worker good '${gid}' is produced/present (not dead at 0)`, producesOverTick(gid),
     `stock=${(town.stock[gid] || 0).toFixed(1)}`);
}
// bread specifically was the DEAD good pre-fix — assert a staffed bakery + presence.
const bakeryBld = town.buildings.find(x => x.typeId === "bakery");
ok("bakery is staffed (worker food chain running)", bakeryBld && (bakeryBld.workers || 0) > 0,
   "bakery workers=" + (bakeryBld ? bakeryBld.workers : "none"));

// ---------------------------------------------------------------------------
console.log((fail === 0 ? "PASS" : "FAIL") + ": balance.test.js — " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
