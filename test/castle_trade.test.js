// Headless test for the design-pass KING BUYS / KING SELLS split (plan item 12).
// castleTrade[gid] is { buy, sell, limit }:
//  - a legacy { enabled } entry (and a v2 save) maps to buy-only — never auto-sell;
//  - the Provisioner / Advanced Provisioner switch on BUYING of their input only;
//  - the castle sells only when "King sells" is ticked, and (while it also buys)
//    only the stock above its buy limit;
//  - castle offers rank after every town offer and are posted only when no town
//    offer can fill the trip;
//  - royal buyers take only a town's exportable stock (above Trade.sellHoldback),
//    so they no longer drain importers;
//  - a 30-min replay of the audit's specialised 3-city network with a Provisioner
//    keeps town-to-town potato trade and the tariff (the castle stopped being the
//    tax-free potato middleman: 15 town trips / 418 tariff before the split).
//   node test/castle_trade.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim; this.Trade=Trade;" +
  "this.Pathing=Pathing; this.Buildings=Buildings; this.ResearchEconomy=ResearchEconomy;" +
  "this.CastleMarket=CastleMarket; this.Provisioner=Provisioner;", sandbox);
const { CONFIG, HexMath, Sim, Trade, Pathing, Buildings, ResearchEconomy, CastleMarket, Provisioner } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } }
const K = (q, r) => HexMath.key(q, r);
const J = v => JSON.stringify(v);

// --- 1. normalize: legacy { enabled } → buy only; new shape is idempotent -----------
{
  const n = CastleMarket.normalize({
    potato: { enabled: true, limit: 40 }, fish: { enabled: false, limit: 10 },
    wood: { buy: false, sell: true, limit: 5 }, junk: 7, iron: { enabled: true, limit: -3 },
  });
  ok("legacy {enabled:true} → {buy:true, sell:false}", J(n.potato) === J({ buy: true, sell: false, limit: 40 }));
  ok("legacy {enabled:false} → both off", J(n.fish) === J({ buy: false, sell: false, limit: 10 }));
  ok("new {buy,sell,limit} shape kept as-is", J(n.wood) === J({ buy: false, sell: true, limit: 5 }));
  ok("non-object entry dropped", !("junk" in n));
  ok("negative limit clamps to 0", n.iron.limit === 0);
  ok("normalize is idempotent", J(CastleMarket.normalize(n)) === J(n));
  ok("flagsOf(undefined) = both off (UI default)", J(CastleMarket.flagsOf(undefined)) === J({ buy: false, sell: false }));
}

// --- 2. save migration v2 → v3 (save.js migrate, evaluated from the build) ----------
{
  const mm = html.match(/  function migrate\(data\) \{[\s\S]*?\n  \}\n/);
  ok("save.js migrate() found in the build", !!mm);
  if (mm) {
    const ctx = { CONFIG, CastleMarket };
    vm.createContext(ctx);
    vm.runInContext(mm[0] + "\nthis.migrate = migrate;", ctx);
    ok("CONFIG.saveVersion bumped to 3", CONFIG.saveVersion === 3);
    const v2 = { saveVersion: 2, castleTrade: { potato: { enabled: true, limit: 40 }, fish: { enabled: false, limit: 50 } } };
    const out = ctx.migrate(v2);
    ok("v2 save migrates (not rejected)", !!out && out.saveVersion === 3);
    ok("v2 {enabled:true} potato → King buys only", out && J(out.castleTrade.potato) === J({ buy: true, sell: false, limit: 40 }));
    ok("v2 {enabled:false} fish → both off", out && J(out.castleTrade.fish) === J({ buy: false, sell: false, limit: 50 }));
    const v1 = ctx.migrate({ saveVersion: 1, castleTrade: { wood: { enabled: true, limit: 9 } } });
    ok("v1 save walks v1→v2→v3", !!v1 && v1.saveVersion === 3 && v1.castleTrade.wood.buy === true && v1.castleTrade.wood.sell === false);
    ok("unknown newer save still rejected", ctx.migrate({ saveVersion: 99 }) === null);
  }
}

