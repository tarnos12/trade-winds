# Trade Winds — GDD (Design Authority)

**Status:** Unity port — Milestone 1 (economy core) next. The web version (v0.52.1) is frozen in
[`old-game-files/`](old-game-files/) as a behavioural reference.
**Author:** Mariusz (GitHub `tarnos12`)

> **Design authority — the source of truth for scope.** Keep it current: mark
> items done, add new plans as scope evolves. The team-facing distillation of
> this doc (goal, stack, constraints, module→ownership map, roster, milestone
> exit criteria) plus the live project status lives in [PROJECT.md](PROJECT.md).
> Domain vocabulary is in [CONTEXT.md](CONTEXT.md); architectural decisions in
> [docs/adr/](docs/adr/). Team-running methodology is in [CLAUDE.md](CLAUDE.md);
> agent-teams mechanics in [AGENT_TEAMS.md](AGENT_TEAMS.md).

---

## 1. Vision & pillars

**Elevator pitch:** A *Let Them Trade*–inspired economy game. You found a network
of autonomous Towns on a hexagonal board; Towns produce, consume, and trade with
each other on their own. You shape the conditions — where Towns stand, what they
produce, where the roads run — and earn a Tariff on every trade between Towns,
investing it to grow the Kingdom.

**Stack / hard constraints:** Unity 6 (6000.3), 2D URP, C#. Windows desktop first
with Steam in mind; WebGL possible but not required; no mobile in v1. Author-supplied
sprite art (placeholder sprites until then). See [ADR 0001](docs/adr/0001-unity-desktop-port.md).

**Design pillars (the non-negotiables):**

1. **Let them trade — don't micromanage.** The player never clicks "sell 5 wood."
   You build the conditions; the economy plays itself. The joy is watching a
   system you designed come alive.
2. **Economy as simulation, not script.** Prices emerge from real supply/demand
   per Town — no fixed price tables. Drowning in wood ⇒ wood gets cheap.
3. **Board-game feel.** Flat "wooden" tokens, warm paper/sepia palette,
   micro-animated Traders. Readability > realism.
4. **Cozy, not stressful.** No fail state — failure is stagnation, not
   game-over. Pace controlled by speed (pause / 1× / 2× / 4×).

**Explicitly out of scope (v1.0):** 3D, combat, a map editor (seed generation
suffices), multiplayer, mobile, migrating web-version saves.

---

## 2. Core loop / primary flow

```
OBSERVE the market (prices, shortages, surpluses across Towns)
   ↓
BUILD / UPGRADE (a Town, a production building, a road)
   ↓
TOWNS TRADE on their own (Traders travel, prices equalize)
   ↓
YOU EARN a Tariff on every trade
   ↓
INVEST (research, new Towns, Mission goals)
   ↓
NEW Population Tier needs → new production chains → back to top
```

The smallest complete experience is a **single Town that grows or starves as its
needs are met**, plus **two Towns trading a Good**. Everything else
(research, tiers, Missions) gives that loop texture — it does not replace it.

- **5-minute session:** check shortage alerts → place 1–2 buildings → leave on 2×.
- **45-minute session:** plan a new production-chain branch, found a Town, rework
  the road network.

---

## 3. Architecture notes (build once, use in every stage)

1. **Pure C# simulation core** ([ADR 0002](docs/adr/0002-pure-csharp-sim-core.md)).
   The economy (production → consumption → prices → happiness → population →
   Trader decisions) lives in its own assembly with no `UnityEngine` reference:
   plain classes, seeded RNG, deterministic. Edit Mode tests run it headless.
2. **Two clocks, separated.** Rendering every frame; the economy on a fixed
   500 ms × gameSpeed tick (2 ticks = 1 game-second). Visuals interpolate between
   ticks. The game pauses when the window loses focus (setting, default on).
3. **Balance data in ScriptableObjects** (Goods, buildings, Population Tiers,
   Missions), converted into plain C# data the core reads. No magic numbers in logic.
4. **Unity renders, the core decides.** MonoBehaviours feed player input in and
   draw sim state; GameObjects never own sim state. Board = hexagonal (pointy-top)
   Tilemap; UI = UI Toolkit.
5. **Persistence is versioned** (save version starts at 1) with a stepwise
   migration path for every later bump.
