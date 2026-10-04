// DESIGN PASS #3 — smarter staffing (Sim.staffTown). Locks in:
//   (a) SELF-FEED: a ☆-starred Sawmill added to the m1 city (Lumberjack, Potato Farm,
//       2 Huts = 4 peasants) must not strip the Potato Farm and trap the city at pop 2 /
//       29% happiness (the old two-pass Priority→array-order staffing did exactly that).
//   (b) BLOCKED-LAST: a Lumberjack whose store is full releases its crew to an
//       unstaffed Quarry, so stone actually flows.
//   (c) the building flags + dry-run plan the UI reads, and the CONFIG kill switches.
// Pure-Sim, deterministic, no browser.   node test/staffing.test.js
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
function ok(name, cond, info) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + (info ? "  [" + info + "]" : "")); }
}
const PM = 120;   // ticks per game-minute (2 ticks = 1 game-second)
const POS = [[-1, 1], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [2, -1], [2, 0]];
function mkTown(types) {
  const t = { id: 1, q: 0, r: 0, level: 1, gold: 1000, built: true,
    pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
    stock: Object.assign({}, CONFIG.town.startStock), prices: {}, demand: {}, buildings: [], happiness: 50 };
  types.forEach((id, i) => t.buildings.push({ typeId: id, q: POS[i][0], r: POS[i][1], workers: 0, built: true }));
  return t;
}
const byType = (t, id) => t.buildings.find(b => b.typeId === id);

ok("CONFIG.econ.selfFeedCoverSec = 120 game-seconds", CONFIG.econ.selfFeedCoverSec === 120);
ok("CONFIG.econ.staffBlockedLast is on", CONFIG.econ.staffBlockedLast === true);

// ---------------------------------------------------------------------------
// (a) The m1 city + a starred Sawmill at 4:00 holds pop 4 / ~70% at 20 game-min.
// ---------------------------------------------------------------------------
function runM1(star, minutes) {
  const t = mkTown(["lumberjack", "potato_farm", "hut", "hut"]);
  const st = { towns: [t], tick: 0 };
  let minPopAfter12 = Infinity, minHAfter12 = Infinity, pfSelfFed = false;
  for (let k = 0; k < minutes * PM; k++) {
    if (k === 4 * PM) t.buildings.push({ typeId: "sawmill", q: -1, r: 0, workers: 0, built: true, priority: star });
    Sim.tick(st);
    if (k >= 12 * PM) { minPopAfter12 = Math.min(minPopAfter12, t.pop.peasants); minHAfter12 = Math.min(minHAfter12, t.happiness); }
    if (byType(t, "potato_farm").selfFeedGood === "potato") pfSelfFed = true;
  }
  return { t, minPopAfter12, minHAfter12, pfSelfFed };
}
{
  const r = runM1(true, 20);
  const t = r.t;
  ok("(a) starred Sawmill: pop >= 3.9 at 20 game-min (was 2.0)", t.pop.peasants >= 3.9, "pop=" + t.pop.peasants.toFixed(2));
  ok("(a) starred Sawmill: happiness >= 69 at 20 game-min (was 29)", t.happiness >= 69, "h=" + t.happiness.toFixed(1));
  ok("(a) never collapses to the old pop-2 trap between 12 and 20 min", r.minPopAfter12 >= 3.5, "min pop=" + r.minPopAfter12.toFixed(2));
  ok("(a) the Potato Farm was protected by the self-feed pass at least once", r.pfSelfFed);
  ok("(a) happiness never sags below 65 between 12 and 20 min (no potato gap)", r.minHAfter12 >= 65,
     "min h=" + r.minHAfter12.toFixed(1));
}

// ---------------------------------------------------------------------------
// (b) A full-store Lumberjack's crew moves to an unstaffed Quarry (stone > 3/min).
// ---------------------------------------------------------------------------
function runQuarry() {
  const t = mkTown(["lumberjack", "potato_farm", "hut", "hut", "quarry"]);
  const st = { towns: [t], tick: 0 };
  const q = t.buildings[4];
  const stoneNow = () => (t.stock.stone || 0) + ((q.store && q.store.stone) || 0) + (q._prodAcc || 0);
  let stone0 = 0, sawFull = false, ljIdleWhileFull = false;
  for (let k = 0; k < 25 * PM; k++) {
    Sim.tick(st);
    if (k === 5 * PM) stone0 = stoneNow();
    const lj = t.buildings[0];
    if (lj.blockedReason === "full") { sawFull = true; if (lj.workers === 0 && q.workers > 0) ljIdleWhileFull = true; }
  }
  return { t, perMin: (stoneNow() - stone0) / 20, sawFull, ljIdleWhileFull };
}
{
  const r = runQuarry();
  ok("(b) a Lumberjack's full store flags blockedReason='full'", r.sawFull);
  ok("(b) while full, its crew staffs the Quarry instead", r.ljIdleWhileFull);
  ok("(b) stone > 3/min between minutes 5 and 25 (was 0)", r.perMin > 3, "stone/min=" + r.perMin.toFixed(2));
  ok("(b) the city itself is unharmed (pop >= 3.9, h >= 69)", r.t.pop.peasants >= 3.9 && r.t.happiness >= 69,
     "pop=" + r.t.pop.peasants.toFixed(2) + " h=" + r.t.happiness.toFixed(1));
}

