# Trade Winds — GDD (Design Authority)

**Status:** Stage 3 (1.0) in progress — Prototype/MVP/Demo criteria met; polishing toward feature-complete
**Author:** Mariusz (GitHub `tarnos12`)

> **Design authority — the source of truth for scope.** Keep it current: mark
> items done, add new plans as scope evolves. The team-facing distillation of
> this doc (goal, stack, constraints, module→ownership map, roster, milestone
> exit criteria) plus the live project status lives in [PROJECT.md](PROJECT.md).
> Team-running methodology is in [CLAUDE.md](CLAUDE.md); agent-teams mechanics in
> [AGENT_TEAMS.md](AGENT_TEAMS.md).

*(Regenerated from the original verbose GDD into the staged-roadmap shape; the
detailed reference — goods tree, price formula, progression — is folded into
§6–§8 so this file stands alone as the design authority.)*

---

## 1. Vision & pillars

**Elevator pitch:** A *Let Them Trade*–inspired economy game. You build a network
of autonomous towns on a hexagonal board; towns produce, consume, and trade with
each other on their own. You shape the conditions — where towns stand, what they
produce, where the roads run — and earn a tariff on every transaction, spending it
to upgrade the King's castle.

**Stack / hard constraints:** single `index.html`, Canvas 2D, **zero external
dependencies**, saves in `localStorage`. Single-file, offline-first, no build
step, desktop-first.

**Design pillars (the non-negotiables):**

1. **Let them trade — don't micromanage.** The player never clicks "sell 5 wood."
   You build the conditions; the economy plays itself. The joy is watching a
   system you designed come alive.
2. **Economy as simulation, not script.** Prices emerge from real supply/demand
   per town — no fixed price tables. Drowning in wood ⇒ wood gets cheap.
3. **Board-game feel.** Flat "wooden" tokens, warm paper/sepia palette,
   micro-animated carts. Readability > realism.
4. **Cozy, not stressful.** No fail state in sandbox — failure is stagnation, not
   game-over. Pace controlled by a speed slider (pause / 1× / 2× / 4×).
5. **Single-file, offline-first.** One file, open and play; hostable anywhere.

**Explicitly out of scope (v1.0):** 3D, combat (optional Phase 5 only), a map
editor (seed generation suffices), multiplayer.

---

## 2. Core loop / primary flow

```
OBSERVE the market (prices, shortages, surpluses across towns)
   ↓
BUILD / UPGRADE (a town, a production building, a road)
   ↓
TOWNS TRADE on their own (carts travel, prices equalize)
   ↓
YOU EARN a tariff on every transaction
   ↓
INVEST (research, castle upgrades, new towns)
   ↓
NEW population needs → new production chains → back to top
```

The smallest complete experience is a **single town that grows or starves as its
needs are met**, plus **two towns trading a good along a road**. Everything else
(research, tiers, quests, castle) gives that loop texture — it does not replace it.

- **5-minute session:** check shortage alerts → place 1–2 buildings → leave on 2×.
- **45-minute session:** plan a new production-chain branch, found a town, rework
  the road network.

---

## 3. Architecture notes (build once, use in every stage)

Decisions kept load-bearing from day one (see [CLAUDE.md](CLAUDE.md) for the live
conventions the code holds):

1. **One pure, deterministic `Sim` core.** The economy tick (production →
   consumption → prices → cart decisions) is side-effect-free — no I/O, DOM, or
   canvas. This is what makes it testable, tunable, and runnable at 4× / autoplay.
2. **Two clocks, separated.** Render on `requestAnimationFrame`; economy on a
   fixed 500 ms × gameSpeed timestep ("fix your timestep" accumulator). 2 ticks =
   1 game-second.
3. **`CONFIG` is the single source of balance truth** — one object, no magic
   numbers scattered in logic.
4. **UI in DOM, world in canvas.** Panels are HTML layered over the canvas.
   Terrain is pre-rendered to an offscreen canvas (1 `drawImage`/frame), redrawn
   only when fog reveals.
5. **Persistence is versioned** (`saveVersion`) with a stepwise migration path;
   autosave every 30 s + on `visibilitychange`; JSON export/import as a string.
6. **Prefer additive, self-contained modules** over editing shared hot files —
   fewer conflicts, especially with parallel subagents (fence each slice).

Module map (single file): `CONFIG · HexMath · MapGen · Sim · Pathing · Trade ·
Research · ResearchEconomy · Buildings · Quests · Events · Renderer · UI · Save`.

---

## 4. Staged roadmap

The original 5-phase plan mapped onto the staged template. Each stage lists
**goal / in / out / exit**. **Phases 1–4 and the bulk of Phase 5 content are
shipped;** current work is the 1.0 polish/balance tail.

### Stage 0 — Prototype ✅ DONE (Phase 1 — The Board)
- **Goal:** a clickable hex world with a camera.
- **In:** HexMath, seeded map gen + biomes + fog, camera pan/zoom, terrain
  pre-render, build mode (roads + town markers).
- **Exit (met):** generate a map from a seed, move the camera, place roads, 60 FPS.

### Stage 1 — MVP ✅ DONE (Phases 2–3 — Towns & Trade)
- **Goal:** the systems that make it a real thing, not a tech demo.
- **In:** town centers + houses + production buildings + town panel; the economy
  tick (production/consumption/happiness/population); the local price model; the
  road graph + Dijkstra; autonomous cart agents; transactions + tariff + treasury;
  the castle warehouse; versioned saves.
- **Exit (met):** specialized towns reach a stable trade equilibrium without
  intervention; cutting a road causes a visible price crisis; save/load correct.

