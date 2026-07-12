  // === PROGRESS-UI START === (P4-B / slot #3 — prestige HUD, quest banner, victory)
  // Reflects the pure PROGRESS-CORE (Quests.tick / Castle / Town) into the DOM.
  // Owns only its own elements; reads state written by the accumulator each tick.
  // CP: prestige + castle level moved out of #hud into the castle click panel
  // (rendered by renderCastlePanel's up-box). These getElementByIds are null now;
  // updateProgressHud null-guards them and refreshes the panel when it's open.
  const prestigeValEl = document.getElementById("prestigeVal");
  const castleLvlValEl = document.getElementById("castleLvlVal");
  const questBannerEl = document.getElementById("questBanner");
  const qbDescEl = document.getElementById("qbDesc");
  const qbBarEl = document.getElementById("qbBar");
  const qbProgEl = document.getElementById("qbProg");
  const qbRewardEl = document.getElementById("qbReward");
  const winNoticeEl = document.getElementById("winNotice");

  function updateProgressHud() {
    if (prestigeValEl) prestigeValEl.textContent = Math.floor(state.prestige || 0).toLocaleString();
    if (castleLvlValEl) castleLvlValEl.textContent = state.castleLevel || 1;
    // CP: prestige + castle level are shown in the castle panel — refresh it if open.
    if (window.CastleUI && window.CastleUI.isOpen) window.CastleUI.refresh();
  }

  function renderQuestBanner() {
    if (!questBannerEl) return;   // Q: banner removed from the DOM (onboarding → missions)
    const q = state.quest;
    const tmpl = q && Quests.template(q.id);
    if (!tmpl) { questBannerEl.classList.add("hidden"); questBannerEl.setAttribute("aria-hidden", "true"); return; }
    questBannerEl.classList.remove("hidden");
    questBannerEl.setAttribute("aria-hidden", "false");
    const target = Quests.targetOf(tmpl);
    const prog = Quests.progressOf(state, tmpl);
    qbDescEl.textContent = tmpl.desc;
    qbProgEl.textContent = Math.floor(Math.min(prog, target)) + " / " + target;
    qbBarEl.style.width = Math.max(0, Math.min(100, target ? prog / target * 100 : 0)) + "%";
    const r = tmpl.reward || {};
    const parts = [];
    if (r.gold) parts.push(r.gold + " g");
    if (r.prestige) parts.push("✨ " + r.prestige);
    qbRewardEl.textContent = parts.length ? "Reward: " + parts.join(" · ") : "—";
  }

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
  function renderWinStats() {
    if (!wnStatsEl) return;
    const towns = (state.towns || []).length;
    const gold = Math.round(state.treasury || 0).toLocaleString();
    const prestige = Math.floor(state.prestige || 0);
    const days = Math.floor((state.tick || 0) * 0.5 / 60);   // 500ms/tick -> minutes of game time
    wnStatsEl.innerHTML =
      `<span>🏙 <b>${towns}</b> town${towns === 1 ? "" : "s"}</span>` +
      `<span>👑 <b>${gold}</b> g treasury</span>` +
      `<span>✨ <b>${prestige}</b> prestige</span>` +
      `<span>⏱ <b>${days}</b> min reign</span>`;
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
    if (typeof SFX !== "undefined" && SFX.play) { try { SFX.play("quest"); } catch (e) {} }
  }
  document.getElementById("wnClose").addEventListener("click", () => {
    winNoticeEl.classList.remove("in");
    winNoticeEl.classList.add("hidden");
    winNoticeEl.setAttribute("aria-hidden", "true");
  });

  // Live refresh (500ms, same cadence as the other panels). Also catches a
  // victory reached via the tick path (e.g. quest-driven) or a loaded save.
  updateProgressHud();
  renderQuestBanner();
  if (state.victory) showVictory();
  setInterval(() => {
    updateProgressHud();
    renderQuestBanner();
    if (state.victory) showVictory();
  }, 500);

  window.ProgressUI = { updateProgressHud, renderQuestBanner, showVictory,
                        Town, Castle, Quests };
  // === PROGRESS-UI END ===
