// Headless test for the DESIGN PASS Crown module — pure Give/Take transfers and the
// destroy-city refund rule. Guards the econ-1 exploit (found a city → Take its
// founding purse → Destroy it for a full refund = +1000 treasury per cycle).
// Evals the code between the PURE_CORE markers in index.html — no browser needed.
//   node test/crown.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Crown=Crown; this.Buildings=Buildings; this.Ledger=Ledger;", sandbox);
const { CONFIG, Crown, Buildings } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("  ✗ " + name + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); }
}

const TR = CONFIG.town.transfer;
const AMT = TR.amount;

// ---- 0. config + API --------------------------------------------------------
ok("Crown exposes canTake/take/canGive/give/cityRefund/stampFounding",
  ["canTake", "take", "canGive", "give", "cityRefund", "stampFounding", "activeMod", "normalizeTown"]
    .every(k => typeof Crown[k] === "function"));
ok("CONFIG.town.startGold is 1000 (value unchanged, moved into CONFIG)", CONFIG.town.startGold === 1000);
ok("transfer tunables live in CONFIG.town.transfer",
  TR && TR.amount === 1000 && TR.cooldownTicks === 240 && TR.happyTicks === 120 &&
  TR.takeMinPop === 2 && TR.takeMinAgeTicks === 600);
ok("startGold <= foundCost (the refund rule relies on it)", CONFIG.town.startGold <= CONFIG.town.foundCost);

// Mirrors the real placement path in input.js: charge, makeTown (purse = startGold),
// push, stamp. makeTown itself lives in the DOM shell, so the fields it sets that
// Crown reads are reproduced here.
function found(state, q) {
  const paid = Buildings.foundCost();
  Buildings.chargeFounding(state);
  const town = { id: state.towns.length + 1, q: q || 0, r: 0, level: 1, gold: CONFIG.town.startGold,
                 pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 }, buildings: [],
                 happiness: 50, built: false };
  state.towns.push(town);
  Crown.stampFounding(state, town, paid);
  return town;
}
// Mirrors input.js destroyCityRefund (minus the DOM side effects).
function destroy(state, town) {
  const refund = Crown.cityRefund(town);
  state.towns.splice(state.towns.indexOf(town), 1);
  state.treasury += refund;
  return refund;
}
const settle = (state, town, pop) => { town.built = true; town.pop.peasants = pop; state.tick += TR.takeMinAgeTicks; };

// ---- 1. Take is refused on a fresh / unbuilt / empty city -------------------
{
  const state = { tick: 1000, treasury: 10000, towns: [] };
  const t = found(state);
  ok("founding stamps foundedTick = state.tick", t.foundedTick === 1000);
  ok("founding stamps foundPaid = the foundCost charged", t.foundPaid === CONFIG.town.foundCost);
  ok("founding charges the treasury", state.treasury === 10000 - CONFIG.town.foundCost);

  let r = Crown.canTake(state, t);
  ok("Take refused on an unbuilt city", !r.ok && /no residents to tax yet/.test(r.reason), r);
  ok("take() on an unbuilt city moves nothing", Crown.take(state, t) === false && t.gold === 1000 && state.treasury === 9000);

  t.built = true;
  ok("Take refused on a built 0-pop city", !Crown.canTake(state, t).ok);
  t.pop.peasants = 1.5;
  ok("Take refused below takeMinPop (1.5 < 2)", !Crown.canTake(state, t).ok);
  t.pop.peasants = 3;
  r = Crown.canTake(state, t);
  ok("Take refused inside the post-founding age lock", !r.ok && /no residents to tax yet/.test(r.reason), r);
  state.tick = 1000 + TR.takeMinAgeTicks - 1;
  ok("Take still refused one tick before the lock lifts", !Crown.canTake(state, t).ok);
  state.tick = 1000 + TR.takeMinAgeTicks;
  ok("Take allowed once built, populated and old enough", Crown.canTake(state, t).ok);

  const legacy = { id: 9, gold: 5000, built: true, pop: { peasants: 4 } };   // pre-pass save: no foundedTick
  state.towns.push(legacy);
  ok("a legacy city (no foundedTick) has no age lock", Crown.canTake(state, legacy).ok);
  ok("a town object not in state.towns is refused", !Crown.canTake(state, { gold: 5000, built: true, pop: { peasants: 9 } }).ok);
}

