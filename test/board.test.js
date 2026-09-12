// Headless test for Trade Winds Phase 1 pure cores (HexMath, MapGen, noise).
// Runs the code between the PURE_CORE markers in index.html — no browser needed.
//   node test/board.test.js
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
  m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.MapGen=MapGen;" +
  "this.mulberry32=mulberry32; this.hashSeed=hashSeed; this.makeValueNoise=makeValueNoise;",
  sandbox
);
const { CONFIG, HexMath, MapGen, mulberry32, makeValueNoise } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// ---- HexMath ----
ok("dist self is 0", HexMath.dist(0, 0, 0, 0) === 0);
ok("dist neighbor is 1", HexMath.dist(0, 0, 1, 0) === 1);
ok("dist known pair", HexMath.dist(0, 0, 2, -1) === 2);
ok("neighbors count 6", HexMath.neighbors(0, 0).length === 6);
ok("neighbors all dist 1", HexMath.neighbors(3, -2).every(n => HexMath.dist(3, -2, n.q, n.r) === 1));

// range(n) returns the correct hex count: 3n^2+3n+1
for (const n of [0, 1, 2, 3, 14]) {
  ok(`range(${n}) count`, HexMath.range(0, 0, n).length === 3 * n * n + 3 * n + 1);
}
ok("range all within n", HexMath.range(0, 0, 3).every(h => HexMath.dist(0, 0, h.q, h.r) <= 3));

// pixel<->hex round-trips exactly for every hex on a radius-14 board
let rtFail = 0;
for (let q = -14; q <= 14; q++) {
  for (let r = Math.max(-14, -q - 14); r <= Math.min(14, -q + 14); r++) {
    const p = HexMath.hexToPixel(q, r, 24);
    const back = HexMath.pixelToHex(p.x, p.y, 24);
    if (back.q !== q || back.r !== r) rtFail++;
  }
}
ok("pixel<->hex round-trip (all 631 hexes)", rtFail === 0);

// ---- mulberry32 determinism ----
const a = mulberry32(12345), b = mulberry32(12345);
ok("mulberry32 deterministic", a() === b() && a() === b());
ok("mulberry32 in [0,1)", (() => { const r = mulberry32(7); for (let i = 0; i < 1000; i++) { const v = r(); if (v < 0 || v >= 1) return false; } return true; })());

// ---- value noise ----
const noise = makeValueNoise(999);
ok("noise deterministic", noise(1.5, 2.5, 4) === makeValueNoise(999)(1.5, 2.5, 4));
ok("noise in [0,1]", (() => {
  for (let i = 0; i < 500; i++) { const v = noise(i * 0.37, i * 0.19, 4); if (v < 0 || v > 1) return false; }
  return true;
})());

// ---- MapGen v2 (TV2: preset-driven, clumped, ringed deposits, playable) ----
// helper: distance from castle
const dc = (q, r) => HexMath.dist(0, 0, q, r);
const presetIds = Object.keys(CONFIG.mapPresets);
ok("presets exist (fertile/oasis/big_world)", ["fertile", "oasis", "big_world"].every(p => CONFIG.mapPresets[p]));

// the board is a RECTANGLE (CONFIG.map.rect) — width*height hexes, no clipping.
const RECT_N = CONFIG.map.rect.width * CONFIG.map.rect.height;   // 50*25 = 1250
const map1 = MapGen.generate("harbor", 14, "fertile");
const map2 = MapGen.generate("harbor", 14, "fertile");
ok("fertile map hex count = rect w*h", map1.hexes.size === RECT_N);
ok("default preset is fertile", MapGen.generate("harbor").preset === "fertile");

// === TV2-FIX: multi-seed preset invariants (deposits/fish actually spawn,
// strict rings, fish playability, config-derived terrain mix). The invariant
// checks run over SEVERAL seeds so none of them can pass vacuously on one
// lucky map; the heavier one-off checks stay on the first seed.
const SEEDS = ["harbor", "flint", "gale", "sirocco", "monsoon"];
const DEP_ALL = { stone: "stone_deposit", clay: "clay_deposit", iron: "iron_deposit", coal: "coal_deposit", gold: "gold_deposit" };
const buildableT = t => !!(CONFIG.terrain[t] && CONFIG.terrain[t].buildable);

