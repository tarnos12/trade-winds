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
    // --- Lakes / Rivers (v0.43): each axis option names a LEVEL string that
    //     MapGen.generate maps to a count via CONFIG.map.lakes / CONFIG.map.rivers ---
    const lk = optFor("lakes");   if (lk && lk.lakes)  p.lakes  = lk.lakes;
    const rv = optFor("rivers");  if (rv && rv.rivers) p.rivers = rv.rivers;
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
    // v0.43: water-feature levels always resolve to a known key (fall back to the base's, else a sane middle).
    if (!(CONFIG.map && CONFIG.map.lakes  && p.lakes  in CONFIG.map.lakes))  p.lakes  = (base.lakes  in ((CONFIG.map && CONFIG.map.lakes)  || {})) ? base.lakes  : "low";
    if (!(CONFIG.map && CONFIG.map.rivers && p.rivers in CONFIG.map.rivers)) p.rivers = (base.rivers in ((CONFIG.map && CONFIG.map.rivers) || {})) ? base.rivers : "few";
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
    // === Resource DENSITY (v0.47) === per-type ore CLUSTER count. Level comes from
    // the Custom "resources" axis (tiers.resources) or the preset's declared tier,
    // defaulting to Normal; every ore type gets at least this many clusters, so no
    // map is ore-starved (fixes "only 1 gold node"). Min floor 3 is baked into the
    // Low level. Same (seed, tiers) still => same map (perType only scales the loop).
    const DENS = (CONFIG.map && CONFIG.map.depositDensity) || { low: 3, normal: 6, high: 10 };
    const RES2DENS = { scarce: "low", normal: "normal", rich: "high" };
    const resSel = (tiers && tiers.resources) || (preset.tiers && preset.tiers.resources) || "normal";
    const perType = Math.max(3, DENS[RES2DENS[resSel] || "normal"] || DENS.normal || 6);
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
    // ---- (2) mountains: cohesive RANGES (grown ridge blobs), not scattered
    // single peaks. Budget = mountainFrac of the land; seed ridges at the highest
    // remaining land hexes and grow blobs from them. Reachability is guaranteed
    // afterwards (ensureReachable) so a range can never permanently wall off land. ----
    // (v0.47) Ranges are placed in SEVERAL semi-random regions, not one central
    // massif. Seeds are drawn by rng from the upper-elevation land (ranges still
    // favour high ground) but a minimum separation spreads them across the board.
    // mtnSeeds is remembered so ore can co-spawn against the ranges (phase 8).
    const mtnFrac = preset.mountainFrac || 0;
    const mtnSeeds = [];
    if (mtnFrac > 0) {
      const land0 = all.filter(h => h.terrain === null);
      const budget = Math.round(land0.length * mtnFrac);
      if (budget > 0 && land0.length) {
        const byElev = land0.slice().sort((a, b) => b.elevation - a.elevation ||
          (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1));
        const topPool = byElev.slice(0, Math.max(1, Math.floor(byElev.length * 0.6)));   // upper 60% by elevation
        const minSep = 5;                       // hexes between range seeds → several distinct ranges
        let placed = 0, tries = 0;
        while (placed < budget && tries < 400 && topPool.length) {
          tries++;
          const pick = topPool[Math.floor(rng() * topPool.length)];
          if (pick.terrain !== null) continue;   // already part of a range
          // reject seeds too close to an existing range — but relax after enough
          // tries so the mountain budget always fills even on a small board.
          if (tries < 220 && mtnSeeds.some(s => HexMath.dist(s.q, s.r, pick.q, pick.r) < minSep)) continue;
          const remaining = budget - placed;
          const rsize = Math.min(remaining, 4 + Math.floor(rng() * 8));   // ridge blob 4..11
          const taken = MapGen.growPatch(hexes, HexMath.key(pick.q, pick.r), rsize,
            k => hexes.get(k).terrain === null, (kk) => { hexes.get(kk).terrain = "mountains"; }, rng);
          if (taken.size) { mtnSeeds.push({ q: pick.q, r: pick.r }); placed += taken.size; }
        }
      }
    }

    // ---- (3) LAKES: inland water blobs, SEPARATE from the rim/center SEA. Count
    // by the preset's `lakes` LEVEL (CONFIG.map.lakes); size per blob from
    // CONFIG.map.lakeSize. Placed on land, kept clear of the immediate castle core. ----
    const lakeCount = (CONFIG.map && CONFIG.map.lakes && CONFIG.map.lakes[preset.lakes]) || 0;
    const lakeSize = (CONFIG.map && CONFIG.map.lakeSize) || [4, 10];
    for (let i = 0; i < lakeCount; i++) {
      const pool = all.filter(h => h.terrain === null && HexMath.dist(0, 0, h.q, h.r) >= 4).map(h => HexMath.key(h.q, h.r));
      if (!pool.length) break;
      const start = pool[Math.floor(rng() * pool.length)];
      const size = lakeSize[0] + Math.floor(rng() * (lakeSize[1] - lakeSize[0] + 1));
      MapGen.growPatch(hexes, start, size, k => hexes.get(k).terrain === null, (kk) => { hexes.get(kk).terrain = "water"; }, rng);
    }

    // ---- (4) RIVERS: winding water lines descending elevation from a high inland
    // point toward the sea / a lake / the board edge; WIDTH varies along the course
    // (CONFIG.map.riverWidth). Count by the preset's `rivers` LEVEL. ----
    const riverCount = (CONFIG.map && CONFIG.map.rivers && CONFIG.map.rivers[preset.rivers]) || 0;
    const rw = (CONFIG.map && CONFIG.map.riverWidth) || [1, 5];
    for (let i = 0; i < riverCount; i++) MapGen.carveRiver(hexes, all, rng, rw[0], rw[1]);

    // ---- (5) FILLER ground: fill the remaining land with the BACKGROUND biomes
    // (barren/desert — the low-value filler), grown as coherent blobs. fertile is
    // NO LONGER a filler; it arrives as discrete PATCHES in phase (7). ----
    const mix = preset.groundMix || { fertile: 0.45, barren: 0.35, desert: 0.20 };
    let fillerKeys = Object.keys(mix).filter(k => k !== "fertile" && mix[k] > 0);
    if (!fillerKeys.length) fillerKeys = ["barren"];
    let fillerTotal = 0; for (const k of fillerKeys) fillerTotal += (mix[k] || 0);
    if (fillerTotal <= 0) fillerTotal = 1;
    const pickFiller = () => {
      let x = rng() * fillerTotal;
      for (const k of fillerKeys) { x -= (mix[k] || 0); if (x <= 0) return k; }
      return fillerKeys[fillerKeys.length - 1];
    };
    const isGroundless = k => hexes.get(k).terrain === null;
    for (const h of all) {
      const k = HexMath.key(h.q, h.r);
      if (h.terrain !== null) continue;
      const type = pickFiller();
      const size = 8 + Math.floor(rng() * 11);   // 8..18 — coherent background clumps
      MapGen.growPatch(hexes, k, size, isGroundless, (kk) => { hexes.get(kk).terrain = type; }, rng);
    }

    // ---- (6) snow region — BOTH poles (north AND south edge rows). Row depth
    // scales with the climate/snow setting (snowCfg.rows). Converts only filler
    // ground (barren/desert), so it never eats a fertile/forest patch or water. ----
    const snowCfg = preset.snow || { mode: "none" };
    if (snowCfg.mode === "pole") {
      const rows = snowCfg.rows || 1;
      const botRow = topRow + (H - 1);   // southmost axial row (board row H-1)
      for (const h of all) {
        if (h.terrain !== "barren" && h.terrain !== "desert") continue;
        if (h.r <= topRow + rows - 1 || h.r >= botRow - (rows - 1)) h.terrain = "snow";
      }
    }

    // ---- (7) PATCHES: fertile (mixed with some forest) plus a few pure-forest
    // stands, grown on the barren/desert filler in a MIX of sizes (mostly medium)
    // until a coverage TARGET is met. The target is the preset's fertile share
    // scaled well DOWN so fertile stays a clear MINORITY of the land — the whole
    // point of the v0.43 paradigm (far less continuous grass). Patches occasionally
    // seed against an existing patch so they COMBINE into organic clusters. ----
    let mixTotalAll = 0; for (const k of Object.keys(mix)) mixTotalAll += (mix[k] || 0);
    const fertShare = mixTotalAll > 0 ? (mix.fertile || 0) / mixTotalAll : 0.3;
    const patchGround = k => { const t = hexes.get(k).terrain; return t === "barren" || t === "desert"; };
    const groundNow = () => all.filter(h => patchGround(HexMath.key(h.q, h.r)));
    const patchTarget = Math.round(groundNow().length * Math.min(0.55, fertShare * 0.62));
    const PS = (CONFIG.map && CONFIG.map.patchSizes) || { small: [1, 3], medium: [4, 7], big: [8, 12] };
    const pickSizeCat = () => { const x = rng(); return x < 0.25 ? "small" : (x < 0.82 ? "medium" : "big"); };  // mostly medium
    let coverage = 0, guard = 0;
    while (coverage < patchTarget && guard++ < 600) {
      let pool = groundNow().map(h => HexMath.key(h.q, h.r));
      if (!pool.length) break;
      if (rng() < 0.3) {   // occasionally abut an existing patch → merged, natural clusters
        const bordering = pool.filter(k => { const p = MapGen.parseKey(k);
          return HexMath.neighbors(p.q, p.r).some(n => { const nh = hexes.get(HexMath.key(n.q, n.r));
            return nh && (nh.terrain === "fertile" || nh.terrain === "forest"); }); });
        if (bordering.length) pool = bordering;
      }
      const start = pool[Math.floor(rng() * pool.length)];
      const cat = pickSizeCat();
      const band = PS[cat] || PS.medium || [4, 7];
      const psize = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
      const forestPatch = rng() < 0.25;   // ~1 in 4 patches is a pure-forest stand
      const taken = MapGen.growPatch(hexes, start, psize, patchGround, (kk) => {
        // a MIXED (fertile) patch is ~72% fertile + ~28% forest; a forest patch is all forest.
        hexes.get(kk).terrain = forestPatch ? "forest" : (rng() < 0.28 ? "forest" : "fertile");
      }, rng);
      coverage += taken.size || 0;
      if (!taken.size) break;
    }

    // ---- (8) deposit clusters (distance-BANDED by tier, + terrain AFFINITY) ----
    // Band logic is unchanged from TV2 (see below). v0.43 layers an AFFINITY
    // pre-filter ON TOP: within the in-band pool, prefer a seed hex whose
    // neighbourhood contains one of CONFIG.map.depositAffinity[type]'s terrains
    // (clay→water; stone/iron/gold/coal→barren/mountains); fall back to the plain
    // in-band pool when no neighbourhood matches.
    // Each ore good spawns within a [minFrac, maxFrac] DISTANCE BAND from the
    // castle, expressed as a fraction of castleMaxDist. If the castle is near an
    // edge the band is clipped by the board — if no in-band depositable hex
    // remains we relax the min to 0 so every configured deposit still spawns.
    const DEP_TERRAIN = { stone: "stone_deposit", clay: "clay_deposit", iron: "iron_deposit", coal: "coal_deposit", gold: "gold_deposit" };
    const depositable = { barren: 1, desert: 1, fertile: 1, forest: 1 };
    const deps = preset.deposits || {};
    const TIERS = (CONFIG.map && CONFIG.map.depositTiers) || {};
    const BANDS = (CONFIG.map && CONFIG.map.depositBands) || {};
    const AFF = (CONFIG.map && CONFIG.map.depositAffinity) || {};
    const distOf = (k) => { const p = MapGen.parseKey(k); return HexMath.dist(0, 0, p.q, p.r); };
    const bandFor = (t) => { const c = deps[t]; return (c && Array.isArray(c.band)) ? c.band : (BANDS[TIERS[t] || 1] || [0, 1]); };
    // (v0.47) MIXING: within a rocky cluster a tile may swap to a SIBLING rocky ore
    // (so iron shows up beside coal / stone rather than a pure block), but ONLY to a
    // sibling whose own distance band contains that tile — the tier rules still hold,
    // so metals never leak next to the castle. Clay (water) and gold (precious, far)
    // stay pure. The cluster SEED always keeps its own type ⇒ >= perType of each ore.
    const MIX = ["stone", "coal", "iron"];
    const MIXCHANCE = 0.28;
    const pickMixType = (primary, df) => {
      if (MIX.indexOf(primary) < 0 || rng() >= MIXCHANCE) return primary;
      const sibs = MIX.filter(s => { const b = bandFor(s); return df >= (b[0] || 0) && df <= (b[1] != null ? b[1] : 1); });
      return sibs.length ? sibs[Math.floor(rng() * sibs.length)] : primary;
    };
    for (const type of ["stone", "clay", "iron", "coal", "gold"]) {   // fixed order ⇒ reproducible rng
      const cfg = deps[type] || {};
      const terr = DEP_TERRAIN[type];
      const band = bandFor(type);
      const lo = Math.round((band[0] || 0) * castleMaxDist);
      const hi = Math.round((band[1] != null ? band[1] : 1) * castleMaxDist);
      const inBand    = (k) => depositable[hexes.get(k).terrain] && distOf(k) >= lo && distOf(k) <= hi;
      const inRelaxed = (k) => depositable[hexes.get(k).terrain] && distOf(k) <= hi;  // min dropped to 0
      const affTerr = AFF[type];
      const affMatch = (k) => { const p = MapGen.parseKey(k);
        return HexMath.neighbors(p.q, p.r).some(n => { const nh = hexes.get(HexMath.key(n.q, n.r));
          return nh && affTerr.indexOf(nh.terrain) >= 0; }); };
      for (let i = 0; i < perType; i++) {   // (v0.47) DENSITY: perType clusters of every ore type
        let pool = all.filter(h => inBand(HexMath.key(h.q, h.r))).map(h => HexMath.key(h.q, h.r));
        let takable = inBand;
        if (!pool.length) {   // band clipped by the board edge — relax the near bound
          pool = all.filter(h => inRelaxed(HexMath.key(h.q, h.r))).map(h => HexMath.key(h.q, h.r));
          takable = inRelaxed;
        }
        if (!pool.length) break;
        if (affTerr && affTerr.length) {   // AFFINITY: prefer hexes next to the matching terrain (metals hug mountains)
          const affPool = pool.filter(affMatch);
          if (affPool.length) pool = affPool;
        }
        const startKey = pool[Math.floor(rng() * pool.length)];
        hexes.get(startKey).terrain = terr;                 // SEED keeps the pure type
        const size = 1 + Math.floor(rng() * 3);             // 1..3 tiles per node
        // SCATTER: the extra tiles sit within hex-dist 2 of the seed, biased to
        // adjacency but SOMETIMES a tile or two away (natural gaps, not a solid block).
        const sp = MapGen.parseKey(startKey);
        let cand = all.filter(h => { const k = HexMath.key(h.q, h.r); const d = HexMath.dist(sp.q, sp.r, h.q, h.r);
          return d >= 1 && d <= 2 && takable(k); }).map(h => HexMath.key(h.q, h.r));
        let placedTiles = 1;
        while (placedTiles < size && cand.length) {
          const wantAdj = rng() < 0.6;   // 60% tight (adjacent), 40% gapped (dist 2)
          let idx = cand.findIndex(k => { const p = MapGen.parseKey(k); return (HexMath.dist(sp.q, sp.r, p.q, p.r) === 1) === wantAdj; });
          if (idx < 0) idx = Math.floor(rng() * cand.length);
          const ck = cand.splice(idx, 1)[0];
          if (!takable(ck)) continue;    // taken by an earlier tile this cluster
          const cp = MapGen.parseKey(ck);
          const df = castleMaxDist ? HexMath.dist(0, 0, cp.q, cp.r) / castleMaxDist : 0;
          hexes.get(ck).terrain = DEP_TERRAIN[pickMixType(type, df)];
          placedTiles++;
        }
      }
    }

    // ---- (9) fish shoals — WATER tiles ADJACENT TO buildable land become `fish`
    // (a shore city/road can reach the tile). Now that LAKES and RIVERS add inland
    // water, shoals also appear on their shores, not just the sea. Clustered 1–3;
    // cfg.near biases the FIRST shoal toward the castle (fish is a T1 resource). ----
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

    // ---- (10) castle hub: grassland at centre + a cleared, buildable 7-hex core ----
    MapGen.ensureCastleCore(hexes);

    // ---- (11) playability repair: a viable T1 start near the castle (forest +
    // fertile + a usable fish tile). K=4 sits INSIDE any size-based reveal radius
    // (>=10), so the revealed OPENING always contains wood + fertile land. ----
    MapGen.repairPlayability(hexes, 4, 6, 3, 6, 1);

    // ---- (12) connectivity — the castle's land MUST reach the main landmass
    // (carve a bridge if islanded), and then EVERY roadable region walled off by a
    // THIN barrier (a mountain neck or a river) is reconnected to the castle by
    // carving a short pass. Wide open sea (a real archipelago) is left alone. Runs
    // last so it sees the final terrain; carving obstacles→barren is fish-safe. ----
    MapGen.ensureCastleConnected(hexes);
    MapGen.ensureReachable(hexes);

    // ---- reveal radius scales with board size (v0.43); save.js reveals it at new-game. ----
    const revealTier = W <= 40 ? "small" : (W <= 58 ? "normal" : "large");
    const revealRadius = (CONFIG.fog && CONFIG.fog.startReveal && CONFIG.fog.startReveal[revealTier]) ||
      (CONFIG.fog && CONFIG.fog.castleReveal) || 4;

    return { seed, radius, preset: presetId, hexes, revealRadius, rect: { width: W, height: H },
      tiers: (presetId === "custom" ? tiers : undefined) };
  },
  // === v0.43: carve ONE winding river. Starts at a high-elevation inland land
  // hex, then repeatedly steps to a low-elevation neighbour (meandering: it picks
  // among the two lowest via `rng`) until it reaches existing water, the board
  // edge, or the castle core. Stamps a channel whose WIDTH drifts within
  // [wMin,wMax] along the course. Rivers are water (not roadable); ensureReachable
  // runs afterwards so a river can't permanently isolate land. Deterministic. ===
  carveRiver(hexes, all, rng, wMin, wMax) {
    const landNull = all.filter(h => h.terrain === null);
    if (!landNull.length) return;
    const srcSorted = landNull.slice().sort((a, b) => b.elevation - a.elevation ||
      (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1));
    const topN = Math.max(1, Math.floor(srcSorted.length * 0.25));   // pick a source among the highest quartile
    let cur = srcSorted[Math.floor(rng() * topN)];
    let width = wMin + Math.floor(rng() * (wMax - wMin + 1));
    const maxSteps = landNull.length;   // generous cap; the descent normally reaches water first
    const visited = new Set();
    for (let step = 0; step < maxSteps; step++) {
      if (!cur) break;
      const ck = HexMath.key(cur.q, cur.r);
      visited.add(ck);
      // stamp a channel blob of `width` around cur (over land or existing water; keep it off the castle core).
      MapGen.growPatch(hexes, ck, Math.max(1, width),
        (k) => { const p = MapGen.parseKey(k); const t = hexes.get(k).terrain;
          return (t === null || t === "water") && HexMath.dist(0, 0, p.q, p.r) >= 3; },
        (kk) => { hexes.get(kk).terrain = "water"; }, rng);
      // next: descend to the lowest-elevation unvisited land neighbour (still-null),
      // meandering by choosing among the two lowest. Stop at sea/lake or a dead end.
      const nbrs = HexMath.neighbors(cur.q, cur.r).map(n => hexes.get(HexMath.key(n.q, n.r))).filter(Boolean);
      if (nbrs.some(n => n.terrain === "water" && !visited.has(HexMath.key(n.q, n.r)))) break;   // reached a body of water
      const cand = nbrs.filter(n => n.terrain === null && !visited.has(HexMath.key(n.q, n.r)) && HexMath.dist(0, 0, n.q, n.r) >= 3)
        .sort((a, b) => a.elevation - b.elevation || (HexMath.key(a.q, a.r) < HexMath.key(b.q, b.r) ? -1 : 1));
      if (!cand.length) break;
      cur = cand[Math.floor(rng() * Math.min(cand.length, 2))];
      width = Math.max(wMin, Math.min(wMax, width + (Math.floor(rng() * 3) - 1)));   // drift width ±1
    }
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
  // === v0.43: map-wide reachability guarantee. After all obstacles are placed,
  // the roadable land should be (almost) ONE connected component that includes the
  // castle. Any roadable region walled off by a THIN barrier (a mountain neck or a
  // river — up to `maxCarve` obstacle hexes) is reconnected to the castle's
  // component by carving the fewest obstacle hexes to barren. A region separated by
  // WIDE open sea (a genuine archipelago, e.g. the Isles preset) is left alone: it
  // would take more than maxCarve carves to reach, so it's skipped. Deterministic:
  // component labelling and the layered obstacle-cost search use a fixed neighbour
  // order and key tie-breaks. Carving obstacles→barren only ADDS buildable land, so
  // it can never strand a fish tile. Iterates until nothing thin remains. ===
  ensureReachable(hexes, maxCarve) {
    maxCarve = maxCarve || 8;
    const roadable = (h) => { const td = h && CONFIG.terrain[h.terrain]; return !!(td && td.road); };
    const label = () => {   // -> { comp:Map, castleId }
      const comp = new Map(); let next = 0;
      for (const h of hexes.values()) {
        const k0 = HexMath.key(h.q, h.r);
        if (comp.has(k0) || !roadable(h)) continue;
        const id = next++; const stack = [k0]; comp.set(k0, id);
        while (stack.length) {
          const k = stack.pop(); const c = MapGen.parseKey(k);
          for (const n of HexMath.neighbors(c.q, c.r)) {
            const nk = HexMath.key(n.q, n.r); const nh = hexes.get(nk);
            if (nh && roadable(nh) && !comp.has(nk)) { comp.set(nk, id); stack.push(nk); }
          }
        }
      }
      return { comp, castleId: comp.get(HexMath.key(0, 0)) };
    };
    for (let iter = 0; iter < 60; iter++) {
      const { comp, castleId } = label();
      if (castleId == null) return;   // castle not roadable (ensureCastleCore prevents this)
      // any roadable tile in a different component?
      let stranded = false;
      for (const h of hexes.values()) { if (roadable(h) && comp.get(HexMath.key(h.q, h.r)) !== castleId) { stranded = true; break; } }
      if (!stranded) return;   // fully connected
      // Layered search from the castle component, counting OBSTACLE hexes crossed.
      // dist(hex) = obstacles that must be carved to reach it; roadable moves cost 0,
      // stepping onto an obstacle costs +1. Find the nearest OTHER-component roadable
      // tile within maxCarve; carve the obstacles along the path back to the castle.
      const dist = new Map(); const prev = new Map();
      let frontier = [];   // hexes newly reachable at the current obstacle level
      for (const h of hexes.values()) {
        if (roadable(h) && comp.get(HexMath.key(h.q, h.r)) === castleId) {
          const k = HexMath.key(h.q, h.r); dist.set(k, 0); prev.set(k, null); frontier.push(k);
        }
      }
      let target = null;
      for (let level = 0; level <= maxCarve && target == null; level++) {
        // (a) flood roadable at this obstacle level (0-cost moves) from the frontier
        const q = frontier.slice(); let qh = 0;
        while (qh < q.length) {
          const k = q[qh++]; const c = MapGen.parseKey(k);
          for (const n of HexMath.neighbors(c.q, c.r)) {
            const nk = HexMath.key(n.q, n.r); const nh = hexes.get(nk);
            if (!nh || dist.has(nk)) continue;
            if (roadable(nh)) {
              dist.set(nk, level); prev.set(nk, k);
              if (comp.get(nk) !== castleId) { target = nk; break; }   // reached a stranded region
              q.push(nk);
            }
          }
          if (target != null) break;
        }
        if (target != null) break;
        // (b) step one obstacle ring outward → next level frontier
        const next = [];
        for (const [k, d] of dist) {
          if (d !== level) continue;
          const c = MapGen.parseKey(k);
          for (const n of HexMath.neighbors(c.q, c.r)) {
            const nk = HexMath.key(n.q, n.r); const nh = hexes.get(nk);
            if (!nh || dist.has(nk) || roadable(nh)) continue;
            dist.set(nk, level + 1); prev.set(nk, k); next.push(nk);
          }
        }
        frontier = next;
      }
      if (target == null) return;   // nearest stranded region is beyond maxCarve → leave it (real island)
      for (let k = target; k != null; k = prev.get(k)) {   // carve obstacles on the path to barren
        const h = hexes.get(k); const td = CONFIG.terrain[h.terrain];
        if (!td || !td.road) h.terrain = "barren";
      }
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
