# Economy Rewrite — master spec (v0.51 → v0.5x)

Authoritative design for the economy overhaul. Every teammate builds against THIS
doc. Terminology is **cycles/seconds**, never raw ticks (2 engine ticks = 1 game
second; keep tick math internal, never surface it to the player or the design).

Determinism is non‑negotiable: Sim/Trade/Buildings stay in `PURE_CORE` — no DOM,
no `Math.random`/`Date`, seeded RNG only, fixed iteration order.

---

## 1. Production in CYCLES (per building)

Each producing building runs a **cycle** and, at each cycle boundary, deposits its
whole‑unit batch into its OWN internal storage (§2). Cycle time and per‑worker
output are per building; staffing scales output linearly.

- **Lumberjack**: 8 wood per **4 s** at 2 workers → 4 wood/worker/cycle; 1 worker =
  8 wood per 8 s. This is the reference rate. Every extractor follows the same shape
  (its own cycle length, batch = ratePerWorker × workers × cycleSeconds).
- Applies to **all** producers (extractors and processors); processors also consume
  their inputs at the cycle boundary (integer in/out, fractional carry preserved).
- Config: `CONFIG.econ.productionIntervalSec` becomes the **cycle length** per
  `kind`; rates in `CONFIG.buildings[*].output.ratePerWorker` retuned so the batch
  matches the cycle. Keep a fractional carry so throughput stays smooth.

## 2. Per‑building internal storage + REAL internal porters (no waste)

Buildings hold their own goods; a fleet of **internal porters** physically shuttles
items around the city (like traders, but inside one city). They are NOT a visual —
they are the actual movers, and consumption/production read/write **building‑local**
storage, not the warehouse directly.