for (const pid of presetIds) {
  const preset = CONFIG.mapPresets[pid];
  const rad = preset.radius;
  const a = MapGen.generate("harbor", rad, pid);
  const b = MapGen.generate("harbor", rad, pid);
  // (a) determinism: same seed+preset ⇒ identical terrain
  ok(`[${pid}] deterministic per seed+preset`, (() => {
    if (a.hexes.size !== b.hexes.size) return false;
    for (const [k, h] of a.hexes) { const o = b.hexes.get(k); if (!o || o.terrain !== h.terrain) return false; }
    return true;
  })());
  // (b) different seeds differ
  ok(`[${pid}] different seeds differ`, (() => {
    const other = MapGen.generate("flint", rad, pid);
    let diff = 0;
    for (const [k, h] of a.hexes) { const o = other.hexes.get(k); if (o && o.terrain !== h.terrain) diff++; }
    return diff > 20;
  })());
  // (c) castle buildable
  ok(`[${pid}] castle centre buildable`, CONFIG.terrain[a.hexes.get("0,0").terrain].buildable === true);
  // (d) every terrain key known
  ok(`[${pid}] every terrain known`, (() => {
    for (const h of a.hexes.values()) if (!CONFIG.terrain[h.terrain]) return false;
    return true;
  })());
  // (e) clumping sanity: mean same-terrain-neighbour fraction is high (blobs,
  //     not per-hex noise). Threshold 0.45.
  ok(`[${pid}] terrain is clumped (>0.45 same-neighbour)`, (() => {
    let sum = 0, n = 0;
    for (const h of a.hexes.values()) {
      const ns = HexMath.neighbors(h.q, h.r).map(x => a.hexes.get(HexMath.key(x.q, x.r))).filter(Boolean);
      if (!ns.length) continue;
      const same = ns.filter(x => x.terrain === h.terrain).length;
      sum += same / ns.length; n++;
    }
    return n > 0 && (sum / n) > 0.45;
  })());

  // ---- multi-seed invariants (can't pass vacuously) ----
  for (const seed of SEEDS) {
    const map = MapGen.generate(seed, rad, pid);
    const hexes = [...map.hexes.values()];
    const count = t => hexes.filter(h => h.terrain === t).length;
    const tag = `[${pid}/${seed}]`;

    // (f) every configured deposit type actually SPAWNS, and its tiles all sit
    //     at dist >= ring — STRICT (growth included), not just the seed hex.
    for (const t of Object.keys(DEP_ALL)) {
      const cfg = preset.deposits[t]; if (!cfg) continue;
      const tiles = hexes.filter(h => h.terrain === DEP_ALL[t]);
      ok(`${tag} ${t} deposit spawns (>0 tiles)`, tiles.length > 0);
      ok(`${tag} ${t} strictly beyond ring ${cfg.ring}`, tiles.every(h => dc(h.q, h.r) >= (cfg.ring || 0)));
    }
    // fish spawns too (fish is T1 — exempt from rings, but it must EXIST)
    ok(`${tag} fish tiles > 0`, count("fish") > 0);
    // every fish tile borders buildable land (a shore city can reach it)
    ok(`${tag} every fish tile borders buildable land`, hexes.every(h => h.terrain !== "fish" ||
      HexMath.neighbors(h.q, h.r).some(n => { const nh = map.hexes.get(HexMath.key(n.q, n.r)); return nh && buildableT(nh.terrain); })));

    // (g) playability near the castle: fertile + forest + a USABLE fish tile
    //     (dist 2..6 — the castle-gap rule forbids dist<2 — with a buildable
    //     neighbour so the fishery is actually placeable).
    const nearF = hexes.filter(h => dc(h.q, h.r) <= 4);
    ok(`${tag} >=6 fertile near castle`, nearF.filter(h => h.terrain === "fertile").length >= 6);
    ok(`${tag} >=3 forest near castle`, nearF.filter(h => h.terrain === "forest").length >= 3);
    ok(`${tag} >=1 usable fish within 6 of castle`, hexes.some(h => h.terrain === "fish" &&
      dc(h.q, h.r) >= 2 && dc(h.q, h.r) <= 6 &&
      HexMath.neighbors(h.q, h.r).some(n => { const nh = map.hexes.get(HexMath.key(n.q, n.r)); return nh && buildableT(nh.terrain); })));

    // (h) balance guard — the preset's EXPECTED terrain mix, derived from its
    //     own config (replaces the old global 40%-cap / all-biomes check):
    //     every configured biome is present…
    for (const g of Object.keys(preset.groundMix)) {
      if (preset.groundMix[g] > 0) ok(`${tag} ground '${g}' present`, count(g) > 0);
    }
    if ((preset.forest.patches || 0) > 0) ok(`${tag} forest present`, count("forest") > 0);
    if ((preset.water.frac || 0) > 0) ok(`${tag} water present`, count("water") > 0);
    if (preset.snow && preset.snow.mode === "pole") ok(`${tag} snow present`, count("snow") > 0);
    if ((preset.mountainFrac || 0) > 0) ok(`${tag} mountains present`, count("mountains") > 0);
    //     …the ground-share ORDER follows groundMix (any pair configured at a
    //     >=2x ratio must come out larger — e.g. oasis: desert+barren dominate
    //     its sliver of fertile; fertile preset: fertile > desert)…
    const gm = preset.groundMix;
    for (const x of Object.keys(gm)) for (const y of Object.keys(gm)) {
      if (gm[x] >= 2 * gm[y]) ok(`${tag} ground mix order ${x} > ${y}`, count(x) > count(y));
    }
    //     …and no single terrain swamps the board. (Cap is 60%: the oasis preset
    //     is intentionally desert-dominant — ~52% desert on the rectangle — which
    //     is thematic, not a bug; the guard still catches a true one-terrain map.)
    ok(`${tag} no terrain > 60% of board`, hexes.length > 0 &&
      Object.values(hexes.reduce((m2, h) => (m2[h.terrain] = (m2[h.terrain] || 0) + 1, m2), {})).every(c => c <= hexes.length * 0.6));
  }
}
// === /TV2-FIX ===

