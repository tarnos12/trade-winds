# Trade Winds — Working Notes for Claude Code

This file is the handoff/status doc (it plays the `HANDOFF.md` role the working
rules describe). **Keep it current: update the "Current status" section in the
same commit as every completed task**, so any Claude Code session (or the
author) can resume cold. Author is Mariusz (GitHub `tarnos12`).

> **Working rules:** follow
> <https://raw.githubusercontent.com/tarnos12/claude-rules/master/RULES.md>
> (canonical; cloud/remote sessions that can't see local config should fetch
> this raw URL and follow it). Design/scope source of truth: [GDD.md](GDD.md).
> Read both before starting.

## What this is

**Trade Winds** (working title) is a *Let Them Trade*–inspired economy game: you
build a network of autonomous towns on a hexagonal board that produce, consume,
and trade with each other on their own. You shape the conditions (placement,
production, roads) and earn a tariff on every transaction, spending it to upgrade
the King's castle. **Stack:** a single `index.html`, Canvas 2D, **zero external
dependencies**, saves in `localStorage`. Hard constraints: single-file,
offline-first, no build step, desktop-first. See [GDD.md](GDD.md) for full scope.

Repo: GitHub `tarnos12/trade-winds` (default branch `main`).

## Sessions (multi-session coordination)

This project runs the **central-dispatch** protocol — see
[PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md). **Session #1 is the manager**: owns
the board [TASKS.md](TASKS.md), assigns work, merges PRs one at a time, resolves
conflicts. **Workers #2/#3/#4** each read/write only their own file
([TASK_2.md](TASK_2.md), [TASK_3.md](TASK_3.md), [TASK_4.md](TASK_4.md)) — a
worker told "you are Session #N" starts by reading `TASK_N.md`.

## Run & test

- No build step. Run command: **open `index.html` in a browser** (double-click,
  or serve the folder with any static server). Nothing to compile.
- **After a change, tell the author how to see it running** and verify it
  yourself before claiming done.
- Prefer the fastest feedback loop that proves it: exercise the pure `Sim` /
  economy-tick logic headless (a small Node script or unit test) rather than
  always driving the full canvas app.
- Cache-busting: if assets get `?v=N` tags, bump them on any change.

## Current status (update this section every commit)

**Phase 1 — The Board: DONE. Phase 2 — Towns & Production: assigned.**

Done:
- Git repo initialized (branch `main`); remote `tarnos12/trade-winds` added.
- GDD imported as [GDD.md](GDD.md) (the design/scope source of truth).
- This handoff doc created and wired to the working rules.
- Multi-session central-dispatch set up: [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md),
  board [TASKS.md](TASKS.md), worker files [TASK_2.md](TASK_2.md) /
  [TASK_3.md](TASK_3.md) / [TASK_4.md](TASK_4.md). Session #1 = manager (works on
  `main`; workers pull `main` before each task and PR into it).
- **Phase 1 — The Board** landed in `index.html`: `CONFIG`, `HexMath`, seeded
  `MapGen` (mulberry32, quantile biomes, island falloff), fog, offscreen terrain
  pre-render (1 `drawImage`/frame), camera pan/zoom, build mode (roads + town
  markers + erase), two-clock loop (rAF render + 500ms×speed economy
  accumulator). Headless test `test/board.test.js` (25/25). Verified in headless
  Chromium: no console errors, canvas renders. DoD met.

Next (recommended order):
1. **Phase 2 — Towns & Production** (assigned to workers): #3 goods/buildings +
   price model, #2 `Sim` production/consumption tick, #4 town entities + town
   panel UI. See [TASKS.md](TASKS.md). Manager merges #3 → #2 → #4.
   DoD (GDD §10): a single town can grow and starve; prices react to stockpiles.
2. Phase 3 — Trade (riskiest); Phase 4 — Progression; Phase 5 — Content &
   Polish. (GDD §10.)
3. GDD §13 open questions (combat scope, tab-hidden behavior, tariff range,
   goods count, win condition, title) — not blockers yet.

Note: terrain enum as built uses `fertile` (not `field`); the code is the source
of truth — full set: `water, meadow, forest, hills, mountains, fertile, wasteland`.

## Architecture conventions (hold these)

Derived from GDD §9; keep these load-bearing:
- **One pure `Sim` core.** The economy tick (production → consumption → prices →
  cart decisions) is deterministic and side-effect-free — no I/O, no DOM, no
  canvas. This is what makes it testable and lets it run at 4x / autoplay.
- **Two clocks, separated:** render on `requestAnimationFrame`; economy on a
  fixed 500ms × gameSpeed timestep ("fix your timestep" accumulator).
- **`CONFIG` is the single source of truth** for all balance constants — one
  object, easy tuning. No magic numbers scattered in logic.
- **UI in DOM, world in canvas.** Panels are HTML layered over the canvas, not
  drawn in it. Terrain pre-rendered to an offscreen canvas (1 `drawImage`),
  redrawn only when fog reveals.
- **Persistence is versioned** (`saveVersion`) with a migration path; autosave
  every 30s + on `visibilitychange`. JSON export/import as a string.
- **Prefer additive, self-contained modules** over editing shared hot files.

## Workflow

- One commit per completed task; **update "Current status" above in that same
  commit.** (Full rules: the RULES.md link at the top.)
- Commit after every completed task; push once a remote exists.
- Platform: Windows. CRLF warnings from git are expected/harmless.
