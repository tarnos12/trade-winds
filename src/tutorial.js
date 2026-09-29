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
    // DESIGN PASS: `hidden` = the player hid the panel for THIS game (per-save, never
    // mirrored to LS). The LS `skipped` gate is the global "also hide on new games".
    function freshProg() { return { done: false, skipped: false, hidden: false, activated: {}, baselines: {}, completed: {} }; }
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
      if (p.hidden === undefined) p.hidden = !!p.skipped;   // old saves: an old Skip stays hidden
      p.done = !!p.done; p.skipped = !!p.skipped; p.hidden = !!p.hidden;
      return p;
    }
    function persist(state) {
      const p = state && state.missions ? state.missions : freshProg();
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          done: !!(p.done || p.skipped), skipped: !!p.skipped,   // skipped = global "hide on new games"
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
      if (id === "research_center") return "Research Center";   // castle building (not in CONFIG.buildings)
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
        case "found_city": return "Found cities";
        case "research":   return "Complete research 🔬";
        default: return obj.type;
      }
    }

    // DESIGN PASS: greyed "Next: <icon> <name> — <first sentence of its tip>" under the
    // primary mission, so the player can prepare the next step while waiting (missions
    // are retroactive, so work done early counts). Empty when nothing follows.
    function nextLine(set, ev, primary) {
      const nx = MissionEngine.nextMission ? MissionEngine.nextMission(set, ev, primary.id) : null;
      if (!nx) return "";
      const first = MissionEngine.firstSentence ? MissionEngine.firstSentence(nx.tip) : "";
      return '<div class="tut-next">Next: ' + esc(nx.icon + " " + nx.name) + (first ? " — " + esc(first) : "") + "</div>";
    }

    // DESIGN PASS: the win tracker. Once any Aristocrats Home exists, a line on top of
    // the panel follows the estate (Victory.estate — highest need-happiness):
    // "👑 Estate (City #n): 7/8 goods · 90% — 100% wins · missing: Luxury Clothes (Luxury Tailor)".
    function goodNm(gid) { return String(gid).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
    function producerName(gid) {
      const B = (typeof CONFIG !== "undefined" && CONFIG.buildings) || {};
      for (const id in B) { const d = B[id]; if (d && d.output && d.output.goodId === gid) return d.name || id; }
      return "";
    }
    function goalHtml(state) {
      const es = (typeof Victory !== "undefined" && Victory.estate) ? Victory.estate(state) : null;
      if (!es) return "";
      const t = es.town;
      const need = (CONFIG.victory && CONFIG.victory.aristocratHappiness) || 99.5;
      const name = (t.name || ("City #" + t.id)) + (es.built ? "" : ", under construction");
      const h = es.happiness;
      const pct = (h === null) ? "no residents yet" : ((h >= need) ? 100 : Math.min(99, Math.floor(h))) + "%";   // 99.5 reads 100 only when it wins
      let miss = "";
      if (es.missing.length) {
        const shown = es.missing.slice(0, 3).map(g => { const pn = producerName(g); return goodNm(g) + (pn ? " (" + pn + ")" : ""); });
        miss = " · missing: " + shown.join(", ") + (es.missing.length > 3 ? " +" + (es.missing.length - 3) + " more" : "");
      }
      return '<div class="tut-goal" title="Victory: an Aristocrats Home whose residents reach 100% happiness. Give/Take bonuses don’t count — every aristocrat good must flow.">👑 Estate (' +
        esc(name) + "): " + es.have + "/" + es.total + " goods · " + esc(pct) +
        (state.victory ? " — Victory! 👑" : " — 100% wins" + esc(miss)) + "</div>";
    }
    // Show/hide the panel: hidden-for-this-game wins; otherwise visible while missions
    // run or the win tracker has something to say.
    function place(state, hasMissions, goal) {
      const p = state && state.missions;
      if ((p && p.hidden) || (!hasMissions && !goal)) { hide(); return false; }
      show(); return true;
    }

    // ---- render --------------------------------------------------------------
    function render(state, ev, set, goal) {
      if (!elRoot) return;
      goal = goal || "";
      if (celebrating) {
        if (elHead) elHead.textContent = "👑 Getting Started";
        elStep.innerHTML = goal + '<div class="tut-cheer">🎉 Every mission complete!</div>' +
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
        elStep.innerHTML = goal + (done
          ? '<div class="tut-now">▶ All missions complete</div><div class="tut-tip">Nothing left on the board — keep building your realm.</div>'
          : '<div class="tut-now">▶ No missions available</div><div class="tut-tip">Complete a mission’s prerequisites to unlock the next.</div>');
        elList.innerHTML = "";
        return;
      }

      const primary = activeMissions[0];
      const pr = ev.byId[primary.id];
      const met = pr.objectives.filter(o => o.met).length;
      // The panel header already shows the mission name+icon when a single
      // mission is active, so don't repeat it here — just show progress. With
      // several active, name the primary one so the count is unambiguous.
      const nameLine = activeMissions.length === 1
        ? "" : '<div class="tut-now">▶ ' + esc(primary.name) + "</div>";
      elStep.innerHTML = goal + nameLine +
        '<div class="tut-tip">' + met + "/" + pr.objectives.length + " objectives complete</div>" +
        (primary.tip ? '<div class="tut-hint">💡 ' + esc(primary.tip) + "</div>" : "") +
        nextLine(set, ev, primary);

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
            esc(objLabel(obj)) + ' <b>' + Math.floor(Math.min(o.cur, o.target)) + "/" + o.target + "</b></span></li>";   // whole numbers (tariff is fractional)
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
      const goal = goalHtml(state);
      // DESIGN PASS: finished/globally-dismissed missions no longer end the poll — the
      // panel lingers only for the win tracker (or stays hidden when there is none).
      if (p.done) {
        if (celebrating) return;
        if (place(state, false, goal)) {
          if (elHead) elHead.textContent = "👑 Your Goal";
          elStep.innerHTML = goal + '<div class="tut-tip">Missions are done — bring the estate to 100% happiness to win.</div>';
          elList.innerHTML = "";
        }
        return;
      }

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

      if (ev.allComplete && !p.done) { persist(state); celebrate(state, goal); return; }

      persist(state);
      if (!place(state, true, goal)) return;     // hidden for this game: keep bookkeeping, no sfx/render
      if (missionUp && typeof SFX !== "undefined" && SFX.play) { try { SFX.play("levelup", "mission done"); } catch (e) {} }
      render(state, ev, set, goal);
    }

    function celebrate(state, goal) {
      const p = ensureProg(state);
      p.done = true;
      persist(state);
      celebrating = true;
      if (elRoot) elRoot.classList.add("celebrate");
      if (p.hidden) hide();
      else { show(); render(state, { byId: {}, missions: [], activeIds: [], completeIds: [], allComplete: true }, currentSet(), goal); }
      if (!p.hidden && typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest", "all missions ✓"); } catch (e) {} }
      setTimeout(() => {
        celebrating = false;
        if (elRoot) elRoot.classList.remove("celebrate");
        const st = liveState(null);
        if (st) refresh(st); else hide();       // the win tracker may keep the panel up
      }, 5200);
    }

    // DESIGN PASS: Skip → a confirmed per-game Hide. Only the "Also hide on new
    // games" checkbox writes the old global LS gate ({done, skipped}); otherwise the
    // missions come back on the next new game. ☰ → 🎯 Missions brings them back.
    function writeGlobalHide() {
      const st = liveState(null);
      if (st) { ensureProg(st).skipped = true; persist(st); }   // persist writes {done:true, skipped:true}
      else { try { localStorage.setItem(LS_KEY, JSON.stringify({ done: true, skipped: true, activated: {}, baselines: {}, completed: {} })); } catch (e) {} }
    }
    function setHidden(on) {
      const st = liveState(null);
      if (st) { ensureProg(st).hidden = !!on; if (typeof scheduleSave === "function") { try { scheduleSave(); } catch (e) {} } }
      if (on) hide(); else if (st) refresh(st);
      syncMenu();
    }
    function onSkip() {
      const msg = "Hide missions for this game? Bring them back any time from ☰ → 🎯 Missions.";
      const doHide = (alsoNew) => { if (alsoNew) writeGlobalHide(); setHidden(true); };
      if (typeof uiConfirm === "function") uiConfirm(msg, doHide, { okLabel: "Hide", danger: false, checkbox: "Also hide on new games" });
      else doHide(false);
    }
    // ☰ → 🎯 Missions row: Show/Hide toggle + Restart tutorial.
    function isHidden() {
      const st = liveState(null);
      return !!(st && st.missions && st.missions.hidden);
    }
    function syncMenu() {
      const b = document.getElementById("btnMissionsToggle");
      if (b) b.textContent = isHidden() ? "👁 Show" : "🙈 Hide";
    }
    function toggleHidden() { setHidden(!isHidden()); }
    function restart() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(freshProg())); } catch (e) {}   // clear the global gate …
      startFresh();                           // … and run the missions from the roots (lifetime stats still count)
      syncMenu();
    }
    function bindMenu() {
      const tg = document.getElementById("btnMissionsToggle");
      if (tg && !tg._bound) { tg._bound = true; tg.addEventListener("click", toggleHidden); }
      const rs = document.getElementById("btnMissionsRestart");
      if (rs && !rs._bound) { rs._bound = true; rs.addEventListener("click", restart); }
      const menuBtn = document.getElementById("hudMenuBtn");
      if (menuBtn && !menuBtn._tutSync) { menuBtn._tutSync = true; menuBtn.addEventListener("click", syncMenu); }
      syncMenu();
    }

    // Resolve the live game state for the poll (browser shell global).
    let boundState = null;   // DESIGN PASS: remembered live state (shell `state` is not on window)
    function liveState(s) {
      if (s) { boundState = s; return s; }
      if (boundState) return boundState;
      if (typeof window !== "undefined" && window.state) return window.state;
      if (typeof globalThis !== "undefined" && globalThis.state) return globalThis.state;
      // DESIGN PASS: the shell's `state` is a lexical const (never on window) — without
      // this, startFresh/Skip never reached the game state (missions leaked across games).
      if (typeof state !== "undefined" && state) return state;
      return null;
    }

    // ---- public API ----------------------------------------------------------
    // Fresh game: reset this playthrough's mission progress unless the player has
    // already finished/skipped the missions (LS gate), then run from the roots.
    // DESIGN PASS (#1): callers pass the live `state` — the shell `state` is IIFE-scoped (no
    // window.state), so liveState(null) resolved nothing and New Game never reset, nor
    // Continue ever read, this game's own mission progress.
    function startFresh(s) {
      ensureEls(); bindMenu();
      reloadSet();
      const gate = loadProgFromLS();
      if (gate.done) {
        const st = liveState(s);
        // DESIGN PASS: a finished tutorial stays done; a global "hide on new games"
        // also hides the panel (the win tracker then waits for ☰ → 🎯 Missions → Show).
        if (st) { st.missions = freshProg(); st.missions.done = true; st.missions.skipped = st.missions.hidden = !!gate.skipped; }
        active = true; celebrating = false; hide(); syncMenu();
        if (st) refresh(st);
        return;
      }
      const st = liveState(s);
      if (st) st.missions = freshProg();     // new playthrough → clear baselines/activation
      celebrating = false; active = true;
      if (elRoot) elRoot.classList.remove("celebrate");
      syncMenu();
      if (st) refresh(st); else show();
    }

    // Loaded game: resume the saved mission progress; leave finished/skipped alone.
    function resume(s) {
      ensureEls();
      reloadSet();
      const st = liveState(s);
      const p = st ? ensureProg(st) : loadProgFromLS();
      // DESIGN PASS (#1): also honour the LS gate — before resume() saw the live state, a
      // Skip only reached localStorage, so a pre-fix save's missions lack `done`.
      if (st && !p.done) {
        const gate = loadProgFromLS();
        if (gate.done) { p.done = true; if (gate.skipped) p.skipped = p.hidden = true; }
      }
      bindMenu();
      celebrating = false; active = true;     // DESIGN PASS: keep polling for the win tracker even when done
      if (elRoot) elRoot.classList.remove("celebrate");
      if (st) refresh(st); else if (!p.done) show(); else hide();
    }

    // Poll tick — advance/redraw when active. Called by mainloop (with state) and by
    // the internal interval (no arg → resolves the shell global).
    function tick(s) {
      const st = liveState(s);
      if (!active || !st) return;
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
      setHidden, toggleHidden, restart, isHidden, goalHtml,   // DESIGN PASS: ☰ → 🎯 Missions + win tracker
      isActive: () => active,
    };
  })();
  window.Tutorial = Tutorial;   // exposed for headless smoke + console
  // === TUTORIAL END ===
