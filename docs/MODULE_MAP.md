# Module map — where code lives in `index.html`

Single-file project. Line numbers are approximate anchors from the 2026-07-11
audit — search the banner text, not the number, since edits shift them.

**Pure core is now modularized (Phase 1 done).** Every pure-core subsystem below is
wrapped in `/* BUILD:<name> START|END */` markers in `index.html` and mirrored 1:1
in `src/<name>.js` (edit `src/`, run `node tools/build.js`, commit both; `--check`
guards drift). The shipped `index.html` stays one self-contained offline file — the
markers are behaviour-neutral comments. The 16 modules (in splice order) are:
`config, rng, hexmath, mapgen, goods, sim, buildings, pathing, trade, research,
research-economy, progress, events, kingdom-market, ledger, castle-market`. The
impure shell below `PURE_CORE_END` is **not** yet modularized (Phase 2 deferred).

## Pure deterministic core — `PURE_CORE_START` (~1140) … `PURE_CORE_END` (~5162)
Everything the headless tests `vm`-eval. Must stay free of DOM / canvas /
`Math.random` / `Date` (seeded mulberry32 RNG only).

| Module | Banner / anchor | Owns |
|---|---|---|
| `CONFIG` | `const CONFIG = {` (~1143) | **Single source of balance truth** — map presets, terrain, goods, buildings, upgrades, research, researchCenter, econ, trade, needs tiers. |
| `HexMath` | `const HexMath = {` (~1239) | Axial hex math. |
| `MapGen` | `TV2 MapGen v2` (~1310) | Seeded map/biome/deposit/fog generation. |
| Goods + prices | `GOODS-PRICES START` (~1610) | Goods catalog, building catalog, 4-tier needs matrix, local price model. |
| `Sim` | `SIM-CORE START` (~2013) | Economy tick: production → consumption → prices → happiness → population; construction delivery. |
| `Buildings` | `BUILDINGS-CORE START` (~2571) | Placement/construction/upgrade rules incl. Research Center; housing. Placement V2 sub-region ~3026. |
| `Pathing` | `PATHING START` (~3128) | Road-node graph + Dijkstra + route cache. |
| `Trade` | `TRADE START` (~3211) | Autonomous cart dispatch, route profit, transactions, tariff, gradual load/unload. |
| `Research` | `RESEARCH-CORE START` (~3654), `const Research` ~3754 | Tech-tree data (127 node ids) + pure engine: canStart gating, atomic advance, `has()`. |
| `ResearchEconomy` | `RESEARCH-ECONOMY START` (~4106) | Castle research economy (CRE): per-second equal-drain metering, center speed, castle material buying. |
| Progress | `PROGRESS-CORE START` (~4472) | Town leveling, King's quests, prestige, castle levels 1→5. |
| Events | `EVENTS-CORE START` (~4668) | Cozy random market events. |

## Impure shell (below `PURE_CORE_END`) — now modularized (Phase 2)
The whole browser layer is one IIFE. The IIFE scaffold + `state` object + boot tail
stay inline; everything else is a `src/*.js` module wrapped in `/* BUILD:<name> */`
markers (17 shell modules): `renderer, input, save, mainloop, town-ui,
carts-castle-ui, techtree-ui, progress-ui, kingdom-events-ui, juice,
internal-traders, ppe-chatter, audio, start-screen, editor-overlay, tutorial,
version-notes`. See [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) for the per-module map.
Concerns covered: Renderer (canvas world: terrain pre-render, roads, buildings,
carts, overlays, research center), UI (all DOM panels — town/building/castle/keep/
kingdom, tech tree, HUD, start screen, tutorial coach), Save (versioned localStorage
+ stepwise migration; only `localStorage.getItem/setItem(SAVE_KEY)`), input handling,
the two-clock main loop (rAF render + fixed 500ms×speed economy accumulator).

## CSS / HTML (top of file, ~55–1075)
Fenced `=== X CSS START/END ===` and `=== X HTML START/END ===` blocks per panel.

## Tooling (outside index.html — safe to edit in parallel with the game)
- `tools/lib.js` — loads PURE_CORE into a Node VM, exports every module.
- `tools/player.js` — controlled 4-city map + `step()` accumulator for diagnostics.
- `tools/playthrough.js` — greedy build/research/level policy + BAL2 report.
- `tools/research-editor.html` — standalone visual research-tree editor (shipped via Artifact).

## Tests (`test/*.test.js`)
Each standalone: reads `index.html`, regex-extracts PURE_CORE, `vm`-evals it,
asserts. board · buildings · sim · trade · research · research_effects ·
prices · market · balance · migration · progress · ledger · pathing · tariff.
