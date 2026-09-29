  // === KINGDOM/EVENTS-UI START === (slot #4 — kingdom screen, town alerts, toasts,
  // and the bottom-right Event Log feed). All DOM + canvas; reads pure state
  // READ-ONLY. drawAlerts() is a function declaration so the render loop (defined
  // earlier) can call it via hoisting. (The random Kingdom-Events system was retired.)
  const kingdomEl = document.getElementById("kingdomPanel");
  const kwBodyEl = document.getElementById("kwBody");
  const toastsEl = document.getElementById("toasts");
  let kingdomOpen = false;
  let kwSort = { key: "id", dir: 1 };

  // DESIGN PASS (review): same label as everywhere else ("Iron tool", not "Iron_tool").
  const goodLabel = (id) => id ? GOOD_LABEL(id) : "—";

  // ---- town alerts (canvas icons over a town in a bad state) --------------
  // Cheap: a couple of sums per town, derived from state each frame. Icons scale
  // with the world transform (so they shrink when zoomed out) and fade far out.
  // DESIGN PASS: basic-need shortages are no longer a potato-only 🍽 guessed per frame.
  // The Event Log poll (every 1.2 s, below) runs Sim.needCoverage + Sim.shortageAlerts
  // (with hysteresis: raise < 2 min of cover, clear > 4 min) and caches the flags here;
  // the per-frame draw only reads them and shows the MISSING GOOD's own icon.
  const shortFlags = new Map();   // townId -> { gid: true } live basic-need alerts
  // A producer that is built, has open worker slots and nobody working (not a
  // scaffold, not a building whose slots the player closed on purpose).
  function isIdleProducer(b, def) {
    if (!b || !def || !def.output || !(def.workerSlots > 0) || b.built === false) return false;
    if ((b.closedSlots || 0) >= def.workerSlots) return false;
    return !(b.workers > 0);
  }
  function townAlertIcons(t, N) {
    const out = [];
    if (!t || !t.pop) return out;
    const pop = t.pop;
    const total = (pop.peasants || 0) + (pop.workers || 0) + (pop.burghers || 0) + (pop.aristocrats || 0);  // === CC ===
    // 1. basic-need shortage of a present tier — the missing good's icon (🪵, 🥔, 🐟 …)
    const fl = shortFlags.get(t.id);
    if (fl) for (const gid in fl) out.push(goodIcon(gid));
    // 2. idle producer — a building with worker slots but no assigned labour (💤)
    if (Array.isArray(t.buildings)) {
      for (const b of t.buildings) {
        if (isIdleProducer(b, b && CONFIG.buildings[b.typeId])) { out.push("💤"); break; }
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
  // DESIGN PASS: stock includes the houses' porter buffers, and "Top shortage" only
  // names a good the kingdom can actually produce (research-locked luxuries aren't a
  // shortage you can fix) and only when it is really short (below its buffer) — else "—".
  function biggestExtremes(t, producible) {
    const stock = t.stock || {}, demand = t.demand || {};
    const buffer = CONFIG.econ.bufferTarget, floor = CONFIG.econ.minDemand;
    const home = {};
    for (const b of t.buildings || []) {
      const def = b && b.inbuf && b.built !== false && CONFIG.buildings[b.typeId];
      if (def && def.kind === "house") for (const g in b.inbuf) home[g] = (home[g] || 0) + (b.inbuf[g] || 0);
    }
    let surplus = null, surRatio = -Infinity, shortage = null, shoRatio = 1;
    for (const gid in CONFIG.goods) {
      const s = (stock[gid] || 0) + (home[gid] || 0);
      const d = Math.max(floor, demand[gid] || 0);
      const ratio = s / (d * buffer);
      if (s > 0 && ratio > surRatio) { surRatio = ratio; surplus = gid; }
      if ((demand[gid] || 0) > 0 && (!producible || producible[gid]) && ratio < shoRatio) { shoRatio = ratio; shortage = gid; }
    }
    return { surplus, shortage };
  }

  function townMetrics(t, producible) {
    const pop = t.pop || {};
    const peasants = Math.round(pop.peasants || 0);
    const workers = Math.round(pop.workers || 0);
    const burghers = Math.round(pop.burghers || 0);
    const aristocrats = Math.round(pop.aristocrats || 0);   // === CC ===
    const ex = biggestExtremes(t, producible);
    return { name: "City #" + t.id, id: t.id, level: t.level || 1,
      peasants, workers, burghers, aristocrats, total: peasants + workers + burghers + aristocrats,
      happiness: Math.round(t.happiness || 0), gold: Math.round(t.gold || 0),
      surplus: ex.surplus, shortage: ex.shortage };
  }

  const KW_COLS = [
    ["name", "City"], ["level", "Lv"], ["peasants", "Peas."], ["workers", "Work."],
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
    const researchHtml = kwResearchBlockHTML();   // RESEARCH CENTER (Slice C)
    const producible = (typeof Market !== "undefined" && Market.producible) ? Market.producible(state) : null;
    const rows = (state.towns || []).map((t) => townMetrics(t, producible));
    const k = kwSort.key, dir = kwSort.dir;
    rows.sort((a, b) => {
      const av = a[k], bv = b[k];
      if (typeof av === "string" || typeof bv === "string")
        return dir * String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
      return dir * ((av || 0) - (bv || 0));
    });
    if (!rows.length) { kwBodyEl.innerHTML = researchHtml + '<div class="kw-empty">No cities yet — found a city to see it here.</div>'; return; }
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

  // ---- toasts -------------------------------------------------------------
  // Short-lived center notifications (used for build-error feedback, etc.).
  function showToast(msg) {
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    toastsEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 320); }, 4200);
  }

  // Keep the open kingdom panel current as the economy ticks.
  setInterval(() => { if (kingdomOpen) renderKingdom(); }, 500);

  // === EVENT LOG === Let-Them-Trade-style bottom-right feed. One collapsible
  // panel funnels notable happenings (cities founded/completed, missions, research,
  // level-ups, shortages, idle buildings, victory) instead of scattering toasts/debug.
  // Self-contained: builds its own DOM, reads state READ-ONLY, exposes window.EventLog.
  // DESIGN PASS: entries are stamped with GAME time (state.tick, 2 ticks = 1 s) instead
  // of wall-clock, name cities "City #N" (towns have no name field), click to center
  // the camera on their city, and the collapsed bar counts unread entries — pulsing
  // when a warning (shortage / idle building) is among them. The log is not saved; it
  // is cleared on New Game / Continue (EventLog.reset from save.js).
  let feedReset = null;          // set by the feed poll below; EventLog.reset() calls it
  const EventLog = (function () {
    const MAX = 40;
    const wrap = document.createElement("div");
    wrap.id = "eventLog"; wrap.className = "collapsed";
    wrap.innerHTML =
      '<div class="el-head"><span class="el-title">📜 Event Log <span class="el-badge" hidden></span></span>' +
      '<button class="el-toggle" title="Show / hide" aria-label="Toggle event log">▲</button></div>' +
      '<ul class="el-list"></ul>';
    document.body.appendChild(wrap);
    const listEl = wrap.querySelector(".el-list");
    const toggleBtn = wrap.querySelector(".el-toggle");
    const headEl = wrap.querySelector(".el-head");
    const badgeEl = wrap.querySelector(".el-badge");
    const entries = [];
    let unread = 0, unreadWarn = 0;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    // Game clock at the moment of the entry (m:ss, or h:mm:ss past the first hour).
    function gameTime(tick) {
      const sec = Math.max(0, Math.floor((tick || 0) / 2));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = String(sec % 60).padStart(2, "0");
      return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
    }
    function render() {
      if (!entries.length) { listEl.innerHTML = '<li class="el-empty">Nothing yet — found a city to begin.</li>'; return; }
      let html = "";
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const go = e.townId != null;
        html += '<li data-i="' + i + '" class="' + (go ? "el-go" : "") + (e.warn ? " el-warn" : "") + '"' +
          (go ? ' title="Center the map on City #' + esc(e.townId) + '"' : "") + '>' +
          '<span class="el-ic">' + e.icon + '</span><span class="el-tx">' + esc(e.text) +
          (e.action === "research" ? ' <button class="el-act" data-act="research">pick next →</button>' : "") +
          '</span><span class="el-tm">' + gameTime(e.tick) + '</span></li>';
      }
      listEl.innerHTML = html;
    }
    function updateBadge() {
      badgeEl.hidden = !(unread > 0);
      badgeEl.textContent = unread > 99 ? "99+" : String(unread);
      wrap.classList.toggle("el-alarm", unreadWarn > 0);
    }
    // push(icon, text[, { townId, warn, action }]) — two-arg calls keep working.
    function push(icon, text, opts) {
      const o = opts || {};
      entries.unshift({ icon: icon || "•", text: String(text), tick: (state && state.tick) || 0,
        townId: o.townId != null ? o.townId : null, warn: !!o.warn, action: o.action || null });
      if (entries.length > MAX) entries.length = MAX;
      if (wrap.classList.contains("collapsed")) { unread++; if (o.warn) unreadWarn++; updateBadge(); }
      render();
    }
    function setCollapsed(v) {
      wrap.classList.toggle("collapsed", v); toggleBtn.textContent = v ? "▲" : "▼";
      if (!v) { unread = 0; unreadWarn = 0; updateBadge(); }
    }
    function reset() {
      entries.length = 0; unread = 0; unreadWarn = 0;
      if (feedReset) feedReset();
      updateBadge(); render();
    }
    headEl.addEventListener("click", () => setCollapsed(!wrap.classList.contains("collapsed")));
    listEl.addEventListener("click", (ev) => {
      if (ev.target.closest(".el-act")) {           // "pick next →" opens the 🔬 tree
        if (typeof openTechTree === "function") openTechTree();
        return;
      }
      const li = ev.target.closest("li[data-i]");
      const e = li && entries[+li.dataset.i];
      if (!e || e.townId == null) return;
      const t = (state.towns || []).find((x) => x && x.id === e.townId);
      if (!t) return;                               // city was destroyed since
      const p = HexMath.hexToPixel(t.q, t.r, SIZE);
      state.cam.x = p.x; state.cam.y = p.y;         // input.js resyncs its glide target
    });
    render();
    return { push: push, setCollapsed: setCollapsed, reset: reset,
             get entries() { return entries.slice(); }, get unread() { return unread; } };
  })();
  window.EventLog = EventLog;

  // Feed the log from state deltas (read-only 1.2 s poll): research completions,
  // cities founded/completed, missions, town level-ups, basic-need shortages (onset +
  // resolved, via Sim.shortageAlerts), idle producers, and victory.
  (function () {
    let primed = false, rSeen = null, lvls = {}, wonSeen = false;
    let townSeen = new Map();      // townId -> was built last poll
    let missSeen = new Set();
    let idleRec = new WeakMap();   // building -> { since, last } (game ticks)
    const A = () => CONFIG.alerts || {};
    const TPS = 1000 / ((CONFIG.econ && CONFIG.econ.baseTickMs) || 500);   // ticks per game-second
    function nameOf(id) {
      const n = (typeof Research !== "undefined" && Research.get) ? Research.get(id) : null;
      return (n && n.name) || id;
    }
    function missionName(id) {
      try {
        const set = window.Tutorial && window.Tutorial.currentSet && window.Tutorial.currentSet();
        const m = set && set.missions && set.missions.find((x) => x && x.id === id);
        if (m) return m.name || m.title || id;
      } catch (e) { /* authored set unreadable — fall back to the id */ }
      return id;
    }
    function coverText(e) {
      if (e.have < 0.5) return "out of " + goodIcon(e.gid) + " " + GOOD_LABEL(e.gid);
      return goodIcon(e.gid) + " " + GOOD_LABEL(e.gid) + " runs out in ~" + Math.max(1, Math.round(e.coverMin)) + " min";
    }
    function causeText(e) {
      if (!e.hasLocalProducer) return " — no producer here: build one or trade for it";
      if (!e.staffed) return " — its producer has no workers";
      return " — production can't keep up";
    }
    // Baseline after boot / New Game / Continue: what already exists is not news.
    function prime() {
      primed = true;
      rSeen = new Set((state.research && Array.isArray(state.research.unlocked)) ? state.research.unlocked : []);
      for (const t of (state.towns || [])) if (t) { townSeen.set(t.id, t.built !== false); lvls[t.id] = t.level || 1; }
      const comp = (state.missions && state.missions.completed) || {};
      for (const id in comp) if (comp[id]) missSeen.add(id);
      wonSeen = !!state.victory;
    }
    feedReset = function () {
      primed = false; rSeen = null; lvls = {}; wonSeen = false;
      townSeen = new Map(); missSeen = new Set(); idleRec = new WeakMap();
      shortFlags.clear();
      // DESIGN PASS (review): baseline NOW (newGame/loadGame just replaced state) —
      // priming lazily on the next 1.2 s poll swallowed a city founded in between.
      if (typeof state === "object" && state) prime();
    };
    function poll() {
      if (typeof state !== "object" || !state) return;
      const tick = state.tick || 0;
      const towns = state.towns || [];
      const done = (state.research && Array.isArray(state.research.unlocked)) ? state.research.unlocked : [];
      const comp = (state.missions && state.missions.completed) || {};
      if (!primed) prime();
      for (const id of done) if (!rSeen.has(id)) {
        rSeen.add(id);
        EventLog.push("🔬", "Researched " + nameOf(id), { action: "research" });
      }
      for (const id in comp) if (comp[id] && !missSeen.has(id)) {
        missSeen.add(id);
        EventLog.push("✅", "Mission complete: " + missionName(id));
      }
      const live = new Set();
      const idleAfter = (A().idleAfterSec || 30) * TPS, idleRepeat = (A().idleRepeatSec || 300) * TPS;
      for (const t of towns) {
        if (!t || t.id == null) continue;
        live.add(t.id);
        const name = "City #" + t.id;
        const built = t.built !== false;
        if (!townSeen.has(t.id)) EventLog.push("🏘", name + " founded", { townId: t.id });
        else if (built && !townSeen.get(t.id)) EventLog.push("🏗", name + " is complete — settlers can move in", { townId: t.id });
        townSeen.set(t.id, built);
        const prevLvl = (t.id in lvls) ? lvls[t.id] : (t.level || 1);
        if ((t.level || 1) > prevLvl) EventLog.push("⬆", name + " reached level " + t.level, { townId: t.id });
        lvls[t.id] = t.level || 1;
        // basic-need shortages (hysteresis lives in Sim.shortageAlerts)
        const cov = Sim.needCoverage(state, t);
        const prev = shortFlags.get(t.id) || null;
        const next = Sim.shortageAlerts(state, t, prev, cov);
        for (const e of cov)
          if (next[e.gid] && !(prev && prev[e.gid]))
            EventLog.push(goodIcon(e.gid), name + ": " + coverText(e) + causeText(e), { townId: t.id, warn: true });
        if (prev) for (const gid in prev) if (!next[gid])
          EventLog.push("✔", name + ": " + goodIcon(gid) + " " + GOOD_LABEL(gid) + " supply restored", { townId: t.id });
        if (Object.keys(next).length) shortFlags.set(t.id, next); else shortFlags.delete(t.id);
        // idle producers: 0 workers for > idleAfterSec game-s, at most once per idleRepeatSec
        if (!built) continue;
        for (const b of (t.buildings || [])) {
          if (!b) continue;
          const def = CONFIG.buildings[b.typeId];
          let rec = idleRec.get(b);
          if (!isIdleProducer(b, def)) { if (rec) rec.since = -1; continue; }
          if (!rec) { rec = { since: tick, last: -Infinity }; idleRec.set(b, rec); }
          else if (rec.since < 0) rec.since = tick;
          if (tick - rec.since >= idleAfter && tick - rec.last >= idleRepeat) {
            rec.last = tick;
            const HOME = { peasant: "peasants — build Huts", worker: "workers — build Cottages", burgher: "citizens — build Manors" };
            EventLog.push("💤", name + ": " + (def.name || b.typeId) + " is idle — no free " +
              (HOME[def.workerTier] || "workers"), { townId: t.id, warn: true });
          }
        }
      }
      for (const id of shortFlags.keys()) if (!live.has(id)) shortFlags.delete(id);
      if (state.victory && !wonSeen) { wonSeen = true; EventLog.push("👑", "Victory — a fully-happy Aristocrat estate!"); }
    }
    setInterval(poll, 1200);
  })();

  // Expose for the headless smoke test / console debugging.
  window.KingdomUI = { openKingdom, closeKingdom, toggleKingdom, renderKingdom,
                       showToast, drawAlerts, townAlertIcons,
                       get isOpen() { return kingdomOpen; } };
  // === KINGDOM/EVENTS-UI END ===
