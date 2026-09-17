  // === INTERNAL-TRADERS START === (v0.51 §2 — REAL internal porters, rendered)
  // A pure RENDER layer for the actual internal porters simulated in PURE_CORE
  // (Sim.tickPorters → town.porters). Each porter is a real hauler that walks from
  // the town centre to a producing building, loads its store, and carries it back to
  // the warehouse; this layer just draws where each one currently is. It never writes
  // to `state`, never touches the economy, and never dirties the terrain cache — all
  // motion/inventory state lives on town.porters (persisted, deterministic). We only
  // interpolate the porter's logical fraction for a smooth glide between economy ticks.
  //
  // Deliberately distinct from the EXTERNAL trade carts (drawCarts / drawCartToken):
  // porters are ~1/4 the size, wheel-less, and move *inside* the city footprint
  // (building <-> centre) instead of travelling roads between cities.
  //
  // Perf safeguards: a zoom cull when the camera is far out (external carts go
  // dots-only too) and prefers-reduced-motion which freezes the glide (positions
  // still reflect the true logical state, they just don't tween).
  const InternalTraders = (() => {
    const ZOOM_CULL = 0.6;      // below this zoom: cull (external carts go dots-only too)
    const GLIDE     = 0.18;     // per-frame lerp toward the logical fraction (smooths tick steps)
    // visual cache: "townId:index" -> { f } last-displayed fraction, for the glide.
    const vis = new Map();

    const rmq = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduced = () => !!(rmq && rmq.matches);

    // Tile-to-tile route: a hex line from the building hex to the town centre, as
    // pixel points, so a porter walks the SAME hex path a real cart would.
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

    // Small porter token: faint shadow + little slate-teal body + (when hauling) the
    // carried good's cargo chip — the same chip external carts use, so a porter reads
    // its cargo exactly like a trade cart, only smaller and cooler-toned.
    const PORTER_BODY = "#2f6e73", PORTER_EDGE = "rgba(10,20,20,0.5)";
    function drawToken(x, y, good, amount, muted) {
      const r = SIZE * 0.11;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PORTER_BODY; ctx.strokeStyle = PORTER_EDGE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // v0.51 (F): carrying → solid chip with the count; heading OUT to fetch → the
      // same good shown MUTED/translucent (it's going to pick this up, not holding it).
      if (good && typeof drawGoodChip === "function") {
        if (muted) drawGoodChip(x, y - r * 2.3, good, "", { alpha: 0.45, muted: true, hideNum: true });
        else if (amount > 0) drawGoodChip(x, y - r * 2.3, good, amount);
      }
    }

    function draw() {
      const seen = new Set();
      for (const t of state.towns || []) {
        const porters = Array.isArray(t.porters) ? t.porters : null;
        if (!porters || !porters.length) continue;
        for (let i = 0; i < porters.length; i++) {
          const p = porters[i];
          if (!p || p.phase === "idle") continue;          // parked porters stay at the depot
          // logical fraction along the building->centre hex line (pts[0]=building,
          // last=centre): outbound (toBuilding) runs centre->building (1 - prog);
          // return (toWarehouse) runs building->centre (prog).
          const prog = Math.max(0, Math.min(1, p.prog || 0));
          const target = (p.phase === "toWarehouse") ? prog : (1 - prog);
          // Two phases carry a load: toWarehouse (COLLECT return, building->centre) and
          // toConsumer (DISTRIBUTE, centre->building — a porter hauling a good out of the
          // warehouse to a house/workshop input buffer). toBuilding is the only empty leg
          // (heading OUT to fetch a producer's store), drawn muted. Without listing
          // toConsumer here a distribute porter rendered as an empty walker, so delivered
          // goods appeared in the building with no visible carrier.
          const carrying = (p.phase === "toWarehouse" || p.phase === "toConsumer");
          const key = t.id + ":" + i;
          seen.add(key);
          let v = vis.get(key);
          if (!v) { v = { f: target }; vis.set(key, v); }
          // glide the displayed fraction toward the logical one (skip when reduced-motion)
          v.f = reduced() ? target : v.f + (target - v.f) * GLIDE;
          const pts = hexLinePixels(p.bq, p.br, t.q, t.r);
          const pos = pointAlong(pts, v.f);
          // deterministic lateral spread so co-located porters don't overlap
          const a = pts[0], c = pts[pts.length - 1];
          const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
          const j = (((i % 5) - 2) * 0.22) * SIZE * 0.3;
          // carrying → solid good+count; heading out to fetch → the good it's going
          // to collect, shown muted (F).
          drawToken(pos.x + (-dy / len) * j, pos.y + (dx / len) * j,
                    p.good || null, carrying ? p.qty : 0, !carrying);
        }
      }
      // prune vis entries for porters that no longer exist / went idle
      for (const k of vis.keys()) if (!seen.has(k)) vis.delete(k);
    }

    // Called once per render frame from drawWithDpr, right after drawBuildings.
    function frame() {
      if ((state.zoom || 1) < ZOOM_CULL) { if (vis.size) vis.clear(); return; }
      draw();
    }

    return { frame, get count() { return vis.size; },
             get reducedMotion() { return reduced(); } };
  })();
  window.InternalTraders = InternalTraders;
  // === INTERNAL-TRADERS END ===
