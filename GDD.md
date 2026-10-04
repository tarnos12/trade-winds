# Trade Winds — GDD (Design Authority)

**Status:** Unity port — Milestone 1 (economy core) next. The web version (v0.52.1) is frozen in
[`old-game-files/`](old-game-files/) as the behavioural reference; this document describes the game
as that version actually plays (verified against its code, 2026-10-04), plus the decisions taken for
the port.
**Author:** Mariusz (GitHub `tarnos12`)

> **Design authority — the source of truth for scope.** Keep it current. Team-facing distillation +
> live status: [PROJECT.md](PROJECT.md). Vocabulary: [CONTEXT.md](CONTEXT.md). Architecture
> decisions: [docs/adr/](docs/adr/). Team methodology: [CLAUDE.md](CLAUDE.md).
>
> Numbers below are the web version's tuned values — the **starting point** for the port, not
> sacred. "Port-and-rethink": keep what worked, redesign what didn't (§13).

---

## 1. Vision & pillars

**Pitch:** a *Let Them Trade*–inspired economy game. You found Towns on a hex board; each Town houses
people, produces Goods, and trades with other Towns **on its own**. You shape the conditions — where
Towns stand, what they build, where roads run — and the Crown earns a **Tariff** on every trade.

**Pillars:**
1. **Let them trade — don't micromanage.** The player never clicks "sell 5 wood". Towns trade fully
   automatically; the Castle is the only trade hub the player steers.
2. **Economy as simulation, not script.** Prices emerge from each Town's own supply and demand.
3. **Board-game feel.** Warm parchment/wood palette, flat tokens, readable at a glance.
4. **Cozy, not stressful.** No fail state; failure is stagnation. Pause / 1× / 2× / 4×.
5. **Every stall explains itself.** Readability is feature #1: shortages, idle buildings and refusals
   always say *why* and *what to do*. A feature with no UI gets cut.

**Chain rule:** slot limits stop any Town from being self-sufficient — **specialisation forces trade**.

**Out of scope (v1.0):** 3D, combat, multiplayer, map editor, mobile, web-save import.
**Platform:** Unity 6, 2D URP, Windows desktop first (Steam in mind). See ADR 0001.

---

## 2. Core loop

```
OBSERVE (shortages, surpluses, prices, alerts)
   → BUILD (found a Town, place buildings, roads, upgrade)
   → TOWNS TRADE on their own (Traders buy where cheap, deliver where needed)
   → EARN (Tariff into the treasury; Tax into each Town's purse)
   → INVEST (new Towns, research, upgrades)
   → happier tiers unlock richer needs → new production chains → repeat
```

Smallest complete experience: **one Town that grows or starves as its needs are met, plus two Towns
trading**. 5-minute session: check alerts → place 1–2 buildings → leave on 2×. 45-minute session: plan
a new chain, found a Town, research the next tier.

---

## 3. Time

- Economy runs on a fixed **500 ms tick** (2 ticks = 1 game-second); all design is expressed in
  game-seconds/minutes, never raw ticks. Rendering is separate and interpolates.
- Speeds pause / 1× / 2× / 4×. The game pauses when the window loses focus (setting, default on).
- Tick order: Towns (production, consumption, population, Porters) → Traders → market stats →
  research buying → Castle market → Provisioners → research → Mission/Victory checks.

---

## 4. The board

- **Rectangle of pointy-top hexes** (axial coords). Sizes: Small 36×18, Normal 50×25, Large 66×33.
  Fully deterministic from **seed + preset**.
- **Presets:** Fertile (default), Oasis (desert, central water), Big World (large), Highlands (more
  mountains, coal/iron nearer), Isles (lots of water, many fish). **Custom:** Fertility, World Age,
  Climate, Sea Level, Resources, Size (+ lakes, rivers).
- **Terrain:**
  - Buildable ground: fertile, barren, desert. Snow: houses only.
  - Obstacles: water, mountains (no building, roads or travel).
  - Resource hexes (only their own extractor may sit there): forest, fish (in water), and Deposits of
    stone, clay, coal, iron, gold. Deposits allow roads.
- **Deposits by distance from the Castle:** stone anywhere; clay and coal in the outer two-thirds;
  iron and gold in the outer third. Affinities: clay by water; iron and gold by mountains.