// (h) obstacles are not roadable
ok("mountains not roadable", CONFIG.terrain.mountains.road === false);
ok("water not roadable", CONFIG.terrain.water.road === false);
ok("fish not roadable", CONFIG.terrain.fish.road === false);

// ---- Custom Map: presets + tier tables + applyTiers + custom generate --------
ok("new presets exist (highlands/isles)", ["highlands", "isles"].every(p => CONFIG.mapPresets[p]));
ok("all 6 tier axes present", ["fertility", "worldAge", "climate", "seaLevel", "resources", "size"]
  .every(a => CONFIG.mapTiers[a] && Array.isArray(CONFIG.mapTiers[a].options) && CONFIG.mapTiers[a].options.length === 3));
ok("every preset carries a rect + tiers block", Object.values(CONFIG.mapPresets)
  .every(p => p.rect && p.rect.width && p.rect.height && p.tiers));

const FBASE = CONFIG.mapPresets.fertile;
// --- applyTiers moves exactly the knobs each axis owns ---
ok("size:large -> rect 66x33 + radius 18", (() => {
  const p = MapGen.applyTiers(FBASE, { size: "large" });
  return p.rect.width === 66 && p.rect.height === 33 && p.radius === 18;
})());
ok("size:small -> rect 36x18", (() => {
  const p = MapGen.applyTiers(FBASE, { size: "small" });
  return p.rect.width === 36 && p.rect.height === 18;
})());
ok("worldAge:young -> mountainFrac 0.12", MapGen.applyTiers(FBASE, { worldAge: "young" }).mountainFrac === 0.12);
ok("worldAge:old -> mountainFrac 0.02", MapGen.applyTiers(FBASE, { worldAge: "old" }).mountainFrac === 0.02);
ok("fertility:arid drops fertile share vs lush", (() => {
  const lush = MapGen.applyTiers(FBASE, { fertility: "lush" }).groundMix.fertile;
  const arid = MapGen.applyTiers(FBASE, { fertility: "arid" }).groundMix.fertile;
  return lush > arid;
})());
ok("fertility:arid keeps forest.patches >= 2 (floor)", MapGen.applyTiers(FBASE, { fertility: "arid" }).forest.patches >= 2);
ok("seaLevel:high -> water.frac 0.30 on a rim base", MapGen.applyTiers(FBASE, { seaLevel: "high" }).water.frac === 0.30);
ok("seaLevel is INERT when base water.mode is none", (() => {
  const dryBase = JSON.parse(JSON.stringify(FBASE)); dryBase.water = { mode: "none", frac: 0 };
  return MapGen.applyTiers(dryBase, { seaLevel: "high" }).water.frac === 0;
})());
ok("climate:warm -> snow off", MapGen.applyTiers(FBASE, { climate: "warm" }).snow.mode === "none");
ok("climate:cold -> snow rows 4 + desert folded into barren", (() => {
  const p = MapGen.applyTiers(FBASE, { climate: "cold" });
  return p.snow.mode === "pole" && p.snow.rows === 4 && (p.groundMix.desert || 0) === 0;
})());
ok("resources:rich has more stone than scarce", (() => {
  const rich = MapGen.applyTiers(FBASE, { resources: "rich" }).deposits.stone.count;
  const scarce = MapGen.applyTiers(FBASE, { resources: "scarce" }).deposits.stone.count;
  return rich > scarce && scarce >= 1;
})());
ok("resources:scarce never zeroes a deposit type (min 1)", (() => {
  const d = MapGen.applyTiers(FBASE, { resources: "scarce" }).deposits;
  return ["stone", "clay", "iron", "coal", "gold"].every(k => (d[k].count || 0) >= 1);
})());

