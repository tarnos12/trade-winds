  // === TOWN-UI START ===  (T6 / slot #4 — town entities + town panel UI, DOM)
  // Builds real Town entities (contract shape) and an HTML panel layered over the
  // canvas. Consumes the pure-core price model via window.Sim.priceFor (the IIFE's
  // local `Sim` above is a no-op stub that shadows the pure namespace, so we reach
  // the real one through window). Does NOT implement Sim.tick — that's T4's slice.

  // Reach the pure-core Sim.priceFor (window.Sim), tolerating either load order.
  function priceOf(town, goodId) {
    const S = (typeof window !== "undefined" && window.Sim) || null;
    if (S && typeof S.priceFor === "function") return S.priceFor(town, goodId);
    const g = CONFIG.goods[goodId];
    return g ? g.basePrice : 0;            // graceful fallback if priceFor absent
  }

  // Max town-center attached buildings by level (GDD §4.1: 3/5/7/9).
  const TOWN_BUILDING_CAP = { 1: 3, 2: 5, 3: 7, 4: 9 };

  function nextTownId() {
    let max = 0;
    for (const t of state.towns) { const n = +t.id; if (Number.isFinite(n) && n > max) max = n; }
    return max + 1;
  }

  // TI-C: the old auto-seed (seedBuildings) is gone — towns start with their
  // center only and the player places every building via the Buildings tab.

  // Create a Town matching the shared data contract exactly (TASKS.md):
  //   { id, q, r, level, gold, pop:{peasants,workers,burghers}, stock:{goodId:qty},
  //     prices:{goodId:price}, buildings:[{typeId,q,r,workers}], happiness }
  // Seeded with sensible starting values so the panel (and, later, Sim.tick) has
  // real data to show even before the economy tick lands.
  function makeTown(q, r) {
    const town = {
      id: nextTownId(),
      q, r,
      // P4-B: towns start at level 1 and must be UPGRADED (pop + gold gated via
      // Town.canUpgrade) to reach level 2 before Trade dispatches carts from them.
      // This replaces the old Phase-3 "start at L2" trade bridge.
      level: 1,
      // EC-A: town.gold is the city's TRADE budget (the external trader spends it
      // to buy goods) — NOT construction money. Construction gold is the Kingdom
      // treasury (state.treasury); construction resources are town.stock.
      gold: 1000,
      // EC-A/EC-B: a city starts with ZERO population — houses + happiness grow it
      // (Sim.tick, owned by EC-B). No auto-seeded buildings: center only.
      pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },   // === CC: 4th tier ===
      stock: { ...CONFIG.town.startStock },
      prices: {},
      buildings: [],
      // EC-A: happiness baseline is 50 (EC-B's Sim moves it toward 100 as needs
      // are met, down when unmet); pop per house = round(cap × happiness/100).
      happiness: 50,
    };
    // Prime prices once so the panel opens with meaningful numbers (priceFor
    // mutates town.prices; first read snaps to target).
    for (const id of Object.keys(CONFIG.goods)) priceOf(town, id);
    return town;
  }

  // Back-fill missing fields on any town (e.g. a bare {q,r} marker from a Phase-1
  // save) so the panel never trips over undefined state.
  function ensureTown(t) {
    if (t.id == null) t.id = nextTownId();
    if (t.level == null) t.level = 1;
    if (t.gold == null) t.gold = 1000;   // EC-A: trade budget
    if (!t.pop) t.pop = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };   // === CC ===
    if (!t.stock) t.stock = { ...CONFIG.town.startStock };
    if (!t.prices) t.prices = {};
    // TI-C: no more auto-seed. A bare {q,r} marker (old Phase-1 save) starts with
    // no buildings; towns saved with a buildings array keep it (old auto-seeded
    // saves still load — Sim.tick reassigns their workers).
    if (!Array.isArray(t.buildings)) t.buildings = [];
    if (t.happiness == null) t.happiness = 50;   // EC-A: baseline
    if (typeof Ledger !== "undefined") Ledger.normalizeTown(t);   // PP-A: bounded gold ledger (legacy saves self-heal)
    return t;
  }

  // ---- panel DOM + state ----
  const panelEl = document.getElementById("townPanel");
  const tpNameEl = document.getElementById("tpName");
  const tpLevelEl = document.getElementById("tpLevel");
  const tpBodyEl = document.getElementById("tpBody");
  const ppHeadEl = document.getElementById("ppHead");   // === PP-B === header stat strip
  const tpTabEls = Array.from(panelEl.querySelectorAll(".tp-tab"));

  let activeTown = null;
  let activeTab = "overview";
  const trendPrev = {};          // key "townId:goodId" -> last displayed price (trend arrows)

  const GOOD_LABEL = id => id.charAt(0).toUpperCase() + id.slice(1);
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString();

  // === F: shared per-tick -> per-second display helper (2 ticks = 1 game-second).
  // UIDev owns this ONE definition (BATCH2_BRIEF.md: "define it ONCE, others
  // import/use it") — every "/tick" rate shown to the player anywhere in the UI
  // should be run through this before display. Exposed on window so CoreDev
  // (sim.js/buildings.js/goods.js) and RenderDev (carts-castle-ui.js) can reuse
  // the same conversion instead of redefining it. Falls back to 2 if
  // TICKS_PER_SEC (research.js) hasn't loaded yet — defensive only.
  function perMin(x) {
    const tps = (typeof TICKS_PER_SEC === "number" && TICKS_PER_SEC > 0) ? TICKS_PER_SEC : 2;
    return (Number(x) || 0) * tps * 60;   // per GAME-MINUTE (2 ticks = 1s ⇒ ×120/tick)
  }
  if (typeof window !== "undefined") window.perMin = perMin;

  // === ICONS: per-good emoji (author request — no external images, single-file).
  // Shared by every panel/chip/tooltip; canvas chips draw these via fillText.
  const GOOD_ICON = {
    wood: "🪵", stone: "🪨", iron: "🔩", clay: "🟫", grain: "🌾", potato: "🥔",
    fish: "🐟", wool: "🧶", planks: "🪚", flour: "🌸", coal: "⬛", gold: "🪙", bricks: "🧱",
    // === CC: content chains v2 icons ===
    iron_tool: "🔨", mead: "🍺", clothes: "👕", stone_tools: "⚒️", oil: "🛢️",
    bread: "🍞", pottery: "🏺", lamp: "🪔", iron_armor: "🛡️", chairs: "🪑",
    gold_ring: "💍", brandy: "🥃", luxury_clothes: "👗",
  };
  const goodIcon = id => GOOD_ICON[id] || "📦";
  // === /ICONS ===

  function trendArrow(town, goodId, price) {
    const key = town.id + ":" + goodId;
    const prev = trendPrev[key];
    trendPrev[key] = price;
    if (prev === undefined || Math.abs(price - prev) < 0.05) return '<span class="trend flat">▬</span>';
    return price > prev ? '<span class="trend up">▲</span>' : '<span class="trend down">▼</span>';
  }

  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  // === PP-B START === city-panel redesign (Let Them Trade style). READ-ONLY over
  // the shared model — town fields (pop / stock / demand / prices / tierHappiness /
  // tierIncome / ledger from PP-A), state.carts, and the pure helpers
  // Trade.externalFleet / Buildings.* / Ledger. The ONLY writes are the existing
  // player actions the panel hosts: the P4-B town upgrade and the EC-C Give/Take
  // transfer (delegated to window.CityCards.give/take). Replaces the old EC-E
  // trade views + the old Overview/Stock/Buildings/Population tab renderers.

  const escAttr = s => esc(s).replace(/"/g, "&quot;");
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const PP_TIER_KEY = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };  // === CC ===
  // Burgher DISPLAYS as "Citizen" everywhere (RT-B rename).
  const PP_TIERS = [
    { key: "peasants",    tier: "peasant",    label: "Peasant",    glyph: "🧑‍🌾", color: "#8bc34a" },
    { key: "workers",     tier: "worker",     label: "Worker",     glyph: "🔨",   color: "#ff9800" },
    { key: "burghers",    tier: "burgher",    label: "Citizen",    glyph: "🎩",   color: "#9c88ff" },
    { key: "aristocrats", tier: "aristocrat", label: "Aristocrat", glyph: "👑",   color: "#d16bd1" },  // === CC ===
  ];
  // Per-building glyphs (same set the RT-B tech tree uses — that map lives in a
  // later closure, so keep a local copy).
  const PP_GLYPH = { hut: "🛖", lumberjack: "🪓", farm: "🌾", potato_farm: "🥔", sawmill: "🪚",
    quarry: "⛏️", fishery: "🎣", miner: "⚒️", shepherd: "🐑", mill: "🌀",
    cottage: "🏠", brewery: "🍺", bakery: "🍞", manor: "🏛️", brickworks: "🧱",
    // === CC ===
    tailoring: "🧵", charcoal_burner: "🪮", stonetool_maker: "⚒️", oil_maker: "🛢️",
    forge: "🔥", armory: "🛡️", pottery_workshop: "🏺", distillery: "🥃", goldsmith: "💍",
    lamp_maker: "🪔", carpentry: "🪑", luxury_tailor: "👗", aristocrat_home: "🏰" };
  const ppGlyph = id => PP_GLYPH[id] || "🏚";

  // Live external traders this city owns (buyer-side carts on the road).
  function ppLiveCarts(t) {
    const out = [];
    for (const c of (state.carts || []))
      if (c && !c.done && c.fromId === t.id && (c.kind || "external") === "external") out.push(c);
    return out;
  }

  // Per-tier jobs: filled / total EFFECTIVE slots (workerSlots + upgrade slotPlus
  // − closedSlots) over BUILT producer buildings — mirrors Sim's staffing rule.
  function ppTierJobs(t) {
    const out = { peasants: { filled: 0, total: 0 }, workers: { filled: 0, total: 0 }, burghers: { filled: 0, total: 0 }, aristocrats: { filled: 0, total: 0 } };  // === CC ===
    for (const b of (t.buildings || [])) {
      if (!b || b.built === false) continue;
      const def = CONFIG.buildings[b.typeId];
      if (!def || def.kind === "house" || !def.workerSlots) continue;
      const key = PP_TIER_KEY[def.workerTier];
      if (!key) continue;
      const plus = (Buildings.upgradeEffect ? (Buildings.upgradeEffect(b).slotPlus || 0) : 0);
      const eff = Math.max(0, (def.workerSlots || 0) + plus - (b.closedSlots || 0));
      out[key].total += eff;
      out[key].filled += Math.min(eff, Math.round(b.workers || 0));
    }
    return out;
  }

  // === D: upgrade-in-progress helpers — the click-to-upgrade handler
  // (data-upgrade, below) IS correctly wired to Buildings.startUpgrade; when the
  // material-delivery pipeline stalls (CoreDev's E/G fix) the upgrade just sits
  // at pendingUpgrade with delivered:{} and LOOKS dead. These helpers give every
  // upgrading building a visible % + "waiting on X" state so it never reads as
  // nothing-happened, regardless of how fast delivery actually runs.
  // 0..100 delivery percent across ALL required materials (unweighted qty sum —
  // same simple approximation the construction chips already use). null when no
  // upgrade is pending.
  function ppUpgradePct(b) {
    if (!b || !b.pendingUpgrade || typeof Buildings === "undefined" || !Buildings.upgradeResourceCost) return null;
    const rc = Buildings.upgradeResourceCost(b.typeId, b.pendingUpgrade.toLevel);
    const delivered = b.pendingUpgrade.delivered || {};
    let need = 0, have = 0;
    for (const gid in rc) { need += rc[gid]; have += Math.min(rc[gid], delivered[gid] || 0); }
    return need > 0 ? Math.max(0, Math.min(100, Math.round(have / need * 100))) : 100;
  }
  // Human-readable "waiting on" string for a pending upgrade: remaining qty per
  // good, flagging goods this city's OWN stock currently has none of (the
  // clearest signal that it's stuck on delivery/trade, not "about to land").
  function ppUpgradeWaitStr(town, b) {
    if (!b || !b.pendingUpgrade || typeof Buildings === "undefined" || !Buildings.upgradeConstructionNeed) return "";
    const need = Buildings.upgradeConstructionNeed(b);
    return Object.keys(need).map(gid => {
      const short = !((town && town.stock && (town.stock[gid] || 0) > 0.05));
      return `${fmt(need[gid])} ${goodIcon(gid)} ${GOOD_LABEL(gid)}${short ? " (none in city stock)" : ""}`;
    }).join(" · ");
  }
  // === /D ===

  // Transporter usage this tick ≈ deliverable-now construction/upgrade materials
  // vs the delivery budget (deliveryRate × transporterCount) — the same
  // quantities the CB-A/PP-A Sim delivery step would move. Honest and cheap.
  function ppTransporterUse(t) {
    const n = (Buildings.transporterCount ? Buildings.transporterCount(t) : 1);
    const budget = ((CONFIG.town && CONFIG.town.deliveryRate) || 5) * n;
    const need = {};
    for (const b of (t.buildings || [])) {
      if (!b) continue;
      if (b.built === false && Buildings.constructionNeed) {
        const nd = Buildings.constructionNeed(b);
        for (const g in nd) need[g] = (need[g] || 0) + nd[g];
      }
      if (b.pendingUpgrade && Buildings.upgradeConstructionNeed) {
        const nd = Buildings.upgradeConstructionNeed(b);
        for (const g in nd) need[g] = (need[g] || 0) + nd[g];
      }
    }
    let pending = 0, deliverable = 0;
    for (const g in need) {
      pending += need[g];
      deliverable += Math.min(need[g], (t.stock && t.stock[g]) || 0);
    }
    return { n, budget, pending, frac: budget > 0 ? Math.min(1, deliverable / budget) : 0 };
  }

  // ---- header strip: gold · slots · happiness · upgrade · Give/Take ----------
  function renderPPHead(t, force) {
    if (!ppHeadEl) return;
    // Don't rebuild under the cursor — a mid-click rebuild would swallow the
    // click and an open title-tooltip would flicker. Player actions force it.
    if (!force && ppHeadEl.matches(":hover")) return;
    const used = Buildings.usedSlots(t);
    const cap = Buildings.slotCap(t.level, state);
    const h = Math.max(0, Math.min(100, Math.round(t.happiness || 0)));
    const face = h >= 70 ? "🙂" : h >= 40 ? "😐" : "☹";
    const faceCls = h >= 70 ? "good" : h >= 40 ? "mid" : "bad";
    const req = Town.upgradeReq(t);
    let upBtn;
    if (!req) {
      upBtn = `<button disabled title="Level ${t.level} — maximum">⬆ Max</button>`;
    } else {
      const res = Town.canUpgrade(t);
      const tip = `Upgrade to Level ${t.level + 1} (+build slots, +traders/transporters): needs ` +
        `${req.pop} pop (have ${Math.round(Town.popTotal(t))}) and ${req.gold}🪙 city gold (have ${Math.floor(t.gold || 0)})` +
        (res.ok ? "" : " — " + res.reason);
      upBtn = `<button data-town-upgrade ${res.ok ? "" : "disabled"} title="${escAttr(tip)}">⬆ Lv ${t.level + 1}</button>`;
    }
    const cooling = (t.cooldownUntil || 0) > (state.tick || 0);
    let coolStr = "";
    if (cooling) {
      const secs = Math.ceil(((t.cooldownUntil || 0) - (state.tick || 0)) * 0.5);   // 500 ms/tick
      coolStr = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
    }
    const canGive = !cooling && (state.treasury || 0) >= 1000;
    const canTake = !cooling && (t.gold || 0) >= 1000;
    const coolTip = cooling ? " — cooldown " + coolStr : "";
    ppHeadEl.innerHTML =
      `<span class="pp-stat" title="City gold (its trade budget)">🪙 ${Math.round(t.gold || 0).toLocaleString()}</span>` +
      `<span class="pp-stat" title="Building slots used / capacity">🏠 ${used}/${cap}</span>` +
      `<span class="pp-stat pp-face ${faceCls}" title="City happiness">${face} ${h}%</span>` +
      `<span class="pp-headbtns">${upBtn}` +
      `<button data-pp-give ${canGive ? "" : "disabled"} title="${escAttr("Give 1000🪙 from the Kingdom to this city (+happiness)" + coolTip)}">Give 1k</button>` +
      `<button data-pp-take ${canTake ? "" : "disabled"} title="${escAttr("Take 1000🪙 from this city into the Kingdom (−happiness)" + coolTip)}">Take 1k</button></span>` +
      (cooling ? `<span class="pp-cool">⏳ transfer cooldown ${coolStr}</span>` : "");
  }

  // ---- Tab 1: Overview --------------------------------------------------------
  function renderPPOverview(t) {
    const housing = (Buildings.housingCapacity ? Buildings.housingCapacity(t, state)
                                               : { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 });
    const jobs = ppTierJobs(t);
    let html = `<div class="tp-sec">Population</div>`;
    for (const ti of PP_TIERS) {
      const pop = Math.round(t.pop[ti.key] || 0);
      const homes = Math.round(housing[ti.key] || 0);
      const th = (t.tierHappiness && t.tierHappiness[ti.key] != null) ? Math.round(t.tierHappiness[ti.key]) : null;
      const inc = (t.tierIncome && t.tierIncome[ti.key]) || 0;
      const j = jobs[ti.key];
      const off = pop <= 0 && homes <= 0;
      const tip = `Homes ${Math.min(pop, homes)}/${homes} · Jobs ${j.filled}/${j.total} · ` +
        `Happiness ${th == null ? "—" : th + "%"} · Income ${fmt1(perMin(inc))}🪙/min`;
      html += `<div class="pp-tier ${off ? "off" : ""}" title="${escAttr(tip)}">
        <span class="glyph">${ti.glyph}</span>
        <span class="lbl" style="color:${ti.color}">${ti.label}</span>
        <span class="cnt">${pop}</span>
        <span class="hap">${th == null ? "—" : th + "%"}</span></div>`;
    }

    // Logistics bars: transporters (green = delivery budget in use) + traders
    // (amber-red = live carts / fleet), each with a hover explainer.
    // === TRADEUX: the per-trader numbered list used to be printed below the bar
    // permanently; the author wants it hover-only (cleaner panel) — fold the
    // "#k: Buy 3🐟 from City#2 for 22🪙" / "Not Trading" lines into the bar's
    // `title` tooltip instead (same pattern as the plain explainer tooltips
    // below), and drop the always-visible .pp-fleet block entirely. ===
    const tu = ppTransporterUse(t);
    const fleet = (typeof Trade !== "undefined" && Trade.externalFleet) ? Trade.externalFleet(t) : 1;
    const live = ppLiveCarts(t);
    const transTip = `${tu.n} Transporters — Distribute resources inside the city. Upgrade the city to increase their number.`;
    let tradTip = `${fleet} Traders — Buy resources from other cities. Upgrade the city to increase their number.`;
    for (let k = 0; k < fleet; k++) {
      const c = live[k];
      tradTip += "\n" + (c ? `#${k + 1}: ${ppCartLine(c)}` : `#${k + 1}: Not Trading`);
    }
    html += `<div class="tp-sec">Logistics</div>
      <div class="pp-lbar" title="${escAttr(transTip)}">
        <span class="lbl">🧺 Transporters</span>
        <span class="bar green"><span style="width:${Math.round(tu.frac * 100)}%"></span></span>
        <span class="st">${tu.n}</span></div>
      <div class="pp-lbar" title="${escAttr(tradTip)}">
        <span class="lbl">🛒 Traders</span>
        <span class="bar red"><span style="width:${fleet > 0 ? Math.round(live.length / fleet * 100) : 0}%"></span></span>
        <span class="st">${live.length}/${fleet}</span></div>`;
    // === /TRADEUX ===

    // Budget chart (line drawn onto #ppBudget after the innerHTML lands).
    html += `<div class="tp-sec">Budget</div>
      <div class="pp-chart-wrap">
        <canvas id="ppBudget" width="320" height="74" aria-label="City gold history"></canvas>
        <span class="ax max" id="ppBudMax"></span>
        <span class="ax min" id="ppBudMin"></span>
      </div>
      <div class="pp-chart-cap"><span>Budget (last ~5 min)</span><b id="ppBudNow">${Math.round(t.gold || 0).toLocaleString()} 🪙</b></div>`;

    // Income / expense breakdown — rolling per-tick averages from the PP-A ledger,
    // shown per-second (F: perMin) since that's the game-second the player feels.
    const N = 120;   // ~1 min of ticks at 1×
    const avg = key => perMin(typeof Ledger !== "undefined" ? Ledger.lastNAverage(t, key, N) : 0);
    const tax = avg("tax"), sales = avg("sales"), buys = avg("buys"), transfers = avg("transfers");
    const net = tax + sales - buys + transfers;
    const row = (ico, lbl, v, cls, sign) =>
      `<div class="tp-row"><span class="k">${ico} ${lbl}</span><span class="v ${cls}">${sign}${fmt1(Math.abs(v))}🪙/min</span></div>`;
    html += `<div class="tp-sec">Income &amp; expenses</div><div class="pp-brk">` +
      row("💰", "Taxes", tax, "pos", "+") +
      row("📤", "Sales", sales, "pos", "+") +
      row("📥", "Purchases", buys, buys > 0 ? "neg" : "", "−") +
      row("🤝", "Transfers", transfers, transfers > 0 ? "pos" : transfers < 0 ? "neg" : "", transfers < 0 ? "−" : "+") +
      `<div class="tp-row net"><span class="k">Net</span><span class="v ${net > 0 ? "pos" : net < 0 ? "neg" : ""}">` +
      `${net < 0 ? "−" : "+"}${fmt1(Math.abs(net))}🪙/min</span></div></div>`;
    return html;
  }

  // One fleet line: "(42%) Buy 3🐟 4🪵 from City #2 for 22🪙" (phase-aware verb,
  // multi-good cargo, castle-sentinel seller).
  function ppCartLine(c) {
    const items = Array.isArray(c.cargo) ? c.cargo : [{ goodId: c.goodId, qty: c.qty, unloaded: c.unloaded }];
    const cargoStr = items.filter(it => (it.qty || 0) > 0)
      .map(it => `${Math.max(1, Math.round(it.qty))}${goodIcon(it.goodId)}`).join(" ") || "goods";
    const isCastle = !!c.sellerCastle || c.toId === "castle";
    let seller = "Castle";
    if (!isCastle) {
      const s = (state.towns || []).find(x => x && x.id === c.toId);
      seller = "City #" + (s ? s.id : c.toId);
    }
    let frac, verb;
    if (c.phase === "loading") { frac = c.qty > 0 ? (c.loaded || 0) / c.qty : 0; verb = "Loading"; }
    else if (c.phase === "return") { frac = c.progress || 0; verb = "Hauling"; }
    else if (c.phase === "unloading") {
      let un = 0; for (const it of items) un += it.unloaded || 0;
      const tot = c.totalQty || c.qty || 1;
      frac = tot > 0 ? un / tot : 0; verb = "Unloading";
    } else { frac = c.progress || 0; verb = "Buy"; }
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    return `(${pct}%) ${verb} ${cargoStr} from ${esc(seller)} for ${Math.round(c.agreedGold || 0)}🪙`;
  }

  // Budget line chart — same look as the KR resource chart (drawChart).
  function drawPPBudget(t) {
    const cv = document.getElementById("ppBudget");
    if (!cv || typeof cv.getContext !== "function") return;
    const g = cv.getContext("2d");
    const cw = cv.clientWidth || 320, ch = 74;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = "#150f09"; g.fillRect(0, 0, cw, ch);

    const hist = (t.ledger && Array.isArray(t.ledger.hist)) ? t.ledger.hist : [];
    const vals = [];
    for (let i = 0; i < hist.length; i++) if (typeof hist[i] === "number" && isFinite(hist[i])) vals.push(hist[i]);
    if (!vals.length) vals.push(t.gold || 0);
    let min = vals[0], max = vals[0];
    for (let i = 1; i < vals.length; i++) { if (vals[i] < min) min = vals[i]; if (vals[i] > max) max = vals[i]; }
    if (max - min < 1e-6) { min -= 1; max += 1; }
    const span = max - min, pad = 5;
    const X = (i, n) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (cw - 2 * pad));
    const Y = (v) => ch - pad - ((v - min) / span) * (ch - 2 * pad);
    if (vals.length >= 2) {
      g.strokeStyle = "#e0a860"; g.lineWidth = 1.5; g.lineJoin = "round"; g.beginPath();
      for (let i = 0; i < vals.length; i++) { const px = X(i, vals.length), py = Y(vals[i]); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
    } else {
      g.fillStyle = "#e0a860"; g.beginPath(); g.arc(X(0, 1), Y(vals[0]), 2.5, 0, Math.PI * 2); g.fill();
    }
    const mn = document.getElementById("ppBudMin"), mx = document.getElementById("ppBudMax"),
          nw = document.getElementById("ppBudNow");
    if (mn) mn.textContent = Math.round(min).toLocaleString();
    if (mx) mx.textContent = Math.round(max).toLocaleString();
    if (nw) nw.textContent = Math.round(t.gold || 0).toLocaleString() + " 🪙";
  }

  // ---- Tab 2: Warehouse (read-only) -------------------------------------------
  let ppWhSort = "az";     // "az" | "stock" | "price" — persists while the panel is open
  let ppWhPrev = null;     // { townId, tick, stock:{}, rate:{} } net-rate sampler (UI-only)
  function ppWhRates(t) {
    const cur = {};
    for (const gid in CONFIG.goods) cur[gid] = (t.stock && t.stock[gid]) || 0;
    if (!ppWhPrev || ppWhPrev.townId !== t.id || (state.tick || 0) < ppWhPrev.tick) {
      ppWhPrev = { townId: t.id, tick: state.tick || 0, stock: cur, rate: {} };
      return ppWhPrev.rate;
    }
    const dt = (state.tick || 0) - ppWhPrev.tick;
    if (dt >= 8) {   // ~4 s window at 1× — smooth but honest (net Δstock / tick)
      const rate = {};
      for (const gid in cur) rate[gid] = (cur[gid] - (ppWhPrev.stock[gid] || 0)) / dt;
      ppWhPrev = { townId: t.id, tick: state.tick || 0, stock: cur, rate };
    }
    return ppWhPrev.rate;
  }

  function renderPPWarehouse(t) {
    const cap = (CONFIG.town && CONFIG.town.storageCap) || 80;
    // En-route units this city's own traders are hauling home, per good.
    const inbound = {};
    for (const c of ppLiveCarts(t)) {
      const items = Array.isArray(c.cargo) ? c.cargo : [{ goodId: c.goodId, qty: c.qty, unloaded: c.unloaded }];
      for (const it of items) {
        const left = Math.max(0, (it.qty || 0) - (it.unloaded || 0));
        if (left > 0) inbound[it.goodId] = (inbound[it.goodId] || 0) + left;
      }
    }
    const rates = ppWhRates(t);
    const ids = Object.keys(CONFIG.goods).filter(gid =>
      ((t.stock && t.stock[gid]) || 0) > 0.05 || ((t.demand && t.demand[gid]) || 0) > 1e-3 || (inbound[gid] || 0) > 0);
    const priceGet = gid => (t.prices && typeof t.prices[gid] === "number")
      ? t.prices[gid] : ((CONFIG.goods[gid] && CONFIG.goods[gid].basePrice) || 0);
    // === TRADEUX: per-good buy/sell direction, mirroring the pure Trade.tick
    // needOf/surplus logic (grep TRADEFIX) so the arrow matches what the city's
    // own trader actually does — ▲ = exportable surplus (stock above need),
    // ▼ = a demanded shortfall the trader would import, dash = balanced/untraded.
    const whBuffer = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
    const whMinStock = (CONFIG.trade && CONFIG.trade.minStock) || 0;
    const ppWhNeed = gid => {
      const d = (t.demand && t.demand[gid]) || 0;
      return d > 0 ? Math.max(d * whBuffer, whMinStock) : 0;
    };
    const ppWhArrow = gid => {
      const demand = (t.demand && t.demand[gid]) || 0;
      const need = ppWhNeed(gid);
      const surplus = ((t.stock && t.stock[gid]) || 0) - need;
      if (demand > 0 && surplus < -0.05)
        return '<span class="trend down" title="Shortfall — the trader will buy this">▼</span>';
      if (surplus > 0.05)
        return '<span class="trend up" title="Surplus — the trader will sell this">▲</span>';
      return '<span class="trend flat" title="Balanced — not traded">–</span>';
    };
    // === /TRADEUX ===
    if (ppWhSort === "stock")
      ids.sort((a, b) => ((t.stock && t.stock[b]) || 0) - ((t.stock && t.stock[a]) || 0) || a.localeCompare(b));
    else if (ppWhSort === "price")
      ids.sort((a, b) => priceGet(b) - priceGet(a) || a.localeCompare(b));
    else ids.sort((a, b) => GOOD_LABEL(a).localeCompare(GOOD_LABEL(b)));

    const sortBtn = (id, lbl, tip) =>
      `<button data-pp-sort="${id}" class="${ppWhSort === id ? "active" : ""}" title="${escAttr(tip)}">${lbl}</button>`;
    let html = `<div class="pp-wsort"><span class="cap">Storage cap ${cap}/good</span>` +
      sortBtn("az", "A-Z", "Sort by name") +
      sortBtn("stock", "Stock", "Sort by stock (high first)") +
      sortBtn("price", "Price", "Sort by price (high first)") + `</div>`;
    if (!ids.length) return html + `<div class="tp-empty">Nothing stocked or demanded yet.</div>`;
    html += `<div class="pp-wrow hdr"><span>Good</span><span class="num">Stock</span>` +
      `<span class="num">Rate</span><span class="num" title="Units your traders are hauling home">⇦</span>` +
      `<span class="num">Price</span></div>`;
    for (const gid of ids) {
      const stock = (t.stock && t.stock[gid]) || 0;
      const price = priceGet(gid);
      const arrow = trendArrow(t, gid, price);
      const r = rates[gid];
      const rateCell = (typeof r === "number" && Math.abs(r) >= 0.005)
        ? `<span class="num ${r > 0 ? "up" : "down"}">${r > 0 ? "+" : "−"}${fmt1(Math.abs(perMin(r)))}/min</span>`
        : `<span class="num dim">—</span>`;
      const inb = inbound[gid] || 0;
      const inCell = inb > 0 ? `<span class="num up">+${Math.round(inb)}</span>` : `<span class="num dim">—</span>`;
      const tip = `${GOOD_LABEL(gid)}: ${fmt(stock)}/${cap} stored · demand ${fmt1(perMin((t.demand && t.demand[gid]) || 0))}/min` +
        (inb > 0 ? ` · ${Math.round(inb)} en route` : "");
      html += `<div class="pp-wrow" title="${escAttr(tip)}">
        <span class="nm">${ppWhArrow(gid)} ${goodIcon(gid)} ${esc(GOOD_LABEL(gid))}</span>
        <span class="num">${fmt(stock)}<span class="pp-cap"><span style="width:${Math.min(100, Math.round(stock / cap * 100))}%"></span></span></span>
        ${rateCell}${inCell}
        <span class="num">${fmt1(price)}🪙 ${arrow}</span></div>`;
    }
    return html;
  }

  // ---- Tab 3: Buildings & Workforce (merged old Buildings + Population tabs) ---
  function renderPPBuildings(t) {
    const bs = Array.isArray(t.buildings) ? t.buildings : [];
    if (!bs.length)
      return `<div class="tp-empty">No buildings yet — place some from the build bar at the bottom of the screen.</div>`;
    const housing = (Buildings.housingCapacity ? Buildings.housingCapacity(t, state)
                                               : { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 });
    let html = "";
    for (const ti of PP_TIERS) {
      const houses = [], works = [];
      bs.forEach((b, i) => {
        if (!b) return;
        const def = CONFIG.buildings[b.typeId];
        if (!def) return;
        if (def.kind === "house" && def.houseTier === ti.tier) houses.push({ b, def, i });
        else if (def.kind !== "house" && def.workerTier === ti.tier) works.push({ b, def, i });
      });
      if (!houses.length && !works.length) continue;
      html += `<div class="tp-sec" style="color:${ti.color}">${ti.glyph} ${ti.label}s</div>`;
      if (houses.length) {
        const capT = Math.round(housing[ti.key] || 0);
        const occT = Math.min(Math.round(t.pop[ti.key] || 0), capT);
        html += `<div class="pp-grp">Houses ${occT}/${capT}</div><div class="pp-cards">`;
        let left = occT;   // distribute the tier's residents across its houses in order
        for (const hs of houses) {
          const hcap = (hs.def.houseCapacity || 0)
            + (Buildings.upgradeEffect ? (Buildings.upgradeEffect(hs.b).capacityPlus || 0) : 0);
          const uc = hs.b.built === false;
          const occ = uc ? 0 : Math.min(left, hcap);
          left -= occ;
          const pips = "●".repeat(occ) + "○".repeat(Math.max(0, hcap - occ));
          // === D: a pending upgrade is informational (not a problem needing
          // attention), so it gets its own ⬆ badge + % — never a bare ⚠ that
          // reads as broken while it's just waiting on delivery.
          const upgPct = ppUpgradePct(hs.b);
          const tip = `${hs.def.name}${(hs.b.upgradeLevel || 1) > 1 ? " L" + hs.b.upgradeLevel : ""} — ${occ}/${hcap} occupied` +
            (uc ? " · ⚠ under construction" : "") +
            (upgPct != null ? ` · ⬆ upgrading ${upgPct}%` : "") +
            (hs.b.priority ? " · ⭐ priority" : "") + ". Click for details.";
          html += `<button class="pp-card" data-pp-b="${hs.i}" title="${escAttr(tip)}">` +
            `<span>${ppGlyph(hs.b.typeId)}</span><span class="pips">${pips}</span>` +
            (hs.b.priority ? `<span class="star">⭐</span>` : "") +
            (uc ? `<span class="badge">⚠</span>` : (upgPct != null ? `<span class="badge">⬆</span>` : "")) + `</button>`;
        }
        html += `</div>`;
      }
      if (works.length) {
        html += `<div class="pp-grp">Workplaces</div><div class="pp-cards">`;
        for (const wk of works) {
          const b = wk.b, def = wk.def;
          const plus = (Buildings.upgradeEffect ? (Buildings.upgradeEffect(b).slotPlus || 0) : 0);
          const slots = Math.max(0, (def.workerSlots || 0) + plus);
          const closed = Math.min(slots, Math.max(0, Math.round(b.closedSlots || 0)));
          const open = slots - closed;
          const w = Math.min(open, Math.round(b.workers || 0));
          const uc = b.built === false;
          // Missing input ⇒ a recipe input the town shelf is (almost) out of.
          let missing = "";
          if (!uc && def.inputs)
            for (const gid in def.inputs)
              if (((t.stock && t.stock[gid]) || 0) <= 0.05) missing += (missing ? ", " : "") + GOOD_LABEL(gid);
          const warn = uc || (open > 0 && w === 0) || !!missing;
          // === D: pending upgrade gets its own ⬆ badge (not the warn ⚠) — it's
          // expected/normal, just slow when delivery is starved.
          const upgPct = ppUpgradePct(b);
          const why = uc ? "under construction"
            : (missing ? "missing input: " + missing : (open > 0 && w === 0 ? "no workers" : ""));
          const pips = "●".repeat(w) + "○".repeat(Math.max(0, open - w)) + "🔒".repeat(closed);
          const tip = `${def.name}${(b.upgradeLevel || 1) > 1 ? " L" + b.upgradeLevel : ""} — ${w}/${open} workers` +
            (closed ? ` (${closed} locked)` : "") + (why ? " · ⚠ " + why : "") +
            (upgPct != null ? ` · ⬆ upgrading ${upgPct}%` : "") +
            (b.priority ? " · ⭐ priority" : "") + ". Click for details.";
          html += `<button class="pp-card" data-pp-b="${wk.i}" title="${escAttr(tip)}">` +
            `<span>${ppGlyph(b.typeId)}</span><span class="pips">${pips}</span>` +
            (b.priority ? `<span class="star">⭐</span>` : "") +
            (warn ? `<span class="badge">⚠</span>` : (upgPct != null ? `<span class="badge">⬆</span>` : "")) + `</button>`;
        }
        html += `</div>`;
      }
    }
    return html;
  }
  // === PP-B END ===

  // === PP-B === panel driver. The old renderOverview / renderUpgrade /
  // renderStock / renderBuildings / renderPopulation / CB-D roster renderers are
  // replaced by the PP-B header + 3 tabs above (upgrade moved into the header;
  // the Population tab's info lives in the Overview tier rows + the Buildings &
  // Workforce cards). `force` re-renders even under the cursor (player actions).
  function renderTownPanel(force) {
    if (!activeTown) return;
    // panel outlived its town (erased)? close.
    if (!state.towns.includes(activeTown)) { closeTownPanel(); return; }
    const t = activeTown;
    tpNameEl.textContent = "City #" + t.id;
    tpLevelEl.textContent = "Lv " + t.level;
    renderPPHead(t, force);
    // Live-refresh guard (RT-B ttRenderQueue pattern): skip the innerHTML rebuild
    // while a tooltip-bearing element (or clickable card/button) is hovered, so
    // open title-tooltips don't flicker and mid-click rebuilds can't eat clicks.
    const hovered = !force && tpBodyEl.querySelector("[title]:hover, button:hover");
    if (!hovered) {
      let html = "";
      if (activeTab === "warehouse") html = renderPPWarehouse(t);
      else if (activeTab === "buildings") html = renderPPBuildings(t);
      else html = renderPPOverview(t);
      tpBodyEl.innerHTML = html;
    }
    if (activeTab === "overview") drawPPBudget(t);   // canvas redraw is hover-safe
  }
  // === /PP-B ===

  function openTownPanel(town) {
    activeTown = ensureTown(town);
    panelEl.classList.remove("hidden");
    panelEl.setAttribute("aria-hidden", "false");
    renderTownPanel(true);   // PP-B: force a full first paint
  }
  function closeTownPanel() {
    // PV2-B: closing the town panel no longer cancels placement — the build bar
    // owns the placement session independently of any open panel.
    activeTown = null;
    panelEl.classList.add("hidden");
    panelEl.setAttribute("aria-hidden", "true");
  }

  // ---- PV2-B: building placement (driven by the bottom build bar) ----
  // === BUILD-BAR === bottom build bar DOM + wiring. Placement is NOT tied to a
  // selected town: startPlacing takes only a typeId; the owning city is resolved
  // per-hex on click by Buildings.canPlaceBuilding (res.town), and cost is charged
  // to THAT city.
  const buildBarEl = document.getElementById("buildBar");
  const buildBarCatsEl = document.getElementById("buildBarCats");
  const buildBarFlyoutEl = document.getElementById("buildBarFlyout");
  const buildBarHintEl = document.getElementById("buildBarHint");
  const buildBarCancelEl = document.getElementById("buildBarCancel");
  const BB_DEFAULT_HINT = "Pick a category, then a building to place.";

  function bbCostStr(cost) {
    const parts = [];
    if (cost && cost.gold) parts.push(cost.gold + "🪙");
    for (const gid in (cost || {})) { if (gid === "gold") continue; parts.push(cost[gid] + " " + goodIcon(gid)); }
    return parts.join(" · ") || "free";
  }
  function bbTerrainReq(def) {
    if (def.kind === "extractor" && def.adjacent) return "borders " + def.adjacent;
    if (def.kind === "extractor" && def.terrain) return def.terrain + " hex";
    return "any land";
  }

  // === CBM (Categorized build menu) ===
  // A row of category buttons; clicking one opens a flyout submenu above the bar.
  // Buildings are grouped at build time by their existing kind/workerTier/houseTier
  // (a new building drops into the right category automatically). The upper tiers
  // are UI-gated behind a research node — the gate is cosmetic only; the pure
  // placement logic (Buildings.canPlaceBuilding / chargeBuilding) is untouched.
  //  1. 🏗 Build  — City (town mode) · Road (road mode) · Bridge (coming soon).
  //  2. 🌾 Peasant — hut + every workerTier:'peasant' building.
  //  3. 🔨 Worker  — cottage + every workerTier:'worker' building.
  //  4. 👑 Burgher — manor + every workerTier:'burgher' building.
  // BAL: categories are ALWAYS open — availability is now per-building (startUnlocked
  // / unlockedBy), shown as a locked item inside the flyout, not a whole-category gate.
  const BUILD_CATEGORIES = [
    { id: "build",      icon: "🏗", label: "Build",      kind: "special" },
    { id: "peasant",    icon: "🌾", label: "Peasant",    kind: "tier", tier: "peasant" },
    { id: "worker",     icon: "🔨", label: "Worker",     kind: "tier", tier: "worker"  },
    { id: "burgher",    icon: "🎩", label: "Citizen",    kind: "tier", tier: "burgher" },
    { id: "aristocrat", icon: "👑", label: "Aristocrat", kind: "tier", tier: "aristocrat" },  // === CC: shown once aristocrat_home unlocks ===
  ];
  // BAL: per-building availability. A building is available iff it is a starter
  // (startUnlocked) or its unlockedBy research node has been unlocked.
  function bbBuildingAvailable(def) {
    if (!def) return false;
    if (def.startUnlocked) return true;
    if (!def.unlockedBy) return true;   // ungated (defensive: no field ⇒ available)
    return !!(typeof Research !== "undefined" && Research.has(state, def.unlockedBy));
  }
  function bbUnlockNodeName(def) {
    const node = (def && def.unlockedBy && typeof Research !== "undefined" && Research.get)
      ? Research.get(def.unlockedBy) : null;
    return node ? node.name : (def && def.unlockedBy) || "";
  }
  // Buildings whose worker/house tier matches (houses first, then producers).
  function bbTierBuildings(tier) {
    const all = Object.values(CONFIG.buildings);
    const houses = all.filter(d => d.kind === "house" && d.houseTier === tier);
    const producers = all.filter(d => d.kind !== "house" && d.workerTier === tier);
    return houses.concat(producers);
  }
  // A gated category is locked until its research node is unlocked.
  function bbCatLocked(cat) {
    return !!(cat.gate && !(typeof Research !== "undefined" && Research.has(state, cat.gate)));
  }
  function bbGateName(cat) {
    const node = (typeof Research !== "undefined" && Research.get) ? Research.get(cat.gate) : null;
    return node ? node.name : cat.gate;
  }

  let bbOpenCat = null;   // id of the category whose flyout is open (or null)

  // Build the category button row once (categories/buildings are static).
  function buildBuildBar() {
    let html = "";
    for (const cat of BUILD_CATEGORIES) {
      html += `<button type="button" class="bb-cat" data-cat="${esc(cat.id)}">
        <span class="bb-cat-icon">${cat.icon}</span>
        <span class="bb-cat-label">${esc(cat.label)}</span></button>`;
    }
    buildBarCatsEl.innerHTML = html;
    refreshCatButtons();
  }
  // A tier tab is shown only once it has at least one UNLOCKED building; Build is
  // always shown. So Worker/Burgher tabs stay hidden until their research lands.
  function bbCatVisible(cat) {
    if (!cat) return true;
    if (cat.kind === "special") return true;
    return bbTierBuildings(cat.tier).some(bbBuildingAvailable);
  }
  // Reflect visibility/open state on the category buttons (research can unlock live).
  function refreshCatButtons() {
    buildBarCatsEl.querySelectorAll(".bb-cat").forEach(btn => {
      const cat = BUILD_CATEGORIES.find(c => c.id === btn.dataset.cat);
      const visible = bbCatVisible(cat);
      btn.style.display = visible ? "" : "none";
      btn.classList.toggle("open", bbOpenCat === btn.dataset.cat);
      btn.title = cat ? cat.label : "";
    });
  }
  // Render the flyout body for a category into buildBarFlyoutEl.
  function renderFlyout(cat) {
    if (cat.kind === "special") {
      // Build: City / Road / Bridge / Destroy road / Destroy building. City &
      // Road switch build mode; Bridge is a stub. === J === Destroy road/building
      // are new "eraseRoad"/"eraseBuilding" modes (input.js) — destroying a road
      // needs no confirmation (matches the existing road-erase behaviour);
      // destroying a building always confirms via uiConfirm before removing it.
      const items = [
        { action: "town", name: "City", sub: "Found a new city", tip: "Enter town mode — click a valid site to found a city." },
        { action: "road", name: "Road", sub: "Lay a road (drag)", tip: "Enter road mode — drag across land to lay roads." },
        { action: "bridge", name: "Bridge", sub: "Coming soon", disabled: true, tip: "Bridges over water — coming soon." },
        { action: "eraseRoad", name: "Destroy road", sub: "Remove a road", tip: "Enter destroy-road mode — click or drag over a road to remove it. No confirmation." },
        { action: "eraseBuilding", name: "Destroy building", sub: "Remove a building", tip: "Enter destroy-building mode — click a building to remove it. Asks for confirmation; frees the slot, no refund." },
      ];
      let html = `<div class="bb-fly-title">🏗 Build</div>`;
      for (const it of items) {
        const active = !it.disabled && state.mode === it.action;
        html += `<button type="button" class="bb-btn${it.disabled ? " disabled" : ""}${active ? " active" : ""}"
          data-action="${esc(it.action)}"${it.disabled ? " aria-disabled=\"true\"" : ""} title="${esc(it.tip)}">
          <span class="bb-name">${esc(it.name)}</span>
          <span class="bb-cost">${esc(it.sub)}</span></button>`;
      }
      buildBarFlyoutEl.innerHTML = html;
      return;
    }
    // Tier category (Peasant/Worker/Burgher).
    if (bbCatLocked(cat)) {
      buildBarFlyoutEl.innerHTML = `<div class="bb-fly-title">${cat.icon} ${esc(cat.label)}</div>
        <div class="bb-fly-lock">🔒 Locked — research <b>${esc(bbGateName(cat))}</b> to unlock ${esc(cat.label.toLowerCase())} construction.</div>`;
      return;
    }
    const defs = bbTierBuildings(cat.tier).filter(bbBuildingAvailable);
    let html = `<div class="bb-fly-title">${cat.icon} ${esc(cat.label)}</div>`;
    for (const def of defs) {
      // Hide locked buildings entirely — only unlocked (researched/starter) ones show.
      const tip = esc(def.name + " — " + bbTerrainReq(def) + " · " + bbCostStr(def.cost));
      const active = placing && placing.typeId === def.id;
      html += `<button type="button" class="bb-btn${active ? " active" : ""}" data-typeid="${esc(def.id)}" title="${tip}">
        <span class="bb-name">${esc(def.name)}</span>
        <span class="bb-cost">${esc(bbCostStr(def.cost))}</span></button>`;
    }
    buildBarFlyoutEl.innerHTML = html;
  }
  // Open a category's flyout (locked categories don't open). Toggles closed if
  // the same category is clicked again. Positions the popover above the button.
  function openCategory(catId) {
    const cat = BUILD_CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    if (bbOpenCat === catId) { closeFlyout(); return; }
    if (bbCatLocked(cat)) {
      closeFlyout();
      buildBarHintEl.className = "bad";
      buildBarHintEl.textContent = "🔒 Research " + bbGateName(cat) + " to unlock " + cat.label + ".";
      refreshCatButtons();
      return;
    }
    bbOpenCat = catId;
    renderFlyout(cat);
    buildBarFlyoutEl.classList.remove("hidden");
    // Anchor the flyout above the clicked button (clamped within the bar).
    const btn = buildBarCatsEl.querySelector(`.bb-cat[data-cat="${catId}"]`);
    if (btn) {
      const left = Math.max(0, Math.min(btn.offsetLeft, buildBarEl.clientWidth - buildBarFlyoutEl.offsetWidth - 4));
      buildBarFlyoutEl.style.left = left + "px";
    }
    refreshCatButtons();
  }
  function closeFlyout() {
    if (bbOpenCat === null) return;
    bbOpenCat = null;
    buildBarFlyoutEl.classList.add("hidden");
    refreshCatButtons();
  }
  // Reflect the active type + cancel button; reset the hint when idle. Also keeps
  // the flyout item highlight and category lock state in sync.
  function updateBuildBar() {
    if (bbOpenCat) {
      const cat = BUILD_CATEGORIES.find(c => c.id === bbOpenCat);
      if (cat) renderFlyout(cat);   // refresh active-item highlight
    }
    refreshCatButtons();
    if (placing) {
      buildBarCancelEl.classList.remove("hidden");
    } else {
      buildBarCancelEl.classList.add("hidden");
      if (!buildBarHintEl.classList.contains("bad")) {
        buildBarHintEl.className = "";
        buildBarHintEl.textContent = BB_DEFAULT_HINT;
      }
    }
  }

  // Enter placement mode for `typeId`. Forces pan mode so the map stays draggable
  // and the road/town/erase tools don't interfere. Toggles off if re-selected.
  function startPlacing(typeId) {
    const bdef = CONFIG.buildings[typeId];
    if (!bdef) return;
    // BAL: never enter placement for a research-locked building (defensive — the
    // menu already disables it).
    if (!bbBuildingAvailable(bdef)) {
      buildBarHintEl.className = "bad";
      buildBarHintEl.textContent = "🔒 Research " + bbUnlockNodeName(bdef) + " to unlock " + bdef.name + ".";
      return;
    }
    if (placing && placing.typeId === typeId) { cancelPlacing(); return; }
    cancelPlacingResearchCenter();   // RESEARCH CENTER (Slice C): the two placement sessions are exclusive
    setMode("pan");
    placing = { typeId };
    closeFlyout();   // CBM: selecting an item closes the submenu
    buildBarHintEl.className = "";
    buildBarHintEl.textContent = "Placing " + (CONFIG.buildings[typeId].name || typeId) +
      " — click a hex bordering a city.";
    updateBuildBar();
    if (activeTown) renderTownPanel();
  }
  function cancelPlacing() {
    if (!placing) return;
    placing = null;
    updateBuildBar();
    if (activeTown) renderTownPanel();
  }
  // Place the active building at the screen point. Resolves the OWNING city via
  // Buildings.canPlaceBuilding(res.town), charges def.cost to THAT city, pushes
  // { typeId, q, r, workers:0 } (Sim.tick assigns real workers), and stays in
  // placement mode so several can be placed. Exits only when no city has a free slot.
  function tryPlaceBuilding(sx, sy) {
    if (!placing) return;
    const h = hexAtScreen(sx, sy);
    const res = Buildings.canPlaceBuilding(state, placing.typeId, h.q, h.r);
    if (!res.ok) {
      buildBarHintEl.textContent = "✗ " + res.reason;
      buildBarHintEl.className = "bad";
      return;
    }
    const owner = res.town;
    const def = CONFIG.buildings[placing.typeId];
    // EC-A: split the charge — gold → Kingdom treasury, resources → city stock.
    Buildings.chargeBuilding(state, owner, placing.typeId);
    if (!Array.isArray(owner.buildings)) owner.buildings = [];
    // CB-A: a building with resource cost is placed UNDER CONSTRUCTION
    // (built:false); a gold-only/free building is built instantly. delivered
    // tracks materials brought in; closedSlots/priority are player logistics
    // controls (CB-B/C/D UI).
    owner.buildings.push({
      typeId: placing.typeId, q: h.q, r: h.r, workers: 0,
      built: Buildings.isInstant(def), delivered: {}, closedSlots: 0, priority: false,
      // === RU-A: per-building upgrade state (helpers default these when absent) ===
      upgradeLevel: 1, pendingUpgrade: null,
      // === /RU-A ===
    });
    // (Instant/gold-only buildings are counted for mission `construct` objectives
    // inside Buildings.chargeBuilding — the canonical pure-core charge point — so
    // no count is needed here; doing so would double-count.)
    if (typeof updateTreasuryHud === "function") updateTreasuryHud();
    scheduleSave();
    SFX.play("place");
    buildBarHintEl.textContent = "✓ Built " + (def.name || placing.typeId) + " in Town #" + owner.id;
    buildBarHintEl.className = "ok";
    // Exit only if NO city can accept another building (all slot caps reached).
    const anyRoom = state.towns.some(t => Buildings.usedSlots(t) < Buildings.slotCap(t.level, state));
    if (!anyRoom) cancelPlacing();
    if (activeTown) renderTownPanel();
  }

  // === RESEARCH CENTER (Slice C) — placement UX. Mirrors startPlacing/
  // cancelPlacing/tryPlaceBuilding above, but drives Buildings.canPlaceResearchCenter
  // /placeResearchCenter directly (a unique castle-adjacent building, not owned by
  // any town, so there's no per-hex owner resolution). Only one Center is ever
  // allowed — callers (build bar / Keep tab button) should hide/disable the entry
  // point once state.researchCenter exists, but this guards defensively too.
  function startPlacingResearchCenter() {
    if (state.researchCenter) return;
    if (placingResearchCenter) { cancelPlacingResearchCenter(); return; }
    cancelPlacing();   // exclusive with town-building placement
    setMode("pan");
    placingResearchCenter = true;
    closeFlyout();
    buildBarHintEl.className = "";
    buildBarHintEl.textContent = "Placing the Research Center — click a hex next to the castle.";
    updateBuildBar();
  }
  function cancelPlacingResearchCenter() {
    if (!placingResearchCenter) return;
    placingResearchCenter = false;
    updateBuildBar();
  }
  // Place the Research Center at the screen point. No owning-town charge split —
  // Buildings.placeResearchCenter bills the build gold straight to the treasury.
  function tryPlaceResearchCenter(sx, sy) {
    if (!placingResearchCenter) return;
    const h = hexAtScreen(sx, sy);
    const res = Buildings.canPlaceResearchCenter(state, h.q, h.r);
    if (!res.ok) {
      showToast("✗ " + res.reason);
      buildBarHintEl.textContent = "✗ " + res.reason;
      buildBarHintEl.className = "bad";
      return;
    }
    Buildings.placeResearchCenter(state, h.q, h.r);
    cancelPlacingResearchCenter();
    if (typeof updateTreasuryHud === "function") updateTreasuryHud();
    scheduleSave();
    SFX.play("place");
    if (castleOpen) renderCastlePanel(true);
  }
  // === /RESEARCH CENTER (Slice C) ===

  // Bottom-bar wiring.
  buildBuildBar();
  updateBuildBar();
  // Category button row: open/toggle the flyout for the clicked category.
  buildBarCatsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".bb-cat");
    if (btn) openCategory(btn.dataset.cat);
  });
  // Flyout item clicks: a building typeId enters placement; a Build action
  // (City/Road/Destroy road/Destroy building) switches build mode; Bridge is a
  // disabled stub. === J === eraseRoad/eraseBuilding are the new destroy modes;
  // input.js's canPlace/place implement the actual click behaviour per mode.
  buildBarFlyoutEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".bb-btn");
    if (!btn || btn.classList.contains("disabled")) return;
    if (btn.dataset.typeid) { startPlacing(btn.dataset.typeid); return; }
    const action = btn.dataset.action;
    if (action === "town" || action === "road" || action === "eraseRoad" || action === "eraseBuilding") {
      cancelPlacing();          // leaving building placement for a map tool
      closeFlyout();
      setMode(action);
      buildBarHintEl.className = "";
      buildBarHintEl.textContent =
        action === "town" ? "Click a valid site to found a city."
        : action === "road" ? "Drag across land to lay roads."
        : action === "eraseRoad" ? "Click or drag over a road to remove it — no confirmation."
        : "Click a building to destroy it — confirmation required, frees the slot, no refund.";
    }
  });
  buildBarCancelEl.addEventListener("click", () => cancelPlacing());
  // Click outside the build bar closes an open flyout.
  document.addEventListener("mousedown", (e) => {
    if (bbOpenCat && !buildBarEl.contains(e.target)) closeFlyout();
  });
  // Keep category lock state live as research completes (accumulator unlocks it).
  setInterval(refreshCatButtons, 500);

  // === PP-B === delegated panel clicks. Header strip: town upgrade (P4-B logic)
  // + Give/Take 1k (EC-C transfer via window.CityCards — same cooldown/ledger
  // path as the city-cards strip). Body: warehouse sort + building-card clicks.
  ppHeadEl.addEventListener("click", (e) => {
    if (!activeTown) return;
    if (e.target.closest("[data-town-upgrade]")) {
      const res = Town.upgrade(activeTown);
      if (res.ok) { scheduleSave(); renderTownPanel(true); SFX.play("levelup", "town upgrade"); }
      return;
    }
    if (e.target.closest("[data-pp-give]")) {
      if (window.CityCards && CityCards.give(activeTown)) renderTownPanel(true);
      return;
    }
    if (e.target.closest("[data-pp-take]")) {
      if (window.CityCards && CityCards.take(activeTown)) renderTownPanel(true);
    }
  });
  tpBodyEl.addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-pp-sort]");
    if (sortBtn) { ppWhSort = sortBtn.dataset.ppSort; renderTownPanel(true); return; }
    const card = e.target.closest("[data-pp-b]");
    if (card && activeTown) {
      const b = (activeTown.buildings || [])[+card.dataset.ppB];
      if (b && window.BuildingUI) BuildingUI.openBuildingPanel(activeTown, b);
    }
  });
  // === /PP-B ===

  tpTabEls.forEach(btn => btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    tpTabEls.forEach(b => b.classList.toggle("active", b === btn));
    renderTownPanel(true);   // PP-B: tab switch always repaints
  }));
  document.getElementById("tpClose").addEventListener("click", closeTownPanel);

  // === BUILD-BAR === live placement hint in the bottom bar. While placing a
  // building, show the per-hex validity/reason from canPlaceBuilding; while the
  // Town tool is active, show the town-center reason from canPlaceTown; else idle.
  canvas.addEventListener("mousemove", (e) => {
    const h = hexAtScreen(e.clientX, e.clientY);
    if (placingResearchCenter) {
      // RESEARCH CENTER (Slice C): live validity hint while placing the Center.
      const res = Buildings.canPlaceResearchCenter(state, h.q, h.r);
      buildBarHintEl.textContent = res.ok ? "✓ valid — click to build the Research Center" : "✗ " + res.reason;
      buildBarHintEl.className = res.ok ? "ok" : "bad";
    } else if (placing) {
      const res = Buildings.canPlaceBuilding(state, placing.typeId, h.q, h.r);
      buildBarHintEl.textContent = res.ok
        ? "✓ valid — click to build in Town #" + res.town.id
        : "✗ " + res.reason;
      buildBarHintEl.className = res.ok ? "ok" : "bad";
    } else if (state.mode === "town") {
      // === POLISH: canPlaceTown is pure and knows nothing about fog, but the
      // real click-time gate (canPlace() above) also requires isVisible(k) —
      // so a still-fogged hex could show "✓ valid town site" here and then
      // silently no-op on click. Mirror the same fog check the click path
      // uses so the hint never lies. ===
      const k = HexMath.key(h.q, h.r);
      const fogged = !isVisible(k);
      const res = fogged ? { ok: false, reason: "Unexplored — reveal this area first" } : Buildings.canPlaceTown(state, h.q, h.r);
      buildBarHintEl.textContent = res.ok ? "✓ valid town site — click to found a city" : "✗ " + res.reason;
      buildBarHintEl.className = res.ok ? "ok" : "bad";
    } else if (state.mode === "eraseRoad") {
      // === J === live hint for the road-destroy mode (no confirmation on click).
      const ok = state.roads.has(HexMath.key(h.q, h.r));
      buildBarHintEl.textContent = ok ? "✓ road here — click or drag to destroy it" : "✗ no road on this hex";
      buildBarHintEl.className = ok ? "ok" : "bad";
    } else if (state.mode === "eraseBuilding") {
      // === J === live hint for the building-destroy mode (click always confirms).
      const hit = (typeof buildingAtHex === "function") ? buildingAtHex(h.q, h.r) : null;
      const name = hit ? ((CONFIG.buildings[hit.b.typeId] || {}).name || hit.b.typeId) : "";
      buildBarHintEl.textContent = hit ? "✓ click to destroy this " + name + " (confirmation required)" : "✗ no building on this hex";
      buildBarHintEl.className = hit ? "ok" : "bad";
    } else if (buildBarHintEl.textContent !== BB_DEFAULT_HINT) {
      buildBarHintEl.className = "";
      buildBarHintEl.textContent = BB_DEFAULT_HINT;
    }
  });
  // Esc cancels placement.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (bbOpenCat) { closeFlyout(); return; }   // CBM: Esc closes the flyout first
    if (placingResearchCenter) { cancelPlacingResearchCenter(); return; }   // RESEARCH CENTER (Slice C)
    if (placing) cancelPlacing();
  });

  // Town-click detection: a non-drag left click on a town center opens the panel.
  // We track our own down-position so a camera drag (which still fires a `click`)
  // is not mistaken for a click. Only in pan mode, so build/erase keep their own
  // click behaviour and panning is never blocked.
  let tuiDown = null;
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) tuiDown = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("click", (e) => {
    const down = tuiDown; tuiDown = null;
    if (!down) return;
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) return; // a drag
    // TI-C: while placing, a non-drag left click drops the building (and never
    // opens/closes the panel or is treated as a town click).
    // RESEARCH CENTER (Slice C): the Center's own placement session takes the
    // click first — same "drop and stay exclusive" pattern as building placement.
    if (placingResearchCenter) { tryPlaceResearchCenter(e.clientX, e.clientY); return; }
    if (placing) { tryPlaceBuilding(e.clientX, e.clientY); return; }
    if (state.mode !== "pan") return;
    const h = hexAtScreen(e.clientX, e.clientY);
    // RESEARCH CENTER (Slice C): a click on the Center's hex opens its own panel
    // (never the town/building panel — it belongs to no town).
    if (state.researchCenter && state.researchCenter.q === h.q && state.researchCenter.r === h.r) {
      openResearchCenterPanel(); return;
    }
    // === CB-C: a non-drag click on a BUILDING hex opens that building's detail
    // panel (and never the town panel). Town-CENTRE clicks still open the town.
    const hit = buildingAtHex(h.q, h.r);
    if (hit) { openBuildingPanel(hit.town, hit.b); return; }
    // === /CB-C ===
    const town = state.towns.find(t => t.q === h.q && t.r === h.r);
    if (town) { closeBuildingPanel(); openTownPanel(town); }
    else { if (activeTown) closeTownPanel(); if (bpBuilding || rcPanelOpen) closeBuildingPanel(); }
  });

  // Live refresh: reflect stock/price/pop changes as the economy ticks (T4 later)
  // and keep prices lerping via priceFor even before Sim.tick exists.
  setInterval(() => { if (activeTown) renderTownPanel(); }, 500);

  // === CB-C: per-building detail panel ======================================
  // A DOM panel (#buildingPanel) mirroring the town panel look, showing ONE
  // building: construction progress, output/inputs, workers, per-slot open/close
  // toggles (b.closedSlots), and a priority star (b.priority). Everything is
  // guarded so it runs before CB-A merges (legacy buildings lack the new fields)
  // and cleanly uses CB-A's pure helpers once they exist.
  const bpEl = document.getElementById("buildingPanel");
  const bpNameEl = document.getElementById("bpName");
  const bpTierEl = document.getElementById("bpTier");
  const bpBodyEl = document.getElementById("bpBody");
  let bpBuilding = null;     // the town.buildings[] entry currently shown
  let bpTown = null;         // its owning town

  // Local fallbacks: use CB-A's helpers when present, otherwise compute inline so
  // this slice works standalone (and never throws on boot).
  function bpResourceCost(def) {
    if (Buildings && typeof Buildings.resourceCost === "function") return Buildings.resourceCost(def);
    const out = {};
    if (def && def.cost) for (const g in def.cost) { if (g === "gold") continue; if (def.cost[g] > 0) out[g] = def.cost[g]; }
    return out;
  }
  function bpConstructionNeed(b) {
    if (Buildings && typeof Buildings.constructionNeed === "function") return Buildings.constructionNeed(b);
    if (!b || b.built !== false) return {};
    const rc = bpResourceCost(CONFIG.buildings[b.typeId]); const d = b.delivered || {}; const out = {};
    for (const g in rc) { const rem = rc[g] - (d[g] || 0); if (rem > 0) out[g] = rem; }
    return out;
  }
  const bpIsBuilt = b => !b || b.built !== false;   // legacy (no flag) → built

  // Find the building sitting on hex (q,r) plus its town, or null.
  function buildingAtHex(q, r) {
    const towns = (state && Array.isArray(state.towns)) ? state.towns : [];
    for (const t of towns) {
      const list = Array.isArray(t.buildings) ? t.buildings : [];
      for (const b of list) if (b && b.q === q && b.r === r) return { town: t, b };
    }
    return null;
  }

  function openBuildingPanel(town, b) {
    bpTown = town; bpBuilding = b;
    rcPanelOpen = false;                 // RESEARCH CENTER (Slice C): shares this DOM panel — exclusive
    closeTownPanel();                    // one detail panel at a time
    bpEl.classList.remove("hidden");
    bpEl.setAttribute("aria-hidden", "false");
    renderBuildingPanel();
  }
  function closeBuildingPanel() {
    bpBuilding = null; bpTown = null; rcPanelOpen = false;
    bpEl.classList.add("hidden");
    bpEl.setAttribute("aria-hidden", "true");
  }

  // === RESEARCH CENTER (Slice C) — click panel. The Center belongs to no town,
  // so it reuses the #buildingPanel DOM (bpEl/bpNameEl/bpTierEl/bpBodyEl) under a
  // separate `rcPanelOpen` flag instead of bpBuilding/bpTown (which stay null here).
  // closeBuildingPanel() above already clears rcPanelOpen, so every existing
  // "close the detail panel" call site (town click, Esc, opening the tech tree /
  // Kingdom screen, etc.) closes this panel too, for free.
  let rcPanelOpen = false;
  function openResearchCenterPanel() {
    if (!state.researchCenter) return;
    bpBuilding = null; bpTown = null;
    closeTownPanel();
    rcPanelOpen = true;
    bpEl.classList.remove("hidden");
    bpEl.setAttribute("aria-hidden", "false");
    renderResearchCenterPanel();
  }
  function renderResearchCenterPanel() {
    if (!rcPanelOpen) return;
    const c = state.researchCenter;
    if (!c) { closeBuildingPanel(); return; }   // outlived its Center (shouldn't happen — unique/permanent)
    bpNameEl.textContent = (CONFIG.researchCenter && CONFIG.researchCenter.name) || "Research Center";
    bpTierEl.textContent = c.built ? ("Level " + (c.level || 1)) : "Under construction";

    let html = `<div class="tp-row"><span class="k">Hex</span><span class="v">${c.q}, ${c.r}</span></div>`;

    if (!c.built) {
      const cost = (CONFIG.researchCenter.build && CONFIG.researchCenter.build.cost) || {};
      const need = Research.centerConstructionNeed(state);
      html += `<div class="tp-sec">Under construction</div>`;
      html += `<div style="margin:4px 0 6px">${bpUpgradeChips(cost, c.delivered) || "<span class='tp-empty'>no materials required</span>"}</div>`;
      const needStr = Object.keys(need).map(g => fmt(need[g]) + " " + goodIcon(g) + " " + GOOD_LABEL(g)).join(" · ");
      html += `<div class="tp-hint2">Still needs: ${needStr ? esc(needStr) : "nothing — finishing up"} (delivered from the King's stock, ${fmt(perMin(CONFIG.researchCenter.deliveryRate))}/min).</div>`;
    } else {
      const speed = Research.centerSpeed(state);
      html += `<div class="tp-sec">Status</div><div class="bp-status built">✔ Operational</div>`;
      html += `<div class="tp-row"><span class="k">Research speed</span><span class="v">${fmt(speed * 60)} materials/min</span></div>`;

      html += `<div class="tp-sec">Upgrade</div>`;
      if (c.pendingUpgrade) {
        const need = Research.centerUpgradeNeed(state);
        const needStr = Object.keys(need).map(g => fmt(need[g]) + " " + goodIcon(g) + " " + GOOD_LABEL(g)).join(" · ");
        html += `<div class="bp-status">⬆ Upgrading to Level ${c.pendingUpgrade.toLevel}…</div>`;
        html += `<div style="margin:4px 0 6px">${bpUpgradeChips(c.pendingUpgrade.cost, c.pendingUpgrade.delivered) || "<span class='tp-empty'>no materials required</span>"}</div>`;
        html += `<div class="tp-hint2">Still needs: ${needStr ? esc(needStr) : "nothing — finishing up"}</div>`;
      } else {
        const nxt = Buildings.centerNextUpgrade(state);
        if (nxt) {
          const matCost = {};
          for (const g in (nxt.cost || {})) if (g !== "gold") matCost[g] = nxt.cost[g];
          const gold = (nxt.cost && nxt.cost.gold) || 0;
          const can = Buildings.canUpgradeCenter(state);
          html += `<div class="tp-row"><span class="k">Level ${nxt.level} — ${fmt(nxt.speed * 60)}/min</span><span class="v">${fmt(gold)}g</span></div>`;
          html += `<div style="margin:4px 0 6px">${bpUpgradeChips(matCost, {}) || "<span class='tp-empty'>no materials required</span>"}</div>`;
          html += `<button class="bp-star" data-rc-upgrade ${can.ok ? "" : "disabled"} title="${can.ok ? "" : esc(can.reason || "")}">Upgrade${can.ok ? "" : " — " + esc(can.reason || "unavailable")}</button>`;
        } else {
          html += `<div class="tp-hint2">Max level.</div>`;
        }
      }
    }

    bpBodyEl.innerHTML = html;
  }
  // === /RESEARCH CENTER (Slice C) ===

  function renderBuildingPanel() {
    const b = bpBuilding, town = bpTown;
    if (!b) return;
    // panel outlived its building/town (erased)? close.
    if (!town || !state.towns.includes(town) ||
        !Array.isArray(town.buildings) || town.buildings.indexOf(b) < 0) {
      closeBuildingPanel(); return;
    }
    const def = CONFIG.buildings[b.typeId] || {};
    const tier = def.workerTier || def.houseTier || "";
    bpNameEl.textContent = def.name || b.typeId;
    bpTierEl.textContent = (def.kind || "") + (tier ? " · " + tier : "");

    let html = `<div class="tp-row"><span class="k">Hex</span><span class="v">${b.q}, ${b.r}</span></div>`;

    // --- construction status ---
    if (bpIsBuilt(b)) {
      html += `<div class="tp-sec">Status</div><div class="bp-status built">✔ Operational</div>`;
    } else {
      const rc = bpResourceCost(def);
      const delivered = b.delivered || {};
      html += `<div class="tp-sec">Under construction</div>`;
      let chips = "";
      for (const gid in rc) {
        const c = goodColor(gid);
        chips += `<span class="bp-chip" style="border-color:${c}"><span class="bp-dot" style="background:${c}"></span>${goodIcon(gid)} ${esc(GOOD_LABEL(gid))} ${fmt(delivered[gid] || 0)}/${fmt(rc[gid])}</span>`;
      }
      html += `<div style="margin:4px 0 6px">${chips || "<span class='tp-empty'>no materials required</span>"}</div>`;
      const need = bpConstructionNeed(b);
      const needStr = Object.keys(need).map(g => fmt(need[g]) + " " + goodIcon(g) + " " + GOOD_LABEL(g)).join(" · ");
      html += `<div class="tp-hint2">Still needs: ${needStr ? esc(needStr) : "nothing — finishing up"}</div>`;
    }

    // --- output / inputs / housing ---
    if (def.output) {
      const c = goodColor(def.output.goodId);
      html += `<div class="tp-sec">Output</div>
        <div class="tp-row"><span class="k"><span class="bp-dot" style="background:${c}"></span>${goodIcon(def.output.goodId)} ${esc(GOOD_LABEL(def.output.goodId))}</span><span class="v">×${fmt(perMin(def.output.ratePerWorker))}/wkr/min</span></div>`;
    }
    if (def.inputs && Object.keys(def.inputs).length) {
      html += `<div class="tp-sec">Inputs / worker / min</div>`;
      for (const gid in def.inputs) {
        const c = goodColor(gid);
        html += `<div class="tp-row"><span class="k"><span class="bp-dot" style="background:${c}"></span>${goodIcon(gid)} ${esc(GOOD_LABEL(gid))}</span><span class="v">${fmt(perMin(def.inputs[gid]))}</span></div>`;
      }
    }
    // === PP-D === house view (LTT "Peasant Home"): residents, needs rings,
    // income and a per-tier happiness meter — replaces the old bare Housing
    // capacity row. Producers keep their existing Output/Inputs body above.
    if (def.kind === "house") {
      const tl = PPD_TIER_LABEL[def.houseTier] || tier;
      bpTierEl.textContent = (def.kind || "") + (tl ? " · " + tl : "");
      html += renderHouseBody(town, b, def);
    }
    // === /PP-D ===

    // --- workers + slot pips (producers only; houses have no workerTier) ---
    if (def.workerTier) {
      const total = def.workerSlots || 0;
      const closed = Math.max(0, Math.min(total, b.closedSlots || 0));
      const effective = total - closed;
      const workers = Math.round(b.workers || 0);
      html += `<div class="tp-sec">Workers — ${workers} / ${effective}${closed ? " · " + closed + " closed" : ""}</div>`;
      let pips = "";
      for (let i = 0; i < total; i++) {
        const isClosed = i >= effective;          // the last `closed` slots are locked
        if (isClosed) pips += `<div class="bp-slot closed" data-slot title="Closed — click to open">🔒</div>`;
        else if (i < workers) pips += `<div class="bp-slot filled" data-slot title="Staffed — click to close this slot">👷</div>`;
        else pips += `<div class="bp-slot open" data-slot title="Open — click to close this slot"></div>`;
      }
      html += `<div class="bp-slots">${pips}</div>`;
      html += `<div class="tp-hint2">Click a slot to open/close it — closed slots take no workers.</div>`;
    }

    // --- priority star ---
    const pri = !!b.priority;
    html += `<div class="tp-sec">Priority</div>
      <button class="bp-star ${pri ? "on" : ""}" data-priority title="Priority buildings are staffed and supplied first">${pri ? "★" : "☆"} Priority ${pri ? "on" : "off"}</button>`;

    // === RU-B: per-building upgrade section (only when this type has a ladder) ===
    html += renderUpgradeSection(town, b);
    // === /RU-B ===

    bpBodyEl.innerHTML = html;
  }

  // === RU-B: builds the "Upgrades" section markup for the building panel.
  // Guarded throughout — never throws when RU-A helpers / research / ladders
  // are absent (legacy buildings, or a type with no CONFIG.upgrades entry).
  function bpEffectSummary(effect) {
    if (!effect) return "";
    const parts = [];
    if (effect.capacityPlus) parts.push(`+${effect.capacityPlus} capacity`);
    if (effect.slotPlus) parts.push(`+${effect.slotPlus} worker slot${effect.slotPlus > 1 ? "s" : ""}`);
    if (typeof effect.outputMult === "number" && effect.outputMult !== 1) {
      const pct = Math.round((effect.outputMult - 1) * 100);
      parts.push(`${pct >= 0 ? "+" : ""}${pct}% output`);
    }
    if (typeof effect.basicConsumptionMult === "number" && effect.basicConsumptionMult !== 1) {
      const pct = Math.round((1 - effect.basicConsumptionMult) * 100);
      parts.push(`${pct >= 0 ? "-" : "+"}${Math.abs(pct)}% basic consumption`);
    }
    return parts.join(" · ");
  }
  function bpUpgradeChips(rc, delivered) {
    delivered = delivered || {};
    let chips = "";
    for (const gid in rc) {
      const c = goodColor(gid);
      chips += `<span class="bp-chip" style="border-color:${c}"><span class="bp-dot" style="background:${c}"></span>${goodIcon(gid)} ${esc(GOOD_LABEL(gid))} ${fmt(delivered[gid] || 0)}/${fmt(rc[gid])}</span>`;
    }
    return chips;
  }
  function renderUpgradeSection(town, b) {
    if (!b || typeof Buildings === "undefined" || typeof Buildings.upgradeLadder !== "function") return "";
    const ladder = Buildings.upgradeLadder(b.typeId);
    if (!Array.isArray(ladder) || !ladder.length) return "";   // no ladder for this type: hidden
    const level = b.upgradeLevel || 1;
    let out = `<div class="tp-sec">Upgrades</div><div class="tp-row"><span class="k">Level</span><span class="v">${level}</span></div>`;

    if (b.pendingUpgrade) {
      const rc = (typeof Buildings.upgradeResourceCost === "function") ? Buildings.upgradeResourceCost(b.typeId, b.pendingUpgrade.toLevel) : {};
      const chips = bpUpgradeChips(rc, b.pendingUpgrade.delivered);
      // === D: this is the state a stalled delivery pipeline leaves an upgrade
      // in for a long time — show a % bar + explicit "waiting on" line so it
      // never reads as nothing-happened, independent of how fast CoreDev's
      // delivery fix actually moves materials.
      const pct = ppUpgradePct(b);
      const waitStr = ppUpgradeWaitStr(town, b);
      out += `<div class="bp-status">⬆ Upgrading to Lv${b.pendingUpgrade.toLevel}… ${pct}%</div>`;
      out += `<div class="tp-tbar"><span class="bar${pct > 0 ? "" : " idle"}"><span style="width:${pct}%"></span></span><span class="st">${pct}%</span></div>`;
      out += `<div style="margin:4px 0 6px">${chips || "<span class='tp-empty'>no materials required</span>"}</div>`;
      out += `<div class="tp-hint2">${waitStr ? "Waiting on delivery: " + esc(waitStr) : "All materials delivered — finishing up"}</div>`;
      return out;
    }

    const nxt = (typeof Buildings.nextUpgrade === "function") ? Buildings.nextUpgrade(state, b) : null;
    if (nxt) {
      const rc = (typeof Buildings.upgradeResourceCost === "function") ? Buildings.upgradeResourceCost(b.typeId, nxt.level) : {};
      const chips = bpUpgradeChips(rc, {});
      const goldCost = (nxt.cost && nxt.cost.gold) || 0;
      const effectStr = bpEffectSummary(nxt.effect);
      const can = (typeof Buildings.canStartUpgrade === "function") ? Buildings.canStartUpgrade(state, town, b) : { ok: false, reason: "Unavailable" };
      out += `<div class="bp-upgrade-next">
        <div class="tp-row"><span class="k">${esc(nxt.name)}</span><span class="v">${fmt(goldCost)}g</span></div>
        <div style="margin:4px 0 6px">${chips}</div>
        ${effectStr ? `<div class="tp-hint2">${esc(effectStr)}</div>` : ""}
        <button class="bp-star" data-upgrade ${can.ok ? "" : "disabled"} title="${can.ok ? "" : esc(can.reason || "")}">Upgrade${can.ok ? "" : " — " + esc(can.reason || "unavailable")}</button>
      </div>`;
      return out;
    }

    // Not the pending/next-available case — either locked (research needed) or maxed out.
    const lockedEntry = (typeof Buildings.upgradeAt === "function") ? Buildings.upgradeAt(b.typeId, level + 1) : null;
    if (lockedEntry) {
      let nodeName = lockedEntry.unlockedBy;
      if (typeof Research !== "undefined" && Research.get) {
        const node = Research.get(lockedEntry.unlockedBy);
        if (node && node.name) nodeName = node.name;
      }
      out += `<div class="tp-hint2">🔒 Research ${esc(nodeName || "")} to unlock Lv${lockedEntry.level}</div>`;
    } else {
      out += `<div class="tp-hint2">Max level.</div>`;
    }
    return out;
  }
  // === /RU-B ===

  // === PP-D === house-view helpers (UI only — reads Sim/Buildings, mutates nothing).
  // Everything is guarded: legacy states without tierHappiness/tierIncome/pop, or
  // missing Sim/Buildings helpers, fall back to sensible defaults and never throw.
  const PPD_TIER_LABEL = { peasant: "Peasant", worker: "Worker", burgher: "Citizen", aristocrat: "Aristocrat" };  // === CC ===
  const PPD_TIER_GLYPH = { peasant: "🧑‍🌾", worker: "👷", burgher: "🎩", aristocrat: "👑" };
  const PPD_TIER_KEY   = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };

  // Effective capacity = base houseCapacity + upgrade capacityPlus (RU-A ladder).
  function ppdHouseCapacity(b, def) {
    let cap = (def && def.houseCapacity) || 0;
    try {
      if (typeof Buildings !== "undefined" && typeof Buildings.upgradeEffect === "function")
        cap += (Buildings.upgradeEffect(b).capacityPlus || 0);
    } catch (e) { /* legacy building shapes: base capacity only */ }
    return cap;
  }

  // Occupants attributed to THIS house: the tier's live population split across
  // that tier's houses by capacity share (same attribution as Sim.houseIncome).
  function ppdOccupants(town, b, def) {
    const key = PPD_TIER_KEY[def.houseTier];
    const pop = (key && town.pop && town.pop[key]) || 0;
    if (pop <= 0) return 0;
    let totalCap = 0;
    for (const ob of (town.buildings || [])) {
      const d = CONFIG.buildings[ob.typeId];
      if (!d || d.kind !== "house" || d.houseTier !== def.houseTier) continue;
      totalCap += ppdHouseCapacity(ob, d);
    }
    const thisCap = ppdHouseCapacity(b, def);
    return totalCap > 0 ? pop * (thisCap / totalCap) : 0;
  }

  // Per-good satisfaction 0..1 — APPROXIMATION: per-good satisfaction (Sim's
  // `gsat`) is a tick-local and isn't persisted per town, so the ring shows
  // stock COVERAGE: town stock vs ~10 ticks of this tier's demand. A tier with
  // no demand (empty house) reads pure availability (stocked shelf = full ring).
  function ppdCoverage(town, gid, ratePerTick, tierPop) {
    const stock = (town.stock && town.stock[gid]) || 0;
    const need = ratePerTick * tierPop * 10;
    if (need <= 0) return stock > 0 ? 1 : 0;
    return Math.max(0, Math.min(1, stock / need));
  }

  // One row of need rings: goodIcon inside a conic-gradient satisfaction ring
  // (green fill % = coverage) + the per-resident consumption rate under it.
  function ppdNeedsRow(title, goods, rates, town, tierPop) {
    let cells = "";
    for (const gid of (goods || [])) {
      const r = (rates && rates[gid]) || 0;
      if (r <= 0) continue;                       // this tier doesn't consume it
      const cov = ppdCoverage(town, gid, r, tierPop);
      const deg = Math.round(cov * 360);
      const c = goodColor(gid);
      cells += `<div class="ppd-need" data-ppd-ring="${esc(gid)}" title="${esc(GOOD_LABEL(gid))} — ${Math.round(cov * 100)}% covered · ${fmt(perMin(r))} / resident / min">
        <div class="ppd-ring" style="background:conic-gradient(#6fbf73 ${deg}deg, #33291d ${deg}deg)">
          <div class="ppd-ring-core" style="border-color:${c}">${goodIcon(gid)}</div>
        </div>
        <div class="ppd-rate">${fmt(perMin(r))}/min</div>
      </div>`;
    }
    if (!cells) return "";
    return `<div class="tp-sec">${esc(title)}</div><div class="ppd-needs">${cells}</div>`;
  }

  // The house body: residents strip → basic/luxury need rings → income →
  // happiness meter. Pure markup builder (renderBuildingPanel injects it).
  function renderHouseBody(town, b, def) {
    const N = CONFIG.needs || {};
    const key = PPD_TIER_KEY[def.houseTier];
    // === CC: per-tier needs — rates + basic/extra lists come from N.tiers[key]. ===
    const spec = (key && N.tiers && N.tiers[key]) || { basic: [], extra: [], perCapita: {} };
    const rates = spec.perCapita || {};
    const tierPop = (key && town.pop && town.pop[key]) || 0;
    const cap = ppdHouseCapacity(b, def);
    const occN = Math.max(0, Math.min(cap, Math.round(ppdOccupants(town, b, def))));
    const glyph = PPD_TIER_GLYPH[def.houseTier] || "🧑";
    const tierLabel = PPD_TIER_LABEL[def.houseTier] || (def.houseTier || "");

    // 1. occupant summary + residents strip (filled glyphs / empty squares).
    let out = `<div class="tp-sec">Residents — ${occN} / ${cap}</div>`;
    let strip = "";
    for (let i = 0; i < cap; i++)
      strip += `<span class="ppd-resident ${i < occN ? "filled" : "empty"}">${i < occN ? glyph : "◻"}</span>`;
    out += `<div class="ppd-residents" data-ppd-residents>${strip}</div>`;
    if (occN <= 0)
      out += `<div class="tp-hint2">No residents yet — meet basic needs to attract settlers.</div>`;

    // 2. needs rings (per-tier basic/luxury lists — only goods this tier consumes).
    out += ppdNeedsRow("Basic Needs", spec.basic, rates, town, tierPop);
    out += ppdNeedsRow("Luxury Needs", spec.extra, rates, town, tierPop);

    // 3. income: this house's capacity share of the tier's people-tax (PP-A).
    let inc = 0;
    try {
      if (typeof Sim !== "undefined" && typeof Sim.houseIncome === "function")
        inc = Sim.houseIncome(town, b) || 0;
    } catch (e) { inc = 0; }
    const incS = perMin(inc);
    out += `<div class="tp-row" data-ppd-income><span class="k">Income</span><span class="v">${incS.toFixed(incS > 0 && incS < 0.1 ? 2 : 1)} 🪙/min</span></div>`;

    // 4. happiness meter: red→green→gold bar; marker at THIS tier's happiness
    // (PP-A tierHappiness; legacy fallback = town.happiness). Gold zone starts
    // at peopleTax.happyBase (≥70% ⇒ above-base tax bonus).
    let h = null;
    if (town.tierHappiness && typeof town.tierHappiness[key] === "number") h = town.tierHappiness[key];
    else if (typeof town.happiness === "number") h = town.happiness;
    const hPct = Math.max(0, Math.min(100, (h == null ? 0 : h)));
    const goldBase = Math.max(0, Math.min(100, (N.peopleTax && N.peopleTax.happyBase) || 70));
    out += `<div class="tp-sec">${esc(tierLabel)} happiness — ${Math.round(hPct)}%</div>
      <div class="ppd-happy" title="Above ${goldBase}% happiness residents pay bonus tax">
        <span class="ppd-face">☹</span>
        <div class="ppd-bar">
          <div class="ppd-goldlabel" style="left:${goldBase}%">+🪙 bonus</div>
          <div class="ppd-marker" data-ppd-marker style="left:${hPct}%"></div>
        </div>
        <span class="ppd-face">🙂</span>
      </div>`;
    return out;
  }
  // === /PP-D ===

  // Slot toggles + priority (event delegation; b.closedSlots is a count in [0,total]).
  bpBodyEl.addEventListener("click", (e) => {
    // === RESEARCH CENTER (Slice C): the Center's own "Upgrade" button, handled
    // separately since bpBuilding/bpTown stay null while its panel is open.
    if (rcPanelOpen) {
      const rcUpg = e.target.closest("[data-rc-upgrade]");
      if (rcUpg && !rcUpg.disabled) {
        Buildings.startCenterUpgrade(state);
        scheduleSave();
        renderResearchCenterPanel();
      }
      return;
    }
    const b = bpBuilding; if (!b) return;
    const slot = e.target.closest("[data-slot]");
    if (slot) {
      const def = CONFIG.buildings[b.typeId] || {};
      const total = def.workerSlots || 0;
      let closed = Math.max(0, Math.min(total, b.closedSlots || 0));
      closed = slot.classList.contains("closed") ? closed - 1 : closed + 1;
      b.closedSlots = Math.max(0, Math.min(total, closed));
      renderBuildingPanel();
      return;
    }
    if (e.target.closest("[data-priority]")) { b.priority = !b.priority; renderBuildingPanel(); }
    // === RU-B: "Upgrade" button in the Upgrades section ===
    const upgBtn = e.target.closest("[data-upgrade]");
    if (upgBtn && !upgBtn.disabled) {
      if (typeof Buildings !== "undefined" && typeof Buildings.startUpgrade === "function") {
        Buildings.startUpgrade(state, bpTown, b);
      }
      renderBuildingPanel();
    }
    // === /RU-B ===
  });
  document.getElementById("bpClose").addEventListener("click", closeBuildingPanel);

  // Live refresh while a building panel is open (workers/delivery update as ticks run).
  setInterval(() => { if (bpBuilding) renderBuildingPanel(); else if (rcPanelOpen) renderResearchCenterPanel(); }, 500);

  window.BuildingUI = { openBuildingPanel, closeBuildingPanel, buildingAtHex,
                        openResearchCenterPanel, renderResearchCenterPanel,   // RESEARCH CENTER (Slice C)
                        get rcPanelOpen() { return rcPanelOpen; },
                        get openBuilding() { return bpBuilding; },
                        get openBuildingTown() { return bpTown; },
                        // === RU-B: smoke-test passthrough — starts the next upgrade on `b` and
                        // re-renders the panel if it's the one currently open.
                        startUpgrade(town, b) {
                          const ok = (typeof Buildings !== "undefined" && typeof Buildings.startUpgrade === "function")
                            ? Buildings.startUpgrade(state, town, b) : false;
                          if (bpBuilding === b) renderBuildingPanel();
                          return ok;
                        } };
  // === /CB-C ===

  // Expose for headless smoke test / console debugging.
  window.TownUI = { makeTown, ensureTown, openTownPanel, closeTownPanel,
                    startPlacing, cancelPlacing, tryPlaceBuilding,
                    // RESEARCH CENTER (Slice C): the Center's own placement session.
                    startPlacingResearchCenter, cancelPlacingResearchCenter, tryPlaceResearchCenter,
                    openCategory, closeFlyout, refreshCatButtons,   // CBM
                    get activeTown() { return activeTown; },
                    get placing() { return placing; },
                    get placingResearchCenter() { return placingResearchCenter; },
                    get openCat() { return bbOpenCat; },
                    get state() { return state; } };
  // === TOWN-UI END ===
