// Value-noise field with fractal Brownian motion (GDD §9.1: noise → biomes).
function makeValueNoise(seed) {
  function hash(ix, iy) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const smooth = t => t * t * (3 - 2 * t);
  function noise2(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const n00 = hash(x0, y0), n10 = hash(x0 + 1, y0);
    const n01 = hash(x0, y0 + 1), n11 = hash(x0 + 1, y0 + 1);
    const ix0 = n00 + (n10 - n00) * sx;
    const ix1 = n01 + (n11 - n01) * sx;
    return ix0 + (ix1 - ix0) * sy;
  }
  return function fbm(x, y, octaves) {
    octaves = octaves || 4;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

// Deterministic seeded map generation (GDD §3).
// === TV2 MapGen v2 =========================================================
// Preset-driven, seeded, deterministic generation with CLUMPED terrain (seeded
// patch growth, not per-hex noise) and distance-ringed deposits (T2 further from
// the castle than T1). A post-gen playability repair guarantees a viable start
// (fertile + forest near spawn). Same (seed, preset) ⇒ identical map.
const MapGen = {
  quantile(sortedAsc, f) {
    if (sortedAsc.length === 0) return 0;
    const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(f * (sortedAsc.length - 1))));
    return sortedAsc[i];
  },
  parseKey(k) { const i = k.indexOf(","); return { q: +k.slice(0, i), r: +k.slice(i + 1) }; },
  // Deterministic seeded blob growth. startKey grows outward through neighbours
  // that pass canTake, up to `size` hexes; each accepted hex is assign()'d.
  // Frontier index is drawn from `rng` so growth is seeded but reproducible.
  growPatch(hexes, startKey, size, canTake, assign, rng) {
    const taken = new Set();
    if (!hexes.has(startKey) || !canTake(startKey)) return taken;
    const frontier = [startKey];
    while (taken.size < size && frontier.length) {
      const i = Math.floor(rng() * frontier.length);
      const key = frontier.splice(i, 1)[0];
      if (taken.has(key) || !canTake(key)) continue;
      taken.add(key); assign(key);
      const { q, r } = MapGen.parseKey(key);
      for (const n of HexMath.neighbors(q, r)) {
        const nk = HexMath.key(n.q, n.r);
        if (hexes.has(nk) && !taken.has(nk) && canTake(nk)) frontier.push(nk);
      }
    }
    return taken;
  },
  // === Custom-Map tier resolution ===  Deep-clone `basePreset` and layer the
  // selected tier options (CONFIG.mapTiers) onto it, returning a NEW resolved
  // preset object. Pure + deterministic (no rng): a given (base, selection)
  // always yields the same preset, so generate() stays reproducible. `sel` is a
  // { fertility, worldAge, climate, seaLevel, resources, size } map of option
  // ids (missing axes fall back to each axis's `default`). Guardrails keep every
  // combo playable: mountainFrac <= 0.14, forest.patches >= 2, and the ground
  // mix keeps >= 20% fertile so there's always some green contrast.
  applyTiers(basePreset, sel) {
    const T = (CONFIG.mapTiers) || {};
    const base = basePreset || (CONFIG.mapPresets && CONFIG.mapPresets[CONFIG.mapPresetDefault]) || {};
    const p = JSON.parse(JSON.stringify(base));   // deep clone; JSON-safe preset shapes only
    sel = sel || {};
    const optFor = (axis) => {
      const ax = T[axis]; if (!ax || !ax.options) return null;
      const want = sel[axis] || ax.default;
      return ax.options.find(o => o.id === want) || ax.options.find(o => o.id === ax.default) || null;
    };
    // --- Size (rect board dims + a proportional radius for deposit inner-band math) ---
    const sz = optFor("size");
    if (sz && sz.rect) {
      p.rect = { width: sz.rect.width | 0, height: sz.rect.height | 0 };
      p.radius = Math.max(6, Math.round(p.rect.width * 0.28));   // 36->10, 50->14, 66->18
    }
    // --- Fertility (ground mix + forest density/size) ---
    const fert = optFor("fertility");
    if (fert) {
      if (fert.groundMix) p.groundMix = Object.assign({}, fert.groundMix);
      p.forest = p.forest || { patches: 6, size: [6, 14] };
      if (fert.forestSize) p.forest.size = fert.forestSize.slice();
      const basePatches = (base.forest && base.forest.patches) || 6;   // multiplier is over the BASE preset's patch count
      p.forest.patches = Math.round(basePatches * (fert.forestPatchMul != null ? fert.forestPatchMul : 1));
    }
    // --- World Age (mountainFrac) ---
    const age = optFor("worldAge");
    if (age && age.mountainFrac != null) p.mountainFrac = age.mountainFrac;
    // --- Climate (snow band + desert<->barren shifts) ---
    const clim = optFor("climate");
    if (clim) {
      if (clim.snow) p.snow = Object.assign({}, clim.snow);
      p.groundMix = p.groundMix || {};
      if (clim.desertToBarren) {   // Cold: freeze the desert share into barren
        p.groundMix.barren = (p.groundMix.barren || 0) + (p.groundMix.desert || 0);
        p.groundMix.desert = 0;
      }
      if (clim.desertAdd) p.groundMix.desert = (p.groundMix.desert || 0) + clim.desertAdd;   // Warm: a little more sand
    }
    // --- Sea Level (water fraction; keeps the base water MODE; inert if none) ---
    const sea = optFor("seaLevel");
    p.water = p.water || { mode: "rim", frac: 0 };
    if (sea && sea.waterFrac != null && p.water.mode !== "none") p.water.frac = sea.waterFrac;
    // --- Resources (deposit count/ring multipliers) ---
    const res = optFor("resources");
    if (res && p.deposits) {
      const cm = res.countMul != null ? res.countMul : 1;
      const rm = res.ringMul != null ? res.ringMul : 1;
      for (const k of Object.keys(p.deposits)) {
        const d = p.deposits[k]; if (!d) continue;
        if (d.count != null) d.count = Math.max(1, Math.round(d.count * cm));   // min 1 so every type still spawns
        if (d.ring) d.ring = Math.round(d.ring * rm);
        if (d.near) d.near = Math.round(d.near * rm);
      }
    }
    // --- Guardrails (keep every combo playable) ---
    p.mountainFrac = Math.min(0.14, Math.max(0, p.mountainFrac || 0));   // hard cap: mountains can wall off far deposits
    p.forest = p.forest || { patches: 2, size: [4, 8] };
    p.forest.patches = Math.max(2, p.forest.patches | 0);               // always >= 2 forest patches
    p.groundMix = p.groundMix || { fertile: 0.2, barren: 0.4, desert: 0.4 };
    { // fertile floor: at least 20% of the mix, so there is always green contrast
      const g = p.groundMix;
      const f = g.fertile || 0, rest = (g.barren || 0) + (g.desert || 0), sum = f + rest;
      if (sum > 0 && f / sum < 0.20) g.fertile = 0.20 * rest / 0.80;    // -> fertile is exactly 20% of the new sum
    }
    // --- Deposit-crowding clamp (Large x Rich / Small x Rich safety valve) ---
    if (p.deposits) {
      const land = ((p.rect && p.rect.width) || 50) * ((p.rect && p.rect.height) || 25);
      const landKeys = ["stone", "clay", "iron", "coal", "gold"];
      let clusters = 0; for (const k of landKeys) if (p.deposits[k]) clusters += p.deposits[k].count || 0;
      const cap = Math.floor(land * 0.06 / 3);   // ~6% of the board as deposit tiles (avg cluster ~3)
      if (clusters > cap && cap > 0) {
        const scale = cap / clusters;
        for (const k of landKeys) { const d = p.deposits[k]; if (d && d.count) d.count = Math.max(1, Math.round(d.count * scale)); }
      }
    }
    return p;
  },
  // Returns { seed, radius, preset, hexes: Map<key, hex> }.
  // === Custom map: pass presetId "custom" (or any `tiers` object carrying a
  // `base`) plus a `tiers` selection; the resolved preset is built via applyTiers
  // and the stream stays deterministic (same seed + tiers => identical map). ===
  generate(seedInput, radius, presetId, tiers) {
    presetId = presetId || (CONFIG.mapPresetDefault || "fertile");
    let preset;
    if (tiers && typeof tiers === "object" && (presetId === "custom" || tiers.base)) {
      const baseId = (tiers.base && CONFIG.mapPresets && CONFIG.mapPresets[tiers.base]) ? tiers.base
        : ((CONFIG.mapPresets && CONFIG.mapPresets[presetId]) ? presetId : (CONFIG.mapPresetDefault || "fertile"));
      preset = MapGen.applyTiers((CONFIG.mapPresets && CONFIG.mapPresets[baseId]) || {}, tiers);
      presetId = "custom";
    } else {
      preset = (CONFIG.mapPresets && CONFIG.mapPresets[presetId]) ||
               (CONFIG.mapPresets && CONFIG.mapPresets[CONFIG.mapPresetDefault]) || {};
    }
    radius = radius || preset.radius || CONFIG.map.radius;
    const seed = hashSeed(seedInput);
    // Single seeded stream (seed ^ presetId) consumed in a FIXED order below.
    // For custom maps presetId is the constant "custom" — the tiers change the
    // number of draws deterministically, so same (seed, tiers) => same map.
    const rng = mulberry32((hashSeed(seedInput) ^ hashSeed(presetId)) | 0);
    const elevN = makeValueNoise(seed);

    // ---- build the grid; sample elevation for water/mountain shaping ----
    // RECTANGLE shape: `width` columns × `height` rows of pointy-top hexes. The
    // castle sits at axial (0,0), but it is placed at a seeded OFF-CENTER board
    // position (not the middle): we pick a board cell (castleCol,castleRow),
    // kept `castleMargin` clear of the edges, and generate the grid so THAT cell
    // maps to axial (0,0). Each row shifts its axial q by -floor(row/2) so the
    // rows stack into a true screen-space rectangle. Water falloff is keyed to the
    // BOARD centre (island rims hug the board edge, not the castle) and snow to the
    // board's top row, while deposits / spawn / connectivity use the castle (0,0).
    const hexes = new Map();
    const waterMode = (preset.water && preset.water.mode) || "rim";
    const waterFrac = (preset.water && preset.water.frac) || 0;
    const rect = preset.rect || CONFIG.map.rect || { width: 50, height: 25 };
    const W = Math.max(3, rect.width | 0), H = Math.max(3, rect.height | 0);
    const halfW = Math.floor(W / 2), halfH = Math.floor(H / 2);
    const margin = Math.max(0, Math.min((CONFIG.map.castleMargin | 0) || 0, Math.floor(Math.min(W, H) / 2) - 1));
    const castleCol = margin + Math.floor(rng() * (W - 2 * margin));   // seeded, drawn first in the stream
    const castleRow = margin + Math.floor(rng() * (H - 2 * margin));
    const bcCol = (W - 1) / 2, bcRow = (H - 1) / 2;   // board centre (water falloff reference)
    for (let br = 0; br < H; br++) {
      const arow = br - castleRow;
      for (let bc = 0; bc < W; bc++) {
        const q = (bc - castleCol) - Math.floor(arow / 2), r = arow;
        // rim mode sinks the border (island); center mode (oasis) sinks the middle.
        const nx = halfW ? (bc - bcCol) / halfW : 0, ny = halfH ? (br - bcRow) / halfH : 0;
        const d = Math.min(1, Math.max(Math.abs(nx), Math.abs(ny)));
        let falloff = 0;
        if (waterMode === "rim") falloff = d * d * CONFIG.map.edgeFalloff;
        else if (waterMode === "center") falloff = (1 - d) * (1 - d) * CONFIG.map.edgeFalloff;
        const elev = elevN(q * 0.11 + 100, r * 0.11 + 100, 4) - falloff;
        hexes.set(HexMath.key(q, r), { q, r, terrain: null, elevation: elev, revealed: false });
      }
    }
    const topRow = -castleRow;   // northmost axial row (board row 0) — used by the snow pole below
    const all = Array.from(hexes.values());   // deterministic insertion order
    let castleMaxDist = 0;   // castle → farthest hex, the reference for deposit distance bands
    for (const h of all) { const dd = HexMath.dist(0, 0, h.q, h.r); if (dd > castleMaxDist) castleMaxDist = dd; }

    // ---- (1) water by elevation quantile ----
    if (waterFrac > 0) {
      const elevs = all.map(h => h.elevation).sort((a, b) => a - b);
      const seaT = MapGen.quantile(elevs, waterFrac);
      for (const h of all) if (h.elevation < seaT) h.terrain = "water";
    }
    // ---- (2) mountains: highest land by elevation ----
    const mtnFrac = preset.mountainFrac || 0;
    if (mtnFrac > 0) {
      const landElevs = all.filter(h => h.terrain === null).map(h => h.elevation).sort((a, b) => a - b);
      const mtnT = MapGen.quantile(landElevs, 1 - mtnFrac);
      for (const h of all) if (h.terrain === null && h.elevation >= mtnT) h.terrain = "mountains";
    }

    // ---- (3) base ground blobs (barren / desert / fertile) via patch growth ----
    const mix = preset.groundMix || { fertile: 0.5, barren: 0.35, desert: 0.15 };
    const mixKeys = Object.keys(mix);
    let mixTotal = 0; for (const k of mixKeys) mixTotal += mix[k];
    const pickGround = () => {
      let x = rng() * mixTotal;
      for (const k of mixKeys) { x -= mix[k]; if (x <= 0) return k; }
      return mixKeys[mixKeys.length - 1];
    };
    const isGroundless = k => hexes.get(k).terrain === null;
    for (const h of all) {
      const k = HexMath.key(h.q, h.r);
      if (h.terrain !== null) continue;
      const type = pickGround();
      const size = 8 + Math.floor(rng() * 11);   // 8..18 — coherent clumps
      MapGen.growPatch(hexes, k, size, isGroundless, (kk) => { hexes.get(kk).terrain = type; }, rng);
    }

    // ---- (4) forest patches on generic ground ----
    const fCfg = preset.forest || { patches: 0, size: [4, 8] };
    const groundSet = { barren: 1, desert: 1, fertile: 1 };
    const groundKeys = () => all.filter(h => groundSet[h.terrain]).map(h => HexMath.key(h.q, h.r));
    for (let i = 0; i < (fCfg.patches || 0); i++) {
      const pool = groundKeys();
      if (!pool.length) break;
      const start = pool[Math.floor(rng() * pool.length)];
      const size = fCfg.size[0] + Math.floor(rng() * (fCfg.size[1] - fCfg.size[0] + 1));
      MapGen.growPatch(hexes, start, size, k => groundSet[hexes.get(k).terrain], (kk) => { hexes.get(kk).terrain = "forest"; }, rng);
    }

    // ---- (5) deposit clusters (distance-BANDED by tier) ----
    // Each ore good spawns within a [minFrac, maxFrac] DISTANCE BAND from the
    // castle, expressed as a fraction of castleMaxDist (castle → farthest hex).
    // Band = the preset's per-good override (`deposits.<good>.band`) else the
    // global tier band (CONFIG.map.depositBands[CONFIG.map.depositTiers[good]]).
    // T1 (stone) [0,1] = anywhere; T2 (clay/coal) [0.33,1]; T3 (iron/gold) [0.66,1].
    // If the castle is near an edge the band is clipped by the board — if no
    // in-band depositable hex remains for a placement, we relax the min to 0
    // (keeping the outer bound) so every configured deposit still spawns.
    const DEP_TERRAIN = { stone: "stone_deposit", clay: "clay_deposit", iron: "iron_deposit", coal: "coal_deposit", gold: "gold_deposit" };
    const depositable = { barren: 1, desert: 1, fertile: 1, forest: 1 };
    const deps = preset.deposits || {};
    const TIERS = (CONFIG.map && CONFIG.map.depositTiers) || {};
    const BANDS = (CONFIG.map && CONFIG.map.depositBands) || {};
    const distOf = (k) => { const p = MapGen.parseKey(k); return HexMath.dist(0, 0, p.q, p.r); };
    for (const type of ["stone", "clay", "iron", "coal", "gold"]) {   // fixed order ⇒ reproducible rng
      const cfg = deps[type]; if (!cfg) continue;
      const terr = DEP_TERRAIN[type];
      const band = Array.isArray(cfg.band) ? cfg.band : (BANDS[TIERS[type] || 1] || [0, 1]);
      const lo = Math.round((band[0] || 0) * castleMaxDist);
      const hi = Math.round((band[1] != null ? band[1] : 1) * castleMaxDist);
      const inBand    = (k) => depositable[hexes.get(k).terrain] && distOf(k) >= lo && distOf(k) <= hi;
      const inRelaxed = (k) => depositable[hexes.get(k).terrain] && distOf(k) <= hi;  // min dropped to 0
      for (let i = 0; i < (cfg.count || 0); i++) {
        let pool = all.filter(h => inBand(HexMath.key(h.q, h.r))).map(h => HexMath.key(h.q, h.r));
        let takable = inBand;
        if (!pool.length) {   // band clipped by the board edge — relax the near bound
          pool = all.filter(h => inRelaxed(HexMath.key(h.q, h.r))).map(h => HexMath.key(h.q, h.r));
          takable = inRelaxed;
        }
        if (!pool.length) break;
        const start = pool[Math.floor(rng() * pool.length)];
        const size = 1 + Math.floor(rng() * 3);   // 1..3
        MapGen.growPatch(hexes, start, size, takable, (kk) => { hexes.get(kk).terrain = terr; }, rng);
      }
    }

    // ---- (5b) fish shoals — === TV2-FIX: WATER tiles ADJACENT TO buildable
    // land become `fish`, so a shore city/road can always reach the tile (the
    // fishery sits ON it). Runs in a FIXED slot in the single rng stream —
    // after the land deposits (5), before snow (6) — so same (seed, preset)
    // still yields an identical map (adding the phase changed maps vs the
    // pre-fix build once, which is expected; determinism holds per version).
    // Clustered 1–3 like the other deposits. cfg.near biases the FIRST shoal
    // toward the castle: fish is a T1 resource and must not sit far out. ===
    const fishCfg = deps.fish;
    if (fishCfg) {
      const landNeighbored = (k) => {
        const p = MapGen.parseKey(k);
        return HexMath.neighbors(p.q, p.r).some(n => {
          const nh = hexes.get(HexMath.key(n.q, n.r));
          const td = nh && CONFIG.terrain[nh.terrain];
          return !!(td && td.buildable);
        });
      };
      const fishTakable = (k) => hexes.get(k).terrain === "water" && landNeighbored(k);
      for (let i = 0; i < (fishCfg.count || 0); i++) {
        let pool = all.filter(h => h.terrain === "water" && landNeighbored(HexMath.key(h.q, h.r)))
                      .map(h => HexMath.key(h.q, h.r));
        if (i === 0 && fishCfg.near) {   // keep at least one shoal close to spawn
          const nearPool = pool.filter(k => { const p = MapGen.parseKey(k); return HexMath.dist(0, 0, p.q, p.r) <= fishCfg.near; });
          if (nearPool.length) pool = nearPool;
        }
        if (!pool.length) break;
        const start = pool[Math.floor(rng() * pool.length)];
        const size = 1 + Math.floor(rng() * 3);   // 1..3, same spread as deposits
        MapGen.growPatch(hexes, start, size, fishTakable, (kk) => { hexes.get(kk).terrain = "fish"; }, rng);
      }
    }
    // === /TV2-FIX (5b) ===

    // ---- (6) snow region (polar rows) ----
    const snowCfg = preset.snow || { mode: "none" };
    if (snowCfg.mode === "pole") {
      const rows = snowCfg.rows || 1;
      for (const h of all) {
        if (h.r <= (topRow + rows - 1) && groundSet[h.terrain]) h.terrain = "snow";
      }
    }

    // ---- (7) castle hub: grassland at centre + a cleared, buildable 7-hex core ----
    MapGen.ensureCastleCore(hexes);

    // ---- (8) playability repair: viable start near the castle ----
    // === TV2-FIX: extra args — guarantee >=1 usable fish tile within 6 of
    // the castle (fish is a starter T1 food source). ===
    MapGen.repairPlayability(hexes, 4, 6, 3, 6, 1);

    // ---- (9) connectivity: the castle's land MUST reach the main landmass by
    // road-passable tiles, else research materials/traders can't reach it (and
    // the center-water Oasis strands the castle on an island). Carve a land
    // bridge if needed. Runs last so it sees the final terrain. ----
    MapGen.ensureCastleConnected(hexes);

    return { seed, radius, preset: presetId, hexes, tiers: (presetId === "custom" ? tiers : undefined) };
  },
  // Guarantee the castle tile (0,0) and its 6 neighbours are usable land: (0,0)
  // becomes grass (the castle sits on it); each neighbour that is water /
  // mountains / forest / fish is cleared to barren so there is generic build
  // space around the castle for later castle-adjacent buildings. Ore/stone/clay
  // deposits adjacent to the castle are KEPT (valuable, and a mine can sit on
  // them). Deterministic (no rng).
  ensureCastleCore(hexes) {
    const core = [{ q: 0, r: 0 }].concat(HexMath.neighbors(0, 0));
    for (const p of core) {
      const h = hexes.get(HexMath.key(p.q, p.r));
      if (!h) continue;
      if (p.q === 0 && p.r === 0) { h.terrain = "fertile"; continue; }
      const td = CONFIG.terrain[h.terrain];
      const isOreDeposit = !!(td && td.deposit && h.terrain !== "forest" && h.terrain !== "fish");
      if (isOreDeposit) continue;                    // keep an adjacent stone/ore vein
      if (!td || !td.buildable) h.terrain = "barren"; // clear water/mountains/forest/fish
    }
  },
  // Ensure the castle's landmass is connected by ROAD-passable tiles to the map's
  // largest land component; if not (e.g. an Oasis central lake islands the
  // castle), carve the shortest barren land-bridge from the castle to that main
  // component. Deterministic: component labelling + BFS use a fixed neighbour
  // order, so the same map always carves the same bridge.
  ensureCastleConnected(hexes) {
    const roadable = (h) => { const td = h && CONFIG.terrain[h.terrain]; return !!(td && td.road); };
    // label road-passable connected components
    const comp = new Map(); const sizes = []; let next = 0;
    for (const h of hexes.values()) {
      const k0 = HexMath.key(h.q, h.r);
      if (comp.has(k0) || !roadable(h)) continue;
      const id = next++; let size = 0; const stack = [k0]; comp.set(k0, id);
      while (stack.length) {
        const k = stack.pop(); size++;
        const c = MapGen.parseKey(k);
        for (const n of HexMath.neighbors(c.q, c.r)) {
          const nk = HexMath.key(n.q, n.r); const nh = hexes.get(nk);
          if (nh && roadable(nh) && !comp.has(nk)) { comp.set(nk, id); stack.push(nk); }
        }
      }
      sizes[id] = size;
    }
    const castleId = comp.get(HexMath.key(0, 0));
    if (castleId == null || !sizes.length) return;
    let mainId = 0; for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[mainId]) mainId = i;
    if (castleId === mainId) return;                 // already on the main landmass
    // BFS from the castle over ALL tiles to the nearest main-component tile.
    const prev = new Map(); prev.set(HexMath.key(0, 0), null);
    const queue = [HexMath.key(0, 0)]; let head = 0, target = null;
    while (head < queue.length) {
      const k = queue[head++];
      if (comp.get(k) === mainId) { target = k; break; }
      const c = MapGen.parseKey(k);
      for (const n of HexMath.neighbors(c.q, c.r)) {
        const nk = HexMath.key(n.q, n.r);
        if (!hexes.has(nk) || prev.has(nk)) continue;
        prev.set(nk, k); queue.push(nk);
      }
    }
    if (target == null) return;
    for (let k = target; k != null; k = prev.get(k)) {   // carve obstacles on the path
      const h = hexes.get(k); const td = CONFIG.terrain[h.terrain];
      if (!td || !td.road) h.terrain = "barren";
    }
  },
  // Guarantee at least `minFertile` fertile and `minForest` forest hexes within
  // `K` of the castle so a fresh player can found a city + potato_farm + farm +
  // lumberjack. Converts the NEAREST hexes, PREFERRING generic ground
  // (barren/desert) but falling back to water then mountains when there isn't
  // enough ground near the castle (e.g. the Oasis preset's central lake — a
  // stated deviation from "never convert obstacles", required to keep every
  // preset playable). Deposits and existing fertile/forest are never cannibalised.
  // Deterministic (priority → distance → key tie-break).
  repairPlayability(hexes, K, minFertile, minForest, fishK, minFish) {
    const near = [];
    for (const h of hexes.values()) {
      if (HexMath.dist(0, 0, h.q, h.r) <= K) near.push(h);
    }
    const PRIORITY = { barren: 0, desert: 0, water: 1, mountains: 2 };  // convertible, cheapest first
    const ensure = (target, need) => {
      const targetBuildable = !!(CONFIG.terrain[target] && CONFIG.terrain[target].buildable);
      let have = near.filter(h => h.terrain === target).length;
      if (have >= need) return;
      const cands = near.filter(h => h.terrain in PRIORITY && h.terrain !== target)
        .sort((a, b) => PRIORITY[a.terrain] - PRIORITY[b.terrain] ||
                        HexMath.dist(0, 0, a.q, a.r) - HexMath.dist(0, 0, b.q, b.r) ||
                        (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1));
      for (const h of cands) {
        if (have >= need) break;
        // === TV2-FIX: a conversion to NON-buildable terrain (forest) must not
        // strand an adjacent fish tile (every fish tile stays shore-reachable). ===
        if (!targetBuildable && MapGen.strandsFish(hexes, h)) continue;
        h.terrain = target; have++;
      }
    };
    ensure("fertile", minFertile);
    ensure("forest", minForest);
    // === TV2-FIX: fish guarantee (runs AFTER the fertile/forest repair so it
    // sees the final near-spawn land; fertile/forest/deposits are never
    // cannibalised by it, and PRIORITY above never converts fish). ===
    if (fishK && minFish) MapGen.repairFish(hexes, fishK, minFish);
  },
  // === TV2-FIX: guarantee >= minFish USABLE fish tiles at dist 2..fishK of
  // the castle. "Usable" = has a buildable-land neighbour (a shore city can
  // reach it) and dist >= 2 (the castle-gap rule forbids placing a fishery on
  // a castle-adjacent hex). Deterministic (fixed priority; dist → key
  // tie-breaks; no rng). Repair ladder, cheapest conversion first:
  //   1. shore water in the band  → fish;
  //   2. any water in the band    → fish, + one adjacent water/mountains hex
  //      → barren (creates the reachable shore);
  //   3. no water near spawn      → carve a pocket: nearest barren/desert with
  //      a buildable neighbour → fish (+ one spare adjacent barren/desert →
  //      water for the pond look, only when another buildable neighbour
  //      remains);
  //   4. last resort (no water AND no barren/desert in the band): any other
  //      buildable ground (snow/fertile) → fish, preferring hexes OUTSIDE the
  //      fertile/forest repair radius so the start-kit guarantees keep.
  // === TV2-FIX: would turning hex `h` into non-buildable terrain leave an
  // adjacent fish tile with NO buildable-land neighbour (i.e. unreachable)?
  strandsFish(hexes, h) {
    const buildableHex = (x) => { const td = x && CONFIG.terrain[x.terrain]; return !!(td && td.buildable); };
    for (const n of HexMath.neighbors(h.q, h.r)) {
      const nh = hexes.get(HexMath.key(n.q, n.r));
      if (!nh || nh.terrain !== "fish") continue;
      const others = HexMath.neighbors(nh.q, nh.r)
        .map(o => hexes.get(HexMath.key(o.q, o.r)))
        .filter(o => o && !(o.q === h.q && o.r === h.r));
      if (!others.some(buildableHex)) return true;
    }
    return false;
  },
  repairFish(hexes, fishK, minFish) {
    const buildableHex = (h) => { const td = h && CONFIG.terrain[h.terrain]; return !!(td && td.buildable); };
    const nbrsOf = (h) => HexMath.neighbors(h.q, h.r).map(n => hexes.get(HexMath.key(n.q, n.r))).filter(Boolean);
    const hasBuildableNbr = (h) => nbrsOf(h).some(buildableHex);
    const band = [];
    for (const h of hexes.values()) {
      const d = HexMath.dist(0, 0, h.q, h.r);
      if (d >= 2 && d <= fishK) band.push(h);
    }
    const byNear = (arr) => arr.sort((a, b) =>
      HexMath.dist(0, 0, a.q, a.r) - HexMath.dist(0, 0, b.q, b.r) ||
      (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1));
    let have = band.filter(h => h.terrain === "fish" && hasBuildableNbr(h)).length;
    if (have >= minFish) return;
    // 1: shore water → fish
    for (const h of byNear(band.filter(h => h.terrain === "water" && hasBuildableNbr(h)))) {
      if (have >= minFish) return;
      h.terrain = "fish"; have++;
    }
    // 2: open water → fish, converting one obstacle neighbour into shore
    for (const h of byNear(band.filter(h => h.terrain === "water"))) {
      if (have >= minFish) return;
      const conv = byNear(nbrsOf(h).filter(x => x.terrain === "water" || x.terrain === "mountains"));
      if (!conv.length) continue;                 // no way to make a shore here
      conv[0].terrain = "barren";
      h.terrain = "fish"; have++;
    }
    // 3: pocket carved from generic ground (barren/desert only). Skip hexes
    //    whose loss would strand a NEIGHBOURING fish tile.
    for (const h of byNear(band.filter(h => (h.terrain === "barren" || h.terrain === "desert") && hasBuildableNbr(h)))) {
      if (have >= minFish) return;
      if (MapGen.strandsFish(hexes, h)) continue;
      h.terrain = "fish"; have++;
      const bNbrs = nbrsOf(h).filter(buildableHex);
      const ground = bNbrs.filter(x => x.terrain === "barren" || x.terrain === "desert" );
      if (bNbrs.length >= 2 && ground.length) {   // pond dressing, keeps a reachable shore
        const pond = byNear(ground)[ground.length - 1];
        if (!MapGen.strandsFish(hexes, pond)) pond.terrain = "water";
      }
    }
    // 4: last resort — any remaining buildable ground, far-first so the
    //    fertile/forest start guarantees (radius 4) are preserved. Same
    //    no-stranding guard.
    const far = (h) => (HexMath.dist(0, 0, h.q, h.r) > 4 ? 0 : 1);
    for (const h of band.filter(x => buildableHex(x) && hasBuildableNbr(x))
        .sort((a, b) => far(a) - far(b) ||
                        HexMath.dist(0, 0, a.q, a.r) - HexMath.dist(0, 0, b.q, b.r) ||
                        (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1))) {
      if (have >= minFish) return;
      if (MapGen.strandsFish(hexes, h)) continue;
      h.terrain = "fish"; have++;
    }
  },
};
// === /TV2 MapGen v2 ========================================================
