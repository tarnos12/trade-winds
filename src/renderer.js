  // ---------------------------------------------------------------
  // Geometry helpers (browser-side; use CONFIG.map.hexSize)
  // ---------------------------------------------------------------
  const SIZE = CONFIG.map.hexSize;

  function hexCorners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);   // pointy-top
      pts.push([cx + SIZE * Math.cos(a), cy + SIZE * Math.sin(a)]);
    }
    return pts;
  }

  function worldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const h of state.map.hexes.values()) {
      const p = HexMath.hexToPixel(h.q, h.r, SIZE);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX - SIZE, minY: minY - SIZE, maxX: maxX + SIZE, maxY: maxY + SIZE };
  }

  // ---------------------------------------------------------------
  // Fog
  // ---------------------------------------------------------------
  function reveal(cq, cr, radius) {
    for (const h of HexMath.range(cq, cr, radius)) {
      const k = HexMath.key(h.q, h.r);
      if (state.map.hexes.has(k) && !state.revealed.has(k)) {
        state.revealed.add(k);
        const hex = state.map.hexes.get(k);
        hex.revealed = true;
      }
    }
    terrainDirty = true;
  }

  function isVisible(k) { return state.revealAll || state.revealed.has(k); }

  // === TILE-ICONS ===
  // Small, code-drawn terrain motifs baked into the offscreen terrain layer
  // (drawn once per fog-reveal / resize, 0 extra cost per frame). Kept quiet and
  // low-contrast so town / building / cart glyphs drawn per-frame on top read
  // clearly. Pure canvas paths — no external images/emoji (CSP blocks them).
  // Tints: DARK = a soft shadow, LITE = a soft highlight, both scaled off the
  // hex fill so icons sit on the warm/sepia palette rather than fight it.
  const ICON_DARK = "rgba(40,30,15,0.34)";
  const ICON_LITE = "rgba(255,249,233,0.42)";
  function drawTerrainIcon(ctx, cx, cy, size, terrain) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const s = size; // hex radius
    switch (terrain) {
      case "forest": {
        // A couple of simple pine trees (stacked triangles + trunk).
        const drawPine = (ox, oy, sc) => {
          const w = s * 0.34 * sc, hgt = s * 0.7 * sc;
          ctx.fillStyle = ICON_DARK;
          // two triangular tiers
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy - hgt);
          ctx.lineTo(cx + ox - w, cy + oy - hgt * 0.15);
          ctx.lineTo(cx + ox + w, cy + oy - hgt * 0.15);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy - hgt * 0.55);
          ctx.lineTo(cx + ox - w * 1.15, cy + oy + hgt * 0.28);
          ctx.lineTo(cx + ox + w * 1.15, cy + oy + hgt * 0.28);
          ctx.closePath();
          ctx.fill();
        };
        drawPine(-s * 0.34, s * 0.16, 0.95);
        drawPine(s * 0.36, s * 0.02, 1.15);
        break;
      }
      case "mountains": {
        // Triangular peaks with a small snow cap on the tallest.
        ctx.fillStyle = ICON_DARK;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy + s * 0.38);
        ctx.lineTo(cx - s * 0.12, cy - s * 0.28);
        ctx.lineTo(cx + s * 0.24, cy + s * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.04, cy + s * 0.38);
        ctx.lineTo(cx + s * 0.34, cy - s * 0.08);
        ctx.lineTo(cx + s * 0.56, cy + s * 0.38);
        ctx.closePath();
        ctx.fill();
        // snow cap
        ctx.fillStyle = ICON_LITE;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.12, cy - s * 0.28);
        ctx.lineTo(cx - s * 0.26, cy - s * 0.04);
        ctx.lineTo(cx - s * 0.02, cy - s * 0.02);
        ctx.lineTo(cx + s * 0.03, cy - s * 0.12);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "water": {
        // A couple of wavy lines.
        ctx.strokeStyle = ICON_LITE;
        ctx.lineWidth = Math.max(1, s * 0.09);
        for (let row = -1; row <= 1; row++) {
          const yy = cy + row * s * 0.32;
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, yy);
          ctx.quadraticCurveTo(cx - s * 0.25, yy - s * 0.16, cx, yy);
          ctx.quadraticCurveTo(cx + s * 0.25, yy + s * 0.16, cx + s * 0.5, yy);
          ctx.stroke();
        }
        break;
      }
      case "fertile": {
        // Crop rows / wheat strokes.
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.08);
        for (let i = -2; i <= 2; i++) {
          const xx = cx + i * s * 0.24;
          ctx.beginPath();
          ctx.moveTo(xx, cy + s * 0.4);
          ctx.lineTo(xx, cy - s * 0.32);
          ctx.stroke();
          // little wheat tick at the top
          ctx.beginPath();
          ctx.moveTo(xx, cy - s * 0.2);
          ctx.lineTo(xx - s * 0.12, cy - s * 0.34);
          ctx.moveTo(xx, cy - s * 0.2);
          ctx.lineTo(xx + s * 0.12, cy - s * 0.34);
          ctx.stroke();
        }
        break;
      }
      // === TV2 terrain motifs (canvas paths — no emoji, matching the quiet style) ===
      case "barren": {
        // A bare dry crack + a small rock — nearly empty (ex-wasteland motif).
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.42, cy - s * 0.1);
        ctx.lineTo(cx - s * 0.1, cy + s * 0.04);
        ctx.lineTo(cx + s * 0.16, cy - s * 0.14);
        ctx.lineTo(cx + s * 0.46, cy + s * 0.06);
        ctx.stroke();
        ctx.fillStyle = ICON_DARK;
        ctx.beginPath();
        ctx.arc(cx - s * 0.22, cy + s * 0.3, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "desert": {
        // Rolling dune curves.
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.08);
        for (let row = -1; row <= 1; row++) {
          const yy = cy + row * s * 0.28 + s * 0.05;
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, yy);
          ctx.quadraticCurveTo(cx - s * 0.1, yy - s * 0.22, cx + s * 0.2, yy);
          ctx.quadraticCurveTo(cx + s * 0.4, yy + s * 0.14, cx + s * 0.5, yy - s * 0.04);
          ctx.stroke();
        }
        break;
      }
      case "snow": {
        // A few snow crystals (six-armed asterisks).
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.06);
        const flake = (ox, oy, rr) => {
          for (let a = 0; a < 3; a++) {
            const ang = a * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(cx + ox - Math.cos(ang) * rr, cy + oy - Math.sin(ang) * rr);
            ctx.lineTo(cx + ox + Math.cos(ang) * rr, cy + oy + Math.sin(ang) * rr);
            ctx.stroke();
          }
        };
        flake(-s * 0.24, -s * 0.06, s * 0.2);
        flake(s * 0.26, s * 0.18, s * 0.16);
        break;
      }
      case "fish": {
        // Water waves + a small fish body.
        ctx.strokeStyle = ICON_LITE;
        ctx.lineWidth = Math.max(1, s * 0.08);
        for (let row = -1; row <= 0; row++) {
          const yy = cy + row * s * 0.34 - s * 0.14;
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.5, yy);
          ctx.quadraticCurveTo(cx - s * 0.25, yy - s * 0.14, cx, yy);
          ctx.quadraticCurveTo(cx + s * 0.25, yy + s * 0.14, cx + s * 0.5, yy);
          ctx.stroke();
        }
        // fish body (ellipse) + tail
        ctx.fillStyle = ICON_LITE;
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 0.24, s * 0.26, s * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.24, cy + s * 0.24);
        ctx.lineTo(cx + s * 0.42, cy + s * 0.1);
        ctx.lineTo(cx + s * 0.42, cy + s * 0.38);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "stone_deposit": {
        // Angular rock cluster.
        ctx.fillStyle = ICON_DARK;
        const rock = (ox, oy, rr) => {
          ctx.beginPath();
          ctx.moveTo(cx + ox - rr, cy + oy + rr * 0.6);
          ctx.lineTo(cx + ox - rr * 0.3, cy + oy - rr);
          ctx.lineTo(cx + ox + rr, cy + oy - rr * 0.2);
          ctx.lineTo(cx + ox + rr * 0.4, cy + oy + rr * 0.7);
          ctx.closePath();
          ctx.fill();
        };
        rock(-s * 0.2, s * 0.1, s * 0.28);
        rock(s * 0.28, s * 0.02, s * 0.22);
        break;
      }
      case "clay_deposit": {
        // Stacked brick lines.
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.07);
        for (let row = 0; row < 3; row++) {
          const yy = cy - s * 0.24 + row * s * 0.26;
          ctx.beginPath(); ctx.moveTo(cx - s * 0.4, yy); ctx.lineTo(cx + s * 0.4, yy); ctx.stroke();
          const off = (row % 2) ? s * 0.13 : -s * 0.13;
          ctx.beginPath(); ctx.moveTo(cx + off, yy); ctx.lineTo(cx + off, yy + s * 0.26); ctx.stroke();
        }
        break;
      }
      case "iron_deposit": {
        // Crossed pick + ore chunk.
        ctx.strokeStyle = ICON_DARK;
        ctx.lineWidth = Math.max(1, s * 0.09);
        ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy + s * 0.34); ctx.lineTo(cx + s * 0.4, cy - s * 0.34); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.42, cy - s * 0.28);
        ctx.quadraticCurveTo(cx, cy - s * 0.46, cx + s * 0.1, cy - s * 0.18);
        ctx.stroke();
        ctx.fillStyle = ICON_DARK;
        ctx.beginPath();
        ctx.arc(cx - s * 0.06, cy + s * 0.16, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "gold_deposit": {
        // Bright nugget dots.
        ctx.fillStyle = ICON_LITE;
        const nug = (ox, oy, rr) => { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, rr, 0, Math.PI * 2); ctx.fill(); };
        nug(-s * 0.2, s * 0.08, s * 0.16);
        nug(s * 0.18, s * 0.2, s * 0.13);
        nug(s * 0.08, -s * 0.18, s * 0.1);
        break;
      }
      case "coal_deposit": {
        // Dark lumps.
        ctx.fillStyle = ICON_DARK;
        const lump = (ox, oy, rr) => {
          ctx.beginPath();
          ctx.moveTo(cx + ox - rr, cy + oy);
          ctx.lineTo(cx + ox - rr * 0.2, cy + oy - rr);
          ctx.lineTo(cx + ox + rr, cy + oy - rr * 0.3);
          ctx.lineTo(cx + ox + rr * 0.5, cy + oy + rr * 0.7);
          ctx.closePath();
          ctx.fill();
        };
        lump(-s * 0.18, s * 0.16, s * 0.24);
        lump(s * 0.26, s * 0.04, s * 0.18);
        break;
      }
    }
    ctx.restore();
  }
  // === END TILE-ICONS ===

  // ---------------------------------------------------------------
  // Terrain pre-render
  // ---------------------------------------------------------------
  function renderTerrain() {
    const b = worldBounds();
    const w = Math.ceil(b.maxX - b.minX), h = Math.ceil(b.maxY - b.minY);
    if (terrainCanvas.width !== w || terrainCanvas.height !== h) {
      terrainCanvas.width = w; terrainCanvas.height = h;
    }
    terrainOrigin = { x: b.minX, y: b.minY };
    const g = terrainCtx;
    g.clearRect(0, 0, w, h);

    for (const hex of state.map.hexes.values()) {
      const p = HexMath.hexToPixel(hex.q, hex.r, SIZE);
      const cx = p.x - terrainOrigin.x, cy = p.y - terrainOrigin.y;
      const visible = isVisible(HexMath.key(hex.q, hex.r));
      const pts = hexCorners(cx, cy);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();

      if (visible) {
        g.fillStyle = CONFIG.terrain[hex.terrain].color;
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = "rgba(30,22,12,0.28)";
        g.stroke();
        // TILE-ICONS: bake a subtle terrain motif into the cached layer.
        drawTerrainIcon(g, cx, cy, SIZE, hex.terrain);
      } else {
        g.fillStyle = CONFIG.fogColor;
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = "rgba(255,255,255,0.03)";
        g.stroke();
      }
    }
    terrainDirty = false;
  }

  // ---------------------------------------------------------------
  // Coordinate transforms (world <-> screen)
  // ---------------------------------------------------------------
  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.clientWidth / 2) / state.zoom + state.cam.x,
      y: (sy - canvas.clientHeight / 2) / state.zoom + state.cam.y,
    };
  }
  function hexAtScreen(sx, sy) {
    const w = screenToWorld(sx, sy);
    return HexMath.pixelToHex(w.x, w.y, SIZE);
  }

  // ---------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------
  let hoverHex = null;
  // PV2-B: active building-placement session — { typeId } or null (NO town: the
  // owning city is resolved per-hex by Buildings.canPlaceBuilding on click).
  // Shared by the render overlay (below) and the bottom build bar (BUILD-BAR).
  let placing = null;
  // === RESEARCH CENTER (Slice C) === a second, simpler placement session for the
  // unique castle-adjacent Research Center (no typeId/owning-town resolution needed
  // — Buildings.canPlaceResearchCenter/placeResearchCenter take q,r directly).
  let placingResearchCenter = false;

  function drawRoads() {
    if (state.roads.size === 0) return;
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5a4326";
    // connect adjacent road hexes (draw each undirected edge once)
    for (const k of state.roads) {
      if (typeof k !== "string") continue;   // P2: skip a corrupt key rather than throw (a throw here freezes the whole rAF loop)
      const [q, r] = k.split(",").map(Number);
      const p = HexMath.hexToPixel(q, r, SIZE);
      for (const n of HexMath.neighbors(q, r)) {
        const nk = HexMath.key(n.q, n.r);
        if (state.roads.has(nk) && nk > k) {
          const np = HexMath.hexToPixel(n.q, n.r, SIZE);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(np.x, np.y); ctx.stroke();
        }
      }
    }
    // node dots
    ctx.fillStyle = "#6b5230";
    for (const k of state.roads) {
      if (typeof k !== "string") continue;   // P2: same guard as the edge pass above
      const [q, r] = k.split(",").map(Number);
      const p = HexMath.hexToPixel(q, r, SIZE);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawTowns() {
    for (const t of state.towns) {
      const p = HexMath.hexToPixel(t.q, t.r, SIZE);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + SIZE * 0.5, SIZE * 0.55, SIZE * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      // token
      ctx.fillStyle = "#d9b26b";
      ctx.strokeStyle = "#7a5a2c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // little house glyph
      ctx.fillStyle = "#7a5a2c";
      const s = SIZE * 0.28;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x + s, p.y);
      ctx.lineTo(p.x - s, p.y);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(p.x - s * 0.7, p.y, s * 1.4, s * 0.9);
    }
  }

  // TI-C: per-kind marker colour + glyph for a placed building.
  const BUILDING_STYLE = {
    extractor: { fill: "#4f9d5a", edge: "#2f6b39" },
    processor: { fill: "#c98a3c", edge: "#7a5218" },
    house:     { fill: "#9d6b4f", edge: "#5c3a26" },
  };

  // === CB-B: shared cargo/needs chip helpers (canvas only) ===
  // A small "colored dot + number" chip centred at (cx,cy), used for both
  // under-construction resource needs and trader cargo. Draws a dark legibility
  // pill behind the dot+number. opts: { alpha, muted } — muted greys the dot
  // (keeping the good colour as a ring) to read as "requested, not yet held".
  function cbChipRect(x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawGoodChip(cx, cy, gid, num, opts) {
    opts = opts || {};
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const muted = !!opts.muted;
    const label = String(num);
    const fontPx = Math.max(9, Math.round(SIZE * 0.19));
    const icoPx = Math.max(10, Math.round(SIZE * 0.22));   // ICONS: emoji glyph replaces the color dot
    const ico = goodIcon(gid);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    ctx.font = icoPx + "px system-ui, sans-serif";
    const iw = ctx.measureText(ico).width;
    const padX = Math.max(2, SIZE * 0.05), gap = Math.max(2, SIZE * 0.05);
    const totalW = padX * 2 + iw + gap + tw;
    const totalH = Math.max(icoPx + 3, fontPx + 3);
    const bx = cx - totalW / 2, by = cy - totalH / 2;
    // legibility pill
    ctx.fillStyle = "rgba(18,12,5,0.62)";
    cbChipRect(bx, by, totalW, totalH, totalH * 0.5); ctx.fill();
    // icon (dimmed when muted = requested/en-route, matching the old grey dot)
    if (muted) ctx.globalAlpha = alpha * 0.55;
    ctx.fillText(ico, bx + padX, cy + 0.5);
    ctx.globalAlpha = alpha;
    // number
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    ctx.fillStyle = muted ? "#b8b2a6" : "#f4ecdd";
    ctx.fillText(label, bx + padX + iw + gap, cy + 0.5);
    ctx.restore();
  }
  // Stack the top-3 owed goods for an under-construction building above its circle.
  function drawConstructionNeed(b, p, rad) {
    const need = (typeof Buildings !== "undefined" && Buildings.constructionNeed)
      ? Buildings.constructionNeed(b) : null;
    if (!need) return;
    const entries = [];
    for (const gid in need) { const q = Number(need[gid]); if (q > 0.05) entries.push([gid, q]); }
    if (!entries.length) return;
    entries.sort((a, c) => c[1] - a[1]);
    const top = entries.slice(0, 3);
    const step = Math.max(11, SIZE * 0.26);
    const baseY = p.y - rad - step * 0.6;
    for (let i = 0; i < top.length; i++) {
      drawGoodChip(p.x, baseY - i * step, top[i][0], Math.ceil(top[i][1]), { alpha: 0.96 });
    }
  }
  // === /CB-B ===

  // === RU-B: pending-upgrade chip stack (built buildings mid-upgrade) + level
  // badge for buildings above Lv1. Mirrors drawConstructionNeed's layout/guards.
  const ROMAN = { 2: "II", 3: "III", 4: "IV", 5: "V" };
  function drawUpgradeNeed(b, p, rad) {
    const need = (typeof Buildings !== "undefined" && Buildings.upgradeConstructionNeed)
      ? Buildings.upgradeConstructionNeed(b) : null;
    if (!need) return;
    const entries = [];
    for (const gid in need) { const q = Number(need[gid]); if (q > 0.05) entries.push([gid, q]); }
    if (!entries.length) return;
    entries.sort((a, c) => c[1] - a[1]);
    const top = entries.slice(0, 3);
    const step = Math.max(11, SIZE * 0.26);
    const baseY = p.y - rad - step * 0.6;
    for (let i = 0; i < top.length; i++) {
      drawGoodChip(p.x, baseY - i * step, top[i][0], Math.ceil(top[i][1]), { alpha: 0.96, muted: true });
    }
  }
  function drawUpgradeBadge(b, p, rad) {
    const lvl = b && (b.upgradeLevel || 1);
    if (!lvl || lvl < 2) return;
    const label = ROMAN[lvl] || ("L" + lvl);
    const fontPx = Math.max(8, Math.round(SIZE * 0.2));
    ctx.save();
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    const bx = p.x + rad * 0.62, by = p.y + rad * 0.62;
    const tw = ctx.measureText(label).width;
    const r = Math.max(fontPx * 0.55, (tw + 5) / 2);
    ctx.fillStyle = "rgba(18,12,5,0.75)";
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffce4d"; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffce4d";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, bx, by + 0.5);
    ctx.restore();
  }
  // === /RU-B ===

  // Draw every town's placed buildings as a small labelled token on its hex.
  function drawBuildings() {
    for (const t of state.towns) {
      if (!Array.isArray(t.buildings)) continue;
      for (const b of t.buildings) {
        const def = CONFIG.buildings[b.typeId];
        if (!def) continue;
        const p = HexMath.hexToPixel(b.q, b.r, SIZE);
        const st = BUILDING_STYLE[def.kind] || BUILDING_STYLE.processor;
        const rad = SIZE * 0.3;
        // === CB-B: under-construction look (unfinished until b.built !== false) ===
        const underConstruction = b && b.built === false;
        if (underConstruction) {
          const priority = !!b.priority;
          // muted, desaturated fill
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = st.fill;
          ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          // dashed scaffold outline (gold + brighter when prioritized)
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = priority ? 2.5 : 2;
          ctx.strokeStyle = priority ? "#ffce4d" : st.edge;
          ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
          if (priority) {   // extra "next up" ring
            ctx.setLineDash([2, 3]);
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = "rgba(255,206,77,0.85)";
            ctx.beginPath(); ctx.arc(p.x, p.y, rad + Math.max(2, SIZE * 0.09), 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
          // scaffold / construction glyph + priority star badge
          ctx.fillStyle = "#3a2c12";
          ctx.font = Math.round(SIZE * 0.32) + "px system-ui, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("🏗", p.x, p.y + 0.5);
          if (priority) {
            ctx.font = Math.round(SIZE * 0.24) + "px system-ui, sans-serif";
            ctx.fillText("⭐", p.x + rad * 0.85, p.y - rad * 0.85);
          }
          // missing-resource chips (hide when far out, mirroring drawCarts' zoomedOut)
          if (!(state.zoom < 0.6)) drawConstructionNeed(b, p, rad);
          continue;
        }
        // === /CB-B ===
        ctx.fillStyle = st.fill;
        ctx.strokeStyle = st.edge;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // one-letter glyph (building name initial)
        ctx.fillStyle = "#201607";
        ctx.font = "bold " + Math.round(SIZE * 0.34) + "px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText((def.name || "?").charAt(0).toUpperCase(), p.x, p.y + 0.5);
        // === RU-B: level badge + pending-upgrade material chips (built only) ===
        if (!(state.zoom < 0.6)) {
          drawUpgradeBadge(b, p, rad);
          if (b.pendingUpgrade) drawUpgradeNeed(b, p, rad);
        }
        // === /RU-B ===
      }
    }
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  // === BUILD-BAR === (PV2-B) while placing a building type, tint every hex that
  // BORDERS ANY city footprint (union over all towns) green (valid) / red
  // (invalid) via the adjacency model Buildings.canPlaceBuilding, and outline the
  // hover hex. The owning city is resolved per-hex by the model — no selected town.
  // === RESEARCH CENTER (Slice C) === valid/invalid tint over the castle's 6
  // neighbour hexes while placing the Center, mirroring drawPlacementOverlay's
  // footprint-ring look (green=ok/red=blocked) + a brighter hover outline.
  function drawResearchCenterPlacementOverlay() {
    const castle = Buildings.castleHex();
    for (const n of HexMath.neighbors(castle.q, castle.r)) {
      const k = HexMath.key(n.q, n.r);
      if (!state.map.hexes.has(k) || !isVisible(k)) continue;
      const res = Buildings.canPlaceResearchCenter(state, n.q, n.r);
      const p = HexMath.hexToPixel(n.q, n.r, SIZE);
      const pts = hexCorners(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = res.ok ? "rgba(80,200,110,0.30)" : "rgba(224,80,60,0.14)";
      ctx.fill();
      ctx.lineWidth = res.ok ? 2 : 1;
      ctx.strokeStyle = res.ok ? "#6fbf73" : "rgba(224,80,60,0.45)";
      ctx.stroke();
    }
    if (hoverHex) {
      const hk = HexMath.key(hoverHex.q, hoverHex.r);
      if (state.map.hexes.has(hk) && isVisible(hk)) {
        const p = HexMath.hexToPixel(hoverHex.q, hoverHex.r, SIZE);
        const pts = hexCorners(p.x, p.y);
        const res = Buildings.canPlaceResearchCenter(state, hoverHex.q, hoverHex.r);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = res.ok ? "#8fe89a" : "#e0503c";
        ctx.stroke();
      }
    }
  }
  // === /RESEARCH CENTER (Slice C) ===

  function drawPlacementOverlay() {
    if (placingResearchCenter) { drawResearchCenterPlacementOverlay(); return; }
    if (!placing) return;
    // Footprint key set (skip occupied hexes) + candidate ring = footprint neighbours.
    const footSet = new Set();
    for (const t of state.towns) for (const fk of Buildings.footprint(t)) footSet.add(fk);
    const seen = new Set();
    const candidates = [];
    for (const t of state.towns) {
      for (const fk of Buildings.footprint(t)) {
        const [fq, fr] = fk.split(",").map(Number);
        for (const n of HexMath.neighbors(fq, fr)) {
          const nk = HexMath.key(n.q, n.r);
          if (seen.has(nk) || footSet.has(nk)) continue;   // don't tint occupied footprint hexes
          seen.add(nk);
          candidates.push({ q: n.q, r: n.r, k: nk });
        }
      }
    }
    for (const c of candidates) {
      if (!state.map.hexes.has(c.k) || !isVisible(c.k)) continue;
      const res = Buildings.canPlaceBuilding(state, placing.typeId, c.q, c.r);
      const p = HexMath.hexToPixel(c.q, c.r, SIZE);
      const pts = hexCorners(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = res.ok ? "rgba(80,200,110,0.30)" : "rgba(224,80,60,0.14)";
      ctx.fill();
      ctx.lineWidth = res.ok ? 2 : 1;
      ctx.strokeStyle = res.ok ? "#6fbf73" : "rgba(224,80,60,0.45)";
      ctx.stroke();
    }
    if (hoverHex) {
      const p = HexMath.hexToPixel(hoverHex.q, hoverHex.r, SIZE);
      const pts = hexCorners(p.x, p.y);
      const res = Buildings.canPlaceBuilding(state, placing.typeId, hoverHex.q, hoverHex.r);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = res.ok ? "#8fe89a" : "#e0503c";
      ctx.stroke();
    }
  }

  function drawCastle() {
    const p = HexMath.hexToPixel(0, 0, SIZE);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y + SIZE * 0.55, SIZE * 0.7, SIZE * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c98a3c";
    ctx.strokeStyle = "#5a3d16"; ctx.lineWidth = 2.5;
    const w = SIZE * 0.9, hh = SIZE * 0.7;
    ctx.beginPath(); ctx.rect(p.x - w / 2, p.y - hh / 2, w, hh); ctx.fill(); ctx.stroke();
    // crenellations
    ctx.fillStyle = "#c98a3c";
    const cw = w / 5;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(p.x - w / 2 + i * 2 * cw, p.y - hh / 2 - cw, cw, cw);
    }
    // flag
    ctx.strokeStyle = "#5a3d16"; ctx.beginPath();
    ctx.moveTo(p.x, p.y - hh / 2 - cw); ctx.lineTo(p.x, p.y - hh / 2 - cw - SIZE * 0.5); ctx.stroke();
    ctx.fillStyle = "#e0553f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - hh / 2 - cw - SIZE * 0.5);
    ctx.lineTo(p.x + SIZE * 0.35, p.y - hh / 2 - cw - SIZE * 0.38);
    ctx.lineTo(p.x, p.y - hh / 2 - cw - SIZE * 0.26);
    ctx.closePath(); ctx.fill();
  }

  // === RESEARCH CENTER (Slice C) === map render of state.researchCenter, next to
  // the castle. Mirrors drawBuildings' under-construction scaffold + missing-
  // material chips (unbuilt) and the RU-B level badge + pending-upgrade chips
  // (built), reusing drawGoodChip/drawConstructionNeed's conventions.
  function drawResearchCenter() {
    const c = state.researchCenter;
    if (!c) return;
    const p = HexMath.hexToPixel(c.q, c.r, SIZE);
    const rad = SIZE * 0.3;
    const fill = "#5a7c9c", edge = "#2e4a63";
    if (!c.built) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#3a2c12";
      ctx.font = Math.round(SIZE * 0.32) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🏗", p.x, p.y + 0.5);
      if (!(state.zoom < 0.6)) {
        const need = (typeof Research !== "undefined" && Research.centerConstructionNeed) ? Research.centerConstructionNeed(state) : {};
        const entries = [];
        for (const gid in need) { const q = Number(need[gid]); if (q > 0.05) entries.push([gid, q]); }
        entries.sort((a, b) => b[1] - a[1]);
        const top = entries.slice(0, 3);
        const step = Math.max(11, SIZE * 0.26);
        const baseY = p.y - rad - step * 0.6;
        for (let i = 0; i < top.length; i++) drawGoodChip(p.x, baseY - i * step, top[i][0], Math.ceil(top[i][1]), { alpha: 0.96 });
      }
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      return;
    }
    ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f4ecdd";
    ctx.font = Math.round(SIZE * 0.34) + "px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("📖", p.x, p.y + 0.5);
    // level badge — same look/position as drawUpgradeBadge (built below drawBuildings).
    const lvl = c.level || 1;
    const label = ROMAN[lvl] || ("L" + lvl);
    const fontPx = Math.max(8, Math.round(SIZE * 0.2));
    ctx.save();
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    const bx = p.x + rad * 0.62, by = p.y + rad * 0.62;
    const tw = ctx.measureText(label).width;
    const r = Math.max(fontPx * 0.55, (tw + 5) / 2);
    ctx.fillStyle = "rgba(18,12,5,0.75)";
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffce4d"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#ffce4d";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, bx, by + 0.5);
    ctx.restore();
    // pending-upgrade indicator + material chips (built, mid-upgrade only).
    if (c.pendingUpgrade && !(state.zoom < 0.6)) {
      ctx.font = Math.round(SIZE * 0.24) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffce4d";
      ctx.fillText("⬆", p.x - rad * 0.85, p.y - rad * 0.85);
      const need = (typeof Research !== "undefined" && Research.centerUpgradeNeed) ? Research.centerUpgradeNeed(state) : {};
      const entries = [];
      for (const gid in need) { const q = Number(need[gid]); if (q > 0.05) entries.push([gid, q]); }
      entries.sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 3);
      const step = Math.max(11, SIZE * 0.26);
      const baseY = p.y - rad - step * 0.6;
      for (let i = 0; i < top.length; i++) drawGoodChip(p.x, baseY - i * step, top[i][0], Math.ceil(top[i][1]), { alpha: 0.96, muted: true });
    }
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  // === /RESEARCH CENTER (Slice C) ===

  function drawHoverGhost() {
    if (!hoverHex || state.mode === "pan") return;
    const k = HexMath.key(hoverHex.q, hoverHex.r);
    const hex = state.map.hexes.get(k);
    if (!hex || !isVisible(k)) return;
    const p = HexMath.hexToPixel(hoverHex.q, hoverHex.r, SIZE);
    const pts = hexCorners(p.x, p.y);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    const ok = canPlace(hoverHex.q, hoverHex.r);
    ctx.fillStyle = ok ? "rgba(230,200,120,0.35)" : "rgba(224,80,60,0.30)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ok ? "#f0d590" : "#e0503c";
    ctx.stroke();
  }
