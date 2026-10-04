// Headless regression for v0.52.1 QA item #8 — construction/upgrade delivery keeps a
// RESIDENT RESERVE of the present tiers' basic goods (Sim.basicReserve, knob
// CONFIG.town.basicReserveMin, default 1 game-minute of use). QA saw a Hut L2 upgrade
// take the peasants' last wood (4 → 0). Invariants:
//   1. an upgrade / non-bootstrap construction site never takes a basic good below the
//      reserve; above it, delivery proceeds as before (budget-capped);
//   2. basicReserveMin 0 restores the old behaviour exactly;
//   3. a BOOTSTRAP producer (unbuilt Lumberjack in a town with no built one) is exempt —
//      the #2 wood-bootstrap still completes (no construction soft-lock);
//   4. first-city builds (Timber town, Farm town — 0 residents at start) still finish,
//      and a Hut L2 in a running Timber town still completes.
// Evaluates the PURE_CORE slice of index.html (no browser).
//   node test/build_reserve.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sb = {};
vm.createContext(sb);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Buildings=Buildings;", sb);
const { CONFIG, Sim, Buildings } = sb;

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) pass++; else { fail++; console.error("  ✗ " + name + (info !== undefined ? "  [" + info + "]" : "")); }
}
const TPM = 120;   // 2 ticks = 1 game-second
const bld = (typeId, r, over) => Object.assign({ typeId, q: 1, r, workers: 0, built: true }, over || {});
function town(buildings, stock, peasants) {
  return { id: 1, q: 0, r: 0, level: 1, gold: 1000, built: true,
    pop: { peasants: peasants || 0, workers: 0, burghers: 0, aristocrats: 0 },
    stock: Object.assign({}, stock), prices: {}, demand: {}, buildings };
}
const world = (t) => ({ towns: [t], carts: [], roads: new Set(), treasury: 0, tick: 0 });
function runUntil(st, maxTicks, done) { let i = 0; while (i < maxTicks && !done()) { Sim.tick(st); i++; } return i; }

ok("CONFIG.town.basicReserveMin defaults to 1 game-minute", CONFIG.town.basicReserveMin === 1);

// ---- Sim.basicReserve ------------------------------------------------------------------
{
  const t = town([bld("hut", 0), bld("hut", 1)], {}, 4);
  const r = Sim.basicReserve(t);
  const pc = CONFIG.needs.tiers.peasants.perCapita;
  ok("reserve = 1 min of the peasants' basic use (wood 3.6)", Math.abs(r.wood - 4 * pc.wood * TPM) < 1e-9, r.wood);
  ok("reserve covers potato too", Math.abs(r.potato - 4 * pc.potato * TPM) < 1e-9);
  ok("luxuries are never reserved", !("fish" in r) && !("wool" in r));
  ok("no residents → nothing reserved", Sim.basicReserve(town([], {}, 0)) === null);
  ok("mins 0 → nothing reserved", Sim.basicReserve(t, 0) === null);
}

