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

## Milestone: Phase 4 — Progression (GDD §7)

Give the game goals + a difficulty arc. Three parallel slices, each fenced; the
manager integrates P4-A → P4-B → P4-C.

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
