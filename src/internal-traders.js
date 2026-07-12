  // === INTERNAL-TRADERS START === (TR-B / slot #4 — ambient within-city porters)
  // A pure render overlay: per city, tiny "porter" carts shuttle between each
  // ACTIVELY-producing building (extractor/processor with workers>0) and the town
  // centre, carrying a goods-coloured dot in that building's output colour. This
  // is AMBIENT VISUAL LIFE ONLY — it never touches Sim/Trade/economy, never writes
  // to `state`, and never dirties the offscreen terrain cache. All motion state
  // lives in a module-local roster (a Map keyed by building), pooled+reused and
  // never persisted, so saves and headless tests are unaffected.
  //
  // Deliberately distinct from the EXTERNAL trade carts (drawCarts / drawCartToken):
  // porters are ~1/4 the size, wheel-less, and oscillate *inside* the city
  // footprint (building <-> centre) instead of travelling roads between cities —
  // so the two layers read as clearly different.
  //
  // Perf safeguards: a per-city cap and a global hard cap, object reuse via the
  // roster Map (no per-frame allocation once warm), a zoom cull that clears the
  // roster when the camera is far out (matches the carts' dots-only regime), and
  // prefers-reduced-motion which freezes/clears them entirely.
  const InternalTraders = (() => {
    const MAX_TRADERS = 64;     // global hard cap on live porters
    const PER_CITY    = 4;      // cap per city (a few is enough to read as "alive")
    const LEG_MS      = 1500;   // ms for one building<->centre leg
    const ZOOM_CULL   = 0.6;    // below this zoom: cull (external carts go dots-only too)
    const roster = new Map();   // "townId:q,r" -> porter obj (persistent, reused)

    const rmq = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduced = () => !!(rmq && rmq.matches);

    // A building emits a porter only if it's an extractor/processor that is
    // staffed and has a defined output good (houses never qualify).
    function producerGood(b) {
      const def = CONFIG.buildings[b.typeId];
      if (!def || (def.kind !== "extractor" && def.kind !== "processor")) return null;
      return (def.output && def.output.goodId) ? def.output.goodId : null;
    }

    // Refresh the roster to match currently-producing buildings: add porters for
    // new producers (respecting caps), prune those whose building stopped/vanished.
    function sync() {
      const wanted = new Set();
      let total = 0;
      for (const t of state.towns || []) {
        if (total >= MAX_TRADERS) break;
        if (!Array.isArray(t.buildings)) continue;
        let cityCount = 0;
        for (const b of t.buildings) {
          if (total >= MAX_TRADERS || cityCount >= PER_CITY) break;
          if (!(b.workers > 0)) continue;
          const good = producerGood(b);
          if (!good) continue;
          const key = t.id + ":" + b.q + "," + b.r;
          wanted.add(key);
          let tr = roster.get(key);
          if (!tr) {
            const def = CONFIG.buildings[b.typeId];
            tr = {
              townId: t.id, bq: b.q, br: b.r, good,
              amount: Math.max(1, Math.round((def && def.output && def.output.ratePerWorker) || 1)),
              pts: hexLinePixels(b.q, b.r, t.q, t.r),   // L: tile-to-tile hex path
              t: Math.random(),                 // desynced start along the leg
              dir: Math.random() < 0.5 ? 1 : -1,
              off: (Math.random() - 0.5),       // lateral jitter so co-located porters spread
            };
            roster.set(key, tr);
          } else {
            tr.good = good;                     // cheap refresh (output rarely changes)
          }
          cityCount++; total++;
        }
      }
      for (const key of roster.keys()) if (!wanted.has(key)) roster.delete(key);
    }

    function townById(id) {
      for (const t of state.towns || []) if (t.id === id) return t;
      return null;
    }

    // Tile-to-tile route (L): a hex line from the building hex to the town centre,
    // as pixel points — so a porter walks the SAME hex path a real cart would,
    // not a straight diagonal across tiles. Computed once per porter (endpoints
    // are static). Mirrors Pathing's off-road cube-lerp line.
    function hexLinePixels(bq, br, cq, cr) {
      const N = HexMath.dist(bq, br, cq, cr);
      const pts = [];
      let last = null;
      for (let i = 0; i <= N; i++) {
        const t = N === 0 ? 0 : i / N;
        const h = HexMath.hexRound(bq + (cq - bq) * t, br + (cr - br) * t);
        const k = h.q + "," + h.r;
        if (k !== last) { pts.push(HexMath.hexToPixel(h.q, h.r, SIZE)); last = k; }
      }
      if (pts.length === 0) pts.push(HexMath.hexToPixel(bq, br, SIZE));
      return pts;
    }

    // Point at fraction f (0..1) along a pixel polyline, by cumulative length.
    function pointAlong(pts, f) {
      if (pts.length === 1) return pts[0];
      let total = 0; const seg = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        seg.push(l); total += l;
      }
      if (total === 0) return pts[0];
      let d = Math.max(0, Math.min(1, f)) * total;
      for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i] || i === seg.length - 1) {
          const t = seg[i] ? d / seg[i] : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
                   y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
        }
        d -= seg[i];
      }
      return pts[pts.length - 1];
    }

    // Small porter token: faint shadow + little body + the carried good's icon.
    // No wheels and ~half the radius of a trade cart's parcel (size/shape already
    // reads as ambient, not an external caravan) — I: the BODY colour is also now
    // a cool slate-teal, deliberately far from the external wagon's warm browns
    // (drawCartToken in carts-castle-ui.js: body #6b4a22, wheels #2a1c0c) so the
    // two trader layers are unmistakable at a glance, not just a size difference.
    // The goods-icon glyph (goodIcon, town-ui.js — shared closure) replaces the
    // old plain colour dot so the carried good reads explicitly, matching the
    // external carts' cargo-chip convention (drawGoodChip, renderer.js).
    const PORTER_BODY = "#2f6e73", PORTER_EDGE = "rgba(10,20,20,0.5)";
    function drawToken(x, y, good, amount) {
      const r = SIZE * 0.11;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PORTER_BODY; ctx.strokeStyle = PORTER_EDGE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // K: the SAME cargo chip external carts use (drawGoodChip), so an internal
      // porter reads its carried good exactly like a trade cart — only the body
      // colour/size distinguishes the two layers.
      if (typeof drawGoodChip === "function" && good) drawGoodChip(x, y - r * 2.3, good, amount || 1);
    }

    function draw(dt) {
      const d = Math.min(100, dt || 16);
      for (const tr of roster.values()) {
        // advance the oscillation 0<->1 (building <-> centre), gently looping
        tr.t += (tr.dir * d) / LEG_MS;
        if (tr.t >= 1) { tr.t = 1; tr.dir = -1; }
        else if (tr.t <= 0) { tr.t = 0; tr.dir = 1; }
        const town = townById(tr.townId);
        if (!town) continue;
        if (!tr.pts) tr.pts = hexLinePixels(tr.bq, tr.br, town.q, town.r);
        const f = tr.t * tr.t * (3 - 2 * tr.t);             // eased shuttle turnaround
        const p = pointAlong(tr.pts, f);                    // L: walk the hex path tile-to-tile
        // perpendicular jitter (vs the overall building→centre line) so porters
        // from the same building don't overlap.
        const a = tr.pts[0], c = tr.pts[tr.pts.length - 1];
        const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
        const j = tr.off * SIZE * 0.3;
        drawToken(p.x + (-dy / len) * j, p.y + (dx / len) * j, tr.good, tr.amount);
      }
    }

    // Called once per render frame from drawWithDpr, right after drawBuildings.
    function frame(dt) {
      // reduced-motion or far-out zoom: keep the roster empty so nothing animates
      // or draws (and the array can never grow while culled).
      if (reduced() || (state.zoom || 1) < ZOOM_CULL) {
        if (roster.size) roster.clear();
        return;
      }
      sync();
      draw(dt);
    }

    return { frame, MAX_TRADERS,
             get count() { return roster.size; },
             get reducedMotion() { return reduced(); } };
  })();
  window.InternalTraders = InternalTraders;
  // === INTERNAL-TRADERS END ===
