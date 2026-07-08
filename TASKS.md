# TASKS — Board (owned by Session #1 / Manager)

## Milestone: Research tree overhaul (LTT-style) — IN PROGRESS (RT-A running)
Author design (5 reference screenshots, 2026-07-08): **full-screen tech tree**,
bands stacked bottom-up by worker tier — **Peasant → Worker → Citizen** (the
`burgher` internal key DISPLAYS as "Citizen" everywhere from now on). Each
building = a node with an unlock shield + one **pip per upgrade level**
(II/III/IV…); prerequisite lines within + across bands; kingdom-wide upgrades in
a side column per band; drag-to-pan, R = reset, Esc = close; hover tooltips show
name, effects/unlocks, progress %, state, and estimated cost (gold + per-material
breakdown). Researching is ALSO how houses unlock. Build bar keeps hiding
buildings until researched (already true).
- **RT-A (data/logic, workflow: plan→implement→2 adversarial reviews):**
  per-building unlock nodes, per-LEVEL upgrade nodes wired to CONFIG.upgrades,
  band/kind/pos metadata, materials for every node, save migration
  (old dev-branch ids → per-level sets), engine API unchanged. 🟡 running
- **RT-A2 (engine follow-up, after RT-A merges):** **Research Queue** (author,
  from LTT's left-hand parchment panel) — `state.research.queue` (ordered ids);
  when the active node completes, auto-start the next queued node whose prereqs
  are met (skip-with-keep or drop unaffordable-yet entries — decide simplest);
  `Research.enqueue/dequeue/queued`; normalize + persist. 🔲 queued
- **RT-B (UI, workflow):** the full-screen tree overlay itself + the **queue
  panel** on its left (ordered list, click-to-enqueue from the tree, ✕ remove,
  active node shows progress at the top). Queue entries render as icons and
  share the SAME hover tooltip as tree nodes (name, effect text, progress %,
  status In Progress/queued, estimated cost with per-material gold breakdown).
  🔲 queued
- **Citizen display rename:** all player-facing "Burgher" → "Citizen". 🔲 with RT-B

**Author decisions (2026-07-08 Q&A):** (1) Tree ships with EXISTING content —
citizen-band content chains are the immediate next milestone after. (2) Castle
traders buy materials **autonomously for the ACTIVE research** — no panel-open
requirement (supersedes the earlier castle-selected rule; the game is a
simulation, player makes minimal decisions). (3) The full-screen tree fully
REPLACES the old column research panel (🔬 opens the tree).

## Milestone: Kingdom resource overview (LTT-style sidebar) — 🟡 IN PROGRESS (KR workflow, worktree)
Author design (screenshot 2026-07-08, main game screen): a **top-left resource
grid** — one chip per UNLOCKED resource (i.e. producible with currently-researched
buildings), each showing the **total across all cities** + **average price**, with
rise/fall trend arrows. **Click a resource** → left detail panel: storage vs
capacity bars (per-tier/warehouse), **net production rate**, producer/consumer
stats, and a **mean market price line chart** (~5 min rolling window; needs a
small ring-buffer price history sampled per econ tick — keep it render-side/
non-Sim or explicitly bounded). Slices when started: KR-A price/production
history + aggregation (pure, tested) → KR-B sidebar UI + chart (canvas 2D DOM
panel). Sequence AFTER RT-B so unlock-awareness reads the new research model.

## Milestone: LTT panel parity + trade fleets (PP) — QUEUED (after RT-B + KR land; author: "I want it all implemented")
Author design (12 screenshots, 2026-07-08). **Author Q&A:** Provisioner/scouting
section SKIPPED until a knights/combat milestone exists. Cities trade FULLY
AUTOMATICALLY (buy by needs, sell surplus — keep current model; NO player
thresholds on cities). The CASTLE is the player-controlled hub: per-resource
**toggle + stock limit** — castle buys enabled goods up to the limit and
automatically sells from its warehouse when a city requests that good.

**PP-A — mechanics (pure core, workflow w/ adversarial reviews). Nothing UI.**
1. **Trader fleets scale with city level:** external traders per city = 2×level
   (L1 2 … L4 8); internal transporters = 3+level (L4 7). Transporters multiply
   the construction/upgrade `deliveryRate` (rate is per-transporter). Trade.tick
   dispatches up to the fleet count concurrently (today: 1).
2. **Multi-good cargo:** one trip can carry several goods from the same seller
   (cart capacity 10 total across goods; reservation/agreed-price per good).
3. **Per-tier happiness + income:** each tier's happiness from ITS OWN needs
   satisfaction (70/30 basic/extra as today, per tier); town happiness =
   pop-weighted average (keeps old save semantics roughly); people-tax income
   attributed **per tier** (scaled by that tier's happiness) and **per house**
   (for the house panel display).
4. **Castle market:** `state.castleTrade[goodId] = {enabled, limit}` — castle
   traders keep enabled goods stocked to the limit (priority BELOW active-research
   materials); enabled goods in the castle warehouse are SELLABLE: city external
   traders may buy from the castle like from a city (price basis: avg market/
   basePrice; proceeds → treasury; tariff does not apply to the castle's own sales).
5. **City ledgers:** per-city rolling budget history (~5 min of town.gold, bounded
   like KR's Market buffers) + per-tick income/expense tally: taxes +, sales +,
   purchases −, give/take ±, net. Feeds the budget chart + breakdown rows.
**PP-B — city panel redesign (worktree):** header (level badge + Upgrade arrow,
city gold, slots x/y, happiness % + face, Give/Take 1k buttons); **tab 1
Overview**: tier rows (portrait/glyph, count, % — greyed when tier locked) with
hover tooltip "Homes x/y · Jobs x/y · Happiness % · Income"; green transporter
bar (hover: "N Transporters — distribute resources inside the city. Upgrade the
city to increase their number."); red trader bar (hover: "N Traders — buy
resources from other cities…" + numbered LIVE list: "#k: (42%) Buy 3 🐟 4 🪵 from
<city> for 22🪙" / "Not Trading"); **budget line chart** (5-min, min/max labels);
income/expense breakdown rows + net. **tab 2 Warehouse (read-only)**: per-good
icon, stock + capacity bar, production rate, trade flow, price; sort buttons.
**tab 3 Buildings & workforce**: grouped by tier — houses (occupancy x/y, per-
house occupant pips) and workplaces (slot pips, ⚠ badge on problems: unstaffed /
missing inputs / under construction); click a card → that building's panel.
**PP-C — castle panel redesign (worktree):** **tab 1 Keep**: Research Center
pipeline visual — per-material rows (castleStock, per-tick consumption) → progress
book (n/total + %) → the active research; queue glance. NO Provisioner (deferred).
**tab 2 Warehouse**: fleet utilization bar with hover listing ALL castle traders
("#1: (50%) Buy 1 🔨 from Willowholt for 930🪙" / "Not Trading"); per-good rows:
castle stock, **enable-trading toggle + limit control**, price, flow; Summary
(Sell/Buy/Balance + Total Resource Value).
**PP-D — house building panel (worktree):** for kind:'house' buildings: occupant
slots, **Basic/Luxury needs icons with satisfaction rings**, house income, a
happiness meter with bonus-income zone, resident glyphs, ⭐ (exists), level +
upgrade (exists).
**PP-E — map juice (worktree):** city **speech bubbles** (shortage "We don't have
any 🍞 Bread." / content "All is fine here." / "Peasants are very happy and pay
our city more." — throttled, one at a time per city); **wanted-goods icon row**
above each city (yellow highlight = shortage); cart/boat **owner-name labels +
multi-good cargo chips**; small gold floaters on tax ticks. City cards: show
happiness %.
Order: PP-A (workflow, reviews) → PP-B ∥ PP-C ∥ PP-D ∥ PP-E (worktrees) → merge
B→C→D→E → verify → version bump.

## Milestone: Aristocrats tier — FUTURE (author-deferred)
4th band above Citizen (end-game): Aristocrats **consume only, produce nothing**
(luxury sinks; think LTT's magenta top band: Aristocrats Home + Party Pavilion).
Author: "we can leave aristocrats for the future." Requires: citizen-tier content
chains first (goods for aristocrats to consume), then a 4th houseTier + needs +
research band. Do not start without author steer.

Manager's board for the **in-session agent team** ([PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md)).
Scope: [GDD.md](GDD.md). Manager works on `main`, splits each milestone into
non-overlapping slices, spawns one **worktree-isolated subagent** per slice, and
integrates in the merge order below.

## Milestone: Phase 5 content (design-free) ✅ DONE

Merged P5D-D → P5D-A → P5D-B → P5D-C. Speed/pause controls (⏸/1×/2×/4× + Space/
1/2/4 hotkeys), start/title screen (New Game / Continue, boot gated), onboarding
tutorial coach (state-detected, skippable, persisted), and a research-gated
10–40% tariff slider. Merges reconciled (boot: reflect speed → show title →
tutorial starts on New Game/Continue). Tests: `tariff` 11 (307 total). Full-stack
headless smoke clean (all systems present, tutorial gates correctly).

Author steer applied: kept the title, shipping sandbox v1. **Deferred (needs
author design):** campaign scenarios, combat scope.

## Milestone: Phase 5 groundwork (design-free polish) ✅ DONE

Merged P5-A → P5-B → P5-C. Research effects now change gameplay (output
multipliers, extra carts/capacity, paved-road speed, tariff/housing/slot bonus,
warehouse cap); visual juice (transaction particles, chimney smoke, cart trails,
pop-in — pooled/capped/zoom-culled/reduced-motion-aware); procedural WebAudio SFX
+ mute. Tests: `research_effects` 22 (296 total). Full-stack headless smoke clean.

**Deferred — needs author design input before building** (GDD §10 Phase 5 content
+ §13 open questions): campaign scenarios, start screen, tutorial, title
confirmation, win-condition framing, combat scope, and the `tariff_slider` UI.

## Milestone: Placement v2 (contiguous cities) ✅ DONE

Merged PV2-A → PV2-B. Buildings attach to a city by footprint **adjacency** (not
radius); build menu is a persistent **bottom bar** (auto-joins the adjacent city,
charges that city); **gaps** enforced so different cities and the castle never
touch (`canPlaceTown`). Town panel Buildings tab is read-only. Tests: `buildings`
59. Also: terrain tile icons + starting fog reveal +2.

## Milestone: Trade rework (internal + external traders) ✅ DONE (base model)

Merged TR-A → TR-B. Each city runs one external trader that BUYS its biggest
shortfall from a road-connected surplus city (no level gate — L1 trades; the "no
trading" fix); selling is passive; tariff → treasury. Internal-trader porters
shuttle goods within each city. Verified in-browser (3-city: treasury grows from
tariff credits, traders active). Tests: `trade` 33. Stale L2/Buildings-tab labels
retired. **Still to layer on:** the "Trade correctness + trade UI" milestone below
(reservation/agreed-price/cap-10 + buy/sell arrows + trader progress/hover).

## Milestone: Trade rework (internal + external traders) — done
Author model: each city has **internal traders** (move goods between its own
buildings) and **one external trader** that BUYS shortfalls from other cities
(selling is passive — a city only sells when bought from). External trader
available early (not gated on level 2) so trade is visible; tariff → treasury.
Two independent slices; merge order TR-A → TR-B.

| Task | Slot | Scope | Status |
|---|---|---|---|
| TR-A — external-buyer trade logic (pure `Trade.tick`) | #2 | one external trader per road-connected city (from level 1) buys its biggest shortfall from a reachable surplus city; seller passively sells; tariff (`state.tariffRate`) → treasury; deterministic; update `trade.test.js` | 🔲 |
| TR-B — internal trader visuals | #4 | per-city internal traders (small carts shuttling produced goods between buildings and the city center — read-only over state, module-local like Juice); visually distinguish external-trader carts | 🔲 |

## Economy overhaul — Round 1 (logic) ✅ DONE
EC-A (money model: treasury pays placement, city stock pays resources, city 1000g/
0 pop/wood/7 slots, house cap 2, costs), EC-B (happiness ~50% baseline, pop scales
with happiness, happyMods channel + State.tick), EC-D (trade reservation + carried
gold + agreed price, cap 10). baseWorkers=0. Tests reconciled. 372 total, green.
Verified in-browser (treasury 10k; city 0 pop/1000g/50%; hut → 1 peasant @50%).
**Round 2 (UI): EC-C city cards + EC-E trade UI — in progress.**

## Economy overhaul — shared contract (rounds: logic EC-A/B/D → UI EC-C/E)
- **Money pools:** `state.treasury` = Kingdom gold (start **10000**); pays the GOLD
  cost of ALL placement (city founding **1000**, buildings, roads, bridges).
  `town.gold` = city TRADE budget (start **1000**); only the external trader spends
  it. `town.stock` = city resources; pays the RESOURCE cost of buildings.
- **City start (makeTown, owned by EC-A):** `gold:1000, pop:{0,0,0}, happiness:50,
  stock:{wood: enough for a lumberjack+house}`, buildings [].
- **House cap 2** (basic). **slotCap L1 = 7** buildings (+center = 8).
- **Happiness (owned by EC-B):** `town.happiness` 0–100, **baseline ~50** even with
  no food; met needs raise toward 100, unmet lower. **Population per house =
  round(cap × happiness/100)** (so cap-2 house → 1 worker @50%, 2 @100%). A
  temporary modifier channel `town.happyMods = [{delta, untilTick}]` (or similar)
  that Sim applies + decays; EC-C's give/take pushes entries onto it.
- **Building costs (EC-A):** basic = **wood only** (+ small gold); mid + stone/
  planks. Split at charge time: gold→treasury, resources→`town.stock`.
- **Trade cart capacity 10; reservation + agreed price (EC-D).**

## Milestone: Trade correctness + trade UI — QUEUED (folds into/after Trade rework)

Trade logic refinements (extend `Trade.tick`):
- **Cart capacity 10** per external trade (a trader takes up to 10 items).
- **Reserve/lock at dispatch:** when a city dispatches its trader to buy N of good
  G from seller S, **lock N of G at S** (Sim consumption + other traders see only
  the un-reserved remainder) AND **commit the buyer's gold** — the trader leaves
  carrying `agreedPrice*N` gold deducted from the buyer's city gold at departure.
- **Agreed price at departure:** the purchase is settled at the price agreed when
  the trader LEFT, even if market prices change in transit (the carried gold is
  exactly the agreed amount). On arrival: seller loses the reserved N + gains gold,
  tariff → treasury; on return: buyer gains N in stock.
- Release reservations/gold if a trade is somehow invalidated.

Trade UI:
- **City panel Stock/Prices:** per-good **↑ (wants to buy / shortfall)** and **↓
  (selling / surplus)** arrows, plus a column for **how much** it wants to buy.
- **City Overview:** progress bars for the **external trader** and **internal
  traders** showing utilization (busy vs idle).
- **Hover the external trader** → tooltip of active trades (buying G from City #N)
  / "Idle" when not trading.

## Milestone: Economy rebalance + City cards — QUEUED (after Trade rework)

Author directives (implement as one balance pass + a city-cards UI slice):
1. **Player starts with 10,000 gold** (`state.treasury` = player gold).
2. **Everything you PLACE costs gold from the Kingdom treasury:** founding a city
   (1000 g), every building's gold cost, roads, and bridges all deduct from
   `state.treasury`. (Not from city gold.)
3. **Each city starts:** 1000 gold (its **trade budget** — the external trader buys
   goods with it, NOT construction) · **0 population** · enough **wood** to build a
   lumberjack + a house · **8 build slots** (1 = the city center, so **7 buildable**).
4. **A basic house gives 2 population** at max happiness (basic house cap = 2).
5. **Building construction is split:** the building's **gold** cost → Kingdom
   treasury; its **resource** cost → that **city's own stock** (the city constructs
   with its resources). **Basic buildings = wood only** (resources), then + stone/
   planks, later + bricks (deferred). Roads/bridges cost treasury gold (+ stone
   for bridges per GDD §6.4). Rebalance `CONFIG.buildings`/road costs accordingly.
6. **City cards, top of screen:** one card per city — a colored avatar + name
   "City #1/#2/…". Colors from a **fixed predefined unique palette** (same color
   for City #N every game). Each card has **Give 1000 g** and **Take 1000 g**
   buttons with a **2-minute per-city cooldown** (give needs player gold; take
   needs the city to have ≥1000 g).
7. **City global happiness** (~50% by default) scales the happiness of everything
   in the city. **Baseline 50% (even with no food)** yields ~half of housing
   capacity → a basic house (cap 2) makes **1 worker** at 50%, **2 at 100%**.
   Met needs push happiness up toward 100%; unmet needs push it down.
8. **Give 1000 g → +10% city happiness for 60 s.** **Take 1000 g → −30% city
   happiness** (temporary). Both move 1000 g between player and city.
9. **Top-left: show the kingdom's gold** (player treasury) prominently.

Interpretations (correct if off): player gold = `state.treasury`; slot count =
7 buildings + the center; give/take cooldown is per-city; take's −30% is a
temporary modifier (decays over ~60 s) symmetric with give; "bricks" tier
deferred until a bricks good is added; population per house ≈ `cap × happiness%`.

## Milestone: Categorized build menu — IN PROGRESS
Hide the flat build bar behind **category buttons** (each opens a submenu):
1. **Build** — City (town mode), Road, Bridge (bridge stub until water-roads).
2. **Peasant** (worker tier 1) — peasant house (hut) + `workerTier:'peasant'` buildings.
3. **Worker** (tier 2, **research-gated**) — cottage + `workerTier:'worker'` buildings.
4. **Burgher** (tier 3, **research-gated**) — manor + `workerTier:'burgher'` buildings.
Group by existing `workerTier`/`houseTier`; locked categories show a "research to
unlock" hint. UI-only gate (canPlace logic unchanged; tests bypass the UI).
Deferred content (future chain): potato farm, woodcutter, clothing/chairs/wine goods.

## Milestone: Construction & building logistics ✅ DONE (v0.11.0, CB-A..D)
A cohesive feature set (author requests). Sequence after the categorized build menu.
- **Construction state:** a placed building starts **under construction** — its GOLD
  cost is paid to treasury at placement (as now), but its **resource** cost must be
  **delivered by internal traders** from the city's stock before it's operational.
  Sim skips unbuilt buildings (no staffing/production until done).
- **Internal traders carry real cargo:** deliver construction materials to
  under-construction buildings, and deliver **processor inputs** (e.g. wood → sawmill).
- **Trader cargo display:** every trader (internal + external) shows an **icon +
  number** of what it carries. A **greyed icon + number** = an item *requested*
  (external trader en route to buy it; or a material a build is waiting on).
- **Constructed vs unconstructed visual:** buildings look distinct while building;
  **display the missing resources** for an under-construction building on the map.
- **Per-building click panel:** clicking a building on the map opens a panel with
  THAT building's info (type/tier, workers, output, inputs, construction status +
  missing materials) — building info moves OUT of the city panel.
- **Worker roster in city panel:** an icon per worker type available in the city;
  hover → details (how many of that type exist vs how many are on a job/assigned).
- **Building worker slots:** a placed building has open slots filled from available
  workers by default; **click a slot to close it** (lock icon) so it won't be
  staffed. (Sim respects closed slots.)
- **Building priority star:** a ⭐ toggle per building; prioritized buildings get
  workers assigned **first** and internal traders route to them **first**.
Likely slices: CB-A construction+delivery + worker-assignment logic (Sim:
priority order, closed slots, delivery); CB-B visuals (build-state look,
missing-resource + trader cargo icons + priority routing); CB-C per-building click
panel (info + slot lock/unlock + priority star); CB-D city-panel worker roster.

### Shared data contract (CB-A owns; CB-B/C/D consume — do not redefine)
Each placed building object gains fields (defaults keep old saves working):
- **`built`** (bool) — `false` at placement; flips `true` once all resource cost is
  delivered. A building with **no resource cost** (gold-only starters) is `built:true`
  immediately. Sim skips unbuilt buildings (0 workers, 0 production).
- **`delivered`** (`{goodId:qty}`) — materials delivered so far toward construction.
- **`need()`** — remaining construction materials = `cost(resources) − delivered`
  (derived; not stored). Unbuilt buildings add their remaining `need` to **town demand**
  (so the external trader buys those materials → "city demand derived from its buildings").
- **`closedSlots`** (int, default 0) — player-locked slots; effective slots =
  `workerSlots − closedSlots` (min 0). Sim staffs only effective slots.
- **`priority`** (bool, default false) — ⭐; priority buildings are staffed **first**
  (and CB-B routes internal traders to them first).

**Placement charge change (CB-A):** placement deducts **GOLD → treasury only**;
resource costs are **NOT** deducted upfront — they become the construction `need`,
delivered from `town.stock` over time. `Buildings.canPlace` affordability checks
**gold only** (a city may place a building it can't yet afford in resources; its
traders buy them). Construction delivery is a pure step (`CONFIG.town.deliveryRate`
units/tick from stock → `delivered`, priority buildings first).

### Board
| Task | Slot | Depends on | Status |
|---|---|---|---|
| CB-A — construction + delivery + worker-assignment logic (pure) | #2 | contract | ✅ merged |
| CB-B — visuals: build-state look + missing-resources on map + trader cargo icons + priority routing | #3 | CB-A fields | ✅ merged |
| CB-C — per-building click panel (info + slot lock/unlock + ⭐) | #4 | CB-A fields | ✅ merged |
| CB-D — city-panel worker roster (icons + hover available/assigned) | #2 | CB-A fields | ✅ merged |
**Merge order: CB-A → CB-B → CB-C → CB-D. ✅ DONE (v0.11.0).** All merged clean,
446 tests green, end-to-end headless smoke clean (place → construct → panel →
roster, 0 console errors). Building info moved out of the city panel into the
per-building click panel; construction is delivery-driven; city demand now
derives from unbuilt buildings' material needs.

## Milestone: Balance + castle overhaul ✅ DONE (BAL/CP/CRE merged)
- **BAL — balance + starting buildings:** rebalance costs/rates/prices/research; only
  **hut (house) / lumberjack (woodcutter) / farm / sawmill** available at start; every
  other building gated per-building by a research node (`unlockedBy`); build menu shows
  locked buildings + the required research.
- **CP — castle click panel:** clicking the castle opens a panel (like city panels)
  holding castle info (prestige, castle level+upgrade, warehouse, tariff) — moved OUT
  of the bottom-right HUD; kingdom-gold chip stays top-left. → then:
- **CRE — castle research economy:** research requires RESOURCES; the castle owns **10
  traders** (like city external traders) that buy requested research materials from
  cities using treasury gold; the castle only requests materials **when selected**.
  Builds on CP.

## Milestone: Economy v3 (needs + taxes + caps) ✅ DONE (v0.10.0)
Author directives (supersede parts of the BAL balance pass — apply these specifics):
- **City storage cap:** each city holds **≤ 80 per resource** (warehouse limit).
  *(Assumption: per-good cap 80; confirm if it means 80 total.)*
- **New city spawns with 20 wood** (startStock = {wood:20}).
- **Starter building costs (GOLD only, no resources at lvl 1):** lumberjack **100 g**,
  hut/house **200 g**, farm **250 g**. (Higher levels/tiers add resources later.)
- **New needs / happiness model (peasant):** basic needs = **Wood + Potato** (tier-1
  food) → **70% happiness**; extra needs = **Fish + Wool** → the remaining **30%**
  (→100%). Introduces a new good **potato** + a **potato farm** building (tier-1 food).
  *(This revises EC-B's baseline-50 model: base needs met = 70, extras = +30.)*
- **People-tax income:** a city's population **generates gold over time**, scaled by
  happiness — **above base happiness → more tax gold**. (Funds the city's trade budget.)
- **Trade tariff 25% → castle/treasury** (confirmed): a 10-gold buy → seller city
  +7.5 g, castle +2.5 g.
Sizeable — likely its own multi-slice pass (goods/needs model + potato content;
storage caps + costs; people-tax income). Sequence after the castle/balance round.

## Milestone: Two-part research + per-building upgrades ✅ DONE (v0.13.0, RU-A/RU-B)
Delivered via dynamic Workflows (plan → implement → adversarial review; Opus for
the pure-logic slice, Sonnet for UI, Opus reviewers). RU-A: 'development' research
branch (4 chained unlock nodes + castle materials), CONFIG.upgrades ladders for the
4 starters, Buildings.startUpgrade (gold → treasury; resources delivered via the
shared CB-A delivery step; pending needs feed town demand), upgradeEffect wired
into slots/output/housing + capacity-weighted basic-consumption multiplier.
RU-B: building-panel Upgrades section (pending/available/locked/max states), 🏗
Development research column, map level badge + pending-material chips,
BuildingUI.startUpgrade hook. Tests: buildings 109, sim 88, research 72 (496
total green); driven headless smoke clean. Original spec follows.
- **Part 1 — global research (castle):** unlocks the *possibility* of an upgrade
  (e.g. "Hut Lv2" becomes available). Research only unlocks; it doesn't apply.
- **Part 2 — per-building upgrade:** click a specific building → pick an unlocked
  upgrade → it costs **kingdom gold (treasury)** + **city resources** (delivered by
  internal traders to that building). Applies to THAT building.
- **Upgrade ladders per building**, e.g. Hut Lv2/3/4 — each costs more + eventually
  higher-tier resources; effect: **+1 population per level**, and the **final level
  cuts wood/potato consumption 30%**. (Define ladders per building type.)
- **City resource demand is derived from its own buildings/houses/upgrades' needs**
  (inputs + consumption + pending upgrade materials) — this is what its external
  trader buys. (Formalize demand = sum of building/house/upgrade requirements.)
- Depends on: **CB-C** per-building click panel (where upgrades are shown/bought) +
  **CB-A** internal-trader material delivery (delivers upgrade + input materials).

## Done

- **Phase 1 — The Board ✅** — hex map, seeded MapGen, fog, camera, build mode
  (road/town/erase), two-clock loop. `board` 25.
- **Phase 2 — Towns & Production ✅** — goods/buildings catalog, `Sim.priceFor`,
  `Sim.tick` (production→consumption→happiness→pop), town panel. `prices` 51,
  `sim` 27. *(Buildings were auto-seeded — replaced by Town Interiors below.)*
- **Phase 3 — Trade ✅** — `Pathing` (Dijkstra), `Trade.tick` (autonomous carts,
  25% tariff → treasury), cart render + treasury HUD + castle warehouse.
  `pathing` 24, `trade` 28. Towns start level 2 so they trade.

## Milestone: Town Interiors ✅ DONE (player agency — GDD §4.1–4.3, §5.2)

Merged TI-A → TI-B → TI-C. Player now places buildings (15-type catalog:
extractors on terrain / processors / houses) capped by town level, `Sim` staffs
them from population and grows workers/burghers from housing as needs are met;
auto-seeding removed. Founding kit (wood/stone) lets a new town build. Verified
end-to-end (empty town → farm+hut → workers staffed, food produced, pop 8→18).
Tests: `buildings` 37, `sim` 40 (+ board 25, prices 51, pathing 24, trade 28).

## Milestone (done): Town Interiors (player agency — GDD §4.1–4.3, §5.2)

Fixes the core gap: today buildings **auto-seed** and there's **no housing**, so
the only decisions are placing towns + roads. Replace with real choices — the
player places **buildings on valid terrain** (capped per town level) and **houses
that generate population** as needs are met.

**DoD:** start a town (center only + small base pop) → place a lumberjack on
forest and a farm on fertile → they staff from base peasants and produce → place
houses → population grows toward housing capacity → surplus goods trade as before.
Invalid placements (wrong terrain / out of radius / over slot cap / unaffordable)
are rejected with a reason.

### Shared data contract

- **`CONFIG.buildings[id]`** (redesigned): `{ id, name, kind:'extractor'|'processor'|'house',
  terrain: <terrainKey|null>, adjacent?: <terrainKey>, output?:{goodId,ratePerWorker},
  inputs?:{goodId:qty}, workerSlots?, workerTier?:'peasant'|'worker'|'burgher',
  houseCapacity?, houseTier?:'peasant'|'worker'|'burgher', cost:{goodId:qty,…,gold} }`.
  - **Extractors** need their `terrain` (or `adjacent`): `lumberjack`→forest (wood),
    `farm`→fertile (grain), `miner`→hills (ore), `quarry`→mountains (stone),
    `fishery`→adjacent water (fish), `shepherd`→meadow (wool). Staffed by peasants.
  - **Processors** (`terrain:null`, any town hex): `sawmill` (wood→planks),
    `mill` (grain→flour), `bakery` (flour→bread), `brewery` (grain→beer),
    `smelter` (ore→tools), `weaver` (wool→cloth). Staffed by workers.
  - **Houses** (`terrain:null`): `hut` (peasant cap), `cottage` (worker cap),
    `manor` (burgher cap). Provide `houseCapacity` for their `houseTier`.
- **`CONFIG.town`**: `{ slotCap:[0,3,5,7,9] (by level), radius:2, baseWorkers:{peasants:N},
  startStock:{…small food buffer} }`.
- **`town.buildings`** = `[{ typeId, q, r, workers }]` — **player-placed** (no more
  auto-seed). `town.pop` = `{peasants,workers,burghers}` — generated from housing.
- **`Buildings` pure module** (slice A): `slotCap(level)`, `usedSlots(town)`,
  `canPlace(state, town, typeId, q, r) → {ok:true}|{ok:false, reason}` (checks
  radius ≤ `CONFIG.town.radius`, terrain/adjacent match, hex free of building/
  road/other center, slot cap, affordability), `housingCapacity(town) →
  {peasants,workers,burghers}`.

### Board

| Task | Slot | Depends on | Status |
|---|---|---|---|
| TI-A — building catalog + placement rules + housing model (`Buildings` pure) | #2 | contract only | 🔲 assigned |
| TI-B — `Sim.tick`: pop-from-housing + worker assignment + production from placed buildings | #3 | TI-A catalog + `Buildings` | ✅ merged |
| TI-C — build-mode UI + build menu + remove auto-seed + render buildings | #4 | TI-A `canPlace` + catalog | ✅ merged |

Legend: 🔲 assigned · 🟡 in progress · 🔵 returned · ✅ merged.
**Merge order: TI-A → TI-B → TI-C.** TI-A lands first; then TI-B ∥ TI-C.

### Task specs

**TI-A (#2) — Foundation (pure, fenced in PURE_CORE).** Redesign `CONFIG.buildings`
per the contract (rename to lumberjack/sawmill/etc., add `kind`/`workerTier`/house
fields), add `CONFIG.town`, and a pure `Buildings` module (`slotCap`, `usedSlots`,
`canPlace`, `housingCapacity`). **DoD:** `test/buildings.test.js` — canPlace passes
on valid terrain/in-radius/free/affordable and fails (with reason) on each
violation; slotCap by level = 3/5/7/9; housingCapacity sums houses by tier.

**TI-B (#3) — Sim update (pure).** In `Sim.tick`: assign each tier's population to
buildings accepting that tier (by `workerTier`, capped by `workerSlots`) → set each
building's effective `workers`; produce from placed buildings (extractors + inputs
for processors); grow each tier toward `baseWorkers + Buildings.housingCapacity`
when its needs are met, shrink when not (§4.3). Handle towns with zero buildings.
**DoD:** extend `test/sim.test.js` — a town with a farm + base peasants grows food;
adding a cottage lets workers appear only when food (+beer) is met; no houses ⇒ pop
capped at base; foodless ⇒ decline. Keep `prices`/`trade` tests green.

**TI-C (#4) — Placement UI (DOM+canvas).** Remove `seedBuildings`; `makeTown` starts
with center only, `CONFIG.town.baseWorkers` pop, `CONFIG.town.startStock`. Add a
build flow: the town panel **Buildings** tab lists buildable types (name, cost,
terrain req, slots used/free); selecting one enters placement mode where hexes in
the town's radius highlight valid(green)/invalid(red) via `Buildings.canPlace`,
click places (deduct cost, push building). Render placed buildings on the map with
per-kind icons. **DoD (headless smoke):** found a town, open Buildings tab, place a
lumberjack on a forest hex (accepted) and reject an invalid hex; building renders;
no console errors.

## Milestone: Phase 4 — Progression ✅ DONE (GDD §7)

Merged P4-A → P4-B → P4-C. Research tree (15 nodes, treasury-funded), town
leveling (L1→4, upgrade to L2 to trade), King's quests + prestige, castle levels
1→5 (L5 = victory), Kingdom screen, town alerts, and random events (bumper/craze/
fair/bridge). Accumulator runs Sim→Trade→Research→Quests→Events. Verified full
headless (0 console errors, all panels open, live loop). Tests: `research` 40,
`progress` 29 (+ board 25, prices 51, sim 40, pathing 24, trade 28, buildings 37
= 274 total). **Next: Phase 5 — Content & Polish** (scenarios, tutorial, audio,
juice; GDD §10).

## Milestone (done): Phase 4 — Progression (GDD §7)

### Shared data contract (ownership — avoids collisions on the single file)
- **state keys:** P4-A adds `state.research`; P4-B adds `state.prestige`,
  `state.castleLevel`, `state.quest`; P4-C adds `state.event`. Each slice adds its
  own key(s) to state init + save/load (keep-both at merge).
- **CONFIG:** P4-A `CONFIG.research`; P4-B `CONFIG.quests` + `CONFIG.castle.levels`
  (extends existing `CONFIG.castle`); P4-C `CONFIG.events`.
- **top bar:** P4-A adds a 🔬 Research button; P4-C adds a 📋 Kingdom button; P4-B
  shows prestige in the HUD + extends the existing castle panel with Upgrade.
- **accumulator:** each slice adds ONE pure `*.tick(state)` call after
  `Trade.tick` — P4-A `Research.tick`, P4-B `Quests.tick`, P4-C `Events.tick`.
- Fence every module + UI block with markers.

### Board
| Task | Slot | Depends on | Status |
|---|---|---|---|
| P4-A — Research tree (data + `Research` engine + research panel) | #2 | contract | 🔲 assigned |
| P4-B — town leveling + King's quests + prestige + castle levels (win) | #3 | contract | 🔲 assigned |
| P4-C — Kingdom screen + alerts + random events | #4 | contract | 🔲 assigned |
**Merge order: P4-A → P4-B → P4-C.**

### Specs
**P4-A (#2):** `CONFIG.research` = 3 branches (Production/Logistics/Administration)
× 5 nodes `{id, branch, name, cost(gold), timeTicks, prereqs:[], effect}`. Pure
`Research` module: `state.research={unlocked:[],active,progress}`; `canStart`,
`start` (needs prereqs + funds), `tick` advances `active` spending
`state.treasury` over `timeTicks` then unlocks; `Research.has(state,id)`. Research
panel UI (branches, node states locked/available/active/done, click to start,
progress bar). Persist `state.research`. **DoD** `test/research.test.js`: prereqs
gate, treasury funds it, completing unlocks + `has()` true.

**P4-B (#3):** Town **leveling** — `makeTown` starts `level:1`; town-panel Upgrade
button; `Town.canUpgrade(town)` gated by pop + gold; upgrading raises level (slot
cap, cart cap). (Removes the L2 trade bridge — a town must be upgraded to L2 to
trade.) **King's quests** — `CONFIG.quests` templates + `Quests` module (one active
quest: deliver N of a good to the castle warehouse / keep treasury or happiness ≥
X; reward gold + prestige) + a quest banner. **Prestige + castle** — `state.prestige`,
`CONFIG.castle.levels` (1→5, each `prestigeReq`+`goldReq`), extend the castle panel
with Upgrade; **castle level 5 = victory** notice. **DoD** `test/progress.test.js`:
canUpgrade gating, quest completion pays prestige, castle upgrade consumes prestige,
L5 wins.

**P4-C (#4):** **Kingdom screen** — top-bar 📋 button opens a DOM table of all towns
× metrics (pop by tier, happiness, gold, top surplus/shortage). **Alerts** — canvas
icons over towns (food shortage / no workers / warehouse full) derived from state
each frame. **Random events** — `CONFIG.events` + seeded `Events` module
(`Events.tick`): bumper harvest (+farm output), demand craze (good demand ×3),
fair (tariff-free), collapsed bridge (a road disabled til repaired) — cozy, market
opportunities not punishments (GDD §7.3); show a notification. **DoD** headless: no
console errors; Kingdom screen opens and lists towns; an event fires and expires;
alerts render.
