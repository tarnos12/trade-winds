# Trade Winds — Working Notes for Claude Code

This file is the handoff/status doc (it plays the `HANDOFF.md` role the working
rules describe). **Keep it current: update the "Current status" section in the
same commit as every completed task**, so any Claude Code session (or the
author) can resume cold. Author is Mariusz (GitHub `tarnos12`).

> **Working rules:** follow
> <https://raw.githubusercontent.com/tarnos12/claude-rules/master/RULES.md>
> (canonical; cloud/remote sessions that can't see local config should fetch
> this raw URL and follow it). Design/scope source of truth: [GDD.md](GDD.md).
> Read both before starting.

## What this is

**Trade Winds** (working title) is a *Let Them Trade*–inspired economy game: you
build a network of autonomous towns on a hexagonal board that produce, consume,
and trade with each other on their own. You shape the conditions (placement,
production, roads) and earn a tariff on every transaction, spending it to upgrade
the King's castle. **Stack:** a single `index.html`, Canvas 2D, **zero external
dependencies**, saves in `localStorage`. Hard constraints: single-file,
offline-first, no build step, desktop-first. See [GDD.md](GDD.md) for full scope.

Repo: GitHub `tarnos12/trade-winds` (default branch `main`).

## Parallel work — in-session agent team

This project runs multi-part work as an **in-session agent team** — see
[PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md). **Session #1 is the manager**: it
works on `main`, owns the board [TASKS.md](TASKS.md), splits each phase into
non-overlapping slices, **spawns one worktree-isolated subagent per slice** (the
Agent tool, `isolation: "worktree"`), and integrates results into `main` in a
defined merge order, resolving conflicts. "#2/#3/#4" are task slots, not separate
sessions — workers are ephemeral subagents, so there are no per-worker files and
no coordination branch. (For truly independent long-lived sessions, the older
central-dispatch model is in the claude-rules template; not used here.)

## Run & test

- No build step. Run command: **open `index.html` in a browser** (double-click,
  or serve the folder with any static server). Nothing to compile.
- **After a change, tell the author how to see it running** and verify it
  yourself before claiming done.
- Prefer the fastest feedback loop that proves it: exercise the pure `Sim` /
  economy-tick logic headless (a small Node script or unit test) rather than
  always driving the full canvas app.
- Cache-busting: if assets get `?v=N` tags, bump them on any change.

## Current status (update this section every commit)

**Phases 1–4 + Town Interiors + Phase 5 (groundwork + design-free content) + Economy v3 + Construction & building logistics (v0.11.0) + Gradual trade transfer (v0.12.0) + Two-part research & per-building upgrades (v0.13.0) + Research-tree overhaul & kingdom resource overview (v0.14.0: full-screen LTT-style tech tree with bands/pips/queue, per-building unlock nodes, autonomous castle buying, Burgher→Citizen display rename, top-left resource sidebar with price charts) DONE. v0.15.0 LTT panel parity + trade fleets (PP-A..E) + v0.16.0 Terrain & Resources v2 (new tile set w/ deposits+fish+snow+mountains, map presets Oasis/Fertile/Big World, clay→bricks & iron chains, 1,050→ tests) + v0.17.0 Content Chains v2 (12 new buildings, T3 goods, per-tier needs matrix, 70%-capacity happiness model, per-tier tax scaling, ARISTOCRATS 4th tier w/ 1-slot upgradable homes, save migrations; 1,121 tests green) DONE. The full author screenshot wave (research tree, resource sidebar, panels, terrain, content) is SHIPPED. Next candidates: harbors/water trade, knights/combat + Provisioner, campaign scenarios (GDD §10), balance pass on the new 4-tier economy. v0.19.0: Peasant+Worker tiers made fully functional (bakery/bread un-gated from burgher goods, fishery output 1→2 — both tiers reach 100% happiness in full-chain cities) + research-tree layout reworked to topological columns so prerequisite edges stay short (no long diagonals). v0.20.0: Citizen+Aristocrat tiers made functional and the game completable to castle-L5 victory — fixed a manor research-gating deadlock (Manor required iron_tool, a burgher-made good, yet Manor is the sole gateway to burgher housing; re-tiered to worker-band bricks); deterministic tests prove burghers→aristocrats grow and victory reached at tick 2859 (balance.test.js 54 asserts; 1,219 total green). v0.20.1 polish pass (Sonnet, screenshot-grounded): celebratory victory overlay (confetti + run-stats recap + fanfare on every win path), fixed a town-placement hover hint that claimed fogged hexes were valid, and themed warehouse-table scrollbars. Standing directive: orchestrate work via dynamic Workflows (plan → implement → adversarial review), delegating to Sonnet/Opus subagents by complexity.**

