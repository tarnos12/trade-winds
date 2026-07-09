// Headless test for Trade Winds P5D-D — the player-adjustable tariff (state.tariffRate).
// Evals the code between the PURE_CORE markers in index.html (CONFIG + Sim + Pathing +
// Trade + Research) — no browser needed.
//   node test/tariff.test.js
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
         "this.Pathing=Pathing; this.Trade=Trade; this.Research=Research;",
  sandbox
);
const { CONFIG, HexMath, Sim, Pathing, Trade, Research } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); }
}
const K = (q, r) => HexMath.key(q, r);
const approx = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-6 : eps);

// ---- Complementary-town scenario (mirrors trade.test.js so routes stay profitable
//      even at a 40% tariff — dispatch profit is gross, so the SAME carts/trades run
//      regardless of tariffRate; only the treasury cut differs). ------------------
function mkTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 4, gold: 5000,
    pop: { peasants: 10, workers: 6, burghers: 0 },
    stock: {}, prices: {}, demand: {}, buildings: [], happiness: 100,
  }, over);
}
// Housing so each city keeps a real population across the run (Sim caps pop at
// housing now: base peasants are 0). No houses ⇒ pop → 0 ⇒ no demand ⇒ no trade ⇒
// treasury stays 0. 6 huts (cap 12) + 2 cottages (cap 6) shelter mkTown's pop.
function homes() {
  const a = [];
  for (let i = 0; i < 6; i++) a.push({ typeId: "hut" });
  for (let i = 0; i < 2; i++) a.push({ typeId: "cottage" });
  return a;
}
function farmTown() { return mkTown({ id: 1, q: 0, r: 0,
  buildings: [{ typeId: "farm", workers: 3 }, { typeId: "farm", workers: 3 }, ...homes()],
  stock: { grain: 40, iron: 0 } }); }
function mineTown() { return mkTown({ id: 2, q: 6, r: 0,
  buildings: [{ typeId: "iron_mine", workers: 3 }, { typeId: "iron_mine", workers: 3 }, ...homes()],
  stock: { iron: 40, grain: 15 } }); }
function millTown() { return mkTown({ id: 3, q: 3, r: 1,
  buildings: [{ typeId: "mill", workers: 2 }, ...homes()],
  stock: { grain: 30, iron: 0 } }); }
const ROAD_LINE = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];

// `over` lets a test tweak the state (tariffRate, research) before the run.
function buildState(seed, over) {
  const roads = new Set();
  for (const [q, r] of ROAD_LINE) roads.add(K(q, r));
  const st = { roads, towns: [farmTown(), mineTown(), millTown()],
               carts: [], treasury: 0, tradeSeed: seed >>> 0,
               research: { unlocked: [], active: null, progress: 0, spent: 0 } };
  return Object.assign(st, over);
}
function run(st, n) { for (let i = 0; i < n; i++) { Sim.tick(st); Trade.tick(st); } }
function treasuryAfter(seed, n, over) {
  Pathing.invalidate();
  const st = buildState(seed, over);
  run(st, n);
  return st.treasury;
}

const SEED = 4242, N = 240;

// =========================================================================
// 0) Baseline: an absent tariffRate behaves exactly as the old CONFIG constant (0.25).
// =========================================================================
{
  const noField = treasuryAfter(SEED, N, {});                       // state.tariffRate absent
  const explicit25 = treasuryAfter(SEED, N, { tariffRate: 0.25 }); // == CONFIG.trade.tariffRate
  ok("absent tariffRate == explicit 0.25 (default behaviour unchanged)", approx(noField, explicit25));
  ok("baseline earns treasury on the connected network", noField > 0);
}

// =========================================================================
// 1) Treasury-per-trade scales with the rate. Same seed ⇒ identical trades/values,
//    so treasury is exactly (rate) × (constant value sum): 40% earns 4× the 10% take.
// =========================================================================
{
  const low = treasuryAfter(SEED, N, { tariffRate: 0.10 });
  const high = treasuryAfter(SEED, N, { tariffRate: 0.40 });
  ok("higher tariff earns more treasury (0.40 > 0.10)", high > low);
  ok("treasury scales linearly with the rate (0.40 ≈ 4× 0.10)", approx(high, 4 * low, high * 1e-9 + 1e-6));
}

// =========================================================================
// 2) Clamp to GDD §6.3 range [0.10, 0.40] (bounded by cfg.maxTariffRate).
//    Below-floor and above-ceiling settings collapse onto the bounds.
// =========================================================================
{
  const floorHit = treasuryAfter(SEED, N, { tariffRate: 0.02 }); // below floor → 0.10
  const atFloor  = treasuryAfter(SEED, N, { tariffRate: 0.10 });
  ok("below-floor tariff (0.02) clamps to 0.10", approx(floorHit, atFloor));

  const ceilHit = treasuryAfter(SEED, N, { tariffRate: 0.90 });  // above ceiling → 0.40
  const atCeil  = treasuryAfter(SEED, N, { tariffRate: 0.40 });
  ok("above-ceiling tariff (0.90) clamps to 0.40", approx(ceilHit, atCeil));
  ok("effective ceiling is 0.40, not cfg.maxTariffRate (0.9)", CONFIG.trade.maxTariffRate === 0.9 && ceilHit < 4 * atFloor + 1);
}

// =========================================================================
// 3) Research tariffBonus still composes on top of the player-set base.
//    base 0.10 + Tax Ledgers (+0.03) == plain base 0.13.
// =========================================================================
{
  const withRes = treasuryAfter(SEED, N, {
    tariffRate: 0.10,
    research: { unlocked: ["tax_ledgers"], active: null, progress: 0, spent: 0 } });
  const asPlain13 = treasuryAfter(SEED, N, { tariffRate: 0.13 });
  ok("research tariffBonus composes with the slider base (0.10 + 0.03 == 0.13)", approx(withRes, asPlain13));

  // And it still composes with the default base (absent tariffRate) exactly as before.
  const defWithRes = treasuryAfter(SEED, N, {
    research: { unlocked: ["tax_ledgers"], active: null, progress: 0, spent: 0 } });
  const asPlain28 = treasuryAfter(SEED, N, { tariffRate: 0.28 });
  ok("default base + tariffBonus unchanged (0.25 + 0.03 == 0.28)", approx(defWithRes, asPlain28));
}

// =========================================================================
// 4) Research gate flag: Tariff Office unlocks the tariff_slider effect the UI reads.
// =========================================================================
{
  const locked = { research: { unlocked: [], active: null, progress: 0, spent: 0 } };
  const unlocked = { research: { unlocked: ["tax_ledgers", "tariff_office"], active: null, progress: 0, spent: 0 } };
  ok("tariff_slider effect is false before research", !Research.effect(locked, "tariff_slider", false));
  ok("tariff_slider effect is true once Tariff Office is unlocked", Research.effect(unlocked, "tariff_slider", false) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
