// Headless test for the design-pass CUSTOMS VALUATION + crown ledger (v0.51.32):
//  - the minted tariff is levied on max(sale price, basePrice), so trade in cheap
//    surplus goods still pays the King (CONFIG.trade.customsValuation);
//  - every tariff is attributed to the exporting city's ledger under "crown", and the
//    per-city crown tallies add up to the lifetime stats.taxEarned counter.
// Reuses the 3-city FARM/MINE/MILL cycle from trade.test.js (evaluated from PURE_CORE).
//   node test/customs.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim; this.Trade=Trade; this.Ledger=Ledger;", sandbox);
const { CONFIG, HexMath, Sim, Trade, Ledger } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } }
const K = (q, r) => HexMath.key(q, r);

function mkTown(over) {
  return Object.assign({ id: 1, q: 0, r: 0, level: 1, gold: 100000,
    pop: { peasants: 10, workers: 0, burghers: 0 }, stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100 }, over);
}
const huts = n => Array.from({ length: n }, () => ({ typeId: "hut" }));
// FARM floods potato; MINE has none and must import it (a single clean export flow).
function world() {
  const farm = mkTown({ id: 1, q: 0, r: 0, pop: { peasants: 12, workers: 0, burghers: 0 },
    buildings: [...Array.from({ length: 6 }, () => ({ typeId: "potato_farm", workers: 2 })), { typeId: "lumberjack", workers: 2 }, ...huts(6)],
    stock: { potato: 80, wood: 80 } });
  const mine = mkTown({ id: 2, q: 6, r: 0, pop: { peasants: 20, workers: 0, burghers: 0 },
    buildings: [{ typeId: "lumberjack", workers: 2 }, ...huts(10)], stock: { wood: 80 } });
  const roads = new Set([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]].map(([q, r]) => K(q, r)));
  return { roads, towns: [farm, mine], carts: [], treasury: 0, tradeSeed: 7, tick: 0 };
}
function run(st, n) { for (let i = 0; i < n; i++) { Sim.tick(st); Trade.tick(st); } }
const crownTotal = st => st.towns.reduce((s, t) => {
  const L = Ledger.ensure(t);
  return s + (L.tally.crown || 0) + L.tallyHist.reduce((a, h) => a + (h.crown || 0), 0);
}, 0);

const TICKS = 500;   // < ledgerHist (600) so the ring still holds every sample

CONFIG.trade.customsValuation = false;
const market = world(); run(market, TICKS);
CONFIG.trade.customsValuation = true;
const customs = world(); run(customs, TICKS);

const taxM = (market.stats && market.stats.taxEarned) || 0;
const taxC = (customs.stats && customs.stats.taxEarned) || 0;
ok("potato actually traded (scenario sanity)", ((customs.stats || {}).traded || { byGood: {} }).byGood.potato > 0);
ok("tariff earned under customs valuation", taxC > 0);
ok("customs valuation never pays less than market valuation (" + taxC.toFixed(1) + " ≥ " + taxM.toFixed(1) + ")", taxC >= taxM - 1e-9);
ok("customs tariff ≥ rate × basePrice × units traded",
  taxC + 1e-6 >= CONFIG.trade.tariffRate * CONFIG.goods.potato.basePrice * customs.stats.traded.byGood.potato * 0.999);
ok("per-city crown ledger sums to lifetime taxEarned", Math.abs(crownTotal(customs) - taxC) < 1e-6);
ok("the exporter (farm) carries the crown tariff, the importer none",
  crownTotal({ towns: [customs.towns[0]] }) > 0 && crownTotal({ towns: [customs.towns[1]] }) === 0);
ok("crown is not counted in city net gold flow",
  customs.towns.every(t => t.ledger.tallyHist.every(h => Math.abs(h.net - (h.tax + h.sales - h.buys + h.transfers)) < 1e-9)));

console.log(`customs.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