- **Start guarantees near the Castle:** ≥6 fertile and ≥3 forest within 4 hexes, a fish hex within
  2–6, a 2-hex stone Deposit close by; walled-off land pockets are carved open.
- **The Castle** sits at a seeded, off-centre spot (≥2 hexes from the edge).
- **Fog of war:** starts revealed around the Castle (radius 6/8/10 by board size). A finished Town or
  building reveals its neighbours; beyond that, only **Scouts** reveal (§11).

---

## 5. Towns

- **Founding** costs 1000 treasury gold. Site: buildable, not touching another Town, the Castle or a
  Castle building (always a 1-hex gap). **Town cap 4**, raised by research to 12.
- A new Town starts with **1000 gold** of its own, **60 wood + 40 potato**, no residents. It takes
  10 s to build, then has 30 s of grace before it exports anything.
- **Footprint grows contiguously:** each building must touch exactly one Town's footprint. Removing a
  building cuts off (and destroys) anything no longer connected to the Town centre.
- **Two purses:** the **treasury** (Crown) pays for founding, building gold costs, roads, Castle
  purchases and Give. **Town gold** pays the Town's imports, its building upgrades and level-ups.
- **Stock cap: 80 per Good.** Author rule: *logistics must keep up, not the cap*.
- **Town levels 1–4**, bought with Town gold (150 / 400 / 900):

  | Level | Building slots (centre uses 1) | Traders | Porters (base) |
  |---|---|---|---|
  | 1 | 8 | 2 | 4 |
  | 2 | 12 | 4 | 5 |
  | 3 | 17 | 6 | 6 |
  | 4 | 24 | 8 | 7 |

- **Crown Give / Take:** move 1000 gold between treasury and a Town (2-min cooldown per Town). Give:
  +10 happiness for 1 min. Take: −30 happiness for 1 min; needs a finished Town ≥5 min old with ≥2
  residents. Manual Take is a legitimate money tool (the *Let Them Trade* model).
- **Destroying a Town** refunds founding + building gold minus gold the Crown has Taken; Stock and
  residents are lost.

---

## 6. Buildings

Every workplace has **2 worker slots** and releases output in **16-second batches**. Each producer
holds its own output store (30); it stops when full until Porters collect.

**Extractors** (on their resource hex, Peasant-staffed unless noted): Lumberjack (wood), Potato Farm
(potato, fertile), Farm (grain, fertile), Fishery (fish), Sheep Farm (wool, fertile), Quarry (stone);
Worker-staffed: Iron Mine, Clay Pit, Coal Mine, Gold Mine.

**Processors** (any buildable non-snow hex):

| Staffed by | Building: inputs → output |
|---|---|
| Peasant | Sawmill: wood → planks · Charcoal Burner: wood → coal |
| Worker | Mill: grain → flour · Bakery: flour → bread · Brewery: grain → mead · Brickworks: clay → bricks · Tailoring: wool → clothes · Stone Tools Maker: planks + stone → stone tools · Oil Maker: fish → oil · Pottery: clay → pottery · Lamp Maker: oil → lamp · Carpentry: planks + oil → chairs |
| Burgher | Forge: wood + iron → iron tools · Armory: coal + iron → iron armor · Distillery: mead + pottery → brandy · Goldsmith: gold + iron tools → gold ring · Luxury Tailor: clothes + gold ring → luxury clothes |

**Houses** (capacity 2 people, no workers): Hut (Peasant), Cottage (Worker), Manor (Burgher),
Aristocrats Home (Aristocrat; cannot be upgraded).

**Start-unlocked:** Hut, Lumberjack, Potato Farm, Sawmill. Everything else is unlocked by research.

**Construction:** the gold part is paid from the treasury on placement; materials are then delivered
from the Town's Stock by Porters over time. Build time by tier: 6 / 10 / 14 / 18 s (+2 s per upgrade level,
max 20 s); progress = the lower of time elapsed and materials delivered. Delivery order: bootstrap
producers first, then ☆ priority, then the rest. Construction always leaves ~1 game-minute of
residents' Basic Needs in Stock.

**Upgrades** (research-unlocked per level; Town gold + materials; the building pauses while
upgrading; cancel refunds in full; an upgrade that needs the building's own output waits until that
much is stocked):
- **Hut** L2 +1 capacity · L3 +1 capacity · L4 −30% Basic Need use · L5 −30% Luxury use.
- **Lumberjack / Farm** L2 output ×1.25 · L3 ×1.5. **Sawmill** the same, and L3 adds a slot.

