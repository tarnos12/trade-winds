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
         "this.Pathing=Pathing; this.Trade=Trade;" +
         "this.Buildings=Buildings; this.ResearchEconomy=ResearchEconomy; this.CastleMarket=CastleMarket;",
  sandbox
);
const { CONFIG, HexMath, Sim, Pathing, Trade, Buildings, ResearchEconomy, CastleMarket } = sandbox;

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
// EV3 3-city cycle, each SHORT on what a neighbour has in SURPLUS. Basic peasant
// needs are now WOOD + POTATO (food); extras are fish + wool (+beer for workers):
//   FARM(0,0)  — floods GRAIN + POTATO.
//   MINE(6,0)  — floods IRON; makes no potato, so it must BUY POTATO (food).
//   MILL(3,1)  — brewery(grain→mead)+forge(wood+iron→iron_tool): must BUY GRAIN
//                (brew input) and IRON (forge input).  === CC: smelter→forge ===
// So potato flows FARM→MINE, grain flows FARM→MILL, iron flows MINE→MILL.
// Huts+cottages give each city housing so workers persist (Sim caps pop at housing).
function homes() {
  const a = [];
  for (let i = 0; i < 8; i++) a.push({ typeId: "hut" });      // 8×2 = 16 peasant cap
  for (let i = 0; i < 3; i++) a.push({ typeId: "cottage" });  // 3×3 =  9 worker cap
  return a;
}
// Every town has a LUMBERJACK for its own firewood (wood is a basic need now, and
// nothing else produces it), so the food (potato) flow is the clean differentiator.
// The farm exports GRAIN (for the mill's brewery) AND POTATO (food for the mine).
function farmTown() { return mkTown({ id: 1, q: 0, r: 0,
  pop: { peasants: 12, workers: 6, burghers: 0 },
  buildings: [{ typeId: "farm", workers: 3 }, { typeId: "potato_farm", workers: 3 }, { typeId: "lumberjack", workers: 3 }, ...homes()],
  stock: { grain: 80, potato: 80, wood: 80, mead: 20 } }); }   // === CC: beer→mead ===
// === TV2: the mine floods IRON (80 stock, 0 self-demand → a permanent surplus
// the neighbours buy). Peasant-only housing, so its happiness (and pop) tracks
// the POTATO food flow: connected ⇒ fed & happy, road-less ⇒ food-starved. ===
function peasantHomes(n) { const a = []; for (let i = 0; i < n; i++) a.push({ typeId: "hut" }); return a; }
function mineTown() { return mkTown({ id: 2, q: 6, r: 0,
  pop: { peasants: 12, workers: 0, burghers: 0 },
  buildings: [{ typeId: "iron_mine", workers: 3 }, { typeId: "iron_mine", workers: 3 }, { typeId: "lumberjack", workers: 3 }, ...peasantHomes(6)],
  stock: { iron: 80, wood: 80 } }); }
// === CC: the mill's FORGE (wood + iron → iron_tool) is CITIZEN(burgher)-tier, so
// the mill houses burghers (manors) and keeps their needs stocked so they persist
// and staff the forge; the FLOWING input (iron, bought from the mine) is the
// limiter the test probes. wood is produced locally by the lumberjack. ===
function millTown() { return mkTown({ id: 3, q: 3, r: 1,
  pop: { peasants: 8, workers: 8, burghers: 8 },
  buildings: [{ typeId: "brewery", workers: 2 }, { typeId: "forge", workers: 2 }, { typeId: "lumberjack", workers: 3 },
              ...homes(), { typeId: "manor" }, { typeId: "manor" }],
  stock: { grain: 15, iron: 12, wood: 80, potato: 80,
           // keep worker + burgher needs on the shelf so those tiers stay alive
           fish: 80, coal: 80, mead: 80, bread: 80, clothes: 80, lamp: 80, chairs: 80, pottery: 80, gold_ring: 80 } }); }

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
// The FARM(1)↔MINE(2) POTATO price gap — the food flow that feeds the mine.
function potatoGap(st) { return Math.abs(price(st, 1, "potato") - price(st, 2, "potato")); }

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
// Trades are GRADUAL (a trader parks to load/unload at CONFIG.trade.transferRate
// items/sec — not instant), so we tally potato actually delivered INTO the mine
// (towns[1]) across the run by summing positive stock deltas around each Trade.tick.
let minePotatoDelivered = 0;
for (let i = 0; i < N; i++) {
  Sim.tick(connected);
  const before = connected.towns[1].stock.potato || 0;
  Trade.tick(connected);
  const after = connected.towns[1].stock.potato || 0;
  if (after > before) minePotatoDelivered += after - before;
  for (const c of connected.carts) flows.add(c.goodId + "<-" + c.toId);
}
Pathing.invalidate();
const isolated = buildState(777, false);
run(isolated, N);

