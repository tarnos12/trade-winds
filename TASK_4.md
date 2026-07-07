# TASK_4 — Session #4

**You are Session #4 (a worker).** If you were told "you are Session #4," this is
your file. **First pull `main`**
(`git fetch origin main && git checkout main && git pull origin main`), then read
[PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md) (protocol) and [TASKS.md](TASKS.md)
(shared data contract), and do the task below.

**Rules for you:** edit **only this file** (`TASK_4.md`) among coordination
files; cut your task branch from fresh `main`; build **only your slice**, not the
whole phase. Never edit `TASKS.md`, `TASK_2.md`, or `TASK_3.md`. When done, open a
PR into `main` and report in the Status section; then wait for #1's next task.

> Note: a complete Phase 1 board already landed on `main` (yours and #2's earlier
> full-board attempts overlapped — #2's was adopted). **Pull `main` and build on
> that `index.html`.** Don't rebuild the board; your task is towns + UI on top.

---

## Assignment / Inbox (Session #1 writes here)

**Task T6 — Town entities + town panel UI (DOM).**

Branch: **`claude/phase2-town-ui`** (from latest `main`).

Make towns real objects on the board and give the player a window into them.
UI lives in **DOM layered over the canvas** (GDD §8, §9.1) — this keeps your
work mostly out of the Sim/data files, so it merges cleanly.

Scope (in):
- **Town creation:** the existing build mode has a `town` tool — placing a town
  marker creates a `Town` per the contract shape in `State.towns` (id, q, r,
  level 1, starting pop/gold/stock, empty buildings). A town center occupies a
  buildable hex; buildings attach within radius 1–2 (GDD §4.1).
- **Town panel (DOM):** clicking a town center opens an HTML panel over the
  canvas with tabs **Overview / Stock+Prices / Buildings / Population**. Show
  live stock quantities, `Sim.priceFor` prices with a ▲▼ trend arrow (GDD §8),
  population by tier, and happiness. Panel closes/reopens; doesn't block panning.
- Read from the contract: `State.towns`, the `Town` shape, `CONFIG.goods/
  buildings`, and the price model. If #2/#3 haven't merged yet, stub one town +
  a tiny catalog matching the shapes so you can develop, and note it in your PR.

Scope (out): the production/consumption tick (#2/T4) and the goods/buildings
catalog + price formula (#3/T5). Don't reimplement Sim or prices — consume them.

Definition of done:
- Open `index.html`: place a town, click it, see the panel with all four tabs
  populated from live state; prices show trend arrows; panel updates as the
  economy ticks. Say how to see it running in your PR (and confirm no console
  errors — a quick headless check is ideal).

---

## Status / Outbox (Session #4 writes here)

- Status: 🔲 not started
- Branch pushed: —
- PR: —
- Questions/blockers for #1: —
