"use strict";
// BAL2 diagnostic harness — shared library. Loads the pure core from index.html,
// builds a faithful controlled state, and exposes a greedy "player" + snapshot
// runner. NOT part of the test suite. See tools/playthrough.js.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadCore(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
  if (!m) throw new Error("PURE_CORE markers not found");
  const sandbox = { console };
  vm.createContext(sandbox);
  // Export every known pure-core global that EXISTS in this build (typeof guard), so a
  // retired module (e.g. Quests, removed in v0.34) doesn't crash the harness.
  const NAMES = ["CONFIG", "HexMath", "MapGen", "Sim", "Pathing", "Trade", "Buildings", "Research",
    "ResearchEconomy", "CastleMarket", "Market", "Ledger", "Town", "Castle", "Quests", "Needs",
    "Provisioner", "MissionEngine", "mulberry32"];
  vm.runInContext(
    m[1] + "\n" + NAMES.map(n => "if (typeof " + n + " !== 'undefined') this." + n + " = " + n + ";").join("\n"),
    sandbox
  );
  return sandbox;
}

module.exports = { loadCore };