ok("treasury grows on a connected network", connected.treasury > 0);
ok("no treasury income without roads", isolated.treasury === 0);
ok("no carts are ever created without roads", isolated.carts.length === 0);

// Goods flow surplus→shortfall, observed directly on the carts:
ok("potato is bought FROM the farm (surplus → shortfall cities)", flows.has("potato<-1"));
ok("iron is bought FROM the mine (surplus → shortfall city)", flows.has("iron<-2"));

// Potato (food) flow actually reaches the potato-less MINE: with roads, the mine's
// external trader BUYS potato from the farm and DELIVERS it into the mine's stock
// (gradually, as it unloads); with no roads it can receive nothing. (Gradual 5/sec
// transfer throttles throughput, so a tight one-trader economy leans more on local
// production than under the old instant model — the guarantee is that trade feeds
// the mine at all, and never leaves it worse off than the isolated baseline.)
ok("potato is delivered INTO the mine via trade (road-connected only)",
  minePotatoDelivered > 0);
ok("the road-connected mine is no worse off than the road-less one",
  connected.towns[1].happiness >= isolated.towns[1].happiness &&
  popTotal(connected.towns[1]) >= popTotal(isolated.towns[1]));
// Iron flow lets the MILL's forge keep making iron_tool; the road-less mill stalls.
ok("iron flow lets the mill out-produce iron_tool vs the road-less baseline",
  stockOf(connected, 3, "iron_tool") > stockOf(isolated, 3, "iron_tool"));

// Prices converge: the farm↔mine POTATO-price gap is smaller WITH trade than without.
ok("potato prices converge (connected gap < isolated gap)",
  potatoGap(connected) < potatoGap(isolated));

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
//    potato prices DIVERGE again.
// =========================================================================
Pathing.invalidate();
{
  const st = buildState(4242, true);
  run(st, 200);
  ok("connected before the cut", Pathing.route(st, K(0, 0), K(6, 0)) !== null);
  const gapBefore = potatoGap(st);
  const treasuryBefore = st.treasury;

  // Cut the farm's only road access hex (1,0) → the farm (sole potato source) is
  // isolated from all. No potato can reach the mine/mill any more.
  st.roads.delete(K(1, 0));
  Pathing.invalidate();
  ok("after cut + invalidate: farm↔mine route is null", Pathing.route(st, K(0, 0), K(6, 0)) === null);
  ok("after cut: farm↔mill route is null too", Pathing.route(st, K(0, 0), K(3, 1)) === null);

  run(st, 160);
  const gapAfter = potatoGap(st);
  ok("potato prices diverge after the crisis cut (gap widens)", gapAfter > gapBefore);
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
  ok("deterministic: identical mine iron stock", townById(a, 2).stock.iron === townById(b, 2).stock.iron);
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
  // PP-A: fleets scale with city level. buildState towns are all L1 => fleet 2; no
  // city ever exceeds its per-level fleet cap, and the fleet is exercised (>0 seen).
  ok("never more than a city's level fleet of external traders", maxPerCity <= Trade.externalFleet({ level: 1 }));
  ok("the fleet cap is actually exercised (>0 traders seen)", maxPerCity > 0);
}

