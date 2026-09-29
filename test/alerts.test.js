// Headless test for Trade Winds — DESIGN PASS #8: true, actionable shortage signals.
// Sim.needCoverage (read-only per-tier cover in game-minutes, counting the houses'
// porter buffers), Sim.shortageAlerts (basic-need alert with hysteresis) and
// Sim.emptyBasicNeed (the "We don't have any X!" bubble good). Invariants:
//   1. genre-2: a city with a Potato Farm + 2 Huts and NO forest raises a WOOD alert
//      before its happiness drops below 70 — and the crisis is real (it then drops).
//   2. A peasant-only city never produces a fish (or any luxury) shortage bubble —
//      the bubble reads the town's own present-tier basics, not the cross-tier union.
//   3. Cover counts warehouse + house buffers; carts inbound, a staffed producer and
//      hysteresis (raise < 2 min, clear > 4 min) behave as specified; read-only.
// Evaluates the PURE_CORE slice of index.html (no browser).
//   node test/alerts.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Market=Market;", sandbox);
const { CONFIG, Sim, Market } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (extra ? "  " + extra : "")); } }

function b(typeId, q, r, over) { return Object.assign({ typeId, q, r, workers: 0, built: true }, over || {}); }
function town(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 1000, built: true,
    pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [],
  }, over || {});
}
const byGid = (cov) => { const o = {}; for (const e of cov) o[e.gid] = e; return o; };

// ---- sanity ----
ok("Sim.needCoverage is a function", typeof Sim.needCoverage === "function");
ok("Sim.shortageAlerts is a function", typeof Sim.shortageAlerts === "function");
ok("Sim.emptyBasicNeed is a function", typeof Sim.emptyBasicNeed === "function");
ok("CONFIG.alerts tunables (raise 2 < clear 4)",
  CONFIG.alerts && CONFIG.alerts.raiseCoverMin === 2 && CONFIG.alerts.clearCoverMin === 4);

// ========================================================================
// 1) genre-2 scenario: Potato Farm + 2 Huts, no forest / no lumberjack. The city
//    starts with the founding stock (60 wood, 20 potato), grows to 4 peasants at
//    70% (basics met, luxuries locked), then burns through its wood. The alert is
//    polled like the UI does (every ~1.2 s = ~2 ticks at 1×).
// ========================================================================
{
  const t = town({ stock: Object.assign({}, CONFIG.town.startStock),
    buildings: [b("potato_farm", 0, 2), b("hut", 1, 0), b("hut", 0, 1)] });
  const st = { towns: [t], carts: [] };
  let flags = {}, woodRaisedAt = -1, happyAtRaise = null, firstBelow70 = -1, minHappy = 100;
  let luxuryFlag = false, potatoFlag = false, fishBubble = false, sawWoodBubble = false;
  for (let i = 0; i < 3000; i++) {
    Sim.tick(st);
    const h = t.happiness || 0;
    if (i > 60 && h < 69.5 && firstBelow70 < 0) firstBelow70 = i;
    if (i > 60) minHappy = Math.min(minHappy, h);
    if (i % 2 === 0) {
      const cov = Sim.needCoverage(st, t);
      flags = Sim.shortageAlerts(st, t, flags, cov);
      if (flags.wood && woodRaisedAt < 0) { woodRaisedAt = i; happyAtRaise = h; }
      if (flags.fish || flags.wool) luxuryFlag = true;
      if (flags.potato) potatoFlag = true;
      const eb = Sim.emptyBasicNeed(st, t, cov);
      if (eb === "fish" || eb === "wool" || eb === "coal") fishBubble = true;
      if (eb === "wood") sawWoodBubble = true;
    }
  }
  ok("the scenario is a real crisis (happiness later falls below 60)", minHappy < 60, "min " + minHappy.toFixed(1));
  ok("a WOOD alert is raised", woodRaisedAt >= 0);
  ok("…before happiness drops below 70", woodRaisedAt >= 0 && firstBelow70 > woodRaisedAt,
    "raised@" + woodRaisedAt + " below70@" + firstBelow70);
  ok("…while the city was still at ~70%", happyAtRaise != null && happyAtRaise >= 69.5, String(happyAtRaise));
  ok("…with real warning time (≥ 1 game-min before the drop)", firstBelow70 - woodRaisedAt >= 120,
    (firstBelow70 - woodRaisedAt) + " ticks");
  ok("the wood alert is still up during the crisis (hysteresis)", !!flags.wood);
  ok("the staffed Potato Farm never raises a potato alert", !potatoFlag);
  ok("luxuries (fish/wool) never raise a shortage alert", !luxuryFlag);
  ok("the peasant city never bubbles about fish/wool/coal", !fishBubble);
  ok("…but does bubble about the missing wood", sawWoodBubble);
}

