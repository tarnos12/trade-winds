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
            tr = {
              townId: t.id, bq: b.q, br: b.r, good,
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

    // Small porter token: faint shadow + little body + a goods-coloured parcel.
    // No wheels and ~half the radius of a trade cart's parcel, so it never reads
    // as an external caravan.
    function drawToken(x, y, color) {
      const r = SIZE * 0.11;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a5a30"; ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y - r * 0.12, r * 0.55, 0, Math.PI * 2); ctx.fill();
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
        const a = HexMath.hexToPixel(tr.bq, tr.br, SIZE);   // building end
        const c = HexMath.hexToPixel(town.q, town.r, SIZE); // centre end
        const f = tr.t * tr.t * (3 - 2 * tr.t);             // smoothstep ease
        // perpendicular jitter keeps porters from the same building from overlapping
        const dx = c.x - a.x, dy = c.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const j = tr.off * SIZE * 0.4;
        const x = a.x + dx * f + (-dy / len) * j;
        const y = a.y + dy * f + ( dx / len) * j;
        drawToken(x, y, goodColor(tr.good));
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