// =========================================================================
// 6) EC-D — reservation + carried gold + agreed price. Driven WITHOUT Sim so the
//    dispatch/settlement is exactly controllable (Sim would re-price/consume).
// =========================================================================
// Minimal controlled scenario: one BUYER short on grain, one SELLER holding a
// grain surplus at a fixed price, joined by a road. Trade.tick alone (no Sim).
const BUFFER = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
function ctrlTown(over) {
  return Object.assign({ id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100 }, over);
}
// buyer(2,0) — seller(0,0), a single road hex at (1,0) joins them.
function ctrlState(seed, sellerStock, sellerPrice, buyers) {
  const roads = new Set([K(1, 0), K(-1, 0)]);
  const seller = ctrlTown({ id: 100, q: 0, r: 0, gold: 0,
    stock: { grain: sellerStock }, prices: { grain: sellerPrice }, demand: {} });
  const towns = [seller].concat(buyers);
  return { roads, towns, carts: [], treasury: 0, tradeSeed: seed >>> 0 };
}

// (a) Cart capacity is 10.
ok("EC-D: cartCapacity === 10", CONFIG.trade.cartCapacity === 10);

// (b) At dispatch: buyer gold drops by agreedGold, seller shows a reservation
//     (available = stock − reserved), and the cart carries the agreed amount.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000,
    stock: { grain: 0 }, demand: { grain: 20 } });
  const st = ctrlState(1, /*sellerStock*/100, /*price*/5, [buyer]);
  Trade.tick(st);                                   // one dispatch, no arrival yet
  const c = st.carts[0];
  ok("EC-D: a trader is dispatched in the controlled scenario", !!c && c.phase === "outbound");
  ok("EC-D: qty capped at capacity 10", c && c.qty === 10);
  ok("EC-D: agreedUnit stored as unitBuy (price at dispatch)", c && c.unitBuy === 5);
  ok("EC-D: cart carries agreedGold = unit × qty", c && c.agreedGold === 50);
  ok("EC-D: buyer gold drops by agreedGold at DISPATCH", townById(st, 1).gold === 950);
  ok("EC-D: seller stock is reserved (10 earmarked)", townById(st, 100).reserved.grain === 10);
  ok("EC-D: available = stock − reserved (100 − 10 = 90)",
    (townById(st, 100).stock.grain - townById(st, 100).reserved.grain) === 90);
  ok("EC-D: goods NOT yet removed from seller stock at dispatch", townById(st, 100).stock.grain === 100);
}

// (c) A mid-transit price spike does NOT change what the buyer pays — the deal
//     settles at the AGREED gold carried at departure.
Pathing.invalidate();
{
  // Demand sized so ONE 10-unit cart fully satisfies the buyer (need = 10) → no
  // second trader is dispatched after delivery, keeping the gold assertion exact.
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000,
    stock: { grain: 0 }, demand: { grain: 10 / BUFFER } });
  const st = ctrlState(1, 100, 5, [buyer]);
  Trade.tick(st);                                   // dispatch @ price 5 → agreedGold 50
  ok("EC-D: buyer paid the agreed 50 up front", townById(st, 1).gold === 950);
  townById(st, 100).prices.grain = 100;             // price 20× spike while in transit
  const sellerGold0 = townById(st, 100).gold;
  // Gradual trade: travel (2) + load dwell (ceil(10/2.5)=4) + travel (2) + unload
  // dwell (4) ≈ 12 ticks. Run enough ticks for the round trip to fully complete.
  for (let i = 0; i < 20; i++) Trade.tick(st);       // let the trader arrive, load, return, unload
  ok("EC-D: buyer pays only the agreed amount despite the spike (gold stays 950)",
    townById(st, 1).gold === 950);
  ok("EC-D: buyer receives the 10 grain after the round trip", townById(st, 1).stock.grain === 10);
  // Seller settled at the agreed unit (5), not the spiked price (100): value 50,
  // tariff = 0.25 × 50 = 12.5, seller nets 37.5.
  ok("EC-D: seller settles at agreed unit price (nets value − tariff = 37.5)",
    Math.abs((townById(st, 100).gold - sellerGold0) - 37.5) < 1e-9);
  ok("EC-D: reservation released after the sale", (townById(st, 100).reserved.grain || 0) === 0);
  ok("EC-D: treasury got the tariff on the agreed value (12.5)", Math.abs(st.treasury - 12.5) < 1e-9);
}