// ---------------------------------------------------------------------------
// (c) Unit checks on Sim.staffTown: pass order, hysteresis, dry-run purity, switches.
// ---------------------------------------------------------------------------
function unitTown() {
  // 4 peasants for Lumberjack, Potato Farm, Sawmill (6 slots) — who gets the 4?
  const t = mkTown(["lumberjack", "potato_farm", "sawmill", "hut", "hut"]);
  t.pop.peasants = 4;
  return t;
}
{
  const t = unitTown();
  t.stock.potato = 200; t.stock.wood = 200;                 // plenty of cover → no self-feed
  t.buildings[2].priority = true;                           // ☆ Sawmill
  t.pop.peasants = 2;                                       // only one crew to hand out
  Sim.staffTown(t, false);
  ok("(c) ☆ still wins when the city is well stocked",
     t.buildings[2].workers === 2 && t.buildings[0].workers === 0 && t.buildings[1].workers === 0,
     t.buildings.map(b => b.workers).join(","));
  t.stock.potato = 0;                                       // now the city is out of potato
  Sim.staffTown(t, false);
  ok("(c) low on potato: Potato Farm is self-fed ahead of the ☆ Sawmill",
     t.buildings[1].workers === 2 && t.buildings[1].selfFeedGood === "potato" && t.buildings[2].workers === 0,
     t.buildings.map(b => b.workers).join(","));
  // Self-feed hysteresis: 2 peasants eat 0.0217 potato/tick → 120 s cover = 5.2 potato,
  // release at selfFeedReleaseMult (2) × that = 10.4.
  t.stock.potato = 8;
  Sim.staffTown(t, false);
  ok("(c) self-feed holds between 1× and 2× cover (anti-flicker)", t.buildings[1].workers === 2 && t.buildings[1].selfFeedGood === "potato");
  t.stock.potato = 11;
  Sim.staffTown(t, false);
  ok("(c) self-feed releases above 2× cover; ☆ gets its crew back",
     t.buildings[1].workers === 0 && !t.buildings[1].selfFeedGood && t.buildings[2].workers === 2);
  t.stock.potato = 8;
  Sim.staffTown(t, false);
  ok("(c) …and does NOT re-engage until cover drops below 1×", t.buildings[1].workers === 0);
  t.stock.potato = 0;
  Sim.staffTown(t, false);
  const before = JSON.stringify(t.buildings);
  t.stock.potato = 200;
  const plan = Sim.staffTown(t, true);
  ok("(c) dry-run returns a plan and mutates nothing",
     Array.isArray(plan) && plan[2] === 2 && plan[1] === 0 && JSON.stringify(t.buildings) === before,
     JSON.stringify(plan));
  ok("(c) wet run returns null", Sim.staffTown(t, false) === null);
}
{
  const t = unitTown();
  t.stock.potato = 200; t.stock.wood = 200;
  const lj = t.buildings[0], cap = CONFIG.econ.buildingStoreCap;
  lj.store = { wood: cap - 1 };                              // trips at storeCap − 1
  Sim.staffTown(t, false);
  ok("(c) full store trips 'blocked' and the Lumberjack is staffed last",
     lj._blocked === true && lj.blockedReason === "full" && lj.workers === 0 && t.buildings[2].workers === 2,
     t.buildings.map(b => b.workers).join(","));
  lj.store.wood = cap - 2;                                   // drained one unit — still within a batch
  Sim.staffTown(t, false);
  ok("(c) hysteresis: stays blocked until a whole batch has drained", lj._blocked === true && lj.workers === 0);
  lj.store.wood = cap - 10;                                  // a porter took a 10-unit load
  Sim.staffTown(t, false);
  ok("(c) unblocks once the store is a batch below cap, crew returns",
     lj._blocked === false && lj.blockedReason === null && lj.workers === 2);
  t.buildings[1].pendingUpgrade = { toLevel: 2, delivered: {} };
  Sim.staffTown(t, false);
  ok("(c) a producer waiting on its upgrade is blocked ('upgrading') and staffed last",
     t.buildings[1].blockedReason === "upgrading" && t.buildings[1].workers === 0 && t.buildings[2].workers === 2,
     t.buildings.map(b => b.workers).join(","));
  CONFIG.econ.staffBlockedLast = false;
  Sim.staffTown(t, false);
  ok("(c) staffBlockedLast=false restores plain array order",
     t.buildings[0].workers === 2 && t.buildings[1].workers === 2 && t.buildings[2].workers === 0,
     t.buildings.map(b => b.workers).join(","));
  CONFIG.econ.staffBlockedLast = true;
}
{
  const t = unitTown();
  t.stock.potato = 0; t.stock.wood = 0;
  t.buildings[2].priority = true;
  CONFIG.econ.selfFeedCoverSec = 0;
  Sim.staffTown(t, false);
  ok("(c) selfFeedCoverSec=0 disables self-feed (☆ wins again)",
     t.buildings[2].workers === 2 && !t.buildings[1].selfFeedGood, t.buildings.map(b => b.workers).join(","));
  CONFIG.econ.selfFeedCoverSec = 120;
}
{
  // Determinism: the same run twice gives identical state.
  const a = runM1(true, 8).t, b = runM1(true, 8).t;
  ok("(c) deterministic (two identical runs agree)", JSON.stringify(a) === JSON.stringify(b));
  // Legacy building lacking the new fields still staffs (save compatibility).
  const t = mkTown(["potato_farm", "hut"]);
  t.pop.peasants = 2; t.stock.potato = 200; t.stock.wood = 200;
  Sim.staffTown(t, false);
  ok("(c) legacy building without _blocked/blockedReason staffs normally", t.buildings[0].workers === 2);
}

console.log(`\nstaffing.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
