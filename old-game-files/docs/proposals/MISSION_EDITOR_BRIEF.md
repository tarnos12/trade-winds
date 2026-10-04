# Mission Editor + Data-Driven Mission Engine — Team Brief (item U)

Read this first. Trade Winds is a modular single-file game: edit `src/*.js`, the Lead runs
`node tools/build.js` to reassemble `index.html`. Standalone tools live in `tools/*.html` and are
embedded into `index.html` at build time (see `tools/build.js` ASSETS + the research editor). You
have no chat history — this doc + the code are your context. **The Lead is the sole builder/
committer.** Edit ONLY your files; do NOT run `tools/build.js`; do NOT commit. Leave changes in the
working tree and report. Pure core stays deterministic (seeded RNG only).

## Goal
The player authors **missions** in a research-editor-style GRID + FLOWCHART tool. Missions are DATA
(not hardcoded). Each mission has typed **objectives**, connects to prerequisite missions (flowchart
edges), and has a **retroactive** flag. The game's Getting Started panel runs the authored missions.

## THE SCHEMA (the contract — both sides build to this exactly)

A mission set is JSON:
```json
{
  "version": 1,
  "missions": [
    {
      "id": "m1",                      // unique string
      "name": "First Building",
      "icon": "🏗",                    // emoji (optional)
      "pos": { "col": 0, "row": 0 },   // grid position in the editor (ints)
      "retroactive": true,             // DEFAULT true; if false, progress counts from mission-activation
      "prereqs": ["m0"],               // mission ids that must be COMPLETE before this one activates ([] = root)
      "objectives": [
        { "type": "construct", "building": "any",        "count": 1 },
        { "type": "construct", "building": "lumberjack",  "count": 2 },
        { "type": "trade_good", "good": "potato",         "count": 20 },
        { "type": "upgrade",    "building": "any",        "count": 1 },
        { "type": "earn_tax",   "amount": 500 }
      ]
    }
  ]
}
```
**Objective types (exactly these four):**
- `construct` — build `count` buildings; `building` is `"any"` or a specific building typeId.
- `upgrade` — complete `count` building upgrades; `building` is `"any"` or a specific typeId.
- `trade_good` — `count` units of `good` (goodId) delivered by trade.
- `earn_tax` — cumulative tariff/tax income reaches `amount`.

A mission is COMPLETE when ALL its objectives are satisfied. **Retroactive**: if `true`, an objective
reads the lifetime counter directly; if `false`, it reads `counter − baseline`, where baseline is the
counter value snapshotted when the mission ACTIVATED (its prereqs became complete).

## THE COUNTER CONTRACT (pure-core `state.stats` — EngineDev owns)
Add a deterministic, save-persisted `state.stats` object, incremented at these events (no RNG):
```
state.stats = { constructed: { total, byType:{typeId:n} },
                upgraded:    { total, byType:{typeId:n} },
                traded:      { byGood:{goodId:units} },
                taxEarned:   number }
```
- `constructed` — when a building's `built` flips false→true (construction delivery completes; find in `sim.js`/`buildings.js` delivery block).
- `upgraded` — when a `pendingUpgrade` APPLIES (upgradeLevel increments).
- `traded.byGood[g]` — units delivered into a buyer's stock by a trade unload (`trade.js`).
- `taxEarned` — every tariff added to `state.treasury` (`trade.js` tariff path).
Initialize + migrate defensively (old saves have no `state.stats`). Keep it out of the RNG/determinism
path so the pure-core suites + determinism stay green. Add a small unit test.

## Ownership
| Owner | Files | Scope |
|---|---|---|
| **EngineDev** (Opus) | `src/sim.js`, `src/buildings.js`, `src/trade.js` (counters), `src/tutorial.js` (rework into the data-driven mission engine) | Add `state.stats` counters (above). Rework the Tutorial module into a MISSION ENGINE: load a mission set (a bundled DEFAULT set + optionally the player's authored JSON from `localStorage["tradewinds.missions"]`), evaluate typed objectives vs `state.stats` with retroactive/from-zero + prereq gating, drive the existing Getting Started panel (show active/available missions, per-objective progress like "12/20 potatoes traded"). Provide a DEFAULT mission set in the schema (port the current 5 missions where they map to the four objective types; where they don't, use the closest objective). Keep `window.Tutorial` API (startFresh/resume/startPolling/hide/isActive) working. |
| **EditorDev** (Opus) | `tools/mission-editor.html` (NEW), `tools/build.js` (ASSETS entry) | Build the authoring tool, MODELLED ON `tools/research-editor.html` (study it: card grid, click-to-connect connectors, inspector, localStorage autosave, sandbox-safe `uiConfirm`, export/import JSON). Mission cards on a grid; click-to-connect FLOWCHART edges (prereqs); an inspector to edit name/icon, the **retroactive** checkbox (checked by default), and an objectives list (add/remove rows; each row: a type dropdown [construct/upgrade/trade_good/earn_tax] + the relevant fields — building typeId or "any", good dropdown, count/amount). Export/import the schema JSON above; autosave to `localStorage["tradewinds.missions"]` so the game picks it up. Add an ASSETS entry embedding it as `MISSION_EDITOR_HTML` (mirror the `editor-embed` asset). Request the in-game button + overlay from the Lead (index.html). |
| **QA** (Opus) | `test/*.test.js` | Test the counter increments (construct/upgrade/trade/tax) deterministically; test the engine's objective evaluation (each type), retroactive vs from-zero baseline, prereq gating (a mission with unmet prereqs is not active), and mission-complete. Validate a sample authored schema round-trips. Confirm determinism + all suites green. |
| **Lead** | `index.html` (button + overlay), integration | Add a "🎯 Missions" editor button + overlay iframe (mirror the research-editor overlay), build, verify, commit. |

## Working protocol
- EngineDev + EditorDev + QA edit disjoint files (see table). `index.html` and `tools/build.js` ASSETS
  are touched by the Lead / EditorDev respectively — coordinate the `MISSION_EDITOR_HTML` var name
  and the overlay element ids with the Lead by message.
- Deterministic pure core; `CONFIG` is the home for constants; sandbox-safe editor (no native
  confirm/alert — reuse research-editor's `uiConfirm`).
- Reference: the research editor (`tools/research-editor.html`) and its embed (`tools/build.js`
  ASSETS + `RESEARCH_EDITOR_HTML` + the `EditorOverlay` in `src/editor-overlay.js`) are the working
  template for BOTH the tool and its in-game wiring.
