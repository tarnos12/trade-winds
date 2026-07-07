# GDD — "Trade Winds" (working title)
### A Let Them Trade–inspired game — HTML Canvas + JavaScript, single-file, offline-first

**Version:** 1.0 | **Author:** Mariusz | **Platform:** Browser (desktop-first, mouse + keyboard shortcuts)
**Stack:** Single `index.html`, Canvas 2D, zero external dependencies, saves in `localStorage`

---

## 1. Vision & Pillars

**Elevator pitch:** You build a network of autonomous towns on a hexagonal board. Towns produce, consume, and trade with each other on their own — you design the conditions: where they stand, what they produce, where the roads run. You earn a tariff on every transaction and spend it upgrading the King's castle.

**Design pillars:**

1. **Let them trade — don't micromanage.** The player never clicks "sell 5 wood." The player builds the conditions; the economy plays itself. The core joy is watching a system you designed come alive.
2. **Economy as simulation, not script.** Prices emerge from real supply/demand in each town. No fixed price tables — if a town is drowning in wood, wood gets cheap.
3. **Board-game board.** Tabletop diorama feel: flat "wooden" tokens, warm palette, micro-animations of carts. Readability > realism.
4. **Cozy, not stressful.** No fail state in sandbox. Failure = stagnation, not game over. Pace controlled with a speed slider (pause / 1x / 2x / 4x).
5. **Single-file, offline-first.** Like IdleGrounds and Dao Unbound — one file, open and play. Hostable on your website.

**What we're NOT doing (deliberate scope cuts vs the original):**
- No 3D / tabletop diorama — stylized flat 2D top-down instead
- No combat in v1.0 (bandits/knights = optional Phase 5)
- No map editor (seed-based generation is enough)
- No multiplayer — the game is inherently single-player

---

## 2. Core Loop

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

**5-minute session:** check shortage alerts → place 1–2 buildings → leave the game on 2x.
**45-minute session:** plan a new production-chain branch, found a town, rework the road network.

---

## 3. World & Map

### 3.1 Hexagonal board
- **Axial coordinates (q,r)**, pointy-top hexes, map radius ~14 (≈ 600 hexes)
- Seeded generation: value noise → biomes. Seed visible and enterable (replayability + sharing)
- **Terrain types:** meadow (buildable), forest (wood), hills (stone), mountains (ore), water (fish, blocks roads except bridges), fertile field (farm bonus), wasteland (nothing)

### 3.2 Fog of discovery
- Start: ~7 hexes revealed around the castle
- Each new town reveals radius 3; "Cartography" research reveals more
- Goal: a feeling of expansion without a scout-unit system (scope cut)

### 3.3 The Castle (player hub)
- Sits at map center, levels 1–5
- Acts as the player's warehouse: you can **buy surplus cheap and sell high later** (the only direct market interaction the player has — deliberately limited by warehouse capacity)
- Castle upgrades = the main goal / campaign win condition (level 5 = scenario won)

---

## 4. Towns — Autonomous Agents

Each town is a self-contained agent with its own budget, stockpile, and population.

### 4.1 Town structure
- **Town center** (levels 1–4) — level determines: max number of attached buildings (3/5/7/9 hexes within radius 1–2), max population
- **Houses** — hold population; house type = citizen tier
- **Production buildings** — must sit on a resource hex (sawmill on forest, mine on hills) or be a processor (bakery — any hex in town)

### 4.2 Population tiers (progression modeled on the original)
| Tier | Needs | Can work in |
|---|---|---|
| Peasants | food | farms, sawmills, mines |
| Workers | food + beer | processors (mill, smelter, workshop) |
| Burghers | food + beer + clothes | manufactories (tailor, jeweler), taverns |

Tier upgrade = house upgrade (resource cost + requirement that needs were met for X time). Higher tier → **pays higher local taxes** → the town has budget to buy → more trade → more tariff for you.

### 4.3 Needs simulation (tick every 2s of game time)
- Each resident consumes a fraction of a unit of their goods per tick
- Satisfaction < 50% for a sustained period → population declines (nobody dies dramatically — they "move away")
- Satisfaction at 100% → slow population growth up to house capacity
- **Happiness meter** (0–100): average need satisfaction; affects work efficiency (0.5x–1.2x)