// ========================================================================
// 2) A starving peasant-only city (nothing anywhere): the bubble good is one of the
//    peasants' own basics, never fish (a worker basic, a peasant luxury).
// ========================================================================
{
  const t = town({ pop: { peasants: 4, workers: 0, burghers: 0, aristocrats: 0 }, stock: {},
    buildings: [b("hut", 1, 0), b("hut", 0, 1)] });
  const st = { towns: [t], carts: [] };
  const cov = byGid(Sim.needCoverage(st, t));
  ok("peasant cover lists potato + wood as basic", cov.potato && cov.potato.cls === "basic" && cov.wood && cov.wood.cls === "basic");
  ok("peasant cover lists fish + wool as extra", cov.fish && cov.fish.cls === "extra" && cov.wool && cov.wool.cls === "extra");
  ok("no absent-tier goods (coal is a worker basic)", !cov.coal && !cov.lamp);
  const eb = Sim.emptyBasicNeed(st, t);
  ok("empty peasant city bubbles a peasant basic", eb === "potato" || eb === "wood", String(eb));
  // per-minute consumption: 4 peasants × 0.010833/tick × 120 ≈ 5.2 potato/min
  ok("perMin is per-tick × 120", Math.abs(cov.potato.perMin - 4 * CONFIG.needs.tiers.peasants.perCapita.potato * 120) < 1e-6);
  // luxury locked at game start (research-gated) → the wanted row greys it
  const prod = Market.producible({ research: { unlocked: [] } });
  ok("fish/wool are not producible at game start (wanted row greys them)", !prod.fish && !prod.wool && prod.potato && prod.wood);
}