// --- 3. Provisioner / Advanced Provisioner set BUY only ------------------------------
function castleMap() {
  const hexes = new Map();
  for (const h of HexMath.range(0, 0, 14)) hexes.set(K(h.q, h.r), { q: h.q, r: h.r, terrain: "barren", revealed: true });
  return { seed: "ct", radius: 14, hexes };
}
{
  const st = { map: castleMap(), roads: new Set(), towns: [], carts: [], treasury: 100000, castleTrade: {} };
  const site = Buildings.castleCompoundFrontier(st).find(h => Buildings.canPlaceProvisioner(st, h.q, h.r).ok);
  const r = site ? Buildings.placeProvisioner(st, site.q, site.r) : { ok: false };
  ok("Provisioner placed", r.ok === true);
  ok("Provisioner: King buys potato, King does NOT sell",
     J(st.castleTrade.potato) === J({ buy: true, sell: false, limit: CONFIG.basicProvisioner.potatoLimit }));
  Buildings.enableCastleBuy(st, "fish", 40);
  ok("enableCastleBuy (Advanced Provisioner path): fish buy-only", J(st.castleTrade.fish) === J({ buy: true, sell: false, limit: 40 }));
  st.castleTrade.wood = { buy: false, sell: true, limit: 5 };
  Buildings.enableCastleBuy(st, "wood", 40);
  ok("enableCastleBuy keeps a player's King-sells tick", st.castleTrade.wood.buy && st.castleTrade.wood.sell && st.castleTrade.wood.limit === 40);
  st.castleTrade.stone = { buy: true, sell: false, limit: 70 };
  Buildings.enableCastleBuy(st, "stone", 40);
  ok("enableCastleBuy keeps an existing buy limit", st.castleTrade.stone.limit === 70);
}

// --- 4. Castle selling: flag, limit, last resort -------------------------------------
function mkTown(over) {
  return Object.assign({ id: 1, q: 0, r: 0, level: 1, gold: 100000,
    pop: { peasants: 10, workers: 0, burghers: 0 }, stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100 }, over);
}
const castleCarts = st => st.carts.filter(c => c.sellerCastle).length;
Pathing.invalidate();
{
  // a starving grain buyer, no town seller, a castle full of grain
  const mk = (flags) => ({ roads: new Set([K(1, 0)]), carts: [], treasury: 0, tradeSeed: 1,
    towns: [mkTown({ id: 1, q: 2, r: 0, stock: { grain: 0 }, demand: { grain: 8 } })],
    castleStock: { grain: 50 }, castleReserved: {}, castleTrade: { grain: Object.assign({ limit: 40 }, flags) } });
  let st = mk({ buy: true, sell: false });
  for (let i = 0; i < 60; i++) Trade.tick(st);
  ok("sell=false: the castle never sells (60 ticks, starving buyer)", castleCarts(st) === 0 && st.castleStock.grain === 50);
  st = mk({ enabled: true });
  for (let i = 0; i < 60; i++) Trade.tick(st);
  ok("legacy un-normalized {enabled:true}: no castle sales either", castleCarts(st) === 0);
  st = mk({ buy: true, sell: true });
  Trade.tick(st);
  const c = st.carts.find(x => x.sellerCastle);
  ok("buy+sell: castle sells", !!c);
  ok("buy+sell: sells only stock above the buy limit (≤ 50 − 40)", !!c && c.qty <= 10 && (st.castleReserved.grain || 0) <= 10);
  st = mk({ buy: true, sell: true }); st.castleStock.grain = 40;
  for (let i = 0; i < 30; i++) Trade.tick(st);
  ok("buy+sell at the limit: nothing to sell", castleCarts(st) === 0);
  st = mk({ buy: false, sell: true });
  Trade.tick(st);
  ok("sell only: the whole stock is for sale", st.carts.some(x => x.sellerCastle));
}
Pathing.invalidate();
{
  // a town seller that can fill the trip vs. a castle with a huge sell stock
  const mk = (sellerStock) => ({ roads: new Set([K(1, 0), K(-1, 0)]), carts: [], treasury: 0, tradeSeed: 5,
    towns: [mkTown({ id: 100, q: -2, r: 0, stock: { grain: sellerStock }, prices: { grain: 50 }, demand: {} }),
            mkTown({ id: 1, q: 2, r: 0, stock: { grain: 0 }, demand: { grain: 8 } })],
    castleStock: { grain: 5000 }, castleReserved: {}, castleTrade: { grain: { buy: false, sell: true, limit: 0 } } });
  let st = mk(500);
  const sellers = new Set();   // settled carts leave st.carts — record every trader's seller
  for (let i = 0; i < 40; i++) { Trade.tick(st); for (const c of st.carts) sellers.add(c.sellerCastle ? "castle" : c.toId); }
  ok("castle is last resort: a town that can fill the trip wins even at a far higher price",
     !sellers.has("castle") && sellers.has(100) && st.castleStock.grain === 5000);
  st = mk(2);   // the town can't fill a cart
  Trade.tick(st);
  ok("castle steps in when no town offer covers the need", castleCarts(st) === 1);
}

