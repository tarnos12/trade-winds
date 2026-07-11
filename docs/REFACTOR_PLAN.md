# Refactor Plan — "Modules + build → single file"

Restructuring pass (CLAUDE.md readiness gate). Goal: split the pure-core of the
single-file game into `src/*.js` modules with a **zero-dependency** `tools/build.js`
that regenerates the shipped single-file `index.html`. **Shape only — no behaviour
change, no features.**

## Hard constraints honoured
- Shipped `index.html` stays ONE self-contained file (Canvas 2D, zero external deps,
  opens from `file://` offline). **No build step is required to RUN.** `build.js` only
  regenerates `index.html` after you edit `src/`.
- `build.js` is pure Node, zero npm deps.
- The `PURE_CORE_START` / `PURE_CORE_END` fences and all impure-shell / CSS / HTML
  bytes are preserved. The only change to `index.html` outside modularized regions is
  the addition of `/* BUILD:<name> START|END */` comment lines (behaviour-neutral).
- The 14 pure-core suites (`test/*.test.js` except `editor.test.js`) are the
  characterization net; they are unchanged and stay green.

## Build model — in-place region splice (incremental, always green)

`index.html` carries permanent marker lines around each modularized subsystem:

```
/* BUILD:config START */
...module body (this is the editable source, mirrored in src/config.js)...
/* BUILD:config END */
```

`node tools/build.js` walks an ordered `MANIFEST`. For every module that has **both**
its marker pair in `index.html` **and** a `src/<file>`, it replaces the lines between
the markers with the bytes of `src/<file>`. Modules not yet extracted have no markers
and no src file, and are left **inline, untouched**.

Why this model (vs. concatenating the whole region from a manifest):
- **Incremental & always shippable.** Extraction proceeds one module at a time; after
  each extraction `index.html` is still the complete, runnable file and the suites stay
  green. No "big bang" cutover, no moment where `index.html` is half-built.
- **Order safety is free.** Concatenation order == the existing top-to-bottom file
  order, which already respects load-time dependencies (e.g. `const TICKS_PER_SEC` at
  the top of Research reads `CONFIG.econ`; `Object.assign(CONFIG, …)` in the goods
  catalog runs after `CONFIG` is declared). `build.js` splices **in place**, so it can
  never reorder modules and break a load-time reference.
- **Round-trip proven byte-for-byte.** `node tools/build.js --extract` recreates
  `src/*.js` from the marked regions; `node tools/build.js` splices them back and
  reproduces `index.html` byte-for-byte (region = the lines strictly between the two
  marker lines; the src file = those lines + one trailing newline).