// ---- 2. take / give move gold, tag happiness + cooldown, track takenGold ----
{
  const state = { tick: 0, treasury: 10000, towns: [] };
  const t = found(state);
  settle(state, t, 4);
  const tr0 = state.treasury;
  ok("take() succeeds", Crown.take(state, t) === true);
  ok("take moves amount city → Kingdom", t.gold === 0 && state.treasury === tr0 + AMT);
  ok("take adds to town.takenGold", t.takenGold === AMT);
  const mod = t.happyMods[t.happyMods.length - 1];
  ok("take pushes a −30 happyMod for happyTicks", mod.delta === TR.takeHappy && mod.untilTick === state.tick + TR.happyTicks);
  ok("take starts the cooldown", t.cooldownUntil === state.tick + TR.cooldownTicks);
  ok("take records a −amount ledger transfer", t.ledger && t.ledger.tally.transfers === -AMT);
  const am = Crown.activeMod(state, t);
  ok("activeMod reports −30 with the ticks left", am && am.delta === -30 && am.ticksLeft === TR.happyTicks, am);
  t.gold = 5000;
  ok("Take refused during the cooldown", !Crown.canTake(state, t).ok && Crown.take(state, t) === false);
  ok("Give refused during the cooldown", !Crown.canGive(state, t).ok);
  state.tick += TR.cooldownTicks;
  ok("activeMod clears once the nudge expires", Crown.activeMod(state, t) === null);
  const tr1 = state.treasury;
  ok("give() succeeds after the cooldown", Crown.give(state, t) === true);
  ok("give moves amount Kingdom → city and lowers takenGold", state.treasury === tr1 - AMT && t.gold === 6000 && t.takenGold === 0);
  state.tick += TR.cooldownTicks;
  t.gold = AMT - 1;
  ok("Take refused when the city holds less than amount", !Crown.canTake(state, t).ok);
  state.treasury = AMT - 1;
  ok("Give refused when the Kingdom holds less than amount", !Crown.canGive(state, t).ok);
}

// ---- 3. found → Take → Destroy never nets positive treasury -----------------
{
  const state = { tick: 0, treasury: 10000, towns: [] };
  const start = state.treasury;
  for (let cycle = 0; cycle < 3; cycle++) {
    const t = found(state);
    Crown.take(state, t);                  // refused (unbuilt) — the old exploit's first step
    settle(state, t, 3);
    ok("cycle " + cycle + ": Take allowed after settling", Crown.take(state, t) === true);
    const refund = destroy(state, t);
    ok("cycle " + cycle + ": refund after Take = foundPaid − amount", refund === t.foundPaid - AMT, refund);
  }
  ok("3 found → Take → Destroy cycles never net positive", state.treasury <= start, state.treasury);

  // with buildings (their gold is refunded too, the Take still comes off)
  const s2 = { tick: 0, treasury: 10000, towns: [] };
  const t2 = found(s2);
  const goldBld = Object.keys(CONFIG.buildings).find(id => (CONFIG.buildings[id].cost || {}).gold > 0);
  const bGold = CONFIG.buildings[goldBld].cost.gold;
  t2.buildings.push({ typeId: goldBld, q: 1, r: 0 });
  s2.treasury -= bGold;
  settle(s2, t2, 3);
  Crown.take(s2, t2);
  const ref2 = destroy(s2, t2);
  ok("refund with a building = foundPaid + building gold − taken", ref2 === t2.foundPaid + bGold - AMT, ref2);
  ok("found + build → Take → Destroy nets ≤ 0", s2.treasury <= 10000, s2.treasury);

  // escalating founding costs: the refund uses what was actually paid
  const s3 = { tick: 0, treasury: 10000, towns: [] };
  const t3 = found(s3);
  t3.foundPaid = 2500;
  settle(s3, t3, 3);
  Crown.take(s3, t3);
  ok("refund after Take = foundPaid − 1000 for a non-default foundPaid", Crown.cityRefund(t3) === 1500);

  // repeated Takes past the paid-in total clamp the refund at 0 (never negative)
  t3.takenGold = 99999;
  ok("refund never goes negative", Crown.cityRefund(t3) === 0);

  // the city's remaining purse is NOT refunded
  const s4 = { tick: 0, treasury: 10000, towns: [] };
  const t4 = found(s4);
  t4.gold = 15000;
  ok("a rich city's purse is not refunded on destroy", Crown.cityRefund(t4) === t4.foundPaid);

  // Take then Give restores the full refund; Give then Take nets zero
  const s5 = { tick: 0, treasury: 10000, towns: [] };
  const t5 = found(s5);
  settle(s5, t5, 3);
  Crown.take(s5, t5); s5.tick += TR.cooldownTicks; Crown.give(s5, t5);
  destroy(s5, t5);
  ok("found → Take → Give → Destroy nets exactly 0", s5.treasury === 10000, s5.treasury);
  const s6 = { tick: 0, treasury: 10000, towns: [] };
  const t6 = found(s6);
  settle(s6, t6, 3);
  Crown.give(s6, t6); s6.tick += TR.cooldownTicks; Crown.take(s6, t6);
  destroy(s6, t6);
  ok("found → Give → Take → Destroy nets exactly 0", s6.treasury === 10000, s6.treasury);
}

// ---- 4. legacy saves + normalize --------------------------------------------
{
  const legacy = { buildings: [] };
  ok("legacy city (no foundPaid/takenGold) refunds CONFIG foundCost", Crown.cityRefund(legacy) === CONFIG.town.foundCost);
  const bad = { foundedTick: "x", foundPaid: NaN, takenGold: null };
  Crown.normalizeTown(bad);
  ok("normalizeTown drops non-numeric transfer fields", !("foundedTick" in bad) && !("foundPaid" in bad) && !("takenGold" in bad), bad);
  const good = { foundedTick: 5, foundPaid: 1000, takenGold: -1000 };
  Crown.normalizeTown(good);
  ok("normalizeTown keeps valid fields", good.foundedTick === 5 && good.foundPaid === 1000 && good.takenGold === -1000);
}

console.log("crown.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