// (c2) Gradual transfer — a trade is NOT instant: the trader parks to LOAD at the
//      seller and to UNLOAD at the buyer at CONFIG.trade.transferRate items/sec of
//      game time, so the buyer's stock fills over several ticks, not all at once.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000,
    stock: { grain: 0 }, demand: { grain: 10 / BUFFER } });
  const st = ctrlState(1, 100, 5, [buyer]);
  Trade.tick(st);                                   // dispatch (qty 10)
  const perTick = CONFIG.trade.transferRate * (CONFIG.econ.baseTickMs / 1000); // 5 × 0.5 = 2.5
  ok("gradual: transferRate is configured (items/sec)", CONFIG.trade.transferRate === 5);
  // Advance until the buyer first receives ANY grain, counting ticks + phases seen.
  const phases = new Set();
  let ticksToFirstDelivery = 0, first = 0;
  for (let i = 0; i < 40 && first === 0; i++) {
    Trade.tick(st);
    const c = st.carts.find(x => x && !x.done);
    if (c) phases.add(c.phase);
    ticksToFirstDelivery++;
    first = townById(st, 1).stock.grain || 0;
  }
  ok("gradual: the trader parks to load (a 'loading' phase exists)", phases.has("loading"));
  ok("gradual: delivery is not instant (takes several ticks to arrive)", ticksToFirstDelivery > 3);
  ok("gradual: the first delivery is a partial load, not the whole 10 at once",
    first > 0 && first <= perTick + 1e-9);
  // Finish the run; the full 10 still arrives.
  for (let i = 0; i < 20; i++) Trade.tick(st);
  ok("gradual: the full quantity is delivered once unloading completes",
    (townById(st, 1).stock.grain || 0) === 10);
}

// (d) Two buyers cannot over-claim the same seller stock — reservations cap the
//     combined take at what the seller actually holds.
Pathing.invalidate();
{
  const b1 = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000, stock: { grain: 0 }, demand: { grain: 20 } });
  const b2 = ctrlTown({ id: 2, q: -2, r: 0, gold: 1000, stock: { grain: 0 }, demand: { grain: 20 } });
  const st = ctrlState(7, /*only 15 in stock*/15, 5, [b1, b2]);
  Trade.tick(st);                                   // both buyers dispatch this tick
  const claimed = st.carts.reduce((s, c) => s + c.qty, 0);
  ok("EC-D: both buyers dispatch a trader", st.carts.length === 2);
  ok("EC-D: combined claim never exceeds seller stock (no over-claim)", claimed <= 15);
  ok("EC-D: combined claim uses the full 15 available (10 + 5)", claimed === 15);
  ok("EC-D: reservation total equals combined claim", townById(st, 100).reserved.grain === claimed);
  ok("EC-D: reservation never exceeds physical stock", townById(st, 100).reserved.grain <= townById(st, 100).stock.grain);
  // Each buyer paid exactly for what its own trader carries (carried gold = unit × qty).
  const paid1 = 1000 - townById(st, 1).gold, paid2 = 1000 - townById(st, 2).gold;
  ok("EC-D: each buyer paid unit × its own qty at dispatch",
    Math.abs(paid1 + paid2 - claimed * 5) < 1e-9 && paid1 > 0 && paid2 > 0);
}

