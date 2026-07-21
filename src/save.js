  function randomSeed() {
    // avoid Math.random dependency on a specific value; any string works as a seed
    const words = ["harbor", "amber", "clover", "willow", "ember", "cobble", "marsh", "birch", "flint", "haven"];
    const t = Date.now().toString(36);
    return words[t.charCodeAt(t.length - 1) % words.length] + "-" + t.slice(-4);
  }

  // ---------------------------------------------------------------
  // New game / reset
  // ---------------------------------------------------------------
  function newGame(seedInput, presetId) {
    state.seedInput = seedInput;
    // === TV2: map preset (persisted). Radius comes from the chosen preset. ===
    const preset = (CONFIG.mapPresets && CONFIG.mapPresets[presetId]) ? presetId : (CONFIG.mapPresetDefault || "fertile");
    state.mapPreset = preset;
    const pr = CONFIG.mapPresets[preset];
    state.map = MapGen.generate(seedInput, (pr && pr.radius) || CONFIG.map.radius, preset);
    state.roads = new Set();
    // BUGFIX: every OTHER state.roads mutation site (place ~6045, erase ~6059,
    // Events bridge collapse/repair ~4747) calls Pathing.invalidate() right
    // after mutating state.roads — newGame()/loadGame() must too, or a second
    // game started in the same page session (New Game again, or Load Game)
    // reads STALE cached routes from the PREVIOUS game's road graph (the cache
    // is a module-level singleton keyed only by hex coords, not by `state`;
    // the castle is always at (0,0) so coordinate collisions across games are
    // realistic, not theoretical). loadGame() calls newGame() first, so this
    // one call covers both paths.
    Pathing.invalidate();
    state.towns = [];
    state.carts = [];
    state.treasury = 10000;   // EC-A: Kingdom starting gold (pays all placement)
    state.tariffRate = CONFIG.trade.tariffRate;   // TARIFF-SLIDER (P5D-D): reset to baseline 25%
    state.tradeSeed = hashSeed(seedInput) ^ 0x5bd1e995;   // deterministic per-game trade RNG
    state.research = Research.fresh();   // RESEARCH (P4-A): reset the tech tree
    state.market = (typeof Market !== "undefined" && Market.fresh) ? Market.fresh() : { hist: {}, head: 0, len: 0 };  // KR-A: fresh market history
    state.warehouse = {};        // CASTLE-UI (T9): reset player warehouse on new map
    state.castleStock = Object.assign({}, (CONFIG.researchEconomy && CONFIG.researchEconomy.starterStock) || {});   // CRE + RSF: starter materials so first researches never stall
    state.researchCenter = null;   // Slice B: no Research Center yet — research paused until the player builds one
    state.researchSeed = (hashSeed(seedInput) ^ 0x9e3779b9) | 0;   // CRE: castle-trader RNG
    state.castleTrade = {};      // PP-A: castle market — all goods off by default
    state.castleReserved = {};   // PP-A: castle stock reservations
    state.castleMarketSeed = (hashSeed(seedInput) ^ 0x2545f491) | 0;   // PP-A: castle-market RNG
    state.prestige = 0;          // P4-B: reset progression on a new map
    state.castleLevel = 1;
    state.victory = false;
    state.event = null;          // P4-C: no event on a fresh map
    state.eventSeed = (hashSeed(seedInput) ^ 0x1a2b3c4d) | 0;  // deterministic per-game event RNG
    state.eventCooldown = CONFIG.events.minGapTicks;
    state.revealed = new Set();
    state.cam = { x: 0, y: 0 };
    state.zoom = 1;
    document.getElementById("seed").value = seedInput;
    reveal(0, 0, CONFIG.fog.castleReveal);      // clear fog around the castle
    terrainDirty = true;
    scheduleSave();
  }

  // ---------------------------------------------------------------
  // Persistence (versioned; GDD §9.4)
  // ---------------------------------------------------------------
  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveGame(); }, 800);
  }
  function saveGame() {
    try {
      const data = {
        saveVersion: CONFIG.saveVersion,
        seed: state.seedInput,
        preset: state.mapPreset,           // === TV2: persist chosen map preset ===
        cam: state.cam, zoom: state.zoom, mode: state.mode,
        revealAll: state.revealAll,
        roads: Array.from(state.roads),
        towns: state.towns,
        carts: state.carts,
        treasury: state.treasury,
        tick: state.tick,                  // BUGFIX: persist the sim tick — town.cooldownUntil and happyMods[].untilTick are ABSOLUTE tick values, so without restoring tick they read as stuck/inflated after a save+reload
        tariffRate: state.tariffRate,      // TARIFF-SLIDER (P5D-D): player-set base tariff
        tradeSeed: state.tradeSeed,
        research: state.research,          // RESEARCH (P4-A): tech tree progress
        revealed: Array.from(state.revealed),
        warehouse: state.warehouse,        // CASTLE-UI (T9): player warehouse
        castleStock: state.castleStock,    // CRE: castle research-material stockpile
        researchCenter: state.researchCenter, // Slice B: the unique Research Center (or null)
        researchSeed: state.researchSeed,  // CRE: castle-trader RNG stream
        castleTrade: state.castleTrade,        // PP-A: castle market config
        castleReserved: state.castleReserved,  // PP-A: castle stock reservations
        castleMarketSeed: state.castleMarketSeed, // PP-A: castle-market RNG stream
        prestige: state.prestige,          // P4-B
        castleLevel: state.castleLevel,    // P4-B
        quest: state.quest,                // P4-B
        victory: state.victory,            // P4-B
        _questSeq: state._questSeq,        // P4-B: quest rotation cursor
        event: state.event,                // P4-C: active event
        eventSeed: state.eventSeed,        // P4-C: event RNG stream
        eventCooldown: state.eventCooldown,// P4-C: ticks until next event
        muted: (typeof SFX !== "undefined") ? SFX.isMuted() : !!state.muted, // P5-C: audio mute
        gameSpeed: state.gameSpeed,        // === SPEED-UI === (P5D-A) chosen speed 0/1/2/4
        market: state.market,              // KR-A: bounded market history ring (≤600/good)
        stats: state.stats,                // U: lifetime counters for mission objectives (Sim.ensureStats migrates)
        missions: state.missions,          // U: mission progress (activated/baselines/completed)
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) { /* private mode / quota — ignore */ }
  }
  function migrate(data) {
    // STEPWISE upgrader — preserves existing saves across version bumps.
    if (!data || typeof data !== "object") return null;
    // v1 → v2 (Slice B): the Research Center was added. Old saves simply have no
    // center yet (research paused until the player builds one).
    if (data.saveVersion === 1) {
      data.researchCenter = data.researchCenter || null;
      data.saveVersion = 2;
    }
    if (data.saveVersion !== CONFIG.saveVersion) return null; // unknown/newer → reject
    return data;
  }
  // === TV2: rename ore→iron in a good-keyed map (in place), summing collisions. ===
  function TV2_renameGood(obj, from, to) {
    if (!obj || typeof obj !== "object" || !(from in obj)) return;
    obj[to] = (typeof obj[to] === "number" ? obj[to] : 0) + obj[from];
    delete obj[from];
  }
  // Walk loaded state and rename the ore→iron good + miner→iron_mine building so
  // pre-TV2 (v1) saves keep running. The map already regenerated under v2 terrain.
  function TV2_migrateData(st) {
    const GOODMAPS = ["stock", "prices", "demand", "reserved", "produced", "consumed", "delivered", "need"];
    for (const t of (st.towns || [])) {
      for (const key of GOODMAPS) TV2_renameGood(t[key], "ore", "iron");
      for (const b of (t.buildings || [])) {
        if (b && b.typeId === "miner") b.typeId = "iron_mine";
        if (b) { TV2_renameGood(b.delivered, "ore", "iron");
                 if (b.pendingUpgrade) TV2_renameGood(b.pendingUpgrade.delivered, "ore", "iron"); }
      }
    }
    for (const c of (st.carts || [])) {
      if (c && c.goodId === "ore") c.goodId = "iron";
      if (c && Array.isArray(c.cargo)) for (const it of c.cargo) if (it && it.goodId === "ore") it.goodId = "iron";
    }
    TV2_renameGood(st.warehouse, "ore", "iron");
    TV2_renameGood(st.castleStock, "ore", "iron");
    TV2_renameGood(st.castleReserved, "ore", "iron");
    TV2_renameGood(st.castleTrade, "ore", "iron");
  }
  // Slice B: defensively normalize a loaded Research Center. Accept ONLY a
  // well-formed object; anything malformed → null (player must (re)build it).
  function normalizeResearchCenter(rc) {
    if (!rc || typeof rc !== "object") return null;
    if (typeof rc.built !== "boolean") return null;
    if (!rc.delivered || typeof rc.delivered !== "object") return null;
    const levels = (CONFIG.researchCenter && CONFIG.researchCenter.levels) || [];
    const maxLevel = Math.max(1, levels.length - 1);
    let level = (typeof rc.level === "number" && isFinite(rc.level)) ? Math.floor(rc.level) : 1;
    level = Math.min(maxLevel, Math.max(1, level));
    let pending = null;
    if (rc.pendingUpgrade && typeof rc.pendingUpgrade === "object") {
      const pu = rc.pendingUpgrade;
      // Require toLevel to name a REAL level (levels[toLevel] exists) — an
      // out-of-range toLevel would otherwise self-apply on the next tick and
      // push center.level past the table, crashing centerSpeed every tick.
      if (typeof pu.toLevel === "number" && levels[pu.toLevel] && pu.delivered && typeof pu.delivered === "object") {
        // re-derive cost from CONFIG so material metering (Research.centerUpgradeNeed) works.
        const lvlCfg = levels[pu.toLevel];
        pending = { toLevel: pu.toLevel, cost: Object.assign({}, (lvlCfg && lvlCfg.cost) || {}), delivered: pu.delivered };
      }
    }
    return { q: rc.q, r: rc.r, built: rc.built, delivered: rc.delivered, level, pendingUpgrade: pending };
  }

  // BUGFIX (save-robustness): a save can be valid JSON with the wrong VALUE
  // SHAPE for a field (e.g. `roads`/`towns` as an object instead of an array —
  // corruption, a botched migration, or a future format bug). `new Set(x)` on a
  // non-iterable `x` and `for...of` over a non-array both throw synchronously
  // and uncaught here, which used to crash the whole boot (or the Continue
  // button) with no recovery short of clearing localStorage by hand. Checked
  // by both loadGame() (last line of defense inside its try/catch, below) and
  // hasValidSave() (so Continue is never enabled for a save that would throw).
  function saveShapeOk(data) {
    return !(
      (data.towns !== undefined && !Array.isArray(data.towns)) ||
      (data.carts !== undefined && !Array.isArray(data.carts)) ||
      (data.roads !== undefined && !Array.isArray(data.roads)) ||
      (data.revealed !== undefined && !Array.isArray(data.revealed))
    );
  }
  function loadGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    data = migrate(data);
    if (!data || !saveShapeOk(data)) return false;
    try {
    newGame(data.seed, data.preset);   // === TV2: restore the saved preset ===
    // P2: SANITIZE road keys — a corrupt array ELEMENT (null / number / etc.)
    // would slip past saveShapeOk's array-type check, land in the Set, then throw
    // in drawRoads' `k.split(...)` INSIDE the shared rAF frame() before it
    // reschedules → permanent freeze of both render AND economy. Filter to
    // strings so a few garbage entries drop out instead of nuking the whole save
    // (roads are re-layable; no structural invariant depends on a bad element).
    state.roads = new Set((Array.isArray(data.roads) ? data.roads : []).filter(k => typeof k === "string"));
    // P4: SANITIZE town/building entries — same class as the P2 roads/fog fix above.
    // A corrupt array ELEMENT (a null town, or a null in a town's buildings[]) slips
    // past saveShapeOk's array-TYPE-only check, then throws in Sim.tick's production
    // loop (`CONFIG.buildings[b.typeId]` on a null b) INSIDE the shared rAF frame()
    // before it reschedules → permanent freeze of both render AND economy. Drop the
    // garbage elements so a few bad entries fall out instead of nuking the whole save.
    state.towns = (Array.isArray(data.towns) ? data.towns : []).filter(t => t && typeof t === "object");
    for (const t of state.towns) if (Array.isArray(t.buildings)) t.buildings = t.buildings.filter(b => b && typeof b === "object" && typeof b.typeId === "string");
    state.carts = Array.isArray(data.carts) ? data.carts : [];
    state.treasury = typeof data.treasury === "number" ? data.treasury : 0;
    state.tick = typeof data.tick === "number" ? data.tick : 0;   // BUGFIX: restore the sim tick so cooldownUntil / happyMods untilTick (absolute ticks) stay consistent (old saves lack it → default 0, same as pre-fix behavior)
    state.tariffRate = typeof data.tariffRate === "number" ? data.tariffRate : CONFIG.trade.tariffRate; // TARIFF-SLIDER (P5D-D)
    if (typeof data.tradeSeed === "number") state.tradeSeed = data.tradeSeed;
    state.research = Research.normalize(data.research);   // RESEARCH (P4-A)
    state.market = data.market;   // KR-A: normalized just below (guards missing/oversized/malformed)
    if (typeof Market !== "undefined" && Market.normalize) Market.normalize(state);
    else if (!state.market || typeof state.market !== "object") state.market = { hist: {}, head: 0, len: 0 };
    state.castleStock = (data.castleStock && typeof data.castleStock === "object") ? data.castleStock : {};   // CRE
    state.researchCenter = normalizeResearchCenter(data.researchCenter);   // Slice B: the unique Research Center (or null)
    if (typeof data.researchSeed === "number") state.researchSeed = data.researchSeed;   // CRE
    // PP-A: castle market config (normalized), stock reservations, market RNG.
    state.castleTrade = (typeof CastleMarket !== "undefined") ? CastleMarket.normalize(data.castleTrade)
      : ((data.castleTrade && typeof data.castleTrade === "object") ? data.castleTrade : {});
    state.castleReserved = (data.castleReserved && typeof data.castleReserved === "object") ? data.castleReserved : {};
    state.castleMarketSeed = (typeof data.castleMarketSeed === "number") ? data.castleMarketSeed
      : (hashSeed(state.seedInput) ^ 0x2545f491) | 0;
    state.prestige = typeof data.prestige === "number" ? data.prestige : 0;   // P4-B
    state.castleLevel = typeof data.castleLevel === "number" ? data.castleLevel : 1;
    state.victory = !!data.victory;
    // P4-C: restore events (a bridge event's road is stored removed from roads;
    // Events.tick re-adds it on expiry, so the road returns after repair).
    state.event = data.event || null;
    state.eventSeed = typeof data.eventSeed === "number" ? data.eventSeed : (hashSeed(state.seedInput) ^ 0x1a2b3c4d) | 0;
    state.eventCooldown = typeof data.eventCooldown === "number" ? data.eventCooldown : CONFIG.events.minGapTicks;
    state.revealAll = !!data.revealAll;
    // === SPEED-UI === (P5D-A) restore chosen speed; a saved 0 (paused) loads as
    // 1x so a game never restores frozen. Buttons are synced by setSpeed() at boot.
    state.gameSpeed = (typeof data.gameSpeed === "number" && data.gameSpeed > 0) ? data.gameSpeed : 1;
    // P5-C: restore audio mute preference (localStorage flag is the live source,
    // but honor a saved value too so an imported save carries its setting).
    if (typeof data.muted === "boolean" && typeof SFX !== "undefined") {
      SFX.setMuted(data.muted); syncMuteBtn();
    }
    for (const k of (Array.isArray(data.revealed) ? data.revealed : [])) {
      if (typeof k !== "string") continue;   // P2: skip a corrupt fog key (same class of bug as roads)
      state.revealed.add(k);
      const hex = state.map.hexes.get(k);
      if (hex) hex.revealed = true;
    }
    // L5: validate cam/zoom are finite numbers before use — a malformed value
    // here doesn't throw (no iteration), but silently NaNs the canvas transform
    // every frame after a bad load (blank/frozen viewport, no error to see why).
    const camIn = (data.cam && typeof data.cam === "object") ? data.cam : {};
    state.cam = {
      x: (typeof camIn.x === "number" && isFinite(camIn.x)) ? camIn.x : 0,
      y: (typeof camIn.y === "number" && isFinite(camIn.y)) ? camIn.y : 0,
    };
    state.zoom = (typeof data.zoom === "number" && isFinite(data.zoom) && data.zoom > 0) ? data.zoom : 1;
    setMode(data.mode || "pan");
    // === TV2: in-place data migration for old (v1) saves — the map itself
    // regenerates from the seed under the v2 terrain set (accepted in active
    // dev), but town/cart/warehouse DATA must be renamed so nothing crashes and
    // built buildings keep running (only NEW placement re-validates terrain):
    //   building typeId "miner" → "iron_mine";  good id "ore" → "iron".
    // Runs last, once every collection (towns/carts/warehouse/castle*) is restored.
    TV2_migrateData(state);
    // === CC: rename retired/renamed goods (beer→mead, tools→iron_tool, jewelry→
    // gold_ring, furniture→chairs, cloth→clothes) + weaver→tailoring across the
    // loaded save. Pure helper (PURE_CORE) so migration tests can drive it. ===
    Sim.CC_migrateGoods(state);
    terrainDirty = true;
    return true;
    } catch (err) {
      // H1: any unanticipated throw while applying a malformed-but-valid-JSON
      // save (bad field shape saveShapeOk() didn't anticipate, a normalize()
      // helper choking on garbage, etc.) must not brick boot or the Continue
      // button. newGame() above already replaced most of `state` with a fresh,
      // valid game before the throw — reset explicitly to guarantee state is
      // never left half-restored, then report the load as failed like migrate()
      // rejecting an unknown version.
      try { newGame(randomSeed()); } catch (e2) {}
      return false;
    }
  }

  // autosave every 30s + on hide (GDD §9.4)
  setInterval(saveGame, 30000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("beforeunload", saveGame);
