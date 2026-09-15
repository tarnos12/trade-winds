  // === JUICE START === (P5-B / slot #3 — cozy micro-animations, canvas overlay)
  // A tiny particle/effects layer driven by the RENDER clock (the rAF `dt`). It
  // ONLY reads state.{carts,towns,treasury,castle} + the module-local render
  // caches (cartRender, in scope in this IIFE) and draws an overlay AFTER every
  // base draw. It never mutates Sim/Trade/economy state, never writes to
  // `state`, and never dirties the offscreen terrain cache — so saves, tests
  // and the pure core are all unaffected. All transient effect state lives in
  // the module-local arrays/maps below (never persisted). Honors
  // prefers-reduced-motion (motion off). Perf safeguards: a hard particle cap,
  // a reused object pool, and zoom-culled emission of smoke/trails when the
  // camera is far out.
  //
  // Effects: coinBurst (sale settles) + a "+Ng" tariff popup, smokePuff
  // (chimney smoke for ACTIVELY producing buildings only — idle/unstaffed/
  // input-starved buildings stay smokeless), trailDot + dustFleck (cart
  // movement), popIn (town/building first appears), buildComplete
  // (construction/upgrade finishes).
  const Juice = (() => {
    const MAX_PARTICLES = 240;      // hard cap — emission is skipped above this

    // --- tuning (named consts, no magic numbers below) ---
    const COIN_COUNT = 5;              // coins per sale burst
    const SALE_SPARK_COUNT = 3;        // extra bright sparkles per sale burst (punch)
    const TARIFF_POPUP_MIN = 0.4;      // min treasury delta (gold) to show a "+Ng" popup
    const SMOKE_INTERVAL = 520;        // ms between chimney-puff emission passes
    const SMOKE_COLOR_A = "#cfc4b4";   // chimney smoke tint A (subtle variation)
    const SMOKE_COLOR_B = "#ddd2bc";   // chimney smoke tint B
    const DUST_CHANCE = 0.35;          // odds of a dust fleck alongside a cart's trail dot
    const DUST_COLOR = "#c9b28f";      // pale road-dust tint
    const BUILD_COMPLETE_COLOR = "#bfe8a8";   // fresh construction finished (green-gold)
    const UPGRADE_COMPLETE_COLOR = "#ffd27a"; // level-up finished (warm gold)

    const parts = [];                // active particles (world-space)
    const pool  = [];                // dead particles, reused to avoid GC churn
    const cartPhase = {};            // cart.id -> last-seen phase (sale detection)
    const seenTowns = new Set();     // town ids already popped-in
    const seenBld = new Set();       // "townId:q,r" building keys already popped-in
    const bldProgress = {};          // "townId:q,r" -> {built, level} (construction/upgrade completion)
    const trailPrevPos = {};         // cart.id -> last trail-emission pixel pos (dust heading)
    let smokeAcc = 0, trailAcc = 0;  // emission cadence accumulators (ms)
    let primed = false;              // first frame primes "seen" sets w/o bursting
    let prevTreasury = null;         // last-seen state.treasury (tariff popup delta)
    let saleSpot = null;             // last sale location THIS frame (for the tariff popup)

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
    // Coin/spark burst at a town when a trade cart banks its sale. Punchier
    // than a plain coin: a soft gold ring pulse + a couple of bright sparkles
    // ride along for extra "ka-ching" without changing the read-only contract.
    function coinBurst(x, y) {
      for (let i = 0; i < COIN_COUNT; i++) {
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
      const r = spawn();
      if (r) {
        r.kind = "ring"; r.x = x; r.y = y; r.vx = 0; r.vy = 0; r.g = 0;
        r.size = SIZE * 0.12; r.grow = SIZE * 0.012; r.life = r.max = 380; r.color = "#ffe9b0";
      }
      for (let i = 0; i < SALE_SPARK_COUNT; i++) {
        const s = spawn(); if (!s) break;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const sp = SIZE * 0.0018 + Math.random() * SIZE * 0.001;
        s.kind = "spark"; s.x = x + (Math.random() - 0.5) * SIZE * 0.3; s.y = y;
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - SIZE * 0.0004;
        s.g = SIZE * 0.000005; s.grow = 0; s.size = SIZE * 0.06;
        s.life = s.max = 420 + Math.random() * 200; s.color = "#fff3c4";
      }
    }
    // Slow drifting smoke puff above an active producer's chimney. `lvl`
    // (building level) nudges size/richness a touch so upgraded plants read
    // as busier, without changing emission cadence dramatically.
    function smokePuff(x, y, lvl) {
      const p = spawn(); if (!p) return;
      p.kind = "smoke";
      p.x = x + (Math.random() - 0.5) * SIZE * 0.15; p.y = y;
      p.vx = SIZE * 0.0003 + (Math.random() - 0.5) * SIZE * 0.0005;
      p.vy = -(SIZE * 0.0005 + Math.random() * SIZE * 0.0004);
      p.g = 0;
      const bump = Math.min(0.4, ((lvl || 1) - 1) * 0.12);
      p.size = SIZE * (0.10 + bump * 0.12);
      p.grow = SIZE * (0.00006 + bump * 0.00002);
      p.life = p.max = 1600 + Math.random() * 900 + bump * 300;
      p.color = Math.random() < 0.5 ? SMOKE_COLOR_A : SMOKE_COLOR_B;
    }
    // Faint fading dot dropped behind a moving cart.
    function trailDot(x, y, color) {
      const p = spawn(); if (!p) return;
      p.kind = "trail"; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.g = 0;
      p.size = SIZE * 0.12; p.grow = 0; p.life = p.max = 420; p.color = color;
    }
    // Tiny neutral dust mote kicked up beside a cart's wheels — a subtle,
    // quick-fading sibling to trailDot (cargo-colored) for road-dust texture.
    function dustFleck(x, y) {
      const p = spawn(); if (!p) return;
      p.kind = "dust"; p.x = x; p.y = y;
      p.vx = (Math.random() - 0.5) * SIZE * 0.0004;
      p.vy = -SIZE * 0.00025 - Math.random() * SIZE * 0.0002;
      p.g = SIZE * 0.000003; p.grow = SIZE * 0.00003;
      p.size = SIZE * (0.05 + Math.random() * 0.03);
      p.life = p.max = 260 + Math.random() * 160;
      p.color = null;
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
    // Bigger "ta-da" double-ring + sparkle burst when a building finishes
    // construction or an upgrade completes — distinct from popIn (appearance)
    // by being showier and color-coded (green-gold new build, warm gold upgrade).
    function buildComplete(x, y, r, color) {
      const p1 = spawn();
      if (p1) {
        p1.kind = "ring"; p1.x = x; p1.y = y; p1.vx = 0; p1.vy = 0; p1.g = 0;
        p1.size = r * 0.25; p1.grow = r * 0.014; p1.life = p1.max = 560; p1.color = color;
      }
      const p2 = spawn();
      if (p2) {
        p2.kind = "ring"; p2.x = x; p2.y = y; p2.vx = 0; p2.vy = 0; p2.g = 0;
        p2.size = r * 0.1; p2.grow = r * 0.02; p2.life = p2.max = 520; p2.color = "#fff6df";
      }
      for (let i = 0; i < 6; i++) {
        const s = spawn(); if (!s) break;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const sp = SIZE * 0.0016 + Math.random() * SIZE * 0.001;
        s.kind = "spark"; s.x = x; s.y = y - r * 0.3;
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - SIZE * 0.0006;
        s.g = SIZE * 0.000005; s.grow = 0; s.size = SIZE * 0.065;
        s.life = s.max = 460 + Math.random() * 220; s.color = color;
      }
    }
    // Small floating text popup (e.g. "+12g" tariff feedback).
    function textPopup(x, y, text, color) {
      const p = spawn(); if (!p) return;
      p.kind = "text"; p.x = x; p.y = y; p.vx = 0; p.vy = -(SIZE * 0.00045); p.g = 0;
      p.size = Math.max(11, Math.round(SIZE * 0.24));  // reused as font px for this kind
      p.grow = 0; p.life = p.max = 900; p.color = color; p.text = text;
    }

    // ---- detectors (track transitions frame-to-frame; emit unless reduced) ----
    function detectSales() {
      const carts = state.carts || [], seen = {};
      saleSpot = null;
      for (const c of carts) {
        if (!c) continue;
        seen[c.id] = true;
        const prev = cartPhase[c.id];
        if (prev === "outbound" && c.phase === "return") {
          const dest = townById(c.toId);
          const pos = dest ? HexMath.hexToPixel(dest.q, dest.r, SIZE)
            : (state.castle ? HexMath.hexToPixel(state.castle.q, state.castle.r, SIZE) : null);
          if (pos) {
            saleSpot = pos;
            if (!reduced()) coinBurst(pos.x, pos.y - SIZE * 0.4);
          }
        }
        cartPhase[c.id] = c.phase;
      }
      for (const id in cartPhase) if (!seen[id]) delete cartPhase[id];
    }
    // Treasury ticked up (a tariff, or a castle sale) → a small floating
    // "+Ng" near wherever this frame's sale settled (falls back to nothing if
    // no sale landed this frame, keeping this purely reactive/read-only).
    function detectTariff() {
      const t = state.treasury;
      if (typeof t !== "number") return;
      if (prevTreasury === null) { prevTreasury = t; return; }   // prime, no burst on load
      const delta = t - prevTreasury;
      prevTreasury = t;
      if (delta > TARIFF_POPUP_MIN && saleSpot && !reduced()) {
        textPopup(saleSpot.x, saleSpot.y - SIZE * 0.75, "+" + Math.round(delta) + "g", "#ffd27a");
      }
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
    // Construction/upgrade completion: compares b.built/b.level frame-to-frame
    // per building key. First sighting of a key only records a baseline (no
    // burst), exactly like detectSales' cartPhase pattern — so this is safe to
    // run unconditionally (loading a save full of finished buildings won't
    // burst a backlog of "complete" pops).
    function detectBuilds() {
      for (const t of state.towns || []) {
        if (!Array.isArray(t.buildings)) continue;
        for (const b of t.buildings) {
          const key = t.id + ":" + b.q + "," + b.r;
          const built = b.built !== false;
          const level = b.upgradeLevel || 1;   // buildings.js field name (NOT b.level)
          const prev = bldProgress[key];
          if (prev && !reduced()) {
            if (!prev.built && built) {
              const p = HexMath.hexToPixel(b.q, b.r, SIZE);
              buildComplete(p.x, p.y, SIZE * 0.5, BUILD_COMPLETE_COLOR);
            } else if (prev.built && built && level > prev.level) {
              const p = HexMath.hexToPixel(b.q, b.r, SIZE);
              buildComplete(p.x, p.y, SIZE * 0.46, UPGRADE_COMPLETE_COLOR);
            }
          }
          bldProgress[key] = { built, level };
        }
      }
    }
    // Chimney smoke only for buildings that are ACTUALLY producing this tick:
    // staffed (workers > 0) AND, for processors, currently holding enough of
    // every input good to run (read-only stock check mirroring Sim's own
    // effW-gate). Idle/unstaffed/input-starved buildings stay smokeless.
    function producingNow(b, def, town) {
      const inputs = def.inputs;
      if (!inputs) return true;           // extractors: no inputs to starve on
      const stock = town.stock || {};
      for (const gid in inputs) if (!(stock[gid] > 0)) return false;
      return true;
    }
    function emitSmoke(dt) {
      if (state.zoom < 0.55) return;                 // zoom cull (far out)
      smokeAcc += dt; if (smokeAcc < SMOKE_INTERVAL) return; smokeAcc = 0;
      for (const t of state.towns || []) {
        if (!Array.isArray(t.buildings)) continue;
        for (const b of t.buildings) {
          if (!(b.workers > 0)) continue;
          const def = CONFIG.buildings[b.typeId];
          if (!def || (def.kind !== "extractor" && def.kind !== "processor")) continue;
          if (!producingNow(b, def, t)) continue;     // starved of inputs: no smoke
          const lvl = b.upgradeLevel || 1;             // buildings.js field name (NOT b.level)
          const puffChance = 0.5 + Math.min(0.3, (lvl - 1) * 0.08);  // busier plants puff a touch more
          if (Math.random() > puffChance) continue;   // stagger puffs (keep count low)
          if (parts.length >= MAX_PARTICLES) return;
          const px = HexMath.hexToPixel(b.q, b.r, SIZE);
          smokePuff(px.x + SIZE * 0.16, px.y - SIZE * 0.28, lvl);
        }
      }
    }
    function emitTrails(dt) {
      if (state.zoom < 0.6) return;                  // zoom cull (dots-only regime)
      trailAcc += dt; if (trailAcc < 70) return; trailAcc = 0;
      const seen = {};
      for (const c of state.carts || []) {
        if (!c || c.done) continue;
        const rp = cartRender[c.id];                 // smoothed render pos (set by drawCarts)
        if (!rp) continue;
        seen[c.id] = true;
        if (parts.length >= MAX_PARTICLES) break;
        trailDot(rp.x, rp.y, goodColor(c.goodId));
        const prevP = trailPrevPos[c.id];
        if (prevP && parts.length < MAX_PARTICLES && Math.random() < DUST_CHANCE) {
          const dx = rp.x - prevP.x, dy = rp.y - prevP.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;        // perpendicular to travel
          const side = Math.random() < 0.5 ? 1 : -1;
          dustFleck(rp.x + nx * side * SIZE * 0.14, rp.y + ny * side * SIZE * 0.14 + SIZE * 0.08);
        }
        trailPrevPos[c.id] = { x: rp.x, y: rp.y };
      }
      for (const id in trailPrevPos) if (!seen[id]) delete trailPrevPos[id];
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
          ctx.globalAlpha = a * 0.22; ctx.fillStyle = p.color || "#cfc4b4";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "trail") {
          ctx.globalAlpha = a * 0.28; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "dust") {
          ctx.globalAlpha = a * 0.2; ctx.fillStyle = DUST_COLOR;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "ring") {
          ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === "spark") {
          ctx.globalAlpha = Math.min(1, a * 1.4); ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === "text") {
          ctx.globalAlpha = Math.min(1, a * 1.2);
          ctx.font = "bold " + p.size + "px system-ui, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.lineWidth = Math.max(2, p.size * 0.16);
          ctx.strokeStyle = "rgba(58,38,16,0.55)";
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        }
      }
      ctx.globalAlpha = prev;
    }

    // Called once per render frame from drawWithDpr, AFTER all base draws.
    function frame(dt) {
      const d = Math.min(100, dt || 16);
      // Detectors always run (even under reduced-motion) so their trackers stay
      // current — re-enabling motion later won't burst a backlog of "new"
      // towns/sales/completions. Each detector internally gates its own
      // particle-spawning on !reduced().
      detectSales();
      detectPopins();
      detectBuilds();
      detectTariff();
      if (reduced()) {
        // motion off: drop any lingering particles; detectors above already ran.
        while (parts.length) kill(parts.length - 1);
        return;
      }
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
