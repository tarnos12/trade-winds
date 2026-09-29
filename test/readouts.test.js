// DESIGN PASS #13 — production readouts you can trust. Locks in:
//   (a) Sim.buildingStatus / Sim.buildingProgress name the REAL stall (warehouseFull vs
//       awaitingPorter vs noInputs vs noWorkers vs upgrading), freeze the displayed prog
//       while stalled WITHOUT touching _prodTimer, and honour type.cycleSec.
//   (b) Sim.buildingRates = ratePerWorker × workers × hf × research × upgrade × 120.
//   (c) Market: 120-sample net-rate window reads a batchy stock honestly; the kingdom
//       average price counts only towns with a market for the good (no phantom avg).
//   (d) CONFIG.goods carries no stale recipe table; Trade.sellHoldback is exported.
// Pure-Sim, deterministic, no browser.   node test/readouts.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Market=Market; this.Trade=Trade;", sandbox);
const { CONFIG, Sim, Market, Trade } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + (info ? "  [" + info + "]" : "")); }
}
const approx = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);
const PM = 120;
const CAP = CONFIG.town.storageCap;
const POS = [[-1, 1], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [2, -1], [2, 0]];
function mkTown(types) {
  const t = { id: 1, q: 0, r: 0, level: 1, gold: 1000, built: true,
    pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
    stock: Object.assign({}, CONFIG.town.startStock), prices: {}, demand: {}, buildings: [], happiness: 70 };
  types.forEach((id, i) => t.buildings.push({ typeId: id, q: POS[i][0], r: POS[i][1], workers: 0, built: true }));
  return t;
}

// ---------------------------------------------------------------------------
// (a) status taxonomy on hand-built buildings
// ---------------------------------------------------------------------------
{
  const t = mkTown(["lumberjack", "sawmill"]);
  const lj = t.buildings[0], saw = t.buildings[1];
  lj.workers = 2; saw.workers = 2;
  t.stock.wood = 10;
  ok("working lumberjack → 'working'", Sim.buildingStatus(t, lj) === "working");
  lj.store = { wood: 30 };
  ok("full store, warehouse has room → 'awaitingPorter'", Sim.buildingStatus(t, lj) === "awaitingPorter");
  t.stock.wood = CAP;
  ok("full store AND warehouse at storageCap → 'warehouseFull'", Sim.buildingStatus(t, lj) === "warehouseFull");
  lj.store = { wood: 5 }; lj.blockedReason = "full"; lj.workers = 0;
  ok("staffing's full flag (crew pulled) still reads as full, not noWorkers", Sim.buildingStatus(t, lj) === "warehouseFull");
  lj.blockedReason = null;
  ok("no crew → 'noWorkers'", Sim.buildingStatus(t, lj) === "noWorkers");
  lj.pendingUpgrade = { toLevel: 2 };
  ok("pending upgrade → 'upgrading'", Sim.buildingStatus(t, lj) === "upgrading");
  t.stock.wood = 0; saw.inbuf = {};
  ok("processor with no input in buffer or warehouse → 'noInputs'", Sim.buildingStatus(t, saw) === "noInputs");
  const pr0 = Sim.buildingProgress({}, t, saw);
  ok("  …progress reports starved + not working", pr0.starved === true && pr0.working === false && pr0.status === "noInputs");
  saw.inbuf = { wood: 1 };
  ok("one wood in the processor's own buffer → 'working' (buffer counts, not just warehouse)", Sim.buildingStatus(t, saw) === "working");
  ok("houses / non-producers → null", Sim.buildingStatus(t, { typeId: "hut", built: true }) === null &&
     Sim.buildingProgress({}, t, { typeId: "hut", built: true }) === null);
}

