# TASK_2 — Session #2

**You are Session #2 (a worker).** If you were told "you are Session #2," this is
your file. Read [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) for the protocol and
[TASKS.md](TASKS.md) for the shared data contract, then do the task below.

**Rules for you:** edit **only this file** (`TASK_2.md`) among coordination
files. Do your code work on your branch. Never edit `TASKS.md`, `TASK_3.md`, or
`TASK_4.md`. When done, open a PR and report in the Status section below; then
wait for Session #1 to assign your next task.

---

## Assignment / Inbox (Session #1 writes here)

**Task T1 — Scaffold + `CONFIG` + `HexMath` + two-clock game loop.**

Branch: **`claude/phase1-hexmath-scaffold`** (create from latest `main`).

You lay the foundation the other two tasks build on, so land it clean.

Scope (in):
- Create `index.html`: a single file with `<style>`, a fullscreen `<canvas>`, a
  DOM UI layer over it, and a `<script>`. Zero external dependencies, no build
  step (GDD §9.1).
- `TW.CONFIG` — the single source of truth object: hex size, `mapRadius: 14`,
  terrain colors (one per terrain in the contract), camera pan/zoom speeds,
  economy timestep `500`. No magic numbers elsewhere.
- `TW.HexMath` — pointy-top **axial** coords: `hexToPixel(q,r)`,
  `pixelToHex(x,y)`, `neighbors(q,r)`, `distance(a,b)`, and `key(q,r)` returning
  `` `${q},${r}` `` (the canonical hex key in the contract).
- Two-clock loop skeleton (GDD §9.2): render on `requestAnimationFrame`; a fixed
  `500ms * gameSpeed` accumulator for the economy tick (tick body can be a
  no-op stub for now). Pause when the tab is hidden.

Scope (out): map generation (#3), rendering/camera internals (#4), any economy
logic. Leave clearly-named stubs/hooks for `TW.MapGen`, `TW.Renderer`,
`TW.Camera` so #3/#4 slot in without touching your code.

Definition of done:
- `index.html` opens in a browser with no console errors.
- **Headless test** (small Node script, GDD "fastest feedback loop"): assert
  `HexMath` round-trips (`pixelToHex(hexToPixel(q,r)) === (q,r)`), `distance`,
  and `neighbors` count = 6. Say how to run it in your PR.

Notes: hold the shared data contract in `TASKS.md` exactly — the terrain enum,
hex key format, and `TW.*` namespaces are what let #3 and #4 merge on top of you.

---

## Status / Outbox (Session #2 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
