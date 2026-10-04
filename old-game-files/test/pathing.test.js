// Headless test for Trade Winds Phase 3 Pathing (road graph + Dijkstra + cache).
// Evals the code between the PURE_CORE markers in index.html — no browser.
//   node test/pathing.test.js
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
  m[1] + "\nthis.HexMath=HexMath; this.Pathing=Pathing;",
  sandbox
);
const { HexMath, Pathing } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}
const K = (q, r) => HexMath.key(q, r);

// Helper: build a state with a road Set from a list of [q,r] hexes.
function stateWithRoads(hexes) {
  const roads = new Set(hexes.map(([q, r]) => K(q, r)));
  return { roads };
}

ok("Pathing.route is a function", typeof Pathing.route === "function");
ok("Pathing.invalidate is a function", typeof Pathing.invalidate === "function");

// --- 1. Straight road between two towns: expected path + cost -------------
// Towns A(0,0) and B(4,0). Road hexes at (1,0),(2,0),(3,0). A's neighbour (1,0)
// is a road and B's neighbour (3,0) is a road, so both are on the network.
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [2, 0], [3, 0]]);
  const r = Pathing.route(st, K(0, 0), K(4, 0));
  ok("straight road: route found", r !== null);
  ok("straight road: path endpoints", r && r.path[0] === K(0, 0) && r.path[r.path.length - 1] === K(4, 0));
  ok("straight road: exact path", r && JSON.stringify(r.path) === JSON.stringify([K(0, 0), K(1, 0), K(2, 0), K(3, 0), K(4, 0)]));
  ok("straight road: cost = steps = 4", r && r.cost === 4);
  ok("straight road: cost = path length - 1", r && r.cost === r.path.length - 1);
}

// --- 2. Same-hex query is trivially reachable at cost 0 -------------------
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0]]);
  const r = Pathing.route(st, K(0, 0), K(0, 0));
  ok("same hex: path is [self]", r && r.path.length === 1 && r.path[0] === K(0, 0));
  ok("same hex: cost 0", r && r.cost === 0);
}

// --- 3. Two towns with no connecting road: OFF-ROAD fallback (road:false) -
// OFFROAD: trade works without roads (carts just travel at half speed). route()
// now always returns a path; the `road` flag distinguishes road vs off-road.
Pathing.invalidate();
{
  // Road island near A, but nothing reaching B(10,0).
  const st = stateWithRoads([[1, 0], [2, 0]]);
  const r = Pathing.route(st, K(0, 0), K(10, 0));
  ok("no connecting road: off-road fallback (road:false)", r && r.road === false);
  ok("off-road: path joins the endpoints", r && r.path[0] === K(0, 0) && r.path[r.path.length - 1] === K(10, 0));
}
// Two towns, roads only near each, gap in between → off-road fallback.
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [9, 0]]);   // A(0,0) touches (1,0); B(10,0) touches (9,0); gap 2..8
  const r = Pathing.route(st, K(0, 0), K(10, 0));
  ok("gap between road islands: off-road fallback (road:false)", r && r.road === false);
}

// --- 4. Adjacent towns with no road at all still connect (neighbour rule) -
// A(0,0), B(1,0) are neighbours; endpoints connect directly even with no roads.
Pathing.invalidate();
{
  const st = stateWithRoads([]);
  const r = Pathing.route(st, K(0, 0), K(1, 0));
  ok("adjacent towns: direct road link cost 1", r && r.cost === 1 && r.path.length === 2 && r.road === true);
  const r2 = Pathing.route(st, K(0, 0), K(5, 0));
  ok("non-adjacent, no roads: off-road fallback (road:false)", r2 && r2.road === false);
}

// --- 5. Cache: repeat query returns an equal result ----------------------
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [2, 0], [3, 0]]);
  const r1 = Pathing.route(st, K(0, 0), K(4, 0));
  const r2 = Pathing.route(st, K(0, 0), K(4, 0));
  ok("cache: repeat equal", JSON.stringify(r1) === JSON.stringify(r2));
  ok("cache: same object reference (memoized)", r1 === r2);
  // Off-road routes are memoized too (same object reference).
  const n1 = Pathing.route(st, K(0, 0), K(20, 0));
  const n2 = Pathing.route(st, K(0, 0), K(20, 0));
  ok("cache: off-road route memoized", n1 && n1.road === false && n1 === n2);
}