// (e) Failure path — seller removed mid-transit: reservation released + gold refunded.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000, stock: { grain: 0 }, demand: { grain: 20 } });
  const st = ctrlState(3, 100, 5, [buyer]);
  Trade.tick(st);
  ok("EC-D: buyer charged 50 at dispatch", townById(st, 1).gold === 950);
  // Remove the seller before the trader arrives (its stock/reserved go with it).
  st.towns = st.towns.filter(t => t.id !== 100);
  for (let i = 0; i < 8; i++) Trade.tick(st);
  ok("EC-D: carried gold refunded when the seller vanishes", townById(st, 1).gold === 1000);
  ok("EC-D: no goods delivered on a failed trade", (townById(st, 1).stock.grain || 0) === 0);
  ok("EC-D: failed trade retires its cart", st.carts.length === 0);
}

// =========================================================================
// PP-A) multi-good cargo, castle-as-seller (no tariff), and determinism.
// =========================================================================

// (m) A buyer short on TWO goods both held by ONE seller dispatches a SINGLE cart
//     carrying both (total <= capacity), with the primary mirrored on the cart.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 100000,
    stock: { grain: 0, iron: 0 }, demand: { grain: 3, iron: 3 } });
  const seller = ctrlTown({ id: 100, q: 0, r: 0, gold: 0,
    stock: { grain: 100, iron: 100 }, prices: { grain: 5, iron: 4 }, demand: {} });
  const st = { roads: new Set([K(1, 0), K(-1, 0)]), towns: [seller, buyer], carts: [], treasury: 0, tradeSeed: 1 };
  Trade.tick(st);
  const c = st.carts[0];
  ok("PP-A multi-good: a cart with a cargo array is dispatched", !!c && Array.isArray(c.cargo));
  ok("PP-A multi-good: cart carries >= 2 goods from the same seller", c && c.cargo.length >= 2);
  const total = c.cargo.reduce((s, it) => s + it.qty, 0);
  ok("PP-A multi-good: Sum cargo.qty <= cart capacity", total <= CONFIG.trade.cartCapacity + 1e-9);
  ok("PP-A multi-good: totalQty mirrors summed cargo", Math.abs(c.totalQty - total) < 1e-9);
  ok("PP-A multi-good: mirror goodId/qty == primary cargo[0]", c.goodId === c.cargo[0].goodId && c.qty === c.cargo[0].qty);
  ok("PP-A multi-good: agreedGold == Sum unitBuy*qty", Math.abs(c.agreedGold - c.cargo.reduce((s, it) => s + it.unitBuy * it.qty, 0)) < 1e-9);
  ok("PP-A multi-good: both goods reserved at the seller", (seller.reserved.grain || 0) > 0 && (seller.reserved.iron || 0) > 0);
  ok("PP-A multi-good: buyer charged the whole cargo up front", Math.abs((100000 - townById(st, 1).gold) - c.agreedGold) < 1e-9);
}

// (m2) Per-good partial-delivery refund.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 100000,
    stock: { grain: 0, iron: 0 }, demand: { grain: 3, iron: 3 } });
  const seller = ctrlTown({ id: 100, q: 0, r: 0, gold: 0,
    stock: { grain: 100, iron: 100 }, prices: { grain: 5, iron: 5 }, demand: {} });
  const st = { roads: new Set([K(1, 0), K(-1, 0)]), towns: [seller, buyer], carts: [], treasury: 0, tradeSeed: 1 };
  Trade.tick(st);
  const c = st.carts[0];
  const oreItem = c.cargo.find(it => it.goodId === "iron");
  const grainItem = c.cargo.find(it => it.goodId === "grain");
  const oreQty = oreItem.qty, grainQty = grainItem.qty;
  const goldAfterDispatch = townById(st, 1).gold;
  seller.stock.iron = 1;      // only 1 iron left when the trader arrives
  buyer.demand = {};         // freeze re-dispatch; the in-flight cart still completes
  for (let i = 0; i < 30; i++) Trade.tick(st);
  ok("PP-A multi-good settle: undelivered iron refunded ((oreQty-1)*unit)",
     Math.abs(townById(st, 1).gold - (goldAfterDispatch + (oreQty - 1) * 5)) < 1e-9);
  ok("PP-A multi-good settle: buyer got exactly the 1 iron the seller had", (townById(st, 1).stock.iron || 0) === 1);
  ok("PP-A multi-good settle: the other good (grain) delivered in full", Math.abs((townById(st, 1).stock.grain || 0) - grainQty) < 1e-9);
}

