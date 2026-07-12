  // === JUICE START === (P5-B / slot #3 — cozy micro-animations, canvas overlay)
  // A tiny particle/effects layer driven by the RENDER clock (the rAF `dt`). It
  // ONLY reads state.{carts,towns} + the module-local render caches (cartRender,
  // in scope in this IIFE) and draws an overlay AFTER every base draw. It never
  // mutates Sim/Trade/economy state, never writes to `state`, and never dirties
  // the offscreen terrain cache — so saves, tests and the pure core are all
  // unaffected. All transient effect state lives in the module-local arrays
  // below (never persisted). Honors prefers-reduced-motion (motion off). Perf
  // safeguards: a hard particle cap, a reused object pool, and zoom-culled
  // emission of smoke/trails when the camera is far out.
  const Juice = (() => {
    const MAX_PARTICLES = 240;      // hard cap — emission is skipped above this
    const parts = [];               // active particles (world-space)
    const pool  = [];               // dead particles, reused to avoid GC churn
    const cartPhase = {};           // cart.id -> last-seen phase (sale detection)
    const seenTowns = new Set();    // town ids already popped-in
    const seenBld = new Set();      // "townId:q,r" building keys already popped-in
    let smokeAcc = 0, trailAcc = 0; // emission cadence accumulators (ms)
    let primed = false;             // first frame primes "seen" sets w/o bursting

    const rmq = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduced = () => !!(rmq && rmq.matches);

    function alloc() { const p = pool.pop() || {}; parts.push(p); return p; }
    function kill(i) {
      const p = parts[i], last = parts.length - 1;
      parts[i] = parts[last]; parts.pop(); pool.push(p);
    }
    function spawn() { return parts.length >= MAX_PARTICLES ? null : alloc(); }

    function townById(id) {
      const ts = state.towns || [];
      for (const t of ts) if (t.id === id) return t;
      return null;
    }

    // ---- emitters (all read-only over state) ----
    // Coin/spark burst at a town when a trade cart banks its sale.
    function coinBurst(x, y) {
      for (let i = 0; i < 5; i++) {
        const p = spawn(); if (!p) break;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
        const sp = SIZE * 0.0024 + Math.random() * SIZE * 0.0012;
        p.kind = "coin";
        p.x = x + (Math.random() - 0.5) * SIZE * 0.4;
        p.y = y + (Math.random() - 0.5) * SIZE * 0.2;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.g = SIZE * 0.000007; p.grow = 0;
        p.size = SIZE * (0.09 + Math.random() * 0.05);
        p.life = p.max = 650 + Math.random() * 300;
        p.color = null;
      }
    }
    // Slow drifting smoke puff above an active producer's chimney.
    function smokePuff(x, y) {
      const p = spawn(); if (!p) return;
      p.kind = "smoke";
      p.x = x + (Math.random() - 0.5) * SIZE * 0.15; p.y = y;
      p.vx = SIZE * 0.0003 + (Math.random() - 0.5) * SIZE * 0.0005;
      p.vy = -(SIZE * 0.0005 + Math.random() * SIZE * 0.0004);
      p.g = 0; p.size = SIZE * 0.10; p.grow = SIZE * 0.00006;
      p.life = p.max = 1600 + Math.random() * 900; p.color = null;
    }
    // Faint fading dot dropped behind a moving cart.
    function trailDot(x, y, color) {
      const p = spawn(); if (!p) return;
      p.kind = "trail"; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.g = 0;
      p.size = SIZE * 0.12; p.grow = 0; p.life = p.max = 420; p.color = color;
    }
    // Expanding ring + sparkles when a town/building first appears.
    function popIn(x, y, r, color) {
      const p = spawn();
      if (p) {
        p.kind = "ring"; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.g = 0;
        p.size = r * 0.3; p.grow = r * 0.006; p.life = p.max = 420; p.color = color;
      }
      for (let i = 0; i < 4; i++) {
        const s = spawn(); if (!s) break;
        const a = Math.random() * Math.PI * 2, sp = SIZE * 0.0016;
        s.kind = "spark"; s.x = x; s.y = y;
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - SIZE * 0.0008;
        s.g = SIZE * 0.000004; s.grow = 0; s.size = SIZE * 0.07;
        s.life = s.max = 380 + Math.random() * 160; s.color = color;
      }
    }

    // ---- detectors (track transitions frame-to-frame; emit unless reduced) ----
    function detectSales() {
      const carts = state.carts || [], seen = {};
      for (const c of carts) {
        if (!c) continue;
        seen[c.id] = true;
        const prev = cartPhase[c.id];
        if (prev === "outbound" && c.phase === "return" && !reduced()) {
          const dest = townById(c.toId);
          if (dest) {
            const px = HexMath.hexToPixel(dest.q, dest.r, SIZE);
            coinBurst(px.x, px.y - SIZE * 0.4);
          }
        }
        cartPhase[c.id] = c.phase;
      }
      for (const id in cartPhase) if (!seen[id]) delete cartPhase[id];
    }
    function detectPopins() {
      const emit = primed && !reduced();
      for (const t of state.towns || []) {
        if (!seenTowns.has(t.id)) {
          seenTowns.add(t.id);
          if (emit) { const p = HexMath.hexToPixel(t.q, t.r, SIZE); popIn(p.x, p.y, SIZE * 0.8, "#ffe6a8"); }
        }
        if (Array.isArray(t.buildings)) for (const b of t.buildings) {
          const key = t.id + ":" + b.q + "," + b.r;
          if (!seenBld.has(key)) {
            seenBld.add(key);
            if (emit) { const p = HexMath.hexToPixel(b.q, b.r, SIZE); popIn(p.x, p.y, SIZE * 0.42, "#fff2cf"); }
          }
        }
      }
      primed = true;
    }
    function emitSmoke(dt) {
      if (state.zoom < 0.55) return;                 // zoom cull (far out)
      smokeAcc += dt; if (smokeAcc < 520) return; smokeAcc = 0;
      for (const t of state.towns || []) {
        if (!Array.isArray(t.buildings)) continue;
        for (const b of t.buildings) {
          if (!(b.workers > 0)) continue;
          const def = CONFIG.buildings[b.typeId];
          if (!def || (def.kind !== "extractor" && def.kind !== "processor")) continue;
          if (Math.random() < 0.5) continue;         // stagger puffs (keep count low)
          if (parts.length >= MAX_PARTICLES) return;
          const px = HexMath.hexToPixel(b.q, b.r, SIZE);
          smokePuff(px.x + SIZE * 0.16, px.y - SIZE * 0.28);
        }
      }
    }
    function emitTrails(dt) {
      if (state.zoom < 0.6) return;                  // zoom cull (dots-only regime)
      trailAcc += dt; if (trailAcc < 70) return; trailAcc = 0;
      for (const c of state.carts || []) {
        if (!c || c.done) continue;
        const rp = cartRender[c.id];                 // smoothed render pos (set by drawCarts)
        if (!rp) continue;
        if (parts.length >= MAX_PARTICLES) return;
        trailDot(rp.x, rp.y, goodColor(c.goodId));
      }
    }

    // ---- integrate + draw ----
    function update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { kill(i); continue; }
        if (p.g) p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.grow) p.size += p.grow * dt;
      }
    }
    function draw() {
      if (!parts.length) return;
      const prev = ctx.globalAlpha;
      for (const p of parts) {
        const a = Math.max(0, p.life / p.max);
        if (p.kind === "coin") {
          ctx.globalAlpha = Math.min(1, a * 1.3);
          ctx.fillStyle = "#f4c94b";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = Math.min(1, a * 1.3) * 0.7;
          ctx.fillStyle = "#fff0b8";
          ctx.beginPath(); ctx.arc(p.x - p.size * 0.28, p.y - p.size * 0.3, p.size * 0.4, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "smoke") {
          ctx.globalAlpha = a * 0.22; ctx.fillStyle = "#cfc4b4";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "trail") {
          ctx.globalAlpha = a * 0.28; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "ring") {
          ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === "spark") {
          ctx.globalAlpha = Math.min(1, a * 1.4); ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = prev;
    }

    // Called once per render frame from drawWithDpr, AFTER all base draws.
    function frame(dt) {
      const d = Math.min(100, dt || 16);
      if (reduced()) {
        // motion off: drop any lingering particles, but keep detectors current
        // so re-enabling later doesn't burst a backlog of "new" towns/sales.
        while (parts.length) kill(parts.length - 1);
        detectSales(); detectPopins();
        return;
      }
      detectSales();
      detectPopins();
      emitSmoke(d);
      emitTrails(d);
      update(d);
      draw();
    }

    return { frame, MAX_PARTICLES,
             get count() { return parts.length; },
             get reducedMotion() { return reduced(); } };
  })();
  window.Juice = Juice;
  // === JUICE END ===
