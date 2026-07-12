  // === PP-E START === (map juice — LTT-style ambient city chatter, render-only)
  // Three overlays drawn from drawWithDpr AFTER Juice (topmost):
  //   1. speech bubbles over city centers (shortage / very-happy tier / all fine),
  //   2. a wanted-goods icon row above each city (top-4 demand gaps, yellow ring
  //      when the shelf is empty),
  //   3. "+N 🪙" gold floaters when a city's people-tax lands.
  // Mirrors the Juice module's discipline: READ-ONLY over the pure core (all
  // stores are module-local), pooled floaters (no GC churn), zoom-culled at the
  // same 0.6 threshold drawCarts uses, off-screen-culled, and reduced-motion-
  // aware. Per-Sim-tick data (wanted rows, tax deltas, bubble scans) is cached
  // on state.tick so nothing heavy recomputes per frame.
  const PPE = (() => {
    const rmq = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduced = () => !!(rmq && rmq.matches);
    const TIER_LABEL = { peasants: "Peasants", workers: "Workers", burghers: "Citizens", aristocrats: "Aristocrats" };  // === CC ===

    // ---- feel constants (render-only; not economy balance) ----
    const BUBBLE_LIFE = 4000;      // ms a bubble stays up
    const BUBBLE_COOLDOWN = 20000; // ms between bubbles per city
    const SCAN_EVERY_TICKS = 10;   // ~5 s of game time between per-city scans
    const FLOAT_LIFE = 1600;       // ms a gold floater lives
    const FLOAT_COOLDOWN = 10000;  // ≥10 s between floaters per city
    const ZOOM_CULL = 0.6;         // matches drawCarts' dots-only threshold
    const MAX_FLOATERS = 40;       // hard cap (pooled)

    // ---- module-local stores (render layer only — never saved) ----
    const bubbles = new Map();     // townId -> { text, life }
    const bubbleCool = new Map();  // townId -> ms left until the next bubble
    const floatCool = new Map();   // townId -> ms left until the next floater
    const taxPend = new Map();     // townId -> tax gold banked since last floater
    const wantedRows = new Map();  // townId -> [{gid, acute}] top-4 demand gaps
    const floaters = [];           // active gold floaters (world-space)
    const fpool = [];              // dead floaters, reused
    let wantedTick = -1;           // state.tick the caches were computed for
    let bubblesSpawned = 0, floatersSpawned = 0, wantedComputes = 0;

    // Is a world point on screen? (mirror of drawWithDpr's camera transform)
    function onScreen(x, y, margin) {
      const W = window.innerWidth, H = window.innerHeight, z = state.zoom || 1;
      const sx = W / 2 + (x - state.cam.x) * z;
      const sy = H / 2 + (y - state.cam.y) * z;
      const m = margin || 0;
      return sx >= -m && sx <= W + m && sy >= -m && sy <= H + m;
    }

    // ---- per-Sim-tick recompute: wanted rows + tax deltas + bubble scans ----
    function recompute() {
      const tick = state.tick || 0;
      if (tick === wantedTick) return;
      wantedTick = tick;
      wantedComputes++;
      const buffer = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
      const live = new Set();
      for (const t of state.towns || []) {
        if (!t || t.id == null) continue;
        live.add(t.id);
        // wanted row: goods whose stock doesn't cover demand×buffer, biggest gap
        // first; acute (yellow ring) when the shelf is essentially empty.
        const d = t.demand || {}, s = t.stock || {};
        const entries = [];
        for (const gid in d) {
          const want = d[gid] || 0;
          if (!(want > 0)) continue;
          const gap = want * buffer - (s[gid] || 0);
          if (gap > 0) entries.push([gid, gap, (s[gid] || 0) < 0.5]);
        }
        entries.sort((a, b) => b[1] - a[1]);
        let row = wantedRows.get(t.id);
        if (!row) { row = []; wantedRows.set(t.id, row); }
        row.length = 0;
        for (let i = 0; i < entries.length && i < 4; i++)
          row.push({ gid: entries[i][0], acute: entries[i][2] });

        // floater fuel: the PP-A ledger tally resets every Sim tick, so on each
        // NEW tick tally.tax is exactly this tick's people-tax landing.
        const L = t.ledger;
        const tax = (L && L.tally && L.tally.tax) || 0;
        if (tax > 0) taxPend.set(t.id, (taxPend.get(t.id) || 0) + tax);

        // speech-bubble scan, staggered by town id so cities don't talk in unison
        if ((tick + (+t.id || 0)) % SCAN_EVERY_TICKS === 0) maybeSpeak(t);
      }
      // prune stores for towns that no longer exist
      for (const m of [bubbles, bubbleCool, floatCool, taxPend, wantedRows])
        for (const id of m.keys()) if (!live.has(id)) m.delete(id);
    }

    // What (if anything) a city would say right now — priority order (a→c).
    function bubbleTextFor(t) {
      const N = CONFIG.needs || {};
      const d = t.demand || {}, s = t.stock || {};
      // (a) severe shortage of a BASIC need: empty shelf + real demand
      for (const gid of N.basicNeeds || []) {
        if ((d[gid] || 0) > 0 && (s[gid] || 0) < 0.5)
          return "We don't have any " + goodIcon(gid) + " " + GOOD_LABEL(gid) + "!";
      }
      // (b) a tier is very happy (pays the people-tax bonus above happyBase)
      const th = t.tierHappiness || {};
      for (const tk in TIER_LABEL) {
        if (typeof th[tk] === "number" && th[tk] >= 90)
          return TIER_LABEL[tk] + " are very happy and pay our city more.";
      }
      // (c) every demanded good has at least a tick of coverage → all fine
      let anyDemand = false;
      for (const gid in d) {
        if (!((d[gid] || 0) > 0)) continue;
        anyDemand = true;
        if ((s[gid] || 0) < (d[gid] || 0)) return null;
      }
      return anyDemand ? "All is fine here." : null;
    }
    function maybeSpeak(t) {
      if (bubbles.has(t.id)) return;                 // one bubble at a time per city
      if ((bubbleCool.get(t.id) || 0) > 0) return;   // ≥20 s between bubbles
      const text = bubbleTextFor(t);
      if (!text) return;
      bubbles.set(t.id, { text, life: BUBBLE_LIFE });
      bubbleCool.set(t.id, BUBBLE_COOLDOWN);
      bubblesSpawned++;
    }

    // ---- draw: speech bubble (legible pill + tail, world-space) ----
    function drawBubble(px, tipY, text, alpha) {
      const fontPx = Math.max(10, Math.round(SIZE * 0.32));
      ctx.font = fontPx + "px system-ui, sans-serif";
      const tw = ctx.measureText(text).width;
      const padX = SIZE * 0.3, h = fontPx + SIZE * 0.32;
      const w = tw + padX * 2;
      const by = tipY - SIZE * 0.34 - h;             // bubble top edge
      const bx = px - w / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(26,20,11,0.92)";
      ctx.strokeStyle = "rgba(201,180,137,0.85)";
      ctx.lineWidth = 1.2;
      cbChipRect(bx, by, w, h, Math.min(8, h / 2));
      ctx.fill(); ctx.stroke();
      ctx.beginPath();                               // tail toward the town
      ctx.moveTo(px - SIZE * 0.16, by + h - 0.5);
      ctx.lineTo(px, tipY);
      ctx.lineTo(px + SIZE * 0.16, by + h - 0.5);
      ctx.closePath();
      ctx.fillStyle = "rgba(26,20,11,0.92)";
      ctx.fill();
      ctx.fillStyle = "#f4ecdd";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, px, by + h / 2 + 0.5);
      ctx.restore();
    }

    // ---- draw: wanted-goods icon row (up to 4, cached per Sim tick) ----
    function drawWantedRow(px, py, row) {
      const icoPx = Math.max(9, Math.round(SIZE * 0.34));
      const gap = SIZE * 0.55;
      const x0 = px - gap * (row.length - 1) / 2;
      ctx.font = icoPx + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < row.length; i++) {
        const x = x0 + i * gap;
        ctx.globalAlpha = 0.85;                      // legibility badge
        ctx.fillStyle = "rgba(18,14,8,0.75)";
        ctx.beginPath(); ctx.arc(x, py, SIZE * 0.28, 0, Math.PI * 2); ctx.fill();
        if (row[i].acute) {                          // acute shortage highlight
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#ffce4d"; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(x, py, SIZE * 0.28, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillText(goodIcon(row[i].gid), x, py + 0.5);
      }
    }

    // ---- gold floaters: spawn on banked tax, drift up + fade (pooled) ----
    function spawnFloater(x, y, gold) {
      if (floaters.length >= MAX_FLOATERS) return;
      const f = fpool.pop() || {};
      f.x = x; f.y = y; f.life = FLOAT_LIFE;
      f.text = "+" + Math.round(gold) + "\u{1FA99}";  // 🪙
      floaters.push(f);
      floatersSpawned++;
    }
    function stepFloaters(dt) {
      if (!reduced()) {
        for (const t of state.towns || []) {
          if (!t || t.id == null) continue;
          const cool = floatCool.get(t.id) || 0;
          if (cool > 0) { floatCool.set(t.id, cool - dt); continue; }
          const pend = taxPend.get(t.id) || 0;
          if (pend >= 1) {
            const p = HexMath.hexToPixel(t.q, t.r, SIZE);
            spawnFloater(p.x, p.y - SIZE * 0.7, pend);
            taxPend.set(t.id, 0);
            floatCool.set(t.id, FLOAT_COOLDOWN);
          }
        }
      } else if (floaters.length) {                  // motion off: drop, keep pool
        while (floaters.length) fpool.push(floaters.pop());
      }
      if (!floaters.length || (state.zoom || 1) < 0.5) {
        // still age culled floaters so they expire instead of piling up
        for (let i = floaters.length - 1; i >= 0; i--) {
          const f = floaters[i];
          f.life -= dt;
          if (f.life <= 0) { floaters[i] = floaters[floaters.length - 1]; floaters.pop(); fpool.push(f); }
        }
        return;
      }
      const fontPx = Math.max(10, Math.round(SIZE * 0.34));
      ctx.save();
      ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.life -= dt;
        if (f.life <= 0) {
          floaters[i] = floaters[floaters.length - 1]; floaters.pop(); fpool.push(f);
          continue;
        }
        f.y -= dt * SIZE * 0.0006;                   // gentle upward drift
        ctx.globalAlpha = Math.min(1, (f.life / FLOAT_LIFE) * 1.4);
        ctx.strokeStyle = "rgba(18,12,5,0.8)"; ctx.lineWidth = 2.5;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = "#f4c94b";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }

    // Called once per render frame from drawWithDpr, after Juice.
    function frame(dt) {
      const d = Math.min(100, dt || 16);
      recompute();                                   // cheap no-op between Sim ticks
      // clocks run every frame (even culled) so throttles/lifetimes stay honest
      for (const [id, ms] of bubbleCool) if (ms > 0) bubbleCool.set(id, ms - d);
      for (const [id, b] of bubbles) { b.life -= d; if (b.life <= 0) bubbles.delete(id); }
      const zoomedIn = (state.zoom || 1) >= ZOOM_CULL;
      if (zoomedIn && (state.towns || []).length) {
        for (const t of state.towns) {
          if (!t || t.id == null) continue;
          const p = HexMath.hexToPixel(t.q, t.r, SIZE);
          if (!onScreen(p.x, p.y, 260)) continue;    // off-screen cull
          const row = wantedRows.get(t.id);
          if (row && row.length) drawWantedRow(p.x, p.y - SIZE * 1.6, row);
          const b = bubbles.get(t.id);
          if (b) {
            // quick fade-in, fade-out over the last ~350 ms; static when reduced
            const a = reduced() ? 1
              : Math.max(0, Math.min(1, b.life / 350, (BUBBLE_LIFE - b.life + 60) / 220));
            drawBubble(p.x, p.y - SIZE * 2.0, b.text, a);
          }
        }
        ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      }
      stepFloaters(d);
    }

    return {
      frame,
      get bubblesSpawned() { return bubblesSpawned; },
      get activeBubbles() { return bubbles.size; },
      get wantedComputes() { return wantedComputes; },
      get wantedRowCount() { let n = 0; for (const r of wantedRows.values()) if (r.length) n++; return n; },
      get floatersSpawned() { return floatersSpawned; },
      get activeFloaters() { return floaters.length; },
      get reducedMotion() { return reduced(); },
    };
  })();
  window.__ppe = PPE;   // debug/verification hook (headless probes read this)
  // === PP-E END ===