### Stage 2 — Demo ✅ DONE (Phase 4 — Progression)
- **Goal:** a polished, shareable slice with a goal.
- **In:** research tree, population tiers (peasant/worker/citizen/aristocrat),
  King's requests + prestige, castle levels 1→5 (L5 = victory), the Kingdom
  overview screen, town alerts, random events, victory overlay, onboarding hints.
- **Exit (met):** a sandbox run from zero to castle-L5 victory is playable with a
  real difficulty arc (deterministic test reaches victory).

### Stage 3 — 1.0 🔜 IN PROGRESS (Phase 5 — Content & Polish)
- **Goal:** complete, shippable.
- **In:** full content breadth (12+ buildings, T3 goods, 4 population tiers —
  done); **resource-metered research + placeable Research Center (done, v0.21.0)**;
  balancing pass; audio (WebAudio); juice (chimney smoke, transaction particles);
  full save export/import; campaign scenarios + start screen + tutorial.
- **Out:** anything requiring a live backend.
- **Exit:** feature-complete, balanced, no known blocking issues; a stranger can
  finish scenario 1 without asking questions.
- **Remaining:** campaign scenarios + start screen; tutorial-as-onboarding; audio;
  juice; a balance pass on the 4-tier economy and the new Research Center
  costs/speeds; wire more research effects into Sim/Trade.

### Stage 4 — Next (optional / parking lot)
- Bandits + guard posts (a "security tax") — only if Stage 3 balance is stable.
- Harbors / water trade; knights/combat + Provisioner.
- v2.0 parking lot: seasons, player-defined inter-town contracts, seed-of-the-day.
  Anything needing a backend is out of scope for this document.

---

## 5. Open questions (resolve before committing scope; record decisions inline)

Design:
1. **Combat** — cut to optional Stage 4. *(Still deferred.)*
2. **Tab-hidden behavior** — default: pause when not visible (no offline
   progression). *(Assumed; a capped ~10-min catch-up is the alternative.)*
3. **Tariff** — baseline 25%, slider 10–40% (10% floor closes the "0% tariff"
   exploit). *(Assumed range.)*
4. **Goods count** — grew from the original 14 to the current content-chains-v2
   set (T1–T3 across 4 tiers). *(Shipped; balance ongoing.)*
5. **Win condition** — castle L5 + a 6-scenario campaign. *(Castle L5 shipped;
   scenarios are Stage-3 remaining.)*
6. **Title** — "Trade Winds" is still a working title.
7. **Research model (RESOLVED 2026-07-11)** — research costs **resources only**
   (no gold, no time-clock), metered over time by a **placeable Research Center**
   next to the castle whose level sets the drain speed; research is paused until a
   center is built. Materials drain equally so a node's inputs finish together.

Technical:
8. Map radius ~14 (~600 hexes), pointy-top, axial coords. *(Shipped; terrain set
   expanded in v0.16.)*
9. Desktop-first, mouse-driven — no touch controls in v1.0. Flag if mobile should
   move up (real audience if hosted on a games site).
10. Aesthetic: flat 2D code-drawn shapes, warm paper/wood/sepia palette,
    storybook serif. Art direction remains open.

---

## 6. Resources & production chains (reference)

- **Tiered goods**, raw → processed → luxury. Core raws: wood, stone, iron, clay,
  grain, potato, fish, wool. Processed: planks, flour, mead, bricks, coal,
  iron_tool, stone_tools, oil, clothes. Luxury / T3: bread, pottery, lamp,
  iron_armor, chairs, gold_ring, brandy, luxury_clothes.
- **Food is a category** — a town consumes whatever food is available.
- **Chain rule:** the building-slot limit means no town is self-sufficient at
  higher center levels — **specialization forces trade**. The mining town needs
  bread from the farming town, which needs tools from the mining town.
- Terrain enum as built: `water, meadow, forest, hills, mountains, fertile,
  wasteland` (the code is the source of truth). Extractors sit on their resource
  hex; processors sit on any town hex.

## 7. Market & trade (reference)

- **Price per town/good** from stock vs demand:
  `ratio = stock / (demand · bufferTarget)` (bufferTarget ≈ 2);
  `price = clamp(basePrice · (1.6 − 0.8·ratio), 0.4·base, 3.0·base)`, smoothed per
  tick. Surplus → 40 % of base; scarcity → 300 %.
- **Carts** (towns at center L2+): pick profitable routes
  (`profit = (priceThere − priceHere)·load − distanceCost`) with a small top-3
  randomness so carts don't herd; a purposeful-dispatch floor (`minStock`) stops
  small towns from wanting <1 unit and never trading. Trades are **gradual** —
  carts park to load/unload over time; the purchase settles atomically on arrival.
- **Tariff** = the player's income: a share of every inter-town transaction to the
  treasury (adjustable slider). Roads: Dijkstra on the road-node graph; paved
  roads are faster.

## 8. Progression (reference)

- **Research** — resource-metered (see Q7). A **Research Center** next to the
  castle (built from castle-stock materials, no workers, upgradable L1–4 with
  speeds 2/3/4/6) sets the drain speed. Consumption is quantized to whole
  game-seconds and gated atomically on castle-stock availability. Kingdom Overview
  and the Keep tab show a live progress bar with per-material consumed/needed.
- **Population tiers** peasant → worker → citizen (burgher) → aristocrat; each tier
  has needs and pays higher local tax as it's satisfied. Growth scales with tier
  happiness.
- **King's requests** (data-driven quest templates) grant gold + prestige;
  **castle levels 1→5** (L5 = victory). **Random events** are cozy market
  opportunities (bumper harvest, demand craze, fair, collapsed bridge), never
  destructive to progress.
