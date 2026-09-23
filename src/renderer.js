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

  // === TERRAIN ART === hex-tile sprites for the three main terrains (grass/water/
  // mountain), supplied as inline PNG data URIs so the game stays a single file. Each
  // decodes asynchronously; when it lands we flag the baked terrain layer dirty so it
  // re-renders with the art. Until a sprite is ready, that terrain falls back to its
  // flat CONFIG.terrain colour, so nothing ever renders blank.
  const TERRAIN_SPRITE_SRC = {
    water: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACK0lEQVRYhcVXu27bQBCcI1mKuBRXB1LrP0jj/IBb9+lcBQiQ0gWtQkCaAAZcuUvv1j9gN/kDtdIHXEOQrXJpMsxyyRMfguUBBIi6483c7N7tCjgBj+E1bMI2nLKGmUvs4eDgsSuXAIDc1rg1F5PXm/TCJmyDJCVyW8PBAwA83CQhoyaS2MN1xqpy0RLC57GODE54DK9hVy5biw9BOnJjLo9yRAflrscSx8RU5QI/Pnzs5er8SGIAnVjHCPqgRdMV7UjzsAnbUJULrOy+2fXK7jtCNCHFasTyRTtiSD7FbgrT4obmaPG35sIY7vy9kDj4ltpzIrc1smPxfms4eCRMjF25xK5cntUND4dEXzDncoC8mYOHs/7oUdM4JWllqFs5IEn12e4rPnOErOy+tZaDR0ZySToUhrkO6HU9HDLGosJ57wLyvts9QOezU6tdH4aSmAJaOTBXRB9ZrEDJHGDRa3Jg7k1I4WMKlAR7yt57YA6mvN8cRyvK8VtUxFg/QcdvzKVJAOB5XaQc1Mht3XymQtYXvu/gkdsav9YPKSA6ok931wkAfCm+HmQ3IxNKdzljXBvqlDN++X339Off1xQAPn/7eWCVJDr3hW0/9gly8ID977JGtCuWjsTach1jGSYebxKLDY4TIIVcFeuDtHHIes55uf+exoiJ7Ngg0ChPAeCqWB8cPCosOpVNZjcTbIh8lAC1UCNEEjNRn++L9GUkMTHr3zHzg45M2bHGX+HJaHN1yWv2AAAAAElFTkSuQmCC",
    fertile: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACWElEQVRYha1XPWvbUBQ9soLAk1EmS1Pmru5S/A/yMZRi8BRQHejfyN9omw/IVCghQ5r+A9HFXjtnsjTZeBIYFHUwV716evdJT/aZ5Pd1js679+oa2AOz+bQ4e74s9jnD6UqcJh4+jfqIlxsAQJp4eLl4sD7PasPZ82UxDLYYhwPEyw3G4aCc6yqk1UIiBlAh1cFWSOOC2XxatCGWhNy+/2HkECe53RKizMfV+rVccxr4+J2sK2seFxmGwVYUUhuU7NYd3gYUK5KQ8kfbe46XG9z4J7jvV8VETz7uP+7GosyvzUtCHAC4W34p1KjeB/ws1Tku5OXiwXGa7lr3NqZxW6E9Hflp4JfPV+tX7WZ1nKLehjxNPPTSxKtt5papgagbB4Ab/6TyO3r6vzbK/Nr4OBxgGGzhzObT4lB3L0EXX6IDOrW24E4B+qwiB2oxwO+W0oqrboM29UJ0wHQd6j2rUB3jbhLInb1jQCpI6hrpbHLAWAcOkesmiHWAINWAQ5FXYoDuy5TrEvgefpaOlOY6x0DXr6JOjFgJTbAlV2sCQawDHKqVbdJMhSS4zAJg1wtQh6s2mk29QdcUHocDfA6/Oj0AWC0ylxTRAqA5CHXzTUFIPN+/rVyAdUQfric9AHh37ua85z/Eh8rUKR/Rw5/rn2+7p4kLZIiDbZ4mHhBWD1MbUYIuOzjxapG5QFYTJ3bF3BHAri3nbdeOmL9gFUe6weqGiXs86ucxmuOCiNPEQ4wNVovclYgJrf4ZkRvHo36u65zVjvfvr9z41tYCmoR0Ie4kQBLShZjwD5XVsvT4JWY+AAAAAElFTkSuQmCC",
    mountains: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADaElEQVRYhbWXP2hTURTGf2lC0yF5DtYhlyCIwqvQLUJwq0s3J+tgKVky6yRBOnUS6aib0CVoF50dXMxWMnR7Qx6IOLQvIF18L4NVahzied57c1/+Fc9S3u295/vOd8859wQuYZ9ebA0PdzaHl/GRWxS4H8Rs7K8RtiMA+kHM9puPc/ub68Dhzuawsu6h6p6xXvZLCxOZaaMNHHVj/IYCIAkHxt6oG89FZOqGTy+2hkAKXvZLAITtCFX3iLox/WAEWmtW0z2iyL1n7ydiZP4zS26JUAff2F8jCQccH5wYRACOD06orHuZRMYWBRhIZdajlb8wkln2qrpH2S+NEdEVchFJP7KA9WhtyXUTtYSERC9qSN50Wj2DSAEgip4MJUobWMwlOYzuu9PqGWR0EpIPqu6RhAMq6x5+Q3EYbA6333zM5Q93Nofn/Z9Ghqu6R7laTL+T03PK1SLJ6TmDb+dcvb5C2S9RXF0mCQf4jxTB21P4BcWVHMXVZYqry1y9vsLR/hfuPL1BcXWZrx/OUHWPrx/O8O9f48Htm3sFkU7u1ZZf/5Y7j7oxin8VMc1sX+pvYP0gpiD3mQUs8kp+2CZy15rVNPmEXNkvpeu1ZjX1nfpvQ6qAfu/6vUoSSTmJzatC2S+hLFVSBVTdMxpNp9Uzmsoszu2OOMkkzwCWJKqoGxvgImHYjgzp9MqIurGR7bVmlX4QG+su0ytqyVXTOrCqe/SDmFqzaiTrrCbEOq2eoabfUFTWvVEOyEKn1UufWL0s/4cZOQDgz5hMYkbfYPZktM8XpDPZ9+zq93ryuJTRyw7Gy1EUTsKB1QfapJXgSp5F7t5lOrj0gSXXkzvJLkMkCQejfvC37xg5YJeXXIv+ts9Kwj6jl6ooYPQBv6EMp8JQ2vE8EQqQ+HONbHofyMFoFrDLT98sTvVEtc2loJjLr99QKPUyVwB4detKvtKOLqQtC7B+KAkHTkWyIrQfHpEeRpW1+zqXB20iurv3cAng+crwQjrfNAWyklfOHR+cTP3tMDYT2kQ29tecMgqQa3wD8/XsBzGvbl3JAxztvfs9kYCLiDjWFdFJgHue6LR6mcBTCehEHn/+fqFPTi7pJWJ98Nz9kctnAc9MQEgACBH4l1gwPvHu/shNjHpuAtOILAK8EIEsIosAi/0BTGeDemWObnoAAAAASUVORK5CYII=",
  };
  const TERRAIN_SPRITES = {};   // terrainKey -> decoded HTMLImageElement (set on load)
  (function loadTerrainSprites() {
    if (typeof Image === "undefined") return;   // headless/no-DOM: skip (renderer isn't exercised there)
    for (const key in TERRAIN_SPRITE_SRC) {
      const img = new Image();
      img.onload = (function (k) { return function () { TERRAIN_SPRITES[k] = img; terrainDirty = true; }; })(key);
      img.src = TERRAIN_SPRITE_SRC[key];
    }
  })();
  // Also dress the water RESOURCE tile (fish) as water — it keeps its own icon on top.
  const SPRITE_ALIAS = { fish: "water" };
  function terrainSprite(terr) { return TERRAIN_SPRITES[terr] || TERRAIN_SPRITES[SPRITE_ALIAS[terr]] || null; }

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

  // v0.51 (N): reveal the ring around each building/city ONCE it finishes construction
  // (not when placed). Idempotent via a per-object _fogSeen flag; called each frame.
  function revealConstructed() {
    const R = (CONFIG.fog && CONFIG.fog.buildReveal) || 1;
    for (const t of (state.towns || [])) {
      if (!t) continue;
      if (t.built !== false && !t._fogSeen) { reveal(t.q, t.r, R); t._fogSeen = true; }
      for (const b of (Array.isArray(t.buildings) ? t.buildings : [])) {
        if (b && b.built !== false && !b._fogSeen) { reveal(b.q, b.r, R); b._fogSeen = true; }
      }
    }
  }

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
        // Flat colour first (guarantees no sub-pixel seam between neighbours), then the
        // hex-tile sprite clipped to the hex where one exists.
        g.fillStyle = CONFIG.terrain[hex.terrain].color;
        g.fill();
        const spr = terrainSprite(hex.terrain);
        if (spr) {
          g.save();
          g.clip();   // clip to the hex path built above
          const bw = SIZE * Math.sqrt(3) + 1.5, bh = SIZE * 2 + 1.5;   // cover the hex bbox (+bleed to kill hairlines)
          g.drawImage(spr, cx - bw / 2, cy - bh / 2, bw, bh);
          g.restore();
        }
        g.lineWidth = 1;
        g.strokeStyle = "rgba(30,22,12,0.28)";
        g.stroke();
        // TILE-ICONS: bake a subtle terrain motif into the cached layer. Sprited terrains
        // carry their own texture, so skip the motif — except a resource tile (e.g. fish)
        // that needs its resource icon read on top of the water art.
        if (!spr || CONFIG.terrain[hex.terrain].deposit) drawTerrainIcon(g, cx, cy, SIZE, hex.terrain);
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

  // === v0.51: RESOURCE-FLOW OVERLAY ==========================================
  // Active while a good is selected in the top-left resource panel (state._flowGood).
  // Shows, for that good: which producer patches make it, each city's sell(+)/buy(−)
  // trend (with warehouse stock + price), and arrows for who is shipping it to whom.
  function flowGoodTerrains(gid) {
    const set = new Set();
    for (const id in CONFIG.buildings) {
      const def = CONFIG.buildings[id];
      if (def && def.output && def.output.goodId === gid) {
        if (def.terrain) set.add(def.terrain);
        if (def.adjacent) set.add(def.adjacent);
      }
    }
    return set;
  }
  function flowNodeHex(id) {
    if (id === 1e9 || (typeof ResearchEconomy !== "undefined" && ResearchEconomy.CASTLE_ID != null && id === ResearchEconomy.CASTLE_ID))
      return (typeof Buildings !== "undefined" && Buildings.castleHex) ? Buildings.castleHex() : { q: 0, r: 0 };
    for (const t of (state.towns || [])) if (t.id === id) return { q: t.q, r: t.r };
    return null;
  }
  function drawFlowOverlay() {
    const gid = state && state._flowGood;
    if (!gid || typeof Trade === "undefined" || !Trade.cityGood) return;
    // 1) tint producing terrain patches (subtle) + ring the actual producer buildings.
    const terrains = flowGoodTerrains(gid);
    if (terrains.size) {
      for (const [k, hex] of state.map.hexes) {
        if (!isVisible(k) || !terrains.has(hex.terrain)) continue;
        const p = HexMath.hexToPixel(hex.q, hex.r, SIZE);
        const pts = hexCorners(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = "rgba(120,200,90,0.16)"; ctx.fill();
      }
    }
    for (const t of (state.towns || [])) {
      for (const b of (Array.isArray(t.buildings) ? t.buildings : [])) {
        const def = b && CONFIG.buildings[b.typeId];
        if (!def || !def.output || def.output.goodId !== gid || b.built === false) continue;
        const p = HexMath.hexToPixel(b.q, b.r, SIZE);
        ctx.strokeStyle = "#7fe07a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 2) flow arrows: the INTENDED supply plan (seller → buyer), so the whole network
    // shows even when no cart is mid-trip. Dashes MARCH toward the buyer to make the
    // direction obvious, a solid arrowhead sits near the buyer, and a resource chip
    // with the rate (units/min) rides the midpoint.
    const plan = (Trade.goodPlan ? Trade.goodPlan(state, gid) : []);
    const march = (Date.now() / 45) % (SIZE * 0.6);   // animated dash offset (render-only)
    for (const f of plan) {
      const a = flowNodeHex(f.fromId), b = flowNodeHex(f.toId);
      if (!a || !b) continue;
      const pa = HexMath.hexToPixel(a.q, a.r, SIZE), pb = HexMath.hexToPixel(b.q, b.r, SIZE);
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      // start/end pulled in to the token edges so the arrow sits between the cities.
      const sx = pa.x + Math.cos(ang) * SIZE * 0.55, sy = pa.y + Math.sin(ang) * SIZE * 0.55;
      const ex = pb.x - Math.cos(ang) * SIZE * 0.55, ey = pb.y - Math.sin(ang) * SIZE * 0.55;
      ctx.strokeStyle = "rgba(255,214,120,0.95)"; ctx.lineWidth = Math.max(2.5, SIZE * 0.1);
      ctx.lineCap = "round";
      ctx.setLineDash([SIZE * 0.34, SIZE * 0.26]); ctx.lineDashOffset = -march;   // negative → marches seller→buyer
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = "butt";
      // bold arrowhead at the buyer end
      const hl = SIZE * 0.42;
      ctx.fillStyle = "rgba(255,214,120,1)";
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.42) * hl, ey - Math.sin(ang - 0.42) * hl);
      ctx.lineTo(ex - Math.cos(ang + 0.42) * hl, ey - Math.sin(ang + 0.42) * hl);
      ctx.closePath(); ctx.fill();
      // resource chip + per-minute rate at the midpoint
      if (typeof drawGoodChip === "function") {
        const rate = Math.max(1, Math.round(f.rate));
        drawGoodChip((sx + ex) / 2, (sy + ey) / 2, gid, rate + "/m");
      }
    }
    // 3) per-city trend badge: arrow + net/min, warehouse stock, willing price.
    for (const t of (state.towns || [])) {
      if (t.built === false) continue;
      const cg = Trade.cityGood(state, t, gid);
      if (!cg) continue;
      const p = HexMath.hexToPixel(t.q, t.r, SIZE);
      const sells = cg.role === "seller", buys = cg.role === "buyer";
      const arrow = sells ? "▲" : (buys ? "▼" : "■");
      const col = sells ? "#6fc24b" : (buys ? (cg.latent ? "#e0a63c" : "#e0563f") : "#b8b2a6");
      const net = Math.round(Math.abs(cg.net) || 0);
      const left = arrow + (net > 0 ? " " + net + "/m" : "");
      const right = "  🏬" + Math.round(cg.stock) + "  🪙" + (cg.price ? cg.price.toFixed(1) : "0");
      const fontPx = Math.max(9, Math.round(SIZE * 0.2));
      ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const lw = ctx.measureText(left).width, rw = ctx.measureText(right).width;
      const w = lw + rw + 12, h = fontPx + 8;
      const bx = p.x - w / 2, by = p.y - SIZE * 1.15 - h;
      ctx.fillStyle = "rgba(18,12,5,0.82)"; cbChipRect(bx, by, w, h, h * 0.4); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; cbChipRect(bx, by, w, h, h * 0.4); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(left, bx + 6, by + h / 2);
      ctx.fillStyle = "#f4ecdd"; ctx.fillText(right, bx + 6 + lw, by + h / 2);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
  }
  // === /RESOURCE-FLOW OVERLAY =================================================

  function drawTowns() {
    const buildTicks = Math.max(1, Math.round(((CONFIG.town && CONFIG.town.buildSec) || 10) * (1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500))));
    for (const t of state.towns) {
      const p = HexMath.hexToPixel(t.q, t.r, SIZE);
      const building = t.built === false;   // v0.51: under construction
      ctx.save();
      if (building) ctx.globalAlpha = 0.5;   // dim a city that isn't built yet
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
      ctx.restore();
      // construction progress ring (v0.51): a scaffolding arc + % while building
      if (building) {
        const prog = Math.max(0, Math.min(1, (t._buildT || 0) / buildTicks));
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = Math.max(3, SIZE * 0.12);
        ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#7fc24b";
        ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.62, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#f4ecdd";
        ctx.font = "bold " + Math.round(SIZE * 0.28) + "px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🚧", p.x, p.y - SIZE * 0.9);
        ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      }
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
    const label = opts.hideNum ? "" : String(num);   // v0.51 (F/G): icon-only chip (e.g. a hauler on its way to pick up)
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
  // v0.51 (G): a small gold-coin chip (🪙 + amount) — drawn on a BUYER trader heading
  // out, so it visibly carries the money it will spend (alongside the muted target good).
  function drawCoinChip(cx, cy, amount) {
    const label = String(Math.round(amount || 0));
    const fontPx = Math.max(9, Math.round(SIZE * 0.19));
    const icoPx = Math.max(10, Math.round(SIZE * 0.22));
    ctx.save();
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    ctx.font = icoPx + "px system-ui, sans-serif";
    const iw = ctx.measureText("🪙").width;
    const padX = Math.max(2, SIZE * 0.05), gap = Math.max(2, SIZE * 0.05);
    const totalW = padX * 2 + iw + gap + tw, totalH = Math.max(icoPx + 3, fontPx + 3);
    const bx = cx - totalW / 2, by = cy - totalH / 2;
    ctx.fillStyle = "rgba(40,30,5,0.72)";
    cbChipRect(bx, by, totalW, totalH, totalH * 0.5); ctx.fill();
    ctx.fillText("🪙", bx + padX, cy + 0.5);
    ctx.font = "bold " + fontPx + "px system-ui, sans-serif";
    ctx.fillStyle = "#ffe08a";
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
    // v0.48: the building whose detail panel is open — highlighted below so the
    // player can tell which one is selected.
    const sel = (typeof window !== "undefined" && window.TownUI && window.TownUI.selectedBuilding) || null;
    for (const t of state.towns) {
      if (!Array.isArray(t.buildings)) continue;
      for (const b of t.buildings) {
        const def = CONFIG.buildings[b.typeId];
        if (!def) continue;
        const p = HexMath.hexToPixel(b.q, b.r, SIZE);
        const isSelected = !!(sel && sel.q === b.q && sel.r === b.r);
        if (isSelected) {   // selection ring under the token (hex outline + soft glow)
          const gp = hexCorners(p.x, p.y);
          ctx.save();
          ctx.beginPath(); ctx.moveTo(gp[0][0], gp[0][1]);
          for (let i = 1; i < 6; i++) ctx.lineTo(gp[i][0], gp[i][1]);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,243,208,0.16)";
          ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = "#fff3d0";
          ctx.shadowColor = "rgba(255,243,208,0.9)"; ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.restore();
        }
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
          // v0.49: build progress bar (effective % = min(time, delivered) — see Buildings.constructionProgress)
          if (!(state.zoom < 0.6) && typeof Buildings !== "undefined" && Buildings.constructionProgress) {
            const cp = Buildings.constructionProgress(b);
            const bw = rad * 1.8, bh = Math.max(3, SIZE * 0.12);
            const bx = p.x - bw / 2, by = p.y + rad + Math.max(2, SIZE * 0.16);
            ctx.fillStyle = "rgba(18,14,9,0.82)"; ctx.fillRect(bx, by, bw, bh);
            // delivered cap shown faintly behind the filled (time) progress
            ctx.fillStyle = "rgba(224,166,60,0.35)"; ctx.fillRect(bx, by, bw * cp.deliveredFrac, bh);
            ctx.fillStyle = "#ffce4d"; ctx.fillRect(bx, by, bw * cp.frac, bh);
            ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
          }
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
          // v0.47: production/consumption progress bar under producers — fills as the
          // building nears its next whole-unit batch (green = producing, amber =
          // waiting on inputs). Houses/non-producers return null and get no bar.
          if (typeof Sim !== "undefined" && Sim.buildingProgress) {
            const pr = Sim.buildingProgress(state, t, b);
            if (pr) {
              const bw = rad * 1.7, bh = Math.max(2.5, SIZE * 0.1);
              const bx = p.x - bw / 2, by = p.y + rad + Math.max(2, SIZE * 0.14);
              ctx.fillStyle = "rgba(18,14,9,0.78)";
              ctx.fillRect(bx, by, bw, bh);
              ctx.fillStyle = !pr.working ? "#8a8574" : (pr.starved ? "#e0a63c" : "#7fc24b");
              ctx.fillRect(bx, by, bw * pr.prog, bh);
              ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1;
              ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
            }
          }
          // v0.51 §2: internal-STORE fill bar (what porters collect) — sits just below
          // the production bar. Teal = goods waiting for a porter; amber = store FULL
          // (the building has stalled until a porter frees room).
          if (def.output && b.store && b.built !== false) {
            const scap = (def.storeCap) || (CONFIG.econ && CONFIG.econ.buildingStoreCap) || 30;
            const sfill = Math.max(0, Math.min(1, ((b.store[def.output.goodId] || 0) / scap)));
            if (sfill > 0.001) {
              const bw = rad * 1.7, bh = Math.max(2, SIZE * 0.07);
              const bx = p.x - bw / 2;
              const by = p.y + rad + Math.max(2, SIZE * 0.14) + Math.max(2.5, SIZE * 0.1) + 1.5;
              ctx.fillStyle = "rgba(18,14,9,0.7)"; ctx.fillRect(bx, by, bw, bh);
              ctx.fillStyle = sfill >= 0.999 ? "#e0a63c" : "#3fa0a6";
              ctx.fillRect(bx, by, bw * sfill, bh);
            }
          }
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
  // === RESEARCH CENTER (Slice C) === valid/invalid tint over the hexes that would
  // join the castle compound while placing the Center, mirroring drawPlacementOverlay's
  // footprint-ring look (green=ok/red=blocked) + a brighter hover outline.
  function drawResearchCenterPlacementOverlay() {
    // v0.51: candidates = every free hex touching the castle compound (the castle or a
    // castle building that chains back to it), not just the castle's 6 neighbours.
    for (const n of Buildings.castleCompoundFrontier(state)) {
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

  // === ADVANCED PROVISIONER (v0.46) === map token + placement highlight.
  function drawAdvancedProvisioner() {
    // placement highlight: tint every hex that would join the castle compound.
    if (state.mode === "advProvisioner") {
      for (const n of Buildings.castleCompoundFrontier(state)) {   // v0.51: whole compound frontier (chains allowed)
        const k = HexMath.key(n.q, n.r);
        if (!state.map.hexes.has(k) || !isVisible(k)) continue;
        const ok = Buildings.canPlaceAdvancedProvisioner(state, n.q, n.r).ok;
        const p = HexMath.hexToPixel(n.q, n.r, SIZE);
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = ok ? "#6fbf73" : "#e0503c";
        ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // v0.51 §9: basic Provisioner placement highlight (castle compound frontier).
    if (state.mode === "provisioner") {
      for (const n of Buildings.castleCompoundFrontier(state)) {   // v0.51: whole compound frontier (chains allowed)
        const k = HexMath.key(n.q, n.r);
        if (!state.map.hexes.has(k) || !isVisible(k)) continue;
        const ok = Buildings.canPlaceProvisioner(state, n.q, n.r).ok;
        const p = HexMath.hexToPixel(n.q, n.r, SIZE);
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = ok ? "#6fbf73" : "#e0503c";
        ctx.beginPath(); ctx.arc(p.x, p.y, SIZE * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    const provToken = (c, body, edge) => {
      if (!c || typeof c.q !== "number") return;
      const p = HexMath.hexToPixel(c.q, c.r, SIZE);
      const rad = SIZE * 0.3;
      ctx.fillStyle = body; ctx.strokeStyle = edge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f4ecdd";
      ctx.font = Math.round(SIZE * 0.34) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🍲", p.x, p.y + 0.5);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    };
    provToken(state.provisionerBuilding, "#8a9a4b", "#4f5a26");   // basic — sage green so it reads apart from the advanced token
    provToken(state.advancedProvisioner, "#b5713a", "#6e3f1b");   // advanced — warm brown (unchanged)
  }

  function drawHoverGhost() {
    if (!hoverHex) return;
    const k = HexMath.key(hoverHex.q, hoverHex.r);
    const hex = state.map.hexes.get(k);
    if (!hex || !isVisible(k)) return;
    // building / research-center placement draws its own valid/invalid ghost in
    // drawPlacementOverlay — don't double-draw here.
    if (placing || placingResearchCenter) return;
    const p = HexMath.hexToPixel(hoverHex.q, hoverHex.r, SIZE);
    const pts = hexCorners(p.x, p.y);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (state.mode === "pan") {   // v0.47: ALWAYS highlight the tile under the cursor (neutral) when no tool is active
      ctx.fillStyle = "rgba(255,245,215,0.10)";
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,243,208,0.55)";
      ctx.fill();
      ctx.stroke();
      return;
    }
    const ok = canPlace(hoverHex.q, hoverHex.r);   // map tool (town / road / erase)
    ctx.fillStyle = ok ? "rgba(230,200,120,0.35)" : "rgba(224,80,60,0.30)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ok ? "#f0d590" : "#e0503c";
    ctx.stroke();
  }

  // === C: TILE HOVER TOOLTIP ==============================================
  // Drives the #tileTip DOM element UIDev owns in index.html (id agreed via
  // SendMessage: fixed-position, starts with class "hidden", pointer-events:
  // none, positioned in page coords via style.left/top). This module only
  // computes content + toggles it; the element/CSS are UIDev's.
  //
  // Terrain display names — CONFIG.terrain (config.js) has no `label` field,
  // only inline comments naming each biome; mirrored here for the tooltip.
  const TERRAIN_NAME = {
    barren: "Barren Land", desert: "Desert", fertile: "Fertile Soil",
    snow: "Iceland", water: "Water", mountains: "Mountains",
    fish: "Fish Shoal", forest: "Forest", stone_deposit: "Stone Deposit",
    clay_deposit: "Clay Deposit", iron_deposit: "Iron Deposit",
    gold_deposit: "Gold Deposit", coal_deposit: "Coal Deposit",
  };
  function terrainDisplayName(terr) {
    return TERRAIN_NAME[terr] || (terr ? String(terr).replace(/_/g, " ") : "Unknown");
  }
  // Buildings whose TERRAIN requirement matches hex (q,r) — mirrors ONLY the
  // terrain gate of Buildings.canPlaceBuilding step (1) (buildings.js:315-336):
  // extractor-on-adjacent-terrain / extractor-on-own-terrain / generic
  // buildable-land + houseOnly. Deliberately skips the other placement gates
  // (city adjacency, free hex, slot cap, gold) — the tooltip answers "what
  // fits this ground", not "could I place something here this instant".
  // Read-only; duplicated here (not imported) because buildings.js is
  // CoreDev's file and canPlaceBuilding interleaves the terrain rule with
  // gates that don't belong in a hover tooltip.
  function terrainEligibleBuildings(q, r) {
    const map = state && state.map;
    const hex = map && map.hexes && map.hexes.get(HexMath.key(q, r));
    if (!hex) return [];
    const terr = hex.terrain;
    const terrDef = CONFIG.terrain[terr];
    const isLand = !!(terrDef && terrDef.buildable);
    const out = [];
    for (const typeId in CONFIG.buildings) {
      const def = CONFIG.buildings[typeId];
      let ok;
      if (def.kind === "extractor" && def.adjacent) {
        ok = isLand && HexMath.neighbors(q, r).some(n => {
          const nh = map.hexes.get(HexMath.key(n.q, n.r));
          return nh && nh.terrain === def.adjacent;
        });
      } else if (def.kind === "extractor") {
        ok = terr === def.terrain;
      } else {
        ok = isLand && !(terrDef && terrDef.houseOnly && def.kind !== "house");
      }
      if (ok) out.push(def);
    }
    return out;
  }
  const tileTipEl = document.getElementById("tileTip");
  let tileTipHexKey = null;   // last hex the tooltip HTML was built for (skip rebuild on same hex)
  function updateTileTooltip(clientX, clientY) {
    if (!tileTipEl) return;   // UIDev's element not landed yet — no-op, not a crash
    if (!hoverHex || !state.map) { hideTileTip(); return; }
    const k = HexMath.key(hoverHex.q, hoverHex.r);
    const hex = state.map.hexes.get(k);
    if (!hex || !isVisible(k)) { hideTileTip(); return; }
    if (tileTipHexKey !== k) {
      tileTipHexKey = k;
      const buildables = terrainEligibleBuildings(hoverHex.q, hoverHex.r);
      let html = "<b>" + esc(terrainDisplayName(hex.terrain)) + "</b>";
      if (buildables.length) {
        const parts = buildables.map(def => {
          const locked = (typeof bbBuildingAvailable === "function") && !bbBuildingAvailable(def);
          return "<span" + (locked ? ' class="tt-locked"' : "") + ">" + esc(def.name) +
            (locked ? " (locked)" : "") + "</span>";
        });
        html += '<div class="tt-build">' + parts.join(", ") + "</div>";
      } else {
        html += '<div class="tt-build tt-none">Nothing buildable here</div>';
      }
      tileTipEl.innerHTML = html;
    }
    tileTipEl.classList.remove("hidden");
    tileTipEl.setAttribute("aria-hidden", "false");
    tileTipEl.style.left = (clientX + 16) + "px";
    tileTipEl.style.top = (clientY + 16) + "px";
  }
  function hideTileTip() {
    if (tileTipEl) { tileTipEl.classList.add("hidden"); tileTipEl.setAttribute("aria-hidden", "true"); }
    tileTipHexKey = null;
  }
  canvas.addEventListener("mousemove", (e) => updateTileTooltip(e.clientX, e.clientY));
  canvas.addEventListener("mouseleave", hideTileTip);
  // === /C: TILE HOVER TOOLTIP ==============================================