// ========================================================================
// 3) Cover counts house buffers; read-only; inbound carts / staffed producer /
//    hysteresis rules; dual-role class; an unbuilt city has no alerts.
// ========================================================================
{
  const perMinWood = 4 * CONFIG.needs.tiers.peasants.perCapita.wood * 120;   // 3.6/min
  const mk = (whWood, hutWood) => town({ pop: { peasants: 4, workers: 0, burghers: 0, aristocrats: 0 },
    stock: { potato: 80, wood: whWood },
    buildings: [b("potato_farm", 0, 2, { workers: 2 }), b("hut", 1, 0, { inbuf: { wood: hutWood, potato: 10 } }), b("hut", 0, 1)] });

  // home buffers count toward cover, and the bubble stays quiet while homes hold stock
  const t = mk(0, 10), st = { towns: [t], carts: [] };
  const before = JSON.stringify(st);
  const cov = byGid(Sim.needCoverage(st, t));
  ok("cover = warehouse + house buffers", Math.abs(cov.wood.have - 10) < 1e-9);
  ok("coverMin = have / perMin", Math.abs(cov.wood.coverMin - 10 / perMinWood) < 1e-9);
  ok("no 'empty' bubble while the huts still hold wood", Sim.emptyBasicNeed(st, t) !== "wood");
  ok("staffed local potato producer detected", cov.potato.hasLocalProducer && cov.potato.staffed);
  ok("no local wood producer", !cov.wood.hasLocalProducer && !cov.wood.staffed);
  Sim.shortageAlerts(st, t, { wood: true });
  ok("needCoverage / shortageAlerts are read-only", JSON.stringify(st) === before);

  const flagsAt = (wood, prev, carts) => { const tt = mk(wood, 0); return Sim.shortageAlerts({ towns: [tt], carts: carts || [] }, tt, prev); };
  ok("raise under 2 min of cover", !!flagsAt(perMinWood * 1.5, {}).wood);
  ok("no raise at 3 min of cover", !flagsAt(perMinWood * 3, {}).wood);
  ok("hysteresis: an alert holds at 3 min", !!flagsAt(perMinWood * 3, { wood: true }).wood);
  ok("hysteresis: clears above 4 min", !flagsAt(perMinWood * 4.5, { wood: true }).wood);
  const cart = [{ id: 1, kind: "external", fromId: 1, toId: 2, done: false,
    cargo: [{ goodId: "wood", qty: 10, unloaded: 2 }], goodId: "wood", qty: 10 }];
  const tc = mk(0, 0);
  ok("inbound counts a buyer's un-unloaded cargo", byGid(Sim.needCoverage({ towns: [tc], carts: cart }, tc)).wood.inbound === 8);
  ok("wood on its way suppresses the raise", !flagsAt(0, {}, cart).wood);
  const sellIn = [{ id: 2, kind: "external", fromId: 2, toId: 1, done: false, cargo: [{ goodId: "fish", qty: 5 }],
    sellCargo: [{ goodId: "wood", qty: 6 }] }];
  ok("H sell-cargo heading here counts as inbound", byGid(Sim.needCoverage({ towns: [tc], carts: sellIn }, tc)).wood.inbound === 6);

  // a staffed producer holds the early alert back until satisfaction visibly slips
  const tp = mk(80, 0); tp.stock.potato = 0; tp.satEMA = { potato: 1 };
  ok("staffed producer: no early potato alert", !Sim.shortageAlerts({ towns: [tp], carts: [] }, tp, {}).potato);
  tp.satEMA.potato = 0.8;
  ok("staffed producer failing (satEMA < 0.9): alert", !!Sim.shortageAlerts({ towns: [tp], carts: [] }, tp, {}).potato);
  tp.buildings[0].workers = 0; tp.satEMA.potato = 1;
  ok("unstaffed producer: alert", !!Sim.shortageAlerts({ towns: [tp], carts: [] }, tp, {}).potato);

  // dual-role good: fish is a peasant luxury but a worker basic → basic when workers live here
  const tw = town({ pop: { peasants: 2, workers: 2, burghers: 0, aristocrats: 0 }, stock: {} });
  const cw = byGid(Sim.needCoverage({ towns: [tw], carts: [] }, tw));
  ok("fish is basic once workers are present", cw.fish && cw.fish.cls === "basic" && cw.coal && cw.coal.cls === "basic");

  const tu = mk(0, 0); tu.built = false;
  ok("a city under construction raises nothing", Object.keys(Sim.shortageAlerts({ towns: [tu], carts: [] }, tu, {})).length === 0);
  ok("an empty city has no coverage rows", Sim.needCoverage({ towns: [] }, town({})).length === 0);
}