6. **Prefer additive, self-contained modules** over editing shared hot files.
7. **Headless balance runner** — an editor tool that runs the core for N ticks
   and reports (successor to the web version's balance lab).

---

## 4. Staged roadmap

The web version reached its Stage 3 tail (see `old-game-files/`). The Unity port
restarts the stages; it is a **port-and-rethink**, not a parity rewrite — systems
that weren't working (the peasant-tier stall, partly-wired research effects) are
redesigned. Content grows **one Population Tier at a time**, each balanced before
the next.

### Milestone 1 — Economy core 🔜 NEXT
- **Goal:** the smallest complete experience, in Unity.
- **In (step 1, headless):** pure C# core — hex math, seeded rectangular board,
  Towns, Peasant tier needs, production/consumption, local prices, pathing (off-road + roads),
  pathing, Traders, Tariff; Edit Mode tests.
- **In (step 2, on screen):** hex Tilemap board from a seed, camera pan/zoom,
  placing roads and Towns, Traders animated across the board, minimal Town panel,
  speed controls. Placeholder sprites.
- **Content:** Peasant tier — Basic Needs Potato + Wood, Luxuries Fish + Wool.
- **Exit:** a potato Town and a timber Town, each specialised by terrain, trade
  Potato ↔ Wood unattended (no road needed) and the Crown earns Tariff; building a
  road between them visibly speeds trade and narrows their price gap, removing it
  widens the gap again; covered by tests.

### Milestone 2 — The Kingdom
- **In:** the Castle and Castle Stock, Castle market, Porters, fog + scouts,
  versioned save/load, Worker tier (Basic Fish + Coal; Luxuries Clothes, Bread,
  Mead), headless balance runner.
- **Exit:** a two-tier Kingdom grows unattended without stalling; save/load correct.

### Milestone 3 — Progression
- **In:** resource-metered research + Research Center, Missions, Burgher and
  Aristocrat tiers, start screen, tutorial.
- **Exit:** a run from zero to Victory is playable with a real difficulty arc
  (deterministic test reaches Victory).

### Milestone 4 — 1.0
- **In:** author art, balance pass, polish. Undecided: provisions, juice, audio,
  ambient chatter.
- **Exit:** feature-complete, balanced, no known blocking issues; a stranger can
  reach Victory without asking questions.

### Parking lot
- Kingdom festival as the final Mission; bandits + guard posts; harbors / water
  trade; seasons; player-defined contracts; seed-of-the-day.

---

## 5. Open questions (resolve before committing scope; record decisions inline)

Design:
1. **Combat** — out of scope for v1.0.
2. **Tariff** — baseline 30%, slider 10–40% (10% floor closes the "0% tariff"
   exploit). *(Assumed range.)*
3. **Win condition (RESOLVED)** — Victory = completing the Mission chain. The
   final Mission is currently "an Aristocrat home at 100% happiness"; it will
   later become something richer (e.g. a Kingdom festival supplied over time).
   Castle levels and random events are cut.
4. **Research model (RESOLVED 2026-07-11)** — research costs **Goods only**
   (no gold, no time-clock), metered over time by a **placeable Research Center**
   next to the Castle whose level sets the drain speed; research is paused until a
   center is built. Materials drain equally so a node's inputs finish together.
5. **Undecided carry-overs** — provisions/Provisioner, juice, audio, ambient chatter.
6. **Title** — "Trade Winds" is still a working title.

Technical:
7. **Board (RESOLVED)** — a rectangle of pointy-top hex tiles, axial coords, three
   size presets (web defaults 36×18 / 50×25 / 66×33). The Castle sits near the
   board's origin.
8. **Platform (RESOLVED)** — Windows desktop first, mouse-driven. See ADR 0001.
9. **Aesthetic** — board-game look as sprites; author supplies art.

---

## 6. Goods, needs & production chains (reference)

- **Tiered Goods**, raw → processed → luxury. Web-version catalogue (reference,
  re-introduced tier by tier): raws wood, stone, iron, clay, grain, potato, fish,
  wool, coal, gold; processed planks, flour, mead, bricks, iron_tool, stone_tools,
  oil, clothes; T3 bread, pottery, lamp, iron_armor, chairs, gold_ring, brandy,
  luxury_clothes.
- **Needs matrix** (Basic Needs hold happiness at 70%; Luxuries lift it to 100%;
  one Good can be a Luxury for one tier and a Basic Need for another):

  | Tier | Basic Needs | Luxuries |
  |---|---|---|
  | Peasant | Potato, Wood | Fish, Wool |
  | Worker | Fish, Coal | Clothes, Bread, Mead |
  | Burgher | Lamp, Bread, Mead, Clothes | Chairs, Pottery, Gold Ring |
  | Aristocrat | Lamp, Mead, Iron Armor, Chairs, Pottery | Brandy, Luxury Clothes, Gold Ring |

- **Chain rule:** the building-slot limit means no Town is self-sufficient —
  **specialization forces trade**.
- Terrain: `water, meadow, forest, hills, mountains, fertile, wasteland`.
  Extractors sit on their Deposit hex; processors sit on any Town hex.

## 7. Market & trade (reference)

- **Price per Town/Good** from Stock vs minutes of **consumption** (residents +
  processor inputs; construction bills and research are lumps, not rates, so they
  drive trade buying but not prices):
  `ratio = stock / (max(0.5, consumption per min) · coverMin)` (coverMin = 2 min);
  `price = basePrice · clamp(1.9 − ratio, 0.4, 1.9)`, smoothed per tick. Surplus
  → 40 % of base; a comfortable 2 min → 90 %; empty shelf → 190 %. Nothing
  stocked and nothing consumed → no market.
- **Traders** pick profitable routes
  (`profit = (priceThere − priceHere)·load − distanceCost`) with a small top-3
  randomness so they don't herd; a purposeful-dispatch floor (`minStock`) stops
  small Towns from never trading. Trades are **gradual** — Traders park to
  load/unload over time; the purchase settles atomically on arrival.
- **Tariff** = the player's main income: a share of every trade between Towns
  (adjustable). **Tax** = income from residents by need satisfaction.
- **Roads are optional.** Traders travel off-road on any passable hex (detouring
  around water and mountains) at half speed; a road route is 2× faster, paved
  roads faster still. Roads are an investment in speed, not a connection
  requirement.

## 8. Progression (reference)

- **Research** — Goods-metered (see Q4). A **Research Center** in the Castle
  Compound (built from Castle Stock, no workers, upgradable L1–4 with speeds
  2/3/4/6) sets the drain speed.
- **Population Tiers** Peasant → Worker → Burgher → Aristocrat; each has Basic
  Needs and Luxuries and pays more Tax as it's satisfied. Population follows
  housing × happiness.
- **Missions** — a sequenced chain of Crown goals; completing the last one is
  Victory.