// ---- 1. the QA case: Hut L2 with only 4 wood on the shelf --------------------------------
function hutUpgradeTown(wood) {
  const up = bld("hut", 0, { upgradeLevel: 1, pendingUpgrade: { toLevel: 2, delivered: {} } });
  return town([up, bld("hut", 1)], { wood, planks: 10, potato: 40 }, 4);
}
{
  const t = hutUpgradeTown(4), res = Sim.basicReserve(t).wood;
  Sim.tick(world(t));
  const got = t.buildings[0].pendingUpgrade.delivered.wood || 0;
  ok("Hut L2 leaves the peasants' reserve (takes ≤ 4 − 3.6 wood)", got <= Math.max(0, 4 - res) + 1e-9, got);
  ok("…planks (not a basic) still delivered in full", (t.buildings[0].pendingUpgrade.delivered.planks || 0) === 10);
}
{
  const t = hutUpgradeTown(30), res = Sim.basicReserve(t).wood;
  const budget = CONFIG.town.deliveryRate * Buildings.transporterCount(t);
  Sim.tick(world(t));
  const got = t.buildings[0].pendingUpgrade.delivered.wood || 0;
  ok("with plenty of wood the upgrade takes min(budget, stock − reserve)",
    Math.abs(got - Math.min(budget, 30 - res)) < 1e-9, got + " vs " + Math.min(budget, 30 - res));
}
// ---- 2. knob 0 = old behaviour ---------------------------------------------------------
{
  const was = CONFIG.town.basicReserveMin;
  CONFIG.town.basicReserveMin = 0;
  const t = hutUpgradeTown(4);
  Sim.tick(world(t));
  ok("basicReserveMin 0: the upgrade takes the last 4 wood (pre-v0.52.1)", (t.buildings[0].pendingUpgrade.delivered.wood || 0) === 4);
  CONFIG.town.basicReserveMin = was;
}

// ---- 3. BOOTSTRAP exemption: the unbuilt Lumberjack still gets the last wood -------------
{
  const t = town([bld("hut", 0), bld("hut", 1), bld("lumberjack", 2, { built: false, delivered: {} })],
    { wood: 6, potato: 40 }, 4);
  Sim.tick(world(t));
  ok("bootstrap Lumberjack is exempt from the resident reserve (takes all 6 wood)",
    (t.buildings[2].delivered.wood || 0) === 6, t.buildings[2].delivered.wood);
}
{
  // A starving Timber town: 4 peasants, 12 wood, an unbuilt Lumberjack AND a ☆ Hut queued
  // first. The Lumberjack must finish (boot + resident reserve hold the Hut back), then its
  // wood lets the Hut finish too — no soft-lock.
  const lj = bld("lumberjack", 3, { built: false, delivered: {} });
  const hut = bld("hut", 2, { built: false, delivered: {}, priority: true });
  const t = town([bld("hut", 0), bld("hut", 1), hut, lj], { wood: 12, potato: 60 }, 4);
  const st = world(t);
  const n1 = runUntil(st, 3 * TPM, () => lj.built === true);
  ok("bootstrap Lumberjack completes despite the reserve", lj.built === true, n1 + " ticks");
  const n2 = runUntil(st, 6 * TPM, () => hut.built === true);
  ok("…and the queued Hut completes from its wood afterwards", hut.built === true, n2 + " ticks");
}

// ---- 4. first-city builds + a Hut L2 in a running Timber town ---------------------------
function firstCity(order) {
  const b = order.map((ty, i) => bld(ty, i, { built: false, delivered: {} }));
  const t = town(b, CONFIG.town.startStock, 0);
  const st = world(t);
  const n = runUntil(st, 5 * TPM, () => b.every(x => x.built === true));
  return { ok: b.every(x => x.built === true), n, t };
}
{
  const a = firstCity(["hut", "hut", "lumberjack", "lumberjack"]);
  ok("Timber town (huts queued first) finishes all 4 buildings", a.ok, a.n + " ticks");
  const f = firstCity(["hut", "hut", "potato_farm", "potato_farm"]);
  ok("Farm town (no Lumberjack) finishes all 4 buildings from the start wood", f.ok, f.n + " ticks");
}
{
  const up = bld("hut", 0, { upgradeLevel: 1, pendingUpgrade: { toLevel: 2, delivered: {} } });
  const t = town([up, bld("hut", 1), bld("lumberjack", 2), bld("lumberjack", 3)], { wood: 4, planks: 10, potato: 60 }, 4);
  const st = world(t);
  const n = runUntil(st, 6 * TPM, () => !up.pendingUpgrade);
  ok("Hut L2 in a Timber town still completes (wood from its Lumberjacks)", !up.pendingUpgrade && up.upgradeLevel === 2, n + " ticks");
}

console.log(`build_reserve: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
