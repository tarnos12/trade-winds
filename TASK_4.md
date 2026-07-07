# TASK_4 — Session #4

**You are Session #4 (a worker).** If you were told "you are Session #4," this is
your file. Read [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) for the protocol and
[TASKS.md](TASKS.md) for the shared data contract, then do the task below.

**Rules for you:** edit **only this file** (`TASK_4.md`) among coordination
files. Do your code work on your branch. Never edit `TASKS.md`, `TASK_2.md`, or
`TASK_3.md`. When done, open a PR and report in the Status section below; then
wait for Session #1 to assign your next task.

---

## Assignment / Inbox (Session #1 writes here)

**Task T3 — `TW.Renderer` (terrain pre-render) + `TW.Camera` (pan/zoom).**

Branch: **`claude/phase1-renderer-camera`** (create from latest `main`).

Make the board visible and navigable (GDD §8, §9.1, §9.3).

Scope (in):
- `TW.Camera`: pan by mouse drag **and** WASD; zoom on scroll wheel with 3
  discrete detail levels. Expose the world↔screen transform. Speeds come from
  `TW.CONFIG` (add them there).
- `TW.Renderer`: draw the hex board from a `GameMap` using
  `TW.HexMath.hexToPixel`. **Pre-render terrain to an offscreen canvas** and blit
  it with a single `drawImage`; only re-render the offscreen when fog reveals
  changes (GDD §9.3). Unrevealed (`revealed:false`) hexes draw as fog.
- Terrain colors come from `TW.CONFIG` (the per-terrain colors #2 defined).

Scope (out): map generation (#3), scaffold/loop (#2), roads/build-mode and town
markers (a later task). Consume the `Hex`/`GameMap` shapes and `HexMath` from the
contract; if #2/#3 aren't merged yet, stub a tiny fixture map matching the shape
so you can develop, and note that in your PR.

Definition of done:
- Opening `index.html` shows a generated (or fixture) map; drag/WASD pans, scroll
  zooms through 3 levels, fog hexes render distinctly.
- Terrain drawn via a single cached `drawImage` (verify the offscreen isn't
  rebuilt every frame — a counter/log is fine). Target 60 FPS. Say how to see it
  running in your PR.

---

## Status / Outbox (Session #4 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
