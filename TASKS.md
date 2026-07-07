# TASKS — Board (owned by Session #1 / Manager)

Manager's board for the **in-session agent team** ([PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md)).
Scope: [GDD.md](GDD.md). Manager works on `main`, splits each milestone into
non-overlapping slices, spawns one **worktree-isolated subagent** per slice, and
integrates in the merge order below.

## Done

- **Phase 1 — The Board ✅** — hex map, seeded MapGen, fog, camera, build mode
  (road/town/erase), two-clock loop. `board` 25.
- **Phase 2 — Towns & Production ✅** — goods/buildings catalog, `Sim.priceFor`,
  `Sim.tick` (production→consumption→happiness→pop), town panel. `prices` 51,
  `sim` 27. *(Buildings were auto-seeded — replaced by Town Interiors below.)*
- **Phase 3 — Trade ✅** — `Pathing` (Dijkstra), `Trade.tick` (autonomous carts,
  25% tariff → treasury), cart render + treasury HUD + castle warehouse.
  `pathing` 24, `trade` 28. Towns start level 2 so they trade.

## Milestone: Town Interiors (player agency — GDD §4.1–4.3, §5.2)

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
| TI-B — `Sim.tick`: pop-from-housing + worker assignment + production from placed buildings | #3 | TI-A catalog + `Buildings` | 🔲 assigned |
| TI-C — build-mode UI + build menu + remove auto-seed + render buildings | #4 | TI-A `canPlace` + catalog | 🔲 assigned |

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

## Next after Town Interiors
Phase 4 — Progression (research tree, population tiers → tier-3 goods, King's
requests + prestige + castle levels, random events, Kingdom screen, alerts). Note:
proper tariff-funded **town leveling** lands here (towns currently auto-start L2).
