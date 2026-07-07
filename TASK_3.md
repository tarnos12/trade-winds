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

- Status: 🔵 PR open — T2 `TW.MapGen` implemented, tested, verified.
- Branch pushed: `claude/phase1-mapgen`
- PR: #1 — https://github.com/tarnos12/trade-winds/pull/1 (base `main`).
- Questions/blockers for #1: none — not blocked on #2.

### What landed

- **`TW.MapGen.generate(seed, radius)`** in `index.html` → `GameMap =
  { seed, radius, hexes:Map<"q,r", {q,r,terrain,revealed}> }`, exactly per the
  `TASKS.md` contract.
- **Deterministic:** mulberry32-seeded fractal value noise → biomes. Numeric or
  string seeds both supported; same seed ⇒ deep-equal map.
- **Terrain enum:** the agreed 7 strings `meadow, forest, hills, mountains,
  water, field, wasteland` (exposed as `TW.MapGen.TERRAINS`).
- **Fog init:** all hexes `revealed:false` except the center ring (castle at
  `(0,0)` + its 6 neighbours) ⇒ **7 revealed** at start (`CONFIG.fog.startRadius = 1`).
- **Island falloff** so the map is ringed by water, not a slab.
- Constants added under `TW.CONFIG.map` / `.fog` / `.terrain` using
  merge-friendly `Object.assign` defaults, so they won't clobber #2's scaffold
  CONFIG at merge.

### Integration notes for #1 (merge)

- The pure module is fenced between `=== TW-MAPGEN-CORE-START/END ===` markers in
  `index.html` for easy lifting into the merged single file.
- Uses `TW.HexMath.key` when present, else replicates `` `${q},${r}` `` locally
  (permitted by the assignment) — no hard dependency on #2 to run/test.
- The page body is a **dev-only ASCII/colour preview** clearly labelled as
  replaceable by the renderer (Task T3 / #4). Drop it when #4's renderer lands.

### How to run / verify

- **Headless test (DoD):** `node test/mapgen.test.js` → *24 passed, 0 failed*
  (determinism deep-equal, hex count `3·r·(r+1)+1`, terrain ∈ enum, ~7 revealed).
- **See it:** open `index.html` — change the seed/radius and hit Generate to
  watch biomes + the 7-hex fog reveal update live.