---

## 7. People, needs & happiness

- **Four Population Tiers**, each living only in its own house type: Peasant → Worker → Burgher →
  Aristocrat. There is no promotion between tiers. Peasants, Workers and Burghers staff workplaces;
  Aristocrats staff nothing.
- **Needs matrix** (author's definitive matrix, 2026-07-08). **Basic Needs** hold happiness at 70;
  **Luxuries** lift it toward 100. One Good can be a Luxury for one tier and a Basic Need for another.

  | Tier | Basic Needs | Luxuries |
  |---|---|---|
  | Peasant | Potato, Wood | Fish, Wool |
  | Worker | Fish, Coal | Clothes, Bread, Mead |
  | Burgher | Lamp, Bread, Mead, Clothes | Chairs, Pottery, Gold Ring |
  | Aristocrat | Lamp, Mead, Iron Armor, Chairs, Pottery | Brandy, Luxury Clothes, Gold Ring |

  Peasants eat ~1.3 potato + 0.9 wood per person per minute; other Basic Needs ~1.1, Luxuries ~0.6.
  A tier consumes its Basic Needs only when **all** of them are present.
- **Happiness** per tier = 70 × Basic satisfaction + 30 × Luxury satisfaction + temporary effects
  (Give/Take), smoothed so bursty deliveries don't cause swings. Town happiness = population-weighted
  average.
- **Population** per tier = capacity × min(1, happiness / 70): **70 happiness = full houses**. Growth
  fills the gap in about a minute; decline is gradual. Even an unhappy house keeps a small core crew.
- **Work speed** = 0.5 + 0.7 × happiness/100 (0.5×–1.2×), so happy Towns produce more per input.
- **Tax:** every resident pays into Town gold — per minute ≈ Peasant 12, Worker 18, Burgher 26,
  Aristocrat 48 — scaled up to 1.6× by happiness above 70.
- **Staffing priority:** producers of the tier's own Basic Need when the Town is short → ☆ priority
  buildings → the rest → blocked buildings (full or upgrading) last.

---

## 8. Movement: Porters and Traders

- **Porters are real logistics** (decided 2026-10-04). They are visible carriers inside a Town (carry
  10, ~1 s per hex) and the *only* way Goods move inside it: they collect output from producers into
  the Town's Stock, deliver inputs to processors and needs to houses, and carry construction and
  upgrade materials to building sites. Nothing is consumed or built from Stock at a distance — if
  Porters can't keep up, houses go short and sites wait, and the UI says so. Porter count and speed
  are therefore a real lever (Town level, research).
- **Traders** travel between Towns, carry 10, and are owned by the buying Town (count by Town level,
  +research). **Roads are optional:** off-road, Traders walk around water and mountains at half speed;
  a road route is 2× faster, paved roads faster still. Roads cost 5 treasury gold per hex.
- **What a Town buys:** it keeps each Good it consumes at roughly a small floor (~6) plus any lump
  needed for construction, upgrades and research. Priority layers: Basic Needs → production inputs →
  Luxuries → other. Starving for a Basic Need prefers the nearest seller.
- **Who sells:** a Town only sells real surplus — never while building or in grace, never a Good it
  structurally consumes, and always keeping its own floor. Sellers with the biggest surplus are
  preferred, then price, then distance, with a little randomness (top 3) so Traders don't herd.
- **A trip:** the buyer pays up front; the Trader loads and unloads over time (2.5 items/s) and can
  carry a back-haul of its home's surplus. Traders only travel with a real purpose.

---

## 9. Market & money

- **Price per Town per Good:** `ratio = stock / (max(0.5, consumption per min) × 2 min)`;
  `price = base × clamp(1.9 − ratio, 0.4, 1.9)`, easing 10% per tick. Empty shelf ≈ 1.9× base; about
  2 minutes of cover ≈ 1×; surplus → 0.4×. Nothing stocked and nothing consumed → no market.
  Consumption = residents + processor inputs (construction and research lumps drive buying, not price).
- **Sales pressure:** each sale nudges a seller's price up; unsold surplus slowly lowers it.
- **Base prices** range from 4 (grain, potato) through 10–28 (processed) to 22–240 (luxury); see
  `old-game-files/src/goods.js` for the full table.
- **Tariff:** 30% of each trade's customs value (max(price, base) × quantity), **minted into the
  treasury on top** — the seller keeps the full price. Slider 10–40% once researched.
- **Money sources:** Tax (into Towns), Tariff (into the treasury), Mission rewards (into the
  treasury). Treasury starts at **10,000**.
- **Tariff is the Crown's main income** (decided 2026-10-04). Balance so a trading Kingdom funds its
  expansion through Tariff; Give/Take is an occasional tool, not the money engine. Tax stays in each
  Town's purse to fund its imports, upgrades and level-ups.

---

## 10. The Castle

- The King's hub, at the board's start point. **Not a Town:** no residents, never founded or
  destroyed. Holds the **treasury** and the **Castle Stock** (starts wood 40, stone 40, potato 10).
- **Castle market** (per Good): *King buys* up to a limit from Towns' surplus (treasury pays, no
  Tariff); *King sells* at base price as the **seller of last resort**. Off by default.
