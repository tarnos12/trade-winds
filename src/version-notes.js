  // === VERSION / PATCH NOTES ===  (bump GAME_VERSION + prepend an entry on each change)
  const GAME_VERSION = "0.27.0";
  const PATCH_NOTES = [
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