// --- 6. Invalidation reflects a road being ADDED -------------------------
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [9, 0]]);   // gap 2..8 → off-road only
  const before = Pathing.route(st, K(0, 0), K(10, 0));
  ok("before add: off-road fallback (road:false)", before && before.road === false);
  // Fill the gap with a continuous road, then invalidate.
  for (let q = 2; q <= 8; q++) st.roads.add(K(q, 0));
  Pathing.invalidate();
  const r = Pathing.route(st, K(0, 0), K(10, 0));
  ok("after add + invalidate: road route (road:true)", r && r.road === true);
  ok("after add: cost = 10", r && r.cost === 10);
}

// --- 7. Invalidation reflects a road being REMOVED (the price-crisis cut) -
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [2, 0], [3, 0]]);
  ok("before cut: road route", Pathing.route(st, K(0, 0), K(4, 0)).road === true);
  st.roads.delete(K(2, 0));      // cut the middle of the road
  Pathing.invalidate();
  const after = Pathing.route(st, K(0, 0), K(4, 0));
  ok("after cut + invalidate: off-road fallback (road:false)", after && after.road === false);
}

// --- 8. Stale-cache guard: WITHOUT invalidate, the old result persists ----
// (Documents why every road mutation site must call Pathing.invalidate.)
Pathing.invalidate();
{
  const st = stateWithRoads([[1, 0], [2, 0], [3, 0]]);
  const before = Pathing.route(st, K(0, 0), K(4, 0));
  st.roads.delete(K(2, 0));       // mutate WITHOUT invalidating
  const stale = Pathing.route(st, K(0, 0), K(4, 0));
  ok("no-invalidate: stale cached hit returned", stale === before && stale !== null);
  Pathing.invalidate();
  ok("no-invalidate: after invalidate reflects cut (off-road, road:false)", Pathing.route(st, K(0, 0), K(4, 0)).road === false);
}

// --- 9. Dijkstra takes the shorter of two branches -----------------------
Pathing.invalidate();
{
  // Direct 2-step road (1,0),(2,0) to B(3,0); plus a longer detour loop.
  const st = stateWithRoads([
    [1, 0], [2, 0],                       // short: A-(1,0)-(2,0)-B  cost 3
    [0, 1], [1, 1], [2, 1], [3, 1],       // detour underneath (longer)
  ]);
  const r = Pathing.route(st, K(0, 0), K(3, 0));
  ok("dijkstra: picks short branch (cost 3)", r && r.cost === 3);
}

// --- 10. Cross-game contamination guard: a fresh state (as newGame() builds)
//     reuses coordinate keys from a PRIOR game (the castle is always at
//     (0,0), so this is the realistic case, not a contrived one) — WITHOUT
//     invalidate, Trade/ResearchEconomy would silently see the OLD game's
//     road graph. Documents the newGame()/loadGame() contract: they must call
//     Pathing.invalidate() exactly like every other state.roads mutation site
//     does (place ~6045, erase ~6059, Events bridge ~4747).
Pathing.invalidate();
{
  // "Game 1": a road connects A(0,0) to B(4,0).
  const game1 = stateWithRoads([[1, 0], [2, 0], [3, 0]]);
  const r1 = Pathing.route(game1, K(0, 0), K(4, 0));
  ok("game1: reachable", r1 !== null && r1.cost === 4);

  // "Game 2" (simulates newGame(): a brand-new state, roads reset to empty —
  // same coordinate keys reused). WITHOUT calling Pathing.invalidate() on the
  // reset (the bug), a query for the SAME fromKey|toKey pair wrongly returns
  // game1's cached route even though game2 has NO roads at all.
  const game2 = stateWithRoads([]);
  const leaked = Pathing.route(game2, K(0, 0), K(4, 0));
  ok("BUG DOCUMENTED: without invalidate, game2 leaks game1's cached route",
     leaked === r1 && leaked !== null);

  // The fix: newGame()/loadGame() must call Pathing.invalidate() on reset.
  Pathing.invalidate();
  const fixed = Pathing.route(game2, K(0, 0), K(4, 0));
  ok("after invalidate (the fix): game2 gets an off-road route, not game1's cached road route",
     fixed !== r1 && fixed && fixed.road === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