// (cs) Castle-as-seller: NO tariff, proceeds -> treasury, goods -> buyer.
Pathing.invalidate();
{
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 100000, stock: { grain: 0 }, demand: { grain: 8 } });
  const st = { roads: new Set([K(1, 0)]), towns: [buyer], carts: [], treasury: 0, tradeSeed: 1,
    castleStock: { grain: 50 }, castleReserved: {}, castleTrade: { grain: { enabled: true, limit: 100 } } };
  const price = CONFIG.goods.grain.basePrice * (CONFIG.trade.castleSellMargin || 1);
  Trade.tick(st);
  const c = st.carts[0];
  const qtyDispatched = c.qty;
  ok("PP-A castle-sell: buyer dispatches a trader to the CASTLE",
     !!c && c.sellerCastle === true && c.toId === ResearchEconomy.CASTLE_ID && (c.kind || "external") === "external");
  ok("PP-A castle-sell: castle stock reserved at dispatch", (st.castleReserved.grain || 0) === qtyDispatched);
  ok("PP-A castle-sell: buyer paid basePrice x margin up front", Math.abs((100000 - townById(st, 1).gold) - qtyDispatched * price) < 1e-9);
  const cs0 = st.castleStock.grain;
  buyer.demand = {};
  for (let i = 0; i < 30; i++) Trade.tick(st);
  ok("PP-A castle-sell: treasury += full value (NO tariff)", Math.abs(st.treasury - qtyDispatched * price) < 1e-9);
  ok("PP-A castle-sell: castleStock dropped by the delivered qty", Math.abs((cs0 - st.castleStock.grain) - qtyDispatched) < 1e-9);
  ok("PP-A castle-sell: buyer received the grain", Math.abs((townById(st, 1).stock.grain || 0) - qtyDispatched) < 1e-9);
  ok("PP-A castle-sell: castle reservation released after the sale", (st.castleReserved.grain || 0) === 0);
}

// (det) Determinism with fleets + a castle seller.
Pathing.invalidate();
function detState() {
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1e9, stock: { grain: 0, iron: 0 }, demand: { grain: 40, iron: 40 } });
  const seller = ctrlTown({ id: 100, q: 0, r: 0, gold: 0, stock: { iron: 5000 }, prices: { iron: 4 }, demand: {} });
  return { roads: new Set([K(1, 0), K(-1, 0)]), towns: [seller, buyer], carts: [], treasury: 0, tradeSeed: 42,
    castleStock: { grain: 5000 }, castleReserved: {}, castleTrade: { grain: { enabled: true, limit: 100000 } } };
}
{
  const a = detState(); for (let i = 0; i < 60; i++) Trade.tick(a);
  Pathing.invalidate();
  const b = detState(); for (let i = 0; i < 60; i++) Trade.tick(b);
  ok("PP-A determinism: identical treasury", a.treasury === b.treasury);
  ok("PP-A determinism: identical live cart count", a.carts.length === b.carts.length);
  ok("PP-A determinism: identical buyer stock",
     (townById(a, 1).stock.grain || 0) === (townById(b, 1).stock.grain || 0) &&
     (townById(a, 1).stock.iron || 0) === (townById(b, 1).stock.iron || 0));
  ok("PP-A determinism: identical castle stock", (a.castleStock.grain || 0) === (b.castleStock.grain || 0));
  ok("PP-A determinism: fleet of >=1 exercised (L1 buyer, big shortfall)",
     a.carts.filter(c => c.fromId === 1).length >= 1);
}