// --- 5. Royal buyers respect the town's sell hold-back -------------------------------
Pathing.invalidate();
{
  const huts = n => Array.from({ length: n }, () => ({ typeId: "hut", built: true }));
  // an importer: huts eat potato, no potato farm ⇒ structural net consumer
  const importer = mkTown({ id: 1, q: 3, r: 0, stock: { potato: 30 }, demand: { potato: 0.2 }, buildings: huts(4) });
  ok("Trade.sellHoldback exported; importer holds all its potato", Trade.sellHoldback(importer, "potato") >= 1e8);
  const st = { roads: new Set([K(1, 0), K(2, 0)]), towns: [importer], carts: [], treasury: 100000, castleMarketSeed: 3,
    castleStock: {}, castleTrade: { potato: { buy: true, sell: false, limit: 40 } } };
  for (let i = 0; i < 20; i++) CastleMarket.tick(st);
  ok("royal buyers leave an importer's potato alone", st.carts.length === 0 && importer.stock.potato === 30);
  // an exporter (farms) sells its surplus above the hold-back
  const exporter = mkTown({ id: 2, q: 3, r: 0, stock: { potato: 30 }, demand: { potato: 0.2 },
    buildings: [{ typeId: "potato_farm", built: true }, { typeId: "potato_farm", built: true }, ...huts(1)] });
  const st2 = { roads: new Set([K(1, 0), K(2, 0)]), towns: [exporter], carts: [], treasury: 100000, castleMarketSeed: 3,
    castleStock: {}, castleTrade: { potato: { buy: true, sell: false, limit: 40 } } };
  CastleMarket.tick(st2);
  const hold = Trade.sellHoldback(exporter, "potato");
  const bought = st2.carts.reduce((s, c) => s + c.qty, 0);
  ok(`royal buyers take an exporter's surplus only down to its hold-back (${bought} ≤ 30 − ${hold})`,
     bought > 0 && bought <= 30 - hold + 1e-9);
}

