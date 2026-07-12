// === GOODS-PRICES START ===  (T5 / slot #3 — goods + buildings catalog + local price model)
// Pure data + pure functions only (GDD §5, §6.1). No DOM, no canvas, no I/O.
// Added to the shared CONFIG via a NON-DESTRUCTIVE merge so it composes with
// the Phase-1 CONFIG and with the other Phase-2 slices (T4 sim, T6 UI).
Object.assign(CONFIG, {
  // 14 goods across 3 tiers (GDD §5.1). basePrice climbs with tier; `inputs`
  // (goodId → qty consumed per unit produced) reference other goods by id.
  // NB: "beer = grain + water" in the GDD — water is ambient, not a tracked
  // good, so only grain appears here.
  goods: {
    // --- tier 1 (raw) ---
    wood:   { id: "wood",   tier: 1, basePrice: 5 },
    stone:  { id: "stone",  tier: 1, basePrice: 6 },
    iron:   { id: "iron",   tier: 1, basePrice: 8 },   // === TV2: renamed from "ore" ===
    clay:   { id: "clay",   tier: 1, basePrice: 6 },   // === TV2: raw, priced like stone ===
    grain:  { id: "grain",  tier: 1, basePrice: 4 },
    potato: { id: "potato", tier: 1, basePrice: 4 },   // EV3: tier-1 basic food (the peasant staple)
    fish:   { id: "fish",   tier: 1, basePrice: 5 },
    wool:   { id: "wool",   tier: 1, basePrice: 7 },
    // === CC: content chains v2 — 4-tier needs matrix + aristocrat luxuries. ===
    // --- tier 2 (processed / mined) --- basePrice ≈ input cost × ~1.4–1.5 (labour margin).
    planks:      { id: "planks",      tier: 2, basePrice: 14, inputs: { wood: 2 } },              // wood 5×2=10
    iron_tool:   { id: "iron_tool",   tier: 2, basePrice: 22, inputs: { wood: 1, iron: 1 } },     // === CC: Forge; migrates old "tools" ===
    flour:       { id: "flour",       tier: 2, basePrice: 12, inputs: { grain: 2 } },             // grain 4×2=8
    mead:        { id: "mead",        tier: 2, basePrice: 14, inputs: { grain: 2 } },             // === CC: Brewery; migrates old "beer" ===
    clothes:     { id: "clothes",     tier: 2, basePrice: 22, inputs: { wool: 2 } },              // === CC: T2 now, Tailoring wool→clothes; migrates old "cloth" ===
    stone_tools: { id: "stone_tools", tier: 2, basePrice: 28, inputs: { planks: 1, stone: 1 } },  // === CC: StoneTools Maker ===
    oil:         { id: "oil",         tier: 2, basePrice: 15, inputs: { fish: 2 } },              // === CC: Oil Maker (fish 5×2=10) === === BALPV: 18→15 restores T2 ×1.5 band; repairs lamp (40/30) & chairs margins downstream ===
    coal:        { id: "coal",        tier: 2, basePrice: 10 },  // === TV2: mined raw (tier = pricing band) ===
    gold:        { id: "gold",        tier: 2, basePrice: 42 },  // === TV2: mined raw, high value ===
    bricks:      { id: "bricks",      tier: 2, basePrice: 16, inputs: { clay: 2 } },              // === TV2: clay 6×2=12 (Brickworks) ===
    // --- tier 3 (luxury) --- basePrice ≈ input cost × ~1.3–2 (scarcer, higher margin).
    bread:          { id: "bread",          tier: 3, basePrice: 30,  inputs: { flour: 2 } },                 // flour 12×2=24
    pottery:        { id: "pottery",        tier: 3, basePrice: 22,  inputs: { clay: 2 } },                  // === CC: Pottery (clay 6×2=12) ===
    lamp:           { id: "lamp",           tier: 3, basePrice: 40,  inputs: { oil: 2 } },                   // === CC: Lamp Maker (oil 18×2=36) ===
    iron_armor:     { id: "iron_armor",     tier: 3, basePrice: 70,  inputs: { coal: 2, iron: 2 } },         // === CC: Armory (coal10×2+iron8×2=36) ===
    chairs:         { id: "chairs",         tier: 3, basePrice: 64,  inputs: { planks: 2, oil: 1 } },        // === CC: Carpentry; migrates old "furniture" ===
    gold_ring:      { id: "gold_ring",      tier: 3, basePrice: 120, inputs: { gold: 1, iron_tool: 1 } },    // === CC: Goldsmith; migrates old "jewelry" ===
    brandy:         { id: "brandy",         tier: 3, basePrice: 72,  inputs: { mead: 2, pottery: 1 } },      // === CC: Distillery (mead14×2+pottery22=50) === === BALPV: 60→72 (1.44× band) so the distillery is worth scarce burgher labour ===
    luxury_clothes: { id: "luxury_clothes", tier: 3, basePrice: 240, inputs: { clothes: 2, gold_ring: 1 } }, // === CC: Luxury Tailor (clothes22×2+ring120=164) === === BALPV: 200→240 (1.46× band) — deepest chain carries the fattest absolute margin ===
  },

  // Player-placed buildings (Town Interiors, GDD §4.1, §5.2). Redesigned into
  // three `kind`s — no more auto-seed. Shape (shared data contract, TASKS.md):
  //   { id, name, kind:'extractor'|'processor'|'house',
  //     terrain:<terrainKey|null>, adjacent?:<terrainKey>,
  //     output?:{goodId, ratePerWorker}, inputs?:{goodId:qty},
  //     workerSlots?, workerTier?:'peasant'|'worker'|'burgher',
  //     houseCapacity?, houseTier?:'peasant'|'worker'|'burgher',
  //     cost:{goodId:qty,…, gold} }
  // - Extractors sit ON their resource hex (`terrain`) or on land bordering it
  //   (`adjacent`, e.g. fishery→water); staffed by peasants.
  // - Processors sit on any buildable town hex (`terrain:null`); staffed by
  //   workers; consume `inputs` per unit produced (Sim.tick honours these).
  // - Houses hold no workers — they add `houseCapacity` of their `houseTier`.
  // BAL: each building carries a per-building unlock — `startUnlocked:true` on the
  // four starters (hut / lumberjack / farm / sawmill), else `unlockedBy:"<research
  // node id>"`. A building is AVAILABLE iff startUnlocked OR Research.has(unlockedBy).
  // The gate is UI-level only (build menu) — the pure placement core is untouched.
  // Cost ladder: basic (starters) = wood + small gold; mid = + stone; late/luxury
  // = + planks & higher gold.
  buildings: {
    // --- extractors (peasant labour, sit on their resource hex) ---
    lumberjack: {
      id: "lumberjack", name: "Lumberjack", kind: "extractor",
      terrain: "forest", workerTier: "peasant",
      output: { goodId: "wood", ratePerWorker: 1 },
      // EV3: starter — GOLD ONLY at level 1 (no resource cost).
      startUnlocked: true,
      workerSlots: 3, cost: { gold: 100 },
    },
    farm: {
      id: "farm", name: "Farm", kind: "extractor",
      terrain: "fertile", workerTier: "peasant",
      output: { goodId: "grain", ratePerWorker: 2 },
      // === TV2: wheat is a T2 resource unlocked by research (worker band of the
      // tree) yet still worked by peasants. researchBand overrides the tree lane
      // its unlock node lives in without changing who staffs it. GOLD ONLY. ===
      unlockedBy: "unlock_farm",
      workerSlots: 3, cost: { gold: 250 },
    },
    potato_farm: {
      id: "potato_farm", name: "Potato Farm", kind: "extractor",
      terrain: "fertile", workerTier: "peasant",
      output: { goodId: "potato", ratePerWorker: 2 },
      // EV3: starter food building — the basic peasant staple. GOLD ONLY.
      startUnlocked: true,
      workerSlots: 3, cost: { gold: 120 },
    },
    // === TV2: renamed from "miner"; sits on iron_deposit, worker-staffed T2 ===
    iron_mine: {
      id: "iron_mine", name: "Iron Mine", kind: "extractor",
      terrain: "iron_deposit", workerTier: "worker",
      output: { goodId: "iron", ratePerWorker: 1 },
      unlockedBy: "unlock_iron_mine",   // RT-A: per-building unlock node
      workerSlots: 3, cost: { wood: 25, stone: 15, gold: 90 },
    },
    quarry: {
      id: "quarry", name: "Quarry", kind: "extractor",
      terrain: "stone_deposit", workerTier: "peasant",   // === TV2: mountains → stone_deposit ===
      output: { goodId: "stone", ratePerWorker: 1 },
      // BAL: bootstrap stone source — wood only, so a wood-only city can build it
      // and start producing stone for everything else.
      unlockedBy: "unlock_quarry",   // RT-A: per-building unlock node
      workerSlots: 3, cost: { wood: 35, gold: 80 },
    },
    fishery: {
      id: "fishery", name: "Fishery", kind: "extractor",
      terrain: "fish", workerTier: "peasant",   // === TV2: sits ON the fish tile ===
      // === BALPW: 1 → 2 fish/worker. Fish is triple-purposed (peasant LUXURY +
      // worker BASIC + oil_maker input); at 1/worker a single 2-slot fishery
      // (~2 fish/tick) could not cover a city's peasant-luxury + worker-basic draw
      // once an oil_maker (2 fish/oil) was also pulling, so the WORKER fish basic
      // was chronically starved and worker happiness capped below 70. Matches the
      // 2/worker yield of the other staple extractors (potato_farm/farm). ===
      output: { goodId: "fish", ratePerWorker: 2 },
      unlockedBy: "unlock_fishery",   // RT-A: per-building unlock node
      workerSlots: 2, cost: { wood: 25, stone: 5, gold: 60 },
    },
    shepherd: {
      id: "shepherd", name: "Sheep Farm", kind: "extractor",
      terrain: "fertile", workerTier: "peasant",   // === TV2: meadow → fertile ===
      output: { goodId: "wool", ratePerWorker: 1 },
      unlockedBy: "unlock_shepherd",   // RT-A: per-building unlock node
      workerSlots: 2, cost: { wood: 20, stone: 5, gold: 60 },
    },
    // === TV2: new T2 deposit extractors (worker-staffed, sit on their deposit) ===
    clay_pit: {
      id: "clay_pit", name: "Clay Pit", kind: "extractor",
      terrain: "clay_deposit", workerTier: "worker",
      output: { goodId: "clay", ratePerWorker: 1 },
      unlockedBy: "unlock_clay_pit",
      workerSlots: 3, cost: { wood: 25, stone: 15, gold: 90 },
    },
    coal_mine: {
      id: "coal_mine", name: "Coal Mine", kind: "extractor",
      terrain: "coal_deposit", workerTier: "worker",
      output: { goodId: "coal", ratePerWorker: 1 },
      unlockedBy: "unlock_coal_mine",
      workerSlots: 3, cost: { wood: 30, stone: 20, gold: 120 },
    },
    gold_mine: {
      id: "gold_mine", name: "Gold Mine", kind: "extractor",
      terrain: "gold_deposit", workerTier: "worker",
      output: { goodId: "gold", ratePerWorker: 1 },
      unlockedBy: "unlock_gold_mine",
      workerSlots: 3, cost: { wood: 30, stone: 25, planks: 10, gold: 160 },
    },
    // --- processors (worker labour, any buildable town hex) ---
    sawmill: {
      id: "sawmill", name: "Sawmill", kind: "processor",
      terrain: null, workerTier: "peasant",
      inputs: { wood: 2 }, output: { goodId: "planks", ratePerWorker: 1 },
      // BAL: starter — the one basic processor, wood only so a fresh city can raise
      // it from its founding wood and start refining planks immediately.
      startUnlocked: true,
      workerSlots: 2, cost: { wood: 30, gold: 60 },
    },
    mill: {
      id: "mill", name: "Mill", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { grain: 2 }, output: { goodId: "flour", ratePerWorker: 1 },
      unlockedBy: "unlock_mill",   // RT-A: per-building unlock node
      workerSlots: 2, cost: { wood: 25, stone: 15, gold: 90 },
    },
    bakery: {
      id: "bakery", name: "Bakery", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { flour: 2 }, output: { goodId: "bread", ratePerWorker: 1 },
      unlockedBy: "unlock_bakery",   // RT-A: per-building unlock node
      workerSlots: 2, cost: { wood: 30, stone: 25, planks: 5, gold: 150 },
    },
    brewery: {
      id: "brewery", name: "Brewery", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { grain: 2 }, output: { goodId: "mead", ratePerWorker: 1 },   // === CC: beer → mead ===
      unlockedBy: "unlock_brewery",   // RT-A: per-building unlock node
      workerSlots: 2, cost: { wood: 25, stone: 15, gold: 100 },
    },
    // === CC: Smelter + Weaver RETIRED. Forge (wood+iron→iron_tool) replaces the
    // Smelter (citizen tier); Tailoring (wool→clothes) replaces the Weaver. ===
    // === TV2: new T2 processor — clay → bricks ===
    brickworks: {
      id: "brickworks", name: "Brickworks", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { clay: 2 }, output: { goodId: "bricks", ratePerWorker: 1 },
      unlockedBy: "unlock_brickworks",
      workerSlots: 2, cost: { wood: 25, stone: 20, gold: 110 },
    },
    // === CC: new WORKER-tier processors (any buildable town hex) ===
    tailoring: {
      id: "tailoring", name: "Tailoring", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { wool: 2 }, output: { goodId: "clothes", ratePerWorker: 1 },
      unlockedBy: "unlock_tailoring",
      workerSlots: 2, cost: { wood: 25, stone: 10, gold: 90 },
    },
    charcoal_burner: {
      id: "charcoal_burner", name: "Charcoal Burning", kind: "processor",
      // BAL2: coal is a WORKER BASIC need but had only worker-tier producers — a
      // bootstrap deadlock (no coal → no workers → no coal). Peasant-staffed,
      // research stays in the worker band (researchBand — the wheat-farm pattern).
      terrain: null, workerTier: "peasant", researchBand: "worker",
      // BAL2: 1:1 wood→coal — at 2:1 the burner out-ate the peasants' own
      // wood (their BASIC need) and crashed peasant happiness in playthroughs.
      inputs: { wood: 1 }, output: { goodId: "coal", ratePerWorker: 1 },
      unlockedBy: "unlock_charcoal_burner",
      workerSlots: 2, cost: { wood: 25, stone: 10, gold: 90 },
    },
    stonetool_maker: {
      id: "stonetool_maker", name: "StoneTools Maker", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { planks: 1, stone: 1 }, output: { goodId: "stone_tools", ratePerWorker: 1 },
      unlockedBy: "unlock_stonetool_maker",
      workerSlots: 2, cost: { wood: 30, stone: 15, gold: 110 },
    },
    oil_maker: {
      id: "oil_maker", name: "Oil Maker", kind: "processor",
      terrain: null, workerTier: "worker",
      inputs: { fish: 2 }, output: { goodId: "oil", ratePerWorker: 1 },
      unlockedBy: "unlock_oil_maker",
      workerSlots: 2, cost: { wood: 25, stone: 10, gold: 90 },
    },
    // === CC: new CITIZEN-tier (burgher) processors ===
    forge: {
      id: "forge", name: "Forge", kind: "processor",
      terrain: null, workerTier: "burgher",
      inputs: { wood: 1, iron: 1 }, output: { goodId: "iron_tool", ratePerWorker: 1 },
      unlockedBy: "unlock_forge",
      workerSlots: 2, cost: { wood: 30, stone: 25, gold: 160 },
    },
    armory: {
      id: "armory", name: "Armory", kind: "processor",
      terrain: null, workerTier: "burgher",
      inputs: { coal: 2, iron: 2 }, output: { goodId: "iron_armor", ratePerWorker: 1 },
      unlockedBy: "unlock_armory",
      workerSlots: 2, cost: { wood: 35, stone: 30, bricks: 10, gold: 220 },
    },
    pottery_workshop: {
      id: "pottery_workshop", name: "Pottery", kind: "processor",
      // === BALPV: pottery is a burgher EXTRA, an aristocrat BASIC, and a distillery
      // input (triple-purposed like lamp) — worker-staffed so the burgher growth gate
      // isn't self-locked; research stays in the burgher band via researchBand
      // (lamp_maker precedent). ===
      terrain: null, workerTier: "worker", researchBand: "burgher",
      inputs: { clay: 2 }, output: { goodId: "pottery", ratePerWorker: 1 },
      unlockedBy: "unlock_pottery_workshop",
      workerSlots: 2, cost: { wood: 30, stone: 20, bricks: 5, gold: 140 },
    },
    distillery: {
      id: "distillery", name: "Distillery", kind: "processor",
      terrain: null, workerTier: "burgher",
      inputs: { mead: 2, pottery: 1 }, output: { goodId: "brandy", ratePerWorker: 1 },
      unlockedBy: "unlock_distillery",
      workerSlots: 2, cost: { wood: 30, stone: 25, planks: 10, gold: 180 },
    },
    goldsmith: {
      id: "goldsmith", name: "Goldsmith", kind: "processor",
      terrain: null, workerTier: "burgher",
      inputs: { gold: 1, iron_tool: 1 }, output: { goodId: "gold_ring", ratePerWorker: 1 },
      unlockedBy: "unlock_goldsmith",
      workerSlots: 2, cost: { wood: 30, stone: 25, bricks: 10, gold: 200 },
    },
    lamp_maker: {
      id: "lamp_maker", name: "Lamp Maker", kind: "processor",
      // BAL2: lamps are a CITIZEN BASIC need — worker-staffed so citizens can
      // bootstrap; research stays in the citizen band via researchBand.
      terrain: null, workerTier: "worker", researchBand: "burgher",
      inputs: { oil: 2 }, output: { goodId: "lamp", ratePerWorker: 1 },
      unlockedBy: "unlock_lamp_maker",
      workerSlots: 2, cost: { wood: 30, stone: 20, gold: 150 },
    },
    carpentry: {
      id: "carpentry", name: "Carpentry", kind: "processor",
      // === BALPV: chairs are a burgher EXTRA, an aristocrat BASIC, a research material
      // (×4 nodes) and an aristocrat_home input — the most-demanded T3 good; worker-
      // staffed so the aristocrat gate doesn't hang on burgher-only supply. Research
      // stays in the burgher band via researchBand (lamp_maker precedent). ===
      terrain: null, workerTier: "worker", researchBand: "burgher",
      inputs: { planks: 2, oil: 1 }, output: { goodId: "chairs", ratePerWorker: 1 },
      unlockedBy: "unlock_carpentry",
      workerSlots: 2, cost: { wood: 35, stone: 20, planks: 10, gold: 180 },
    },
    luxury_tailor: {
      id: "luxury_tailor", name: "Luxury Tailor", kind: "processor",
      terrain: null, workerTier: "burgher",
      inputs: { clothes: 2, gold_ring: 1 }, output: { goodId: "luxury_clothes", ratePerWorker: 1 },
      unlockedBy: "unlock_luxury_tailor",
      workerSlots: 2, cost: { wood: 35, stone: 25, bricks: 10, gold: 240 },
    },
    // --- houses (no workers; add population capacity by tier) ---
    hut: {
      id: "hut", name: "Hut", kind: "house",
      // BAL: basic house shelters 2 at full happiness (pop = round(cap × happy%)).
      terrain: null, houseTier: "peasant", houseCapacity: 2,
      // EV3: starter — GOLD ONLY at level 1.
      startUnlocked: true,
      cost: { gold: 200 },
    },
    cottage: {
      id: "cottage", name: "Cottage", kind: "house",
      terrain: null, houseTier: "worker", houseCapacity: 3,
      unlockedBy: "unlock_cottage",   // RT-A: per-building unlock node
      // BAL2: NO bricks — bricks need worker-staffed producers, and workers need a
      // cottage first (construction-layer bootstrap deadlock). T1 materials only;
      // the manor + citizen-tier buildings keep their bricks components.
      cost: { wood: 30, stone: 20, planks: 5, gold: 90 },
    },
    manor: {
      id: "manor", name: "Manor", kind: "house",
      terrain: null, houseTier: "burgher", houseCapacity: 6,   // === BALPV: 4→6 — two manors must staff the 7 burgher-band T3 processors (2 slots each) ===
      unlockedBy: "unlock_manor",   // RT-A: per-building unlock node
      cost: { wood: 40, stone: 30, planks: 10, bricks: 10, gold: 220 },   // === TV2: bricks component ===
    },
    // === CC: aristocrat house — 1 slot (author), upgradable via the ladder. ===
    aristocrat_home: {
      id: "aristocrat_home", name: "Aristocrats Home", kind: "house",
      terrain: null, houseTier: "aristocrat", houseCapacity: 1,
      unlockedBy: "unlock_aristocrat_home",
      // === BALPV: dropped chairs:2 + gold_ring:1 — the new 100%-happiness victory
      // already forces the full T3 economy, so the FIRST home must be constructible in
      // a cold economy (no chicken-and-egg T3-in-build-cost gate). T1/T2 mats only. ===
      cost: { wood: 40, stone: 30, bricks: 20, gold: 400 },
    },
  },

  // Town-interior layout constants (GDD §4.1). slotCap is indexed by town level
  // (index 0 unused); every placed building — house or producer — takes a slot.
  town: {
    slotCap: [0, 8, 12, 17, 24], // EC-A→BAL2→BALPV: buildable slots by level 1..4 (L3+1/L4+4 fit a burgher quarter + aristocrat_home for the T3 victory; L1/L2 unchanged)
                                // (the center is separate → level 1 = 7 buildings + center).
    castle: { q: 0, r: 0 },     // PV2-A: the King's hub (map center). Not a city —
                                // it carries a footprint so cities keep a 1-hex gap.
    radius: 2,                  // (legacy) unused by Placement v2 — cities grow by
                                // contiguity now; kept so old saves/tuning don't break.
    baseWorkers: { peasants: 0 }, // 0 pop until a house is built (population comes only from housing).
    // EV3: per-city storage cap — a city holds at most this many of EACH good.
    // Enforced wherever stock increases (Sim production, trade delivery).
    storageCap: 80,
    // EV3: a new city starts with a little WOOD (a basic peasant need — firewood).
    // Starter buildings are now GOLD-only, so no wood is needed to build them.
    startStock: { wood: 20 },
    // EC-A money model: the Kingdom treasury pays the GOLD to found a city and
    // to lay roads/bridges (city resources pay building RESOURCE costs).
    foundCost: 1000,            // treasury gold to found a new city center
    roadCost: 5,                // treasury gold per road hex
    bridgeCost: { gold: 25, stone: 10 }, // road over water (GDD §6.4) — not yet
                                // placeable (water is not roadable), kept for wiring.
    // CB-A: construction logistics — a town moves at most this many units of
    // construction materials (from its own stock into buildings under
    // construction) per economy tick, shared across all its unbuilt buildings.
    deliveryRate: 5,
    // === PP-A === fleet sizing by town level (index = level; 0 unused). External
    // BUYERS a city may keep on the road at once = level*2 (L1 2 … L4 8). Internal
    // TRANSPORTERS multiply the construction/upgrade delivery budget (deliveryRate
    // × count) = level+3 (L4 7). Out-of-range levels fall back to the formula.
    externalTradersByLevel: [0, 2, 4, 6, 8],
    transportersByLevel:    [0, 4, 5, 6, 7],
    // Bounded per-town gold ledger: max samples of town.gold (one per Sim tick)
    // and of per-tick flow snapshots kept for the budget chart.
    ledgerHist: 600,
    // === /PP-A ===
  },
});

