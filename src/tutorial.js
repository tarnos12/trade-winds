  // === TUTORIAL START === (P5D-C / slot #4 — onboarding as GUIDED MISSIONS)
  // The left "Getting Started" panel is a set of themed MISSIONS, each a small
  // cluster of objectives that teach one area of the game. Objectives advance by
  // DETECTING real game state (no click scripting): a poll runs each ~750ms and
  // each econ tick. A mission completes when all its steps are done; finishing the
  // last mission triggers a celebration. Persistence is a localStorage flag
  // ({done, mission, step}) so returning players are never re-nagged; it migrates
  // the old flat {done, step} shape. All transient tracking is module-local or in
  // the single `state.tutorial` field.
  const Tutorial = (function () {
    const LS_KEY = "tradewinds.tutorial";

    // helpers ---------------------------------------------------------------
    function townsHaveKind(s, kind) {
      for (const t of s.towns || []) {
        for (const b of (t.buildings || [])) {
          const def = CONFIG.buildings[b.typeId];
          if (def && def.kind === kind && b.built !== false) return true;
        }
      }
      return false;
    }
    function townsHaveBuilding(s, typeId) {
      for (const t of s.towns || [])
        for (const b of (t.buildings || [])) if (b.typeId === typeId && b.built !== false) return true;
      return false;
    }
    function popTotal(t) {
      const p = t.pop || {};
      return (p.peasants || 0) + (p.workers || 0) + (p.burghers || 0) + (p.aristocrats || 0);
    }

    // MISSIONS — ordered; each teaches one area. `done(s)` polls real state.
    const MISSIONS = [
      { icon: "🏰", name: "Found Your Realm", steps: [
        { title: "Found your first town",
          tip: "Open the 🏗 Build menu at the bottom, choose City, then click a revealed land hex.",
          done: s => (s.towns || []).length >= 1 },
        { title: "Place a resource building",
          tip: "From the build bar, place a Farm on fertile land or a Lumberjack in forest, next to your city.",
          done: s => townsHaveKind(s, "extractor") },
        { title: "Build a house",
          tip: "Add a Hut from the build bar — housing grows the people who staff your buildings.",
          done: s => townsHaveKind(s, "house") },
      ] },
      { icon: "🌾", name: "A Growing Town", steps: [
        { title: "Reach 10 people in a town",
          tip: "Keep basics supplied (food, wood) so your population grows. Hover a tile to see what it needs.",
          done: s => (s.towns || []).some(t => popTotal(t) >= 10) },
        { title: "Build a workshop",
          tip: "Place a processor like a Sawmill or Mill — it turns raw goods into more valuable ones.",
          done: s => townsHaveKind(s, "processor") },
        { title: "Grow a town to level 2",
          tip: "A happy, populated town can be upgraded (⬆ in its panel) for more build slots.",
          done: s => (s.towns || []).some(t => (t.level || 1) >= 2) },
      ] },
      { icon: "🛣", name: "Trade Routes", steps: [
        { title: "Found a second town",
          tip: "Towns trade goods between each other automatically. Found another city a little away.",
          done: s => (s.towns || []).length >= 2 },
        { title: "Lay a road",
          tip: "Pick the 🛣 Road tool, click a start then an end — roads let traders move twice as fast.",
          done: s => (s.roads && s.roads.size > 0) },
        { title: "Earn your first tariff",
          tip: "When towns trade you skim a tariff. Watch the 👑 treasury climb.",
          done: s => (s.treasury || 0) > startTreasury },
      ] },
      { icon: "🔬", name: "The King's Works", steps: [
        { title: "Build a Research Center",
          tip: "Place a Research Center on a hex next to the castle — it powers the tech tree.",
          done: s => !!(s.researchCenter && s.researchCenter.built !== false) },
        { title: "Unlock a technology",
          tip: "Open the 🔬 tech tree and start a project; deliver its materials to complete it.",
          done: s => (s.research && (s.research.unlocked || []).length > baseUnlocked) },
        { title: "Upgrade the castle",
          tip: "Spend prestige + gold to raise the King's castle a level — a milestone on the road to victory.",
          done: s => (s.castleLevel || 1) >= 2 },
      ] },
      { icon: "👑", name: "The Good Life", steps: [
        { title: "Raise a Citizen class",
          tip: "Supply citizens' goods (lamps, bread, mead, clothes) so burghers appear and grow.",
          done: s => (s.towns || []).some(t => (t.pop && t.pop.burghers) >= 1) },
        { title: "Build an Aristocrat's House",
          tip: "Research and build an Aristocrat's House — the top of the economy.",
          done: s => townsHaveBuilding(s, "aristocrat_home") },
        { title: "Win: an Aristocrat's House at 100% happiness",
          tip: "Supply every luxury so an aristocrat estate reaches 100% happiness — that wins the game.",
          done: s => !!s.victory },
      ] },
    ];
    // Flattened view (compat for any consumer/smoke that read Tutorial.STEPS).
    const STEPS = MISSIONS.reduce((a, m) => a.concat(m.steps), []);
    const TOTAL_MISSIONS = MISSIONS.length;

    let startTreasury = 0;   // baseline for the tariff step (captured at start)
    let baseUnlocked = 0;    // baseline research-unlocked count (captured at start)
    let active = false;
    let celebrating = false;
    let polling = false;
    let elRoot = null, elStep = null, elList = null, elBtn = null, elHead = null;

    function migrateFlag(j) {
      // old shape {done, step:flat} or new {done, mission, step}
      if (!j || typeof j !== "object") return { done: false, mission: 0, step: 0 };
      if (typeof j.mission === "number") return { done: !!j.done, mission: j.mission | 0, step: j.step | 0 };
      return { done: !!j.done, mission: 0, step: 0 };   // flat → restart missions unless finished
    }
    function loadFlag() {
      try { return migrateFlag(JSON.parse(localStorage.getItem(LS_KEY))); } catch (e) { return { done: false, mission: 0, step: 0 }; }
    }
    function saveFlag() {
      try {
        const t = state.tutorial || {};
        localStorage.setItem(LS_KEY, JSON.stringify({ done: !!t.done, mission: t.mission | 0, step: t.step | 0 }));
      } catch (e) { /* private mode / quota — ignore */ }
    }

    function ensureEls() {
      if (elRoot) return;
      elRoot = document.getElementById("tutorial");
      elStep = document.getElementById("tutStep");
      elList = document.getElementById("tutList");
      elBtn  = document.getElementById("tutSkip");
      elHead = document.querySelector("#tutorial .tut-head b");
      if (elBtn) elBtn.addEventListener("click", onSkip);
    }
    function show() { if (elRoot) { elRoot.classList.remove("hidden"); elRoot.setAttribute("aria-hidden", "false"); } }
    function hide() { if (elRoot) { elRoot.classList.add("hidden"); elRoot.setAttribute("aria-hidden", "true"); elRoot.classList.remove("celebrate"); } }

    function render() {
      if (!elRoot || !state.tutorial) return;
      const mi = Math.min(state.tutorial.mission | 0, TOTAL_MISSIONS);
      const m = MISSIONS[mi];
      if (elHead) elHead.textContent = celebrating || !m
        ? "👑 Getting Started"
        : m.icon + " Mission " + (mi + 1) + "/" + TOTAL_MISSIONS + " · " + m.name;

      if (celebrating) {
        elStep.innerHTML = '<div class="tut-cheer">🎉 You\'ve mastered Trade Winds!</div>' +
          '<div class="tut-tip">Every mission complete — the winds are yours to shape.</div>';
        elList.innerHTML = "";
        return;
      }
      if (!m) return;
      const si = Math.min(state.tutorial.step | 0, m.steps.length);
      const cur = m.steps[si] || m.steps[m.steps.length - 1];
      elStep.innerHTML = '<div class="tut-now">▶ ' + cur.title + "</div>" +
                         '<div class="tut-tip">' + cur.tip + "</div>";
      let html = "";
      for (let k = 0; k < m.steps.length; k++) {
        const isDone = k < si;
        const isCur = k === si;
        const cls = isDone ? "done" : (isCur ? "cur" : "");
        const mk = isDone ? "✓" : (isCur ? "▶" : "○");
        html += '<li class="' + cls + '"><span class="mk">' + mk + "</span><span>" + m.steps[k].title + "</span></li>";
      }
      elList.innerHTML = html;
    }

    // Poll: advance through satisfied steps/missions; celebrate at the very end.
    function tick() {
      if (!active || !state.tutorial || state.tutorial.done) return;
      const t = state.tutorial;
      let advanced = false, missionUp = false;
      // guard against runaway loops with a bounded walk
      for (let guard = 0; guard < STEPS.length + TOTAL_MISSIONS + 2; guard++) {
        const m = MISSIONS[t.mission | 0];
        if (!m) break;
        if (t.step < m.steps.length && m.steps[t.step].done(state)) { t.step++; advanced = true; continue; }
        if (t.step >= m.steps.length) {           // mission finished → next mission
          t.mission++; t.step = 0; advanced = true; missionUp = true;
          if ((t.mission | 0) >= TOTAL_MISSIONS) { celebrate(); return; }
          continue;
        }
        break;   // current step not yet satisfied
      }
      if (advanced) {
        saveFlag(); render();
        if (missionUp && typeof SFX !== "undefined" && SFX.play) { try { SFX.play("levelup"); } catch (e) {} }
      }
    }

    function celebrate() {
      const t = state.tutorial;
      t.done = true; t.mission = TOTAL_MISSIONS; t.step = 0;
      saveFlag();
      celebrating = true; active = false;
      if (elRoot) elRoot.classList.add("celebrate");
      render();
      if (typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest"); } catch (e) {} }
      setTimeout(() => { celebrating = false; hide(); }, 5200);
    }

    function onSkip() {
      state.tutorial = state.tutorial || { mission: 0, step: 0, done: false };
      state.tutorial.done = true;
      state.tutorial.mission = TOTAL_MISSIONS; state.tutorial.step = 0;
      saveFlag();
      active = false; celebrating = false;
      hide();
    }

    function captureBaselines() {
      startTreasury = state.treasury || 0;
      baseUnlocked = (state.research && (state.research.unlocked || []).length) || 0;
    }

    // Fresh game: start from mission 0 unless the player already finished/skipped.
    function startFresh() {
      ensureEls();
      const flag = loadFlag();
      if (flag.done) { state.tutorial = { mission: TOTAL_MISSIONS, step: 0, done: true }; active = false; hide(); return; }
      state.tutorial = { mission: 0, step: 0, done: false };
      captureBaselines();
      celebrating = false; active = true;
      if (elRoot) elRoot.classList.remove("celebrate");
      saveFlag(); show(); render(); tick();
    }

    // Loaded game: resume an in-progress mission run; leave finished/skipped alone.
    function resume() {
      ensureEls();
      const flag = loadFlag();
      if (flag.done || (flag.mission <= 0 && flag.step <= 0)) {
        state.tutorial = { mission: flag.mission, step: flag.step, done: !!flag.done }; active = false; hide(); return;
      }
      state.tutorial = { mission: Math.min(flag.mission, TOTAL_MISSIONS), step: flag.step | 0, done: false };
      captureBaselines();
      celebrating = false; active = true;
      show(); render(); tick();
    }

    function startPolling() { if (polling) return; polling = true; setInterval(tick, 750); }

    return { STEPS, MISSIONS, startFresh, resume, tick, startPolling, hide,
             isActive: () => active };
  })();
  window.Tutorial = Tutorial;   // exposed for headless smoke + console
  // === TUTORIAL END ===