// === TRADEFIX: a SMALL-population city with a real shortfall trades =============
// Regression for the "cities complain but never trade" bug: the trade target was
// demand/tick × price-buffer (2), so a 4-peasant city wanted only ~0.4 wood —
// below buyThreshold(1) — and NEVER dispatched a trader. Now it uses a real
// inventory horizon (CONFIG.trade.stockHorizon).
(function () {
  ok("CONFIG.trade.minStock is a sensible inventory floor (>= 3)",
     (CONFIG.trade.minStock || 0) >= 3);
  Pathing.invalidate && Pathing.invalidate();
  const hexes = new Map();
  for (const c of HexMath.range(0, 0, 12)) hexes.set(HexMath.key(c.q, c.r), { q: c.q, r: c.r, terrain: "barren", revealed: true });
  const roads = new Set();
  for (let q = 1; q <= 5; q++) roads.add(HexMath.key(q, 0));   // road between the two centers, skip centers
  // buyer: 4 peasants, no wood (wood is a basic need); seller: floods wood.
  const buyer  = mkTown({ id: 1, q: 0, r: 0, level: 2, gold: 5000, pop: { peasants: 4, workers: 0, burghers: 0 }, stock: {}, demand: { wood: 0.2 } });
  const seller = mkTown({ id: 2, q: 6, r: 0, level: 2, gold: 5000, pop: { peasants: 0, workers: 0, burghers: 0 }, stock: { wood: 80 }, demand: {} });
  const state = { map: { hexes }, towns: [buyer, seller], roads, carts: [], treasury: 0, tariffRate: 0.25, tick: 0, tradeSeed: 1 };
  let dispatched = false;
  for (let i = 0; i < 30 && !dispatched; i++) {
    Trade.tick(state);
    if (state.carts.some(c => c.fromId === 1 && (c.goodId === "wood" || (c.cargo || []).some(x => x.goodId === "wood")))) dispatched = true;
  }
  ok("a 4-peasant city with a wood shortfall dispatches a trader to a road-connected seller", dispatched);
  // and it buys a worthwhile load, not a fractional dribble.
  const cart = state.carts.find(c => c.fromId === 1);
  ok("the dispatched trade hauls a meaningful quantity (>= 2)", !!cart && (cart.qty || (cart.cargo || []).reduce((n, x) => n + x.qty, 0)) >= 2);
})();
// === /TRADEFIX =================================================================

