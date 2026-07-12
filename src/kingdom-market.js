// === KR-A: kingdom resource market (pure sampling + summaries) ===
// A small, pure, side-effect-free market observatory. Once per economy tick it
// samples every good's KINGDOM-WIDE stock total and mean local price into a
// bounded history ring so the KR-B panel can draw a 5-min price chart and a
// live resource grid. No DOM / canvas / I/O; the only mutation is state.market.
//
// Contract:
//   state.market = { hist: { [goodId]: [ {t,total,avg}, ... ] }, head, len }
//     - hist[gid]  chronological, newest LAST, capped to MAX_SAMPLES (a
//                  shift-capped array — stays bounded across save/load).
//     - head       total samples ever taken (monotonic counter).
//     - len        current sample depth (max array length, ≤ MAX_SAMPLES).
//
// It READS the price ALREADY PUBLISHED by Sim.tick this tick (town.prices[gid])
// rather than calling Sim.priceFor — priceFor lerps and mutates, so re-calling
// it here would double-step prices and perturb the economy. Falling back to the
// good's basePrice keeps empty/legacy states well-defined. Deterministic:
// same state in ⇒ same sample out (no Math.random, no wall clock).
var Market = (typeof Market !== "undefined" && Market) || {};

Market.MAX_SAMPLES = 600;     // 5 min at 500 ms / tick — buffer hard cap per good
Market.TREND_LOOKBACK = 60;   // compare "now" vs ~30 s ago for the trend arrow
Market.RATE_WINDOW = 20;      // ~10 s window the net-production rate averages over

// Blank, well-formed market container.
Market.fresh = function () { return { hist: {}, head: 0, len: 0 }; };

// { [goodId]: true } for every good some AVAILABLE building outputs. A building
// is available iff startUnlocked OR it has no unlockedBy (defensive: ungated) OR
// its unlockedBy research node is unlocked. Mirrors the build-menu gate exactly.
Market.producible = function (state) {
  const out = {};
  const defs = (typeof CONFIG !== "undefined" && CONFIG.buildings) || {};
  const rHas = (id) => (typeof Research !== "undefined" && Research.has) ? Research.has(state, id) : false;
  for (const bid in defs) {
    const def = defs[bid];
    if (!def || !def.output || !def.output.goodId) continue;
    const avail = def.startUnlocked || !def.unlockedBy || rHas(def.unlockedBy);
    if (avail) out[def.output.goodId] = true;
  }
  return out;
};

// Defensive normalizer for loaded / foreign / oversized state.market data.
// Drops unknown goods, sanitizes each record, trims any array back to
// MAX_SAMPLES (keeping the most recent), and returns a fresh container when the
// shape is missing/malformed. Never throws.
Market.normalize = function (state) {
  const goods = (typeof CONFIG !== "undefined" && CONFIG.goods) || {};
  let m = state ? state.market : null;
  if (!m || typeof m !== "object" || !m.hist || typeof m.hist !== "object") m = Market.fresh();
  const cleanHist = {};
  let len = 0;
  for (const gid in goods) {
    const arr = Array.isArray(m.hist[gid]) ? m.hist[gid] : [];
    const clean = [];
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      if (r && typeof r === "object" &&
          typeof r.total === "number" && isFinite(r.total) &&
          typeof r.avg === "number" && isFinite(r.avg)) {
        clean.push({ t: (typeof r.t === "number" && isFinite(r.t)) ? r.t : 0, total: r.total, avg: r.avg });
      }
    }
    if (clean.length > Market.MAX_SAMPLES) clean.splice(0, clean.length - Market.MAX_SAMPLES);
    cleanHist[gid] = clean;
    if (clean.length > len) len = clean.length;
  }
  m.hist = cleanHist;
  m.len = Math.min(len, Market.MAX_SAMPLES);
  if (typeof m.head !== "number" || !isFinite(m.head) || m.head < m.len) m.head = m.len;
  if (state) state.market = m;
  return m;
};

// Sample once into the ring. Call AFTER Sim.tick / Trade.tick each econ step.
Market.tick = function (state) {
  if (!state) return state;
  const goods = (typeof CONFIG !== "undefined" && CONFIG.goods) || {};
  let m = state.market;
  if (!m || typeof m !== "object" || !m.hist || typeof m.hist !== "object") { m = Market.fresh(); state.market = m; }
  const towns = Array.isArray(state.towns) ? state.towns : [];
  const t = (typeof state.tick === "number" && isFinite(state.tick)) ? state.tick : (m.head | 0);
  for (const gid in goods) {
    const base = goods[gid].basePrice;
    let arr = m.hist[gid];
    if (!Array.isArray(arr)) { arr = []; m.hist[gid] = arr; }
    let total = 0, pSum = 0, pN = 0;
    for (let i = 0; i < towns.length; i++) {
      const town = towns[i];
      if (!town) continue;
      total += (town.stock && town.stock[gid]) || 0;
      // Read the published price (Sim.tick already republished it this tick);
      // count only towns that "value" the good (hold a finite price for it).
      const p = town.prices && town.prices[gid];
      if (typeof p === "number" && isFinite(p)) { pSum += p; pN++; }
    }
    const avg = pN > 0 ? pSum / pN : base;
    arr.push({ t: t, total: total, avg: avg });
    if (arr.length > Market.MAX_SAMPLES) arr.splice(0, arr.length - Market.MAX_SAMPLES);
  }
  m.len = Math.min((m.len | 0) + 1, Market.MAX_SAMPLES);
  m.head = (m.head | 0) + 1;
  return state;
};

// Per-good rollup for the UI. Reads the ring (does not sample):
//   { total, avg, capacity, trend:-1|0|1, netRate }
//   total     latest kingdom-wide stock
//   avg       latest mean local price (basePrice when no history yet)
//   capacity  #towns × storageCap (the theoretical kingdom ceiling)
//   trend     avg now vs ~TREND_LOOKBACK samples ago, with a 2% deadband
//   netRate   mean per-tick change in total over the last ~RATE_WINDOW samples
Market.summary = function (state) {
  const goods = (typeof CONFIG !== "undefined" && CONFIG.goods) || {};
  const towns = (state && Array.isArray(state.towns)) ? state.towns : [];
  const cap = towns.length * ((typeof CONFIG !== "undefined" && CONFIG.town && CONFIG.town.storageCap) || 0);
  const hist = (state && state.market && state.market.hist) || {};
  const out = {};
  for (const gid in goods) {
    const base = goods[gid].basePrice;
    const arr = Array.isArray(hist[gid]) ? hist[gid] : [];
    const n = arr.length;
    const last = n ? arr[n - 1] : null;
    const total = last ? last.total : 0;
    const avg = last ? last.avg : base;
    let trend = 0, netRate = 0;
    if (n >= 2) {
      const tIdx = Math.max(0, n - 1 - Market.TREND_LOOKBACK);
      const past = arr[tIdx].avg;
      const dead = Math.max(0.05, Math.abs(past) * 0.02);
      if (avg > past + dead) trend = 1;
      else if (avg < past - dead) trend = -1;
      const rIdx = Math.max(0, n - 1 - Market.RATE_WINDOW);
      const steps = (n - 1) - rIdx;
      if (steps > 0) netRate = (total - arr[rIdx].total) / steps;
    }
    out[gid] = { total: total, avg: avg, capacity: cap, trend: trend, netRate: netRate };
  }
  return out;
};
// === /KR-A ===