// ---------------------------------------------------------------------------
// (a) prog uses type.cycleSec (not the per-kind interval) and freezes while stalled
// ---------------------------------------------------------------------------
{
  const t = mkTown(["lumberjack"]);
  const lj = t.buildings[0]; lj.workers = 2; t.stock.wood = 0;
  const def = CONFIG.buildings.lumberjack;
  const saved = def.cycleSec;
  def.cycleSec = 4;                       // 8 ticks, whatever productionIntervalSec says
  lj._prodTimer = 4;
  const pr = Sim.buildingProgress({}, t, lj);
  ok("interval from cycleSec (4 s → 8 ticks)", pr.intervalTicks === 8, "got " + pr.intervalTicks);
  ok("prog = 1 − timer/interval (0.5)", approx(pr.prog, 0.5));
  def.cycleSec = saved;
}
{
  // Live sim: a staffed Lumberjack mid-batch, then its store is filled to cap.
  const t = mkTown(["lumberjack", "potato_farm", "hut", "hut"]);
  const st = { towns: [t], tick: 0 };
  for (let k = 0; k < 2 * PM; k++) Sim.tick(st);
  const lj = t.buildings[0];
  const iv = Sim.buildingProgress(st, t, lj).intervalTicks;
  // step until mid-batch while working
  let guard = 0;
  while (guard++ < iv && !(Sim.buildingProgress(st, t, lj).working && Sim.buildingProgress(st, t, lj).prog > 0.2)) Sim.tick(st);
  const before = Sim.buildingProgress(st, t, lj);
  ok("setup: lumberjack working mid-batch", before.working && before.prog > 0.2, JSON.stringify(before));
  lj.store = { wood: 30 };               // store full → stalled
  t.stock.wood = CAP;                    // …and the warehouse can't take it
  const timers = [];
  let frozen = true, statusOK = true;
  for (let k = 0; k < 5; k++) {
    const pr = Sim.buildingProgress(st, t, lj);
    if (!approx(pr.prog, before.prog)) frozen = false;
    if (pr.status !== "warehouseFull" || pr.working) statusOK = false;
    timers.push(lj._prodTimer);
    Sim.tick(st);
    lj.store.wood = 30; t.stock.wood = CAP;   // keep it pinned full
  }
  ok("stalled bar is NOT green: status warehouseFull, working=false", statusOK);
  ok("displayed prog frozen while stalled", frozen);
  ok("_prodTimer untouched by the readout (still counts down in Sim.tick)", timers[0] !== timers[1] || timers[1] !== timers[2], timers.join(","));
}

// Determinism: reading progress every tick changes nothing in the sim.
{
  const run = (peek) => {
    const t = mkTown(["lumberjack", "potato_farm", "sawmill", "hut", "hut", "hut"]);
    const st = { towns: [t], tick: 0 };
    for (let k = 0; k < 6 * PM; k++) {
      if (peek) for (const b of t.buildings) { Sim.buildingProgress(st, t, b); Sim.buildingStatus(t, b); Sim.buildingRates(st, t, b); }
      Sim.tick(st);
    }
    return JSON.stringify(st);
  };
  ok("reading buildingProgress/Status/Rates every tick leaves the sim bit-identical", run(false) === run(true));
}

// m1 city over 20 game-min: the Lumberjack really does hit a full WAREHOUSE, and the
// readout says so (not "producing", not "waiting for a porter").
{
  const t = mkTown(["lumberjack", "potato_farm", "hut", "hut"]);
  const st = { towns: [t], tick: 0 };
  const lj = t.buildings[0];
  let whFull = 0, porterMoved = 0, greenButStuck = 0;
  for (let k = 0; k < 20 * PM; k++) {
    const s = Sim.buildingStatus(t, lj);
    const store0 = (lj.store && lj.store.wood) || 0, acc0 = lj._prodAcc || 0;
    Sim.tick(st);
    const store1 = (lj.store && lj.store.wood) || 0;
    // warehouseFull ⇒ porters had no room: nothing left the store this tick.
    if (s === "warehouseFull") { whFull++; if (store1 < store0) porterMoved++; }
    // "working" must mean the buffer actually grew (or a batch released) — the old bar
    // stayed green on 79% of this Lumberjack's staffed ticks while nothing was made.
    if (s === "working" && (lj.workers || 0) > 0 && !((lj._prodAcc || 0) + store1 > acc0 + store0 - 1e-9) && store1 >= store0) greenButStuck++;
  }
  ok("m1 city: the Lumberjack reports warehouseFull at some point (wood at the 80 cap)", whFull > 0, "ticks=" + whFull);
  ok("m1 city: while warehouseFull, no porter could empty the store (the real block)", porterMoved === 0, "moved=" + porterMoved);
  ok("m1 city: 'working' never shown while the buffer is stuck", greenButStuck === 0, "ticks=" + greenButStuck);
}

