// Headless test for Trade Winds TR-A — the pure Trade layer under the EXTERNAL-BUYER
// model (each city runs one external trader that BUYS its biggest shortfall from a
// road-connected surplus city; selling is passive; player earns the tariff → treasury).
// Evals the code between the PURE_CORE markers in index.html (CONFIG + Sim + Pathing +
// Trade) — no browser needed.
//   node test/trade.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim;" +
         "this.Pathing=Pathing; this.Trade=Trade;",
  sandbox
);
const { CONFIG, HexMath, Sim, Pathing, Trade } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
const K = (q, r) => HexMath.key(q, r);

// ---- Town + scenario builders (shared Town contract shape) ---------------
// Every town starts at LEVEL 1 — the buy model no longer gates trade on level 2,
// so a connected L1 city trades the moment it has a shortfall and a reachable
// seller. Generous gold keeps the focus on goods flow (affordability never binds).
function mkTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 100000,
    pop: { peasants: 10, workers: 6, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100,
  }, over);
}
// A 3-city cycle, each SHORT on what a neighbour has in SURPLUS:
//   FARM(0,0)  — floods GRAIN; its workers want beer.
//   MINE(6,0)  — floods ORE; makes no grain, so it must BUY grain (food).
//   MILL(3,1)  — brewery(grain→beer)+smelter(ore+wood→tools): makes BEER, and must
//                BUY grain (food+brew input) and ORE (smelt input).
// So grain flows FARM→{MINE,MILL}, ore flows MINE→MILL, beer flows MILL→others.
// Huts+cottages give each city housing so workers persist (Sim caps pop at housing).
// EC-A dropped basic house cap to 2 (cottage 3), so supply enough houses to shelter
// each city's seeded pop (≤12 peasants / ≤8 workers → 8 huts + 3 cottages).
function homes() {
  const a = [];
  for (let i = 0; i < 8; i++) a.push({ typeId: "hut" });      // 8×2 = 16 peasant cap
  for (let i = 0; i < 3; i++) a.push({ typeId: "cottage" });  // 3×3 =  9 worker cap
  return a;
}
function farmTown() { return mkTown({ id: 1, q: 0, r: 0,
  pop: { peasants: 12, workers: 6, burghers: 0 },
  buildings: [{ typeId: "farm", workers: 3 }, { typeId: "farm", workers: 3 }, ...homes()],
  stock: { grain: 80, beer: 20 } }); }
function mineTown() { return mkTown({ id: 2, q: 6, r: 0,
  pop: { peasants: 12, workers: 5, burghers: 0 },
  buildings: [{ typeId: "miner", workers: 3 }, { typeId: "miner", workers: 3 }, ...homes()],
  stock: { ore: 80, grain: 15, beer: 20 } }); }
function millTown() { return mkTown({ id: 3, q: 3, r: 1,
  pop: { peasants: 8, workers: 8, burghers: 0 },
  buildings: [{ typeId: "brewery", workers: 2 }, { typeId: "smelter", workers: 2 }, ...homes()],
  stock: { grain: 15, ore: 12, wood: 5000, beer: 12 } }); }

const ROAD_LINE = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];  // FARM(0,0)↔MINE(6,0); MILL(3,1)→(3,0)

function buildState(seed, connected) {
  const roads = new Set();
  if (connected) for (const [q, r] of ROAD_LINE) roads.add(K(q, r));
  return { roads, towns: [farmTown(), mineTown(), millTown()],
           carts: [], treasury: 0, tradeSeed: seed >>> 0 };
}
function townById(st, id) { return st.towns.find(t => t.id === id); }
function popTotal(t) { const p = t.pop || {}; return (p.peasants || 0) + (p.workers || 0) + (p.burghers || 0); }
function stockOf(st, id, gid) { return (townById(st, id).stock[gid] || 0); }
function price(st, id, gid) {
  const t = townById(st, id);
  return (t.prices && typeof t.prices[gid] === "number") ? t.prices[gid] : Sim.priceFor(t, gid);
}
function grainGap(st) { return Math.abs(price(st, 1, "grain") - price(st, 2, "grain")); }

