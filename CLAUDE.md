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

Repo: local (branch `main`, no remote yet).

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

**Pre-Phase 1 — project scaffolding.**

Done:
- Git repo initialized (branch `main`).
- GDD imported as [GDD.md](GDD.md) (the design/scope source of truth).
- This handoff doc created and wired to the working rules.

Next (recommended order):
1. Resolve the open questions in GDD §13 (combat scope, tab-hidden behavior,
   tariff range, goods count, win condition, title) before Phase 1 code.
2. **Phase 1 — The Board:** `HexMath`, seeded map gen + biomes + fog, camera
   pan/zoom, terrain pre-render, build mode for roads + empty town markers.
   DoD: generate map from a seed, move camera, place roads, 60 FPS.
3. Phase 2 — Towns & Production; Phase 3 — Trade (riskiest); Phase 4 —
   Progression; Phase 5 — Content & Polish. (GDD §10.)

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
