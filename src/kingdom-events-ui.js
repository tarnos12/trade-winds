  // === KINGDOM/EVENTS-UI START === (P4-C / slot #4 — kingdom screen, town alerts,
  // random-event notifications). All DOM + canvas; reads the pure state produced by
  // Events.tick. drawAlerts()/handleEventNotice() are function declarations so the
  // render loop + accumulator (defined earlier) can call them via hoisting.
  const kingdomEl = document.getElementById("kingdomPanel");
  const kwBodyEl = document.getElementById("kwBody");
  const kwBannerEl = document.getElementById("kwBanner");
  const eventChipEl = document.getElementById("eventChip");
  const toastsEl = document.getElementById("toasts");
  let kingdomOpen = false;
  let kwSort = { key: "id", dir: 1 };

  const goodLabel = (id) => id ? id.charAt(0).toUpperCase() + id.slice(1) : "—";

  // ---- town alerts (canvas icons over a town in a bad state) --------------
  // Cheap: a couple of sums per town, derived from state each frame. Icons scale
  // with the world transform (so they shrink when zoomed out) and fade far out.
  function townAlertIcons(t, N) {
    const out = [];
    if (!t || !t.pop) return out;
    const pop = t.pop;
    const total = (pop.peasants || 0) + (pop.workers || 0) + (pop.burghers || 0) + (pop.aristocrats || 0);  // === CC ===
    const stock = t.stock || {};
    // 1. food shortage — less than ~4 ticks of the peasant staple (potato) buffer.
    // === CC: peasant per-capita lives under N.tiers.peasants.perCapita now. ===
    const peaRates = N && N.tiers && N.tiers.peasants && N.tiers.peasants.perCapita;
    if (total > 0 && peaRates) {
      const potato = stock.potato || 0;
      const perTick = (peaRates.potato || 0) * total;
      if (perTick > 0 && potato < perTick * 4) out.push("🍽");
    }
    // 2. idle producer — a building with worker slots but no assigned labour
    if (Array.isArray(t.buildings)) {
      for (const b of t.buildings) {
        const def = CONFIG.buildings[b.typeId];
        if (def && def.output && def.workerSlots > 0 && !(b.workers > 0)) { out.push("🚧"); break; }
      }
    }
    // 3. near-starve / very unhappy town
    if (total > 0 && typeof t.happiness === "number" && t.happiness < 25) out.push("💀");
    return out;
  }

  function drawAlerts() {
    const towns = state.towns || [];
    if (!towns.length) return;
    const alpha = Math.max(0, Math.min(1, (state.zoom - 0.4) / 0.35));
    if (alpha <= 0.02) return;                      // too far out — skip entirely
    const N = CONFIG.needs;
    const fs = Math.round(SIZE * 0.5);
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = fs + "px 'Segoe UI Emoji', system-ui, sans-serif";
    for (const t of towns) {
      const icons = townAlertIcons(t, N);
      if (!icons.length) continue;
      const p = HexMath.hexToPixel(t.q, t.r, SIZE);
      const y = p.y - SIZE * 0.95;
      const gap = SIZE * 0.62;
      const x0 = p.x - gap * (icons.length - 1) / 2;
      for (let i = 0; i < icons.length; i++) {
        const x = x0 + i * gap;
        ctx.globalAlpha = alpha * 0.8;              // legibility badge behind the glyph
        ctx.fillStyle = "rgba(18,14,8,0.78)";
        ctx.beginPath(); ctx.arc(x, y, SIZE * 0.33, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillText(icons[i], x, y + fs * 0.06);
      }
    }
    ctx.restore();
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  // ---- kingdom screen (all-towns table) ----------------------------------
  // Biggest surplus / shortage good, by stock-vs-demand ratio (same model as the
  // price engine): high ratio = surplus, low ratio (with real demand) = shortage.
  function biggestExtremes(t) {
    const stock = t.stock || {}, demand = t.demand || {};
    const buffer = CONFIG.econ.bufferTarget, floor = CONFIG.econ.minDemand;
    let surplus = null, surRatio = -Infinity, shortage = null, shoRatio = Infinity;
    for (const gid in CONFIG.goods) {
      const s = stock[gid] || 0;
      const d = Math.max(floor, demand[gid] || 0);
      const ratio = s / (d * buffer);
      if (s > 0 && ratio > surRatio) { surRatio = ratio; surplus = gid; }
      if ((demand[gid] || 0) > 0 && ratio < shoRatio) { shoRatio = ratio; shortage = gid; }
    }
    return { surplus, shortage };
  }

  function townMetrics(t) {
    const pop = t.pop || {};
    const peasants = Math.round(pop.peasants || 0);
    const workers = Math.round(pop.workers || 0);
    const burghers = Math.round(pop.burghers || 0);
    const aristocrats = Math.round(pop.aristocrats || 0);   // === CC ===
    const ex = biggestExtremes(t);
    return { name: "Town #" + t.id, id: t.id, level: t.level || 1,
      peasants, workers, burghers, aristocrats, total: peasants + workers + burghers + aristocrats,
      happiness: Math.round(t.happiness || 0), gold: Math.round(t.gold || 0),
      surplus: ex.surplus, shortage: ex.shortage };
  }

  const KW_COLS = [
    ["name", "Town"], ["level", "Lv"], ["peasants", "Peas."], ["workers", "Work."],
    ["burghers", "Citiz."], ["aristocrats", "Arist."], ["total", "Pop"], ["happiness", "Happy"], ["gold", "Gold"],
    ["surplus", "Top surplus"], ["shortage", "Top shortage"],
  ];

  // === RESEARCH CENTER (Slice C) — Kingdom Overview research header block, above
  // the towns table. Same three states as the Keep-tab rc-box (no Center / under
  // construction / metered pipeline), condensed into a compact progress bar +
  // per-material consumed/required rows (state.research.consumed vs node.materials).
  function kwResearchBlockHTML() {
    const rc = state.researchCenter;
    let html = '<div class="rc-box" style="margin-top:0"><div class="rc-title">📖 Research</div>';
    if (!rc) {
      html += '<div class="rc-idle">No Research Center — build one from the Keep tab to start researching.</div>';
      return html + "</div>";
    }
    if (!rc.built) {
      const cost = (CONFIG.researchCenter.build && CONFIG.researchCenter.build.cost) || {};
      html += '<div class="rc-idle">Research Center under construction.</div>';
      html += '<div style="margin:4px 0 6px">' + bpUpgradeChips(cost, rc.delivered) + "</div>";
      return html + "</div>";
    }
    const R = state.research || {};
    const node = R.active ? Research.get(R.active) : null;
    const speed = Research.centerSpeed(state);
    if (!node) {
      html += '<div class="rc-idle">Idle — Level ' + (rc.level || 1) + ' · ' + fmt(speed * 60) +
        '/min. Open the tech tree to start a project.</div>';
      return html + "</div>";
    }
    const pct = Math.round(Research.activeFraction(state) * 100);
    const mats = node.materials || {};
    const consumed = R.consumed || {};
    let matRows = "";
    for (const gid in mats) {
      const have = Math.floor(consumed[gid] || 0), req = mats[gid];
      matRows += `<div class="tp-row"><span class="k">${goodIcon(gid)} ${esc(GOOD_LABEL(gid))}</span><span class="v">${have}/${req}</span></div>`;
    }
    html += `<div class="tp-row"><span class="k">Researching</span><span class="v">${esc(node.name)}</span></div>`;
    html += `<div class="rc-book" style="text-align:left;min-width:0;margin:4px 0"><div class="bar"><span style="width:${pct}%"></span></div><div class="pct">${pct}%</div></div>`;
    html += matRows;
    return html + "</div>";
  }
  // === /RESEARCH CENTER (Slice C) ===

  function renderKingdom() {
    if (!kingdomOpen) return;
    renderEventBanner();
    const researchHtml = kwResearchBlockHTML();   // RESEARCH CENTER (Slice C)
    const rows = (state.towns || []).map(townMetrics);
    const k = kwSort.key, dir = kwSort.dir;
    rows.sort((a, b) => {
      const av = a[k], bv = b[k];
      if (typeof av === "string" || typeof bv === "string")
        return dir * String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
      return dir * ((av || 0) - (bv || 0));
    });
    if (!rows.length) { kwBodyEl.innerHTML = researchHtml + '<div class="kw-empty">No towns yet — place a town to see it here.</div>'; return; }
    const head = KW_COLS.map(c =>
      `<th data-sort="${c[0]}">${c[1]}${kwSort.key === c[0] ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("");
    const trs = rows.map(r => `<tr>
      <td>${esc(r.name)}</td><td>${r.level}</td>
      <td>${Math.round(r.peasants)}</td><td>${Math.round(r.workers)}</td><td>${Math.round(r.burghers)}</td><td>${Math.round(r.aristocrats)}</td><td>${Math.round(r.total)}</td>
      <td>${r.happiness}%</td><td>${fmt(r.gold)}g</td>
      <td class="kw-good up">${esc(goodLabel(r.surplus))}</td>
      <td class="kw-good down">${esc(goodLabel(r.shortage))}</td></tr>`).join("");
    kwBodyEl.innerHTML = researchHtml + `<table class="kw-tbl"><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  kwBodyEl.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (kwSort.key === key) kwSort.dir *= -1; else { kwSort.key = key; kwSort.dir = key === "name" ? 1 : -1; }
    renderKingdom();
  });

  function openKingdom() {
    // Panel exclusivity: same precedent as openTechTree's guards above — closing
    // the Tech Tree here covers both the button and the 'k' hotkey path
    // (toggleKingdom -> openKingdom) in one place, so Kingdom can't open stacked
    // underneath an already-open Tech Tree.
    if (typeof closeTechTree === "function" && techOpen) closeTechTree();
    kingdomOpen = true;
    kingdomEl.classList.remove("hidden");
    kingdomEl.setAttribute("aria-hidden", "false");
    renderKingdom();
  }
  function closeKingdom() {
    kingdomOpen = false;
    kingdomEl.classList.add("hidden");
    kingdomEl.setAttribute("aria-hidden", "true");
  }
  function toggleKingdom() { kingdomOpen ? closeKingdom() : openKingdom(); }

  document.getElementById("btnKingdom").addEventListener("click", toggleKingdom);
  document.getElementById("kwClose").addEventListener("click", closeKingdom);
  window.addEventListener("keydown", (e) => {
    // Editor overlay open: don't let 'k' leak into the game underneath (see
    // the matching guard/comment on the speed/WASD handler above).
    if ((window.EditorOverlay && window.EditorOverlay.isOpen()) || (window.MissionEditorOverlay && window.MissionEditorOverlay.isOpen()) || (window.BalanceLab && window.BalanceLab.isOpen())) return;
    if (e.key === "k" || e.key === "K") {
      const el = document.activeElement;
      if (el && el.tagName === "INPUT") return;     // don't hijack the seed field
      toggleKingdom();
    }
  });

  // ---- event banner / chip / toasts --------------------------------------
  function currentEventDef() {
    const e = state.event;
    if (!e) return null;
    const def = CONFIG.events && CONFIG.events.defs[e.id];
    return def ? { def, e } : null;
  }
  function eventText(def, e) {
    let d = def.desc;
    if (e.id === "craze" && e.goodId) d = "Everyone wants " + goodLabel(e.goodId) + " — its demand triples.";
    return def.name + " — " + d + " · " + Math.max(0, e.ticksLeft | 0) + " ticks left";
  }
  function renderEventBanner() {
    const cur = currentEventDef();
    if (cur) { kwBannerEl.classList.remove("hidden"); kwBannerEl.innerHTML = (cur.def.icon || "✨") + " " + esc(eventText(cur.def, cur.e)); }
    else { kwBannerEl.classList.add("hidden"); kwBannerEl.textContent = ""; }
  }
  function updateEventChip() {
    const cur = currentEventDef();
    if (cur) { eventChipEl.classList.add("show"); eventChipEl.textContent = (cur.def.icon || "✨") + " " + cur.def.name; }
    else { eventChipEl.classList.remove("show"); eventChipEl.textContent = ""; }
  }

  function showToast(msg) {
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    toastsEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 320); }, 4200);
  }

  // Called from the economy accumulator when Events.tick flags a start/end.
  function handleEventNotice(notice) {
    if (!notice) return;
    const def = CONFIG.events.defs[notice.id];
    const label = def ? (def.icon + " " + def.name) : notice.id;
    if (notice.type === "start") {
      let extra = "";
      if (notice.id === "craze" && state.event && state.event.goodId) extra = " (" + goodLabel(state.event.goodId) + ")";
      showToast(label + extra + " has begun!");
      SFX.play("event", (def ? def.name : notice.id) + " begins");
      if (window.EventLog) window.EventLog.push(def ? def.icon : "✨", (def ? def.name : notice.id) + extra + " began");
    } else {
      showToast(label + " has ended.");
      if (window.EventLog) window.EventLog.push(def ? def.icon : "✨", (def ? def.name : notice.id) + " ended");
    }
    updateEventChip();
    if (kingdomOpen) renderKingdom();
  }

  // Keep the chip + open kingdom panel current as the economy ticks.
  updateEventChip();
  setInterval(() => { updateEventChip(); if (kingdomOpen) renderKingdom(); }, 500);

  // === EVENT LOG === Let-Them-Trade-style bottom-right feed. One collapsible
  // panel funnels notable happenings (kingdom events, research completed, town/
  // castle level-ups, victory) instead of scattering toasts/debug. Self-contained:
  // builds its own DOM, reads state READ-ONLY, exposes window.EventLog.push.
  const EventLog = (function () {
    const MAX = 40;
    const wrap = document.createElement("div");
    wrap.id = "eventLog"; wrap.className = "collapsed";
    wrap.innerHTML =
      '<div class="el-head"><span class="el-title">📜 Event Log</span>' +
      '<button class="el-toggle" title="Show / hide" aria-label="Toggle event log">▲</button></div>' +
      '<ul class="el-list"></ul>';
    document.body.appendChild(wrap);
    const listEl = wrap.querySelector(".el-list");
    const toggleBtn = wrap.querySelector(".el-toggle");
    const headEl = wrap.querySelector(".el-head");
    const entries = [];
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    function relTime(t) {
      const s = Math.max(0, ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t) / 1000);
      if (s < 60) return "now";
      const m = Math.floor(s / 60); return m + " min";
    }
    function render() {
      if (!entries.length) { listEl.innerHTML = '<li class="el-empty">Nothing yet — found a town to begin.</li>'; return; }
      let html = "";
      for (const e of entries) html += '<li><span class="el-ic">' + e.icon + '</span><span class="el-tx">' +
        esc(e.text) + '</span><span class="el-tm">' + relTime(e.t) + '</span></li>';
      listEl.innerHTML = html;
    }
    function push(icon, text) {
      entries.unshift({ icon: icon || "•", text: String(text), t: (typeof performance !== "undefined" ? performance.now() : Date.now()) });
      if (entries.length > MAX) entries.length = MAX;
      render();
    }
    function setCollapsed(v) { wrap.classList.toggle("collapsed", v); toggleBtn.textContent = v ? "▲" : "▼"; }
    headEl.addEventListener("click", () => setCollapsed(!wrap.classList.contains("collapsed")));
    setInterval(render, 15000);   // refresh the "x min" labels
    render();
    return { push: push, setCollapsed: setCollapsed };
  })();
  window.EventLog = EventLog;

  // Feed the log from state deltas (read-only poll): research completions,
  // town level-ups, castle upgrades, and victory.
  (function () {
    let rSeen = null, lvls = {}, castleSeen = null, wonSeen = false;
    function nameOf(id) {
      const list = (CONFIG.research && (CONFIG.research.nodes || CONFIG.research)) || [];
      if (Array.isArray(list)) for (const n of list) if (n && n.id === id) return n.name || n.title || id;
      return id;
    }
    setInterval(function () {
      if (typeof state !== "object" || !state) return;
      const done = (state.research && Array.isArray(state.research.unlocked)) ? state.research.unlocked : null;
      if (done) {
        if (rSeen === null) rSeen = new Set(done);
        else for (const id of done) if (!rSeen.has(id)) { rSeen.add(id); EventLog.push("🔬", "Researched " + nameOf(id)); }
      }
      for (const t of (state.towns || [])) {
        const prev = (t.id in lvls) ? lvls[t.id] : (t.level || 1);
        if ((t.level || 1) > prev) EventLog.push("⬆", (t.name || "A town") + " reached level " + t.level);
        lvls[t.id] = t.level || 1;
      }
      if (castleSeen === null) castleSeen = state.castleLevel || 1;
      else if ((state.castleLevel || 1) > castleSeen) { castleSeen = state.castleLevel; EventLog.push("🏰", "Castle upgraded to level " + state.castleLevel); }
      if (state.victory && !wonSeen) { wonSeen = true; EventLog.push("👑", "Victory — a fully-happy Aristocrat estate!"); }
    }, 1200);
  })();

  // Expose for the headless smoke test / console debugging.
  window.KingdomUI = { openKingdom, closeKingdom, toggleKingdom, renderKingdom,
                       showToast, drawAlerts, townAlertIcons,
                       get isOpen() { return kingdomOpen; } };
  window.Events = Events;
  // === KINGDOM/EVENTS-UI END ===
