#!/usr/bin/env node
"use strict";
/* =====================================================================
   Trade Winds build tool  —  "Modules + build → single file"
   ---------------------------------------------------------------------
   ZERO dependencies (pure Node, no npm). The SHIPPED artifact is the
   single self-contained index.html (Canvas 2D, opens from file://, no
   build step required to RUN). This tool only regenerates index.html
   after you edit the editable module sources in src/.

   MODEL — in-place region splice (incremental, always green):
     index.html contains permanent marker lines around each modularized
     subsystem:
         /* BUILD:<name> START * /
         ...module body...
         /* BUILD:<name> END * /
     For every module in MANIFEST that has BOTH (a) a src/<file> and
     (b) its marker pair present in index.html, build.js replaces the
     lines between the markers with the bytes of src/<file>. Modules not
     yet extracted have no markers/src and are left INLINE, untouched.
     => index.html is always the complete, runnable file; extraction can
        proceed one module at a time with every step behaviour-identical.

   USAGE:
     node tools/build.js            # splice src/*.js into index.html
     node tools/build.js --check    # build in-memory; fail if index.html
                                     #   would change (CI / pre-commit guard)
     node tools/build.js --extract  # (re)create src/*.js FROM the marked
                                     #   regions in index.html (bootstrap /
                                     #   re-sync a module's src to the file)

   Round-trip guarantee: extract then build reproduces index.html
   byte-for-byte (region = the lines strictly between the marker lines;
   src file = those lines + one trailing newline).
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const SRC = path.join(ROOT, "src");

// Canonical pure-core order (dependency order, top→bottom of PURE_CORE).
// `name` matches the /* BUILD:<name> START|END */ marker; `file` is src/<file>.
// Only modules whose markers AND src file both exist are spliced; the rest
// stay inline until the parallel team extracts them.
const MANIFEST = [
  { name: "config",           file: "config.js" },            // CONFIG constants (balance truth)
  { name: "rng",              file: "rng.js" },               // mulberry32 + hashSeed
  { name: "hexmath",          file: "hexmath.js" },           // HexMath axial math
  { name: "mapgen",           file: "mapgen.js" },            // makeValueNoise + MapGen v2
  { name: "goods",            file: "goods.js" },             // goods/buildings catalog + prices
  { name: "sim",              file: "sim.js" },               // economy tick
  { name: "buildings",        file: "buildings.js" },         // placement/construction/housing
  { name: "pathing",          file: "pathing.js" },           // road graph + Dijkstra
  { name: "trade",            file: "trade.js" },             // cart dispatch / transactions
  { name: "research",         file: "research.js" },          // tech tree data + engine
  { name: "research-economy", file: "research-economy.js" },  // castle research economy
  { name: "progress",         file: "progress.js" },          // leveling / quests / prestige
  { name: "events",           file: "events.js" },            // cozy market events
  { name: "kingdom-market",   file: "kingdom-market.js" },    // KR-A kingdom resource market (Market)
  { name: "ledger",           file: "ledger.js" },            // PP-A city gold ledger (Ledger)
  { name: "castle-market",    file: "castle-market.js" },     // castle material market (CastleMarket)
];

function markerLines(name) {
  return {
    start: "/* BUILD:" + name + " START */",
    end: "/* BUILD:" + name + " END */",
  };
}

// Locate the marker lines for `name`. Returns {startIdx, endIdx} (indices of
// the marker lines themselves) or null if the pair is absent.
function findRegion(lines, name) {
  const mk = markerLines(name);
  const startIdx = lines.indexOf(mk.start);
  const endIdx = lines.indexOf(mk.end);
  if (startIdx === -1 && endIdx === -1) return null;
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Unbalanced BUILD markers for '" + name + "' in index.html");
  }
  if (endIdx <= startIdx) {
    throw new Error("BUILD:" + name + " END precedes START in index.html");
  }
  if (lines.indexOf(mk.start, startIdx + 1) !== -1 ||
      lines.indexOf(mk.end, endIdx + 1) !== -1) {
    throw new Error("Duplicate BUILD markers for '" + name + "' in index.html");
  }
  return { startIdx, endIdx };
}

// Bytes of a src file as the array of inner lines (drop one trailing newline).
function srcInnerLines(file) {
  const txt = fs.readFileSync(path.join(SRC, file), "utf8");
  const parts = txt.split("\n");
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function buildText(reportSkips) {
  const lines = fs.readFileSync(INDEX, "utf8").split("\n");
  let spliced = 0;
  // Splice from the BOTTOM up so earlier indices stay valid as we mutate.
  const acts = [];
  for (const mod of MANIFEST) {
    const region = findRegion(lines, mod.name);
    const hasSrc = fs.existsSync(path.join(SRC, mod.file));
    if (region && hasSrc) {
      acts.push({ mod, region });
    } else if (reportSkips) {
      if (region && !hasSrc) console.log("  skip " + mod.name + " (marked, but src/" + mod.file + " missing)");
      else if (!region && hasSrc) console.log("  skip " + mod.name + " (src exists, no markers in index.html)");
      // neither: silently not yet extracted
    }
  }
  acts.sort((a, b) => b.region.startIdx - a.region.startIdx);
  for (const { mod, region } of acts) {
    const inner = srcInnerLines(mod.file);
    lines.splice(region.startIdx + 1, region.endIdx - region.startIdx - 1, ...inner);
    spliced++;
    if (reportSkips) console.log("  splice " + mod.name + " <- src/" + mod.file);
  }
  return { text: lines.join("\n"), spliced };
}

function cmdExtract() {
  const lines = fs.readFileSync(INDEX, "utf8").split("\n");
  fs.mkdirSync(SRC, { recursive: true });
  let n = 0;
  for (const mod of MANIFEST) {
    const region = findRegion(lines, mod.name);
    if (!region) continue;
    const inner = lines.slice(region.startIdx + 1, region.endIdx);
    fs.writeFileSync(path.join(SRC, mod.file), inner.join("\n") + "\n");
    console.log("  extract " + mod.name + " -> src/" + mod.file + " (" + inner.length + " lines)");
    n++;
  }
  console.log("Extracted " + n + " module(s).");
}

function cmdBuild(check) {
  const { text, spliced } = buildText(true);
  const current = fs.readFileSync(INDEX, "utf8");
  if (check) {
    if (text !== current) {
      console.error("--check FAILED: index.html is out of date vs src/. Run `node tools/build.js`.");
      process.exit(1);
    }
    console.log("--check OK: index.html matches src/ (" + spliced + " module(s) spliced).");
    return;
  }
  if (text === current) {
    console.log("index.html already up to date (" + spliced + " module(s) spliced).");
    return;
  }
  fs.writeFileSync(INDEX, text);
  console.log("Wrote index.html (" + spliced + " module(s) spliced).");
}

const arg = process.argv[2];
if (arg === "--extract") cmdExtract();
else if (arg === "--check") cmdBuild(true);
else if (!arg || arg === "--build") cmdBuild(false);
else { console.error("Unknown arg: " + arg + "\nUsage: build.js [--build|--check|--extract]"); process.exit(2); }
