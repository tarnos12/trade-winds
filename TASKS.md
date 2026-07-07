# TASKS — Board (owned by Session #1 / Manager)

Only Session #1 edits this file. Workers update **their own** `TASK_<n>.md`.
Protocol: [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md). Scope: [GDD.md](GDD.md) §10 Phase 1.

## How a worker joins

You were told "you are Session #2" (or #3 / #4). Open your file —
**`TASK_2.md`, `TASK_3.md`, or `TASK_4.md`** — and follow it. That file names
your task, your branch, your scope boundaries, and where to report status. Do
**not** edit `TASKS.md` or any other worker's file.

## Milestone: Phase 1 — The Board

DoD (GDD §10): generate a map from a seed, move the camera, place roads, 60 FPS.

## Shared data contract (all sessions hold these — prevents merge conflicts)

Agreed up front so the three tasks compose in one `index.html`:

- **Axial hex key:** string `` `${q},${r}` `` used everywhere a hex is keyed.
- **Terrain enum (strings):** `meadow`, `forest`, `hills`, `mountains`, `water`,
  `field`, `wasteland` (GDD §3.1).
- **`Hex` shape:** `{ q, r, terrain, revealed }` (`revealed` boolean, fog).
- **`GameMap` shape:** `{ seed, radius, hexes }` where `hexes` is a `Map` keyed
  by the axial hex key → `Hex`.
- **`CONFIG`** is the single source of truth for constants (hex size, map radius
  ~14, colors, camera speeds). Add your constants there, don't scatter literals.
- **Module namespaces** on a single global `TW` object: `TW.HexMath`,
  `TW.MapGen`, `TW.Renderer`, `TW.Camera`, `TW.CONFIG`. This keeps the
  single-file additions modular and non-overlapping.

## Board

| Task | Session | Branch | Depends on | Status |
|---|---|---|---|---|
| T1 — Scaffold + `CONFIG` + `HexMath` + two-clock loop | #2 | `claude/phase1-hexmath-scaffold` | — | 🔲 assigned |
| T2 — `MapGen` (seeded RNG, noise, biomes, fog init) | #3 | `claude/phase1-mapgen` | HexMath keys + terrain enum (contract above) | 🔲 assigned |
| T3 — `Renderer` (terrain pre-render) + `Camera` (pan/zoom) | #4 | `claude/phase1-renderer-camera` | `Hex`/`GameMap` shapes + `HexMath.hexToPixel` (contract above) | 🔲 assigned |

Status legend: 🔲 assigned · 🟡 in progress · 🔵 PR open · ✅ merged.

## Merge order (manager)

Merge **#2 first** (it lands the scaffold, `CONFIG`, `HexMath`, and the shared
shapes), then **#3** and **#4** (rebased on the merged scaffold). Workers may
start immediately against the data contract above — they don't need to wait, but
their PRs merge in this order.

## Notes / decisions

- Single-file constraint (`index.html`) means every task edits the same file.
  Conflicts are expected and are the manager's job to resolve at merge — that is
  the whole point of serial merging. Keep additions in your own module block to
  minimize overlap.
- GDD §13 open questions are not blockers for Phase 1.
