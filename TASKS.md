# TASKS — Board (owned by Session #1 / Manager)

Only Session #1 edits this file. Workers update **their own** `TASK_<n>.md`.
Protocol: [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md). Scope: [GDD.md](GDD.md).

## How a worker joins (read this every time)

You were told "you are Session #2 / #3 / #4." **First pull `main`**
(`git fetch origin main && git checkout main && git pull origin main`), then open
your file — **`TASK_2.md`, `TASK_3.md`, or `TASK_4.md`** — and follow it. Cut your
task branch from fresh `main`. Do **not** edit `TASKS.md` or another worker's
file. Build only your assigned slice — not the whole phase.

## Status: Phase 1 — The Board ✅ DONE

Landed in `index.html` on `main`: `CONFIG`, `HexMath`, seeded `MapGen`, fog,
offscreen terrain pre-render, camera pan/zoom, build mode (roads/town/erase),
two-clock loop. Test: `node test/board.test.js` (25/25). This is the base you
build on — read it before starting Phase 2.

## Milestone: Phase 2 — Towns & Production

Goal (GDD §10): towns produce and consume, population reacts; a town panel; a
local price model (no trade yet — prices just visible).
**DoD:** a single town can grow and starve; prices react to stockpiles.

## Shared data contract (all sessions hold these — prevents merge conflicts)

Extends the Phase 1 code. Add constants to the existing `CONFIG` object via a
non-destructive `Object.assign(CONFIG, {...})`-style merge; fence new logic in
clearly-marked module blocks so the single `index.html` merges cleanly.

- **Terrain enum (as built):** `water, meadow, forest, hills, mountains,
  fertile, wasteland`. (Code is truth — note it's `fertile`, not `field`.)
- **`CONFIG.goods[id]`** = `{ id, tier (1–3), basePrice, inputs?: {goodId: qty} }`.
- **`CONFIG.buildings[id]`** = `{ id, terrain?: <resource hex req>, inputs?:
  {goodId: qty}, output: {goodId, ratePerWorker}, workerSlots, cost }`.
- **`Town`** = `{ id, q, r, level (1–4), gold, pop: {peasants, workers,
  burghers}, stock: {goodId: qty}, prices: {goodId: price}, buildings:
  [{typeId, q, r, workers}], happiness }`.
- **Towns live in `State.towns`** (array). Town centers are placed with the
  existing `town` build-mode tool.
- **`Sim`** is a new pure, deterministic module (GDD §9.1): no DOM/canvas/I/O.
  `Sim.tick(State)` advances one economy step. It's wired into the existing
  500ms×speed accumulator (currently a no-op).
- **`Sim.priceFor(town, goodId)`** computes local price from stock vs demand.

## Board

| Task | Session | Branch | Depends on | Status |
|---|---|---|---|---|
| T5 — Goods + buildings catalog + local price model | #3 | `claude/phase2-goods-prices` | contract only | 🔲 assigned |
| T4 — `Sim` core: production + consumption tick | #2 | `claude/phase2-sim-core` | goods/buildings shapes (T5) | 🔲 assigned |
| T6 — Town entities + town panel UI (DOM) | #4 | `claude/phase2-town-ui` | `Town` shape + price model | 🔲 assigned |

Status legend: 🔲 assigned · 🟡 in progress · 🔵 PR open · ✅ merged.

## Merge order (manager)

Merge **#3 first** (goods/buildings/prices — the data everything references),
then **#2** (`Sim` tick consuming that data), then **#4** (UI reading towns +
prices). All three can start immediately against the contract above — they don't
need to wait, but PRs merge in this order and I resolve `index.html` conflicts.

## Lessons applied (Phase 1 retro)

- Two sessions independently rebuilt the *entire* Phase 1 board because slices
  weren't distinct enough. Phase 2 slices are split by concern (data / sim / UI)
  with an explicit contract. **Build only your slice.**
- Workers must **pull `main` before each task** (now a rule in
  `PARALLEL_SESSIONS.md`) — a stale checkout is why a session couldn't find its
  assignment.
