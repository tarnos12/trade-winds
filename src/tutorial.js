  // === TUTORIAL START === (P5D-C / slot #4 — onboarding coach; state-detected)
  // A cozy, skippable corner coach that walks a fresh player through the core
  // loop. Steps advance by DETECTING real game state (not scripted clicks): a
  // poll runs each ~750ms and each econ tick. Persistence is a small localStorage
  // flag ({done, step}) so the coach never re-nags returning players; it only
  // shows for a fresh game (or resumes a fresh game still in progress). All
  // transient tracking is module-local or in the single `state.tutorial` field.
  const Tutorial = (function () {
    const LS_KEY = "tradewinds.tutorial";

    // Ordered steps. `done(state)` polls real state — no click scripting.
    const STEPS = [
      { icon: "🏰", title: "Found your first town",
        tip: "Open the 🏗 Build menu at the bottom, choose City, then click a revealed land hex.",
        done: s => s.towns.length >= 1 },
      { icon: "🌾", title: "Place an extractor",
        tip: "Pick a building from the build bar at the bottom, then place a Farm on fertile land (or a Lumberjack in forest) next to a city.",
        done: s => townsHaveKind(s, "extractor") },
      { icon: "🏠", title: "Build a house",
        tip: "Add a Hut from the build bar at the bottom — housing grows the workers that staff your buildings.",
        done: s => townsHaveKind(s, "house") },
      { icon: "⬆️", title: "Grow a town to level 2",
        tip: "Keep the town happy and populated, then upgrade it for more build slots.",
        done: s => s.towns.some(t => (t.level || 1) >= 2) },
      { icon: "🛣", title: "Connect two towns with a road",
        tip: "Pick the 🛣 Road tool and drag a path between towns so carts can travel.",
        done: s => s.roads.size > 0 },
      { icon: "👑", title: "Earn your first tariff",
        tip: "When towns trade over your roads you skim a tariff. Watch the 👑 treasury climb.",
        done: s => (s.treasury || 0) > startTreasury },
    ];

    let startTreasury = 0;   // baseline for the tariff step (captured at start)
    let active = false;      // panel shown & advancing
    let celebrating = false; // showing the completion cheer
    let polling = false;
    let elRoot = null, elStep = null, elList = null, elBtn = null;

    function townsHaveKind(s, kind) {
      for (const t of s.towns) {
        for (const b of (t.buildings || [])) {
          const def = CONFIG.buildings[b.typeId];
          if (def && def.kind === kind) return true;
        }
      }
      return false;
    }

    function loadFlag() {
      try {
        const j = JSON.parse(localStorage.getItem(LS_KEY));
        if (j && typeof j === "object") return { done: !!j.done, step: j.step | 0 };
      } catch (e) {}
      return { done: false, step: 0 };
    }
    function saveFlag() {
      try {
        const t = state.tutorial || {};
        localStorage.setItem(LS_KEY, JSON.stringify({ done: !!t.done, step: t.step | 0 }));
      } catch (e) { /* private mode / quota — ignore */ }
    }

    function ensureEls() {
      if (elRoot) return;
      elRoot = document.getElementById("tutorial");
      elStep = document.getElementById("tutStep");
      elList = document.getElementById("tutList");
      elBtn  = document.getElementById("tutSkip");
      if (elBtn) elBtn.addEventListener("click", onSkip);
    }
    function show() { if (elRoot) { elRoot.classList.remove("hidden"); elRoot.setAttribute("aria-hidden", "false"); } }
    function hide() { if (elRoot) { elRoot.classList.add("hidden"); elRoot.setAttribute("aria-hidden", "true"); elRoot.classList.remove("celebrate"); } }

    function render() {
      if (!elRoot || !state.tutorial) return;
      const i = Math.min(state.tutorial.step | 0, STEPS.length);
      if (celebrating) {
        elStep.innerHTML = '<div class="tut-cheer">🎉 You\'ve mastered the basics!</div>' +
          '<div class="tut-tip">The winds are yours to shape — build, connect, and prosper.</div>';
      } else if (STEPS[i]) {
        const s = STEPS[i];
        elStep.innerHTML = '<div class="tut-now">' + s.icon + " " + s.title + "</div>" +
          '<div class="tut-tip">' + s.tip + "</div>";
      }
      let html = "";
      for (let k = 0; k < STEPS.length; k++) {
        const isDone = k < i;
        const isCur = k === i && !celebrating;
        const cls = isDone ? "done" : (isCur ? "cur" : "");
        const mk = isDone ? "✓" : (isCur ? "▶" : "○");
        html += '<li class="' + cls + '"><span class="mk">' + mk + "</span><span>" + STEPS[k].title + "</span></li>";
      }
      elList.innerHTML = html;
    }

    // Poll: advance through any satisfied steps; celebrate + retire at the end.
    function tick() {
      if (!active || !state.tutorial || state.tutorial.done) return;
      const t = state.tutorial;
      let advanced = false;
      while (t.step < STEPS.length && STEPS[t.step].done(state)) { t.step++; advanced = true; }
      if (advanced) saveFlag();
      if (t.step >= STEPS.length) { celebrate(); return; }   // celebrate() renders the cheer
      if (advanced) render();
    }

    function celebrate() {
      const t = state.tutorial;
      t.done = true; t.step = STEPS.length;
      saveFlag();
      celebrating = true; active = false;
      if (elRoot) elRoot.classList.add("celebrate");
      render();
      if (typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest"); } catch (e) {} }
      setTimeout(() => { celebrating = false; hide(); }, 5200);
    }

    function onSkip() {
      state.tutorial = state.tutorial || { step: 0, done: false };
      state.tutorial.done = true;
      state.tutorial.step = STEPS.length;
      saveFlag();
      active = false; celebrating = false;
      hide();
    }

    // Fresh game (boot with no save, or an explicit New/Generate). Shows from
    // step 0 unless the player has already finished/skipped the tutorial before.
    function startFresh() {
      ensureEls();
      const flag = loadFlag();
      if (flag.done) { state.tutorial = { step: STEPS.length, done: true }; active = false; hide(); return; }
      state.tutorial = { step: 0, done: false };
      startTreasury = state.treasury || 0;
      celebrating = false; active = true;
      if (elRoot) elRoot.classList.remove("celebrate");
      saveFlag(); show(); render(); tick();
    }

    // Loaded game: only resume a fresh-game tutorial that was still in progress
    // (step > 0, not done). Returning players who finished/skipped stay untouched.
    function resume() {
      ensureEls();
      const flag = loadFlag();
      if (flag.done || flag.step <= 0) { state.tutorial = { step: flag.step, done: !!flag.done }; active = false; hide(); return; }
      state.tutorial = { step: Math.min(flag.step, STEPS.length), done: false };
      startTreasury = state.treasury || 0;   // baseline for the tariff step on resume
      celebrating = false; active = true;
      show(); render(); tick();
    }

    function startPolling() { if (polling) return; polling = true; setInterval(tick, 750); }

    return { STEPS, startFresh, resume, tick, startPolling, hide,
             isActive: () => active };
  })();
  window.Tutorial = Tutorial;   // exposed for headless smoke + console
  // === TUTORIAL END ===
