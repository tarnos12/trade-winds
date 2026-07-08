// Headless test for Trade Winds PP-A — the pure city LEDGER (bounded per-town gold
// history + per-tick flow tally) plus its integration hooks in Sim/Trade. Evals the
// code between the PURE_CORE markers in index.html — no browser needed.
//   node test/ledger.test.js
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
         "this.Pathing=Pathing; this.Trade=Trade; this.Ledger=Ledger;",
  sandbox
);
const { CONFIG, HexMath, Sim, Pathing, Trade, Ledger } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
const K = (q, r) => HexMath.key(q, r);
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);

// ---- 0. API surface --------------------------------------------------------
ok("Ledger present with the expected API", Ledger &&
  ["ensure", "normalizeTown", "record", "recordTransfer", "sample", "lastNAverage"].every(k => typeof Ledger[k] === "function"));
ok("CONFIG.town.ledgerHist is configured", typeof CONFIG.town.ledgerHist === "number" && CONFIG.town.ledgerHist > 0);

// ---- 1. ensure / normalize repair malformed ledgers ------------------------
{
  const fresh = {}; Ledger.ensure(fresh);
  ok("ensure creates a well-formed ledger", Array.isArray(fresh.ledger.hist) &&
     fresh.ledger.tally && typeof fresh.ledger.tally.tax === "number" && Array.isArray(fresh.ledger.tallyHist));

  const badStr = { ledger: "x" }; Ledger.normalizeTown(badStr);
  ok("normalizeTown resets a string ledger to a fresh shape",
     Array.isArray(badStr.ledger.hist) && badStr.ledger.hist.length === 0 && !!badStr.ledger.tally);

  const badHist = { ledger: { hist: 5, tally: { tax: 1 } } }; Ledger.normalizeTown(badHist);
  ok("normalizeTown resets a ledger with a non-array hist",
     Array.isArray(badHist.ledger.hist) && badHist.ledger.hist.length === 0);

  const badVals = { ledger: { hist: [1, "nope", 3], tally: {}, tallyHist: [] } }; Ledger.normalizeTown(badVals);
  ok("normalizeTown resets a hist containing non-numbers", badVals.ledger.hist.length === 0);

  const good = { ledger: { hist: [10, 20, 30], tally: { tax: 1, sales: 2, buys: 3, transfers: 0, net: 0 }, tallyHist: [] } };
  Ledger.normalizeTown(good);
  ok("normalizeTown PRESERVES a valid ledger", good.ledger.hist.length === 3 && good.ledger.hist[2] === 30);
}

// ---- 2. sample bounds the gold history ring --------------------------------
{
  const t = { gold: 0 };
  const cap = CONFIG.town.ledgerHist;
  for (let i = 0; i < cap + 50; i++) { t.gold = i; Ledger.sample(t); }
  ok("hist is bounded at ledgerHist", t.ledger.hist.length === cap);
  ok("oldest samples are dropped (ring keeps the latest)", t.ledger.hist[t.ledger.hist.length - 1] === cap + 49);
  ok("tallyHist is bounded too", t.ledger.tallyHist.length === cap);
}

// ---- 3. tally correctness + net + reset semantics --------------------------
{
  const t = { gold: 100 };
  Ledger.record(t, "tax", 7);
  Ledger.record(t, "sales", 5);
  Ledger.record(t, "buys", 3);
  Ledger.recordTransfer(t, +10);
  ok("record accumulates into the live tally", t.ledger.tally.tax === 7 && t.ledger.tally.sales === 5 && t.ledger.tally.buys === 3);
  ok("recordTransfer routes into transfers", t.ledger.tally.transfers === 10);
  ok("an unknown key is ignored", (() => { Ledger.record(t, "bogus", 99); return t.ledger.tally.tax === 7; })());
  // sample computes net = tax + sales − buys + transfers, snapshots it, then resets.
  Ledger.sample(t);
  const snap = t.ledger.tallyHist[t.ledger.tallyHist.length - 1];
  ok("sample computes net = tax + sales − buys + transfers", near(snap.net, 7 + 5 - 3 + 10));
  ok("sample snapshots the flow values", snap.tax === 7 && snap.sales === 5 && snap.buys === 3 && snap.transfers === 10);
  ok("sample RESETS the live tally for the next window", t.ledger.tally.tax === 0 && t.ledger.tally.transfers === 0);
  ok("sample pushed the gold reading", t.ledger.hist[t.ledger.hist.length - 1] === 100);
}

// ---- 4. lastNAverage over the snapshot ring --------------------------------
{
  const t = { gold: 0 };
  for (let i = 1; i <= 5; i++) { Ledger.record(t, "tax", i); Ledger.sample(t); }  // taxes 1..5
  ok("lastNAverage over the last 3 snapshots", near(Ledger.lastNAverage(t, "tax", 3), (3 + 4 + 5) / 3));
  ok("lastNAverage clamps n to available snapshots", near(Ledger.lastNAverage(t, "tax", 999), (1 + 2 + 3 + 4 + 5) / 5));
  ok("lastNAverage of 0 samples is 0", Ledger.lastNAverage(t, "tax", 0) === 0);
}

// ---- 5. Sim integration: people-tax is recorded, gold sampled once per tick -
{
  const t = { id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 6, workers: 0, burghers: 0 },
    stock: { wood: 100, potato: 100, fish: 100, wool: 100 }, prices: {}, demand: {},
    buildings: [{ typeId: "hut", q: 0, r: 3, workers: 0, built: true }, { typeId: "hut", q: 1, r: 3, workers: 0, built: true }],
    happiness: undefined };
  Sim.tick({ towns: [t] });
  ok("Sim records the people-tax into the ledger", t.ledger.tally.tax > 0 && near(t.ledger.tally.tax, t.tierIncome.peasants));
  ok("Sim samples gold exactly once per tick", t.ledger.hist.length === 1);
  const g1 = t.gold;
  Sim.tick({ towns: [t] });
  ok("second tick appends another gold sample", t.ledger.hist.length === 2);
  ok("the second sample reflects gold at tick start (post-prev-tick)", near(t.ledger.hist[1], g1));
}

// ---- 6. Trade integration: a settled sale records sales(seller)+buys(buyer) --
{
  Pathing.invalidate();
  const buyer = { id: 1, q: 2, r: 0, level: 1, gold: 100000,
    pop: { peasants: 0, workers: 0, burghers: 0 }, stock: { grain: 0 }, prices: {}, demand: { grain: 4 }, buildings: [], happiness: 100 };
  const seller = { id: 100, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 }, stock: { grain: 100 }, prices: { grain: 5 }, demand: {}, buildings: [], happiness: 100 };
  const st = { roads: new Set([K(1, 0), K(-1, 0)]), towns: [seller, buyer], carts: [], treasury: 0, tradeSeed: 1 };
  Trade.tick(st);                       // dispatch
  const c = st.carts[0];
  const qty = c.qty, unit = c.unitBuy;
  buyer.demand = {};                    // freeze re-dispatch
  for (let i = 0; i < 30; i++) Trade.tick(st);
  const tariff = CONFIG.trade.tariffRate * unit * qty;
  ok("Trade records the seller's net sale (value − tariff) in its ledger",
     seller.ledger && near(seller.ledger.tally.sales, unit * qty - tariff));
  ok("Trade records the buyer's realized buy (delivered value) in its ledger",
     buyer.ledger && near(buyer.ledger.tally.buys, unit * qty));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
