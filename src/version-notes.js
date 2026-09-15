  // === VERSION / PATCH NOTES ===  (bump GAME_VERSION + prepend an entry on each change)
  const GAME_VERSION = "0.51.10";
  const PATCH_NOTES = [
    { v: "0.51.10", notes: [
      "DESTRUCTION & CONNECTIVITY: the Destroy tool now works on a CITY too (click its centre) — it razes the whole city. Destroying refunds the GOLD you spent (city + buildings) but not the resources. And destruction CASCADES: if removing a building (or a city) cuts other buildings off from their city, those orphaned buildings fall with it. Every destroy asks for confirmation and tells you what else it will take down",
    ] },
    { v: "0.51.9", notes: [
      "CITIES BUY IN PRIORITY ORDER (economy overhaul): a city now imports in layers — house basics first, then production inputs, then luxuries, then materials — and only fills each layer to ~30% before topping up the next, looping back to raise them all toward 100%. So a city never fills one warehouse to the brim while another need starves, and food always beats finery to the front of the queue",
    ] },
    { v: "0.51.8", notes: [
      "A STARVING city buys smart: when a city is almost out of a basic good, its trader now favours the CLOSEST seller with stock over the cheapest one — it would rather pay a bit more and get fed sooner than hold out for a bargain and starve",
    ] },
    { v: "0.51.7", notes: [
      "CITIES ANNOUNCE WHAT THEY SELL + PRICES REACT TO DEMAND (economy overhaul): every city now posts each surplus good to a shared market board that all traders read. Prices adjust from sales pressure — a good that keeps selling is marked UP (it's in demand here), while a surplus nobody buys is marked DOWN toward a floor to move it. Over time near, in-demand cities charge more and distant gluts get cheaper, settling into a natural distance-vs-supply equilibrium",
    ] },
    { v: "0.51.6", notes: [
      "REAL INTERNAL PORTERS (economy overhaul): the little haulers you see inside a city are no longer decoration — they physically move goods. A producer banks its output in its OWN store; a porter then walks to that building, loads up (max 10), and carries it back to the warehouse. The warehouse now fills ONLY through porters (and outside trade), so hauling is a real part of the supply chain. The city still never holds more than its cap and never wastes a unit — surplus waits in the building's store or in a porter's arms until there's room",
    ] },
    { v: "0.51.5", notes: [
      "PRODUCTION IN CYCLES (economy overhaul): the lumberjack is now the reference producer — 8 wood every 4 seconds with 2 workers (8 wood per 8 s with 1). Each producing building can run on its own cycle length; a batch = per-worker rate × workers × cycle, so staffing scales output linearly and the numbers match what the panel shows",
    ] },
    { v: "0.51.4", notes: [
      "HOUSES WAIT FOR A FULL PANTRY (economy overhaul): a home now consumes its basic goods only when ALL of them are on hand — if it's missing even one basic it holds the rest instead of burning them, so a city no longer wastes the potato it has while starving for wood. Demand and happiness still reflect the shortage, so the missing good is imported and the family eats again once the basket is complete",
    ] },
    { v: "0.51.3", notes: [
      "NO-WASTE PRODUCTION (economy overhaul): a producing building now banks its output in its own internal store — once that store is full the building STALLS (it stops consuming inputs and stops producing) instead of throwing away the excess. Output flows into the city warehouse only up to the warehouse's room, so a city never produces more than it can hold and nothing is ever wasted",
    ] },
    { v: "0.51.2", notes: [
      "Removed the Demolish button from the building panel — destroying is done from the build bar's Destroy tool (it never belonged on the detail card)",
      "The CITY panel's upgrade button now has the same styled tooltip — hover ‘⬆ Lv N’ to see the requirements (population, gold) with have/need and what the level grants",
    ] },
    { v: "0.51.1", notes: [
      "The ⬆️ upgrade button now has a STYLED tooltip showing the next level, its effect, and the exact resources needed (have/need + gold) — hover it even when you can't yet afford it to see what's required",
      "The city centre now counts as a building slot, so a fresh city reads 1/8",
      "Castle buildings (Research Center, Advanced Provisioner) keep a gap — no city or building may be placed touching them, and two castle buildings never touch",
    ] },
    { v: "0.51.0", notes: [
      "HOUSE UPGRADES (peasant homes, P1 of the economy overhaul): Sturdy Hut (L2) and Fine Hut (L3) each add a housing slot; Grand Hut (L4) cuts basic-resource use −30%; Manor Hut (L5) cuts luxury use −30%. Materials are delivered from the city (or bought in) — L2 30 wood + 10 planks; L3 30 stone + 20 planks + 5 stone tools; L4 30 bricks + 20 stone + 10 stone tools; L5 60 bricks + 30 iron + 10 iron tools",
      "A peasant home now costs 10 wood + 300 gold to build",
    ] },
    { v: "0.50.3", notes: [
      "You can now CANCEL the active research (a Cancel button on the current project in the tech tree) — so a project stuck waiting on a material you can't make yet no longer soft-locks you; research the prerequisite first, then come back to it",
    ] },
    { v: "0.50.2", notes: [
      "Scouts explore smarter: with provisions to spare (3+), a scout now picks a nearby spot that uncovers MORE fog at once instead of always trickling 1–2 tiles — it still marches to the closest frontier first, then favours high-reveal stops",
      "Scouts never stand on or walk through water or mountains",
    ] },
    { v: "0.50.1", notes: [
      "Fixed: Scout EXPLORE now works — select a scout, press Explore, then click a discovered tile and it marches there and lifts the fog (clicking a tile did nothing before)",
      "Scout roster moved to the top-center so it no longer overlaps the resources panel",
      "City cards are compact — a colored badge with the city number; hold SHIFT to reveal Give/Take",
    ] },
    { v: "0.50.0", notes: [
      "Cities no longer stall at 0 workers: even a house with no food/wood keeps a tiny core crew — at least 1 worker, ~10% of capacity. When basics are totally missing that crew works on a DUTY CYCLE (present 1 of every 4 cycles) so a starved city can still bootstrap food/wood and recover",
      "A new city now starts with 60 wood + 20 potato (was 40 wood)",
    ] },
    { v: "0.49.0", notes: [
      "CONSTRUCTION takes time now: every building fills a progress bar. Progress is the lesser of build-time and materials delivered — so a house with 8/10 wood delivered stalls at 80% until the rest arrives; with everything on hand a T1 building finishes in ~6s (longer for higher tiers/upgrades)",
      "T1 buildings cost WOOD (hut, lumberjack, potato farm 10 each; sawmill 20), delivered from the city’s own stock by its haulers. A NEW CITY starts with 40 wood",
      "The building detail panel is redesigned to match the reference (production chain, worker portraits, action row)",
      "City cards are compact — a colored badge with the city number; HOLD SHIFT to reveal each city’s Give/Take controls",
      "Fog of war shrunk so the starting view is a cozy pocket, not half the map",
      "Trade carts now DETOUR around mountains and water when off-road (no more cutting straight through peaks)",
      "Internal porters carry at most 10 at a time",
    ] },
    { v: "0.48.0", notes: [
      "UI PASS: the HUD is reworked — the game name is gone, the top-right now shows a game CLOCK, speed controls, version and menu; the top-left groups your gold with a 🔬 Research and a 🏰 Castle button (Castle centres the map and opens the castle menu)",
      "Selecting a building now HIGHLIGHTS it on the map so you can tell which one you’re looking at",
      "Producer detail panels show a visual PRODUCTION CHAIN — inputs → a process wheel with the cycle time & live %, → the output with its batch size and stock bar",
      "Only ONE panel shows at a time now — opening a building, city or castle (or selecting a scout) closes the others",
      "Research is reachable from the top-left even before you’ve built a Research Center (you just can’t run research until it’s built)",
    ] },
    { v: "0.47.0", notes: [
      "MORE ORE: every ore type (stone, clay, iron, coal, gold) now spawns as several clusters — no more maps with a single gold node. Resource density is a setting: Low 3 / Normal 6 / High 10 clusters per type (min 3 guaranteed)",
      "Deposits look more natural — nodes scatter with the odd 1–2 tile gap and rocky ores intermix (iron beside coal/stone) instead of forming solid single-type blocks",
      "Mountains now form several semi-random RANGES across the map (not one central massif), and iron/gold spawn against them (stone/coal too, but sometimes out in barren country)",
      "NEW: every producer shows a PROGRESS BAR — it fills toward each whole-unit batch (green = producing, amber = waiting on inputs); porters now carry the whole batch",
      "The castle starts with 10 potato (plus its wood/stone) so provisions start flowing right away",
      "NEW build-bar section ‘⭐ Special’ holds the castle buildings (Research Center, Advanced Provisioner)",
      "Roads now bend AROUND mountains/water when you drag A→B (no more broken road lines cutting through peaks)",
      "Fixes: a fresh game no longer starts with the City tool pre-selected; Scout ‘Explore’ now moves the scout to any tile you click; the scout panel sits bottom-left so it stops covering the build bar; the tile under your cursor is always highlighted",
    ] },
    { v: "0.46.0", notes: [
      "NEW: the ADVANCED PROVISIONER \u2014 research it (Logistics branch), then build it next to your castle from the \ud83c\udfd7 Build menu. It runs alongside the built-in provisioner, turning 1 fish + 1 potato \u2192 2 provisions (and the castle starts buying fish automatically)",
    ] },
    { v: "0.45.0", notes: [
      "NEW: SCOUT UNITS! You start with 1 Red scout at the castle \u2014 pick it from the top-left icon (or click it on the map) to open its panel (\ud83c\udf92 provisions x/10)",
      "Send a scout to EXPLORE a spot: it marches there (2\u00d7 faster on roads, fastest route), plants its colored flag, and lifts the fog around it \u2014 spending 1 provision per tile uncovered, always standing on discovered ground",
      "When its pack runs dry it walks home, refills from the castle\u2019s provision store (1/sec), and heads back out to keep exploring around its flag. It can also Return to castle on command (Guard area comes with enemies later)",
      "Unlock a 2nd (Green) and 3rd (Blue) scout via research \u2014 Scouting Party then Ranger Lodge in the Logistics branch",
    ] },
    { v: "0.44.1", notes: [
      "Provisions now use a \ud83c\udf92 bag icon (a provision pack) instead of a loaf",
    ] },
    { v: "0.44.0", notes: [
      "Removed the Castle UPGRADE system \u2014 it only raised a cosmetic level and gated nothing. The castle is now a fixed-capacity hub (same warehouse + traders)",
      "NEW: the castle stockpiles PROVISIONS. It automatically buys surplus potato from your cities and its built-in provisioner turns 2 potato \u2192 1 provision (cap 30; you start with 15) \u2014 see the new Provisions bar in the Castle panel",
      "Provisions will fuel Scout units and an unlockable Advanced Provisioner (1 fish + 1 potato \u2192 2) \u2014 coming in the next update",
    ] },
    { v: "0.43.0", notes: [
      "MAJOR map overhaul \u2014 far less grass. Fertile land & forest now appear as varied-size PATCHES (small/medium/big, each a fertile+forest mix) scattered over a background of barren, desert, snow, water and mountains",
      "Mountains are now impassable RANGES (bigger on \u2018young\u2019 worlds) \u2014 with a guarantee the map stays reachable (a pass is carved if a region gets walled off)",
      "NEW water: inland LAKES and winding RIVERS (width varies 1\u20135 tiles), both can hold fish. Set Lakes and Rivers on the Custom map (none/low/normal/many)",
      "Resources spawn more logically: clay hugs water; stone/iron/gold/coal favour barren & mountains. Snow now caps BOTH the north and south edges",
      "The map now starts FOGGED \u2014 you see a starting area around your castle (larger on bigger maps), always seeded with wood + fertile land for an early economy",
    ] },
    { v: "0.42.0", notes: [
      "City limit: you can found 4 cities to start. Research three Kingdom charters to raise it \u2014 Township Grants (+3 \u2192 7), Provincial Rule (+3 \u2192 10), Imperial Domain (+2 \u2192 12)",
      "Founding a city is now one-shot: after you place a city the tool drops back to pan mode, so you won\u2019t accidentally keep dropping cities \u2014 re-pick City to found the next. The City button shows your count (e.g. 2/4) and greys out at the cap",
    ] },
    { v: "0.41.0", notes: [
      "Resources now spawn in distance TIERS from your castle: T1 (stone — plus wood, fish and farmland) can appear anywhere; T2 (clay, coal) in the outer two-thirds; T3 (iron, gold) only in the far third — so expanding outward is rewarded",
      "Your castle no longer always sits dead-center — it now spawns at a randomized, off-center spot on every map (still on connected, buildable land)",
      "Presets can bend the rule: the Highlands mining world pulls its coal & iron closer in, while gold still sits far out",
    ] },
    { v: "0.40.0", notes: [
      "Economy overhaul — resources are now whole units everywhere (no more fractions in your warehouse); a building banks the fractional leftover and rolls it into the next batch, so nothing is lost",
      "Buildings now produce in BATCHES on a timer (gatherers every 8s, workshops every 12s) instead of trickling every tick — same output rate, delivered in chunks",
      "Fixed the porter that endlessly shuttled 1 wood back and forth (batched production means there's a real load to carry, not a constant dribble)",
      "Fixed internal porters ignoring game speed — they now move faster at 2×/4× like the road caravans do",
    ] },
    { v: "0.39.0", notes: [
      "NEW: Custom Map — pick “Custom…” on the start screen to shape your world with 6 dropdowns (Fertility, World Age, Climate, Sea Level, Resources, Size), each Low/Normal/High. 🎲 Regenerate rolls a fresh world with the same settings",
      "The 5 map presets are now clearly distinct — lush-green Fertile, desert Oasis, barren-giant Big World, plus two NEW worlds: rugged snowy Highlands and watery Isles (archipelago)",
      "Your chosen world settings are saved, so Continue restores the same map type",
    ] },
    { v: "0.38.3", notes: [
      "Fixed the castle getting stranded: the castle tile and the ring around it are now always buildable land, and the castle is guaranteed to be connected by land to the rest of the map (a land bridge is carved if needed) — this fixes the Oasis map, whose central lake could island the castle",
    ] },
    { v: "0.38.2", notes: [
      "NEW: a 🏠 Main Menu button in the ☰ Menu — it saves your game and returns to the title screen, where Continue picks up exactly where you left off",
    ] },
    { v: "0.38.1", notes: [
      "Moved the Build / Peasant bar down to the bottom edge of the screen (it used to float higher to clear the old corner widgets, which are gone now)",
    ] },
    { v: "0.38.0", notes: [
      "The world is now a wide RECTANGLE (50 × 25 tiles) centered on your castle, instead of the old hexagonal disc — more room to spread out, with a snow band along the north edge and water along the borders",
    ] },
    { v: "0.37.0", notes: [
      "Retired the random Kingdom Events system (Bumper Harvest / Demand Craze / Kingdom Fair) — it ran with almost no UI and unclear value; the economy is now purely player-driven",
      "Objectives panel no longer repeats the mission's name below its own header — it just shows the progress count",
    ] },
    { v: "0.36.0", notes: [
      "UI declutter & feel pass (Let-Them-Trade inspired), built by an agent team:",
      "The play screen is now corner-anchored and calm \u2014 gold + resources top-left, speed controls + a \u2630 Menu top-right, objectives on the right edge, build menu bottom-center",
      "Everything non-essential (seed/regenerate, map tools, reveal-fog, controls help, FPS + sound-debug) now lives in the \u2630 Menu, one click from the top corner",
      "NEW: a collapsible Event Log (bottom-right) that funnels research, level-ups, castle upgrades, kingdom events and the win into one feed",
      "Camera panning and zoom now glide smoothly to their target instead of snapping; internal porters fade in/out instead of popping",
    ] },
    { v: "0.35.0", notes: [
      "Feel & juice pass (built by a 3-way agent team):",
      "Economy: fixed the post-victory happiness sawtooth \u2014 a supplied estate now holds a steady happiness plateau instead of jittering as import carts arrive in bursts (peak-to-trough ~27 \u2192 <1, same average)",
      "Visuals: punchier coin bursts on a sale, floating +Ng tariff popups, a build/upgrade \u201cta-da\u201d burst, chimney smoke only from buildings that are actually producing, and cart dust",
      "Sound: warmer coin chime and level-up, a new construction-complete cue, and a subtle market ambience bed (respects mute, never plays before your first click)",
    ] },
    { v: "0.34.0", notes: [
      "Retired the old King\u2019s Quests entirely \u2014 they had no UI (the banner was removed long ago), ran invisibly, and only paid silent rewards",
      "With prestige\u2019s only source gone, the Castle now upgrades on GOLD alone (like your cities), and its panel no longer asks for prestige",
    ] },
    { v: "0.33.1", notes: [
      "Fixed the mystery intermittent sound: the King\u2019s-Quest fanfare was still firing even though its banner was removed, so quests completed invisibly with a random jingle \u2014 that cue is gone (quests still pay their rewards)",
    ] },
    { v: "0.33.0", notes: [
      "NEW: Trade Winds can now run as a Windows desktop app (Electron) — see DESKTOP.md (npm start / npm run dist)",
      "Everything auto-saves to one editable JSON file on disk: your game, research tree, missions, and Balance-Lab scenario — no more Export/Import",
      "The Balance Lab now remembers your composed cities between sessions",
    ] },
    { v: "0.32.0", notes: [
      "BIG REBALANCE of the whole economy to clean, readable numbers (per minute at full staffing):",
      "Gatherers — Lumberjack & Potato Farm 60/min, Sheep Farm 45, Fishery 30, and all mines (stone/iron/clay/coal/gold) 20",
      "Every processor now refines ~10/min at a 2:1 input ratio (e.g. Sawmill: 20 wood → 10 planks)",
      "People are hungrier per head but far fewer are needed: each person eats 2.5/min of every basic and 1.5/min of every luxury",
      "Net effect: 1 Potato Farm feeds 24 peasants, 1 Fishery 20, 1 Sheep Farm 30 — and high tiers now truly depend on inter-city trade",
    ] },
    { v: "0.31.0", notes: [
      "Balance Lab: hover (or click to pin) any resource on the right to see a formatted breakdown of exactly where it's produced and consumed across all cities, summed",
      "House cards now split resident needs into a Basic vs Luxury table so an 8-good tier stays readable",
      "Every per-building number on a card now clearly reads /min; good names are tidied (e.g. Iron Armor)",
    ] },
    { v: "0.30.0", notes: [
      "Balance Lab visual overhaul: each city is a cleaner card with a titled header, quiet slot/population pills, and the delete button tucked into a corner",
      "Building rows tidied — a single − count + segmented control, quiet pause/remove icons, and each building's produce/consume line reads as a subtle second row",
      "Add buttons grouped under Peasant / Worker / Burgher / Aristocrat section dividers; per-row flows scale with the number of buildings",
    ] },
    { v: "0.29.0", notes: [
      "Balance Lab cities are now compact cards in a grid, ordered by tier: Houses read Hut → Cottage → Manor → Aristocrat Home, workplaces group by who staffs them",
      "Each building shows its own produce/consume line per minute (e.g. Sawmill: wood −480, planks +240)",
      "Pause any building: a paused workplace stops producing; a paused house empties out — losing its people, their consumption AND their labour",
      "Buildings drop to 0 without vanishing (a ✕ removes them), so you can see a city with an empty building",
      "Each city has a level that caps its building slots, exactly like the game (8 / 12 / 17 / 24)",
    ] },
    { v: "0.28.0", notes: [
      "Balance Lab redesigned into a proper editor: build each city from Houses / Gatherers / Production buttons, with count steppers and level pickers",
      "A ⚠ idle badge warns when a workplace can't be staffed (e.g. a Fishery with no peasants) — the same rules as the real game",
      "Persistent Resources panel on the right: one row per good showing its producers by level (e.g. Potato Farm: 5×L1) and net /min",
      "Charts, the carrying-capacity table and the ground-truth simulation now live on their own Charts & sim tab",
    ] },
    { v: "0.27.0", notes: [
      "NEW: a Balance Lab (🧪 on the start screen) — compose cities from real buildings and populations and see production vs. consumption update live",
      "Balance Lab now shows Carrying Capacity: how many people and downstream buildings ONE producer feeds (e.g. 1 Lumberjack → 40 peasants or 2 Sawmills), since cities specialise and trade",
      "Run a scenario through the real economy engine to get a self-sustained verdict: is every city happy and net-positive on gold?",
      "Production buildings now show their current output speed, the same way houses show their consumption",
      "Transporter overview explains what each hauler is carrying and why it may sit idle (they deliver construction materials)",
    ] },
    { v: "0.26.0", notes: [
      "Internal city porters only move when there's a real reason (a good that isn't already maxed out)",
      "New debug panel (top-right) lists recent sound effects and where each came from",
      "Cities can now be upgraded on gold alone — no population requirement",
      "Removed the Collapsed Bridge event that cut your roads",
      "Rendering is capped at 60 FPS (the economy clock is unaffected)",
    ] },
    { v: "0.25.0", notes: [
      "NEW: a Mission Editor (🎯 on the start screen) — design your own missions on a grid and connect them into a flowchart",
      "Missions are now data-driven with typed goals: construct a building, upgrade a building, trade a good, or earn tariffs",
      "Each mission can be retroactive (counts progress you already made) or start fresh from when it unlocks",
      "The Getting Started panel runs your authored missions (or the built-in set) and tracks each goal's progress",
    ] },
    { v: "0.24.0", notes: [
      "Traders now glide smoothly along the tiles they travel, at a steady speed (faster on roads, slower off-road)",
      "Internal city porters follow the tiles too and show the same carried-item chips as trade caravans",
      "Draw roads by clicking a start and an end — the whole path fills in; hold Shift to keep chaining",
      "You can now build on top of a road (roads are their own layer)",
      "Every workplace has 2 job slots and every house starts at 2 residents — a clean 1:1 balance",
      "All rates in tooltips and descriptions now read per minute",
      "Removed the King's Request banner up top — onboarding is moving into the Getting Started missions",
    ] },
    { v: "0.23.0", notes: [
      "Towns now trade WITHOUT roads too — but a road route makes traders travel twice as fast",
      "FIX: buildings and upgrades no longer starve for materials — construction now gets its share of stock before local production eats it",
      "Hover any tile to see its name and what you can build there",
      "Bottom Build menu can now Destroy roads (instant) and Destroy buildings (with confirmation)",
      "Traders glide smoothly between tiles; internal city porters have their own color and show what they carry",
      "Stone and other early resources now spawn closer to your starting castle",
      "Rates in tooltips and descriptions are now shown per minute, so they're easier to read",
    ] },
    { v: "0.22.0", notes: [
      "NEW WIN CONDITION: raise an Aristocrat's House to 100% happiness — the castle is now just a milestone",
      "Winning it means supplying every luxury (rings, brandy, fine clothes, chairs, lamps…), so the whole late economy finally comes alive",
      "Aristocrats and their luxuries used to be unreachable dead content — rebalanced so a thriving upper class is actually achievable",
      "Bigger towns (more building slots), roomier manors, and smoother luxury supply chains",
    ] },
    { v: "0.21.0", notes: [
      "Research is reworked: it no longer costs gold — a project is powered by RESOURCES metered in over time",
      "Build a Research Center on a hex next to the castle to unlock research; its level sets the speed",
      "Materials drain equally so every resource for a project finishes together; research pauses if the castle runs short",
      "Kingdom Overview and the Keep tab now show a live research progress bar with each material's consumed/needed count",
    ] },
    { v: "0.20.3", notes: [
      "City panel is cleaner: hover the Traders bar to see each trader's destination instead of a printed list",
      "City warehouse shows ▲ (green) for goods it's selling and ▼ (red) for goods it wants to buy",
    ] },
    { v: "0.20.2", notes: [
      "FIX: cities now actually trade — small towns were never dispatching traders and slowly starved",
      "Traders only set out when there's a real purpose: a needed good a reachable city can actually sell",
      "Aristocrat Homes are 1 slot and can no longer be upgraded (removed the stray upgrade levels)",
    ] },
    { v: "0.20.1", notes: [
      "Winning now feels like winning — a celebratory victory screen with confetti and a run recap",
      "Fixed a placement hint that wrongly said fogged tiles were valid city sites",
      "Warehouse tables now show a visible scrollbar so you can tell there's more to scroll",
    ] },
    { v: "0.20.0", notes: [
      "Citizens & Aristocrats now work: a broken research chain (Manors needed a good only Citizens could make) is fixed",
      "The kingdom is now completable end-to-end — you can grow all four classes and reach the castle-level-5 victory",
    ] },
    { v: "0.19.0", notes: [
      "Workers now thrive: fixed a chain where Bread could never be unlocked, and fisheries produce more",
      "Cleaner research tree — prerequisite lines are short and tidy instead of long diagonals across the screen",
    ] },
    { v: "0.18.1", notes: [
      "The King no longer requests goods your kingdom can't produce yet — quests rotate past them",
      "Town level 4 needs 26 population (30 was unreachable on a maxed level-3 city)",
    ] },
    { v: "0.18.0", notes: [
      "POPULATION REWORK: higher classes actually arrive now — stock a tier's basic needs and settlers move in",
      "The old luxury requirement deadlocked Workers/Citizens (they needed goods only they could make) — gone",
      "Charcoal Burning is peasant-run (and gentler on wood); Lamp Making is worker-run — so classes can bootstrap",
      "More building slots per city level (8/12/16/20) and easier town-level requirements (8/16/30 pop)",
      "Cottages no longer need bricks; scaffolding no longer houses anyone",
    ] },
    { v: "0.17.1", notes: [
      "FIX: research no longer gets stuck at 100% — the castle starts with materials for early research",
      "Cities now sense what the active research needs and produce/import it for the royal buyers",
      "Research waiting on materials says so: ⏳ badge + live have/needed counts in tooltips and the queue",
    ] },
    { v: "0.17.0", notes: [
      "12 new buildings: Tailoring, Charcoal Burning, StoneTools & Oil Makers, Pottery, Distillery, Goldsmith, Lamp Maker, Forge, Armory, Carpentry, Luxury Tailor",
      "New goods & chains up to T3: mead, oil, pottery, brandy, iron tools, gold rings, lamps, iron armor, chairs, luxury clothes",
      "Every class now has its own needs: Workers want fish+coal, Citizens want lamps+bread+mead+clothing, and…",
      "ARISTOCRATS arrive: the end-game class — they make nothing, consume the finest goods, and pay the most tax",
      "Happiness rework: 70% fills your homes; every point above pays extra gold. Higher classes pay more",
      "Old saves migrate automatically (beer→mead, tools→iron tools, jewelry→gold rings, furniture→chairs)",
    ] },
    { v: "0.16.0", notes: [
      "NEW WORLD: Barren/Desert/Fertile ground, resource deposits (stone, clay, iron, gold, coal), fish shoals, snow & mountain ridges",
      "Map PRESETS at game start: Oasis / Fertile Land / Big World — terrain clumps, rarer resources further out",
      "Fisheries build ON fish tiles; farms need Fertile Soil; snow allows houses only; mountains block roads",
      "New chains: clay→bricks (T2 building material), iron+coal→tools, gold→jewelry; ore is now Iron",
      "Wheat Farm is research-unlocked (T1 tree); Shepherd is now the Sheep Farm",
    ] },
    { v: "0.15.0", notes: [
      "Cities run TRADER FLEETS: more external traders & internal transporters as the city levels up",
      "Traders haul multiple goods per trip; hover a city's trader bar for the live trade list",
      "City panel redesigned: header with upgrade/give/take, budget chart, income breakdown, warehouse view, building cards",
      "Castle panel redesigned: research pipeline view + warehouse where YOU enable per-good trading with a stock limit",
      "Per-tier happiness & income: each class judges its own needs; happy classes pay more tax",
      "Houses show needs rings, income and a happiness meter; cities pop speech bubbles & wanted-goods icons",
    ] },
    { v: "0.14.1", notes: [
      "Every resource now has a proper icon (🪵🪨🥔🐟🧶…) across panels, chips, carts and tooltips",
    ] },
    { v: "0.14.0", notes: [
      "Full-screen research TREE (🔬): bands bottom-up Peasants → Workers → Citizen + kingdom side column",
      "Every building is now unlocked by its own research node; upgrade levels are per-level pips (II/III/IV)",
      "Research QUEUE: click nodes to line them up — they run automatically in order",
      "Castle traders now buy research materials autonomously (no need to keep the castle selected)",
      "Top-left resource overview: every producible good with kingdom totals, prices, trends — click for charts",
      "\"Burghers\" are now called Citizens",
    ] },
    { v: "0.13.0", notes: [
      "Two-part research: a new 🏗 Development branch unlocks building upgrade LADDERS",
      "Click a building to buy its next level — costs kingdom gold + city resources (delivered by traders)",
      "Hut Lv2–4: +1 population each, final level −30% wood/potato use; Lumberjack/Farm/Sawmill get output boosts",
      "Upgraded buildings wear a level badge on the map; pending upgrades show the materials they still need",
      "City demand now includes upgrade materials — traders buy what your buildings are waiting on",
    ] },
    { v: "0.12.0", notes: [
      "Trades are no longer instant — traders park to load and unload at 5 items/sec",
      "Traders glide smoothly along roads between economy ticks (frame-rate independent)",
      "Hover a trader to see Loading / Hauling / Unloading with a live count",
    ] },
    { v: "0.11.0", notes: [
      "Buildings are now built over time — placement costs gold; resources are delivered from city stock",
      "Under-construction buildings show a scaffold + the resources they still need on the map",
      "Click any building to open its panel: workers, output, construction, ⭐ priority, lock/unlock worker slots",
      "Traders show a cargo icon + number (greyed = requested / en route to buy)",
      "City panel Population tab lists your workforce (assigned vs idle, hover for the breakdown)",
    ] },
    { v: "0.10.0", notes: [
      "New needs: peasants want Wood + Potato (→70% happy), then Fish + Wool (→100%)",
      "New Potato good + Potato Farm; each city stores up to 80 of a resource",
      "Happy cities earn gold over time (people-tax); new cities start with 20 wood",
      "Research now needs materials — the castle's traders buy them (while the castle panel is open)",
      "Sawmill is a Peasant building; locked buildings & tiers hidden until researched",
    ] },
    { v: "0.9.0", notes: [
      "Click the castle to open its panel (prestige, level, tariff, warehouse) — like city panels",
      "Balance pass on building costs & prices",
      "Only House / Woodcutter / Farm / Sawmill available at start; the rest unlock via research",
    ] },
    { v: "0.8.0", notes: [
      "Categorized build menu: Build / Peasant / Worker / Burgher (Worker & Burgher unlock via research)",
      "Population shown as whole numbers; version + patch notes added",
    ] },
    { v: "0.7.0", notes: [
      "Kingdom treasury (10,000 g) pays for all placement; cities pay resources to build",
      "City cards up top with Give / Take gold (± happiness); kingdom gold shown top-left",
      "City happiness (~50% base) drives population from housing — build a house to grow",
      "Trade rework: cities buy what they lack (works from level 1); reserved goods + agreed prices",
      "Trade UI: buy/sell arrows, trader bars & hover; internal-trader porters",
    ] },
    { v: "0.6.0", notes: [
      "Contiguous cities: buildings attach to the nearest city; gaps between cities",
      "Terrain icons (forest, hills, mountains, water, fields…); bigger starting view",
      "Town interiors: place buildings on valid terrain; houses generate workers",
    ] },
    { v: "0.5.0", notes: [
      "Phase 4 — research tree, King's quests, prestige, castle levels (L5 = victory), Kingdom screen, events",
      "Phase 5 — start screen, tutorial, speed controls (⏸/1×/2×/4×), tariff slider, audio, visual juice",
    ] },
    { v: "0.4.0", notes: [
      "Phase 3 — autonomous cart trade between towns; 25% tariff to your treasury; castle warehouse",
    ] },
    { v: "0.1–0.3", notes: [
      "The board (hex map, fog, camera), roads, and town production & prices",
    ] },
  ];
  (function () {
    const badge = document.getElementById("verBadge");
    const panel = document.getElementById("patchPanel");
    const body = document.getElementById("pnBody");
    if (!badge || !panel || !body) return;
    badge.textContent = "v" + GAME_VERSION;
    body.innerHTML = PATCH_NOTES.map(p =>
      '<div class="pn-ver"><span>v' + p.v + '</span></div><ul>' +
      p.notes.map(n => "<li>" + n.replace(/</g, "&lt;") + "</li>").join("") + "</ul>"
    ).join("");
    const toggle = (show) => panel.classList.toggle("hidden", show === undefined ? !panel.classList.contains("hidden") : !show);
    badge.addEventListener("click", () => toggle());
    document.getElementById("pnClose").addEventListener("click", () => toggle(false));
  })();

  // === UI-DECLUTTER === the ☰ HUD menu: a corner popup housing every
  // non-essential control (map/tools/help/debug). Opens with a small fade+slide,
  // closes on ✕, Esc, or an outside click. The relocated buttons keep their own
  // ids so their existing handlers (input/audio/kingdom modules) stay bound.
  (function () {
    const btn = document.getElementById("hudMenuBtn");
    const menu = document.getElementById("hudMenu");
    const close = document.getElementById("hudMenuClose");
    if (!btn || !menu) return;
    let open = false;
    function setOpen(v) {
      open = v;
      if (v) {
        menu.classList.remove("hidden");
        menu.classList.add("anim-in");
        requestAnimationFrame(() => menu.classList.remove("anim-in"));  // trigger the transition
      } else {
        menu.classList.add("hidden");
      }
      btn.classList.toggle("active", v);
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });
    if (close) close.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
    // Outside-click closes the menu (but not clicks inside it or on the button).
    document.addEventListener("click", (e) => {
      if (open && !menu.contains(e.target) && e.target !== btn) setOpen(false);
    });
  })();