---

## 5. Resources & Production Chains

### 5.1 Goods tree (3 tiers, 14 goods — deliberately compact)

**Tier 1 (raw):** wood, stone, ore, grain, fish, wool
**Tier 2 (processed):** planks (wood), tools (ore+wood), flour (grain), beer (grain+water), cloth (wool)
**Tier 3 (luxury):** bread (flour), clothes (cloth), jewelry (ore, requires jeweler), furniture (planks+tools)

**Food** = a category (fish / bread) — a town consumes whatever is available; bread counts as 2x value.

### 5.2 Buildings (start: 4 unlocked, rest via research)
Each building: build cost (resources + town gold), worker slots (1–3), production rate per worker, optional input goods.

Example building card:
```
SAWMILL  [requires: forest hex]
Cost: 20 wood, 10 stone, 50 gold
Workers: max 3 (peasants)
Output: 1 wood / worker / tick
Upgrade lv2: +50% rate, cost 30 planks + 200 gold
```

### 5.3 Chain design rule
No town should be able to become self-sufficient at town-center level 3+ — the building-slot limit **forces specialization and trade**. This is the heart of the game: the mining town needs bread from the farming town, which needs tools from the mining town.

---

## 6. Market & Trade — Heart of the Simulation

### 6.1 Price model (per town, per good)
Local price computed from stock relative to demand:

```js
// stock = current stockpile, demand = consumption per 60s + production inputs
ratio = stock / (demand * bufferTarget)   // bufferTarget ≈ 2.0
price = clamp(basePrice * (1.6 - 0.8 * ratio), basePrice * 0.4, basePrice * 3.0)
```

- Surplus → price falls to 40% of base; scarcity → rises to 300%
- Prices update every economy tick; smoothed (lerp 10%/tick) so they don't jitter