- **Producers** bank output into their own `b.store[goodId]` up to a per‑building cap
  (`CONFIG.buildings[*].storeCap`, e.g. 30). **Store full ⇒ the building stalls** (it
  never produces what it can't hold). Processors draw inputs from their own input
  buffer (also `b.store`), refilled by porters.
- **Houses** have an input buffer too (their needed basics/luxuries); they consume
  from it only when **all** required goods are present (§6).
- **Internal porters** (real haulers, carry ≤ 10/trip, a small fleet per city):
  - **COLLECT**: go to a producing building, pick up its `b.store` output, carry it
    back to the **city warehouse** (only what the warehouse can still hold).
  - **DISTRIBUTE**: take goods from the warehouse and carry them to the buildings that
    need them — houses (potato + wood), processors (wood → sawmill, wheat → mill),
    and construction sites (materials).
  - Assignment follows the import priority (§4): fill house basics first, etc.
- **Warehouse cap** `CONFIG.town.storageCap` = 80: the city **never holds more than
  80** of a good and **never wastes** a produced unit — surplus waits in `b.store`; if
  `b.store` is full the producer stalls. A test MUST assert warehouse stock never
  exceeds 80 (if it ever does, that's a bug to fix).
- The building panel + map show each building's `b.store` fill (the screenshots' `x/cap`).

## 3. Bulletin‑board trade (cities PUSH offers)

Replace the buyer‑pull model with a **news board**:

- Each city, each few seconds, POSTS an offer per surplus good to a global board
  (`state.market.board`): `{ sellerId, q, r, goodId, qty, price }`. `qty` = sellable
  surplus (§5 hold‑backs); `price` = the seller's current local price.
- Each city's trader periodically SCANS the board and scores each offer by: how badly
  the buyer needs the good (priority §4 + shortfall), route distance (cost), unit
  price, and quantity. It buys the best‑scoring offer it can afford/reach.
  - A **starving** city (basic need unmet) weights *need* far above price/distance —
    it will pay a higher price from a **closer** seller rather than starve.
- **Prices auto‑adjust from sales pressure**: a seller whose offers keep getting
  bought **raises** its price; a seller whose offers go unsold **lowers** its price.
  Net effect over time: near, in‑demand cities charge more; far cities that sell less
  drop prices → an equilibrium set by **distance × production speed**. Keep the
  existing supply/price model (`Sim.priceFor` from stock/demand) as the base and layer
  the sales‑pressure adjustment on top (bounded, smoothed, deterministic).
- Board is shared state, read by everyone; treat entries as data.

## 4. Layered IMPORT priority (what a city buys/produces, in order)

A city fills needs in priority order, each only to a **threshold %** of its target
before moving to the next, then loops back to raise earlier tiers to a higher %
(so we never top a warehouse of one good while starving another). Thresholds are
tunable (`CONFIG.town.priorityFill`, e.g. first pass 30%, second 60%, then 100%).

1. **House BASIC needs** (first — this is what yields workers). A house consumes basics
   only when **ALL** its basics are present (≥1 of *each*, e.g. ≥1 potato AND ≥1 wood).
2. **Internal production inputs** — goods needed to run the buildings that feed housing:
   own city's houses first, then overall T1→T2→T3 housing needs.
3. **Luxury needs** — own houses first, then others.
4. **Materials** — e.g. stone for stone tools, and building/upgrade materials.

Priorities **shift with current need** (a starving basic jumps the queue). **Placed
buildings under construction are auto‑set to priority** (materials arrive there before
food); the player may untick, after which they follow the normal order.

## 5. Selling hold‑backs (seller side)

- A city keeps a hold‑back of each good it consumes and offers the rest. Express the
  hold‑back in **cycle** terms, not ticks (roughly: a few cycles of its own
  consumption, floor a small absolute amount). Goods it doesn't consume → all surplus.
- Storage cap 80 (§2) is the hard ceiling.

## 6. House consumption gating + population

- Consume basics only when **all basics present**; otherwise the house waits (no
  partial consumption).
- Population/duty cycle (already in): an empty/starved house keeps a minimal core crew
  — present 1 of every 4 cycles at 0 happiness — so a starved city bootstraps.

## 7. House UPGRADES (peasant hut; ladder + effects)

Gold charged at purchase; **materials brought from the city** (delivered from stock;
the city buys them via the board if short). Effects:

- **L2, L3**: each **+1 housing slot**.
- **L4**: **−30% basic** resource consumption.
- **L5**: **−30% luxury** resource consumption.
- Costs escalate with higher‑tier resources:
  - **L1 (build)**: 10 wood + 300 gold.
  - **L2**: 30 wood + 10 planks.
  - **L3**: 30 stone + 20 planks + 5 stone tools.
  - **L4**: 30 bricks + 20 stone + 10 stone tools.
  - **L5**: 60 bricks + 30 iron + 10 iron tools.

Materials (building materials, e.g. wood/coal) are used both for construction/upgrades
and as house needs.

## 8. Tariff / tax (castle money only — never resources)

- Castle takes a **30% tax** on every inter‑city trade's value. **No resources ever
  move to the castle automatically** (research must not auto‑gift materials to the
  castle either — the castle only acquires goods by explicitly buying them with its
  own traders).
- Money flow: City1 buys 30 wood from City2 for 100 → **castle +30 (tax)**, **City2
  +100** (the tax is minted to the treasury, not deducted from the seller). This is
  the intended money‑supply source for the game. (`CONFIG.trade.tariffRate` = 0.30.)

---

## Phase plan & ownership

- **P1 — foundation (lead, pure‑core):** cycles (§1), per‑building storage + no‑waste
  hauler (§2), house consumption gating (§6), house upgrade ladder (§7), tariff 30% +
  no‑auto‑resource (§8). Rebaseline tests.
- **P2 — bulletin‑board trade (lead, trade.js):** §3 offers/board, scan/score, price
  auto‑adjust. New/rewritten trade tests.
- **P3 — layered import priority (lead, sim/trade):** §4 priority demand + fill %.
- **UI (agent, town‑ui.js):** building panel shows internal storage + upgrade ladder
  L1‑5 + priority indicator; **Renderer (agent, renderer.js):** on‑map building store
  bar. Built against the interfaces below once P1 lands.
- **Tests (author alongside each phase):** determinism, no‑waste (≤80), cycle rates,
  gating, upgrade costs, tariff, board scoring, priority order.

### Interface contracts (stable names the UI/tests bind to)
- `Buildings.buildTime(b)`, `Buildings.constructionProgress(b)` — exist.
- `Buildings.buildingStore(b)` → `{ [good]: qty }`; `Buildings.storeCap(b, good)`.
- `Sim.buildingProgress(state, town, b)` — exists (production % for bars).
- `Buildings.upgradeLadder(typeId)` / `upgradeAt` / `nextUpgrade` — exist; ladder data
  updated per §7.
- Trade board: `state.market.board` (array of offer objects, §3).
- Priority: `town.demand` remains the per‑good want; priority ordering computed in Sim.

> Open decision (§8): tax is minted to the treasury (money printing). If inflation
> shows in playtest, switch to deducting the tax from the seller's proceeds.

## 9. Castle provisioner (must be BUILT)

- The castle no longer has a free built‑in provisioner. A **Provisioner building must
  be placed next to the castle** for the basic line (2 potato → 1 provision) to run —
  same as the Advanced Provisioner is placed for its line.
- The castle **starts with 15 provisions** in stock regardless; without a built
  Provisioner it does not produce more.

## 10. HUD → reference image (UI phase)

Match the reference screenshot's layout:
- **Top‑left**: gold + the stacked **resources panel**; the two quick icons (research,
  castle) beside the gold (done).
- **Scout/unit roster**: the small unit portraits belong at **top‑center** (the
  reference's character row), NOT top‑left where they currently OVERLAP the resources
  panel. Fix immediately: move `#scoutBar` clear of `#resGrid`.
- **Cities**: the reference shows cities as on‑map labels; our compact top **city
  cards** (number badge, Shift → Give/Take) must be visibly present once a city is
  founded — verify they render and read like the reference.
- **Top‑right**: game clock, speed, version, menu (done).
- **Bottom‑center**: build categories; **bottom‑right**: Event Log.

## 11. Destruction / connectivity

- **Destroy works on cities too** (the Destroy‑building tool can target a city center,
  like Erase). Confirmation required.
- **Destroying a city destroys all its buildings.** The player **recovers the gold**
  spent (city + buildings) but **NOT the resources** consumed.
- **Cascade by connectivity**: destroying a building (or city) that leaves other
  buildings **disconnected from their city** destroys those orphaned buildings too
  (they can't function without a link to the city). Compute connectivity (road/adjacency
  to the city footprint) after a removal; anything cut off is removed, gold refunded,
  resources not.
