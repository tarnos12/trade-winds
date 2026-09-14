// Single source of truth for all balance/layout constants (GDD §9.1).
const CONFIG = {
  saveVersion: 2,
  // Biome mix is quantile-driven (see MapGen.generate): these are *target
  // fractions* of the board, so the map stays varied for any seed.
  map: {
    radius: 14, hexSize: 24, edgeFalloff: 0.55,
    // The board is a RECTANGLE of pointy-top hexes, `width` columns × `height`
    // rows. The castle sits at axial (0,0) but is placed at a seeded, off-center
    // board position (not the middle) — see MapGen; `castleMargin` keeps it this
    // many hexes clear of the board edge so it always has a buildable ring.
    rect: { width: 50, height: 25 },
    castleMargin: 2,
    // === Deposit tiering by distance from the castle ===  Every ore good has a
    // TIER; a tier is a [min,max] DISTANCE BAND expressed as a fraction of the
    // castle's distance to the farthest map hex. T1 may spawn anywhere, T2
    // mid-to-far, T3 far. Terrain resources (fertile/forest/fish/water) are T1 by
    // nature — they follow normal biome generation. A preset may bend the rule for
    // a good via `deposits.<good>.band = [lo,hi]` (e.g. Highlands pulls ore inward).
    depositTiers: { stone: 1, clay: 2, coal: 2, iron: 3, gold: 3 },
    depositBands: { 1: [0.0, 1.0], 2: [0.33, 1.0], 3: [0.66, 1.0] },
    // === Resource DENSITY (v0.47) ===  How many deposit CLUSTERS of EACH ore type
    // (stone, clay, iron, coal, gold) spawn on the map. The Custom "resources" axis
    // and each preset's declared resources tier pick a level; a healthy minimum of
    // 3 of every type is always guaranteed so no map is starved of (e.g.) gold.
    depositDensity: { low: 3, normal: 6, high: 10 },
    // === v0.43 MapGen overhaul ===
    // PATCH PARADIGM: the background/filler biomes (barren/desert/snow, plus
    // water/mountains) fill MOST of the map; fertile & forest appear as discrete
    // PATCHES grown in a mix of sizes. Net effect: far less continuous grass.
    // patchSizes = named size buckets a patch is drawn from (mostly medium).
    patchSizes: { small: [1, 3], medium: [4, 7], big: [8, 12] },
    // Deposit terrain AFFINITY (layered ON TOP of the distance-tier bands): a
    // deposit prefers seed hexes whose neighbourhood contains one of these
    // terrains (falls back to the plain in-band pool when none match). Clay hugs
    // water; the metals/stone favour rocky barren/mountain country.
    // (v0.47) Metals hug the mountain RANGES — iron & gold spawn against mountains,
    // so ore reads as coming out of the ranges; stone & coal prefer mountains but
    // accept barren too, so they are SOMETIMES found away from the peaks. Clay hugs
    // water. When no in-band hex matches, generation falls back to the plain pool.
    depositAffinity: { clay: ["water"], stone: ["mountains", "barren"],
      iron: ["mountains"], gold: ["mountains"], coal: ["mountains", "barren"] },
    // LAKES: inland water blobs (separate from the rim/center SEA which the Sea
    // Level axis controls). COUNT keyed by a preset's `lakes` LEVEL string; SIZE
    // range per blob. Placed on land, kept clear of the immediate castle core.
    lakes: { none: 0, low: 2, normal: 4, many: 8 }, lakeSize: [4, 10],
    // RIVERS: winding water lines that descend elevation from a high inland point
    // toward the sea / a lake / the board edge. COUNT keyed by a preset's `rivers`
    // LEVEL string; WIDTH varies within this range along each course.
    rivers: { none: 0, few: 1, normal: 3, many: 5 }, riverWidth: [1, 5],
    frac: { water: 0.30, mountains: 0.07, hills: 0.11,     // legacy — unused by TV2 MapGen v2
            forest: 0.28, fertile: 0.20, wasteland: 0.16 }, //  (kept so old refs don't crash)
  },
  // === TV2 map presets ===  chosen on the start screen; persisted in the save.
  // radius: board size · water.mode rim|center|none + frac · mountainFrac ·
  // groundMix: fractions of the generic ground (barren/desert/fertile) grown as
  // clumps · forest.patches/size · snow.mode pole|none (+rows) · deposits: per
  // type { count, ring } where ring is the MIN hex-distance from the castle so
  // T2 (iron/gold/coal/clay) spawns further out than T1 (stone). Numbers are
  // tunable; MapGen v2 reads them (no hard-coded balance).
  // === TV2-FIX: deposits.fish = { count, near } — fish shoals are WATER tiles
  // adjacent to buildable land (so a shore city can reach them). `count` =
  // shoal clusters (1–3 tiles each); `near` biases the FIRST shoal to within
  // that hex-distance of the castle. Fish is a T1 resource: NO ring (exempt
  // from the T2 push-out) and never far from spawn. ===
  // Each preset also carries an explicit `rect` (board size) and a `tiers` block
  // naming its identity on the 6 Custom-Map axes (Fertility / World Age / Climate
  // / Sea Level / Resources / Size). The `tiers` block is UI metadata only — it
  // pre-fills the Custom panel when a player derives a custom world from this
  // preset; MapGen ignores it for a plain preset generate. Retuned so the five
  // worlds read as VISUALLY DISTINCT: lush-green Fertile, desert Oasis, barren
  // giant Big World, rugged snowy Highlands, and watery Isles.
  mapPresets: {
    fertile: { label: "Fertile Land", radius: 14, rect: { width: 50, height: 25 },
      tiers: { fertility: "lush", worldAge: "normal", climate: "temperate", seaLevel: "normal", resources: "normal", size: "normal", lakes: "normal", rivers: "normal" },
      water: { mode: "rim", frac: 0.18 }, mountainFrac: 0.06,
      lakes: "normal", rivers: "normal",   // === v0.43: temperate, well-watered ===
      groundMix: { fertile: 0.64, barren: 0.23, desert: 0.13 },   // v0.43: fertile share drives PATCH coverage (scaled down); barren/desert are the filler background
      forest: { patches: 9, size: [8, 16] }, snow: { mode: "pole", rows: 2 },
      deposits: { stone: { count: 3, ring: 0 }, clay: { count: 2, ring: 2 }, iron: { count: 2, ring: 6 }, coal: { count: 2, ring: 6 }, gold: { count: 1, ring: 8 },
                  fish: { count: 5, near: 6 } } },   // === TV2-FIX: ~4-6 shoals ===
    oasis: { label: "Oasis", radius: 14, rect: { width: 50, height: 25 },
      tiers: { fertility: "arid", worldAge: "normal", climate: "warm", seaLevel: "low", resources: "scarce", size: "normal", lakes: "low", rivers: "few" },
      water: { mode: "center", frac: 0.12 }, mountainFrac: 0.05,
      lakes: "low", rivers: "few",   // === v0.43: arid — a couple of oasis pools, a trickle of wadis ===
      groundMix: { desert: 0.55, barren: 0.35, fertile: 0.10 },   // sand sea (filler) + a central lake, sparse green patches
      forest: { patches: 2, size: [3, 7] }, snow: { mode: "none" },
      deposits: { stone: { count: 2, ring: 0 }, clay: { count: 1, ring: 2 }, iron: { count: 2, ring: 5 }, coal: { count: 1, ring: 5 }, gold: { count: 1, ring: 7 },
                  fish: { count: 4, near: 6 } } },   // === TV2-FIX: ~3-5 shoals, in the central water ===
    big_world: { label: "Big World", radius: 18, rect: { width: 66, height: 33 },
      tiers: { fertility: "normal", worldAge: "normal", climate: "temperate", seaLevel: "normal", resources: "rich", size: "large", lakes: "normal", rivers: "normal" },
      water: { mode: "rim", frac: 0.16 }, mountainFrac: 0.07,
      lakes: "normal", rivers: "normal",   // === v0.43: a big continent with several lakes and rivers ===
      groundMix: { barren: 0.52, fertile: 0.28, desert: 0.20 },   // vast barren frontier (filler) — clearly NOT the green Fertile map
      forest: { patches: 11, size: [6, 16] }, snow: { mode: "pole", rows: 3 },
      // T1 near spawn, T2 pushed far out (bigger rings) on the big board.
      deposits: { stone: { count: 3, ring: 0 }, clay: { count: 2, ring: 3 }, iron: { count: 3, ring: 9 }, coal: { count: 3, ring: 9 }, gold: { count: 2, ring: 12 },
                  fish: { count: 6, near: 8 } } },   // === TV2-FIX: ~5-8 shoals, some near the start rings ===
    highlands: { label: "Highlands", radius: 14, rect: { width: 50, height: 25 },
      tiers: { fertility: "normal", worldAge: "young", climate: "cold", seaLevel: "low", resources: "rich", size: "normal", lakes: "low", rivers: "few" },
      water: { mode: "rim", frac: 0.10 }, mountainFrac: 0.13,   // rugged: near the 0.14 hard cap
      lakes: "low", rivers: "few",   // === v0.43: rugged uplands — few tarns, a couple of mountain streams ===
      groundMix: { barren: 0.52, fertile: 0.34, desert: 0.14 },   // rocky uplands (barren filler), green valley patches, little sand
      forest: { patches: 6, size: [5, 12] }, snow: { mode: "pole", rows: 4 },   // cold: wide snow band
      // Mining world: ore-rich, and it BENDS the global tier bands (presets-may-
      // override) to pull coal/iron inward so ore is reachable earlier; gold still
      // keeps the far T3 band. `band` = [minFrac, maxFrac] of castle→farthest-hex.
      deposits: { stone: { count: 4 }, clay: { count: 2 }, iron: { count: 4, band: [0.4, 1.0] }, coal: { count: 4, band: [0.2, 1.0] }, gold: { count: 2 },
                  fish: { count: 3, near: 6 } } },
    isles: { label: "Isles", radius: 14, rect: { width: 50, height: 25 },
      tiers: { fertility: "lush", worldAge: "old", climate: "temperate", seaLevel: "high", resources: "normal", size: "normal", lakes: "many", rivers: "many" },
      water: { mode: "rim", frac: 0.42 }, mountainFrac: 0.02,   // archipelago: high rim water breaks the land into islands; worn-flat (few mountains)
      lakes: "many", rivers: "many",   // === v0.43: watery world — lots of inland pools and streams too ===
      groundMix: { fertile: 0.58, barren: 0.27, desert: 0.15 },   // green isle patches on a barren/desert filler base
      forest: { patches: 7, size: [5, 12] }, snow: { mode: "none" },   // temperate ocean world — the top rows are sea, so no snow band
      // fewer land deposits (small islands), lots of fish. ensureCastleConnected
      // guarantees the castle island still reaches the mainland by a carved bridge.
      deposits: { stone: { count: 3, ring: 0 }, clay: { count: 2, ring: 2 }, iron: { count: 2, ring: 4 }, coal: { count: 2, ring: 4 }, gold: { count: 1, ring: 6 },
                  fish: { count: 8, near: 5 } } },
  },
  mapPresetDefault: "fertile",
  // === Custom-Map tier tables ===  Six independent axes; the MIDDLE option of
  // each is the baseline (≈ the Fertile preset). MapGen.applyTiers(base, sel)
  // layers a selection onto any base preset to build a resolved preset. Order of
  // keys here is the order the Custom panel renders the dropdowns.
  // Guardrails enforced in applyTiers: mountainFrac <= 0.14, forest.patches >= 2,
  // groundMix.fertile >= 20% of the mix (always some green contrast).
  mapTiers: {
    fertility: { label: "Fertility", default: "normal", options: [
      { id: "lush",   label: "Lush",   groundMix: { fertile: 0.65, barren: 0.22, desert: 0.13 }, forestPatchMul: 1.5, forestSize: [8, 16] },
      { id: "normal", label: "Normal", groundMix: { fertile: 0.45, barren: 0.35, desert: 0.20 }, forestPatchMul: 1.0, forestSize: [6, 14] },
      { id: "arid",   label: "Arid",   groundMix: { fertile: 0.20, barren: 0.40, desert: 0.40 }, forestPatchMul: 0.4, forestSize: [4, 9] },
    ] },
    worldAge: { label: "World Age", default: "normal", options: [
      { id: "young",  label: "Young",  mountainFrac: 0.12 },
      { id: "normal", label: "Normal", mountainFrac: 0.06 },
      { id: "old",    label: "Old",    mountainFrac: 0.02 },
    ] },
    climate: { label: "Climate", default: "temperate", options: [
      { id: "cold",      label: "Cold",      snow: { mode: "pole", rows: 4 }, desertToBarren: true },
      { id: "temperate", label: "Temperate", snow: { mode: "pole", rows: 2 } },
      { id: "warm",      label: "Warm",      snow: { mode: "none" }, desertAdd: 0.05 },
    ] },
    seaLevel: { label: "Sea Level", default: "normal", options: [
      { id: "low",    label: "Low",    waterFrac: 0.10 },
      { id: "normal", label: "Normal", waterFrac: 0.18 },
      { id: "high",   label: "High",   waterFrac: 0.30 },
    ] },
    // (v0.47) `density` = clusters of EACH ore type (see CONFIG.map.depositDensity):
    // Low 3 · Normal 6 · High 10. ringMul still nudges how far ore sits from spawn.
    resources: { label: "Resources", default: "normal", options: [
      { id: "scarce", label: "Low (3)",    density: "low",    ringMul: 1.2 },
      { id: "normal", label: "Normal (6)", density: "normal", ringMul: 1.0 },
      { id: "rich",   label: "High (10)",  density: "high",   ringMul: 0.8 },
    ] },
    size: { label: "Size", default: "normal", options: [
      { id: "small",  label: "Small",  rect: { width: 36, height: 18 } },
      { id: "normal", label: "Normal", rect: { width: 50, height: 25 } },
      { id: "large",  label: "Large",  rect: { width: 66, height: 33 } },
    ] },
    // === v0.43: two NEW water-feature axes. Each option just names a LEVEL
    // string that applyTiers writes onto the resolved preset (p.lakes / p.rivers);
    // MapGen.generate maps the level to a count via CONFIG.map.lakes / .rivers. ===
    lakes: { label: "Lakes", default: "low", options: [
      { id: "none",   label: "None",   lakes: "none"   },
      { id: "low",    label: "Few",    lakes: "low"    },
      { id: "normal", label: "Normal", lakes: "normal" },
      { id: "many",   label: "Many",   lakes: "many"   },
    ] },
    rivers: { label: "Rivers", default: "few", options: [
      { id: "none",   label: "None",   rivers: "none"   },
      { id: "few",    label: "Few",    rivers: "few"    },
      { id: "normal", label: "Normal", rivers: "normal" },
      { id: "many",   label: "Many",   rivers: "many"   },
    ] },
  },
  mapTiersDefault: { fertility: "normal", worldAge: "normal", climate: "temperate", seaLevel: "normal", resources: "normal", size: "normal", lakes: "low", rivers: "few" },
  // === /TV2 map presets ===
  // === v0.43: fog reveal at NEW-GAME scales with board size (startReveal), so a
  // big board still opens with a workable viewport. `castleReveal` is the legacy
  // fallback (used if a map carries no size-derived radius). townReveal unchanged.
  fog:    { castleReveal: 4, townReveal: 3, startReveal: { small: 10, normal: 15, large: 20 } },
  camera: { minZoom: 0.32, maxZoom: 2.4, wheelStep: 1.12, panSpeed: 620 },
  econ:   { baseTickMs: 500,
    // === Bulk production (v0.39): a producing building banks its output and
    // releases it in WHOLE units every N game-seconds instead of trickling a
    // fraction every tick. Throughput is unchanged (a batch ≈ rate × interval),
    // and the fractional remainder carries into the next batch so nothing is
    // lost. Keyed by building `kind`; a kind not listed here releases whatever
    // whole units have accumulated every tick (interval 0). 2 ticks = 1s. ===
    productionIntervalSec: { extractor: 8, processor: 12 } },
  // === TV2 terrain set ===
  // buildable = a generic processor/house/road/town-center may sit here.
  // road      = a road segment may cross this hex (traders/pathing).
  // houseOnly = buildable, but ONLY house-kind buildings (e.g. snow).
  // deposit   = a resource tile: buildable:false so the generic branch rejects
  //             everything, while the extractor-on-terrain branch still lets the
  //             ONE matching extractor sit on it (see canPlaceBuilding).
  terrain: {
    // --- generic buildable ground (any processor/house; extractors only on their own terrain) ---
    barren:        { color: "#b9a679", buildable: true,  road: true  }, // Barren Land (tan)
    desert:        { color: "#d9c27a", buildable: true,  road: true  }, // Desert (sand-yellow)
    fertile:       { color: "#7fa64b", buildable: true,  road: true  }, // Fertile Soil / grassland (green) — farm/shepherd terrain
    // --- houses only ---
    snow:          { color: "#dbe6ef", buildable: true,  road: true,  houseOnly: true }, // Iceland (white-blue)
    // --- obstacles ---
    water:         { color: "#3f6079", buildable: false, road: false }, // future harbor
    mountains:     { color: "#877f77", buildable: false, road: false }, // obstacle: blocks build + road + pathing
    // --- resource tiles (buildable:false → ONLY the matching extractor may sit here) ---
    fish:          { color: "#4d7fa0", buildable: false, road: false, deposit: "fish"          }, // fishery sits ON it
    forest:        { color: "#4d7738", buildable: false, road: true,  deposit: "forest"        }, // lumberjack only  (T1)
    stone_deposit: { color: "#9aa0a6", buildable: false, road: true,  deposit: "stone_deposit" }, // quarry only      (T1)
    clay_deposit:  { color: "#c98a5a", buildable: false, road: true,  deposit: "clay_deposit"  }, // clay_pit only    (T2)
    iron_deposit:  { color: "#8f6f6a", buildable: false, road: true,  deposit: "iron_deposit"  }, // iron_mine only   (T2)
    gold_deposit:  { color: "#d8b93f", buildable: false, road: true,  deposit: "gold_deposit"  }, // gold_mine only   (T2)
    coal_deposit:  { color: "#4b4a4d", buildable: false, road: true,  deposit: "coal_deposit"  }, // coal_mine only   (T2)
  },
  // === /TV2 terrain set ===
  fogColor: "#1b1710",
};
