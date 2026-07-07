/*
 * Headless tests for TW.MapGen (Task T2, Session #3).
 * Run:  node test/mapgen.test.js
 *
 * Single-file constraint: TW.MapGen lives inside index.html between the
 * TW-MAPGEN-CORE markers. This harness extracts that DOM-free block and evals
 * it in a plain sandbox (no canvas / window / document needed).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const startMark = html.indexOf('=== TW-MAPGEN-CORE-START ===');
const endMark = html.indexOf('=== TW-MAPGEN-CORE-END ===');
if (startMark < 0 || endMark < 0) throw new Error('TW-MAPGEN-CORE markers not found in index.html');
// Slice from the opening /* of the start marker to the opening /* of the end
// marker so the extracted block is syntactically balanced JS.
const src = html.slice(html.lastIndexOf('/*', startMark), html.lastIndexOf('/*', endMark));

const sandbox = { module: { exports: {} }, Math, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const TW = sandbox.module.exports;
const { MapGen, CONFIG } = TW;

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.error('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}

/* Deep-equal that understands Map (for the determinism check). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !deepEqual(v, b.get(k))) return false; }
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

/* --- DoD: determinism --- */
{
  const m1 = MapGen.generate(42, 14);
  const m2 = MapGen.generate(42, 14);
  ok('generate(42,14) twice ⇒ deep-equal (determinism)', deepEqual(m1, m2));

  const m3 = MapGen.generate(43, 14);
  let differs = false;
  for (const [k, h] of m1.hexes) if (m3.hexes.get(k).terrain !== h.terrain) { differs = true; break; }
  ok('different seed ⇒ different terrain', differs);

  ok('string seeds deterministic', deepEqual(MapGen.generate('winds', 6), MapGen.generate('winds', 6)));
}

/* --- DoD: hex count = axial radius formula 3·r·(r+1)+1 --- */
{
  for (const R of [1, 5, 8, 14]) {
    const map = MapGen.generate(7, R);
    const expected = 3 * R * (R + 1) + 1;
    ok(`hex count R=${R} = 3·r·(r+1)+1 (${expected})`, map.hexes.size === expected, String(map.hexes.size));
    ok(`GameMap.radius echoes R=${R}`, map.radius === R);
  }
}

/* --- DoD: every terrain is in the enum + Hex shape is correct --- */
{
  const map = MapGen.generate(42, 14);
  const enum_ = new Set(MapGen.TERRAINS);
  let allInEnum = true, shapeOK = true, keyOK = true;
  const kinds = new Set();
  for (const [k, h] of map.hexes) {
    if (!enum_.has(h.terrain)) allInEnum = false;
    kinds.add(h.terrain);
    if (typeof h.q !== 'number' || typeof h.r !== 'number' ||
        typeof h.terrain !== 'string' || typeof h.revealed !== 'boolean') shapeOK = false;
    if (k !== h.q + ',' + h.r) keyOK = false;
  }
  ok('every hex terrain ∈ enum', allInEnum);
  ok('Hex shape = {q,r,terrain,revealed}', shapeOK);
  ok('hexes keyed by `${q},${r}`', keyOK);
  ok('terrain enum is the agreed 7 strings',
    JSON.stringify(MapGen.TERRAINS) === JSON.stringify(['meadow', 'forest', 'hills', 'mountains', 'water', 'field', 'wasteland']));
  ok('biome variety (≥4 kinds present)', kinds.size >= 4, [...kinds].join(','));
}

/* --- DoD: ~7 hexes revealed at start (center + ring 1) --- */
{
  const map = MapGen.generate(42, 14);
  let revealed = 0;
  for (const h of map.hexes.values()) if (h.revealed) revealed++;
  ok('~7 hexes revealed at start (center + ring)', revealed === 7, String(revealed));
  ok('castle center (0,0) revealed', map.hexes.get('0,0').revealed === true);
  ok('castle center is buildable land', CONFIG.terrain[map.hexes.get('0,0').terrain].buildable === true,
    map.hexes.get('0,0').terrain);
}

/* --- extra: RNG + noise sanity --- */
{
  const { mulberry32, seedToInt, fractalNoise } = MapGen._internals;
  const a = mulberry32(42)(), b = mulberry32(42)(), c = mulberry32(43)();
  ok('mulberry32 deterministic + in [0,1)', a === b && a >= 0 && a < 1);
  ok('mulberry32 seed-sensitive', a !== c);
  ok('seedToInt stable for strings', seedToInt('abc') === seedToInt('abc') && seedToInt('abc') !== seedToInt('abd'));
  ok('numeric seed passes through', seedToInt(42) === 42);
  const v = fractalNoise(1.5, -2.5, 123, 4);
  ok('fractalNoise in ~[0,1] + deterministic', v >= 0 && v <= 1 && v === fractalNoise(1.5, -2.5, 123, 4));
}

console.log(`\nTW.MapGen tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
