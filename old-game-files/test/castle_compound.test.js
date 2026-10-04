// Headless test for Trade Winds — v0.51 CASTLE COMPOUND placement.
// Castle buildings (Research Center, Advanced Provisioner, Provisioner) may sit next
// to each other: a site is valid when it touches the castle OR touches a castle
// building that chains back to it, so the compound grows outward. They still keep a
// 1-hex gap from every city, and cities still may not touch the compound.
//   node test/castle_compound.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: PURE_CORE markers not found"); process.exit(1); }
const s = {};
vm.createContext(s);
vm.runInContext(m[1] + "\nthis.CONFIG=CONFIG; this.Buildings=Buildings; this.HexMath=HexMath;", s);
const { CONFIG, Buildings, HexMath } = s;
const K = (q, r) => HexMath.key(q, r);

let pass = 0, fail = 0;
function ok(name, cond, note) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (note ? "  -- " + note : "")); } }

// The Advanced Provisioner is research-gated; lift the gate so placement rules are
// what's under test here.
CONFIG.advancedProvisioner = Object.assign({}, CONFIG.advancedProvisioner, { research: null });

const C = Buildings.castleHex();
function mkState() {
  const hexes = new Map();
  for (let q = C.q - 8; q <= C.q + 8; q++) for (let r = C.r - 8; r <= C.r + 8; r++)
    hexes.set(K(q, r), { q, r, terrain: "fertile" });
  return { map: { hexes }, roads: new Set(), towns: [], treasury: 1e9,
           researchCenter: null, advancedProvisioner: null, provisionerBuilding: null };
}
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
// Walk straight out from the castle along one axial direction.
const E = (n) => ({ q: C.q + n, r: C.r });          // east, n tiles out

// ---- 1) First building: beside the castle -----------------------------------
{
  const st = mkState();
  ok("Research Center beside the castle is allowed", Buildings.canPlaceResearchCenter(st, E(1).q, E(1).r).ok);
  const far = Buildings.canPlaceResearchCenter(st, E(2).q, E(2).r);
  ok("a lone site 2 tiles out (touching nothing) is rejected", !far.ok && /connect/i.test(far.reason), far.reason);
  const onCastle = Buildings.canPlaceResearchCenter(st, C.q, C.r);
  ok("the castle hex itself is rejected", !onCastle.ok);
}

// ---- 2) Chains: castle buildings may touch and extend outward ---------------
{
  const st = mkState();
  ok("place the Research Center beside the castle", Buildings.placeResearchCenter(st, E(1).q, E(1).r).ok);
  // Provisioner 2 tiles out, touching only the Research Center → joins via the chain.
  const two = Buildings.canPlaceProvisioner(st, E(2).q, E(2).r);
  ok("Provisioner 2 tiles out, next to the Research Center, is allowed", two.ok, two.reason);
  ok("…and that site really is 2 tiles from the castle and not beside it",
     dist(E(2), C) === 2 && !Buildings.touchesCastle(st, E(2).q, E(2).r));
  ok("place it", Buildings.placeProvisioner(st, E(2).q, E(2).r).ok);
  // Advanced Provisioner 3 tiles out, touching only the Provisioner.
  const three = Buildings.canPlaceAdvancedProvisioner(st, E(3).q, E(3).r);
  ok("Advanced Provisioner 3 tiles out, chained through two castle buildings, is allowed", three.ok, three.reason);
  ok("compound = castle + 3 connected buildings once placed",
     Buildings.placeAdvancedProvisioner(st, E(3).q, E(3).r).ok && Buildings.castleCompound(st).size === 4);
}

// ---- 3) Touching each other right beside the castle is fine too ------------
{
  const st = mkState();
  Buildings.placeResearchCenter(st, E(1).q, E(1).r);
  // A castle neighbour that also touches the Research Center at E(1).
  const both = HexMath.neighbors(C.q, C.r).find(n => HexMath.neighbors(n.q, n.r).some(x => x.q === E(1).q && x.r === E(1).r));
  const res = Buildings.canPlaceProvisioner(st, both.q, both.r);
  ok("a castle building may sit directly against another one (no forced gap)", res.ok, res.reason);
  const onTop = Buildings.canPlaceProvisioner(st, E(1).q, E(1).r);
  ok("but not ON another castle building", !onTop.ok);
}

// ---- 4) Frontier (placement highlight) grows with the chain -----------------
{
  const st = mkState();
  const f0 = Buildings.castleCompoundFrontier(st);
  ok("with no castle buildings the frontier is the castle's 6 neighbours", f0.length === 6);
  Buildings.placeResearchCenter(st, E(1).q, E(1).r);
  const f1 = Buildings.castleCompoundFrontier(st).map(h => K(h.q, h.r));
  ok("after one building the frontier reaches 2 tiles out", f1.includes(K(E(2).q, E(2).r)));
  ok("the frontier never lists compound hexes", !f1.includes(K(C.q, C.r)) && !f1.includes(K(E(1).q, E(1).r)));
}

// ---- 5) Still a 1-hex gap from cities, both ways ----------------------------
{
  const st = mkState();
  // A city whose centre sits 4 tiles east of the castle.
  st.towns.push({ id: 1, q: C.q + 4, r: C.r, level: 1, buildings: [], stock: {}, pop: {} });
  Buildings.placeResearchCenter(st, E(1).q, E(1).r);
  Buildings.placeProvisioner(st, E(2).q, E(2).r);
  const touchCity = Buildings.canPlaceAdvancedProvisioner(st, E(3).q, E(3).r);   // E(3) is beside the city centre E(4)
  ok("a castle building may not be placed touching a city", !touchCity.ok && /city/i.test(touchCity.reason), touchCity.reason);
  // A city building beside a castle building is still refused (city-side rule): E(3)
  // touches both the city centre E(4) and the Provisioner at E(2).
  const cityBld = Buildings.canPlaceBuilding(st, "hut", E(3).q, E(3).r);
  ok("a city building next to a castle building is still refused",
     !cityBld.ok && /castle/i.test(cityBld.reason || ""), cityBld && cityBld.reason);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
