  // === TUTORIAL START === (U — reworked from the hardcoded 5-mission coach into a
  // DATA-DRIVEN MISSION ENGINE runtime). The left "Getting Started" panel now runs a
  // MISSION SET (the bundled MissionEngine.DEFAULT, or the player's authored JSON in
  // localStorage["tradewinds.missions"] written by the mission editor). Missions have
  // typed objectives (construct/upgrade/trade_good/earn_tax) evaluated against the
  // pure `state.stats` lifetime counters via MissionEngine (PURE_CORE) — no click
  // scripting. A mission ACTIVATES only when its prereqs are complete; non-retroactive
  // missions snapshot a per-objective baseline at activation so progress counts "from
  // now", while retroactive missions (the default) count lifetime. A poll runs each
  // ~750ms and each econ tick. Progress lives on `state.missions` (save-persisted) and
  // is mirrored to localStorage["tradewinds.tutorial"] as a {done,skipped}+progress
  // gate so returning players aren't re-nagged. Keeps the window.Tutorial API
  // (startFresh/resume/startPolling/hide/isActive/tick).
  const Tutorial = (function () {
    const LS_KEY = "tradewinds.tutorial";        // done/skip gate + progress mirror
    const MISSIONS_KEY = "tradewinds.missions";  // EditorDev writes the authored set here; we READ it

    // ---- mission-set loading -------------------------------------------------
    let cachedSet = null;
    function loadAuthored() {
      try {
        const raw = localStorage.getItem(MISSIONS_KEY);
        if (!raw) return null;
        const norm = MissionEngine.normalize(JSON.parse(raw));
        return (norm && norm.missions.length) ? norm : null;   // ignore empty/malformed → DEFAULT
      } catch (e) { return null; }
    }
    // The live mission set: the player's authored set if valid, else the DEFAULT.
    function currentSet() {
      if (cachedSet) return cachedSet;
      cachedSet = loadAuthored() || MissionEngine.normalize(MissionEngine.DEFAULT);
      return cachedSet;
    }
    function reloadSet() { cachedSet = null; return currentSet(); }

    // ---- progress state ------------------------------------------------------
    // Authoritative live progress is state.missions; a light gate is mirrored to LS.
    function freshProg() { return { done: false, skipped: false, activated: {}, baselines: {}, completed: {} }; }
    function migrateProg(j) {
      // old tutorial shape: {done, mission, step} / {done, step}. New: full prog obj.
      if (!j || typeof j !== "object") return freshProg();
      if ("mission" in j || "step" in j) { const p = freshProg(); p.done = !!j.done; return p; }  // legacy → keep only the done gate
      const p = freshProg();
      p.done = !!j.done; p.skipped = !!j.skipped;
      if (j.activated && typeof j.activated === "object") p.activated = j.activated;
      if (j.baselines && typeof j.baselines === "object") p.baselines = j.baselines;
      if (j.completed && typeof j.completed === "object") p.completed = j.completed;
      return p;
    }
    function loadProgFromLS() {
      try { return migrateProg(JSON.parse(localStorage.getItem(LS_KEY))); } catch (e) { return freshProg(); }
    }
    // Ensure state.missions exists + is well-shaped (migrate old saves defensively).
    function ensureProg(state) {
      if (!state.missions || typeof state.missions !== "object") state.missions = loadProgFromLS();
      const p = state.missions;
      if (!p.activated || typeof p.activated !== "object") p.activated = {};
      if (!p.baselines || typeof p.baselines !== "object") p.baselines = {};
      if (!p.completed || typeof p.completed !== "object") p.completed = {};
      p.done = !!p.done; p.skipped = !!p.skipped;
      return p;
    }
    function persist(state) {
      const p = state && state.missions ? state.missions : freshProg();
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          done: !!p.done, skipped: !!p.skipped,
          activated: p.activated, baselines: p.baselines, completed: p.completed,
        }));
      } catch (e) { /* private mode / quota — ignore */ }
    }

    // Stats accessor (guarded for the headless smoke that has no Sim).
    function stateStats(state) {
      return (typeof Sim !== "undefined" && Sim.ensureStats) ? Sim.ensureStats(state)
        : (state.stats || { constructed: { total: 0, byType: {} }, upgraded: { total: 0, byType: {} }, traded: { byGood: {} }, taxEarned: 0 });
    }

    // Clamp each stored baseline to the CURRENT lifetime counter. A baseline is a
    // past snapshot, so it can never legitimately exceed the live counter; clamping
    // makes the runtime self-heal if the lifetime stats reset (e.g. a save that did
    // not yet persist state.stats) — a non-retro mission then degrades to counting
    // from 0 rather than showing negative/stuck progress. Correct saves are unaffected
    // (stored ≤ lifetime already).
    function clampBaselines(set, stats, baselines) {
      const out = {};
      for (const m of set.missions) {
        const arr = baselines[m.id];
        if (!Array.isArray(arr)) continue;
        out[m.id] = m.objectives.map((o, i) => {
          const stored = typeof arr[i] === "number" ? arr[i] : 0;
          return Math.min(stored, MissionEngine.readLifetime(o, stats));
        });
      }
      return out;
    }

    // ---- runtime state + DOM -------------------------------------------------
    let active = false;
    let celebrating = false;
    let polling = false;
    let elRoot = null, elStep = null, elList = null, elBtn = null, elHead = null;

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

    // ---- labels --------------------------------------------------------------
    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
    function prettyBuilding(id) {
      if (!id || id === "any") return "buildings";
      const d = (typeof CONFIG !== "undefined" && CONFIG.buildings) ? CONFIG.buildings[id] : null;
      return (d && d.name) || id;
    }
    function prettyGood(id) {
      const g = (typeof CONFIG !== "undefined" && CONFIG.goods) ? CONFIG.goods[id] : null;
      return (g && g.name) || id;
    }
    function objLabel(obj) {
      switch (obj.type) {
        case "construct": return (obj.building && obj.building !== "any") ? "Build " + prettyBuilding(obj.building) : "Construct buildings";
        case "upgrade":   return (obj.building && obj.building !== "any") ? "Upgrade " + prettyBuilding(obj.building) : "Complete upgrades";
        case "trade_good": return "Trade " + prettyGood(obj.good);
        case "earn_tax":   return "Earn tariffs 👑";
        default: return obj.type;
      }
    }

    // ---- render --------------------------------------------------------------
    function render(state, ev, set) {
      if (!elRoot) return;
      if (celebrating) {
        if (elHead) elHead.textContent = "👑 Getting Started";
        elStep.innerHTML = '<div class="tut-cheer">🎉 Every mission complete!</div>' +
          '<div class="tut-tip">The winds are yours to shape.</div>';
        elList.innerHTML = "";
        return;
      }
      const activeMissions = set.missions.filter(m => ev.byId[m.id] && ev.byId[m.id].active);

      if (elHead) {
        if (activeMissions.length === 1) elHead.textContent = activeMissions[0].icon + " " + activeMissions[0].name;
        else if (activeMissions.length === 0) elHead.textContent = "👑 Getting Started";
        else elHead.textContent = "🎯 Missions · " + activeMissions.length + " active";
      }

      if (!activeMissions.length) {
        const done = ev.allComplete || (state.missions && state.missions.done);
        elStep.innerHTML = done
          ? '<div class="tut-now">▶ All missions complete</div><div class="tut-tip">Nothing left on the board — keep building your realm.</div>'
          : '<div class="tut-now">▶ No missions available</div><div class="tut-tip">Complete a mission’s prerequisites to unlock the next.</div>';
        elList.innerHTML = "";
        return;
      }

      const primary = activeMissions[0];
      const pr = ev.byId[primary.id];
      const met = pr.objectives.filter(o => o.met).length;
      elStep.innerHTML = '<div class="tut-now">▶ ' + esc(primary.name) + "</div>" +
        '<div class="tut-tip">' + met + "/" + pr.objectives.length + " objectives complete</div>";

      let html = "";
      for (const m of activeMissions) {
        const r = ev.byId[m.id];
        if (activeMissions.length > 1)
          html += '<li class="tut-mhead"><span class="mk">' + m.icon + "</span><span><b>" + esc(m.name) + "</b></span></li>";
        m.objectives.forEach((obj, i) => {
          const o = r.objectives[i];
          const cls = o.met ? "done" : "cur";
          const mk = o.met ? "✓" : "▶";
          html += '<li class="' + cls + '"><span class="mk">' + mk + "</span><span>" +
            esc(objLabel(obj)) + ' <b>' + Math.min(o.cur, o.target) + "/" + o.target + "</b></span></li>";
        });
      }
      elList.innerHTML = html;
    }

    // ---- evaluation pass -----------------------------------------------------
    // Activate newly-eligible missions (snapshot non-retro baselines), detect
    // completions, celebrate at the end, then render. Pure w.r.t. game state except
    // for the mission-progress bookkeeping it owns (state.missions).
    function refresh(state) {
      if (!state) return;
      const stats = stateStats(state);
      const set = currentSet();
      const p = ensureProg(state);

      let ev = MissionEngine.evaluate(set, stats, { baselines: clampBaselines(set, stats, p.baselines) });

      // Activation: a mission's prereqs are complete but it hasn't been activated —
      // mark it and (non-retroactive only) snapshot its per-objective baseline NOW.
      let snapshotted = false;
      for (const m of set.missions) {
        const r = ev.byId[m.id];
        if (r && r.prereqsMet && !p.activated[m.id]) {
          p.activated[m.id] = true;
          if (m.retroactive === false) p.baselines[m.id] = m.objectives.map(o => MissionEngine.readLifetime(o, stats));
          snapshotted = true;
        }
      }
      if (snapshotted) ev = MissionEngine.evaluate(set, stats, { baselines: clampBaselines(set, stats, p.baselines) });

      // Completion edge-detection (sfx on newly-finished missions).
      let missionUp = false;
      for (const id of ev.completeIds) {
        if (!p.completed[id]) { p.completed[id] = true; missionUp = true; }
      }

      if (ev.allComplete && !p.done) { persist(state); celebrate(state); return; }

      if (missionUp && typeof SFX !== "undefined" && SFX.play) { try { SFX.play("levelup", "mission done"); } catch (e) {} }
      persist(state);
      render(state, ev, set);
    }

    function celebrate(state) {
      const p = ensureProg(state);
      p.done = true;
      persist(state);
      celebrating = true; active = false;
      if (elRoot) elRoot.classList.add("celebrate");
      render(state, { byId: {}, missions: [], activeIds: [], completeIds: [], allComplete: true }, currentSet());
      if (typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest", "all missions ✓"); } catch (e) {} }
      setTimeout(() => { celebrating = false; hide(); }, 5200);
    }

    function onSkip() {
      const state = (typeof window !== "undefined" && window.state) || (typeof globalThis !== "undefined" && globalThis.state) || null;
      if (state) { const p = ensureProg(state); p.done = true; p.skipped = true; persist(state); }
      else { try { localStorage.setItem(LS_KEY, JSON.stringify({ done: true, skipped: true, activated: {}, baselines: {}, completed: {} })); } catch (e) {} }
      active = false; celebrating = false;
      hide();
    }

    // Resolve the live game state for the poll (browser shell global).
    function liveState(s) {
      if (s) return s;
      if (typeof window !== "undefined" && window.state) return window.state;
      if (typeof globalThis !== "undefined" && globalThis.state) return globalThis.state;
      return null;
    }

    // ---- public API ----------------------------------------------------------
    // Fresh game: reset this playthrough's mission progress unless the player has
    // already finished/skipped the missions (LS gate), then run from the roots.
    function startFresh() {
      ensureEls();
      reloadSet();
      const gate = loadProgFromLS();
      if (gate.done) {
        const st = liveState(null);
        if (st) { st.missions = freshProg(); st.missions.done = true; }
        active = false; celebrating = false; hide(); return;
      }
      const st = liveState(null);
      if (st) st.missions = freshProg();     // new playthrough → clear baselines/activation
      celebrating = false; active = true;
      if (elRoot) elRoot.classList.remove("celebrate");
      if (st) refresh(st); else show();
    }

    // Loaded game: resume the saved mission progress; leave finished/skipped alone.
    function resume() {
      ensureEls();
      reloadSet();
      const st = liveState(null);
      const p = st ? ensureProg(st) : loadProgFromLS();
      if (p.done) { active = false; celebrating = false; hide(); return; }
      celebrating = false; active = true;
      if (elRoot) elRoot.classList.remove("celebrate");
      if (st) { show(); refresh(st); } else show();
    }

    // Poll tick — advance/redraw when active. Called by mainloop (with state) and by
    // the internal interval (no arg → resolves the shell global).
    function tick(s) {
      const st = liveState(s);
      if (!active || !st) return;
      const p = st.missions;
      if (p && p.done) { active = false; return; }
      refresh(st);
    }

    function startPolling() { if (polling) return; polling = true; setInterval(() => tick(), 750); }

    return {
      // engine surface (also on MissionEngine in PURE_CORE for headless tests)
      currentSet, reloadSet, DEFAULT: MissionEngine.DEFAULT,
      // back-compat aliases for any consumer that read the old flat views
      get MISSIONS() { return currentSet().missions; },
      // public API
      startFresh, resume, tick, startPolling, hide,
      isActive: () => active,
    };
  })();
  window.Tutorial = Tutorial;   // exposed for headless smoke + console
  // === TUTORIAL END ===
