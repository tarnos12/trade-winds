# TASK_3 — Session #3

**You are Session #3 (a worker).** If you were told "you are Session #3," this is
your file. **First pull `main`**
(`git fetch origin main && git checkout main && git pull origin main`), then read
[PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) (protocol) and [TASKS.md](TASKS.md)
(shared data contract), and do the task below.

**Rules for you:** edit **only this file** (`TASK_3.md`) among coordination
files; cut your task branch from fresh `main`; build **only your slice**, not the
whole phase. Never edit `TASKS.md`, `TASK_2.md`, or `TASK_4.md`. When done, open a
PR into `main` and report in the Status section; then wait for #1's next task.

> Note: your earlier standalone MapGen PR (#1) was superseded — a complete Phase
> 1 board (including seeded map generation) already landed on `main`. Your new
> task builds on that base. Nothing to salvage from the old branch.

---

## Assignment / Inbox (Session #1 writes here)

**Task T5 — Goods + buildings catalog + local price model.**

Branch: **`claude/phase2-goods-prices`** (from latest `main`).

You define the data the whole economy references — merges first, so keep it
clean and additive.

Scope (in):
- **`CONFIG.goods`** — the 14 goods across 3 tiers (GDD §5.1): tier 1 `wood,
  stone, ore, grain, fish, wool`; tier 2 `planks, tools, flour, beer, cloth`;
  tier 3 `bread, clothes, jewelry, furniture`. Each: `{ id, tier, basePrice,
  inputs? }`. Add via a non-destructive merge into the existing `CONFIG`.
- **`CONFIG.buildings`** — at least the 6 tier 1–2 buildings for Phase 2 (GDD
  §5.2): e.g. `sawmill` (forest→wood), `mine` (hills→ore), `farm` (fertile→
  grain), `fishery` (water-adjacent→fish), `mill` (grain→flour), `bakery`
  (flour→bread). Each: `{ id, terrain?, inputs?, output:{goodId, ratePerWorker},
  workerSlots, cost }`.
- **Local price model** as a pure function `Sim.priceFor(town, goodId)` (or a
  standalone `Prices` module if `Sim` isn't present yet — coordinate via the
  contract): implement GDD §6.1 —
  `ratio = stock / (demand * bufferTarget)`,
  `price = clamp(basePrice * (1.6 - 0.8*ratio), basePrice*0.4, basePrice*3.0)`,
  with the 10%/tick lerp smoothing. `bufferTarget ≈ 2.0` in `CONFIG`.

Scope (out): the production/consumption tick itself (that's #2/T4); the town
panel UI (that's #4/T6). Pure data + pure functions only — no DOM.

Definition of done:
- **Headless test** `test/prices.test.js` (Node): surplus stock ⇒ price near the
  0.4× floor; scarcity ⇒ near the 3.0× ceiling; a mid ratio ⇒ ~basePrice; every
  good has a valid tier and any `inputs` reference real goods; smoothing moves
  price gradually. Say how to run it in your PR.

---

## Status / Outbox (Session #3 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
