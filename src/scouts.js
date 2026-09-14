  // === SCOUTS START === (v0.45 — Scout units: select / explore / reveal fog / castle refill)
  //
  // A REAL-TIME unit layer that lives in the browser IIFE (impure) — it may use the
  // frame clock, DOM and Math.random. It NEVER touches the pure economy core
  // (Sim/Trade); the only game-state it writes is the browser-side fog
  // (reveal()/state.revealed), the castle provision store (state.provisions) and
  // its own persisted roster (state.scouts). All motion/timers scale by
  // state.gameSpeed so 4× is faster and paused (0) freezes everything but drawing.
  //
  // Behaviour: each scout is a coloured token that marches out to a player-set
  // FLAG, stops on a VISIBLE tile beside undiscovered land, pauses, then lifts the
  // fog around it (1 tile per provision carried). When it runs dry it walks home
  // to the castle, refills from the King's provision store, and returns to the flag.
  //
  // Owns exactly one file (src/scouts.js). Runs INSIDE the renderer/input/mainloop
  // closure, so it calls their locals directly: state, ctx, SIZE, reveal, isVisible,
  // HexMath, Pathing, Buildings, Research, CONFIG, setMode, SFX, hexAtScreen,
  // buildingAtHex, showToast. (Function declarations are hoisted; SIZE/CONFIG are
  // defined by earlier modules in the splice; `state` is only read inside the
  // frame/handleClick hooks, never at module-load time.)

  // --- CONFIG (merged onto the shared CONFIG object) ---------------------------
  CONFIG.scouts = Object.assign({
    cap: 10,                 // max provisions a scout carries
    moveSpeed: 3.4,          // base movement, tiles / second (off-road)
    roadSpeedMult: 2,        // roads are ~2× faster (Pathing already prefers them)
    revealDelaySec: 2,       // pause at each stop before the fog lifts
    refillPerSec: 1,         // provisions drawn from the castle store per second
    revealRing: 1,           // fog lifted at a stop = ring-1 (the 6 neighbours)
    exploreRadius: 8,        // how far around the flag a scout will work
    colors: ["#d94b4b", "#4bd96b", "#4b7fd9"],
    colorNames: ["Red", "Green", "Blue"],
  }, CONFIG.scouts || {});

  const Scouts = (() => {
    const cfg = CONFIG.scouts;

    // ---- small helpers ------------------------------------------------------
    function parseKey(k) {
      const i = k.indexOf(",");
      return { q: parseInt(k.slice(0, i), 10), r: parseInt(k.slice(i + 1), 10) };
    }
    const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    function castle() {
      try { return Buildings.castleHex(); } catch (e) { return { q: 0, r: 0 }; }
    }
    function hasState() {
      return typeof state !== "undefined" && state && state.map && state.map.hexes;
    }

    // ---- roster: create / top-up / sanitise ---------------------------------
    // Idempotent — safe to call every frame, on a new game AND a loaded save.
    function ensure(st) {
      st = st || (typeof state !== "undefined" ? state : null);
      if (!st) return;
      if (!Array.isArray(st.scouts)) st.scouts = [];
      // Sanitise any loaded/partial scouts so a bad save can't crash the loop.
      for (const s of st.scouts) sanitise(s);
      const c = castle();
      let allowed = 1;
      try { allowed = 1 + (Research.effect(st, "scoutCount", 0) || 0); } catch (e) { allowed = 1; }
      allowed = Math.max(1, Math.min(cfg.colors.length, allowed | 0));
      let nextId = 1;
      for (const s of st.scouts) if ((s.id | 0) >= nextId) nextId = (s.id | 0) + 1;
      while (st.scouts.length < allowed) {
        const idx = st.scouts.length;
        st.scouts.push({
          id: nextId++, color: idx % cfg.colors.length,
          q: c.q, r: c.r, prov: cfg.cap, mode: "idle",
          target: null, path: null, leg: 0, legT: 0, revealT: 0, refillBuf: 0,
        });
      }
    }

    function sanitise(s) {
      if (!s || typeof s !== "object") return;
      if (typeof s.q !== "number") s.q = 0;
      if (typeof s.r !== "number") s.r = 0;
      if (typeof s.color !== "number") s.color = 0;
      s.color = ((s.color % cfg.colors.length) + cfg.colors.length) % cfg.colors.length;
      if (typeof s.prov !== "number" || !isFinite(s.prov)) s.prov = cfg.cap;
      s.prov = Math.max(0, Math.min(cfg.cap, Math.round(s.prov)));
      const modes = { idle: 1, explore: 1, reveal: 1, return: 1, refill: 1 };
      if (!modes[s.mode]) s.mode = "idle";
      if (s.target && (typeof s.target.q !== "number" || typeof s.target.r !== "number")) s.target = null;
      if (!Array.isArray(s.path)) s.path = null;
      if (typeof s.leg !== "number" || s.leg < 0) s.leg = 0;
      if (typeof s.legT !== "number") s.legT = 0;
      if (typeof s.revealT !== "number") s.revealT = 0;
      if (typeof s.refillBuf !== "number") s.refillBuf = 0;
    }

    // ---- pathing (roads faster via Pathing; visible-only fallback) ----------
    // Prefer Pathing.route (it returns the fastest road-preferring route). Only
    // accept it when EVERY tile on it is discovered — a scout must never stand on
    // fog. Otherwise fall back to a visible-only Dijkstra that still prefers roads.
    function plan(s, toKey) {
      const fromKey = HexMath.key(s.q, s.r);
      if (fromKey === toKey) return null;
      let path = null;
      try {
        const r = Pathing.route(state, fromKey, toKey);
        if (r && Array.isArray(r.path) && r.path.length >= 2 && r.path.every(k => isVisible(k)))
          path = r.path.slice();
      } catch (e) { /* fall through to visible BFS */ }
      if (!path) path = routeVisible(fromKey, toKey);
      return path;
    }

    // Dijkstra over DISCOVERED hexes only. Edge cost is lower onto a road tile so
    // road routes win, mirroring Pathing's road preference while guaranteeing the
    // whole path is visible. Returns an array of hex keys, or null.
    function routeVisible(fromKey, toKey) {
      if (!state.map.hexes.has(toKey) || !isVisible(toKey)) return null;
      const dist = new Map([[fromKey, 0]]);
      const prev = new Map();
      const frontier = new Map([[fromKey, 0]]);
      const visited = new Set();
      let guard = 0, GUARD = 40000;
      while (frontier.size && guard++ < GUARD) {
        let cur = null, curD = Infinity;
        for (const [k, d] of frontier) if (d < curD) { curD = d; cur = k; }
        frontier.delete(cur);
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (cur === toKey) break;
        const p = parseKey(cur);
        for (const n of HexMath.neighbors(p.q, p.r)) {
          const nk = HexMath.key(n.q, n.r);
          if (visited.has(nk)) continue;
          const nh = state.map.hexes.get(nk);
          if (!nh || !isVisible(nk)) continue;                        // never route through fog
          const td = CONFIG.terrain[nh.terrain];
          if (!td || !td.road) continue;                              // v0.47: mountains/water are impassable — never walk through them
          const step = (state.roads && state.roads.has(nk)) ? 0.6 : 1;
          const nd = curD + step;
          if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) {
            dist.set(nk, nd); prev.set(nk, cur); frontier.set(nk, nd);
          }
        }
      }
      if (!dist.has(toKey)) return null;
      const path = [];
      let cur = toKey;
      while (cur !== undefined) { path.push(cur); cur = prev.get(cur); }
      path.reverse();
      return path.length >= 2 ? path : null;
    }

    // ---- frontier: pick the next tile to STAND on and reveal from ------------
    // A frontier tile = an UNDISCOVERED hex within exploreRadius of the flag that
    // has at least one discovered neighbour (so a scout can stand beside it). We
    // pick the frontier nearest the flag (marching the scout toward it), and its
    // discovered neighbour nearest the SCOUT as the stand tile. Returns {q,r} or null.
    function findStop(s) {
      const flag = s.target || { q: s.q, r: s.r };
      let bestStand = null, bestScore = Infinity;
      for (const hex of state.map.hexes.values()) {
        const k = HexMath.key(hex.q, hex.r);
        if (isVisible(k)) continue;                                   // must be fog
        const df = HexMath.dist(flag.q, flag.r, hex.q, hex.r);
        if (df > cfg.exploreRadius) continue;                         // only near the flag
        let stand = null, sd = Infinity;
        for (const nb of HexMath.neighbors(hex.q, hex.r)) {
          const nk = HexMath.key(nb.q, nb.r);
          if (state.map.hexes.has(nk) && isVisible(nk)) {
            const d = HexMath.dist(s.q, s.r, nb.q, nb.r);
            if (d < sd) { sd = d; stand = nb; }
          }
        }
        if (!stand) continue;
        const score = df * 1000 + sd;   // nearest-to-flag first, then shortest walk
        if (score < bestScore) { bestScore = score; bestStand = stand; }
      }
      return bestStand;
    }

    // Reveal ring-1 fog around the scout, nearest-to-flag first, capped by
    // provisions. Decrements provisions by the number actually revealed.
    function doReveal(s) {
      if (s.prov <= 0) return 0;
      const flag = s.target || { q: s.q, r: s.r };
      const cands = [];
      for (const h of HexMath.range(s.q, s.r, cfg.revealRing)) {
        if (h.q === s.q && h.r === s.r) continue;
        const k = HexMath.key(h.q, h.r);
        if (state.map.hexes.has(k) && !isVisible(k)) cands.push(h);
      }
      if (!cands.length) return 0;
      cands.sort((a, b) => HexMath.dist(flag.q, flag.r, a.q, a.r) - HexMath.dist(flag.q, flag.r, b.q, b.r));
      const n = Math.min(s.prov, cands.length);
      for (let i = 0; i < n; i++) reveal(cands[i].q, cands[i].r, 0);   // reveal() flags terrainDirty
      s.prov -= n;
      return n;
    }

    // ---- per-scout update (dt already scaled by gameSpeed, in seconds) -------
    function updateScout(s, dt) {
      if (dt <= 0) return;                 // paused: freeze logic (still drawn)
      switch (s.mode) {
        case "idle":    if (s.target) { s.mode = "explore"; s.path = null; } break;
        case "explore": stepExplore(s, dt); break;
        case "reveal":
          s.revealT -= dt;
          if (s.revealT <= 0) { doReveal(s); s.mode = "explore"; s.path = null; }
          break;
        case "return":  stepReturn(s, dt); break;
        case "refill":  stepRefill(s, dt); break;
      }
    }

    function beginReveal(s) { s.mode = "reveal"; s.revealT = cfg.revealDelaySec; s.path = null; }
    function beginReturn(s) { s.mode = "return"; s.path = null; }

    function stepExplore(s, dt) {
      if (s.prov <= 0) { beginReturn(s); return; }
      if (!s.path) {
        const stand = findStop(s);
        if (stand) {                                                     // fog to uncover near the flag
          if (stand.q === s.q && stand.r === s.r) { beginReveal(s); return; }
          const path = plan(s, HexMath.key(stand.q, stand.r));
          if (!path || path.length < 2) { beginReveal(s); return; }      // already adjacent / unroutable
          s.path = path; s.leg = 0; s.legT = 0;
        } else {
          // No fog left near the flag — WALK to the clicked target tile itself
          // (so "explore here" always moves the scout, even across discovered
          // ground), then reveal on arrival. Idle only once we're there.
          const tgt = s.target;
          if (tgt && (tgt.q !== s.q || tgt.r !== s.r)) {
            const path = plan(s, HexMath.key(tgt.q, tgt.r));
            if (!path || path.length < 2) { s.target = null; s.mode = "idle"; return; }   // unreachable
            s.path = path; s.leg = 0; s.legT = 0;
          } else { s.target = null; s.mode = "idle"; return; }           // arrived; nothing to reveal
        }
      }
      advance(s, dt);
      if (arrived(s)) { s.path = null; beginReveal(s); }
    }

    function stepReturn(s, dt) {
      const c = castle();
      if (s.q === c.q && s.r === c.r) { s.mode = "refill"; s.path = null; return; }
      if (!s.path) {
        const path = plan(s, HexMath.key(c.q, c.r));
        if (!path || path.length < 2) { s.q = c.q; s.r = c.r; s.mode = "refill"; return; }
        s.path = path; s.leg = 0; s.legT = 0;
      }
      advance(s, dt);
      if (arrived(s)) { s.path = null; s.mode = "refill"; }
    }

    function stepRefill(s, dt) {
      s.refillBuf += cfg.refillPerSec * dt;
      while (s.refillBuf >= 1 && s.prov < cfg.cap && (state.provisions || 0) >= 1) {
        s.refillBuf -= 1; s.prov += 1;
        state.provisions = Math.max(0, (state.provisions || 0) - 1);
      }
      if (s.prov >= cfg.cap) { s.refillBuf = 0; resume(s); }
      else if ((state.provisions || 0) < 1 && s.prov > 0) { s.refillBuf = 0; resume(s); }
      // else (empty scout + empty store): wait at the castle until goods arrive.
    }

    function resume(s) {
      if (s.target) { s.mode = "explore"; s.path = null; }
      else s.mode = "idle";
    }

    // Advance along the current path by `dt` seconds. Road tiles move roadSpeedMult
    // faster. Updates s.q/s.r (integer tile) + s.legT (0..1 within the segment).
    function advance(s, dt) {
      const path = s.path;
      if (!path) return;
      let t = dt;
      let guard = 0;
      while (t > 0 && s.leg < path.length - 1 && guard++ < 512) {
        const destKey = path[s.leg + 1];
        const onRoad = state.roads && (state.roads.has(destKey) || state.roads.has(path[s.leg]));
        const spd = cfg.moveSpeed * (onRoad ? cfg.roadSpeedMult : 1);   // tiles / sec
        const timeToEnd = (1 - s.legT) / spd;
        if (timeToEnd <= t) {
          t -= timeToEnd;
          s.leg += 1; s.legT = 0;
          const p = parseKey(path[s.leg]); s.q = p.q; s.r = p.r;
        } else {
          s.legT += spd * t; t = 0;
        }
      }
    }
    function arrived(s) { return !s.path || s.leg >= s.path.length - 1; }

    // Smooth pixel position along the path (WORLD coords — the world transform is
    // already applied when the frame hook runs).
    function scoutPixel(s) {
      const path = s.path;
      if (path && s.leg < path.length - 1) {
        const a = parseKey(path[s.leg]), b = parseKey(path[s.leg + 1]);
        const pa = HexMath.hexToPixel(a.q, a.r, SIZE), pb = HexMath.hexToPixel(b.q, b.r, SIZE);
        const f = Math.max(0, Math.min(1, s.legT));
        return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f };
      }
      return HexMath.hexToPixel(s.q, s.r, SIZE);
    }
    // The tile a scout visually occupies right now (for click hit-testing).
    function scoutCell(s) {
      const p = scoutPixel(s);
      return HexMath.pixelToHex(p.x, p.y, SIZE);
    }

    // ---- drawing ------------------------------------------------------------
    function drawScouts() {
      const scouts = state.scouts || [];
      if (!scouts.length) return;
      const t = nowMs();
      // flags first (under the tokens)
      for (const s of scouts) if (s.target) drawFlag(s.target.q, s.target.r, cfg.colors[s.color]);
      // tokens + indicators on top
      for (const s of scouts) {
        const p = scoutPixel(s);
        if (s.mode === "reveal") {
          const frac = 1 - Math.max(0, Math.min(1, s.revealT / cfg.revealDelaySec));
          drawRevealIndicator(p.x, p.y, frac, t);
        }
        if (s.id === selectedId) drawSelRing(p.x, p.y, t);
        drawToken(p.x, p.y, cfg.colors[s.color]);
      }
    }

    function drawToken(x, y, color) {
      const r = SIZE * 0.26;
      ctx.save();
      // ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      // body
      ctx.fillStyle = color; ctx.strokeStyle = "rgba(10,8,4,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // little pennant so it reads as a scout, not a goods dot
      ctx.strokeStyle = "rgba(10,8,4,0.85)"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.2); ctx.lineTo(x, y - r * 1.7); ctx.stroke();
      ctx.fillStyle = color; ctx.strokeStyle = "rgba(10,8,4,0.7)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x + r * 0.95, y - r * 1.42); ctx.lineTo(x, y - r * 1.14);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // inner highlight
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawFlag(q, r, color) {
      const p = HexMath.hexToPixel(q, r, SIZE);
      const x = p.x, y = p.y, h = SIZE * 0.9;
      ctx.save();
      ctx.strokeStyle = "rgba(10,8,4,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
      ctx.fillStyle = color; ctx.strokeStyle = "rgba(10,8,4,0.7)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - h); ctx.lineTo(x + SIZE * 0.62, y - h * 0.82); ctx.lineTo(x, y - h * 0.64);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // faint target ring on the ground
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, SIZE * 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    function drawRevealIndicator(x, y, frac, t) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 180);
      const rad = SIZE * (0.5 + 0.12 * pulse);
      ctx.save();
      ctx.strokeStyle = "rgba(245,232,200,0.55)"; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      // progress arc
      ctx.globalAlpha = 0.95; ctx.strokeStyle = "#f5e8c8"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, SIZE * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)));
      ctx.stroke();
      ctx.restore();
    }

    function drawSelRing(x, y, t) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 220);
      ctx.save();
      ctx.strokeStyle = "#fff3d0"; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.6 + 0.35 * pulse;
      ctx.beginPath(); ctx.arc(x, y, SIZE * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ---- selection state ----------------------------------------------------
    let selectedId = null;
    let armed = false;          // Explore pressed → next visible-tile click sets the target

    function scoutById(id) {
      for (const s of (state.scouts || [])) if (s.id === id) return s;
      return null;
    }
    function selectedScout() { return selectedId == null ? null : scoutById(selectedId); }

    function scoutAtCell(q, r) {
      for (const s of (state.scouts || [])) {
        if (s.q === q && s.r === r) return s;
        const c = scoutCell(s);
        if (c.q === q && c.r === r) return s;
      }
      return null;
    }

    // A tile that belongs to another interactive object — clicking it should open
    // that thing's panel, not redirect a scout (except when explicitly armed).
    function occupiedByBuild(q, r) {
      if (state.researchCenter && state.researchCenter.q === q && state.researchCenter.r === r) return true;
      const c = castle();
      if (c.q === q && c.r === r) return true;
      if ((state.towns || []).some(t => t.q === q && t.r === r)) return true;
      try { if (typeof buildingAtHex === "function" && buildingAtHex(q, r)) return true; } catch (e) {}
      return false;
    }

    function setExploreTarget(s, q, r) {
      s.target = { q, r };
      s.path = null;
      if (s.mode !== "return" && s.mode !== "refill") s.mode = "explore";
      try { if (typeof SFX !== "undefined" && SFX.playThrottled) SFX.playThrottled("place", 120, "scout order"); } catch (e) {}
      updatePanel();
    }

    function select(id) {
      selectedId = id; armed = false;
      updateBar(); updatePanel();
    }
    function deselect() { selectedId = null; armed = false; updateBar(); updatePanel(); }

    // Called from input.js on a plain pan-mode left click, BEFORE placement.
    // Return true to consume the click.
    function handleClick(q, r, e) {
      if (!hasState() || !Array.isArray(state.scouts)) return false;
      ensure(state);
      const key = HexMath.key(q, r);
      // 1) click on a scout → select it
      const hit = scoutAtCell(q, r);
      if (hit) { select(hit.id); return true; }
      const sc = selectedScout();
      // 2) armed (Explore pressed) → the next visible tile becomes the target
      if (sc && armed) {
        if (state.map.hexes.has(key) && isVisible(key)) { setExploreTarget(sc, q, r); armed = false; updatePanel(); return true; }
        try { if (typeof showToast === "function") showToast("Pick a discovered tile to explore."); } catch (ex) {}
        return true;   // stay armed, swallow the click
      }
      // 3) a scout is selected → a click on open discovered ground redirects it
      if (sc && state.map.hexes.has(key) && isVisible(key) && !occupiedByBuild(q, r)) {
        setExploreTarget(sc, q, r); return true;
      }
      return false;
    }

    // ---- DOM: top-left roster + bottom unit panel ---------------------------
    let bar = null, panel = null, provEl = null, nameEl = null;
    let lastBarCount = -1, lastDom = 0;

    function injectStyle() {
      if (document.getElementById("scoutStyle")) return;
      const st = document.createElement("style");
      st.id = "scoutStyle";
      st.textContent = `
      #scoutBar { position: fixed; top: 200px; left: 12px; z-index: 34;
        display: flex; gap: 6px; padding: 5px 7px; border-radius: 10px;
        background: rgba(20,16,10,0.72); border: 1px solid #6b5636;
        box-shadow: 0 3px 12px rgba(0,0,0,0.45); }
      #scoutBar.empty { display: none; }
      .scout-ico { width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
        border: 2px solid rgba(10,8,4,0.7); position: relative; padding: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: bold; color: rgba(255,255,255,0.92);
        text-shadow: 0 1px 1px rgba(0,0,0,0.6); transition: transform .1s, box-shadow .1s; }
      .scout-ico:hover { transform: translateY(-1px); }
      .scout-ico.sel { box-shadow: 0 0 0 2px #fff3d0, 0 0 8px rgba(255,243,208,0.6); }
      #scoutPanel { position: fixed; left: 12px; bottom: 12px;
        z-index: 33; min-width: 244px; padding: 10px 12px; border-radius: 12px;
        background: rgba(28,22,15,0.92); border: 1px solid #6b5636;
        box-shadow: 0 6px 22px rgba(0,0,0,0.5); color: #f2e6cf;
        font-family: system-ui, sans-serif; font-size: 13px; }
      #scoutPanel.hidden { display: none; }
      #scoutPanel .sp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      #scoutPanel .sp-dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(10,8,4,0.7); flex: 0 0 auto; }
      #scoutPanel .sp-name { font-weight: bold; }
      #scoutPanel .sp-prov { margin-left: auto; font-variant-numeric: tabular-nums; opacity: 0.92; }
      #scoutPanel .sp-btns { display: flex; gap: 6px; }
      #scoutPanel .sp-btns button { flex: 1; font-family: inherit; font-size: 12px;
        padding: 6px 8px; border-radius: 7px; cursor: pointer; color: #f2e6cf;
        background: #3a2e1d; border: 1px solid #6b5636; transition: background .12s; }
      #scoutPanel .sp-btns button:hover:not(:disabled) { background: #4d3c24; }
      #scoutPanel .sp-btns button.armed { background: var(--accent, #c98a3c); color: #201607; border-color: #e0a860; font-weight: bold; }
      #scoutPanel .sp-btns button:disabled { opacity: 0.4; cursor: not-allowed; }
      `;
      document.head.appendChild(st);
    }

    function buildDom() {
      if (bar) return;
      injectStyle();
      bar = document.createElement("div");
      bar.id = "scoutBar"; bar.className = "empty";
      document.body.appendChild(bar);

      panel = document.createElement("div");
      panel.id = "scoutPanel"; panel.className = "hidden";
      panel.innerHTML =
        '<div class="sp-head"><span class="sp-dot" id="scoutPanelDot"></span>' +
        '<span class="sp-name" id="scoutPanelName">Scout</span>' +
        '<span class="sp-prov" id="scoutPanelProv">🎒 0/' + cfg.cap + '</span></div>' +
        '<div class="sp-btns">' +
        '<button id="scoutBtnExplore">Explore</button>' +
        '<button id="scoutBtnReturn">Return to castle</button>' +
        '<button id="scoutBtnGuard" disabled title="Coming with bandits/enemies">Guard area</button>' +
        '</div>';
      document.body.appendChild(panel);
      nameEl = panel.querySelector("#scoutPanelName");
      provEl = panel.querySelector("#scoutPanelProv");

      panel.querySelector("#scoutBtnExplore").addEventListener("click", () => {
        const s = selectedScout(); if (!s) return;
        armed = !armed;                       // toggle: press again to cancel
        if (armed && typeof setMode === "function") setMode("pan");   // targeting needs pan-mode clicks
        updatePanel();
      });
      panel.querySelector("#scoutBtnReturn").addEventListener("click", () => {
        const s = selectedScout(); if (!s) return;
        s.target = null; armed = false; beginReturn(s); updatePanel();
      });
      // Guard is intentionally disabled (tooltip explains why).
      // v0.47: deselect the scout with ESC or a right-click anywhere on the map.
      window.addEventListener("keydown", (e) => { if (e.key === "Escape" && selectedId != null) deselect(); });
      document.addEventListener("contextmenu", (e) => {
        if (selectedId != null && e.target && e.target.tagName === "CANVAS") deselect();
      });
    }

    function updateBar() {
      if (!bar) return;
      const scouts = state.scouts || [];
      // Rebuild only when the count changes (cheap; count changes rarely).
      if (scouts.length !== lastBarCount) {
        lastBarCount = scouts.length;
        bar.innerHTML = "";
        for (const s of scouts) {
          const b = document.createElement("button");
          b.className = "scout-ico";
          b.dataset.id = String(s.id);
          b.style.background = cfg.colors[s.color];
          b.title = cfg.colorNames[s.color] + " Scout";
          b.textContent = cfg.colorNames[s.color].charAt(0);
          b.addEventListener("click", () => select(s.id));
          bar.appendChild(b);
        }
      }
      bar.classList.toggle("empty", scouts.length === 0);
      // selection highlight
      for (const b of bar.children) b.classList.toggle("sel", b.dataset.id === String(selectedId));
    }

    function updatePanel() {
      if (!panel) return;
      const s = selectedScout();
      if (!s) { panel.classList.add("hidden"); return; }
      panel.classList.remove("hidden");
      panel.querySelector("#scoutPanelDot").style.background = cfg.colors[s.color];
      nameEl.textContent = cfg.colorNames[s.color] + " Scout";
      provEl.textContent = "🎒 " + Math.floor(s.prov) + "/" + cfg.cap;
      const ex = panel.querySelector("#scoutBtnExplore");
      ex.classList.toggle("armed", armed);
      ex.textContent = armed ? "Click a tile…" : "Explore";
    }

    // ---- frame hook (called every render frame from drawWithDpr) ------------
    function frame(dt) {
      if (!hasState()) return;
      if (!bar) buildDom();
      ensure(state);
      // If the selected scout vanished (e.g. new game/load), drop the selection.
      if (selectedId != null && !selectedScout()) { selectedId = null; armed = false; }
      const gs = Math.max(0, state.gameSpeed || 0);
      const dtSec = (Math.min(100, dt || 16) / 1000) * gs;   // 0 when paused → frozen
      for (const s of state.scouts) updateScout(s, dtSec);
      drawScouts();
      // Throttle DOM refresh to ~10 Hz (positions/provisions update live).
      const t = nowMs();
      if (t - lastDom > 100) { lastDom = t; updateBar(); updatePanel(); }
    }

    return {
      frame, ensure, handleClick,
      // debug / test hooks
      select, deselect,
      get selectedId() { return selectedId; },
      set armed(v) { armed = !!v; updatePanel(); },
      get armed() { return armed; },
      setExploreTarget,
      _cfg: cfg,
    };
  })();

  if (typeof window !== "undefined") window.Scouts = Scouts;
  // === SCOUTS END ===
