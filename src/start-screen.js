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

    // === TV2: fill the preset dropdown from CONFIG.mapPresets (once). ===
    if (presetEl && !presetEl.options.length) {
      for (const id of Object.keys(CONFIG.mapPresets || {})) {
        const opt = document.createElement("option");
        opt.value = id; opt.textContent = CONFIG.mapPresets[id].label || id;
        presetEl.appendChild(opt);
      }
      presetEl.value = CONFIG.mapPresetDefault || "fertile";
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
      if (presetEl) presetEl.value = state.mapPreset || CONFIG.mapPresetDefault || "fertile";   // === TV2 ===
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
    function startNew(seedArg, presetArg) {
      const seed = (typeof seedArg === "string" && seedArg.trim())
        ? seedArg.trim()
        : (seedEl.value.trim() || randomSeed());
      // === TV2: preset from arg (smoke harness / API) or the dropdown. ===
      const preset = (typeof presetArg === "string" && CONFIG.mapPresets[presetArg])
        ? presetArg
        : ((presetEl && presetEl.value) || CONFIG.mapPresetDefault || "fertile");
      newGame(seed, preset);
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
    btnDice.addEventListener("click", () => { seedEl.value = randomSeed(); });
    seedEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); startNew(); } });

    return { show, hide, isOpen: () => open, startNew, continueSave, refreshContinue };
  })();
  window.StartScreen = StartScreen;
  // === START-SCREEN END ===