// ========================================================================
// 4) v0.52.1 (QA polish): no false alarms during the normal ramp.
//    - Sim.idleIsNews: an idle producer is only Event-Log news once its worker
//      tier's homes are FULL (free housing < 0.5) and the city completed ≥
//      CONFIG.alerts.idleGraceSec ago — "no free peasants — build Huts" is then true.
//    - Sim.dreamTiers: the "We dream of X" bubble needs > dreamMinPop residents of
//      that tier and a city ≥ dreamMinAgeSec old.
//    - Sim.tick stamps town.builtTick when construction finishes (Sim.cityAgeTicks).
// ========================================================================
{
  const TPS = 1000 / CONFIG.econ.baseTickMs;
  const A = CONFIG.alerts;
  ok("CONFIG.alerts idle/dream knobs present",
    A.idleGraceSec === 60 && A.dreamMinAgeSec === 150 && A.dreamMinPop === 1);
  const lj = CONFIG.buildings.lumberjack;
  const hutCap = CONFIG.buildings.hut.houseCapacity;

  // city age: builtTick → age; legacy (no stamps) → Infinity; unbuilt → 0
  const tA = town({ builtTick: 100 });
  ok("cityAgeTicks = tick − builtTick", Sim.cityAgeTicks({ tick: 250 }, tA) === 150);
  ok("cityAgeTicks falls back to foundedTick + buildSec",
    Sim.cityAgeTicks({ tick: 500 }, town({ foundedTick: 100 })) === 500 - 100 - CONFIG.town.buildSec * TPS);
  ok("cityAgeTicks: a legacy city with no stamps is old news", Sim.cityAgeTicks({ tick: 5 }, town({})) === Infinity);
  ok("cityAgeTicks: a city under construction is 0", Sim.cityAgeTicks({ tick: 500 }, town({ built: false, builtTick: 1 })) === 0);

  // free housing
  const hut2 = [b("hut", 1, 0), b("hut", 0, 1), b("lumberjack", 2, 0)];
  const tH = town({ buildings: hut2, pop: { peasants: 1.2, workers: 0, burghers: 0, aristocrats: 0 } });
  ok("freeHousing = capacity − residents", Math.abs(Sim.freeHousing({}, tH, "peasants") - (2 * hutCap - 1.2)) < 1e-9);

  // the QA case: first minute after completion, peasants still moving in → quiet
  const st = { tick: 10000 };
  const ramp = town({ builtTick: st.tick - 20 * TPS, buildings: hut2,
    pop: { peasants: 1.2, workers: 0, burghers: 0, aristocrats: 0 } });
  ok("idle Lumberjack is NOT news while peasants are still moving in", Sim.idleIsNews(st, ramp, lj) === false);
  ramp.builtTick = st.tick - 600 * TPS;   // an old city whose homes still have room
  ok("…nor in an old city whose Huts still have free room", Sim.idleIsNews(st, ramp, lj) === false);
  ramp.pop.peasants = 2 * hutCap - 0.2;   // homes full (free < 0.5)
  ok("homes full + old city → the idle line is news", Sim.idleIsNews(st, ramp, lj) === true);
  ramp.builtTick = st.tick - 30 * TPS;
  ok("homes full but completed < idleGraceSec ago → still quiet", Sim.idleIsNews(st, ramp, lj) === false);
  const noHuts = town({ builtTick: st.tick - 600 * TPS, buildings: [b("lumberjack", 2, 0)] });
  ok("no Huts at all (0 free homes) → 'build Huts' is news", Sim.idleIsNews(st, noHuts, lj) === true);

  // dream bubble gate
  const dreamT = (pop, ageSec) => town({ builtTick: st.tick - ageSec * TPS,
    pop: { peasants: pop, workers: 0, burghers: 0, aristocrats: 0 } });
  ok("dream: 0-resident fresh city → no tier may dream", Sim.dreamTiers(st, dreamT(0, 5)).length === 0);
  ok("dream: 1 peasant is not enough (> dreamMinPop)", Sim.dreamTiers(st, dreamT(1, 600)).length === 0);
  ok("dream: 4 peasants but a 60 s-old city → wait", Sim.dreamTiers(st, dreamT(4, 60)).length === 0);
  ok("dream: 4 peasants in a settled city → peasants may dream",
    JSON.stringify(Sim.dreamTiers(st, dreamT(4, A.dreamMinAgeSec))) === JSON.stringify(["peasants"]));
  ok("dream: never while under construction",
    Sim.dreamTiers(st, Object.assign(dreamT(4, 600), { built: false })).length === 0);

  // Sim.tick stamps builtTick when a founded city finishes construction
  const fresh = town({ built: false, _buildT: 0, stock: Object.assign({}, CONFIG.town.startStock) });
  const sim = { towns: [fresh], carts: [], tick: 0 };
  let n = 0;
  while (fresh.built === false && n++ < 200) Sim.tick(sim);
  ok("Sim.tick stamps town.builtTick on completion", fresh.built === true && fresh.builtTick === sim.tick,
    fresh.builtTick + " vs " + sim.tick);
}

console.log(`alerts.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