// --- guardrails hold across a broad sweep of tier combos on every base preset ---
const AXES = ["fertility", "worldAge", "climate", "seaLevel", "resources", "size"];
ok("guardrails hold for every tier combo (mtn<=0.14, patches>=2, fertile>=20%)", (() => {
  const opts = AXES.map(a => CONFIG.mapTiers[a].options.map(o => o.id));
  for (const baseId of presetIds) {
    // sweep fertility x climate x size fully; sample age/resources/sea at extremes
    for (const fert of opts[0]) for (const clim of opts[2]) for (const size of opts[5])
      for (const age of [opts[1][0], opts[1][2]]) for (const res of [opts[4][0], opts[4][2]]) for (const sea of [opts[3][0], opts[3][2]]) {
        const p = MapGen.applyTiers(CONFIG.mapPresets[baseId], { fertility: fert, worldAge: age, climate: clim, seaLevel: sea, resources: res, size: size });
        if (!(p.mountainFrac <= 0.14 + 1e-9)) return false;
        if (!(p.forest.patches >= 2)) return false;
        const g = p.groundMix, sum = (g.fertile || 0) + (g.barren || 0) + (g.desert || 0);
        if (sum > 0 && (g.fertile || 0) / sum < 0.20 - 1e-9) return false;
      }
  }
  return true;
})());

// --- custom generate: determinism + playability across a spread of combos ---
// the castle must sit on the LARGEST road-connected component (ensureCastleConnected).
function castleOnMainLandmass(map) {
  const roadable = (h) => { const td = h && CONFIG.terrain[h.terrain]; return !!(td && td.road); };
  const comp = new Map(); const sizes = []; let next = 0;
  for (const h of map.hexes.values()) {
    const k0 = HexMath.key(h.q, h.r);
    if (comp.has(k0) || !roadable(h)) continue;
    const id = next++; let size = 0; const stack = [k0]; comp.set(k0, id);
    while (stack.length) {
      const k = stack.pop(); size++; const c = MapGen.parseKey(k);
      for (const n of HexMath.neighbors(c.q, c.r)) {
        const nk = HexMath.key(n.q, n.r); const nh = map.hexes.get(nk);
        if (nh && roadable(nh) && !comp.has(nk)) { comp.set(nk, id); stack.push(nk); }
      }
    }
    sizes[id] = size;
  }
  const cid = comp.get(HexMath.key(0, 0));
  if (cid == null) return false;
  let mainId = 0; for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[mainId]) mainId = i;
  return cid === mainId;
}

