  // Economy tick: the pure cores defined above in PURE_CORE are used directly —
  // each 500ms step the loop below calls Sim.tick(state) (production/consumption/
  // prices) then Trade.tick(state) (cart dispatch + transactions + tariff). No
  // local stubs: the closure sees the top-level `Sim` / `Trade` namespaces.

  // ---------------------------------------------------------------
  // Canvas sizing
  // ---------------------------------------------------------------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    // The frame's drawWithDpr() folds DPR into its world transform each frame.
    DPR = dpr;
  }
  let DPR = 1;
  window.addEventListener("resize", resize);

  // ---------------------------------------------------------------
  // Two-clock main loop (GDD §9.2)
  //   render on rAF; economy on fixed 500ms * gameSpeed accumulator
  // ---------------------------------------------------------------
  let lastTime = performance.now();
  let econAcc = 0;
  let _prevQuestReward = null;   // AUDIO (P5-C): tracks quest-complete edge for the fanfare cue
  let fpsSmoothed = 60, fpsTimer = 0, fpsFrames = 0;

  const fpsEl = document.getElementById("fps");
  const statEl = document.getElementById("stat");

  function frame(now) {
    const dt = Math.min(100, now - lastTime);
    lastTime = now;

    // economy clock — paused when tab hidden (GDD §9.2 default)
    if (state.gameSpeed > 0 && !document.hidden) {
      econAcc += dt * state.gameSpeed;
      const step = CONFIG.econ.baseTickMs;
      let guard = 0;
      while (econAcc >= step && guard++ < 8) {
        Sim.tick(state);
        // AUDIO (P5-C): isolate the tariff credit so only autonomous sales chime
        // (a throttle in SFX keeps a busy economy from machine-gunning).
        const _treasBefore = state.treasury || 0;
        Trade.tick(state);
        if ((state.treasury || 0) > _treasBefore + 1e-6) SFX.playThrottled("trade", 550, "tariff income");
        // KR-A: sample the kingdom-wide market AFTER production + trade so the
        // reading reflects this tick's stock/price movement (guarded; pure).
        if (typeof Market !== "undefined" && Market.tick) Market.tick(state);
        // CRE: run the castle's research-buyer traders BEFORE Research.tick so any
        // material delivered this tick counts toward completion. RT-A2: buyers run
        // autonomously whenever a node is active (no longer gated on the castle panel).
        if (typeof ResearchEconomy !== "undefined") {
          ResearchEconomy.tick(state);
        }
        // PP-A: castle MARKET buyers run AFTER research buyers (research materials
        // get first pick of the shared fleet), buying player-enabled goods to limit.
        if (typeof CastleMarket !== "undefined") CastleMarket.tick(state);
        // Slice A: deliver materials from castleStock into the Research Center
        // (build/upgrade) AFTER the buyers stocked the castle, BEFORE research runs.
        if (typeof Research !== "undefined" && Research.tickCenter) Research.tickCenter(state);
        Research.tick(state); Quests.tick(state); Victory.check(state);
        // AUDIO (P5-C): a new lastQuestReward object means a quest just completed.
        if (state.lastQuestReward && state.lastQuestReward !== _prevQuestReward) {
          _prevQuestReward = state.lastQuestReward;
          SFX.play("quest", "quest done");
        }
        if (typeof Events !== "undefined" && Events.tick) {   // P4-C: random events after trade
          Events.tick(state);
          if (state._eventNotice) { handleEventNotice(state._eventNotice); state._eventNotice = null; }
        }
        if (typeof Tutorial !== "undefined") Tutorial.tick(state);  // P5D-C: advance onboarding coach
        econAcc -= step;
      }
    }

    applyKeyPan(dt);
    drawWithDpr(dt);

    // FPS meter
    fpsFrames++; fpsTimer += dt;
    if (fpsTimer >= 500) {
      fpsSmoothed = Math.round(fpsFrames * 1000 / fpsTimer);
      fpsFrames = 0; fpsTimer = 0;
      fpsEl.textContent = fpsSmoothed;
      fpsEl.className = "fps" + (fpsSmoothed < 50 ? " warn" : "");
      statEl.textContent =
        `${state.map.hexes.size} hexes · ${state.towns.length} towns · ${state.roads.size} roads · z${state.zoom.toFixed(2)}`;
    }
    requestAnimationFrame(frame);
  }

  // wraps draw() so the device-pixel-ratio scale is applied on top of the
  // world transform (draw() calls setTransform itself, so multiply DPR in)
  function drawWithDpr(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#14110c";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(
      state.zoom * DPR, 0, 0, state.zoom * DPR,
      (W / 2 - state.cam.x * state.zoom) * DPR,
      (H / 2 - state.cam.y * state.zoom) * DPR
    );
    if (terrainDirty) renderTerrain();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainCanvas, terrainOrigin.x, terrainOrigin.y);
    drawRoads();
    drawTowns();
    drawBuildings();  // TI-C: player-placed buildings, on top of town tokens
    InternalTraders.frame(dt);  // TR-B: ambient within-city porter carts (read-only overlay)
    drawAlerts();     // P4-C: subtle status icons over towns in a bad state
    drawCarts(dt);    // CARTS (T9): live trade carts, drawn right after towns
    drawCastle();
    drawResearchCenter();   // RESEARCH CENTER (Slice C): the King's Research Center, beside the castle
    drawPlacementOverlay(); // TI-C: valid/invalid highlight while placing
    drawHoverGhost();
    Juice.frame(dt);        // P5-B: cozy micro-animation overlay (read-only, last)
    PPE.frame(dt);          // === PP-E === map juice: speech bubbles / wanted rows /
                            // gold floaters (read-only overlay, drawn topmost)
  }
