  // === RT-B TECH-TREE START === (full-screen tiered tech tree, DOM over canvas)
  // Replaces the old #researchPanel column list. Reads/writes state ONLY through
  // the pure Research module (+ scheduleSave); all balance/rules live in PURE_CORE.
  // Bands stack bottom-up (peasant → worker → citizen); kingdom is a side column.
  // Upgrade nodes render as PIP rows on their building's card, not as tree nodes.
  const btnResearch  = document.getElementById("btnResearch");
  const techTreeEl   = document.getElementById("techTree");
  const ttViewport   = document.getElementById("ttViewport");
  const ttSurface    = document.getElementById("ttSurface");
  const ttNodesEl    = document.getElementById("ttNodes");
  const ttEdgesEl    = document.getElementById("ttEdges");
  const ttQueueEl    = document.getElementById("ttQueue");
  const ttTipEl      = document.getElementById("ttTip");
  let techOpen = false;

  // Layout constants (px). Cards are CARD_W×CARD_H inside CELL_W×CELL_H grid slots.
  const TT = { CELL_W: 150, CELL_H: 132, CARD_W: 132, CARD_H: 74, PIP_W: 26, PIP_H: 30,
               QUEUE_W: 250, GAP: 30, BAND_LABEL_W: 44, BAND_PAD_Y: 34 };
  const TT_KINGDOM_LABEL_X = TT.QUEUE_W + TT.GAP;                       // 280
  const TT_KINGDOM_X0      = TT_KINGDOM_LABEL_X + TT.BAND_LABEL_W;      // 324
  const TT_KINGDOM_COLS    = 3;
  const TT_KINGDOM_END     = TT_KINGDOM_X0 + TT_KINGDOM_COLS * TT.CELL_W;
  const TT_POP_LABEL_X     = TT_KINGDOM_END + TT.GAP;
  const TT_POP_X0          = TT_POP_LABEL_X + TT.BAND_LABEL_W;
  const TT_POP_BANDS       = ["peasant", "worker", "burgher", "aristocrat"];   // === CC: bottom → top (aristocrat on top) ===
  const TT_BAND_TINT       = { peasant: "tt-band-peasant", worker: "tt-band-worker", burgher: "tt-band-citizen", aristocrat: "tt-band-aristocrat", kingdom: "tt-band-kingdom" };
  const TT_BAND_LABEL      = { peasant: "Peasants", worker: "Workers", burgher: "Citizens", aristocrat: "Aristocrats", kingdom: "Kingdom" };
  // The 5 startUnlocked buildings have no unlock node — synthesize anchor cards so
  // their upgrade pips have a home and the full starter row shows (like the ref).
  // === TV2: farm dropped from starters — it now has a real unlock_farm node ===
  // === TREELAYOUT: anchor cards (startUnlocked buildings) form the peasant
  // starter row (row 0, cols 0..3); their upgrade pips mirror these positions. ===
  const TT_STARTERS = [
    { id: "anchor_hut",         buildingId: "hut",         band: "peasant", pos: { col: 0, row: 0 }, name: "Hut" },
    { id: "anchor_lumberjack",  buildingId: "lumberjack",  band: "peasant", pos: { col: 1, row: 0 }, name: "Lumberjack" },
    { id: "anchor_potato_farm", buildingId: "potato_farm", band: "peasant", pos: { col: 2, row: 0 }, name: "Potato Farm" },
    { id: "anchor_sawmill",     buildingId: "sawmill",     band: "peasant", pos: { col: 3, row: 0 }, name: "Sawmill" },
  ];
  const TT_BUILDING_GLYPH = { hut: "🛖", lumberjack: "🪓", farm: "🌾", potato_farm: "🥔", sawmill: "🪚",
    quarry: "⛏️", fishery: "🎣", iron_mine: "⚒️", shepherd: "🐑", mill: "🌀",
    clay_pit: "🟫", coal_mine: "⬛", gold_mine: "🪙", brickworks: "🧱",
    cottage: "🏠", brewery: "🍺", bakery: "🍞", manor: "🏛️",
    // === CC ===
    tailoring: "🧵", charcoal_burner: "🪮", stonetool_maker: "⚒️", oil_maker: "🛢️",
    forge: "🔥", armory: "🛡️", pottery_workshop: "🏺", distillery: "🥃", goldsmith: "💍",
    lamp_maker: "🪔", carpentry: "🪑", luxury_tailor: "👗", aristocrat_home: "🏰" };
  const TT_KINGDOM_GLYPH = { production: "🏭", logistics: "🛣️", administration: "📜" };
  const TT_ROMAN = { 2: "II", 3: "III", 4: "IV" };

  const ttPos = new Map();   // node id → { x, y } (cards only; edges + pips read it)
  let ttSurfaceW = 0, ttSurfaceH = 0;
  let ttPanX = 0, ttPanY = 0, ttDragging = false, ttDragMoved = false, ttDragStart = null;
  let ttLastTip = null, ttEdgeSig = "";

  function ttGlyphFor(node) {
    if (!node) return "🔬";
    if (node.kind === "kingdom") return TT_KINGDOM_GLYPH[node.branch] || "📜";
    return TT_BUILDING_GLYPH[node.buildingId] || "🏭";
  }
  // === RESEARCH CENTER (Slice C) — rewritten for the Slice A/B material-metering
  // model (RSF's old node.timeTicks/state.research.progress no longer exist).
  // "Waiting" now covers two cases: no built Research Center at all (globally
  // paused, centerSpeed 0), or a built Center whose current second-boundary draw
  // can't be fully afforded from castleStock yet — mirrors Research.tick's own
  // per-second affordability check (pure read, no mutation).
  function ttWaitingOnMaterials(id) {
    if (!Research.isActive(state, id)) return false;
    if (Research.centerLevel(state) === 0) return true;   // no built Center → paused
    const node = Research.get(id); if (!node) return false;
    const M = node.materials || {};
    const gids = Object.keys(M);
    if (!gids.length) return false;
    const S = Research.centerSpeed(state);
    if (!S) return true;
    const R = state.research || {};
    const rate = Research.consumptionPlan(M, S).rate;
    const e = (R.completedSec || 0) + 1;
    const consumed = R.consumed || {};
    const stock = state.castleStock || {};
    for (const gid of gids) {
      const target = Math.min(M[gid], Math.floor(rate[gid] * e));
      const d = Math.max(0, target - (consumed[gid] || 0));
      if (d > 0 && (stock[gid] || 0) < d) return true;
    }
    return false;
  }
  // === /RESEARCH CENTER (Slice C) ===
  function ttNodeState(id) {
    if (Research.has(state, id)) return "done";
    if (Research.isActive(state, id)) return "researching";
    if (Research.isQueued(state, id)) return "queued";
    if (Research.isAvailable(state, id)) return "available";
    return "locked";
  }
  function ttBadge(id, s) {
    if (s === "done") return "✓";
    if (s === "researching") return ttWaitingOnMaterials(id) ? "⏳" : Math.round(Research.activeFraction(state) * 100) + "%";
    if (s === "queued") { const i = (state.research.queue || []).indexOf(id); return "#" + (i + 1); }
    if (s === "available") return "▶";   // RESEARCH CENTER (Slice C): materials shown in the tooltip, not a gold badge
    return "🔒";
  }

  // -- layout: rows per band (incl. starter anchors), so band slabs size to fit. --
  function ttRowsOf(band) {
    let max = 0;
    for (const n of Research.nodesInBand(band)) if (n.kind !== "upgrade") max = Math.max(max, n.pos.row);
    for (const s of TT_STARTERS) if (s.band === band) max = Math.max(max, s.pos.row);
    return max + 1;
  }

  function ttSig() {
    const R = state.research || {};
    return (R.active || "") + "|" + ((R.unlocked || []).length) + "|" + ((R.queue || []).length);
  }

  // Card HTML. `anchor` = synthesized starter (always-done, non-interactive).
  function ttCardEl(id, name, glyph, s, anchor) {
    const p = ttPos.get(id);
    if (!p) return "";
    const badge = anchor ? "✓" : ttBadge(id, s);
    const pct = (!anchor && s === "researching") ? Math.round(Research.activeFraction(state) * 100) : 0;
    const dataAttr = anchor ? `data-anchor="${id}"` : `data-node="${id}"`;
    const cls = anchor ? "tt-node done tt-anchor" : "tt-node " + s;
    return `<div class="${cls}" ${dataAttr} style="left:${p.x}px;top:${p.y}px;width:${TT.CARD_W}px;min-height:${TT.CARD_H}px">` +
      `<div class="tt-shield">${glyph}</div>` +
      `<div class="tt-name">${esc(name)}</div>` +
      `<div class="tt-badge">${badge}</div>` +
      `<div class="tt-prog"><span style="width:${pct}%"></span></div>` +
      `</div>`;
  }

  // Pip row above a building card — one pip per CONFIG.upgrades ladder level.
  function ttPipsHTML(buildingId, cardPos) {
    const ladder = (CONFIG.upgrades && CONFIG.upgrades[buildingId]) || [];
    if (!ladder.length || !cardPos) return "";
    let out = "";
    ladder.forEach((entry, i) => {
      const nid = "upg_" + buildingId + "_l" + entry.level;
      const s = ttNodeState(nid);
      const px = cardPos.x + i * (TT.PIP_W + 5);
      const py = cardPos.y - TT.PIP_H - 2;
      out += `<div class="tt-pip ${s}" data-node="${nid}" style="left:${px}px;top:${py}px">${TT_ROMAN[entry.level] || entry.level}</div>`;
    });
    return out;
  }

  // Full rebuild (on open): positions, band strips/labels, cards, pips, edges.
  function ttBuildLayout() {
    const rows = {}, bandH = {};
    for (const b of TT_POP_BANDS) { rows[b] = ttRowsOf(b); bandH[b] = rows[b] * TT.CELL_H + TT.BAND_PAD_Y * 2; }
    const H = TT_POP_BANDS.reduce((s, b) => s + bandH[b], 0);
    const bandTops = {}; let y = H;
    for (const b of TT_POP_BANDS) { bandTops[b] = y - bandH[b]; y -= bandH[b]; }   // first (peasant) → bottom

    let maxCol = 0;
    for (const b of TT_POP_BANDS) for (const n of Research.nodesInBand(b)) if (n.kind !== "upgrade") maxCol = Math.max(maxCol, n.pos.col);
    for (const s of TT_STARTERS) maxCol = Math.max(maxCol, s.pos.col);
    ttSurfaceW = TT_POP_X0 + (maxCol + 1) * TT.CELL_W + TT.GAP;
    ttSurfaceH = H;
    ttSurface.style.width = ttSurfaceW + "px";
    ttSurface.style.height = ttSurfaceH + "px";

    // positions (cards only)
    ttPos.clear();
    for (const n of Research.nodesInBand("kingdom"))
      ttPos.set(n.id, { x: TT_KINGDOM_X0 + n.pos.col * TT.CELL_W, y: TT.BAND_PAD_Y + n.pos.row * TT.CELL_H });
    for (const b of TT_POP_BANDS) for (const n of Research.nodesInBand(b)) {
      if (n.kind === "upgrade") continue;
      ttPos.set(n.id, { x: TT_POP_X0 + n.pos.col * TT.CELL_W, y: bandTops[b] + TT.BAND_PAD_Y + n.pos.row * TT.CELL_H });
    }
    for (const s of TT_STARTERS)
      ttPos.set(s.id, { x: TT_POP_X0 + s.pos.col * TT.CELL_W, y: bandTops[s.band] + TT.BAND_PAD_Y + s.pos.row * TT.CELL_H });

    // markup
    let html = "";
    html += `<div class="tt-band ${TT_BAND_TINT.kingdom}" style="left:${TT_KINGDOM_LABEL_X}px;top:0;width:${TT_KINGDOM_END - TT_KINGDOM_LABEL_X}px;height:${H}px"></div>`;
    html += `<div class="tt-band-label" style="left:${TT_KINGDOM_LABEL_X}px;top:0;width:${TT.BAND_LABEL_W}px;height:${H}px">${TT_BAND_LABEL.kingdom}</div>`;
    for (const b of TT_POP_BANDS) {
      html += `<div class="tt-band ${TT_BAND_TINT[b]}" style="left:${TT_POP_LABEL_X}px;top:${bandTops[b]}px;width:${ttSurfaceW - TT_POP_LABEL_X - TT.GAP}px;height:${bandH[b]}px"></div>`;
      html += `<div class="tt-band-label" style="left:${TT_POP_LABEL_X}px;top:${bandTops[b]}px;width:${TT.BAND_LABEL_W}px;height:${bandH[b]}px">${TT_BAND_LABEL[b]}</div>`;
    }
    for (const n of Research.nodesInBand("kingdom"))
      html += ttCardEl(n.id, n.name, ttGlyphFor(n), ttNodeState(n.id), false);
    for (const b of TT_POP_BANDS) for (const n of Research.nodesInBand(b)) {
      if (n.kind === "upgrade") continue;
      html += ttCardEl(n.id, n.name, ttGlyphFor(n), ttNodeState(n.id), false);
      html += ttPipsHTML(n.buildingId, ttPos.get(n.id));
    }
    for (const s of TT_STARTERS) {
      html += ttCardEl(s.id, s.name, TT_BUILDING_GLYPH[s.buildingId] || "🏠", "done", true);
      html += ttPipsHTML(s.buildingId, ttPos.get(s.id));
    }
    ttNodesEl.innerHTML = html;
    ttBuildEdges();
  }

  // Prerequisite edges (one SVG, card-level only). Rebuilt on open + state change.
  function ttBuildEdges() {
    const active = state.research && state.research.active;
    const cards = Research.nodesInBand("kingdom").concat(
      TT_POP_BANDS.reduce((acc, b) => acc.concat(Research.nodesInBand(b).filter(n => n.kind !== "upgrade")), []));
    let parts = "";
    for (const n of cards) {
      const to = ttPos.get(n.id); if (!to) continue;
      for (const pid of (n.prereqs || [])) {
        const from = ttPos.get(pid); if (!from) continue;
        const x1 = from.x + TT.CARD_W / 2, y1 = from.y + TT.CARD_H / 2;
        const x2 = to.x + TT.CARD_W / 2, y2 = to.y + TT.CARD_H / 2;
        let cls = "";
        if (n.id === active || pid === active) cls = "tt-edge-active";
        else if (Research.has(state, n.id) && Research.has(state, pid)) cls = "tt-edge-done";
        parts += `<path d="M${x1},${y1} L${x2},${y2}" class="${cls}"></path>`;
      }
    }
    ttEdgesEl.setAttribute("width", ttSurfaceW);
    ttEdgesEl.setAttribute("height", ttSurfaceH);
    ttEdgesEl.innerHTML = parts;
    ttEdgeSig = ttSig();
  }

  // Cheap per-interval patch: state classes + badges + progress (no full rebuild).
  function ttRebuildStates() {
    const els = ttNodesEl.querySelectorAll("[data-node]");
    els.forEach(el => {
      const id = el.dataset.node;
      const s = ttNodeState(id);
      if (el.classList.contains("tt-pip")) { el.className = "tt-pip " + s; return; }
      el.className = "tt-node " + s;
      const badge = el.querySelector(".tt-badge");
      if (badge) badge.textContent = ttBadge(id, s);
      const prog = el.querySelector(".tt-prog > span");
      if (prog) prog.style.width = (s === "researching" ? Math.round(Research.activeFraction(state) * 100) : 0) + "%";
    });
  }

  function ttRenderQueue() {
    // While the cursor is inside the queue panel, skip the innerHTML rebuild —
    // replacing the hovered card would destroy the tooltip mid-hover. Clicks
    // re-render explicitly, so the panel never goes stale for long.
    if (ttQueueEl.matches(":hover")) return;
    const R = state.research || {};
    let html = `<h3>Research Queue</h3>`;
    if (R.active) {
      const node = Research.get(R.active);
      const frac = Research.activeFraction(state);
      const qWaiting = ttWaitingOnMaterials(R.active);
      const noCenter = Research.centerLevel(state) === 0;
      // RESEARCH CENTER (Slice C): per-material consumed/required rows replace the
      // old node.cost/R.spent gold installment line (Slice A/B has no gold cost).
      const mats = node.materials || {};
      const consumed = R.consumed || {};
      const matRows = Object.keys(mats).map(gid =>
        `<span style="margin-right:8px">${goodIcon(gid)} ${Math.floor(consumed[gid] || 0)}/${mats[gid]}</span>`).join("") ||
        "no materials needed";
      html += `<div class="tt-qactive" data-node="${R.active}">` +
        `<div class="lbl"><span>Researching <b>${esc(node.name)}</b></span><span>${qWaiting ? "⏳" : Math.round(frac * 100) + "%"}</span></div>` +
        (noCenter ? `<div style="font-size:11px;color:#e0b34c;margin:3px 0">⏳ Paused — build a Research Center to resume</div>` :
          qWaiting ? `<div style="font-size:11px;color:#e0b34c;margin:3px 0">⏳ Waiting for materials — royal buyers are fetching them from your cities</div>` : "") +
        `<div class="tt-qbar"><span style="width:${Math.round(frac * 100)}%"></span></div>` +
        `<div style="font-size:11px;opacity:.75;margin-top:5px">${matRows}</div></div>`;
    }
    const q = Array.isArray(R.queue) ? R.queue : [];
    if (q.length) {
      q.forEach((id, i) => {
        const node = Research.get(id); if (!node) return;
        html += `<div class="tt-qcard" data-node="${id}">` +
          `<span class="tt-qn">#${i + 1}</span><span>${ttGlyphFor(node)}</span>` +
          `<span class="tt-qname">${esc(node.name)}</span>` +
          `<button class="tt-qx" data-dq="${id}" title="Remove from queue">✕</button></div>`;
      });
    } else if (!R.active) {
      html += `<div class="tt-qempty">Click an available node to research it; click more to queue them up.</div>`;
    } else {
      html += `<div class="tt-qempty">Queue is empty — click more available nodes to line up the next projects.</div>`;
    }
    ttQueueEl.innerHTML = html;
  }

  // Shared tooltip (nodes, pips, queue entries all key by node id).
  function ttTooltipHTML(id) {
    const node = Research.get(id); if (!node) return "";
    const s = ttNodeState(id);
    let eff;
    if (node.kind === "unlock") { const b = CONFIG.buildings[node.buildingId]; eff = "Unlocks the " + (b ? b.name : node.buildingId); }
    else if (node.kind === "upgrade") {
      const entry = (typeof Buildings.upgradeAt === "function") ? Buildings.upgradeAt(node.buildingId, node.level) : null;
      const b = CONFIG.buildings[node.buildingId];
      const sum = (entry && typeof bpEffectSummary === "function") ? bpEffectSummary(entry.effect) : "";
      eff = (b ? b.name : node.buildingId) + " Lv" + node.level + (sum ? ": " + sum : "");
    } else eff = node.desc || "";
    const waiting = ttWaitingOnMaterials(id);
    const noCenter = Research.centerLevel(state) === 0;
    const curTxt = (noCenter && Research.isActive(state, id)) ? "Paused — needs a Research Center" :
      waiting ? "Waiting for materials — the King's buyers purchase them from cities" :
      { done: "Finished", researching: "In Progress",
      queued: "Queued (#" + (((state.research.queue || []).indexOf(id)) + 1) + ")",
      available: "Available", locked: "Locked" }[s] || s;
    void 0;
    let html = `<div class="tt-tip-name">${esc(node.name)}</div><div>${esc(eff)}</div>`;
    if (Research.isActive(state, id)) html += `<div>Progress: ${Math.round(Research.activeFraction(state) * 100)}%</div>`;
    html += `<div>Currently: ${curTxt}</div>`;
    // RESEARCH CENTER (Slice C): materials only — no gold cost (Slice A/B removed
    // node.cost/timeTicks as the pacing model; a node's price is its materials).
    if (noCenter) html += `<div style="color:#e0b34c">⏳ Paused — needs a Research Center</div>`;
    const mats = node.materials || {};
    const active = Research.isActive(state, id);
    const consumed = (active && state.research && state.research.consumed) || {};
    for (const gid in mats) {
      const qty = mats[gid];
      // while active, show live consumed/required progress per material
      const qtyTxt = active ? (Math.min(qty, Math.floor(consumed[gid] || 0)) + "/" + qty) : String(qty);
      html += `<div><span class="tt-dot" style="background:${goodColor(gid)}"></span>${goodIcon(gid)} ${esc(GOOD_LABEL(gid))} ${qtyTxt}</div>`;
    }
    return html;
  }
  function ttPositionTip(ev) {
    const pad = 14; let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = ttTipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 6) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 6) y = ev.clientY - r.height - pad;
    ttTipEl.style.left = Math.max(6, x) + "px";
    ttTipEl.style.top = Math.max(6, y) + "px";
  }
  function ttShowTip(id, ev) {
    if (!Research.get(id)) { ttHideTip(); return; }
    if (id !== ttLastTip) { ttTipEl.innerHTML = ttTooltipHTML(id); ttLastTip = id; }
    ttTipEl.classList.remove("hidden");
    ttPositionTip(ev);
  }
  function ttHideTip() { ttTipEl.classList.add("hidden"); ttLastTip = null; }

  // Click an AVAILABLE node/pip → start (nothing active) or enqueue; QUEUED → dequeue.
  function ttActivateNode(id) {
    const s = ttNodeState(id);
    let changed = false;
    if (s === "available") {
      changed = (state.research && state.research.active) ? Research.enqueue(state, id) : Research.start(state, id);
      // Start can fail (e.g. treasury can't cover the cost yet) — fall back to
      // enqueueing so the click never silently does nothing.
      if (!changed && !(state.research && state.research.active)) changed = Research.enqueue(state, id);
    } else if (s === "queued") {
      changed = Research.dequeue(state, id);
    }
    if (changed) { ttRebuildStates(); ttRenderQueue(); ttBuildEdges(); scheduleSave(); }
  }

  ttNodesEl.addEventListener("click", (e) => {
    if (ttDragMoved) return;                       // swallow the click that ends a pan
    const el = e.target.closest("[data-node]");
    if (el) ttActivateNode(el.dataset.node);
  });
  ttNodesEl.addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-node]");
    if (el && !ttDragging) ttShowTip(el.dataset.node, e); else ttHideTip();
  });
  ttNodesEl.addEventListener("mouseleave", ttHideTip);

  ttQueueEl.addEventListener("click", (e) => {
    const x = e.target.closest("[data-dq]");
    if (x) { if (Research.dequeue(state, x.dataset.dq)) { ttRebuildStates(); ttRenderQueue(); ttBuildEdges(); scheduleSave(); } return; }
    const card = e.target.closest(".tt-qcard[data-node]");
    if (card) { if (Research.dequeue(state, card.dataset.node)) { ttRebuildStates(); ttRenderQueue(); ttBuildEdges(); scheduleSave(); } }
  });
  ttQueueEl.addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-node]");
    if (el) ttShowTip(el.dataset.node, e); else ttHideTip();
  });
  ttQueueEl.addEventListener("mouseleave", ttHideTip);

  // Drag-to-pan the surface (mirrors the canvas pattern; 3px threshold so a
  // click on a node still fires when the pointer didn't actually pan).
  function ttApplyPan() { ttSurface.style.transform = `translate(${ttPanX}px,${ttPanY}px)`; }
  function ttResetPan() {
    ttPanX = 0;
    const vh = ttViewport.clientHeight || window.innerHeight;
    ttPanY = ttSurfaceH > vh ? (vh - ttSurfaceH) : 0;   // show the bottom (peasant band)
    ttApplyPan();
  }
  // Panning is done purely via CSS transform, so the viewport's native scroll must
  // stay pinned at 0 — otherwise a click on a partially-offscreen node triggers the
  // browser's scroll-into-view, which shifts the whole surface out from under us.
  ttViewport.addEventListener("scroll", () => {
    if (ttViewport.scrollLeft || ttViewport.scrollTop) { ttViewport.scrollLeft = 0; ttViewport.scrollTop = 0; }
  });
  ttViewport.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    ttDragging = true; ttDragMoved = false;
    ttDragStart = { x: e.clientX, y: e.clientY, px: ttPanX, py: ttPanY };
    ttViewport.classList.add("grabbing");
  });
  window.addEventListener("mousemove", (e) => {
    if (!ttDragging) return;
    const dx = e.clientX - ttDragStart.x, dy = e.clientY - ttDragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) ttDragMoved = true;
    ttPanX = ttDragStart.px + dx; ttPanY = ttDragStart.py + dy;
    ttApplyPan();
  });
  window.addEventListener("mouseup", () => {
    if (!ttDragging) return;
    ttDragging = false; ttViewport.classList.remove("grabbing");
    setTimeout(() => { ttDragMoved = false; }, 0);   // reset AFTER the click handler runs
  });

  function openTechTree() {
    if (window.TownUI && typeof window.TownUI.closeTownPanel === "function") window.TownUI.closeTownPanel();
    if (typeof closeCastlePanel === "function") closeCastlePanel();
    if (window.BuildingUI && typeof window.BuildingUI.closeBuildingPanel === "function") window.BuildingUI.closeBuildingPanel();
    if (window.KingdomUI && typeof window.KingdomUI.closeKingdom === "function") window.KingdomUI.closeKingdom();
    techOpen = true;
    techTreeEl.classList.remove("hidden");
    techTreeEl.setAttribute("aria-hidden", "false");
    btnResearch.classList.add("active");
    ttBuildLayout();
    ttRenderQueue();
    ttResetPan();
  }
  function closeTechTree() {
    techOpen = false;
    techTreeEl.classList.add("hidden");
    techTreeEl.setAttribute("aria-hidden", "true");
    btnResearch.classList.remove("active");
    ttHideTip();
    // Research completed in-tree may have unlocked build categories/buildings —
    // refresh the bar now rather than on the next bar interaction.
    if (window.TownUI && TownUI.refreshCatButtons) TownUI.refreshCatButtons();
  }
  function toggleTechTree() { techOpen ? closeTechTree() : openTechTree(); }

  btnResearch.addEventListener("click", toggleTechTree);
  document.getElementById("ttClose").addEventListener("click", closeTechTree);
  // Esc closes; R resets pan (ignored while typing in a field).
  window.addEventListener("keydown", (e) => {
    if (!techOpen) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "Escape") { e.stopPropagation(); closeTechTree(); }
    else if (e.key === "r" || e.key === "R") { ttResetPan(); }
  });

  // Live refresh: cheap state/badge patch + queue each ~500ms; edges only on change.
  setInterval(() => {
    if (!techOpen) return;
    ttRebuildStates();
    ttRenderQueue();
    if (ttSig() !== ttEdgeSig) ttBuildEdges();
  }, 500);

  // Expose for the headless smoke / console (old names aliased so nothing breaks).
  window.ResearchUI = { openTechTree, closeTechTree, toggleTechTree,
    openResearchPanel: openTechTree, closeResearchPanel: closeTechTree, toggleResearchPanel: toggleTechTree,
    get isOpen() { return techOpen; } };
  // === RT-B TECH-TREE END ===