- **Royal Traders** (up to 10) buy materials for the active research and the Research Center, and
  run the King's market orders. They pay no Tariff.
- **Castle Compound:** Research Center, Provisioner, Advanced Provisioner must touch the Castle or
  each other; each is unique.

---

## 11. Progression

**Research** — paid in **Goods only** (no gold, no time cost), metered by the **Research Center**:
- No Research Center → research paused. Speed by center level: 2 / 3 / 4 / 6 materials per second.
  Materials drain from Castle Stock in equal proportion so a node's inputs finish together; any
  shortfall pauses it.
- One active project + a queue; cancel refunds nothing.
- Tree in five bands — Peasant, Worker, Burgher, Aristocrat (building **unlocks** and **upgrade
  levels**) and Kingdom (**modifiers**): extractor/processor/all output boosts, Paved Roads, Larger
  Carts, extra Traders, Castle warehouse size, Tariff +3% / +7% and the Tariff slider, housing +15%,
  +1 Town slot, Town cap +3/+3/+2, extra Scouts, Advanced Provisioner.

**Scouts & provisions** — you start with 1 Scout (up to 3 via research). Send it to a flag; it walks
discovered land (2× on roads), reveals fog, and spends 1 provision per revealed hex (carries 10). It
refills at the Castle from provisions (start 15, cap 30), made by the Provisioner (potato) and
Advanced Provisioner (fish + potato).

**Missions** — a sequenced chain of Crown goals that doubles as onboarding. Current chain (web):
1. Found Your Realm — 1 Town, 2 Lumberjacks, 2 Huts.
2. Trade Winds — 2 Towns, 2 Potato Farms, 10 Tax earned.
3. The King's Scholars — build the Research Center, finish 1 research.
4. A Growing Town — a Sawmill, 1 upgrade.
5. Trade Routes — 20 potato traded, 150 lifetime Tax.
6. The King's Works — 8 buildings, 3 upgrades.
7. The Good Life — Manor, Aristocrats Home, 1000 lifetime Tax.

Objective types: construct, upgrade, trade Good, earn Tax, found Town, research. Missions count work
done earlier. Missions are data (author-editable). **Each Mission rewards treasury gold** on
completion (decided 2026-10-04; amounts set during balancing).

**Victory = completing the Mission chain.** The final Mission is currently "an Aristocrats Home at
100% happiness" (pure needs, not boosted by Give). It will later become something richer, e.g. a
Kingdom festival supplied over time. After Victory the player can keep playing. *(Change from web:
there, Victory was the Aristocrats Home alone and Missions were separate.)*

---

## 12. Player experience

- **Start screen:** seed (+ random), map preset or Custom with a live map preview, New Game /
  Continue. Economy paused while open.
