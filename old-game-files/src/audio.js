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
      try { syncAmbience(); } catch (e) {}      // arm the ambience bed post-gesture (never before)
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

    // Same as voice() but through a gentle lowpass — rounds off harsh harmonics
    // for a warmer, softer timbre (used by the coin chime / levelup / construct cues).
    function warmVoice(f0, f1, t0, dur, type, peak, cutoff) {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      f.type = "lowpass";
      f.frequency.setValueAtTime(cutoff || 2200, t0);
      f.Q.value = 0.7;
      const a = Math.min(0.014, dur * 0.22);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }

    // A single "coin" note: warm filtered fundamental + a soft, short octave-up
    // shimmer partial layered on top — the classic bell/coin two-partial trick,
    // rounder and warmer than a bare sine.
    function coinNote(f, t0, dur, peak) {
      warmVoice(f, f, t0, dur, "sine", peak, 2600);
      warmVoice(f * 2.01, f * 2.01, t0, dur * 0.55, "sine", peak * 0.35, 3200);
    }

    // Cue definitions — each builds a short, soft gesture from the current time.
    function render(name) {
      const t = ctx.currentTime;
      switch (name) {
        case "place":                              // soft wooden "tok"
          voice(200, 120, t, 0.10, "triangle", 0.5);
          break;
        case "trade":                              // warm, rounder two-note coin chime
          coinNote(1046, t, 0.20, 0.26);
          coinNote(1568, t + 0.07, 0.24, 0.20);
          break;
        case "levelup":                             // warmer rising arpeggio + soft low
          voice(196, 196, t, 0.05, "sine", 0.16);   // foundation + a bright sparkle finish
          warmVoice(523, 523, t + 0.02, 0.14, "triangle", 0.30, 2400);
          warmVoice(659, 659, t + 0.11, 0.14, "triangle", 0.30, 2600);
          warmVoice(784, 784, t + 0.20, 0.22, "triangle", 0.32, 2800);
          coinNote(1568, t + 0.34, 0.30, 0.16);
          break;
        case "construct":                           // NEW: construction/upgrade complete —
          voice(150, 90, t, 0.09, "triangle", 0.42);        // two soft mallet "thunk"s settling
          voice(170, 100, t + 0.09, 0.10, "triangle", 0.40); // into a bright two-note finish
          warmVoice(784, 784, t + 0.20, 0.10, "sine", 0.22, 2600);
          warmVoice(988, 988, t + 0.26, 0.22, "sine", 0.26, 2600);
          break;
        case "quest": {                            // brief bright fanfare C–E–G–C
          const n = [523, 659, 784, 1046];          // (legacy cue name — still called by
          for (let i = 0; i < n.length; i++)        // progress-ui/tutorial "all missions/
            voice(n[i], n[i], t + i * 0.08, 0.18, "triangle", 0.3); // victory" fanfares, not
          break;                                    // the retired King's Quests system)
        }
        case "event":                              // mellow ding-dong notification
          voice(660, 660, t, 0.16, "sine", 0.26);
          voice(880, 880, t + 0.13, 0.22, "sine", 0.24);
          break;
        default:
          voice(440, 440, t, 0.08, "sine", 0.2);
      }
    }

    // === Ambience: a very quiet, continuous market/wind bed (filtered noise +
    // two soft detuned low drones with a slow breeze-swell LFO). Built lazily on
    // first unlock() (never before a real user gesture) and only when not muted;
    // muting fades it out (not torn down) and unmuting fades it back in. Entirely
    // optional texture — if construction fails for any reason it's swallowed and
    // the game/SFX cues are unaffected.
    let amb = null;
    function buildAmbience() {
      if (!ctx || amb) return;
      try {
        const dur = 2;
        const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf; noise.loop = true;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "lowpass"; noiseFilter.frequency.value = 480; noiseFilter.Q.value = 0.5;
        const noiseLevel = ctx.createGain(); noiseLevel.gain.value = 0.012;   // faint wind hiss

        const d1 = ctx.createOscillator(); d1.type = "sine"; d1.frequency.value = 110;
        const d2 = ctx.createOscillator(); d2.type = "sine"; d2.frequency.value = 164.5; // soft detuned 5th
        const droneLevel = ctx.createGain(); droneLevel.gain.value = 0.008;   // faint market hum

        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;       // slow breeze swell
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.004;

        const ambGain = ctx.createGain();
        ambGain.gain.setValueAtTime(0.0001, ctx.currentTime);

        lfo.connect(lfoGain); lfoGain.connect(noiseLevel.gain);
        noise.connect(noiseFilter); noiseFilter.connect(noiseLevel); noiseLevel.connect(ambGain);
        d1.connect(droneLevel); d2.connect(droneLevel); droneLevel.connect(ambGain);
        ambGain.connect(master);

        noise.start(); lfo.start(); d1.start(); d2.start();
        ambGain.gain.setTargetAtTime(1, ctx.currentTime, 3);   // slow ~3s fade-in (already very quiet)

        amb = { noise, noiseFilter, noiseLevel, d1, d2, droneLevel, lfo, lfoGain, ambGain };
      } catch (e) { amb = null; }
    }
    function fadeAmbience(on) {
      if (!amb) return;
      try {
        const now = ctx.currentTime;
        amb.ambGain.gain.cancelScheduledValues(now);
        amb.ambGain.gain.setTargetAtTime(on ? 1 : 0.0001, now, on ? 2.5 : 0.6);
      } catch (e) {}
    }
    // Keep ambience in sync with unlock/mute state — called after every state change.
    function syncAmbience() {
      if (!ctx || !unlocked) return;         // never before a real gesture
      if (muted) { fadeAmbience(false); return; }
      if (!amb) buildAmbience(); else fadeAmbience(true);
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
      try { syncAmbience(); } catch (e) {}      // mute silences the ambience bed too
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
    if ((window.EditorOverlay && window.EditorOverlay.isOpen()) || (window.MissionEditorOverlay && window.MissionEditorOverlay.isOpen()) || (window.BalanceLab && window.BalanceLab.isOpen())) return;
    if (e.key === "m" || e.key === "M") {
      const el = document.activeElement;
      if (el && el.tagName === "INPUT") return;   // don't hijack the seed field
      SFX.toggle(); syncMuteBtn();
    }
  });
  // === AUDIO END ===
