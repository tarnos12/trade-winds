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
  vm.runInContext(
    m[1] +
      "\nthis.CONFIG=CONFIG;this.HexMath=HexMath;this.MapGen=MapGen;this.Sim=Sim;" +
      "this.Pathing=Pathing;this.Trade=Trade;this.Buildings=Buildings;this.Research=Research;" +
      "this.ResearchEconomy=ResearchEconomy;this.CastleMarket=CastleMarket;this.Market=Market;" +
      "this.Ledger=Ledger;this.Town=Town;this.Castle=Castle;this.Quests=Quests;this.Needs=Needs;" +
      "this.mulberry32=mulberry32;",
    sandbox
  );
  return sandbox;
}

module.exports = { loadCore };
