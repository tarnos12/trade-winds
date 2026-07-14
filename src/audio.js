  // === AUDIO START === (P5-C / slot #4 — procedural WebAudio SFX + mute)
  // Self-contained: all cues are synthesized (oscillators + envelopes), zero
  // external assets (CSP blocks them anyway). Lives entirely in the browser IIFE
  // and is guarded so a headless/no-WebAudio environment never throws — the pure
  // Sim/Trade/etc. cores have no audio dependency. Sound is silent until the
  // player's first gesture (WebAudio autoplay policy) and honors the mute flag.
  const SFX = (function () {
    const MUTE_KEY = "tw_muted";
    const AC = (typeof window !== "undefined") &&
               (window.AudioContext || window.webkitAudioContext);
    let ctx = null, master = null, unlocked = false, warned = false;
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}

    function ensureCtx() {
      if (ctx || !AC) return ctx;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;          // gentle master volume
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
      return ctx;
    }

    // Resume the context on the first real user gesture, then arm playback.
    function unlock() {
      if (unlocked) return;
      if (!ensureCtx()) return;
      try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
      unlocked = true;
    }

    // One enveloped voice: osc(type) sliding from f0→f1, soft attack + decay.
    function voice(f0, f1, t0, dur, type, peak) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const a = Math.min(0.012, dur * 0.25);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);        // quick soft attack
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);    // exp decay to ~silence
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }

    // Cue definitions — each builds a short, soft gesture from the current time.
    function render(name) {
      const t = ctx.currentTime;
      switch (name) {
        case "place":                              // soft wooden "tok"
          voice(200, 120, t, 0.10, "triangle", 0.5);
          break;
        case "trade":                              // gentle two-note coin chime
          voice(1046, 1046, t, 0.10, "sine", 0.28);
          voice(1568, 1568, t + 0.06, 0.14, "sine", 0.22);
          break;
        case "levelup":                            // rising C–E–G arpeggio
          voice(523, 523, t, 0.12, "triangle", 0.32);
          voice(659, 659, t + 0.09, 0.12, "triangle", 0.32);
          voice(784, 784, t + 0.18, 0.20, "triangle", 0.34);
          break;
        case "quest": {                            // brief bright fanfare C–E–G–C
          const n = [523, 659, 784, 1046];
          for (let i = 0; i < n.length; i++)
            voice(n[i], n[i], t + i * 0.08, 0.18, "triangle", 0.3);
          break;
        }
        case "event":                              // mellow ding-dong notification
          voice(660, 660, t, 0.16, "sine", 0.26);
          voice(880, 880, t + 0.13, 0.22, "sine", 0.24);
          break;
        default:
          voice(440, 440, t, 0.08, "sine", 0.2);
      }
    }

    // === DEBUG (X): recent-sounds ring buffer. Every audible play is logged with
    // a short SOURCE label (passed by the caller) so the on-screen debug panel can
    // show what's firing and from where — used to hunt down mystery cues.
    const _recent = [];
    function logPlay(name, source) {
      _recent.push({ name: name, source: source || name,
                     t: (typeof performance !== "undefined" ? performance.now() : Date.now()) });
      if (_recent.length > 14) _recent.shift();
    }

    function play(name, source) {
      if (muted || !unlocked || !ctx) return;     // silent pre-gesture / muted
      if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
      logPlay(name, source);                       // DEBUG (X): record the audible cue
      try { render(name); }
      catch (e) { if (!warned) { warned = true; /* audio disabled for session */ } }
    }

    // --- light rate limits so a busy economy / road-drag can't machine-gun ---
    const nextAt = Object.create(null);
    function playThrottled(name, minGapMs, source) {
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (nextAt[name] && now < nextAt[name]) return;
      nextAt[name] = now + (minGapMs || 120);
      play(name, source);
    }

    function setMuted(m) {
      muted = !!m;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
      if (typeof state === "object" && state) state.muted = muted;
    }
    function toggle() { setMuted(!muted); return muted; }

    return {
      play, playThrottled, unlock, toggle,
      setMuted,
      isMuted: () => muted,
      recent: () => _recent.slice(),   // DEBUG (X): recent { name, source, t }
      get ready() { return unlocked; },
      get available() { return !!AC; },
    };
  })();
  window.SFX = SFX;   // exposed for the headless smoke test / console debugging

  // Arm audio on the first genuine user gesture (WebAudio autoplay policy).
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => SFX.unlock(), { once: false, passive: true }));

  // Mute toggle button in the top bar.
  const muteBtn = document.getElementById("btnMute");
  function syncMuteBtn() {
    if (!muteBtn) return;
    const m = SFX.isMuted();
    muteBtn.textContent = m ? "🔇 Muted" : "🔊 Sound";
    muteBtn.classList.toggle("active", m);
    muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
  }
  if (muteBtn) {
    muteBtn.addEventListener("click", () => { SFX.unlock(); SFX.toggle(); syncMuteBtn(); });
    syncMuteBtn();
  }

  // DEBUG (X): live "recent sounds" panel below the toolbar — polls SFX.recent()
  // and lists the last cues (newest first) with the SOURCE label the caller passed,
  // so a mystery sound can be traced to its origin at a glance.
  (function sfxDebugPanel() {
    const listEl = document.getElementById("sfxDebugList");
    if (!listEl || !SFX.recent) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let lastSig = "";
    setInterval(() => {
      const rec = SFX.recent();
      if (!rec.length) { if (lastSig !== "empty") { listEl.innerHTML = '<li class="sfxd-empty">(none yet)</li>'; lastSig = "empty"; } return; }
      const sig = rec.length + "|" + rec[rec.length - 1].t;
      if (sig === lastSig) return;
      lastSig = sig;
      let html = "";
      for (let i = rec.length - 1; i >= Math.max(0, rec.length - 8); i--) {
        const r = rec[i];
        html += '<li><span class="snd">' + esc(r.name) + '</span><span class="src" title="' + esc(r.source) + '">' + esc(r.source) + "</span></li>";
      }
      listEl.innerHTML = html;
    }, 250);
  })();
  window.addEventListener("keydown", (e) => {
    // Editor overlay open: don't let 'm' leak into the game underneath (see
    // the matching guard/comment on the speed/WASD handler above).
    if ((window.EditorOverlay && window.EditorOverlay.isOpen()) || (window.MissionEditorOverlay && window.MissionEditorOverlay.isOpen())) return;
    if (e.key === "m" || e.key === "M") {
      const el = document.activeElement;
      if (el && el.tagName === "INPUT") return;   // don't hijack the seed field
      SFX.toggle(); syncMuteBtn();
    }
  });
  // === AUDIO END ===
