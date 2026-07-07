# TASK_2 — Session #2

**You are Session #2 (a worker).** If you were told "you are Session #2," this is
your file. **First pull `main`**
(`git fetch origin main && git checkout main && git pull origin main`), then read
[PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) (protocol) and [TASKS.md](TASKS.md)
(shared data contract), and do the task below.

**Rules for you:** edit **only this file** (`TASK_2.md`) among coordination
files; cut your task branch from fresh `main`; build **only your slice**, not the
whole phase. Never edit `TASKS.md`, `TASK_3.md`, or `TASK_4.md`. When done, open a
PR into `main` and report in the Status section; then wait for #1's next task.

---

## Assignment / Inbox (Session #1 writes here)

**Task T4 — `Sim` core: production + consumption economy tick.**

Branch: **`claude/phase2-sim-core`** (from latest `main`).

You built the Phase 1 board, so you own the architectural cornerstone: the one
pure `Sim` core (GDD §9.1, §4.3, §5).

Scope (in):
- Add a **pure, deterministic `Sim` module** to `index.html` (no DOM, no canvas,
  no I/O) — fence it in a marked block (e.g. `// === SIM-CORE START/END ===`).
- `Sim.tick(State)` advances one economy step for every town in `State.towns`:
  1. **Production:** each building produces `output.ratePerWorker × workers ×
     happinessFactor`, consuming its `inputs` from town stock (skip if inputs
     missing). Respect `workerSlots` and available population.
  2. **Consumption:** population consumes food/goods per tier (GDD §4.3);
     unmet needs reduce satisfaction.
  3. **Happiness (0–100):** average need satisfaction; drives a 0.5×–1.2× work
     efficiency factor used in step 1.
  4. **Population:** satisfaction sustained <50% → slow decline; 100% → slow
     growth up to house capacity.
  Clamp stock ≥ 0. Keep it all arithmetic on small arrays (budget <5ms).
- **Wire it into the existing two-clock loop:** replace the no-op economy tick in
  the 500ms×gameSpeed accumulator with `Sim.tick(State)`.
- Consume `CONFIG.goods` / `CONFIG.buildings` / the `Town` shape from the
  contract (T5 defines the catalog; until it merges, stub a tiny local catalog
  matching the shape so you're not blocked — note it in your PR).

Scope (out): the goods/buildings *catalog* and price model (that's #3/T5); the
town panel UI and town placement (that's #4/T6). Don't add DOM.

Definition of done:
- **Headless test** `test/sim.test.js` (Node, like `board.test.js`): a town with
  a farm grows stock over ticks; a town with no food sees satisfaction and then
  population fall ("grow and starve"); `Sim.tick` is deterministic (same state in
  ⇒ same state out). Say how to run it in your PR.

---

## Status / Outbox (Session #2 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