Done:
- Git repo initialized (branch `main`); remote `tarnos12/trade-winds` added.
- GDD imported as [GDD.md](GDD.md) (the design/scope source of truth).
- This handoff doc created and wired to the working rules.
- Multi-session central-dispatch set up: [PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md),
  board [TASKS.md](TASKS.md), worker files [TASK_2.md](TASK_2.md) /
  [TASK_3.md](TASK_3.md) / [TASK_4.md](TASK_4.md). Session #1 = manager (works on
  `main`; workers pull `main` before each task and PR into it).
- **Phase 1 — The Board** landed in `index.html`: `CONFIG`, `HexMath`, seeded
  `MapGen` (mulberry32, quantile biomes, island falloff), fog, offscreen terrain
  pre-render (1 `drawImage`/frame), camera pan/zoom, build mode (roads + town
  markers + erase), two-clock loop (rAF render + 500ms×speed economy
  accumulator). Headless test `test/board.test.js` (25/25). Verified in headless
  Chromium: no console errors, canvas renders. DoD met.

- **Phase 2 — Towns & Production** landed via the agent team (merge order T5 →
  T4 → T6): `CONFIG.goods`/`CONFIG.buildings` + `Sim.priceFor` price model
  (§6.1), the pure `Sim.tick` production→consumption→happiness→population step
  wired to the 500ms accumulator, and town entities + a 4-tab DOM town panel.
  Tests: `board` 25 · `prices` 51 · `sim` 27; integrated headless smoke clean.
  DoD met (a town grows/starves; prices react to stockpiles).

- **Phase 3 — Trade** landed via the agent team (merge order T7 → T8 → T9):
  `Pathing` (Dijkstra road graph + route cache), pure `Trade.tick` (autonomous
  carts pick top-3 profitable routes, transactions, 25% tariff → `state.treasury`,
  seeded/deterministic), and cart rendering + treasury HUD + castle warehouse.
  Towns start at level 2 so they trade on placement. Tests: `pathing` 24 ·
  `trade` 28. Verified end-to-end headless (carts trade, treasury grows, goods
  flow; road cut nulls the route). DoD met.

- **Town Interiors** landed via the agent team (TI-A → TI-B → TI-C): replaced
  auto-seeded buildings with player placement — a 15-type catalog (extractors on
  terrain / processors / houses), `Buildings.canPlace` (terrain + radius + slot
  cap + affordability), `Sim.tick` staffs buildings from population and grows
  workers/burghers from housing as needs are met, build-menu UI + placement
  overlay, buildings rendered. Towns start center-only with a founding kit.
  Tests: `buildings` 37, `sim` 40.

- **Two-part research + per-building upgrades (v0.13.0)** landed via dynamic
  Workflows (RU-A logic by Opus w/ plan + dual adversarial review; RU-B UI by
  Sonnet w/ Opus review). Part 1: a **'development' research branch** (4 chained
  nodes: hut/lumberjack/farm/sawmill upgrades; materials in RESEARCH_MATERIALS)
  unlocks upgrade *possibilities*. Part 2: click a building → buy its next level
  (`Buildings.startUpgrade`) — **gold → treasury at purchase; resources delivered
  from town.stock** by the shared CB-A delivery step (priority-first), pending
  needs feed town demand. `CONFIG.upgrades` ladders: hut L2–4 (+1 capacity each,
  L4 −30% basic consumption), lumberjack/farm L2–3 (output ×1.25/×1.5), sawmill
  L2–3 (output + L3 +1 slot). `Buildings.upgradeEffect` wired into worker slots,
  production, housingCapacity, and a capacity-weighted per-tier basic-consumption
  multiplier. UI: building-panel Upgrades section (pending/available/locked/max),
  🏗 Development research column, map level badges + pending-material chips,
  `BuildingUI.startUpgrade` hook. Building fields `upgradeLevel`/`pendingUpgrade`.
  Tests: buildings 109, sim 88, research 72 (496 total green).

