// Headless test for Trade Winds KR-A — pure Market module (kingdom resource
// overview: bounded history ring, kingdom-wide totals/avg, producible gating,
// trend + netRate summaries, save-shape normalization).
// Evals the pure code between the PURE_CORE markers in index.html — no browser.
//   node test/market.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Sim=Sim; this.Market=Market; this.Research=Research;", sandbox);
const { CONFIG, Sim, Market, Research } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// A town holding `stock` of `gid` at published price `price` (Market READS the
// stored price, it never re-derives it, so we set town.prices directly).
function town(id, gid, stock, price) {
  const t = { id: id, stock: {}, prices: {} };
  if (gid != null) { t.stock[gid] = stock; if (price != null) t.prices[gid] = price; }
  return t;
}
function freshState(towns) {
  return { tick: 0, towns: towns || [], market: Market.fresh() };
}

// ---- module surface + fresh shape ----
ok("Market namespace exists", Market && typeof Market.tick === "function");
ok("Market.fresh has empty hist/head/len", (() => {
  const f = Market.fresh();
  return f && typeof f.hist === "object" && f.head === 0 && f.len === 0 && Object.keys(f.hist).length === 0;
})());
ok("MAX_SAMPLES is 600", Market.MAX_SAMPLES === 600);

// ---- producible gating (building-availability rule) ----
(() => {
  const stEmpty = { research: Research.fresh(), towns: [] };
  const p0 = Market.producible(stEmpty);
  // lumberjack is startUnlocked -> wood always producible.
  ok("producible: wood available at start (startUnlocked lumberjack)", p0.wood === true);
  // miner (ore) is gated by research (deep_veins in this build) -> not yet.
  ok("producible: ore NOT available before its research unlock", !p0.ore);

  // find the research node that gates the ore producer, unlock it, re-check.
  const oreDef = Object.values(CONFIG.buildings).find(b => b.output && b.output.goodId === "ore");
  ok("ore has a gated producer with unlockedBy", oreDef && !oreDef.startUnlocked && !!oreDef.unlockedBy);
  const stUnlocked = { research: { unlocked: [oreDef.unlockedBy], active: null, progress: 0, spent: 0 }, towns: [] };
  const p1 = Market.producible(stUnlocked);
  ok("producible: ore becomes available after unlocking its research", p1.ore === true);

  // a def with NO unlockedBy and NO startUnlocked must be treated as available.
  CONFIG.buildings.__kr_test = { id: "__kr_test", output: { goodId: "__kr_good", ratePerWorker: 1 } };
  const pInj = Market.producible(stEmpty);
  ok("producible: ungated def (no unlockedBy) treated available", pInj.__kr_good === true);
  delete CONFIG.buildings.__kr_test;
})();

// ---- tick: totals / avg math ----
(() => {
  const st = freshState([town(1, "wood", 30, 10), town(2, "wood", 50, 20)]);
  Market.tick(st);
  const arr = st.market.hist.wood;
  ok("tick records one sample per good", Array.isArray(arr) && arr.length === 1);
  ok("tick total = sum of towns' stock", arr[0].total === 80);
  ok("tick avg = mean of town prices (10,20 -> 15)", approx(arr[0].avg, 15));
  ok("tick sample carries state.tick as t", arr[0].t === 0);
  ok("tick advances head and len", st.market.head === 1 && st.market.len === 1);
})();

// avg falls back to basePrice when no town values the good; total still summed.
(() => {
  const st = freshState([town(1, "stone", 12, null), town(2, "stone", 8, null)]);
  Market.tick(st);
  const arr = st.market.hist.stone;
  ok("tick total counts stock even with no prices", arr[0].total === 20);
  ok("tick avg falls back to basePrice when no prices", approx(arr[0].avg, CONFIG.goods.stone.basePrice));
})();

// empty kingdom (no towns) -> total 0, avg basePrice, never throws.
(() => {
  const st = freshState([]);
  Market.tick(st);
  const arr = st.market.hist.wood;
  ok("tick on empty kingdom: total 0", arr[0].total === 0);
  ok("tick on empty kingdom: avg = basePrice", approx(arr[0].avg, CONFIG.goods.wood.basePrice));
})();

// ---- buffer bounds ----
(() => {
  const st = freshState([town(1, "wood", 5, 5)]);
  for (let i = 0; i < Market.MAX_SAMPLES + 150; i++) { st.tick = i; Market.tick(st); }
  ok("hist array is capped at MAX_SAMPLES", st.market.hist.wood.length === Market.MAX_SAMPLES);
  ok("len is capped at MAX_SAMPLES", st.market.len === Market.MAX_SAMPLES);
  ok("head keeps counting past the cap", st.market.head === Market.MAX_SAMPLES + 150);
  // oldest sample dropped: newest sample's t should be the last i pushed.
  const a = st.market.hist.wood;
  ok("ring keeps the most-recent samples", a[a.length - 1].t === Market.MAX_SAMPLES + 150 - 1);
})();

