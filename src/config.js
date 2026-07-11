// Single source of truth for all balance/layout constants (GDD §9.1).
const CONFIG = {
  saveVersion: 2,
  // Biome mix is quantile-driven (see MapGen.generate): these are *target
  // fractions* of the board, so the map stays varied for any seed.
  map: {
    radius: 14, hexSize: 24, edgeFalloff: 0.55,
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
  mapPresets: {
    fertile: { label: "Fertile Land", radius: 14, water: { mode: "rim", frac: 0.18 }, mountainFrac: 0.05,
      groundMix: { fertile: 0.50, barren: 0.35, desert: 0.15 },
      forest: { patches: 6, size: [6, 14] }, snow: { mode: "pole", rows: 2 },
      deposits: { stone: { count: 3, ring: 0 }, clay: { count: 2, ring: 2 }, iron: { count: 2, ring: 6 }, coal: { count: 2, ring: 6 }, gold: { count: 1, ring: 8 },
                  fish: { count: 5, near: 6 } } },   // === TV2-FIX: ~4-6 shoals ===
    oasis: { label: "Oasis", radius: 14, water: { mode: "center", frac: 0.12 }, mountainFrac: 0.06,
      groundMix: { desert: 0.55, barren: 0.35, fertile: 0.10 },
      forest: { patches: 2, size: [3, 7] }, snow: { mode: "none" },
      deposits: { stone: { count: 2, ring: 0 }, clay: { count: 1, ring: 2 }, iron: { count: 2, ring: 5 }, coal: { count: 1, ring: 5 }, gold: { count: 1, ring: 7 },
                  fish: { count: 4, near: 6 } } },   // === TV2-FIX: ~3-5 shoals, in the central water ===
    big_world: { label: "Big World", radius: 18, water: { mode: "rim", frac: 0.15 }, mountainFrac: 0.07,
      groundMix: { fertile: 0.40, barren: 0.45, desert: 0.15 },
      forest: { patches: 8, size: [6, 16] }, snow: { mode: "pole", rows: 2 },
      // T1 near spawn, T2 pushed far out (bigger rings).
      deposits: { stone: { count: 3, ring: 0 }, clay: { count: 2, ring: 3 }, iron: { count: 3, ring: 9 }, coal: { count: 3, ring: 9 }, gold: { count: 2, ring: 12 },
                  fish: { count: 6, near: 8 } } },   // === TV2-FIX: ~5-8 shoals, some near the start rings ===
  },
  mapPresetDefault: "fertile",
  // === /TV2 map presets ===
  fog:    { castleReveal: 4, townReveal: 3 },
  camera: { minZoom: 0.32, maxZoom: 2.4, wheelStep: 1.12, panSpeed: 620 },
  econ:   { baseTickMs: 500 },
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