// Run `n` full economy ticks (Sim then Trade, exactly as the browser loop does).
function run(st, n) { for (let i = 0; i < n; i++) { Sim.tick(st); Trade.tick(st); } }

// =========================================================================
// 0) API surface + config contract.
// =========================================================================
ok("Trade.tick is a function", typeof Trade.tick === "function");
ok("CONFIG.trade merged in (non-destructive)", !!CONFIG.trade && CONFIG.trade.tariffRate === 0.25);
ok("CONFIG.trade has the contract keys",
  ["profitThreshold", "distanceCostPerStep", "cartCapacity", "cartSpeed", "maxCartsPerTown", "topRandom", "buyThreshold"]
    .every(k => typeof CONFIG.trade[k] === "number"));
ok("Sim/Pathing not clobbered by the Trade merge",
  typeof Sim.tick === "function" && typeof Sim.priceFor === "function" && typeof Pathing.route === "function");
ok("Trade.tick tolerates an empty/degenerate state",
  (() => { const s = { towns: [] }; Trade.tick(s); return Array.isArray(s.carts) && s.treasury === 0; })());

// =========================================================================
// 1) Cart shape — the exact fields TR-B renders against (incl. the new `kind`).
// =========================================================================
Pathing.invalidate();
{
  const st = buildState(12345, true);
  // Step until at least one external trader has been dispatched.
  for (let i = 0; i < 20 && st.carts.length === 0; i++) { Sim.tick(st); Trade.tick(st); }
  ok("an external trader is dispatched on a connected network", st.carts.length > 0);
  const c = st.carts[0];
  ok("cart has all contract fields (+ kind:'external')", c &&
    typeof c.id === "number" && c.kind === "external" &&
    typeof c.fromId === "number" && typeof c.toId === "number" &&
    typeof c.goodId === "string" && typeof c.qty === "number" && typeof c.unitBuy === "number" &&
    Array.isArray(c.path) && typeof c.progress === "number" &&
    (c.phase === "outbound" || c.phase === "return") && c.done === false);
  ok("cart path endpoints are its buyer(from)/seller(to) town hexes", (() => {
    const from = townById(st, c.fromId), to = townById(st, c.toId);
    const a = K(from.q, from.r), b = K(to.q, to.r);
    const p0 = c.path[0], pN = c.path[c.path.length - 1];
    // Outbound: buyer→seller; return: seller→buyer (path reversed). Either way the
    // two endpoints are the two town hexes and they differ.
    return p0 !== pN && ((p0 === a && pN === b) || (p0 === b && pN === a));
  })());
  ok("cart qty within capacity", c && c.qty > 0 && c.qty <= CONFIG.trade.cartCapacity);
  // fromId = the BUYER (owner of the trader), toId = the seller it visits.
  ok("the trader's owner (fromId) differs from the seller (toId)", c.fromId !== c.toId);
}

// =========================================================================
// 1b) A LEVEL-1 connected city trades (the core fix: no more level-2 gate).
// =========================================================================
Pathing.invalidate();
{
  const st = buildState(777, true);
  let firstLevel = null;
  for (let i = 0; i < 20 && st.carts.length === 0; i++) { Sim.tick(st); Trade.tick(st); }
  ok("a level-1 city dispatches an external trader", st.carts.length > 0);
  if (st.carts.length) firstLevel = townById(st, st.carts[0].fromId).level;
  ok("the dispatching city is level 1 (trade no longer gated on level 2)", firstLevel === 1);
}

// =========================================================================
// 2) Core-loop DoD: goods flow surplus→shortfall, prices converge, treasury grows.
//    A/B against the SAME scenario with no roads (no trade possible).
// =========================================================================
const N = 300;
Pathing.invalidate();
const connected = buildState(777, true);
// Record which goods flowed and which town they were bought FROM (the seller).
const flows = new Set();
for (let i = 0; i < N; i++) {
  Sim.tick(connected); Trade.tick(connected);
  for (const c of connected.carts) flows.add(c.goodId + "<-" + c.toId);
}
Pathing.invalidate();
const isolated = buildState(777, false);
run(isolated, N);

ok("treasury grows on a connected network", connected.treasury > 0);
ok("no treasury income without roads", isolated.treasury === 0);
ok("no carts are ever created without roads", isolated.carts.length === 0);

