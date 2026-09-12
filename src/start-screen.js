  // === START-SCREEN ===
  // Title / start overlay + boot gating (P5D-B). The rAF render loop keeps
  // running behind the overlay (the map is a paused backdrop), but the economy
  // is halted (state.gameSpeed = 0) until the player picks New Game / Continue.
  // A read-only save probe so we can enable Continue without mutating state.
  function hasValidSave() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    data = migrate(data);
    // H2: shape-check too (not just saveVersion) so Continue is never enabled
    // for a save loadGame() would reject/throw on — same guard loadGame() uses.
    return !!data && saveShapeOk(data);
  }

  const StartScreen = (() => {
    const overlay = document.getElementById("startScreen");
    const seedEl = document.getElementById("ssSeed");
    const presetEl = document.getElementById("ssPreset");   // === TV2: map picker ===
    const btnNew = document.getElementById("ssNew");
    const btnContinue = document.getElementById("ssContinue");
    const btnDice = document.getElementById("ssDice");
    let open = false;

    // === Custom Map ===  These are all built dynamically here (start-screen.js
    // is the only file this agent owns; index.html is the build OUTPUT and must
    // not be hand-edited). The panel injects its own <style> and DOM, following
    // the EventLog self-contained-module pattern.
    const CUSTOM_ID = "custom";
    const TIER_AXES = Object.keys(CONFIG.mapTiers || {});           // ordered by config
    const tierSel = {};                                             // axis -> <select>
    let lastBase = CONFIG.mapPresetDefault || "fertile";           // base preset the custom world derives from
    let customPanel = null, baseNoteEl = null;

    // === TV2: fill the preset dropdown from CONFIG.mapPresets, then a Custom
    // entry at the end (once). ===
    if (presetEl && !presetEl.options.length) {
      for (const id of Object.keys(CONFIG.mapPresets || {})) {
        const opt = document.createElement("option");
        opt.value = id; opt.textContent = CONFIG.mapPresets[id].label || id;
        presetEl.appendChild(opt);
      }
      const custOpt = document.createElement("option");
      custOpt.value = CUSTOM_ID; custOpt.textContent = "Custom…";
      presetEl.appendChild(custOpt);
      presetEl.value = CONFIG.mapPresetDefault || "fertile";
    }

    // ---- inject the custom-panel stylesheet (once) ----
    function injectStyle() {
      if (document.getElementById("ssCustomStyle")) return;
      const st = document.createElement("style");
      st.id = "ssCustomStyle";
      st.textContent =
        "#ssCustom{margin:4px auto 0;max-width:400px;text-align:left;border:1px solid var(--panel-edge);" +
        "border-radius:10px;padding:12px 14px;background:rgba(0,0,0,0.18);}" +
        "#ssCustom .ss-cust-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px;}" +
        "#ssCustom .ss-cust-title{font-size:12.5px;font-weight:bold;color:var(--accent);letter-spacing:.3px;}" +
        "#ssCustom .ss-cust-base{font-size:11px;opacity:.65;}" +
        "#ssCustom .ss-cust-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;}" +
        "#ssCustom .ss-cust-row{display:flex;flex-direction:column;gap:2px;}" +
        "#ssCustom .ss-cust-row label{font-size:10.5px;opacity:.78;letter-spacing:.2px;}" +
        "#ssCustom .ss-cust-row select{background:#1c160f;color:var(--paper);border:1px solid var(--panel-edge);" +
        "border-radius:6px;padding:5px 6px;font-family:inherit;font-size:12.5px;}" +
        "#ssCustom .ss-cust-row select:disabled{opacity:.4;cursor:not-allowed;}" +
        "#ssRegen{margin-top:10px;width:100%;font-size:13px;padding:8px 12px;border-radius:8px;font-weight:bold;" +
        "background:transparent;color:var(--paper);border:1px solid var(--panel-edge);cursor:pointer;}" +
        "#ssRegen:hover{border-color:var(--accent);color:var(--accent);}";
      document.head.appendChild(st);
    }

    // ---- build the panel DOM (once), inserted right after the Map row ----
    function buildPanel() {
      if (customPanel || !presetEl) return;
      injectStyle();
      const panel = document.createElement("div");
      panel.id = "ssCustom"; panel.hidden = true;
      const head = document.createElement("div");
      head.className = "ss-cust-head";
      head.innerHTML = '<span class="ss-cust-title">Custom world</span>';
      baseNoteEl = document.createElement("span");
      baseNoteEl.className = "ss-cust-base";
      head.appendChild(baseNoteEl);
      panel.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "ss-cust-grid";
      for (const axis of TIER_AXES) {
        const ax = CONFIG.mapTiers[axis];
        const row = document.createElement("div");
        row.className = "ss-cust-row";
        const lab = document.createElement("label");
        lab.textContent = ax.label || axis;
        lab.setAttribute("for", "ssTier_" + axis);
        const sel = document.createElement("select");
        sel.id = "ssTier_" + axis;
        for (const o of ax.options) {
          const opt = document.createElement("option");
          opt.value = o.id; opt.textContent = o.label || o.id;
          sel.appendChild(opt);
        }
        sel.value = ax.default;
        sel.addEventListener("change", () => { if (presetEl.value === CUSTOM_ID) previewCustom(); });
        tierSel[axis] = sel;
        row.appendChild(lab); row.appendChild(sel);
        grid.appendChild(row);
      }
      panel.appendChild(grid);

      const regen = document.createElement("button");
      regen.id = "ssRegen"; regen.type = "button";
      regen.textContent = "🎲 Regenerate (new seed)";
      regen.addEventListener("click", () => { seedEl.value = randomSeed(); previewCustom(); });
      panel.appendChild(regen);

      const mapRow = presetEl.closest(".ss-seedrow") || presetEl.parentNode;
      mapRow.parentNode.insertBefore(panel, mapRow.nextSibling);
      customPanel = panel;
    }

    // ---- read the current tier selection off the dropdowns ----
    function readTiers() {
      const t = { base: lastBase };
      for (const axis of TIER_AXES) t[axis] = tierSel[axis] ? tierSel[axis].value : CONFIG.mapTiers[axis].default;
      return t;
    }
    // ---- write a tier selection (or a base preset's defaults) into the dropdowns ----
    function setTiersUI(tiers) {
      const baseTiers = (CONFIG.mapPresets[lastBase] && CONFIG.mapPresets[lastBase].tiers) || CONFIG.mapTiersDefault || {};
      for (const axis of TIER_AXES) {
        if (!tierSel[axis]) continue;
        const want = (tiers && tiers[axis]) || baseTiers[axis] || CONFIG.mapTiers[axis].default;
        tierSel[axis].value = CONFIG.mapTiers[axis].options.some(o => o.id === want) ? want : CONFIG.mapTiers[axis].default;
      }
      syncBaseNote();
    }
    // ---- grey out Sea Level when the base preset has no water (axis is inert) ----
    function syncBaseNote() {
      const base = CONFIG.mapPresets[lastBase] || {};
      if (baseNoteEl) baseNoteEl.textContent = "based on " + (base.label || lastBase);
      const noWater = base.water && base.water.mode === "none";
      if (tierSel.seaLevel) { tierSel.seaLevel.disabled = !!noWater; tierSel.seaLevel.title = noWater ? "No sea on this base map" : ""; }
    }
    function showPanel(v) { buildPanel(); if (customPanel) customPanel.hidden = !v; }

    // ---- live PREVIEW: regenerate the backdrop map from the current custom
    // selection WITHOUT saving (so rolling worlds never clobbers Continue). ----
    function previewCustom(seed) {
      const s = (typeof seed === "string" && seed.trim()) ? seed.trim() : (seedEl.value.trim() || randomSeed());
      seedEl.value = s;
      try { newGame(s, CUSTOM_ID, readTiers(), true /* noSave */); } catch (e) {}
    }

    function refreshContinue() {
      const ok = hasValidSave();
      btnContinue.disabled = !ok;
      return ok;
    }
    function show() {
      open = true;
      state.gameSpeed = 0;                       // pause economy while the menu is up
      overlay.classList.remove("hidden");
      seedEl.value = state.seedInput || randomSeed();
      buildPanel();
      // === Custom Map: restore the picker to the running world's settings. ===
      if (state.mapPreset === CUSTOM_ID) {
        if (state.mapTiers && CONFIG.mapPresets[state.mapTiers.base]) lastBase = state.mapTiers.base;
        if (presetEl) presetEl.value = CUSTOM_ID;
        setTiersUI(state.mapTiers);
        showPanel(true);
      } else {
        if (presetEl) presetEl.value = state.mapPreset || CONFIG.mapPresetDefault || "fertile";   // === TV2 ===
        lastBase = (presetEl && CONFIG.mapPresets[presetEl.value]) ? presetEl.value : lastBase;
        showPanel(false);
      }
      refreshContinue();
      requestAnimationFrame(() => overlay.classList.add("in"));
    }
    function hide() {
      open = false;
      overlay.classList.remove("in");
      overlay.classList.add("hidden");
    }
    function begin() {                           // resume play + close the overlay
      setSpeed(1);   // route through P5D-A so the speed toolbar syncs to 1x on start
      hide();
    }
    function startNew(seedArg, presetArg, tiersArg) {
      const seed = (typeof seedArg === "string" && seedArg.trim())
        ? seedArg.trim()
        : (seedEl.value.trim() || randomSeed());
      // === TV2 / Custom Map: preset from arg (smoke harness / API) or the dropdown. ===
      const preset = (typeof presetArg === "string" && (CONFIG.mapPresets[presetArg] || presetArg === CUSTOM_ID))
        ? presetArg
        : ((presetEl && presetEl.value) || CONFIG.mapPresetDefault || "fertile");
      let tiers = null;
      if (preset === CUSTOM_ID) tiers = (tiersArg && typeof tiersArg === "object") ? tiersArg : readTiers();
      newGame(seed, preset, tiers);
      setMode(state.mode);
      begin();
      if (typeof Tutorial !== "undefined") Tutorial.startFresh();  // P5D-C: onboarding on a new game
    }
    function continueSave() {
      if (!loadGame()) { refreshContinue(); return false; }   // no valid save
      setMode(state.mode);
      begin();
      if (typeof Tutorial !== "undefined") Tutorial.resume();     // P5D-C: resume an in-progress tutorial
      return true;
    }

    btnNew.addEventListener("click", () => startNew());
    btnContinue.addEventListener("click", () => continueSave());
    btnDice.addEventListener("click", () => { seedEl.value = randomSeed(); if (presetEl.value === CUSTOM_ID) previewCustom(); });
    seedEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); startNew(); } });

    // "Main Menu" (in the ☰ menu, added v0.38.2): save the current game so
    // Continue resumes it exactly, close the ☰ popup, and reopen this overlay
    // (which also pauses the economy). saveGame() is shared IIFE scope.
    const btnMainMenu = document.getElementById("btnMainMenu");
    if (btnMainMenu) btnMainMenu.addEventListener("click", () => {
      try { if (typeof saveGame === "function") saveGame(); } catch (e) {}
      const menu = document.getElementById("hudMenu");
      if (menu) { menu.classList.remove("anim-in"); menu.classList.add("hidden"); }
      show();
    });
    // === Custom Map: reveal the panel + live-preview when "Custom…" is picked;
    // otherwise remember the chosen preset as the base for a later custom world. ===
    if (presetEl) presetEl.addEventListener("change", () => {
      if (presetEl.value === CUSTOM_ID) {
        showPanel(true);
        setTiersUI(null);            // prefill from lastBase's identity tiers
        previewCustom();
      } else {
        lastBase = CONFIG.mapPresets[presetEl.value] ? presetEl.value : lastBase;
        showPanel(false);
        syncBaseNote();
      }
    });

    return { show, hide, isOpen: () => open, startNew, continueSave, refreshContinue };
  })();
  window.StartScreen = StartScreen;
  // === START-SCREEN END ===
