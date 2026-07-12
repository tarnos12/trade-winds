  // === CARTS + CASTLE-UI START === (T9 / slot #4)
  // Reads the shared Phase-3 contract produced by T8 (state.carts, state.treasury,
  // CONFIG.trade) DEFENSIVELY — everything guarded so this slice also runs before
  // T8 merges. Owns ONLY the player warehouse (state.warehouse) + CONFIG.castle.
  // No trade logic here: carts are positioned purely from cart.progress.

  // My own config (additive; T8 owns CONFIG.trade, not touched here).
  CONFIG.castle = Object.assign({ warehouseCapacity: 300, tradeUnit: 5 }, CONFIG.castle);

  // Player warehouse — a flat { goodId: qty }. Owned by this slice.
  if (!state.warehouse || typeof state.warehouse !== "object") state.warehouse = {};

  // Per-good token colours for the cart dot (goods have no colour in CONFIG).
  const GOOD_COLORS = {
    wood: "#8a5a2b", planks: "#b07a3c", stone: "#9aa0a6", iron: "#6b7078",
    clay: "#c07b4a", bricks: "#b5542f", coal: "#2f2e30", gold: "#e6c93f",
    grain: "#d9b44a", flour: "#e8d59a", fish: "#5aa6c9", wool: "#e2ddce",
    bread: "#c8863c", clothes: "#5566c0",
    // === CC: content chains v2 token colours ===
    mead: "#c9902c", iron_tool: "#aab0b6", stone_tools: "#8f969c", oil: "#3a3a2a",
    pottery: "#b5713e", lamp: "#f0c24a", iron_armor: "#8a9099", chairs: "#a56a38",
    gold_ring: "#f0d97a", brandy: "#8a4b2a", luxury_clothes: "#b06cc0",
  };
  function goodColor(id) {
    if (GOOD_COLORS[id]) return GOOD_COLORS[id];
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360},55%,58%)`;
  }

  // ---- cart rendering ----------------------------------------------------
  // Position derives from cart.progress interpolated along the hex-key `path`.
  // I read the contract shape { path:[hexKey...], progress:0..1, phase, goodId,
  // done }. For 'return' I mirror the fraction (1-progress) so a cart that reset
  // progress to 0 on the way home walks the SAME path backwards — see integration
  // notes if T8 keeps progress running instead of resetting.
  function cartPixel(cart) { return cartPixelAt(cart, cart && cart.progress); }
  // Pixel position at fraction `frac` (0..1) along the cart's hex path, walking
  // cumulative segment lengths — so it follows the path THROUGH EVERY HEX (tile to
  // tile), never a straight chord across them. drawCarts glides `frac` itself so
  // the drawn cart always sits on the polyline.
  function cartPixelAt(cart, frac) {
    const path = cart && cart.path;
    if (!Array.isArray(path) || path.length === 0) return null;
    const pts = [];
    for (const k of path) {
      if (typeof k !== "string") return null;
      const [q, r] = k.split(",").map(Number);
      if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
      pts.push(HexMath.hexToPixel(q, r, SIZE));
    }
    if (pts.length === 1) return pts[0];
    // `f` walks the path forward. The LOGIC reverses cart.path when a trader turns
    // for home, so progress always runs 0→1 along the current path regardless of
    // phase (no mirroring). Parked phases hold progress at 1 → the path's end
    // (loading = seller on the outbound path; unloading = buyer on the reversed path).
    const f = Math.max(0, Math.min(1, Number(frac) || 0));
    // walk cumulative segment lengths to the fraction f of total length
    let total = 0; const seg = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      seg.push(l); total += l;
    }
    if (total === 0) return pts[0];
    let d = f * total;
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

  const cartRender = {};   // cart.id -> smoothed render state {x,y (drawn), fx,fy (glide-from), tx,ty (glide-to), t (0..1 progress of the current glide leg)} — see drawCarts (H)
  // === PP-E: cached owner-label strings per cart (no per-frame allocations) ===
  const ppeCartLabel = {}; // cart.id -> "City #N" / "Castle"
  const PPE_CART_LABEL_FONT = "bold " + Math.max(8, Math.round(SIZE * 0.24)) + "px system-ui, sans-serif";
  // === /PP-E ===

  function drawCartToken(x, y, color) {
    const w = SIZE * 0.52, h = SIZE * 0.34;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(x, y + h * 0.62, w * 0.5, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6b4a22"; ctx.strokeStyle = "#3c2a12"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2a1c0c";
    ctx.beginPath(); ctx.arc(x - w * 0.28, y + h * 0.5, h * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.28, y + h * 0.5, h * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - h * 0.08, h * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawCarts(dt) {
    const carts = state.carts || [];
    if (!carts.length) return;
    const zoomedOut = state.zoom < 0.6;   // dots-only when far out (GDD §8)
    // H: smooth cart glide. cart.progress (the TRADE-LOGIC source of truth) only
    // advances on economy ticks — CONFIG.econ.baseTickMs / state.gameSpeed real
    // ms apart — so cartPixel(cart)'s LOGICAL target position itself jumps once
    // per tick. Rather than drawing that jump directly (the "carts jump tile-to-
    // tile" symptom), each cart glides from wherever it was last DRAWN to the new
    // target over the real-world duration of one tick, at CONSTANT velocity
    // (linear, no easing) so the trader flows steadily and lands right as the
    // next tick arrives. Purely a render-side interpolation buffer: this
    // never reads/writes cart.progress or the sim tick, only the cached pixel
    // position in `cartRender`.
    const frameDt = Math.max(0, Number(dt) || 16);
    const tickMs = Math.max(16, ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500) / Math.max(0.05, state.gameSpeed || 1));
    const live = new Set();
    for (const cart of carts) {
      if (!cart || cart.done) continue;
      const logical = Math.max(0, Math.min(1, Number(cart.progress) || 0));
      // Signature changes when the trader turns for home (cart.path is reversed)
      // or a new trip starts, so we reset instead of gliding across the board.
      const sig = Array.isArray(cart.path)
        ? cart.path.length + "|" + cart.path[0] + "|" + cart.path[cart.path.length - 1] : "";
      let rp = cartRender[cart.id];
      if (!rp || rp.sig !== sig || logical < rp.tf - 0.02) {
        // new cart, path reversed, or progress reset → snap the rendered fraction.
        rp = cartRender[cart.id] = { pf: logical, ff: logical, tf: logical, t: 1, sig: sig, x: 0, y: 0 };
      } else if (logical !== rp.tf) {
        // a tick advanced logical progress → glide the FRACTION from where we are to
        // the new logical fraction over one tick's real duration.
        rp.ff = rp.pf; rp.tf = logical; rp.t = 0;
      }
      // LINEAR (no easing) → CONSTANT speed. We interpolate the PATH FRACTION, not
      // raw x/y, so the drawn cart always sits ON the hex polyline (tile to tile)
      // instead of cutting a straight chord to a point half a path ahead. Roads
      // advance cart.progress twice as far per tick as off-road ⇒ faster on roads,
      // slower off-road, steady in between.
      rp.pf = (rp.t < 1) ? (rp.t = Math.min(1, rp.t + frameDt / tickMs), rp.ff + (rp.tf - rp.ff) * rp.t) : rp.tf;
      const pos = cartPixelAt(cart, rp.pf);
      if (!pos) continue;
      rp.x = pos.x; rp.y = pos.y;
      live.add(cart.id);
      const gc = goodColor(cart.goodId);
      if (zoomedOut) {
        ctx.fillStyle = gc; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, SIZE * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        drawCartToken(rp.x, rp.y, gc);
        // === CB-B / PP-E: cargo chips above the wagon. outbound = requested
        // (greyed/translucent); return = carried (solid). Castle carts share the
        // look. PP-E extends the single primary chip to the FULL multi-good
        // cargo (up to 3 stacked chips) + a tiny owner label under the wagon. ===
        // requested (not yet bought) only while heading OUT; once parked to load the
        // cargo is secured, so loading/return/unloading show it solid (carried).
        const requested = cart.phase === "outbound";
        const items = (Array.isArray(cart.cargo) && cart.cargo.length)
          ? cart.cargo
          : (cart.goodId ? [cart] : []);   // legacy/castle carts: {goodId,qty} shape
        const chipStep = Math.max(11, SIZE * 0.26);
        let shown = 0;
        for (let ci = 0; ci < items.length && shown < 3; ci++) {
          const q = Math.round(Number(items[ci].qty) || 0);
          if (q <= 0) continue;
          drawGoodChip(rp.x, rp.y - SIZE * 0.5 - shown * chipStep, items[ci].goodId, q,
            { alpha: requested ? 0.5 : 1, muted: requested });
          shown++;
        }
        // owner label ("City #N" / "Castle") — only when zoomed in well; the
        // string is cached per cart so nothing is allocated per frame.
        if (state.zoom >= 0.8) {
          let lbl = ppeCartLabel[cart.id];
          if (!lbl) {
            lbl = ppeCartLabel[cart.id] =
              (cart.kind === "castle" || cart.fromId === "castle")
                ? "Castle" : "City #" + cart.fromId;
          }
          ctx.save();
          ctx.font = PPE_CART_LABEL_FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "rgba(18,12,5,0.75)"; ctx.lineWidth = 2.5;
          ctx.strokeText(lbl, rp.x, rp.y + SIZE * 0.55);
          ctx.fillStyle = "#e8dcc0";
          ctx.fillText(lbl, rp.x, rp.y + SIZE * 0.55);
          ctx.restore();
        }
        // === /CB-B /PP-E ===
      }
    }
    // prune render cache for carts that vanished/finished
    for (const id in cartRender) if (!live.has(isNaN(+id) ? id : +id) && !live.has(id)) delete cartRender[id];
    // === PP-E: prune cached owner labels alongside ===
    for (const id in ppeCartLabel) if (!live.has(isNaN(+id) ? id : +id) && !live.has(id)) delete ppeCartLabel[id];
    // === /PP-E ===
  }

  // ---- treasury / kingdom-gold ------------------------------------------
  // CP: the treasury/tariff readouts moved OUT of #hud. Treasury now shows on the
  // top-left kingdom chip (kept in sync here + by CityCards) and inside the castle
  // click panel; the tariff rate lives in the castle panel's tariff control.
  const kingdomGoldHudEl = document.getElementById("kingdomGold");
  function tariffRate() {
    // TARIFF-SLIDER (P5D-D): the player-set base is the source of truth; fall back to
    // the CONFIG baseline for pre-slider states/saves.
    if (typeof state.tariffRate === "number") return state.tariffRate;
    const tr = CONFIG.trade && CONFIG.trade.tariffRate;
    return typeof tr === "number" ? tr : 0.25;   // GDD §6.3 baseline
  }
  function updateTreasuryHud() {
    if (kingdomGoldHudEl) kingdomGoldHudEl.textContent = Math.round(state.treasury || 0).toLocaleString();
    updateTariffCtl();
  }

  // ---- TARIFF-SLIDER (P5D-D): gated 10–40% tariff dial ------------------
  // CP: the tariff control now lives inside #castlePanel. The block is always shown
  // there; the slider + hint toggle on the Tariff Office research (before that the
  // rate is fixed and just displayed).
  const tariffCtlEl = document.getElementById("tariffCtl");
  const tariffSliderEl = document.getElementById("tariffSlider");
  const tariffPctEl = document.getElementById("tariffPct");
  const tariffHintEl = document.getElementById("tariffHint");
  // Unlocked once the "Tariff Office" node (effect { tariff_slider: true }) is researched.
  // Accept an id-named node too, in case the tree is renamed later.
  function tariffSliderUnlocked() {
    if (typeof Research === "undefined") return false;
    if (Research.has && Research.has(state, "tariff_slider")) return true;
    if (Research.effect) return !!Research.effect(state, "tariff_slider", false);
    return false;
  }
  function updateTariffCtl() {
    if (!tariffCtlEl) return;
    const unlocked = tariffSliderUnlocked();
    if (tariffSliderEl) tariffSliderEl.style.display = unlocked ? "" : "none";
    if (tariffHintEl) tariffHintEl.style.display = unlocked ? "none" : "";
    const pct = Math.round(tariffRate() * 100);
    if (tariffSliderEl && document.activeElement !== tariffSliderEl) tariffSliderEl.value = String(pct);
    if (tariffPctEl) tariffPctEl.textContent = pct + "%";
  }
  if (tariffSliderEl) {
    tariffSliderEl.addEventListener("input", () => {
      const pct = parseInt(tariffSliderEl.value, 10) || 25;
      state.tariffRate = Math.max(0.10, Math.min(0.40, pct / 100));  // GDD §6.3 range
      if (tariffPctEl) tariffPctEl.textContent = pct + "%";
      scheduleSave();
    });
  }

  // ---- castle warehouse panel -------------------------------------------
  const castleEl = document.getElementById("castlePanel");
  const cwBodyEl = document.getElementById("cwBody");
  const cwTreasuryEl = document.getElementById("cwTreasury");
  const cwMarketEl = document.getElementById("cwMarket");
  const cwCapTextEl = document.getElementById("cwCapText");
  const cwCapBarEl = document.getElementById("cwCapBar");
  let castleOpen = false;
  // === PP-C === two-tab castle panel (🏰 Keep / 🏪 Warehouse) — DOM handles + tab state.
  const cwTabsEl = document.getElementById("cwTabs");
  const cwKeepBodyEl = document.getElementById("cwKeepBody");
  const cwWhBodyEl = document.getElementById("cwWhBody");
  const cwFleetEl = document.getElementById("cwFleet");
  const cwMarketRowsEl = document.getElementById("cwMarketRows");
  const cwFlowSumEl = document.getElementById("cwFlowSum");
  const cwStoresEl = document.getElementById("cwStores");
  let cwTab = "keep";
  function cwSetTab(tab) {
    cwTab = (tab === "warehouse") ? "warehouse" : "keep";
    for (const b of cwTabsEl.querySelectorAll("[data-cwtab]"))
      b.classList.toggle("active", b.dataset.cwtab === cwTab);
    cwKeepBodyEl.classList.toggle("hidden", cwTab !== "keep");
    cwWhBodyEl.classList.toggle("hidden", cwTab !== "warehouse");
    renderCastlePanel(true);
  }
  cwTabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cwtab]");
    if (b) cwSetTab(b.dataset.cwtab);
  });
  const cwCityName = (id) => "City #" + id;
  // === /PP-C ===

  function nearestTownToCastle() {
    let best = null, bd = Infinity;
    for (const t of state.towns) {
      const d = HexMath.dist(0, 0, t.q, t.r);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // Local market price the player trades against: the nearest town's price, or
  // the good's base price if there are no towns yet.
  function castlePriceOf(goodId) {
    const t = nearestTownToCastle();
    if (t) return priceOf(t, goodId);
    const g = CONFIG.goods[goodId];
    return g ? g.basePrice : 0;
  }
  function warehouseUsed() {
    let s = 0; const w = state.warehouse || {};
    for (const k in w) s += w[k] || 0;
    return s;
  }
  // P5-A: effective warehouse capacity = base + `warehouseCap` research (guarded;
  // "Warehousing" adds +200). Base value when no research is unlocked.
  function warehouseCapEff() {
    let cap = CONFIG.castle.warehouseCapacity;
    if (typeof Research !== "undefined" && Research.effect) cap += Research.effect(state, "warehouseCap", 0);
    return cap;
  }

  function castleBuy(goodId) {
    const unit = CONFIG.castle.tradeUnit;
    const cap = warehouseCapEff();
    const price = castlePriceOf(goodId);
    const cost = price * unit;
    const treas = state.treasury || 0;
    if (treas < cost) return;                       // can't afford
    if (warehouseUsed() + unit > cap) return;       // capacity limited
    state.treasury = treas - cost;                  // player spends tariff gold
    state.warehouse[goodId] = (state.warehouse[goodId] || 0) + unit;
    afterCastleTrade();
  }
  function castleSell(goodId) {
    const have = state.warehouse[goodId] || 0;
    if (have <= 0) return;
    const unit = Math.min(CONFIG.castle.tradeUnit, have);
    const price = castlePriceOf(goodId);
    state.warehouse[goodId] = have - unit;
    if (state.warehouse[goodId] <= 0) delete state.warehouse[goodId];
    state.treasury = (state.treasury || 0) + price * unit;   // player earns gold
    afterCastleTrade();
    SFX.playThrottled("trade", 120);
  }
  function afterCastleTrade() {
    renderCastlePanel(true);   // PP-C: force — the pointer is over the panel
    updateTreasuryHud();
    scheduleSave();
  }

  // === PP-C === Warehouse-tab widgets (fleet bar, per-good market rows, flow
  // summary, relocated Royal Stores). All READ the live state (state.carts,
  // state.castleStock, state.castleTrade) — mutations happen only through the
  // delegated input handlers below, which write state.castleTrade (PP-A's
  // persisted market config) and scheduleSave().
  const CW_DEFAULT_LIMIT = 50;
  function cwGoodIds() {
    return Object.keys(CONFIG.goods).sort((a, b) =>
      CONFIG.goods[a].tier - CONFIG.goods[b].tier || a.localeCompare(b));
  }
  function cwCastleSellPrice(gid) {
    const g = CONFIG.goods[gid]; const base = g ? g.basePrice : 0;
    return base * ((CONFIG.trade && CONFIG.trade.castleSellMargin) || 1);
  }
  // Overall trip fraction of a castle-owned trader (phase-weighted; honest but
  // approximate: travel legs 35% each, load/unload dwell 15% each).
  function cwCastleCartPct(c) {
    const leg = Math.max(0, Math.min(1, c.progress || 0));
    const q = Math.max(1, c.qty || 1);
    if (c.phase === "outbound") return 0.35 * leg;
    if (c.phase === "loading") return 0.35 + 0.15 * Math.min(1, (c.loaded || 0) / q);
    if (c.phase === "return") return 0.50 + 0.35 * leg;
    if (c.phase === "unloading") return 0.85 + 0.15 * Math.min(1, (c.unloaded || 0) / q);
    return 0;
  }
  function cwCastleCartLine(c, k) {
    const pct = Math.round(cwCastleCartPct(c) * 100);
    const gold = Math.round(c.agreedGold || (c.unitBuy || 0) * (c.qty || 0));
    const phase = c.phase === "outbound" ? "en route"
      : c.phase === "loading" ? "loading"
      : c.phase === "return" ? "hauling home"
      : "unloading (" + fmt(Math.min(c.unloaded || 0, c.qty || 0)) + "/" + fmt(c.qty || 0) + ")";
    return "#" + k + ": (" + pct + "%) Buy " + fmt(c.qty || 0) + " " + goodIcon(c.goodId) +
      " from " + cwCityName(c.toId) + " for " + gold + "🪙 — " + phase;
  }
  function cwRenderFleet() {
    const max = (CONFIG.researchEconomy && CONFIG.researchEconomy.maxTraders) || 0;
    const live = [];
    for (const c of (state.carts || [])) if (!c.done && c.kind === "castle") live.push(c);
    const pct = max ? Math.max(0, Math.min(100, live.length / max * 100)) : 0;
    const lines = [];
    for (let k = 1; k <= max; k++)
      lines.push(k <= live.length ? cwCastleCartLine(live[k - 1], k) : "#" + k + ": Not Trading");
    cwFleetEl.innerHTML = '<div class="cwf-line"><span>🐎 Royal traders</span><b>' +
      live.length + " / " + max + "</b></div>" +
      '<div class="cwf-bar"><span style="width:' + pct + '%"></span></div>';
    cwFleetEl.title = lines.join("\n");   // hover tooltip: every trader slot
  }
  // Live flow of a good through the castle: units on royal buyers heading IN
  // (kind:"castle") vs units committed to city buyers heading OUT (sellerCastle).
  function cwGoodFlow(gid) {
    let buying = 0, selling = 0;
    for (const c of (state.carts || [])) {
      if (c.done) continue;
      if (c.kind === "castle") { if (c.goodId === gid) buying += (c.qty || 0); continue; }
      if (!c.sellerCastle) continue;
      const items = Array.isArray(c.cargo) ? c.cargo : [{ goodId: c.goodId, qty: c.qty }];
      for (const it of items) if (it.goodId === gid) selling += (it.qty || 0);
    }
    return { buying, selling };
  }
  function cwRenderMarketRows() {
    const ct = (state.castleTrade && typeof state.castleTrade === "object") ? state.castleTrade : {};
    const cs = state.castleStock || {};
    let rows = "";
    for (const gid of cwGoodIds()) {
      const e = ct[gid];
      const enabled = !!(e && e.enabled);
      const limit = (e && typeof e.limit === "number") ? e.limit : CW_DEFAULT_LIMIT;
      const stock = Math.floor(cs[gid] || 0);
      const flow = cwGoodFlow(gid);
      let fl = '<span class="cwm-flow flat" title="Idle">—</span>';
      if (flow.selling > 0) fl = '<span class="cwm-flow up" title="Selling: ' + fmt(flow.selling) + ' committed to city buyers">▲</span>';
      else if (flow.buying > 0) fl = '<span class="cwm-flow down" title="Buying: ' + fmt(flow.buying) + ' inbound on royal buyers">▼</span>';
      else if (enabled && stock < limit) fl = '<span class="cwm-flow down" style="opacity:.5" title="Under limit — royal buyers will buy when a city has surplus">▼</span>';
      rows += '<tr class="' + (enabled ? "" : "off") + '">' +
        '<td><span class="cw-dot" style="background:' + goodColor(gid) + '"></span>' + goodIcon(gid) + " " + esc(GOOD_LABEL(gid)) + "</td>" +
        "<td>" + fmt(stock) + "</td>" +
        "<td>" + fmt(cwCastleSellPrice(gid)) + "g</td>" +
        "<td>" + fl + "</td>" +
        '<td><input type="number" class="cwm-lim" data-ct-limit="' + gid + '" min="0" step="5" value="' + limit + '" title="Buy limit: royal buyers stock the castle up to this many"></td>' +
        '<td><input type="checkbox" data-ct-toggle="' + gid + '"' + (enabled ? " checked" : "") + ' title="Enable castle trading: buy up to the limit, sell castle stock to cities"></td>' +
        "</tr>";
    }
    cwMarketRowsEl.innerHTML = '<table class="cwm-tbl"><tr>' +
      "<th>Good</th><th>Castle</th><th>Price</th><th></th><th>Limit</th><th>Trade</th></tr>" + rows + "</table>";
  }
  // In-flight gold summary. Honest numbers only: Sell = agreed gold city buyers
  // will pay on arrival at the castle (outbound sellerCastle carts); Buy = gold
  // already committed on live royal buyers (incl. research materials — the fleet
  // is shared, PP-A market carts are indistinguishable by design). Plus the
  // castle warehouse's total value at base prices.
  function cwRenderFlowSummary() {
    let buyGold = 0, sellGold = 0;
    for (const c of (state.carts || [])) {
      if (c.done) continue;
      if (c.kind === "castle") { buyGold += (c.unitBuy || 0) * (c.qty || 0); continue; }
      if (c.sellerCastle && c.phase === "outbound") {
        const items = Array.isArray(c.cargo) ? c.cargo : [{ qty: c.qty, unitBuy: c.unitBuy }];
        for (const it of items) sellGold += (it.unitBuy || 0) * (it.qty || 0);
      }
    }
    const cs = state.castleStock || {};
    let val = 0;
    for (const gid in cs) { const g = CONFIG.goods[gid]; if (g) val += (cs[gid] || 0) * g.basePrice; }
    const net = sellGold - buyGold;
    cwFlowSumEl.innerHTML =
      '<span class="up" title="City buyers en route to the castle pay this on arrival">Sell: +' + Math.round(sellGold) + "🪙</span> · " +
      '<span class="down" title="Gold committed on live royal buyers (incl. research materials)">Buy: −' + Math.round(buyGold) + "🪙</span> · " +
      "<span>Balance: " + (net >= 0 ? "+" : "−") + Math.abs(Math.round(net)) + "🪙</span>" +
      '<div class="cwm-total">Total Resource Value: ' + Math.round(val) + "🪙</div>";
  }
  // Relocated Royal Stores (the pre-PP-C manual buy/sell table on state.warehouse —
  // unchanged mechanics; still what King's-quest 'deliver' requests consume).
  function cwRenderStores() {
    const unit = CONFIG.castle.tradeUnit;
    const cap = warehouseCapEff();
    const used = warehouseUsed();
    const treas = state.treasury || 0;
    let rows = "";
    for (const id of cwGoodIds()) {
      const price = castlePriceOf(id);
      const held = state.warehouse[id] || 0;
      const canBuy = treas >= price * unit && used + unit <= cap;
      const canSell = held > 0;
      rows += `<tr class="${held > 0 ? "" : "dim"}">
        <td><span class="cw-dot" style="background:${goodColor(id)}"></span>${goodIcon(id)} ${esc(GOOD_LABEL(id))}</td>
        <td>${fmt(price)}g</td>
        <td>${fmt(held)}</td>
        <td>
          <button class="cw-btn buy" data-buy="${id}" ${canBuy ? "" : "disabled"}>Buy ${unit}</button>
          <button class="cw-btn sell" data-sell="${id}" ${canSell ? "" : "disabled"}>Sell ${unit}</button>
        </td></tr>`;
    }
    cwStoresEl.innerHTML = `<table class="cw-tbl">
      <tr><th>Good</th><th>Price</th><th>Held</th><th></th></tr>${rows}</table>`;
  }
  // === /PP-C ===

  function renderCastlePanel(force) {
    if (!castleOpen) return;
    // === PP-C === hover-safe auto-refresh (the ttRenderQueue pattern): the 500ms
    // interval rebuilds innerHTML, which would yank toggles/limit inputs out from
    // under the pointer — so periodic refreshes skip while the panel is hovered or
    // an input inside it has keyboard focus. Explicit calls (tab switch, clicks,
    // open) pass force=true.
    const ae = document.activeElement;
    if (!force && (castleEl.matches(":hover") ||
        (ae && ae.tagName === "INPUT" && castleEl.contains(ae)))) return;
    // === /PP-C ===
    const cap = warehouseCapEff();
    const used = warehouseUsed();
    const treas = state.treasury || 0;
    const town = nearestTownToCastle();
    cwTreasuryEl.textContent = Math.round(treas).toLocaleString() + " g";
    cwMarketEl.textContent = town ? ("Town #" + town.id) : "base prices";
    cwCapTextEl.textContent = Math.round(used) + " / " + cap;
    cwCapBarEl.style.width = Math.max(0, Math.min(100, used / cap * 100)) + "%";

    // P4-B: castle level + prestige + upgrade action.
    let castleHtml = `<div class="up-box">
      <div class="up-line"><b>🏰 Castle — Level ${state.castleLevel || 1}</b>
        <span>✨ ${Math.floor(state.prestige || 0)} prestige</span></div>`;
    const creq = Castle.nextReq(state);
    if (!creq) {
      castleHtml += `<div class="up-max">Level ${state.castleLevel} — the realm is won 👑</div>`;
    } else {
      const cres = Castle.canUpgrade(state);
      castleHtml += `<div class="up-req">Requires ${creq.prestigeReq} prestige (have ${Math.floor(state.prestige || 0)}) · ${creq.goldReq} g (have ${Math.floor(treas)})</div>
        <button class="up-btn" data-castle-upgrade ${cres.ok ? "" : "disabled"}>${cres.ok ? "Upgrade to Level " + ((state.castleLevel || 1) + 1) : esc(cres.reason)}</button>
        ${(state.castleLevel || 1) + 1 >= CONFIG.castle.maxLevel ? '<div class="up-req" style="text-align:center;margin-top:5px">Next level wins the game.</div>' : ""}`;
    }
    castleHtml += `</div>`;

    // CP: extension hook so later slices (e.g. CRE — castle research economy) can
    // inject their own section (research-materials list, etc.) without editing this
    // function. Each hook returns an HTML string appended to the Keep-tab body.
    let extraHtml = "";
    if (Array.isArray(castlePanelSections)) {
      for (const fn of castlePanelSections) {
        try { extraHtml += (fn(state) || ""); } catch (err) { /* a bad hook must not break the panel */ }
      }
    }
    // === PP-C === render both tab bodies (only one is visible), preserving scroll.
    const ks = cwKeepBodyEl.scrollTop;
    cwBodyEl.innerHTML = castleHtml + extraHtml;
    cwKeepBodyEl.scrollTop = ks;
    const ws = cwWhBodyEl.scrollTop;
    cwRenderFleet(); cwRenderMarketRows(); cwRenderFlowSummary(); cwRenderStores();
    cwWhBodyEl.scrollTop = ws;
    // === /PP-C ===
  }
  // Registry of extra panel sections (CP hook; see renderCastlePanel).
  const castlePanelSections = [];

  function openCastlePanel() {
    // mutually exclusive with the town panel
    if (window.TownUI && typeof window.TownUI.closeTownPanel === "function") window.TownUI.closeTownPanel();
    castleOpen = true;
    castleEl.classList.remove("hidden");
    castleEl.setAttribute("aria-hidden", "false");
    renderCastlePanel(true);   // PP-C: force the first paint
  }
  function closeCastlePanel() {
    castleOpen = false;
    castleEl.classList.add("hidden");
    castleEl.setAttribute("aria-hidden", "true");
  }

  // buy/sell via delegation (rows are re-rendered each trade).
  // PP-C: listener moved from #cwBody to the panel root — the stores table now
  // lives on the Warehouse tab (#cwStores) while the upgrade button stays on Keep.
  castleEl.addEventListener("click", (e) => {
    // RESEARCH CENTER (Slice C): "Place Research Center" button in the rc-box.
    if (e.target.closest("button[data-place-rc]")) {
      startPlacingResearchCenter();
      return;
    }
    if (e.target.closest("button[data-castle-upgrade]")) {
      const res = Castle.upgrade(state);
      if (res.ok) {
        renderCastlePanel(true);
        updateProgressHud();
        // BALPV: castle L5 is a milestone, not the win — victory now fires from
        // Victory.check (aristocrat house @100%), surfaced via progress-ui polling.
        scheduleSave();
        SFX.play("levelup");
      }
      return;
    }
    const b = e.target.closest("button[data-buy]");
    const s = e.target.closest("button[data-sell]");
    if (b) castleBuy(b.dataset.buy);
    else if (s) castleSell(s.dataset.sell);
  });
  // === PP-C === castle-market controls (Warehouse tab): the enable-trading toggle
  // and the buy-limit input write state.castleTrade[gid] = {enabled, limit} — the
  // PP-A config the pure CastleMarket/Trade layers read. Already persisted by the
  // PP-A save/load fields; nothing new is stored.
  castleEl.addEventListener("change", (e) => {
    const t = e.target.closest("input[data-ct-toggle]");
    if (t) {
      const gid = t.dataset.ctToggle;
      if (!CONFIG.goods[gid]) return;
      if (!state.castleTrade || typeof state.castleTrade !== "object") state.castleTrade = {};
      const cur = state.castleTrade[gid] || { enabled: false, limit: CW_DEFAULT_LIMIT };
      cur.enabled = !!t.checked;
      if (typeof cur.limit !== "number" || !isFinite(cur.limit) || cur.limit < 0) cur.limit = CW_DEFAULT_LIMIT;
      state.castleTrade[gid] = cur;
      scheduleSave();
      renderCastlePanel(true);   // row dim/flow state changed
      return;
    }
    const l = e.target.closest("input[data-ct-limit]");
    if (l) {
      const gid = l.dataset.ctLimit;
      if (!CONFIG.goods[gid]) return;
      if (!state.castleTrade || typeof state.castleTrade !== "object") state.castleTrade = {};
      const cur = state.castleTrade[gid] || { enabled: false, limit: CW_DEFAULT_LIMIT };
      const v = Math.floor(parseFloat(l.value));
      cur.limit = (isFinite(v) && v >= 0) ? v : 0;
      state.castleTrade[gid] = cur;
      l.value = String(cur.limit);   // reflect the clamped value
      scheduleSave();
    }
  });
  // === /PP-C ===
  document.getElementById("cwClose").addEventListener("click", closeCastlePanel);

  // Castle-click detection at the center hex (0,0), pan-mode only. Own down-pos
  // so a camera drag is not read as a click (mirrors the TOWN-UI pattern).
  let castleDown = null;
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) castleDown = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("click", (e) => {
    const down = castleDown; castleDown = null;
    if (!down) return;
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) return;
    if (state.mode !== "pan") return;
    const h = hexAtScreen(e.clientX, e.clientY);
    if (h.q === 0 && h.r === 0) openCastlePanel();
    else if (castleOpen) closeCastlePanel();
  });

  // === CITY-CARDS === kingdom-gold chip + live per-city cards with Give/Take (EC-C)
  // UI-only: never touches Sim/Trade/economy or the town panel internals. Give/Take
  // move gold between state.treasury (Kingdom) and town.gold (a city's trade budget),
  // nudge happiness via the Sim's town.happyMods channel, then start a per-city
  // tick-based cooldown. Colors are a FIXED palette so City #N is stable every game.
  const CityCards = (() => {
    // 12 predefined, visually distinct hues (warm-leaning) in a FIXED order.
    const PALETTE = [
      "#e0563f", // vermillion
      "#e39a2c", // amber
      "#d8c23a", // gold
      "#6fb64a", // leaf green
      "#3fb59b", // teal
      "#3f8fd6", // sky blue
      "#7d6bd8", // indigo
      "#c05bd0", // magenta
      "#e0578f", // rose
      "#b5794a", // clay
      "#9aa62e", // olive
      "#5aa0a0", // slate cyan
    ];
    function cityColor(id) {
      const n = +id;
      const i = Number.isFinite(n)
        ? ((n - 1) % PALETTE.length + PALETTE.length) % PALETTE.length
        : 0;
      return PALETTE[i];
    }

    const GIVE_AMT = 1000, TAKE_AMT = 1000;
    const COOLDOWN_TICKS = 240;   // ~2 min at 1× (500 ms/tick)
    const HAPPY_TICKS = 120;      // ~1 min the happiness nudge lasts

    const cardsEl = document.getElementById("cityCards");
    const kingdomGoldEl = document.getElementById("kingdomGold");
    const SIZEc = (CONFIG.map && CONFIG.map.hexSize) || 24;
    const cards = new Map();   // townId -> { root, avatar, name, gold, hFill, hPct, give, take, cool }

    const now = () => (state.tick || 0);
    const onCooldown = (t) => (t.cooldownUntil || 0) > now();

    function give(town) {
      if (onCooldown(town)) return false;
      if ((state.treasury || 0) < GIVE_AMT) return false;
      state.treasury -= GIVE_AMT;
      town.gold = (town.gold || 0) + GIVE_AMT;
      if (typeof Ledger !== "undefined") Ledger.recordTransfer(town, +GIVE_AMT);   // PP-A ledger
      if (!Array.isArray(town.happyMods)) town.happyMods = [];
      town.happyMods.push({ delta: +10, untilTick: now() + HAPPY_TICKS });
      town.cooldownUntil = now() + COOLDOWN_TICKS;
      if (typeof scheduleSave === "function") scheduleSave();
      refresh();
      return true;
    }
    function take(town) {
      if (onCooldown(town)) return false;
      if ((town.gold || 0) < TAKE_AMT) return false;
      town.gold -= TAKE_AMT;
      state.treasury = (state.treasury || 0) + TAKE_AMT;
      if (typeof Ledger !== "undefined") Ledger.recordTransfer(town, -TAKE_AMT);   // PP-A ledger
      if (!Array.isArray(town.happyMods)) town.happyMods = [];
      town.happyMods.push({ delta: -30, untilTick: now() + HAPPY_TICKS });
      town.cooldownUntil = now() + COOLDOWN_TICKS;
      if (typeof scheduleSave === "function") scheduleSave();
      refresh();
      return true;
    }

    // Click a card body (not a button): center the camera and open its panel.
    function focus(town) {
      const p = HexMath.hexToPixel(town.q, town.r, SIZEc);
      state.cam.x = p.x; state.cam.y = p.y;
      if (typeof openTownPanel === "function") openTownPanel(town);
    }

    function buildCard(town) {
      const root = document.createElement("div");
      root.className = "city-card";
      root.innerHTML =
        '<div class="cc-top">' +
          '<span class="cc-avatar"></span>' +
          '<span class="cc-name"></span>' +
          '<span class="cc-gold"></span>' +
        '</div>' +
        '<div class="cc-happy">' +
          '<span class="cc-happy-track"><span class="cc-happy-fill"></span></span>' +
          '<span class="cc-happy-pct"></span>' +
        '</div>' +
        '<div class="cc-btns">' +
          '<button class="cc-give" title="Give 1000 g from the Kingdom to this city (+happiness)">Give 1000</button>' +
          '<button class="cc-take" title="Take 1000 g from this city into the Kingdom (−happiness)">Take 1000</button>' +
        '</div>' +
        '<div class="cc-cool" style="display:none"></div>';
      const parts = {
        root,
        avatar: root.querySelector(".cc-avatar"),
        name: root.querySelector(".cc-name"),
        gold: root.querySelector(".cc-gold"),
        hFill: root.querySelector(".cc-happy-fill"),
        hPct: root.querySelector(".cc-happy-pct"),
        give: root.querySelector(".cc-give"),
        take: root.querySelector(".cc-take"),
        cool: root.querySelector(".cc-cool"),
      };
      parts.give.addEventListener("click", (e) => { e.stopPropagation(); give(town); });
      parts.take.addEventListener("click", (e) => { e.stopPropagation(); take(town); });
      root.addEventListener("click", () => focus(town));
      return parts;
    }

    function refresh() {
      if (!cardsEl) return;
      if (kingdomGoldEl) kingdomGoldEl.textContent = Math.round(state.treasury || 0).toLocaleString();

      const towns = (state.towns || []).slice().sort((a, b) => (+a.id || 0) - (+b.id || 0));
      const seen = new Set();
      let prev = null;
      for (const town of towns) {
        if (town.id == null) continue;
        seen.add(town.id);
        let c = cards.get(town.id);
        if (!c) { c = buildCard(town); cards.set(town.id, c); }
        // keep DOM order matching id order
        if (c.root.parentNode !== cardsEl || c.root.previousElementSibling !== prev) {
          cardsEl.insertBefore(c.root, prev ? prev.nextElementSibling : cardsEl.firstChild);
        }
        prev = c.root;

        c.avatar.style.background = cityColor(town.id);
        c.name.textContent = "City #" + town.id;
        c.gold.textContent = Math.round(town.gold || 0).toLocaleString() + " g";
        const h = Math.max(0, Math.min(100, Math.round(town.happiness || 0)));
        c.hFill.style.width = h + "%";
        // === PP-E: color-coded happiness face next to the % ===
        const face = h >= 70 ? "\u{1F60A}" : (h < 40 ? "☹" : "\u{1F610}");
        c.hPct.textContent = face + " " + h + "%";
        c.hPct.style.color = h >= 70 ? "#6fb64a" : (h < 40 ? "#e0563f" : "#e39a2c");
        // === /PP-E ===

        const cooling = onCooldown(town);
        const canGive = !cooling && (state.treasury || 0) >= GIVE_AMT;
        const canTake = !cooling && (town.gold || 0) >= TAKE_AMT;
        c.give.disabled = !canGive;
        c.take.disabled = !canTake;
        if (cooling) {
          const left = Math.max(0, (town.cooldownUntil || 0) - now());
          const secs = Math.ceil(left * 0.5);   // 500 ms per tick
          const mm = Math.floor(secs / 60), ss = secs % 60;
          c.cool.textContent = "cooldown " + mm + ":" + (ss < 10 ? "0" : "") + ss;
          c.cool.style.display = "";
        } else {
          c.cool.style.display = "none";
        }
      }
      // drop cards for towns that no longer exist
      for (const [id, c] of cards) {
        if (!seen.has(id)) { if (c.root.parentNode) c.root.parentNode.removeChild(c.root); cards.delete(id); }
      }
    }

    return { refresh, cityColor, give, take, PALETTE };
  })();
  window.CityCards = CityCards;
  // === CITY-CARDS END ===

  // === KR-B START === kingdom resource overview UI (grid of producible goods +
  // a click-through detail panel with a 5-min mean-price chart). READ-ONLY: it
  // only reads the pure KR-A Market module (window.Market) + CONFIG + towns and
  // never mutates the economy. Cheap DOM patching on a ~1 s cadence (chips are
  // created once and updated in place); the chart redraws only while open.
  const MarketUI = (() => {
    const gridEl   = document.getElementById("resGrid");
    const chipsEl  = document.getElementById("rgChips");
    const toggleEl = document.getElementById("rgToggle");
    const detailEl = document.getElementById("resDetail");
    const rdDot    = document.getElementById("rdDot");
    const rdName   = document.getElementById("rdName");
    const rdClose  = document.getElementById("rdClose");
    const rdBar    = document.getElementById("rdBar");
    const rdBarLbl = document.getElementById("rdBarLbl");
    const rdStats  = document.getElementById("rdStats");
    const rdChart  = document.getElementById("rdChart");
    const rdAxMin  = document.getElementById("rdAxMin");
    const rdAxBase = document.getElementById("rdAxBase");
    const rdAxMax  = document.getElementById("rdAxMax");

    let openGood = null;
    const chips = new Map();   // gid -> { root, tot, price, tr }

    const M = () => (typeof window !== "undefined" && window.Market) || null;
    // Show only once a game is actually running (start screen gates boot).
    function running() {
      if (!state || !state.map) return false;
      if (window.StartScreen && typeof window.StartScreen.isOpen === "function" && window.StartScreen.isOpen()) return false;
      return true;
    }

    // Cheap producer/consumer census for a good: producers = buildings that
    // OUTPUT it; consumers = buildings that use it as an INPUT + (if it is a
    // population need) each populated town that eats it.
    function roleCounts(gid) {
      let producers = 0, consumers = 0;
      const towns = (state && state.towns) || [];
      for (const t of towns) {
        const bs = Array.isArray(t.buildings) ? t.buildings : [];
        for (const b of bs) {
          const def = CONFIG.buildings[b && b.typeId];
          if (!def) continue;
          if (def.output && def.output.goodId === gid) producers++;
          if (def.inputs && def.inputs[gid]) consumers++;
        }
      }
      const N = CONFIG.needs || {};
      const isNeed = (Array.isArray(N.basicNeeds) && N.basicNeeds.indexOf(gid) >= 0) ||
                     (Array.isArray(N.extraNeeds) && N.extraNeeds.indexOf(gid) >= 0);
      if (isNeed) {
        for (const t of towns) {
          const p = t.pop || {};
          if (((p.peasants || 0) + (p.workers || 0) + (p.burghers || 0) + (p.aristocrats || 0)) > 0) consumers++;  // === CC ===
        }
      }
      return { producers, consumers };
    }

    function buildChip(gid) {
      const root = document.createElement("div");
      root.className = "rg-chip";
      root.title = GOOD_LABEL(gid);
      root.innerHTML = '<span class="rg-ico"></span><span class="rg-tot"></span>' +
                       '<span class="rg-price"></span><span class="rg-tr"></span>';
      root.querySelector(".rg-ico").textContent = goodIcon(gid);
      const c = { root: root, tot: root.querySelector(".rg-tot"),
                  price: root.querySelector(".rg-price"), tr: root.querySelector(".rg-tr") };
      root.addEventListener("click", () => { if (openGood === gid) close(); else open(gid); });
      return c;
    }

    function refresh() {
      if (!gridEl) return;
      const M0 = M();
      if (!M0 || !running()) { gridEl.classList.add("hidden"); if (detailEl) detailEl.classList.add("hidden"); return; }
      gridEl.classList.remove("hidden");
      anchorBelowStrip();

      const prod = M0.producible(state);
      const sum  = M0.summary(state);
      const gids = Object.keys(CONFIG.goods).filter(g => prod[g]);

      const seen = new Set();
      let prev = null;
      for (const gid of gids) {
        seen.add(gid);
        let c = chips.get(gid);
        if (!c) { c = buildChip(gid); chips.set(gid, c); }
        if (c.root.parentNode !== chipsEl || c.root.previousElementSibling !== prev) {
          chipsEl.insertBefore(c.root, prev ? prev.nextElementSibling : chipsEl.firstChild);
        }
        prev = c.root;
        const s = sum[gid] || { total: 0, avg: CONFIG.goods[gid].basePrice, trend: 0 };
        c.tot.textContent = Math.round(s.total);
        c.price.textContent = (Math.round(s.avg * 10) / 10).toFixed(1);
        c.tr.className = "rg-tr " + (s.trend > 0 ? "up" : s.trend < 0 ? "down" : "flat");
        c.tr.textContent = s.trend > 0 ? "▲" : s.trend < 0 ? "▼" : "—";
        c.root.classList.toggle("active", gid === openGood);
      }
      for (const [gid, c] of chips) {
        if (!seen.has(gid)) { if (c.root.parentNode) c.root.parentNode.removeChild(c.root); chips.delete(gid); }
      }
      keepTutorialClear();
      // an open good that stopped being producible (e.g. new game) closes.
      if (openGood && !prod[openGood]) { close(); return; }
      if (openGood) refreshDetail();
    }

    // The grid is persistent and lives in the same left column as the transient
    // onboarding coach (#tutorial, CSS top:156px). When both are on screen, push
    // the coach just below the grid so they never overlap; otherwise restore the
    // coach to its CSS anchor. Defensive: no-op if the element is absent.
    // Sit the grid just under the top-left city strip (the kingdom-gold chip +
    // the city-cards row), whose height depends on whether any cities exist —
    // so the grid clears BOTH the chip and the cards without hard-coding widths.
    function anchorBelowStrip() {
      const strip = document.getElementById("cityStrip");
      if (!strip || !gridEl) return;
      const b = strip.getBoundingClientRect().bottom;
      gridEl.style.top = Math.max(96, Math.round(b) + 8) + "px";
    }

    function keepTutorialClear() {
      const tut = document.getElementById("tutorial");
      if (!tut || !gridEl) return;
      if (!tut.classList.contains("hidden") && !gridEl.classList.contains("hidden")) {
        const gb = gridEl.getBoundingClientRect().bottom;
        tut.style.top = Math.max(156, Math.round(gb) + 10) + "px";
      } else if (tut.style.top) {
        tut.style.top = "";
      }
    }

    function open(gid) {
      if (!CONFIG.goods[gid] || !detailEl) return;
      openGood = gid;
      detailEl.classList.remove("hidden");
      detailEl.setAttribute("aria-hidden", "false");
      if (rdDot) rdDot.style.background = goodColor(gid);
      if (rdName) rdName.textContent = goodIcon(gid) + " " + GOOD_LABEL(gid);
      for (const [g, c] of chips) c.root.classList.toggle("active", g === gid);
      refreshDetail();
    }
    function close() {
      openGood = null;
      if (detailEl) { detailEl.classList.add("hidden"); detailEl.setAttribute("aria-hidden", "true"); }
      for (const [, c] of chips) c.root.classList.remove("active");
    }

    function refreshDetail() {
      const M0 = M();
      if (!M0 || !openGood || !detailEl) return;
      const gid = openGood, base = CONFIG.goods[gid].basePrice;
      const s = M0.summary(state)[gid] || { total: 0, avg: base, capacity: 0, netRate: 0, trend: 0 };
      const cap = s.capacity || 0;
      const pct = cap > 0 ? Math.max(0, Math.min(100, (s.total / cap) * 100)) : 0;
      if (rdBar) rdBar.style.width = pct.toFixed(1) + "%";
      if (rdBarLbl) rdBarLbl.textContent = Math.round(s.total) + " / " + Math.round(cap);
      const rc = roleCounts(gid);
      // F/4: per-second display (2 ticks = 1 game-second) via UIDev's shared
      // perMin() helper (window.perMin, town-ui.js) rather than a local *TICKS_PER_SEC.
      const rate = (typeof perMin === "function") ? perMin(s.netRate || 0) : (s.netRate || 0);
      const rateCls = rate > 0.005 ? "up" : rate < -0.005 ? "down" : "";
      const rateStr = (rate > 0 ? "+" : "") + (Math.round(rate * 100) / 100).toFixed(2) + "/min";
      if (rdStats) rdStats.innerHTML =
        '<span class="k">Avg price</span><span class="v">' + (Math.round(s.avg * 10) / 10).toFixed(1) + ' g</span>' +
        '<span class="k">Net rate</span><span class="v ' + rateCls + '">' + esc(rateStr) + '</span>' +
        '<span class="k">Producers</span><span class="v">' + rc.producers + '</span>' +
        '<span class="k">Consumers</span><span class="v">' + rc.consumers + '</span>';
      drawChart(gid);
    }

    // Small dedicated line chart: avg-price series + a subtle basePrice ref line.
    function drawChart(gid) {
      const cv = rdChart;
      if (!cv || typeof cv.getContext !== "function") return;
      const g = cv.getContext("2d");
      const cw = cv.clientWidth || 238, ch = 96;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.fillStyle = "#150f09"; g.fillRect(0, 0, cw, ch);

      const M0 = M();
      const hist = (M0 && state.market && state.market.hist && state.market.hist[gid]) || [];
      const base = CONFIG.goods[gid].basePrice;
      const vals = [];
      for (let i = 0; i < hist.length; i++) { const v = hist[i] && hist[i].avg; if (typeof v === "number" && isFinite(v)) vals.push(v); }

      let min = base, max = base;
      for (let i = 0; i < vals.length; i++) { if (vals[i] < min) min = vals[i]; if (vals[i] > max) max = vals[i]; }
      if (max - min < 1e-6) { min -= 1; max += 1; }
      const span = max - min, pad = 5;
      const X = (i, n) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (cw - 2 * pad));
      const Y = (v) => ch - pad - ((v - min) / span) * (ch - 2 * pad);

      // basePrice reference (subtle dashed line)
      g.strokeStyle = "rgba(122,155,212,0.5)"; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(pad, Y(base)); g.lineTo(cw - pad, Y(base)); g.stroke(); g.setLineDash([]);

      // avg-price series
      if (vals.length >= 2) {
        g.strokeStyle = goodColor(gid); g.lineWidth = 1.5; g.lineJoin = "round"; g.beginPath();
        for (let i = 0; i < vals.length; i++) { const px = X(i, vals.length), py = Y(vals[i]); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
        g.stroke();
      } else if (vals.length === 1) {
        g.fillStyle = goodColor(gid); g.beginPath(); g.arc(X(0, 1), Y(vals[0]), 2.5, 0, Math.PI * 2); g.fill();
      }

      if (rdAxMin)  rdAxMin.textContent  = (Math.round(min * 10) / 10).toFixed(1);
      if (rdAxMax)  rdAxMax.textContent  = (Math.round(max * 10) / 10).toFixed(1);
      if (rdAxBase) rdAxBase.textContent = "base " + (Math.round(base * 10) / 10).toFixed(1);
    }

    if (toggleEl && gridEl) {
      toggleEl.addEventListener("click", () => {
        const col = gridEl.classList.toggle("collapsed");
        toggleEl.textContent = col ? "▸" : "▾";
      });
    }
    if (rdClose) rdClose.addEventListener("click", close);

    return {
      refresh: refresh, open: open, close: close,
      get openGood() { return openGood; },
    };
  })();
  window.MarketUI = MarketUI;
  // === KR-B END ===

  // Live refresh: keep treasury HUD + open castle panel current as prices/trade tick.
  updateTreasuryHud();
  CityCards.refresh();
  setInterval(() => { updateTreasuryHud(); CityCards.refresh(); if (castleOpen) renderCastlePanel(); }, 500);
  // KR-B: the resource grid patches on a calmer ~1 s cadence (independent of the
  // 500 ms HUD tick) — cheap, read-only, and refreshes the open detail chart too.
  MarketUI.refresh();
  setInterval(() => { MarketUI.refresh(); }, 1000);

  // Expose for the headless smoke test / console debugging.
  window.CastleUI = { openCastlePanel, closeCastlePanel, castleBuy, castleSell,
                      updateTreasuryHud, drawCarts, cartPixel,
                      // CP: re-render the open panel (used by updateProgressHud so the
                      // relocated prestige/castle-level stay live).
                      refresh: renderCastlePanel,
                      // CP hook for the CRE slice: push fn(state)->htmlString to add a
                      // section (e.g. research materials) to the castle panel body.
                      addPanelSection(fn) { if (typeof fn === "function") { castlePanelSections.push(fn); if (castleOpen) renderCastlePanel(); } },
                      get isOpen() { return castleOpen; } };

  // === RESEARCH CENTER (Slice C) === Research Center pipeline (Keep tab) —
  // rewritten for the Slice A/B material-metering model (no more node.cost /
  // timeTicks / R.spent / R.progress). Three explicit states: no Center (with a
  // "Place" button), Center under construction, and the normal metered pipeline
  // once built (material rows read live from state.research.consumed). Registered
  // through the CP addPanelSection hook so renderCastlePanel stays hook-driven.
  window.CastleUI.addPanelSection(function (st) {
    const GLYPH = { production: "⚒️", logistics: "🛞", administration: "📜" };
    let out = '<div class="rc-box"><div class="rc-title">📖 Research Center</div>';
    const rc = st.researchCenter;

    if (!rc) {
      const buildGold = (CONFIG.researchCenter.build && CONFIG.researchCenter.build.gold) || 0;
      out += '<div class="rc-idle">No Research Center — build one beside the castle to start researching.</div>' +
        '<button class="bp-star" data-place-rc>🏗 Place Research Center (' + fmt(buildGold) + 'g)</button>';
      return out + "</div>";
    }

    if (!rc.built) {
      const cost = (CONFIG.researchCenter.build && CONFIG.researchCenter.build.cost) || {};
      const need = (typeof Research !== "undefined" && Research.centerConstructionNeed) ? Research.centerConstructionNeed(st) : {};
      out += '<div class="rc-idle">Research Center under construction — materials are delivered from the King’s stock.</div>';
      out += '<div style="margin:4px 0 6px">' + bpUpgradeChips(cost, rc.delivered) + "</div>";
      const needStr = Object.keys(need).map(g => fmt(need[g]) + " " + goodIcon(g) + " " + GOOD_LABEL(g)).join(" · ");
      out += '<div class="rc-queue">' + (needStr ? "Still needs: " + esc(needStr) : "Almost done…") + "</div>";
      return out + "</div>";
    }

    const R = st.research || {};
    const node = (R.active && typeof Research !== "undefined") ? Research.get(R.active) : null;
    const speed = Research.centerSpeed(st);
    if (!node) {
      out += '<div class="rc-idle">The scholars are idle (Level ' + (rc.level || 1) + ' · ' + fmt(speed * 60) +
        '/min) — open the 🔬 Research tree to start a project.</div>';
    } else {
      const consumed = R.consumed || {};
      const mats = node.materials || {};
      const keys = Object.keys(mats);
      let matHtml = "";
      if (!keys.length) {
        matHtml = '<div class="rc-mat" style="opacity:.7">no materials needed</div>';
      } else {
        for (const gid of keys) {
          const have = Math.floor(consumed[gid] || 0), req = mats[gid];
          const done = have >= req;
          matHtml += '<div class="rc-mat' + (done ? " ok" : "") + '" title="' +
            esc(GOOD_LABEL(gid)) + ' — drawn from the King’s stock as the project runs">' +
            goodIcon(gid) + " <span>" + Math.min(have, req) + "/" + req + "</span>" +
            (done ? " ✓" : "") + "</div>";
        }
      }
      const pct = Math.round((Research.activeFraction ? Research.activeFraction(st) : 0) * 100);
      const glyph = node.kind === "unlock" ? "🏗" : node.kind === "upgrade" ? "⬆️" : (GLYPH[node.branch] || "🔬");
      out += '<div class="rc-flow">' +
        '<div class="rc-mats">' + matHtml + "</div>" +
        '<div class="rc-arrow">➜</div>' +
        '<div class="rc-book">📖<div class="bar"><span style="width:' + pct + '%"></span></div>' +
          '<div class="pct">' + pct + '%</div>' +
          '<div class="gold" title="Research speed from the Center’s level">' + fmt(speed * 60) + '/min</div></div>' +
        '<div class="rc-arrow">➜</div>' +
        '<div class="rc-node">' + glyph + '<div class="nm">' + esc(node.name) + "</div></div>" +
        "</div>";
    }
    const q = Array.isArray(R.queue) ? R.queue : [];
    const names = [];
    for (const id of q) { const n = (typeof Research !== "undefined") ? Research.get(id) : null; names.push(n ? n.name : id); }
    out += '<div class="rc-queue">' + (names.length ? "Next: " + esc(names.join(" · ")) : "Queue empty") + "</div>";
    if (rc.pendingUpgrade) {
      const upNeed = (typeof Research !== "undefined" && Research.centerUpgradeNeed) ? Research.centerUpgradeNeed(st) : {};
      const upStr = Object.keys(upNeed).map(g => fmt(upNeed[g]) + " " + goodIcon(g) + " " + GOOD_LABEL(g)).join(" · ");
      out += '<div class="rc-queue">⬆ Upgrading to Level ' + rc.pendingUpgrade.toLevel + (upStr ? " — needs " + esc(upStr) : "") + "</div>";
    }
    return out + "</div>";
  });
  // PP-C: tab switch exposed for the headless smoke / console debugging.
  window.CastleUI.setTab = cwSetTab;
  // === /PP-C ===

  // CRE: tiny test/debug surface for the headless smoke (state lives in this
  // closure and isn't otherwise reachable). Harmless during normal play.
  window.__cre = { get state() { return state; } };
  // === CARTS + CASTLE-UI END ===
