# State of Project — audit summary (2026-07-11)

Written by the lead per CLAUDE.md audit protocol step 5. Shared context for any
teammate/subagent that wakes with no conversation history. Pairs with
`PROJECT.md` (the standing distillation) and `docs/MODULE_MAP.md` (where code
lives in the single file). **This is a point-in-time audit snapshot** — the
living status is the "Current status" section of `PROJECT.md`; update that in the
same commit as each task.

## What this is
Trade Winds — single-file (`index.html`, 11,122 lines) browser economy game,
Canvas 2D, zero external deps, localStorage saves. Version **v0.21.0**. Stage 3
(1.0) in progress; Stages 0–2 shipped.

## Verified this audit (ran, did not just read)
- **Full suite green: 14/14 test files pass.** Counts observed:
  board 407, research 178, buildings 163, sim 128, trade 90, prices 63,
  balance 54, market 41, migration 38, progress 31, ledger 26, pathing 24,
  research_effects 22, tariff 11. (~1,246 asserts across the run.)
  Runner: each `test/*.test.js` is a standalone Node file that `vm`-evals the
  `PURE_CORE_START..PURE_CORE_END` block of `index.html`. No package.json, no
  test framework — run one with `node test/<name>.test.js`, all with a shell loop.
- **PURE_CORE loads cleanly** in the Node VM (deterministic; no DOM/canvas/
  `Math.random`/`Date` leakage into the tick path — the constraint holds).
- **Playthrough diagnostic runs**: `TW_HTML=./index.html node tools/playthrough.js 2000`
  produces its BAL2 report in ~1s wallclock.
- **Git**: branch `claude/get-ready-suyvr6` == `main` == `origin/main`
  (0 ahead / 0 behind); working tree clean.

## Working parts (functional, not stubbed)
Map gen (3 presets: fertile/oasis/big_world), hex math, terrain/deposits, fog;
economy tick (production→consumption→prices→happiness→population) across 4
population tiers; autonomous carts + gradual load/unload + tariff; road graph +
Dijkstra + route cache; resource-metered Research + placeable Research Center
(L1–4, speeds 2/3/4/6); buildings placement/upgrade; town leveling + King's
quests + prestige + castle L1→5 victory; random (cozy) events; save v2 with
stepwise migration + JSON export/import; full DOM UI (town/building/castle/keep/
kingdom panels, tech tree, HUD, start screen, tutorial coach, patch notes).

## Gaps / remaining (Stage 3 tail)
1. **Balance** — 4-tier economy + Research Center costs/speeds not yet tuned
   against real playthroughs. **Directional signal:** the 2000-tick greedy
   playthrough **stalls at peasants** (never reaches workers/burghers/aristocrats;
   castle stuck at L1). The harness README warns its greedy policy is
   chaos-sensitive — treat as directional, confirm with focused sim tests before
   acting.
2. **Research effects only partly wired** — the tree has **127 node ids** but
   most `Research.has(...)` call sites are *unlock gating* (buildings/goods
   become buildable) plus a few live modifiers (`paved_roads` road speed,
   `deep_veins` mine/quarry boost, `tariff_slider`). Many nodes are data-only
   unlocks with no numeric effect on Sim/Trade yet.
3. **Stage-3 content** — campaign scenarios (start screen scaffolding exists),
   deeper tutorial, audio (WebAudio — not started), juice (chimney smoke,
   transaction particles).
4. **Deploy** — v0.21.0 is on `main` but **not on gh-pages**; the deploy needs a
   **force-push** (branch diverged during a rollback) → requires author approval.
   Playable build currently ships as a published Artifact.

## Risks / gotchas
- **Single hot file** → not "team-ready" for a live agent team; use
  worktree-isolated subagents with the lead as sole serial integrator (per
  PROJECT.md "Team model").
- **`CONFIG` is the only home for balance constants** — no magic numbers in logic.
- **Keep PURE_CORE pure** — anything the tests eval must stay DOM/RNG/clock-free.
- Save bumps must ship a **stepwise migration**, never discard old saves.
- Terrain enum uses `fertile` (not `field`); research ETA display can read ~1s
  optimistic (cosmetic — completion is consumed-gated). Code is source of truth.
- Author machine is Windows → CRLF warnings from git are expected/harmless.

## How to run / verify
- Play: open `index.html` in a browser (no build step).
- Tests: `for f in test/*.test.js; do node "$f"; done`
- Balance diagnostic: `TW_HTML=./index.html node tools/playthrough.js [ticks]`