- **HUD (only what's needed):** treasury with live Tariff income; research status; Castle; Kingdom
  Overview; Town cards (coloured, numbered; Give/Take on Shift); Goods strip (kingdom totals, prices,
  trends) whose chips open a **Resource Flow** map overlay; game clock and speeds; menu.
- **Build bar** grouped by tier; tiers appear once something in them is unlocked; locked items say
  which research unlocks them; placement hints explain invalid spots and show usable resource hexes.
- **Panels (one open at a time):**
  - **Town:** population per tier, Porters/Traders, budget chart, income/expense, Tariff contributed;
    Stock (surplus/shortfall, rate, price trend, inbound); buildings grouped by tier.
  - **Building:** input → cycle → output chain with real per-minute numbers; stop reasons (full, no
    input, upgrading, no workers); construction progress with the blocking cause; upgrades; priority.
  - **Castle:** Tariff and Research Center pipeline; Castle market (stock, price, buy/sell, limit).
  - **Research tree:** full screen, bands bottom-up; warns when no Town makes a needed material.
  - **Kingdom Overview:** goal tracker and a sortable table of all Towns.
- **Feedback:** alert icons over Towns (missing Basic Need, idle producer, very unhappy), speech
  bubbles ("We don't have any Potato!", "We dream of Fish — research the Fishery"), wanted-Goods row,
  Event Log with causes and jump-to-Town, toasts, rich tooltips.
- **Controls:** drag/WASD pan, wheel zoom to cursor, Space pause, 1/2/4 speed, K Kingdom, M mute,
  Esc cancel; one-shot placement (Shift keeps the tool); road tool click-A-click-B or drag.
- **Juice & audio:** sale coin bursts and Tariff popups, chimney smoke on working buildings, Trader
  dust, build-complete bursts; soft procedural sounds and an ambient bed. (Carry-over undecided.)
- **Victory card:** stats, best time per preset, Keep ruling / New realm.
- **Saves:** one slot, autosave every 30 s and on key actions; versioned (starts at 1). Map
  regenerated from seed + generator version.
- **Designer tools (not player-facing):** Mission editor, research editor, Balance Lab (headless sim
  runner). Rebuilt as Unity editor tools.

---

## 13. Known problems to fix in the port

- **Tariff is small next to Tax** (~4–20 gold/min vs 45–55 per Town), so the treasury is refilled
  mainly by manual Take. **Fix:** Tariff must become the main income (§9).
- **Take's −30 happiness also halves population** (pop follows happiness), harsher than intended.
- **Minted Tariff** is deliberate inflation; watch for runaway treasury after Victory.
- **Worker happiness plateaus** (fish/coal at 35–75%); the late tiers needed big fixes to be reachable.
- **Porter delivery was effectively optional** — consumption fell back to Stock directly; construction
  used an abstract budget. **Fix:** Porters are real logistics (§8).
- **Buy target ≈ a flat floor of 6** for nearly every Good, independent of how fast it's used.
- **Inputs aren't scaled by work speed** — a happy processor makes 1.2 outputs per input.
- Research **cancel refunds nothing**; ETA reads ~1 s optimistic.

## 14. Cut — do not port

Castle levels and prestige; King's Quests; random events; bridges; the Castle's manual "Royal Stores"
buy/sell table; the radius-based map; menu Pan/Erase/Center tools; the scout "Guard" button (until
combat exists); unused legacy config.

---

## 15. Port plan

Content grows **one Population Tier at a time**, each balanced before the next.

- **M1 — Economy core:** headless C# core + tests, then the hex board on screen. Peasant tier only
  (Potato, Wood; Luxuries Fish, Wool), with Porters as real logistics from day one. **Exit:** a potato Town and a timber Town trade Potato ↔ Wood
  unattended and the Crown earns Tariff; a road visibly speeds trade and narrows their price gap.
- **M2 — The Kingdom:** Castle + Castle market, fog + Scouts + provisions, save/load, Town
  levels, Worker tier. **Exit:** a two-tier Kingdom grows unattended without stalling.
- **M3 — Progression:** research + Research Center, Missions, Burgher and Aristocrat tiers, start
  screen, onboarding. **Exit:** a deterministic run completes the Mission chain (Victory).
- **M4 — 1.0:** author art, balance pass, juice/audio decision, polish. **Exit:** a stranger reaches
  Victory without asking questions.

**Parking lot:** Kingdom festival as the final Mission; bandits + guard posts; harbors / water trade;
seasons; player contracts between Towns; seed of the day.

## 16. Open questions

1. **Juice, audio, ambient chatter** — carry over?
2. **Tariff range** 10–40% (assumed). **Title** "Trade Winds" is a working title.

Resolved 2026-10-04: "Burgher" on screen too (not "Citizen"); Missions reward gold; Tariff is the
main income; Porters are real logistics.
