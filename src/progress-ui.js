  // === PROGRESS-UI START === (P4-B / slot #3 — prestige HUD, quest banner, victory)
  // Reflects the pure PROGRESS-CORE (Quests.tick / Castle / Town) into the DOM.
  // Owns only its own elements; reads state written by the accumulator each tick.
  // DESIGN PASS: the always-0 prestige readout (#prestigeVal) is gone — prestige is
  // never earned since King's Quests were retired (state.prestige stays for saves).
  const winNoticeEl = document.getElementById("winNotice");

  function updateProgressHud() {
    // castle level removed (v0.44) — castle is fixed capacity now.
    if (window.CastleUI && window.CastleUI.isOpen) window.CastleUI.refresh();
  }
  // King's-Quest banner retired — no renderQuestBanner (quests removed entirely).

  // === POLISH: victory is the game's biggest moment and previously showed a
  // bland static card. This adds (a) a stat recap read from existing state
  // fields (no new tracking), (b) a one-time CSS-only confetti burst + a
  // pop-in/bob animation (both skip via the .wn-confetti/@media rules above
  // when prefers-reduced-motion is set), and (c) the same "quest" fanfare SFX
  // already used for other big positive beats — all gated by the existing
  // winShown flag so it can only ever fire once per session. ===
  const wnConfettiEl = document.getElementById("wnConfetti");
  const wnStatsEl = document.getElementById("wnStats");
  const WN_CONFETTI_COLORS = ["#e0a860", "#f0d590", "#c98a3c", "#e8dcc0", "#a6e0a8"];
  function buildConfetti() {
    if (!wnConfettiEl || wnConfettiEl.childElementCount) return;   // build once
    const n = 26;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.style.setProperty("--wn-x", (Math.random() * 100).toFixed(1) + "%");
      s.style.setProperty("--wn-c", WN_CONFETTI_COLORS[i % WN_CONFETTI_COLORS.length]);
      s.style.setProperty("--wn-dur", (2.6 + Math.random() * 1.8).toFixed(2) + "s");
      s.style.setProperty("--wn-delay", (-Math.random() * 3).toFixed(2) + "s");
      frag.appendChild(s);
    }
    wnConfettiEl.appendChild(frag);
  }
  // DESIGN PASS: the recap reads lifetime stats (tariff, goods traded, peak population),
  // cities, game-minutes to win and the seed/preset. The best time-to-win per map
  // preset lives in localStorage (per-viewer convenience; try/catch — may be blocked).
  const wnRecordEl = document.getElementById("wnRecord");
  const WN_BEST_KEY = "tradewinds.bestWin";
  function winMinutes() {
    const t = (typeof state.victoryTick === "number") ? state.victoryTick : null;
    return t === null ? null : t / 120;          // 2 ticks = 1 game-second
  }
  function presetLabel() {
    const id = state.mapPreset || "";
    const pr = (CONFIG.mapPresets && CONFIG.mapPresets[id]) || null;
    return (pr && pr.label) || (id === "custom" ? "Custom" : id);
  }
  // Compare + store the best time-to-win for this preset. Returns {best, isNew}.
  // Recorded once per won game (keyed by seed+victoryTick) so reopening doesn't re-flag.
  function recordBest(mins) {
    const out = { best: null, isNew: false };
    if (mins === null) return out;
    try {
      const all = JSON.parse(localStorage.getItem(WN_BEST_KEY) || "{}") || {};
      const key = state.mapPreset || "default";
      const cur = all[key];
      const runId = String(state.seedInput || "") + "@" + state.victoryTick;
      if (cur && cur.run === runId) return { best: cur.mins, isNew: !!cur.isNew, first: !cur.isNew };
      if (!cur || typeof cur.mins !== "number" || mins < cur.mins) {
        all[key] = { mins, seed: state.seedInput || "", run: runId, isNew: !!cur };
        localStorage.setItem(WN_BEST_KEY, JSON.stringify(all));
        return { best: mins, isNew: !!cur, first: !cur };   // first win on a preset sets the bar
      }
      return { best: cur.mins, isNew: false };
    } catch (e) { return out; }
  }
  function renderWinStats() {
    if (!wnStatsEl) return;
    const st = (typeof Sim !== "undefined" && Sim.ensureStats) ? Sim.ensureStats(state) : (state.stats || {});
    const towns = (state.towns || []).length;
    const tariff = Math.round(st.taxEarned || 0).toLocaleString();
    let traded = 0;
    const by = (st.traded && st.traded.byGood) || {};
    for (const g in by) traded += by[g] || 0;
    const peak = Math.round(st.peakPop || 0).toLocaleString();
    const mins = winMinutes();
    const minsS = mins === null ? "—" : Math.round(mins).toLocaleString();
    wnStatsEl.innerHTML =
      `<span>👑 <b>${tariff}</b> g lifetime tariff</span>` +
      `<span>📦 <b>${Math.round(traded).toLocaleString()}</b> goods traded</span>` +
      `<span>🧑‍🌾 <b>${peak}</b> peak population</span>` +
      `<span>🏙 <b>${towns}</b> cit${towns === 1 ? "y" : "ies"}</span>` +
      `<span>⏱ <b>${minsS}</b> game-min to win</span>` +
      `<span>🗺 ${esc(presetLabel())} · <b>${esc(state.seedInput || "")}</b></span>`;
    if (wnRecordEl) {
      const r = recordBest(mins);
      wnRecordEl.innerHTML = r.isNew
        ? `<span class="new">🏆 New record!</span> Fastest ${esc(presetLabel())} win: ${Math.round(r.best)} game-min`
        : r.first ? `First ${esc(presetLabel())} win — ${Math.round(r.best)} game-min is the time to beat`
        : (r.best !== null ? `Best ${esc(presetLabel())} win: ${Math.round(r.best)} game-min` : "");
    }
  }
  let winShown = false;
  function showVictory() {
    if (winShown) return;
    winShown = true;
    renderWinStats();
    buildConfetti();
    winNoticeEl.classList.remove("hidden");
    winNoticeEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => winNoticeEl.classList.add("in"));
    if (typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest", "victory"); } catch (e) {} }
  }
  function closeVictory() {
    winNoticeEl.classList.remove("in");
    winNoticeEl.classList.add("hidden");
    winNoticeEl.setAttribute("aria-hidden", "true");
  }
  document.getElementById("wnClose").addEventListener("click", closeVictory);   // "Keep ruling"
  // DESIGN PASS: "New realm" — a fresh seed on the same map type (custom keeps its tiers).
  const wnNewBtn = document.getElementById("wnNew");
  if (wnNewBtn) wnNewBtn.addEventListener("click", () => {
    closeVictory();
    const preset = state.mapPreset || CONFIG.mapPresetDefault || "fertile";
    const tiers = (preset === "custom" && state.mapTiers) ? JSON.parse(JSON.stringify(state.mapTiers)) : undefined;
    if (window.StartScreen) window.StartScreen.startNew(randomSeed(), preset, tiers);
  });

  // Live refresh (500ms, same cadence as the other panels). Also catches a
  // victory reached via the tick path (e.g. quest-driven) or a loaded save.
  updateProgressHud();
  if (state.victory) showVictory();
  setInterval(() => {
    updateProgressHud();
    if (state.victory) showVictory();
    else if (winShown) winShown = false;   // DESIGN PASS: a new realm can be won again
  }, 500);

  window.ProgressUI = { updateProgressHud, showVictory, Town, Castle };
  // === PROGRESS-UI END ===