// ---- summary: latest values + capacity ----
(() => {
  const towns = [town(1, "wood", 10, 6), town(2, "wood", 20, 8)];
  const st = freshState(towns);
  Market.tick(st);
  const s = Market.summary(st);
  ok("summary total = latest kingdom stock", s.wood.total === 30);
  ok("summary avg = latest mean price (7)", approx(s.wood.avg, 7));
  ok("summary capacity = #towns * storageCap",
     s.wood.capacity === towns.length * CONFIG.town.storageCap);
  // a good with no history yet -> total 0, avg basePrice, trend/netRate 0.
  ok("summary defaults to basePrice with no history", approx(s.jewelry.avg, CONFIG.goods.jewelry.basePrice));
  ok("summary trend 0 with <2 samples", s.jewelry.trend === 0 && s.jewelry.netRate === 0);
})();

// ---- trend sign (deadband-aware) ----
(() => {
  const mk = (avgs) => {
    const st = freshState([town(1, "wood", 0, 5)]);
    st.market.hist.wood = avgs.map((a, i) => ({ t: i, total: 0, avg: a }));
    return Market.summary(st).wood.trend;
  };
  // rising price over the lookback window -> +1
  const rising = []; for (let i = 0; i < 62; i++) rising.push(5 + i * 0.2);
  ok("trend +1 when price rises", mk(rising) === 1);
  // falling price -> -1
  const falling = []; for (let i = 0; i < 62; i++) falling.push(20 - i * 0.2);
  ok("trend -1 when price falls", mk(falling) === -1);
  // flat within the deadband -> 0
  const flat = []; for (let i = 0; i < 62; i++) flat.push(10 + (i % 2) * 0.01);
  ok("trend 0 when flat (deadband)", mk(flat) === 0);
})();

// ---- netRate sign ----
(() => {
  const mk = (totals) => {
    const st = freshState([town(1, "wood", 0, 5)]);
    st.market.hist.wood = totals.map((tot, i) => ({ t: i, total: tot, avg: 5 }));
    return Market.summary(st).wood.netRate;
  };
  const growing = []; for (let i = 0; i < 25; i++) growing.push(i * 4);   // +4/tick
  ok("netRate positive when stock grows", mk(growing) > 0);
  const shrinking = []; for (let i = 0; i < 25; i++) shrinking.push(200 - i * 4);
  ok("netRate negative when stock shrinks", mk(shrinking) < 0);
  const steady = []; for (let i = 0; i < 25; i++) steady.push(50);
  ok("netRate zero when stock steady", approx(mk(steady), 0));
})();

// ---- normalize: save-shape defenses ----
(() => {
  // missing market -> fresh
  const s1 = {}; Market.normalize(s1);
  ok("normalize: missing market -> fresh shape",
     s1.market && typeof s1.market.hist === "object" && s1.market.head === 0);

  // malformed market -> fresh
  const s2 = { market: 42 }; Market.normalize(s2);
  ok("normalize: malformed market -> fresh", s2.market && typeof s2.market.hist === "object");

  // oversized array trimmed to MAX_SAMPLES (keeps most recent)
  const big = []; for (let i = 0; i < Market.MAX_SAMPLES + 40; i++) big.push({ t: i, total: i, avg: 5 });
  const s3 = { market: { hist: { wood: big }, head: 9999, len: 9999 } };
  Market.normalize(s3);
  ok("normalize: oversized array trimmed to cap", s3.market.hist.wood.length === Market.MAX_SAMPLES);
  ok("normalize: trim keeps most-recent samples",
     s3.market.hist.wood[s3.market.hist.wood.length - 1].t === Market.MAX_SAMPLES + 40 - 1);
  ok("normalize: len clamped to cap", s3.market.len === Market.MAX_SAMPLES);

  // drops unknown goods, drops malformed records
  const s4 = { market: { hist: {
    wood: [{ t: 0, total: 5, avg: 3 }, { t: 1, total: "x", avg: 3 }, null, { t: 2, total: 7, avg: NaN }],
    __not_a_good: [{ t: 0, total: 1, avg: 1 }],
  }, head: 2, len: 2 } };
  Market.normalize(s4);
  ok("normalize: unknown good dropped", s4.market.hist.__not_a_good === undefined);
  ok("normalize: malformed records dropped, valid kept", s4.market.hist.wood.length === 1 && s4.market.hist.wood[0].total === 5);
  ok("normalize: every CONFIG good has an array", Object.keys(CONFIG.goods).every(g => Array.isArray(s4.market.hist[g])));
})();

// ---- determinism: same state in -> same sample out ----
(() => {
  const build = () => freshState([town(1, "wood", 33, 9), town(2, "wood", 11, 7)]);
  const a = build(); Market.tick(a);
  const b = build(); Market.tick(b);
  ok("tick is deterministic", JSON.stringify(a.market.hist.wood) === JSON.stringify(b.market.hist.wood));
})();

console.log(`market.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