`build.js` commands:
- `node tools/build.js` — splice `src/*.js` into `index.html`.
- `node tools/build.js --check` — build in memory; exit non-zero if `index.html` is out
  of date vs `src/` (CI / pre-commit guard so the committed single file can't drift).
- `node tools/build.js --extract` — (re)create `src/*.js` from the marked regions
  (bootstrap a module, or re-sync src to a hand-edit in the file).

Because `src/` and the marked regions of `index.html` hold the same bytes, `src/` is the
editable **source** and `index.html` is the committed **build output** — edit `src/`,
run `build.js`, commit both.

## Target module map (pure core), in canonical/concatenation order

`MANIFEST` in `tools/build.js`. Ranges are the current `index.html` anchors (search the
banner, not the number). `[✓]` = extracted in this PoC.

| # | Module `name` | `src/` file | Region anchor(s) | Top-level exports | Depends on (load-time) |
|---|---|---|---|---|---|
| 1 | `config` **[✓]** | `config.js` | `const CONFIG = {` … terrain/`fogColor` | `CONFIG` | — |
| 2 | `rng` | `rng.js` | `mulberry32`, `hashSeed` | `mulberry32`, `hashSeed` | — |
| 3 | `hexmath` **[✓]** | `hexmath.js` | `const HexMath = {` … `range` | `HexMath` | — |
| 4 | `mapgen` | `mapgen.js` | `makeValueNoise` + `=== TV2 MapGen v2 ===` (`const MapGen`) | `makeValueNoise`, `MapGen` | `CONFIG`, `HexMath`, `mulberry32`, `hashSeed` |
| 5 | `goods` | `goods.js` | `=== GOODS-PRICES START/END ===` | mutates `CONFIG` via `Object.assign(CONFIG,…)`, `Object.assign(CONFIG.econ,…)` (goods/buildings/needs catalog + `priceFor` helper) | `CONFIG` (must load after `config`) |
| 6 | `sim` | `sim.js` | `=== SIM-CORE START/END ===` | `Sim`, `Needs`, `MINE_TERRAINS`, `SIM_TIER_KEY` | `CONFIG`(+goods), `HexMath` |
| 7 | `buildings` | `buildings.js` | `=== BUILDINGS-CORE START/END ===` | `Buildings`, `BUILDINGS_TIER_KEY` | `CONFIG`, `HexMath`, `Sim` |
| 8 | `pathing` | `pathing.js` | `=== PATHING START/END ===` | `Pathing` | `CONFIG`, `HexMath` |
| 9 | `trade` | `trade.js` | `=== TRADE START/END ===` | `Trade` | `CONFIG`, `HexMath`, `Pathing`, `Sim` |
| 10 | `research` | `research.js` | `=== RESEARCH-CORE START/END ===` | `Research`, `TICKS_PER_SEC` | `CONFIG` (reads `CONFIG.econ` at load) |
| 11 | `research-economy` | `research-economy.js` | `=== RESEARCH-ECONOMY START/END ===` | `ResearchEconomy`, `RESEARCH_MATERIALS` | `CONFIG`, `Research` |
| 12 | `progress` | `progress.js` | `=== PROGRESS-CORE START/END ===` | `Town`, `Castle`, `Quests` | `CONFIG`, `Sim` |
| 13 | `events` | `events.js` | `=== EVENTS-CORE START/END ===` | `Events` | `CONFIG` |
| 14 | `kingdom-market` | `kingdom-market.js` | `=== KR-A … /KR-A ===` | `Market` | `CONFIG`, `Sim` (reads published `town.prices`) |
| 15 | `ledger` | `ledger.js` | `=== PP-A … CITY LEDGER` (the `var Ledger = (function(){` IIFE) | `Ledger` | `CONFIG` |
| 16 | `castle-market` | `castle-market.js` | `var CastleMarket = (function(){` … `=== /PP-A ===` | `CastleMarket` | `CONFIG`, `ResearchEconomy` (guarded `typeof`) |

Notes:
- Modules 6–16 use the idempotent `var X = (typeof X !== "undefined" && X) || {}` pattern
  and attach methods, so their *method bodies* reference other modules lazily (safe
  regardless of order). Only a few **load-time** reads pin order — captured in the
  "Depends on" column. The in-place splice preserves the current order, so this is safe
  by construction.
- Modules 14–16 are **not** in `docs/MODULE_MAP.md`'s table (it stops at Events). They
  live inside `PURE_CORE` after `EVENTS-CORE END`: KR-A (`Market`), then the PP-A block
  which contains **two** objects — `Ledger` and `CastleMarket`. Splitting them into
  three modules matches how `tools/lib.js` exports them (`Market`, `Ledger`,
  `CastleMarket`). `MODULE_MAP.md` should be updated to list them.
- `mapgen` folds `makeValueNoise` (a MapGen-only noise helper) in with `MapGen`; `rng`
  (`mulberry32`/`hashSeed`) is its own tiny module since MapGen and the shell both use it.

## Impure shell (Phase 2+ — same mechanism)

Below `PURE_CORE_END`: `Renderer`, `UI` (all DOM panels), `Save` (versioned localStorage
+ migration + JSON import/export), input handling, and the two-clock main loop. Same
`/* BUILD:<name> START|END */` splice mechanism applies; these are **not** covered by the
14 pure-core suites, so extract them only after the pure core is done and verify by
loading `index.html` (script parses + manual smoke / `editor.test.js` where relevant).
Suggested shell modules: `renderer`, `ui`, `save`, `input`, `mainloop`. Defer to Phase 2.

## Adding a module (procedure for the parallel team)

1. In `index.html`, wrap your subsystem with `/* BUILD:<name> START */` … `/* BUILD:<name> END */`
   on their own lines (immediately inside the existing banner is fine).
2. `node tools/build.js --extract` → creates `src/<file>` with the exact bytes.
3. Verify no-op: `node tools/build.js --check` must print OK (byte-for-byte).
4. From now on **edit `src/<file>`**, then `node tools/build.js`, then run the 14 suites.
5. `<name>` and `<file>` must already be listed in `MANIFEST` (they all are).

## Verification gate (run after every build)

```
for f in test/*.test.js; do case "$f" in *editor.test.js) continue;; esac; node "$f" >/dev/null 2>&1 && echo "OK $f" || echo "RED $f"; done
node tools/build.js --check      # index.html in sync with src/
```
Plus confirm `index.html`'s game `<script>` still parses (extract it, `new vm.Script`).
