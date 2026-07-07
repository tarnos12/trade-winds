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

- Status: 🔵 PR open — T6 town entities + town panel done
- Branch pushed: `claude/phase2-town-ui`
- PR: #2 — https://github.com/tarnos12/trade-winds/pull/2
- Questions/blockers for #1: none blocking. See merge notes below.

### What landed (all additive, fenced under `Phase 2 · T6` markers)
- **Town factory** `makeTown(q,r)` — the `town` build tool now creates a full
  `Town` (exact contract shape: `id, name, q, r, level, gold, pop{peasants,
  workers, burghers}, stock, prices, buildings[], happiness`) into `state.towns`.
  `normalizeTown()` upgrades any Phase-1 `{q,r}` markers from old saves.
- **Town panel (DOM)** `#townpanel` + `TownPanel` module — click a town center
  (pan or town mode) to open; tabs **Overview / Stock+Prices / Buildings /
  Population**. Stock+Prices reads `Sim.priceFor` with ▲▼ trend arrows; refreshes
  ~4×/s so it tracks economy ticks. Esc / ✕ closes; panning still works.
- Placing a town auto-opens its panel; erasing a town closes it if open.

### Merge notes for #1 (please read before merging)
- I only edited `index.html` + this file. Nothing in `TASKS.md`/`TASK_2`/`TASK_3`.
- All my logic is in clearly-marked `Phase 2 · T6` blocks (one CSS block, one
  `<div id="townpanel">`, one JS module block) + a few one-line hooks in
  `place()`, `mouseup`, `loadGame`, `frame()`, and the `window.TW` export.
- **DEV STUBS** (guarded `if (!CONFIG.goods)…`, `if (!Sim.priceFor)…`, and a
  `Sim.tick` wrapper) stand in for **#3/T5** (goods+buildings+price formula) and
  **#2/T4** (production tick). They're defensive (only define if absent), so when
  T5/T4 merge first (per the merge order #3→#2→#4) the real catalog/price/tick
  win and my stubs no-op. The whole `DEV STUB` section can be deleted on merge;
  the Town factory + panel keep working on the real data. `Sim.priceFor` I call
  matches the contract signature `(town, goodId)`.

### How to see it running
Open `index.html` → **Town** tool → click buildable land (or 👁 Fog to reveal
first). The town's panel opens; switch tabs; watch Stock+Prices arrows move.
Verified headless in Chromium (seed `greenhollow`): town shape matches the
contract, all 4 tabs populate, grain price moved across 6 ticks with ▲/▼ arrows
rendered, Esc closes, **zero console errors**, 60 FPS. Pure-core test
`test/board.test.js` still 25/25 (my changes are outside the pure-core markers).