// --- 6. 30-min replay: the audit's specialised network with a Provisioner ------------
// Mirrors audit/trade/castle.js (real map seed trade1) on a controlled barren map:
// wood city, potato city, mixed city, roads to the castle and between neighbours.
function network(prov) {
  const st = { map: castleMap(), roads: new Set(), towns: [], carts: [], treasury: 20000, tradeSeed: 0x5bd1e995 | 0,
    castleStock: Object.assign({}, CONFIG.researchEconomy.starterStock), castleTrade: {}, castleReserved: {},
    castleMarketSeed: 0x2545f491 | 0, researchSeed: 7, tick: 0 };
  const CENTERS = [{ q: 7, r: 0 }, { q: 0, r: 7 }, { q: -7, r: 7 }];
  const PLAN = [["lumberjack", "lumberjack"], ["potato_farm", "potato_farm"], ["lumberjack", "potato_farm"]];
  CENTERS.forEach((c, i) => {
    const t = mkTown({ id: i + 1, q: c.q, r: c.r, gold: 1000, pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
      stock: Object.assign({}, CONFIG.town.startStock), happiness: 50 });
    const nb = HexMath.neighbors(c.q, c.r);
    PLAN[i].concat(["hut", "hut", "hut", "hut"]).forEach((ty, k) =>
      t.buildings.push({ typeId: ty, q: nb[k].q, r: nb[k].r, workers: 0, built: true, delivered: {}, closedSlots: 0,
        priority: false, upgradeLevel: 1, pendingUpgrade: null }));
    for (const g of Object.keys(CONFIG.goods)) Sim.priceFor(t, g);
    st.towns.push(t);
  });
  const line = (a, b) => { const n = HexMath.dist(a.q, a.r, b.q, b.r);
    for (let i = 1; i < n; i++) { const h = HexMath.hexRound(a.q + (b.q - a.q) * i / n, a.r + (b.r - a.r) * i / n); st.roads.add(K(h.q, h.r)); } };
  for (const c of CENTERS) line({ q: 0, r: 0 }, c);
  line(CENTERS[0], CENTERS[1]); line(CENTERS[1], CENTERS[2]);
  Pathing.invalidate();
  if (prov) {
    const site = Buildings.castleCompoundFrontier(st).find(h => Buildings.canPlaceProvisioner(st, h.q, h.r).ok);
    if (site) Buildings.placeProvisioner(st, site.q, site.r);
  }
  const seen = new Set(), tally = { townPotatoTrips: 0, castleSales: 0, royalPotato: 0 };
  const tre0 = st.treasury;
  for (let i = 0; i < 120 * 30; i++) {
    Sim.tick(st); Trade.tick(st); ResearchEconomy.tick(st); CastleMarket.tick(st); Provisioner.tick(st);
    for (const c of st.carts) if (!seen.has(c.id)) {
      seen.add(c.id);
      if (c.kind === "external" && c.sellerCastle) tally.castleSales++;
      else if (c.kind === "external") { for (const it of (c.cargo || [])) if (it.goodId === "potato") tally.townPotatoTrips++; }
      else if (c.kind === "castle" && c.goodId === "potato") tally.royalPotato += c.qty;
    }
  }
  tally.tariff = (st.stats && st.stats.taxEarned) || 0;
  tally.treasuryDelta = st.treasury - tre0;
  tally.provisionerBuilt = !!st.provisionerBuilding;
  tally.provisions = st.provisions;
  return tally;
}
const base = network(false), prov = network(true);
ok("replay: Provisioner placed", prov.provisionerBuilt);
ok(`replay: the castle never resells potato (${prov.castleSales} castle sales)`, prov.castleSales === 0);
ok(`replay: royal buyers still feed the Provisioner (${prov.royalPotato} potato bought)`, prov.royalPotato > 0);
ok(`replay: town-to-town potato trips survive the Provisioner (${prov.townPotatoTrips} vs ${base.townPotatoTrips} without)`,
   base.townPotatoTrips > 0 && prov.townPotatoTrips >= 0.8 * base.townPotatoTrips);
ok(`replay: tariff survives the Provisioner (${prov.tariff.toFixed(0)} vs ${base.tariff.toFixed(0)} without)`,
   base.tariff > 0 && prov.tariff >= 0.8 * base.tariff);
ok("replay is deterministic", J(network(true)) === J(prov));

console.log(`castle_trade.test.js: ${pass} passed, ${fail} failed  ` +
  `(replay: town potato trips ${base.townPotatoTrips}→${prov.townPotatoTrips}, tariff ${base.tariff.toFixed(0)}→${prov.tariff.toFixed(0)}, ` +
  `royal potato ${prov.royalPotato}, treasury Δ ${base.treasuryDelta.toFixed(0)}→${prov.treasuryDelta.toFixed(0)})`);
process.exit(fail ? 1 : 0);
