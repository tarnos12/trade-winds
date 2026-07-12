# Batch 2 — Playtest-feedback features + bugs (team brief)

Read this first. Trade Winds is a modular single-file game: edit `src/*.js`, the Lead runs
`node tools/build.js` to reassemble `index.html`. You have no chat history — this doc + the
code are your context. **The Lead is the sole builder/committer/measurer.** Edit ONLY your
files; do NOT run `tools/build.js`; do NOT commit. Leave changes in the working tree and
report what you changed. Keep the pure core deterministic (seeded RNG only; no Math.random /
Date in sim/trade/pathing/mapgen/buildings/research/progress).

Timestep fact for the per-second work: **2 ticks = 1 game-second** (use the existing
`TICKS_PER_SEC` constant; a value shown as `X/tick` becomes `X * TICKS_PER_SEC` per second).

Feature A (trade works off-road; roads = 2× speed) is ALREADY DONE by the Lead in
`pathing.js`/`trade.js` — do not redo it; QA owns updating `trade.test.js` to the new intent.

## Ownership (module = owner; NEVER edit another owner's file)

### CoreDev (Opus) — pure-core economy/logic. Files: `src/buildings.js`, `src/sim.js`, `src/mapgen.js` (+ read-only `trade.js`)
- **E/G + D-root — WOOD/CONSTRUCTION DELIVERY BUG (highest priority).** Symptom: a build/upgrade
  starves for wood ("full of planks, sheep farm builds slowly for lack of wood") even though
  another city has 80 wood — so wood is being consumed/misrouted. AND building **upgrades appear
  to do nothing** (`Buildings.startUpgrade` sets `b.pendingUpgrade` which then waits on material
  delivery — if delivery starves, the upgrade silently stalls). Investigate the construction/upgrade
  material-delivery pipeline (`Buildings.constructionNeed`, delivery budget, how a town sources
  construction wood vs consuming it for production/needs, and whether trade restocks construction
  materials). Find the real cause and fix it so builds/upgrades actually get their wood. Report the
  root cause with file:line before/after.
- **B — resources spawn nearer spawn.** Peasant-tier resources (esp. **stone**, also the early
  wood/food/clay the first buildings need) should generate closer to the castle/spawn. In
  `mapgen.js` (distance-ringed deposits) pull the peasant/early-tier deposits inward. Keep
  determinism (same seed → same map) and keep T2/T3 further out.
- Convert any `/tick` display VALUES in your files (`goods.js` is Balance's old file — it's yours to
  read; if a per-tick string lives in sim/buildings, convert it) to per-second — coordinate the
  helper with UIDev if one is added.

### RenderDev (Sonnet) — canvas rendering. Files: `src/renderer.js`, `src/carts-castle-ui.js` (cart-drawing only), `src/internal-traders.js`
> `index.html` is UIDev-only to avoid two-writer conflicts. For the tooltip (C), you write the
> renderer/JS logic; REQUEST the tooltip's DOM element + CSS from UIDev (agree an element id like
> `#tileTip`) and drive it from your hover code.
- **H — smooth cart movement.** Carts currently "jump" tile-to-tile. Interpolate cart position
  smoothly along the path using the render-clock `dt` (see `cartPixel`/`drawCarts` in
  `carts-castle-ui.js`) so they glide between hexes instead of snapping. Render-only; do not change
  the sim tick or cart `progress` semantics used by trade logic.
- **I — internal traders: distinct color + carried-item icons.** Give internal (within-city)
  traders a clearly different color from external traders, and draw the icon(s) of the goods they
  carry on/above the token. (`internal-traders.js` + the cart token draw.)
- **C — tile hover tooltip.** On hover over a hex, show a small tooltip with the tile's **name**
  (terrain) and **what can be built on it** (buildings whose terrain requirement matches — reuse the
  build-bar's terrain-eligibility logic). Drive it from the existing hover-hex detection in
  `renderer.js`; REQUEST the tooltip DOM element + CSS from UIDev (it owns `index.html`).
- Convert any `/tick` display in `carts-castle-ui.js` to per-second.

### UIDev (Sonnet) — DOM panels/controls. Files: `src/town-ui.js`, `src/input.js`, `src/kingdom-events-ui.js`, `src/techtree-ui.js`, `src/progress-ui.js`, `src/kingdom-market.js`, `src/ledger.js`, `index.html` (hotbar HTML)
- **D — building upgrade button (coordinate with CoreDev).** Verify the UI path (`town-ui.js` handler
  `[data-upgrade]` → `Buildings.startUpgrade`). If the click IS firing and the stall is material
  delivery, that's CoreDev's fix — your job is to make the UI show upgrade PROGRESS (e.g. a
  "waiting on wood" state / delivery bar) so it never looks dead. If the handler itself is broken
  (disabled state, wrong town/building ref), fix it. Diagnose which and coordinate with CoreDev.
- **J — destroy road / destroy building.** The bottom "Building" hotbar should offer **Destroy road**
  and **Destroy building**. Destroying a road needs NO confirmation; destroying a building needs a
  confirmation (use the existing `uiConfirm` modal, not native confirm). Wire the modes in the
  build-bar/`input.js` + `index.html` hotbar; the removal must free the slot and refund nothing
  (or match existing erase behavior). Roads already have an erase mode — extend/expose it in the bar.
- **F — per-tick → per-second EVERYWHERE (your files + the shared helper).** Add a small shared
  display helper (e.g. `perSec(x) = x * TICKS_PER_SEC`) and convert every user-facing rate shown
  "per tick" to per second across the UI panels you own. Other devs convert their own files.

### QA (Opus) — verify + tests. Files: `tools/*.js`, `test/*.test.js`
- Rewrite `test/trade.test.js` to the NEW off-road intent: trade DOES happen without roads (carts
  created, treasury income flows), but **roads stay advantageous** (road-connected converges
  faster / a road-connected trader out-delivers an off-road one over the same window). Keep the
  determinism and price-convergence checks, just re-baselined.
- After the Lead integrates each slice: run all pure-core suites + the playthrough + headless boot;
  verify each feature; flag regressions. Confirm the wood-bug fix with a measured scenario.

## Notes
- Feature A speed model: `route()` returns `{path, cost, road}`; `road:false` = off-road; a cart
  stores `cart.road` and travels at `offRoadSpeedMult` (0.5) when `road===false`.
- Anything touching a shared display helper: define it ONCE (UIDev), others import/use it.