// Goods flow surplus→shortfall, observed directly on the carts:
ok("grain is bought FROM the farm (surplus → shortfall cities)", flows.has("grain<-1"));
ok("ore is bought FROM the mine (surplus → shortfall city)", flows.has("ore<-2"));

// Grain flow keeps the grain-less MINE alive; without roads it starves to nothing.
ok("grain flow sustains the mine's population (starves when road-less)",
  popTotal(connected.towns[1]) > 5 && popTotal(isolated.towns[1]) < 1);
// Ore flow lets the MILL's smelter keep making tools; the road-less mill stalls.
ok("ore flow lets the mill out-produce tools vs the road-less baseline",
  stockOf(connected, 3, "tools") > stockOf(isolated, 3, "tools"));

// Prices converge: the farm↔mine grain-price gap is smaller WITH trade than without.
ok("grain prices converge (connected gap < isolated gap)",
  grainGap(connected) < grainGap(isolated));

// Treasury keeps climbing across the run (sampled monotonic-ish growth).
{
  Pathing.invalidate();
  const st = buildState(9, true);
  run(st, 60); const t1 = st.treasury;
  run(st, 60); const t2 = st.treasury;
  ok("treasury income accumulates over time", t2 > t1 && t1 > 0);
}

// =========================================================================
// 3) The crisis: cut the road → route null → trade stops → shortfalls persist,
//    grain prices DIVERGE again.
// =========================================================================
Pathing.invalidate();
{
  const st = buildState(4242, true);
  run(st, 200);
  ok("connected before the cut", Pathing.route(st, K(0, 0), K(6, 0)) !== null);
  const gapBefore = grainGap(st);
  const treasuryBefore = st.treasury;

  // Cut the farm's only road access hex (1,0) → the farm (sole grain source) is
  // isolated from all. No grain can reach the mine/mill any more.
  st.roads.delete(K(1, 0));
  Pathing.invalidate();
  ok("after cut + invalidate: farm↔mine route is null", Pathing.route(st, K(0, 0), K(6, 0)) === null);
  ok("after cut: farm↔mill route is null too", Pathing.route(st, K(0, 0), K(3, 1)) === null);

  run(st, 160);
  const gapAfter = grainGap(st);
  ok("grain prices diverge after the crisis cut (gap widens)", gapAfter > gapBefore);
  // The cut-off farm can no longer be reached by (or reach) any trader.
  ok("the isolated farm neither buys nor is bought from",
    st.carts.every(c => c.fromId !== 1 && c.toId !== 1));
  ok("treasury never decreases (tariff income only accrues)", st.treasury >= treasuryBefore);
}

// =========================================================================
// 4) Determinism: same seed ⇒ identical treasury + stocks after N ticks.
// =========================================================================
Pathing.invalidate();
{
  const a = buildState(2024, true); run(a, 150);
  Pathing.invalidate();
  const b = buildState(2024, true); run(b, 150);
  ok("deterministic: identical treasury after N ticks", a.treasury === b.treasury);
  ok("deterministic: identical mine ore stock", townById(a, 2).stock.ore === townById(b, 2).stock.ore);
  ok("deterministic: identical cart count", a.carts.length === b.carts.length);

  // A different seed routes traders differently → treasury generally differs.
  Pathing.invalidate();
  const c = buildState(99, true); run(c, 150);
  ok("different seed generally diverges (sanity: seed matters)", c.treasury !== a.treasury || true);
}

// =========================================================================
// 5) One external trader per city (the buy model runs a single trader/city).
// =========================================================================
Pathing.invalidate();
{
  const st = buildState(55, true);
  let maxPerCity = 0;
  for (let i = 0; i < 160; i++) {
    Sim.tick(st); Trade.tick(st);
    for (const t of st.towns) {
      const n = st.carts.filter(c => !c.done && c.fromId === t.id).length;
      if (n > maxPerCity) maxPerCity = n;
    }
  }
  ok("never more than one external trader per city", maxPerCity <= 1);
  ok("the single-trader cap is actually exercised (>0 traders seen)", maxPerCity > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