- **Gradual trade transfer (v0.12.0)**: trades are no longer instant. Each trader
  travels, then **parks to LOAD at the seller and UNLOAD at the buyer** over
  `ceil(qty / (CONFIG.trade.transferRate × tickSec))` ticks (`transferRate` = 5
  items/sec of game time; same for castle traders via `CONFIG.researchEconomy`).
  The **purchase settles atomically on arrival** (unchanged economics — so market
  moves / Sim consumption can't nibble a half-loaded cart and balance is preserved);
  the dwell is load *time* and the haul **meters into the buyer's stock** as it
  unloads. This intentionally cuts throughput (~3× fewer trips), so tight economies
  lean more on local production. Render: `cartPixel` mirror removed (returning carts
  animated backwards — fixed), `drawCarts(dt)` eases position with a frame-rate-
  independent `1−e^(−dt/τ)` lerp; hover shows Loading/Hauling/Unloading + live count.
  Tests: `trade` 64 (452 total green).

- **Construction & building logistics (v0.11.0)** landed via the agent team
  (CB-A → CB-B → CB-C → CB-D): buildings are placed **under construction** —
  placement charges only GOLD (treasury); the RESOURCE cost is delivered from the
  city's own stock over time (`CONFIG.town.deliveryRate`) by a pure Sim step, and
  each unbuilt building's remaining need feeds town demand (so the external trader
  buys materials → "city demand from its own buildings"). Sim skips unbuilt
  buildings, staffs effective slots (`workerSlots − closedSlots`), priority
  buildings first. New `Buildings` helpers `resourceCost`/`isInstant`/
  `constructionNeed`; building fields `built`/`delivered`/`closedSlots`/`priority`.
  Visuals: under-construction scaffold + missing-resource chips on the map; trader
  cargo icon+number (greyed = requested/en-route-to-buy). New **per-building click
  panel** (info + construction + ⭐ priority + click-to-lock worker slots) — building
  info moved OUT of the city panel; the Population tab gained a **workforce roster**
  (assigned vs idle, hover breakdown). Tests: buildings 84, sim 76 (446 total green).

- **Phase 4 — Progression** landed via the agent team (P4-A → P4-B → P4-C):
  research tree (15 nodes, treasury-funded, effects queryable), town leveling
  (L1→4; a town must reach L2 to trade — replaces the old auto-L2 bridge), King's
  quests + prestige, castle levels 1→5 (L5 = victory), Kingdom screen, town
  alerts, and random events (bumper/craze/fair/collapsed-bridge). Accumulator runs
  Sim→Trade→Research→Quests→Events. Tests: `research` 40, `progress` 29.

Next (recommended order):
1. **Phase 5 — Content & Polish** (GDD §10): campaign scenarios + start screen,
   tutorial (first King's requests as onboarding), audio (WebAudio), juice
   (chimney smoke, transaction particles), optional bandits/guards. Also wire
   more research effects into Sim/Trade/Buildings (currently queryable but only
   lightly applied).
2. GDD §13 open questions (combat scope, tab-hidden behavior, tariff range,
   goods count, win condition, title) — resolve before/along Phase 5.
3. GDD §13 open questions (combat scope, tab-hidden behavior, tariff range,
   goods count, win condition, title) — not blockers yet.

Note: terrain enum as built uses `fertile` (not `field`); the code is the source
of truth — full set: `water, meadow, forest, hills, mountains, fertile, wasteland`.

## Architecture conventions (hold these)

Derived from GDD §9; keep these load-bearing:
- **One pure `Sim` core.** The economy tick (production → consumption → prices →
  cart decisions) is deterministic and side-effect-free — no I/O, no DOM, no
  canvas. This is what makes it testable and lets it run at 4x / autoplay.
- **Two clocks, separated:** render on `requestAnimationFrame`; economy on a
  fixed 500ms × gameSpeed timestep ("fix your timestep" accumulator).
- **`CONFIG` is the single source of truth** for all balance constants — one
  object, easy tuning. No magic numbers scattered in logic.
- **UI in DOM, world in canvas.** Panels are HTML layered over the canvas, not
  drawn in it. Terrain pre-rendered to an offscreen canvas (1 `drawImage`),
  redrawn only when fog reveals.
- **Persistence is versioned** (`saveVersion`) with a migration path; autosave
  every 30s + on `visibilitychange`. JSON export/import as a string.
- **Prefer additive, self-contained modules** over editing shared hot files.

## Workflow

- One commit per completed task; **update "Current status" above in that same
  commit.** (Full rules: the RULES.md link at the top.)
- Commit after every completed task; push once a remote exists.
- Platform: Windows. CRLF warnings from git are expected/harmless.