const CUSTOM_COMBOS = [
  { base: "fertile" },                                                                                                            // all-normal
  { base: "fertile", size: "large", resources: "rich", fertility: "arid", climate: "warm", seaLevel: "low", worldAge: "young" }, // dry hot crowded
  { base: "fertile", size: "small", resources: "scarce", fertility: "lush", climate: "cold", seaLevel: "high", worldAge: "old" },// small wet cold
  { base: "isles", seaLevel: "high", size: "large", fertility: "lush" },                                                         // big archipelago
  { base: "oasis", fertility: "arid", climate: "warm", seaLevel: "low", resources: "scarce" },                                   // harsh desert
  { base: "highlands", worldAge: "young", climate: "cold", resources: "rich", seaLevel: "low" },                                 // rugged
  { base: "big_world", size: "large", resources: "rich" },                                                                       // crowd guard
];
let comboIdx = 0;
for (const combo of CUSTOM_COMBOS) {
  const tag = `[custom#${comboIdx++} ${combo.base}]`;
  // determinism: same seed + tiers => identical terrain
  ok(`${tag} custom deterministic`, (() => {
    const a = MapGen.generate("harbor", null, "custom", combo);
    const b = MapGen.generate("harbor", null, "custom", combo);
    if (a.hexes.size !== b.hexes.size) return false;
    for (const [k, h] of a.hexes) { const o = b.hexes.get(k); if (!o || o.terrain !== h.terrain) return false; }
    return true;
  })());
  ok(`${tag} custom preset id = "custom"`, MapGen.generate("harbor", null, "custom", combo).preset === "custom");
  // playability across a couple seeds (leans on repair + connectivity guarantees)
  for (const seed of ["harbor", "sirocco"]) {
    const map = MapGen.generate(seed, null, "custom", combo);
    const hexes = [...map.hexes.values()];
    const near = hexes.filter(h => dc(h.q, h.r) <= 4);
    ok(`${tag}/${seed} castle buildable`, buildableT(map.hexes.get("0,0").terrain));
    ok(`${tag}/${seed} castle on main landmass (connected)`, castleOnMainLandmass(map));
    ok(`${tag}/${seed} >=6 fertile within 4`, near.filter(h => h.terrain === "fertile").length >= 6);
    ok(`${tag}/${seed} >=3 forest within 4`, near.filter(h => h.terrain === "forest").length >= 3);
    ok(`${tag}/${seed} >=1 usable fish within 6`, hexes.some(h => h.terrain === "fish" && dc(h.q, h.r) >= 2 && dc(h.q, h.r) <= 6 &&
      HexMath.neighbors(h.q, h.r).some(n => { const nh = map.hexes.get(HexMath.key(n.q, n.r)); return nh && buildableT(nh.terrain); })));
    ok(`${tag}/${seed} every deposit type spawns`, ["stone", "clay", "iron", "coal", "gold"]
      .every(t => hexes.some(h => h.terrain === DEP_ALL[t])));
  }
}
// custom board size actually changes with the Size axis (rectangle board)
ok("custom size:large board is 66*33 hexes", MapGen.generate("harbor", null, "custom", { base: "fertile", size: "large" }).hexes.size === 66 * 33);
ok("custom size:small board is 36*18 hexes", MapGen.generate("harbor", null, "custom", { base: "fertile", size: "small" }).hexes.size === 36 * 18);

console.log("\nterrain histogram (seed 'harbor', fertile):");
const hist = {};
for (const h of map1.hexes.values()) hist[h.terrain] = (hist[h.terrain] || 0) + 1;
for (const [t, c] of Object.entries(hist).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${t.padEnd(14)} ${String(c).padStart(3)}  ${"█".repeat(Math.round(c / map1.hexes.size * 40))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
