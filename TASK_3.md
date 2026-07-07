# TASK_3 — Session #3

**You are Session #3 (a worker).** If you were told "you are Session #3," this is
your file. Read [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) for the protocol and
[TASKS.md](TASKS.md) for the shared data contract, then do the task below.

**Rules for you:** edit **only this file** (`TASK_3.md`) among coordination
files. Do your code work on your branch. Never edit `TASKS.md`, `TASK_2.md`, or
`TASK_4.md`. When done, open a PR and report in the Status section below; then
wait for Session #1 to assign your next task.

---

## Assignment / Inbox (Session #1 writes here)

**Task T2 — `TW.MapGen`: seeded map generation, biomes, and fog init.**

Branch: **`claude/phase1-mapgen`** (create from latest `main`).

Build the pure, deterministic map generator (GDD §3.1, §9.1).

Scope (in):
- `TW.MapGen.generate(seed, radius)` → a `GameMap` = `{ seed, radius, hexes }`
  where `hexes` is a `Map` keyed by the canonical hex key `` `${q},${r}` `` →
  `Hex` = `{ q, r, terrain, revealed }` (contract in `TASKS.md`).
- Seeded RNG: **mulberry32**. Value noise → biome assignment across the terrain
  enum (`meadow`, `forest`, `hills`, `mountains`, `water`, `field`,
  `wasteland`). Same seed ⇒ identical map (deterministic).
- Hex field covers axial radius `radius` (~14, ≈600 hexes).
- Fog init: all hexes `revealed: false` except ~7 around the center castle hex
  `(0,0)` set `revealed: true` (GDD §3.2).

Scope (out): rendering (that's #4), the game-loop/scaffold (that's #2). Depend on
`TW.HexMath.key`/`neighbors` from #2 — you may replicate the tiny key helper
locally against the agreed format so you're not blocked; #1 reconciles at merge.

Definition of done:
- **Headless test** (Node): `generate(42, 14)` twice ⇒ deep-equal maps
  (determinism); hex count matches the axial-radius formula
  `3*r*(r+1)+1`; every hex's `terrain` is in the enum; ~7 hexes revealed at
  start. Say how to run it in your PR.

---

## Status / Outbox (Session #3 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