// ---------------------------------------------------------------------------
// (b) per-minute rates
// ---------------------------------------------------------------------------
{
  const t = mkTown(["sawmill", "lumberjack"]);
  const saw = t.buildings[0], lj = t.buildings[1];
  saw.workers = 2; lj.workers = 2; t.happiness = 70;
  const N = CONFIG.needs;
  const hf = N.effMin + 0.7 * (N.effMax - N.effMin);
  const r = Sim.buildingRates({}, t, saw);
  const want = CONFIG.buildings.sawmill.output.ratePerWorker * 2 * hf * PM;
  ok("Sawmill at h70: ≈" + want.toFixed(2) + "/min (the old panel showed '+1' = 3.75)", approx(r.outPerMin, want, 1e-9) && r.outPerMin > 4.9,
     "got " + r.outPerMin);
  ok("Sawmill uses wood 0.0208×2×120 ≈ 5.0/min (inputs not scaled by happiness)", approx(r.inPerMin.wood, CONFIG.buildings.sawmill.inputs.wood * 2 * PM));
  ok("Lumberjack at h70 ≈ " + (0.0625 * 2 * hf * PM).toFixed(1) + "/min", approx(Sim.buildingRates({}, t, lj).outPerMin, CONFIG.buildings.lumberjack.output.ratePerWorker * 2 * hf * PM));
  ok("workers override (full-slot preview)", approx(Sim.buildingRates({}, t, saw, 1).outPerMin, want / 2));
  saw.pendingUpgrade = { toLevel: 2 };
  ok("upgrading producer → 0/min", Sim.buildingRates({}, t, saw).outPerMin === 0);
}

// ---------------------------------------------------------------------------
// (c) Market: honest net rate + no phantom average
// ---------------------------------------------------------------------------
ok("Market.RATE_WINDOW = 120 samples (60 game-s)", Market.RATE_WINDOW === 120);
ok("RATE_WINDOW fits the ring (≤ MAX_SAMPLES)", Market.RATE_WINDOW <= Market.MAX_SAMPLES);
{
  // A batchy stock: +8 wood every 16 ticks, −1 wood every 3 ticks → true net
  // (0.5 − 0.333)/tick = +20/min. Integer steps make short windows swing.
  const tot = []; let s = 40;
  for (let i = 0; i < 400; i++) { if (i % 16 === 0) s += 8; if (i % 3 === 0) s -= 1; tot.push(s); }
  const trueRate = (8 / 16 - 1 / 3) * PM;
  const worstFor = (win) => {
    const keep = Market.RATE_WINDOW; Market.RATE_WINDOW = win;
    let worst = 0;
    for (let end = 200; end < 400; end++) {
      const st = { tick: 0, towns: [{ id: 1, stock: { wood: 1 }, prices: {} }], market: Market.fresh() };
      st.market.hist.wood = tot.slice(0, end + 1).map((v, i) => ({ t: i, total: v, avg: 5 }));
      worst = Math.max(worst, Math.abs(Market.summary(st).wood.netRate * PM - trueRate));
    }
    Market.RATE_WINDOW = keep;
    return worst;
  };
  const w120 = worstFor(120), w20 = worstFor(20);
  // One 8-unit batch entering/leaving a 60 s window moves the reading by ≤ 8/min → ±4.
  ok("120-sample window: within ±4.5/min of the true +20/min at every phase", w120 <= 4.5, "worst err " + w120.toFixed(2));
  ok("…where the old 20-sample window was off by ≥ 20/min", w20 >= 20, "old worst err " + w20.toFixed(2));
}
{
  const withWood = { id: 1, stock: { wood: 10 }, prices: { wood: 3, planks: 26.6 }, demand: {} };
  const empty = { id: 2, stock: {}, prices: { wood: 5, planks: 26.6 }, demand: {} };
  const st = { tick: 0, towns: [withWood, empty], market: Market.fresh() };
  Market.tick(st);
  ok("avg price ignores a town with no stock and no demand (3, not 4)", approx(st.market.hist.wood[0].avg, 3));
  const s = Market.summary(st);
  ok("summary.priced true when some town has a market", s.wood.priced === true);
  ok("planks: nobody stocks/uses it → priced false (UI shows '—', no phantom 26.6)",
     s.planks.priced === false && approx(s.planks.avg, CONFIG.goods.planks.basePrice));
  empty.consDemand = { wood: 0.01 };
  Market.tick(st);
  ok("a town that consumes the good (consDemand > 0) counts again (avg 4)", approx(st.market.hist.wood[1].avg, 4));
}

// ---------------------------------------------------------------------------
// (d) stale data + exports
// ---------------------------------------------------------------------------
ok("CONFIG.goods has no stale `inputs` recipe table", Object.values(CONFIG.goods).every(g => !("inputs" in g)));
ok("Trade.sellHoldback exported (warehouse ▲ uses the real export gate)", typeof Trade.sellHoldback === "function");
ok("rate readout tunables in CONFIG.econ", CONFIG.econ.rateWindowTicks === 120 && CONFIG.econ.rateDeadbandPerMin === 0.5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
