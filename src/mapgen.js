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
  // Returns { seed, radius, preset, hexes: Map<key, hex> }.
  generate(seedInput, radius, presetId) {
    presetId = presetId || (CONFIG.mapPresetDefault || "fertile");
    const preset = (CONFIG.mapPresets && CONFIG.mapPresets[presetId]) ||
                   (CONFIG.mapPresets && CONFIG.mapPresets[CONFIG.mapPresetDefault]) || {};
    radius = radius || preset.radius || CONFIG.map.radius;
    const seed = hashSeed(seedInput);
    // Single seeded stream (seed ^ presetId) consumed in a FIXED order below.
    const rng = mulberry32((hashSeed(seedInput) ^ hashSeed(presetId)) | 0);
    const elevN = makeValueNoise(seed);

    // ---- build the grid; sample elevation for water/mountain shaping ----
    const hexes = new Map();
    const waterMode = (preset.water && preset.water.mode) || "rim";
    const waterFrac = (preset.water && preset.water.frac) || 0;
    for (let q = -radius; q <= radius; q++) {
      const lo = Math.max(-radius, -q - radius), hi = Math.min(radius, -q + radius);
      for (let r = lo; r <= hi; r++) {
        const d = HexMath.dist(0, 0, q, r) / radius;     // 0 centre → 1 rim
        // rim mode sinks the rim (island); center mode (oasis) sinks the middle.
        let falloff = 0;
        if (waterMode === "rim") falloff = d * d * CONFIG.map.edgeFalloff;
        else if (waterMode === "center") falloff = (1 - d) * (1 - d) * CONFIG.map.edgeFalloff;
        const elev = elevN(q * 0.11 + 100, r * 0.11 + 100, 4) - falloff;
        hexes.set(HexMath.key(q, r), { q, r, terrain: null, elevation: elev, revealed: false });
      }
    }
    const all = Array.from(hexes.values());   // deterministic insertion order

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

    // ---- (5) deposit clusters (distance-ringed; T2 further out than T1) ----
    const DEP_TERRAIN = { stone: "stone_deposit", clay: "clay_deposit", iron: "iron_deposit", coal: "coal_deposit", gold: "gold_deposit" };
    const depositable = { barren: 1, desert: 1, fertile: 1, forest: 1 };
    const deps = preset.deposits || {};
    // === B (batch-2): pull PEASANT / early-tier deposits INWARD. `stone` is
    // quarried by PEASANTS and is the first mined material the early buildings
    // need — but a `ring:0` stone could seed ANYWHERE in the depositable pool
    // (out to the rim), so it often spawned far from the castle. We cap the SEED
    // distance for these near-spawn types to an inner band (a fraction of radius),
    // analogous to fish's `near`. T2/T3 deposits (iron/coal/gold) are UNTOUCHED and
    // keep their outer rings, so tier ordering (stone nearest → gold furthest) is
    // preserved. A preset may override the cap per type via `deposits.<type>.near`.
    // Only the SEED pool is biased inward (growth candidates still respect the ring
    // via `takable`); determinism holds (seeded rng only) and every deposit still
    // generates — we fall back to the full ring pool when the inner band is empty.
    const NEAR_FRAC = { stone: 0.4, clay: 0.6 };   // stone hugs spawn; clay slightly further (still inner)
    // fixed order so RNG draws are reproducible
    for (const type of ["stone", "clay", "iron", "coal", "gold"]) {
      const cfg = deps[type]; if (!cfg) continue;
      const terr = DEP_TERRAIN[type];
      // === TV2-FIX: STRICT rings — growth candidates must respect the ring
      // too, so a blob can never creep closer to the castle than cfg.ring
      // (previously only the SEED hex was ring-filtered and growPatch could
      // expand 1–2 hexes inward). Fish is exempt: it's T1, near-spawn. ===
      const ringOk = (k) => { const p = MapGen.parseKey(k); return HexMath.dist(0, 0, p.q, p.r) >= (cfg.ring || 0); };
      const takable = (k) => depositable[hexes.get(k).terrain] && ringOk(k);
      // B: outer SEED cap for near-spawn peasant/early types (null = no cap → old behaviour).
      const nearCap = (cfg.near != null) ? cfg.near
        : (NEAR_FRAC[type] != null ? Math.max(cfg.ring || 0, Math.round(radius * NEAR_FRAC[type])) : null);
      for (let i = 0; i < (cfg.count || 0); i++) {
        let pool = all.filter(h => depositable[h.terrain] && HexMath.dist(0, 0, h.q, h.r) >= (cfg.ring || 0))
                        .map(h => HexMath.key(h.q, h.r));
        if (nearCap != null) {   // B: bias the seed toward the castle (inner band), keep full pool as fallback
          const inner = pool.filter(k => { const p = MapGen.parseKey(k); return HexMath.dist(0, 0, p.q, p.r) <= nearCap; });
          if (inner.length) pool = inner;
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
        if (h.r <= (-radius + rows - 1) && groundSet[h.terrain]) h.terrain = "snow";
      }
    }

    // ---- (7) castle hub: buildable grassland at map centre ----
    const c = hexes.get(HexMath.key(0, 0));
    if (c) c.terrain = "fertile";

    // ---- (8) playability repair: viable start near the castle ----
    // === TV2-FIX: extra args — guarantee >=1 usable fish tile within 6 of
    // the castle (fish is a starter T1 food source). ===
    MapGen.repairPlayability(hexes, 4, 6, 3, 6, 1);

    return { seed, radius, preset: presetId, hexes };
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