### 6.2 Trade agents (carts)
- Each town with a level 2+ center maintains 1–3 carts (more via research)
- **Cart algorithm** (decision at departure):
  1. Gather offers: for each reachable town and good, compute `profit = (priceThere - priceHere) * load - distanceCost`
  2. Pick the best route with profit > minimum threshold (with slight top-3 randomness so carts don't all make identical choices)
  3. Buy at home, travel along roads (pathfinding), sell there, optionally take a return load
- Carts move visibly across the map (this is 80% of the game's visual "life")

### 6.3 Tariff — the player's income
- **25% of every inter-town transaction's value** goes to the player's treasury (rate adjustable via a 10–40% slider: higher tariff = fewer profitable routes = less trade — an interesting trade-off)
- Secondary income: manual "tax collection" from a town (one-off budget drain, hurts happiness — an emergency button, deliberately unprofitable long-term)

### 6.4 Roads
- Built hex by hex by the player (cost: stone + gold; bridges over water 5x more)
- Road lv1 (dirt): speed 1x; lv2 (paved): 1.6x
- Road graph kept separate from the grid; pathfinding is **Dijkstra on the road-node graph** (not A* on the whole grid — carts only travel roads, the graph is small)

---

## 7. Progression & Goals

### 7.1 Research tree (funded by player gold)
3 branches × 5 nodes:
- **Production:** new buildings (mill → brewery → tailor → jeweler), rate upgrades
- **Logistics:** +carts, +cart capacity, paved roads, bridges, cartography
- **Administration:** population tiers, castle warehouse capacity, tariff slider, market statistics (unlocks price charts!)

Research costs gold + time (progress bar) — gold comes from tariffs, so **research is coupled to trade volume**, not to raw playtime.

### 7.2 King's requests (quest system)
- Periodically the King demands a delivery to the castle: "300 bread in 10 minutes", "keep 3 towns' happiness > 80% for 5 min"
- Reward: gold + prestige points; prestige is required for the next castle levels
- Written as a data-driven list of templates with difficulty scaling

### 7.3 Random events (light, cozy)
- Bumper harvest (+50% farms for 2 min), jewelry fashion craze (demand x3), collapsed bridge (repair it), fair (tariff-free trading but +traffic)
- Events = market opportunities, not punishments. Zero destruction of the player's progress in v1.0.

### 7.4 Win condition
- **Campaign:** 6 scenarios (seed + goals + constraints), finale = castle lv5
- **Sandbox:** no goals, any seed

---

## 8. UI / UX

- **Main view:** fullscreen canvas, camera pan (drag/WASD) + zoom (scroll, 3 detail levels — zoomed out, carts become dots and towns become icon tokens)
- **Town panel** (click a town center): tabs Overview / Stock+Prices / Buildings / Population
- **Top bar:** player gold, prestige, game speed, research button, castle button
- **Alerts:** subtle icons above towns (food shortage 🍞!, no workers, warehouse full) — a direct answer to the original's main criticism (poor kingdom-state readability)
- **"Kingdom" screen:** a table of all towns × key metrics in one place (what the original lacked — our free advantage)
- Tooltips everywhere; prices always shown with a trend arrow (▲▼)

**Aesthetic:** flat 2D, warm palette (paper/wood/sepia), hexes with subtle outlines, pixel font or a "storybook" serif. Assets: simple code-drawn shapes + optionally CC tilesets (you already have the DawnLike/LPC workflow).

---

## 9. Technical Architecture

### 9.1 Structure (single-file, pattern from Dao Unbound)
```
index.html
├─ <style>            // UI panels in DOM (HTML layered over canvas), not drawn in canvas
├─ <canvas>           // game world only
└─ <script>
   ├─ CONFIG          // all balance constants in one object (easy tuning)
   ├─ HexMath         // axial coords, hexToPixel, pixelToHex, neighbors, dist
   ├─ MapGen          // seeded RNG (mulberry32), noise, biomes
   ├─ Sim             // economy tick: production → consumption → prices → cart decisions
   ├─ Pathing         // road graph + Dijkstra, route cache (invalidated on road changes)
   ├─ Entities        // towns[], buildings[], roads(Set), carts[]
   ├─ Renderer        // layers: terrain (pre-rendered to offscreen canvas!) → roads → buildings → carts → overlay
   ├─ UI              // DOM panels, event handling, build mode
   ├─ Quests / Events // data-driven
   └─ Save            // state serialization to localStorage + JSON export/import (string)
```

### 9.2 Game loop — two clocks
```js
// Render: requestAnimationFrame — cart position interpolation, animations
// Economy: fixed timestep 500ms * gameSpeed — deterministic simulation
//   time accumulator, classic "fix your timestep" pattern
```
The separation is key: the simulation must be deterministic and cheap, so it can run cleanly at 4x speed and pause when the tab is hidden. (Whether returning to the tab should simulate any "catch-up" time is an open design question — see section 13. The reference game has no offline progression, so the default here is: game pauses when not visible.)

### 9.3 Performance (budgets)
- Terrain pre-rendered to an offscreen canvas, redone only when fog is revealed — drawing the map = 1 drawImage
- Target: 60 FPS at 15 towns / 40 carts / 600 hexes — trivial for Canvas 2D at this scale
- Economy tick < 5ms (it's all arithmetic on small arrays)
- Cart route cache: recompute only when a road is built/demolished

### 9.4 Saving
- Autosave every 30s + on close (`visibilitychange`)
- Versioned save format (`saveVersion`) + migrations — lesson learned from the Dao Unbound iterations

---

## 10. Production Plan — 5 Phases

### PHASE 1 — The Board (foundation)
**Goal: a clickable hex world with a camera.**
- HexMath + seeded map generation + biomes + fog
- Camera pan/zoom, terrain pre-render
- Build mode: placing roads and "empty" town markers
- **Definition of done:** I can generate a map from a seed, move the camera, place roads, 60 FPS

### PHASE 2 — Towns & Production (the game comes alive)
**Goal: towns produce and consume, population reacts.**
- Town center + houses + 6 tier 1–2 buildings, town panel
- Economy tick: production, consumption, happiness, population growth
- Local price model (no trade yet — prices simply visible)
- **DoD:** a single town can grow and starve; prices react to stockpiles

### PHASE 3 — Trade (heart of the game) ⭐ riskiest phase
**Goal: carts travel on their own and equalize markets; the player earns tariffs.**
- Road graph + Dijkstra, cart agents with the route-selection algorithm
- Transactions, tariff, player treasury, cart animation
- Castle warehouse (manual buy-low-sell-high)
- **DoD:** 3 specialized towns reach a stable trade equilibrium without intervention; cutting a road causes a visible price crisis
- **Risk:** price oscillations / carts stuck in loops. Mitigation: price smoothing, profit threshold, top-3 randomness, a full week of balance-only playtesting via "autoplay overnight"

### PHASE 4 — Progression (the game has a goal)
**Goal: research tree, population tiers, King's quests, the castle.**
- Research (15 nodes), worker/burgher houses, tier 3 goods
- King's requests + prestige + castle levels, random events
- "Kingdom" screen, alerts
- **DoD:** a full sandbox run from zero to castle lv5 in ~4–6h is playable with a real difficulty arc

### PHASE 5 — Content & Polish (release)
**Goal: the version that goes on your website.**
- 6 campaign scenarios, start screen, tutorial (the first King's requests double as an in-fiction tutorial)
- Save/load + export, balancing (rate sheet lives in CONFIG), audio (WebAudio, simple), juice: chimney smoke, transaction particles, a pettable cat at the castle 🐈
- Optional: road bandits + guard posts (a "security tax") — only if Phase 3–4 balance is stable
- **DoD:** a stranger can finish scenario 1 without asking questions

---

## 11. Key Design Risks

| Risk | Mitigation |
|---|---|
| Economy degenerates (one meta strategy, like the "0% tariff" exploit in the original) | tariff slider has a 10% floor; research costs tariff gold — no trade, no progression |
| Player can't tell why a town is going broke | alerts + Kingdom screen + price trends; this was the original's top complaint — treat readability as feature #1 |
| Phase 3 balancing eats weeks | CONFIG as the single source of truth + autoplay mode with CSV logging for run analysis |
| Scope creep (I know you) | combat, map editor, weather, seasons → parking lot for v2.0. The original also started as "a small minimalistic trading game" and grew — learn from other people's mistakes |

---

## 12. Parking Lot (v2.0+)
Ideas only — none are commitments: bandits and knights as a full system, seasons affecting farms, player-defined inter-town contracts, daily-challenge mode (seed of the day). Anything requiring a backend (e.g. shared leaderboards) is out of scope for this document entirely.

---

## 13. Open Questions / Assumptions

Assumptions I made that need your confirmation or rejection before implementation:

**Design assumptions (derived from the reference game, but not explicitly requested):**
1. **No combat in v1.0.** The original has light bandit/knight mechanics; reviewers called the combat its weakest part. I cut it to Phase 5 optional. Confirm or promote it.
2. **Tab-hidden behavior: pause.** The reference game is an active sim with no offline progression, so I defaulted to pausing when the tab is hidden. *Suggestion, clearly labeled as such:* a capped catch-up (~10 min) on return would suit a browser context where players tab away — but it pushes the game toward idle sensibilities, which may not be what you want here. Your call.
3. **Tariff baseline 25%, slider 10–40%.** The 25% matches the original; the slider and its floor are my invention to close the "0% tariff" exploit. Confirm the range.
4. **14 goods across 3 tiers.** My compact interpretation of the original's larger goods tree, sized for solo scope. Expand or shrink?
5. **Win condition = castle level 5 + 6-scenario campaign.** Castle-as-goal matches the original; the count of 6 scenarios and the 4–6h sandbox arc are my guesses at scope.
6. **Working title "Trade Winds"** — placeholder only.

**Technical assumptions:**
7. **Map radius ~14 (≈600 hexes), pointy-top, axial coords** — sized for readability and Canvas 2D headroom, not validated against your content plans.
8. **Desktop-first, mouse-driven.** No touch controls planned in v1.0. If this ships on your games website, mobile visitors are a real audience — flag if touch support should move up.
9. **Aesthetic: flat 2D code-drawn shapes with optional CC tilesets.** The original's tabletop-diorama look is approximated, not replicated. Art direction is genuinely open.
