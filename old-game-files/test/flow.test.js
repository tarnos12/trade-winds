// Headless test for Trade Winds — v0.51 resource-flow overview helpers that drive
// the map overlay: Trade.cityGood (per-city sell/buy trend + potential) and
// Trade.goodFlows (live seller→buyer flows from carts).
//   node test/flow.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: PURE_CORE markers not found"); process.exit(1); }
const s = {};
vm.createContext(s);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Trade=Trade; this.State={};", s);
const { Trade } = s;

let pass = 0, fail = 0;
function ok(name, cond, note) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (note ? "  -- " + note : "")); } }
const bld = (t, q, r, w) => ({ typeId: t, q, r, workers: w, built: true });

ok("Trade.cityGood is a function", typeof Trade.cityGood === "function");
ok("Trade.goodFlows is a function", typeof Trade.goodFlows === "function");

// A wood producer (2 lumberjacks) that also eats a little wood ⇒ SELLER of wood.
const c1 = { id: 1, q: 0, r: 0, level: 1, pop: { peasants: 4 }, stock: { wood: 50 }, prices: { wood: 5 },
  buildings: [bld("lumberjack", 0, 1, 2), bld("lumberjack", 0, 2, 2), bld("hut", 1, 0, 0)] };
const w1 = Trade.cityGood({}, c1, "wood");
ok("a wood producer reads as a SELLER (net > 0)", w1.role === "seller" && w1.net > 0, "net=" + w1.net.toFixed(1));
ok("seller carries its stock + price", w1.stock === 50 && w1.price === 5);

// A city with no wood producer but wood-eating population ⇒ BUYER of wood.
const c2 = { id: 2, q: 6, r: 0, level: 1, pop: { peasants: 4 }, stock: {}, prices: { wood: 6 },
  buildings: [bld("potato_farm", 6, 1, 2), bld("hut", 7, 0, 0)] };
const w2 = Trade.cityGood({}, c2, "wood");
ok("a non-producer with wood-eaters reads as a BUYER (net < 0)", w2.role === "buyer" && w2.net < 0, "net=" + w2.net.toFixed(1));

// Latent buyer: no current pop (net 0) but housing that WILL eat wood ⇒ latent buyer.
const c3 = { id: 3, q: 0, r: 0, level: 1, pop: { peasants: 0 }, stock: {}, prices: {},
  buildings: [bld("hut", 0, 1, 0), bld("hut", 0, 2, 0)] };
const w3 = Trade.cityGood({}, c3, "wood");
ok("an empty town with houses is a LATENT buyer (maxNeed > maxProd)", w3.role === "buyer" && w3.latent === true, "latent=" + w3.latent);

// Flows: a buyer's cart returning with wood ⇒ seller(toId) → buyer(fromId).
const st = { carts: [
  { fromId: 2, toId: 1, cargo: [{ goodId: "wood", qty: 8, unloaded: 0 }] },       // C1 sells wood to C2
  { fromId: 1, toId: 2, cargo: [{ goodId: "potato", qty: 5, unloaded: 0 }], sellCargo: [{ goodId: "wood", qty: 3 }] }, // H: C1 sells 3 wood to C2 too
] };
const wf = Trade.goodFlows(st, "wood");
const c1toC2 = wf.filter(f => f.fromId === 1 && f.toId === 2).reduce((s, f) => s + f.units, 0);
ok("goodFlows reports wood flowing from the seller (C1) to the buyer (C2)", c1toC2 === 11, "units " + c1toC2);
ok("goodFlows ignores a good not asked for", Trade.goodFlows(st, "iron").length === 0);

// Trade.goodPlan: intended supply plan (nearest seller → each buyer), independent of
// live carts — so EVERY good with a seller+buyer shows a flow, not just one on a cart.
ok("Trade.goodPlan is a function", typeof Trade.goodPlan === "function");
{
  const towns = [
    { id: 1, q: 0, r: 0, level: 1, built: true, pop: { peasants: 4 }, stock: { wood: 50 }, prices: { wood: 5 },
      buildings: [bld("lumberjack", 0, 1, 2), bld("lumberjack", 0, 2, 2), bld("hut", 1, 0, 0)] },     // wood seller
    { id: 2, q: 6, r: 0, level: 1, built: true, pop: { peasants: 4 }, stock: { potato: 60 }, prices: { potato: 4 },
      buildings: [bld("potato_farm", 6, 1, 2), bld("hut", 7, 0, 0)] },                                 // potato seller, wood buyer
    { id: 3, q: 0, r: 6, level: 1, built: true, pop: { peasants: 2 }, stock: {}, prices: {},
      buildings: [bld("hut", 0, 7, 0)] },                                                              // buys both
  ];
  const st = { towns: towns, carts: [] };
  const woodPlan = Trade.goodPlan(st, "wood");
  ok("goodPlan routes wood from the seller (C1) to both buyers", woodPlan.length >= 2 && woodPlan.every(f => f.fromId === 1),
     JSON.stringify(woodPlan));
  const potPlan = Trade.goodPlan(st, "potato");
  ok("goodPlan routes potato from its seller (C2), not wood's seller", potPlan.length >= 1 && potPlan.every(f => f.fromId === 2),
     JSON.stringify(potPlan));
  ok("goodPlan rates are positive per-minute numbers", woodPlan.every(f => f.rate > 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
