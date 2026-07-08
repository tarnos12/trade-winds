# TASKS — Board (owned by Session #1 / Manager)

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