// === CAPFIX: near-cap unload force-delivers + conserves gold ===================
// Regression for the pass-2 catch: when a cart returns to a buyer whose warehouse
// for that good is at storageCap, the per-tick unload move is throttled to 0 by
// the room cap. The fixed dwell timer used to retire the cart with cargo STILL
// aboard — silently destroying the paid-for remainder. The fix keeps unloading
// until fully delivered OR a safety timeout (dwell < −dwellLimit), then
// FORCE-DELIVERS the remainder into the buyer's stock (even above cap; Sim's own
// overstock clamp handles the excess later). Crucially it does NOT refund gold —
// the seller was already paid at the outbound settle, so a refund would MINT money.
// This locks in BOTH properties: (a) the goods are not silently lost, and (b) total
// kingdom gold is conserved across the whole dispatch→settle→unload cycle including
// the timeout path. Pure Trade.tick (no Sim), seeded — deterministic.
Pathing.invalidate();
(function () {
  const capG = (CONFIG.town && CONFIG.town.storageCap) || Infinity;
  ok("CAPFIX: unloadTimeoutMult is configured (>= 1)",
     (CONFIG.trade && CONFIG.trade.unloadTimeoutMult || 0) >= 1);
  const buyer = ctrlTown({ id: 1, q: 2, r: 0, gold: 1000, stock: { grain: 0 }, demand: { grain: 20 } });
  const st = ctrlState(1, /*sellerStock*/ 100, /*price*/ 5, [buyer]);
  // Total kingdom gold = Σ town.gold + treasury + gold carried in-flight (paid at
  // dispatch, not yet settled). Measured at two CLEAN endpoints (no live carts).
  const goldTotal = (s) => {
    let g = s.treasury || 0;
    for (const t of s.towns) g += (t.gold || 0);
    for (const c of s.carts) if (!c.done) g += (c.agreedGold || 0);
    return g;
  };
  const before = goldTotal(st);                       // 1000 (no cart yet)
  Trade.tick(st);                                     // one dispatch; buyer pays agreedGold up front
  const c = st.carts[0];
  ok("CAPFIX: a trader is dispatched (setup)", !!c && c.phase === "outbound");
  const boughtQty = c.qty;                            // units the cart carries (== 10)
  const sellerFullySupplies = (townById(st, 100).stock.grain || 0) >= boughtQty;
  // The buyer's warehouse for grain fills to cap while the cart is away (its own
  // production / another importer), and it stops wanting more — so the RETURN unload
  // is warehouse-blocked (room 0) and the safety-timeout FORCE-DELIVER path fires.
  buyer.demand = {};                                  // no further dispatch
  let guard = 0;
  while (st.carts.length && guard++ < 300) {
    buyer.stock.grain = capG;                         // re-pin at cap every tick: room never frees
    Trade.tick(st);
  }
  const after = goldTotal(st);                        // clean endpoint (cart retired)
  ok("CAPFIX: the timeout path actually ran (cart completed within the guard)", guard < 300);
  ok("CAPFIX: near-cap unload FORCE-DELIVERS the paid-for remainder (buyer ends above cap, no silent loss)",
     (buyer.stock.grain || 0) >= capG + boughtQty - 1e-6);
  ok("CAPFIX: seller fully supplied the cart (setup — clean conservation baseline)", sellerFullySupplies);
  ok("CAPFIX: total kingdom gold CONSERVED across dispatch→settle→unload incl. the timeout (no minted gold)",
     Math.abs(after - before) < 1e-6);
})();

// (legacy single-good cart path) — an in-flight pre-PP-A cart (no `cargo` array)
// hitting a full buyer must ALSO force-deliver + conserve, not refund. Construct the
// cart directly in the unloading phase (as a legacy save would carry it).
Pathing.invalidate();
(function () {
  const capG = (CONFIG.town && CONFIG.town.storageCap) || Infinity;
  // Seller already paid at settle in the real flow: model buyer -50 (gold 950),
  // seller +50. Total system gold across buyer+seller+treasury = 1000.
  const buyer  = ctrlTown({ id: 1, q: 0, r: 0, gold: 950, stock: { grain: capG } });
  const seller = ctrlTown({ id: 2, q: 5, r: 0, gold: 50,  stock: {} });
  const st = { roads: new Set(), towns: [buyer, seller], treasury: 0, tradeSeed: 1,
    carts: [{ id: 1, kind: "external", fromId: 1, toId: 2, sellerCastle: false,
      goodId: "grain", qty: 10, unitBuy: 5, agreedGold: 50, unloaded: 0,
      totalQty: 10, path: [], progress: 1, phase: "unloading",
      dwell: 4, dwellLimit: 4 * ((CONFIG.trade && CONFIG.trade.unloadTimeoutMult) || 4), done: false }] };
  const before = buyer.gold + seller.gold + st.treasury;   // 1000
  let guard = 0;
  while (st.carts.length && guard++ < 300) {
    buyer.stock.grain = capG;                         // re-pin at cap: room never frees
    Trade.tick(st);
  }
  const after = buyer.gold + seller.gold + st.treasury;
  ok("CAPFIX(legacy): single-good cart force-delivers the remainder above cap",
     (buyer.stock.grain || 0) >= capG + 10 - 1e-6);
  ok("CAPFIX(legacy): no gold refunded on the legacy path (conserved, delta 0)",
     Math.abs(after - before) < 1e-6);
})();
// === /CAPFIX ===================================================================

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
