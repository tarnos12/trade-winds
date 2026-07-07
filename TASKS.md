# TASKS — Board (owned by Session #1 / Manager)

This is the manager's board for the **in-session agent team** model
(see [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md)). Scope: [GDD.md](GDD.md).

The manager (Session #1) works on `main`, splits each phase into non-overlapping
slices below, spawns one **worktree-isolated subagent** per slice, and integrates
results into `main` in the stated merge order. "#2/#3/#4" are task slots, not
separate sessions.

## Status: Phase 1 — The Board ✅ DONE

Landed in `index.html` on `main`: `CONFIG`, `HexMath`, seeded `MapGen`, fog,
offscreen terrain pre-render, camera pan/zoom, build mode (roads/town/erase),
two-clock loop. Test: `node test/board.test.js` (25/25). This is the base Phase 2
builds on.

## Milestone: Phase 2 — Towns & Production

Goal (GDD §10): towns produce and consume, population reacts; a town panel; a
local price model (no trade yet — prices just visible).
**DoD:** a single town can grow and starve; prices react to stockpiles.

## Shared data contract (every subagent holds these — prevents merge conflicts)

Add constants to the existing `CONFIG` object via a non-destructive
`Object.assign(CONFIG, {...})`-style merge; fence new logic in clearly-marked
module blocks so the single `index.html` merges cleanly.

- **Terrain enum (as built):** `water, meadow, forest, hills, mountains,
  fertile, wasteland`. (Code is truth — it's `fertile`, not `field`.)
- **`CONFIG.goods[id]`** = `{ id, tier (1–3), basePrice, inputs?: {goodId: qty} }`.
- **`CONFIG.buildings[id]`** = `{ id, terrain?, inputs?, output: {goodId,
  ratePerWorker}, workerSlots, cost }`.
- **`Town`** = `{ id, q, r, level (1–4), gold, pop: {peasants, workers,
  burghers}, stock: {goodId: qty}, prices: {goodId: price}, buildings:
  [{typeId, q, r, workers}], happiness }`; towns live in `State.towns`.
- **`Sim`** = a new pure, deterministic module (no DOM/canvas/I/O).
  `Sim.tick(State)` advances one economy step; wired into the existing
  500ms×speed accumulator (currently a no-op). `Sim.priceFor(town, goodId)`
  computes local price from stock vs demand.

## Board

| Task | Slot | Subagent branch/worktree | Depends on | Status |
|---|---|---|---|---|
| T5 — goods + buildings catalog + local price model | #3 | `claude/phase2-goods-prices` | contract only | ✅ merged |
| T4 — `Sim` core: production + consumption tick | #2 | `claude/phase2-sim-core` | goods/buildings shapes (T5) | ✅ merged |
| T6 — town entities + town panel UI (DOM) | #4 | `claude/phase2-town-ui` | `Town` shape + price model | 🟡 in progress |

Status legend: 🔲 assigned · 🟡 in progress · 🔵 returned · ✅ merged.
**Merge order: #3 → #2 → #4.**

## Task specs

### T5 (#3) — Goods + buildings catalog + local price model
- `CONFIG.goods`: the 14 goods across 3 tiers (GDD §5.1) — tier 1 `wood, stone,
  ore, grain, fish, wool`; tier 2 `planks, tools, flour, beer, cloth`; tier 3
  `bread, clothes, jewelry, furniture`. Each `{id, tier, basePrice, inputs?}`.
- `CONFIG.buildings`: ≥6 tier 1–2 buildings (GDD §5.2) — e.g. `sawmill`
  (forest→wood), `mine` (hills→ore), `farm` (fertile→grain), `fishery`
  (water-adjacent→fish), `mill` (grain→flour), `bakery` (flour→bread). Each
  `{id, terrain?, inputs?, output:{goodId, ratePerWorker}, workerSlots, cost}`.
- Price model `Sim.priceFor(town, goodId)` (GDD §6.1): `ratio = stock /
  (demand*bufferTarget)`; `price = clamp(basePrice*(1.6 - 0.8*ratio),
  basePrice*0.4, basePrice*3.0)`; 10%/tick lerp smoothing; `bufferTarget ≈ 2.0`.
- Pure data + pure functions, no DOM.
- **DoD:** `test/prices.test.js` — surplus ⇒ ~0.4× floor; scarcity ⇒ ~3.0×
  ceiling; mid ratio ⇒ ~basePrice; every good has a valid tier and any `inputs`
  reference real goods; smoothing moves price gradually.

### T4 (#2) — `Sim` core: production + consumption tick
- Pure `Sim` module (fenced block). `Sim.tick(State)` per town: **production**
  (`output.ratePerWorker × workers × happinessFactor`, consuming `inputs`),
  **consumption** (population needs by tier, GDD §4.3), **happiness** (0–100 avg
  satisfaction → 0.5×–1.2× efficiency), **population** (sustained <50% → decline;
  100% → growth to house cap). Clamp stock ≥ 0.
- Wire into the two-clock loop: replace the no-op 500ms tick with `Sim.tick`.
- Consume `CONFIG.goods`/`buildings`/`Town` from the contract (stub a tiny local
  catalog if T5 isn't integrated yet).
- **DoD:** `test/sim.test.js` — a town with a farm grows stock; a foodless town's
  satisfaction then population falls ("grow and starve"); `Sim.tick` deterministic.

### T6 (#4) — Town entities + town panel UI (DOM)
- Town creation via the existing `town` build tool → a `Town` (contract shape) in
  `State.towns`; buildings attach within radius 1–2 (GDD §4.1).
- DOM panel over the canvas on town click: tabs **Overview / Stock+Prices /
  Buildings / Population**, live stock, `Sim.priceFor` prices with ▲▼ trend
  arrows (GDD §8), pop by tier, happiness. Doesn't block panning.
- Consume the contract; stub one town + tiny catalog if #2/#3 not integrated yet.
- **DoD:** open `index.html` → place a town, click it, all four tabs populate from
  live state; prices show trend arrows; panel updates as the economy ticks; no
  console errors.

## Lessons applied (Phase 1 retro)

- Phase 1's 3-way split let two agents rebuild the *entire* board. Phase 2 is
  split by concern (data / sim / UI) with an explicit contract — each subagent
  builds **only its slice**.
- Subagents run with **worktree isolation** so their parallel `index.html` edits
  don't collide; the manager integrates serially in the merge order above.
