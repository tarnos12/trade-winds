# TASKS — Board (owned by Session #1 / Manager)

Manager's board for the **in-session agent team** ([PARALLEL_SESSIONS.md](PARALLEL_SESSIONS.md)).
Scope: [GDD.md](GDD.md). The manager works on `main`, splits each phase into
non-overlapping slices, spawns one **worktree-isolated subagent** per slice, and
integrates into `main` in the merge order below. "#2/#3/#4" are task slots.

## Done

- **Phase 1 — The Board ✅** — `CONFIG`, `HexMath`, seeded `MapGen`, fog,
  offscreen terrain pre-render, camera, build mode (roads/town/erase), two-clock
  loop. Test: `board` 25/25.
- **Phase 2 — Towns & Production ✅** — goods/buildings catalog + `Sim.priceFor`
  price model, `Sim.tick` (production→consumption→happiness→population) wired to
  the 500ms accumulator, town entities + 4-tab DOM town panel. Tests: `prices`
  51, `sim` 27.

## Milestone: Phase 3 — Trade ✅ DONE

All slices merged (T7 → T8 → T9). `Pathing` (Dijkstra road graph), `Trade.tick`
(autonomous carts, transactions, 25% tariff → `state.treasury`), and cart
rendering + treasury HUD + castle warehouse are live. Towns start at level 2 so
they trade on placement. Verified end-to-end (headless): 3 specialized towns +
road → carts trade, treasury grows, goods flow; cutting a road nulls the route.
Tests: `pathing` 24 · `trade` 28 (+ board 25, prices 51, sim 27). DoD met.
**Next: Phase 4 — Progression** (research, tiers, King's quests, castle levels,
events, Kingdom screen). Note: town leveling/upgrade is a Phase 4 deliverable
(currently towns auto-start at level 2 as a bridge).

## Milestone (done): Phase 3 — Trade ⭐ (was the riskiest phase)

Goal (GDD §6, §10): carts travel roads on their own and equalize markets; the
player earns a tariff on every inter-town transaction.
**DoD:** 3 specialized towns reach a stable trade equilibrium unattended; cutting
a road causes a visible price crisis.
**Risk:** price oscillation / carts stuck in loops → mitigate with the existing
price smoothing, a profit threshold, top-3 route randomness, and a cart cap.

### Shared data contract (every subagent holds these)

Builds on the Phase 1/2 `index.html`. Add to the existing `state` object and
`CONFIG` non-destructively; fence new logic in marked blocks.

- **`state.carts = []`** — new top-level array of live carts. Add to state init,
  the save serializer (~line 1062), and load.
- **`state.treasury = 0`** — player tariff income (gold). Distinct from a town's
  own `town.gold`. Shown in the HUD by T9.
- **Town↔road connection:** a town at `(q,r)` is on the network if its hex or a
  `HexMath.neighbors` hex is in `state.roads`. Carts path between town hexes over
  the road graph.
- **`Pathing`** (T7, pure, fenced module):
  - `Pathing.route(state, fromKey, toKey)` → `{ path:[hexKey...], cost }` or
    `null` if unreachable. `path` includes both endpoints; `cost` = Σ step costs
    (uniform 1/step for dirt roads — roads are a plain `Set`, no level yet).
  - Nodes = road hex keys + the two town access hexes; edges connect adjacent
    (`HexMath.neighbors`) nodes. **Dijkstra.**
  - **Route cache** invalidated on any road change: expose `Pathing.invalidate()`
    and call it at every `state.roads.add(...)` / `state.roads.delete(...)` site.
- **`Cart` shape** (created by T8, drawn by T9):
  `{ id, fromId, toId, goodId, qty, unitBuy, path:[keys], progress (0..1 along
  path length), phase:'outbound'|'return', done:false }`.
- **`CONFIG.trade`** (non-destructive merge): `{ tariffRate:0.25,
  profitThreshold, distanceCostPerStep, cartCapacity, cartSpeed, maxCartsPerTown
  (1–3 by town level), topRandom:3 }`.
- **Determinism:** cart route randomness MUST use a **seeded RNG** (reuse
  `MapGen`'s mulberry32 with a stream stored in `state`), never `Math.random` —
  the sim/trade step stays deterministic and testable.
- **Trade step** runs as `Trade.tick(state)` (pure) called from the 500ms
  accumulator **right after `Sim.tick(state)`**.

### Board

| Task | Slot | Depends on | Status |
|---|---|---|---|
| T7 — `Pathing`: road graph + Dijkstra + route cache | #2 | contract only | ✅ merged |
| T8 — `Trade`: cart dispatch + transactions + tariff→treasury | #3 | Pathing (T7) + price model | ✅ merged |
| T9 — cart entities render/animation + treasury HUD + castle warehouse | #4 | Cart shape (T8) + Pathing | ✅ merged |

Legend: 🔲 assigned · 🟡 in progress · 🔵 returned · ✅ merged.
**Merge order: T7 → T8 → T9.** T7 lands first (foundation); then T8/T9 in parallel.

### Task specs

**T7 (#2) — Pathing.** Pure `Pathing` module (fenced, in the PURE_CORE region so
the headless harness can eval it). Build the road-node graph from `state.roads` +
town access hexes; `Pathing.route(state, fromKey, toKey)` via Dijkstra returning
`{path, cost}` or `null`; a route cache invalidated by `Pathing.invalidate()`,
which must be called wherever roads are added/deleted. **DoD:** `test/pathing.test.js`
— straight road returns the expected path/cost; no-road-between returns `null`;
cache returns same result then reflects an invalidation after a road change.

**T8 (#3) — Trade.** Pure `Trade.tick(state)` called after `Sim.tick`. For each
town with level ≥2 holding an idle cart (≤ `maxCartsPerTown`): gather offers over
reachable towns (`Pathing.route`), `profit = (priceDest − priceHome)*load −
distanceCostPerStep*cost`; pick the best profit above `profitThreshold` with
seeded top-3 randomness; create a `Cart`, deduct goods/gold at home. Advance each
cart's `progress` by `cartSpeed`/tick; on arrival execute the transaction (dest
pays gold + gains stock), add **25%** tariff to `state.treasury`, then return or
retire. **DoD:** `test/trade.test.js` — 3 complementary towns + roads: goods flow
and prices converge over N ticks; treasury grows; **remove a road ⇒
`Pathing.route` null and prices diverge** (the crisis). Deterministic (seeded RNG).

**T9 (#4) — Carts & castle.** `drawCarts()` added to `frame()` after
`drawTowns()`: draw each cart interpolated along `path` by `progress` (dots when
zoomed out). HUD shows `state.treasury` (+ tariff rate). Castle warehouse UI at
center `(0,0)`: manual buy-low/sell-high against the local market (capacity-
limited), the player's only direct market touch. **DoD:** open `index.html`, build
roads between towns, watch carts move and treasury tick up; open the castle panel
and buy/sell. No console errors (headless smoke).

## Lessons applied
- Slices split by concern (graph / trade logic / visuals+UI) with an explicit
  contract; each subagent builds **only its slice** in an isolated worktree; the
  manager integrates serially in merge order.