// bufferTarget lives under econ (existing key) — merge in place so we don't
// clobber baseTickMs or anything a sibling slice added.
Object.assign(CONFIG.econ, {
  bufferTarget: 2.0,   // "comfortable" stock = bufferTarget × demand (GDD §6.1)
  priceSmoothing: 0.10, // lerp factor toward the target price each tick
  minDemand: 0.5,      // demand floor so priceFor never divides by ~0
});

// Sim — pure, deterministic economy namespace. THIS SLICE OWNS ONLY priceFor;
// the production/consumption tick (Sim.tick) is T4's slice. Declared with a
// guard so whichever Phase-2 slice loads first creates the namespace and the
// other just adds to it (single-file, no module system).
var Sim = (typeof Sim !== "undefined" && Sim) || {};

// === TV2: mines & quarries whose output the "deep_veins" research boosts
// (mineOutput). Replaces the old hills/mountains terrain test now that those
// terrains are gone. Forest/fish extractors are deliberately excluded. ===
const MINE_TERRAINS = { stone_deposit: 1, iron_deposit: 1, gold_deposit: 1, coal_deposit: 1, clay_deposit: 1 };

// Local price of one good in one town from stock vs demand (GDD §6.1):
//   ratio = stock / (demand * bufferTarget)
//   target = clamp(basePrice * (1.6 - 0.8*ratio), basePrice*0.4, basePrice*3.0)
// then lerp the town's stored price 10%/tick toward the target (anti-jitter).
// Demand is read from town.demand[goodId] when the sim provides it (T4), else a
// small floor keeps this well-defined. First read (no stored price) snaps to the
// target; later reads move gradually. Mutates town.prices[goodId] and returns it.
Sim.priceFor = function (town, goodId) {
  const good = CONFIG.goods[goodId];
  if (!good) return 0;
  const base = good.basePrice;
  const buffer = CONFIG.econ.bufferTarget;

  const stock = (town.stock && town.stock[goodId]) || 0;
  const rawDemand = (town.demand && town.demand[goodId]);
  const demand = Math.max(CONFIG.econ.minDemand, rawDemand || 0);

  const ratio = stock / (demand * buffer);
  const target = Math.min(base * 3.0, Math.max(base * 0.4, base * (1.6 - 0.8 * ratio)));

  if (!town.prices) town.prices = {};
  const prev = town.prices[goodId];
  const next = (prev === undefined || prev === null)
    ? target                                        // first read: snap to target
    : prev + (target - prev) * CONFIG.econ.priceSmoothing; // else: 10%/tick lerp
  town.prices[goodId] = next;
  return next;
};
// === GOODS-PRICES END ===
