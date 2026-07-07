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

// ---- MapGen ----
const map1 = MapGen.generate("harbor", 14);
const map2 = MapGen.generate("harbor", 14);
ok("map hex count 631", map1.hexes.size === 631);
ok("map deterministic per seed", (() => {
  for (const [k, h] of map1.hexes) { if (map2.hexes.get(k).terrain !== h.terrain) return false; }
  return true;
})());
ok("different seeds differ", (() => {
  const other = MapGen.generate("flint", 14);
  let diff = 0;
  for (const [k, h] of map1.hexes) if (other.hexes.get(k).terrain !== h.terrain) diff++;
  return diff > 20;
})());
ok("castle centre is buildable", CONFIG.terrain[map1.hexes.get("0,0").terrain].buildable === true);
ok("every terrain is known", (() => {
  for (const h of map1.hexes.values()) if (!CONFIG.terrain[h.terrain]) return false;
  return true;
})());

// ---- terrain distribution sanity (island should have variety, not be one biome) ----
const hist = {};
for (const h of map1.hexes.values()) hist[h.terrain] = (hist[h.terrain] || 0) + 1;
const kinds = Object.keys(hist).length;
ok("map has all 7 terrain kinds", kinds === 7);
ok("water in 25%-38% range", hist.water / 631 >= 0.25 && hist.water / 631 <= 0.38);
ok("no single terrain > 40%", Object.values(hist).every(c => c / 631 <= 0.40));
ok("every land biome present", ["meadow", "forest", "hills", "mountains", "fertile", "wasteland"].every(t => hist[t] > 0));

console.log("\nterrain histogram (seed 'harbor'):");
for (const [t, c] of Object.entries(hist).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${t.padEnd(10)} ${String(c).padStart(3)}  ${"█".repeat(Math.round(c / 631 * 40))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
