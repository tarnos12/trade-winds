// === RESEARCH-ECONOMY START ===  (CRE — castle research economy)
// Pure, deterministic layer (no DOM / canvas / Math.random). The King's castle
// owns up to N traders that BUY the active research node's required MATERIALS
// from cities (with treasury gold) and haul them to state.castleStock; a node
// only completes once its materials are gathered (see Research.tick's CRE gate).
//
// It mirrors the Trade.tick external-buyer model: reservation (town.reserved) at
// dispatch, agreed unit price locked at departure, carried gold deducted from the
// treasury up front, race-safe settlement on arrival. Differences from city
// trade: the buyer is the CASTLE (fromId = ResearchEconomy.CASTLE_ID sentinel,
// path starts at the castle hex), goods deliver into state.castleStock (NOT a
// town), and NO tariff is levied — the castle IS the kingdom buying for itself,
// so the selling city receives the full agreed price (documented choice).
//
// GATING (RT-A2): traders buy autonomously whenever a research node is ACTIVE —
// the old "only while the castle panel is selected" rule was removed (author
// decision). Only the active node's materials are bought (never queued ones).
// The `open` arg is retained for signature/test compatibility but no longer
// gates dispatch. Concurrent castle traders are capped at
// CONFIG.researchEconomy.maxTraders (10).
Object.assign(CONFIG, {
  researchEconomy: {
    maxTraders: 10,     // hard cap on concurrent castle-owned traders
    cartCapacity: 10,   // units one royal buyer hauls per trip
    cartSpeed: 0.5,     // progress (0..1) added per tick (paved-roads boosts it)
    transferRate: 5,    // items/sec (game time) a parked royal buyer loads/unloads — not instant
    buyThreshold: 0,    // min still-needed qty before a buyer is sent (0 = any)
    topRandom: 3,       // seeded pick among top-N materials / sellers (anti-herding)
    // === RSF: the castle opens with a small material stock so the FIRST research
    // nodes never hard-stall while young cities have no surplus to sell. Covers
    // any single peasant-band root node's materials.
    starterStock: { wood: 40, stone: 20 },
  },
});

// === RESEARCH CENTER (Slice A) — the King's Research Center building. Its LEVEL
// sets research SPEED (materials metered per game-second); no center (or one still
// under construction) means research is PAUSED. Built/upgraded by delivering
// materials from state.castleStock (see Research.tickCenter). Pure config. ===
Object.assign(CONFIG, {
  researchCenter: {
    name: "Research Center", glyph: "📖",
    build: { gold: 300, cost: { stone: 20, wood: 10 } },   // wood+stone are in the castle's starterStock, so a fresh game can build the center without first needing a plank-producing city
    deliveryRate: 5,
    levels: [ null,
      { level: 1, speed: 2 },
      { level: 2, speed: 3, cost: { gold: 400,  planks: 20, stone: 15 } },
      { level: 3, speed: 4, cost: { gold: 800,  planks: 30, iron_tool: 15 } },
      { level: 4, speed: 6, cost: { gold: 1500, iron_tool: 25, chairs: 15 } },
    ],
  },
});

// Materials each research node requires (goodId → qty). Applied ADDITIVELY onto
// the P4-A CONFIG.research nodes (does not edit the RESEARCH-CORE literals), so
// any layer can read `node.materials`. Early/root nodes need basic raw goods;
// deeper nodes need processed / luxury goods (the gate scales with tier).
const RESEARCH_MATERIALS = {
  // -- production branch --
  crop_rotation: { wood: 20, stone: 10 },
  deep_veins:    { stone: 25, iron: 15 },   // === TV2: ore → iron ===
  guild_halls:   { planks: 20, stone: 25 },
  master_crafts: { planks: 30, iron_tool: 20, stone_tools: 10 },   // === CC: tools → iron_tool === === STWIRE: stone_tools was inert (no consumer anywhere); wire it into this late production capstone. Already gated on iron_tool (a burgher good), so adding the EASIER worker-made stone_tools raises no effective gate / no bootstrap risk. ===
  industrialize: { iron_tool: 30, chairs: 15 },   // === CC: tools/furniture → iron_tool/chairs ===
  // -- logistics branch --
  paved_roads:   { stone: 30, wood: 15 },
  larger_carts:  { planks: 25, wood: 20 },
  extra_caravan: { planks: 30, iron_tool: 15 },   // === CC: tools → iron_tool ===
  warehousing:   { planks: 40, stone: 30 },
  trade_network: { iron_tool: 30, chairs: 20, stone_tools: 15 },   // === CC: tools/furniture → iron_tool/chairs === === STWIRE: second stone_tools sink; this logistics capstone already needs iron_tool+chairs (burgher goods), so the worker-made stone_tools is a lower bar — safe, additive demand. ===
  // -- administration branch --
  tax_ledgers:   { grain: 20, wood: 15 },
  tariff_office: { clothes: 15, planks: 20 },      // === CC: cloth → clothes ===
  royal_census:  { bread: 20, clothes: 20 },       // === CC: cloth → clothes ===
  town_charters: { iron_tool: 20, chairs: 15 },    // === CC: tools/furniture → iron_tool/chairs ===
  bureaucracy:   { gold_ring: 15, chairs: 25 },    // === CC: jewelry/furniture → gold_ring/chairs ===
  // === RT-A: per-building unlock nodes (peasant: wood/stone; worker: +planks/tools) ==
  unlock_quarry:   { wood: 15 },
  unlock_fishery:  { wood: 15 },
  unlock_shepherd: { wood: 20, stone: 5 },
  unlock_mill:     { planks: 15, stone: 10 },
  unlock_cottage:  { planks: 15, stone: 15 },
  unlock_brewery:  { planks: 15, stone: 10 },
  unlock_bakery:   { planks: 20, stone: 10 },   // === BALPW: was {planks:20, iron_tool:10} — bread is a WORKER luxury but iron_tool is a BURGHER-tier good, so the worker food chain was gated behind burgher production and bread was NEVER produced. Re-tier the materials to the worker band (planks+stone, matching unlock_mill/brewery). ===
  // === BALCA: was {planks:30, iron_tool:15}. iron_tool is a BURGHER-produced good
  // (forge is burgher-staffed), but the MANOR is the sole gateway to burgher HOUSING
  // — with no manor there are no burghers, so nobody can staff a forge to make the
  // iron_tool this node demands: a hard citizen-tier bootstrap deadlock (the bakery
  // bug, one tier up). Burghers never appeared in 60k-tick playthroughs. Re-tier the
  // materials to the WORKER band (bricks, made by the worker-staffed brickworks),
  // matching the manor's own build cost which already lists bricks. ===
  unlock_manor:    { planks: 30, bricks: 15 },   // === BALCA: iron_tool → bricks (un-deadlock burgher housing) ===
  // === TV2: new worker-band unlock nodes ===
  unlock_iron_mine:  { wood: 20, stone: 10 },
  unlock_clay_pit:   { wood: 15, stone: 10 },
  unlock_coal_mine:  { wood: 20, stone: 15 },
  unlock_gold_mine:  { stone: 20, planks: 10 },
  unlock_brickworks: { planks: 15, stone: 15 },
  unlock_farm:       { wood: 20, stone: 5 },
  // -- per-level upgrade nodes (replace the old development ids) --
  upg_hut_l2:        { wood: 15 },
  upg_hut_l3:        { wood: 20, stone: 10 },
  upg_hut_l4:        { wood: 30, stone: 15 },
  upg_lumberjack_l2: { wood: 20 },
  upg_lumberjack_l3: { wood: 25, stone: 15 },
  upg_farm_l2:       { wood: 20 },
  upg_farm_l3:       { wood: 25, stone: 15 },
  upg_sawmill_l2:    { planks: 10, wood: 15 },
  upg_sawmill_l3:    { planks: 20, stone: 15 },
  // === /RT-A ===============================================
  // === CC: new worker/citizen/aristocrat unlock + upgrade node materials ===
  unlock_tailoring:        { planks: 15, stone: 10 },
  unlock_charcoal_burner:  { wood: 20, stone: 5 },
  unlock_stonetool_maker:  { planks: 15, stone: 15 },
  unlock_oil_maker:        { planks: 15, stone: 10 },
  unlock_forge:            { planks: 20, iron: 15 },
  unlock_armory:           { iron: 20, coal: 20 },
  unlock_pottery_workshop: { planks: 20, bricks: 10 },
  unlock_distillery:       { pottery: 10, planks: 20 },
  unlock_goldsmith:        { gold: 10, iron_tool: 10 },
  unlock_lamp_maker:       { oil: 15, planks: 15 },
  unlock_carpentry:        { planks: 25, oil: 10 },
  // === BALPV (Phase 2A): drop the T3 gate. gold_ring (goldsmith/burgher) was a
  // circular gate — luxury_tailor's own building CONSUMES gold_ring (goods.js), so
  // gating its RESEARCH on gold_ring recreated the deadlock. clothes+planks are
  // reachable burgher/worker-band goods; the finery forcing lives in the building input. ===
  unlock_luxury_tailor:    { clothes: 15, planks: 10 },
  // === BALPV (Phase 2A): drop chairs+gold_ring (T3). The NEW victory (100% aristocrat
  // happiness) is itself the T3 forcing function, so the HOME research need not pre-
  // require T3 — a second T3 gate here only reinstates the chicken-and-egg. Worker-band
  // bricks+planks let a player stand up the home, then work UP to 100%. ===
  unlock_aristocrat_home:  { bricks: 30, planks: 15 },
  // === /CC ================================================
};
for (const _rn of (CONFIG.research || [])) {
  if (!_rn.materials) _rn.materials = RESEARCH_MATERIALS[_rn.id] || {};
}

var ResearchEconomy = (function () {
  const CASTLE_ID = "castle";   // sentinel fromId marking a castle-owned trader
  const cfg = () => CONFIG.researchEconomy;
  function castleHex() {
    const c = (CONFIG.town && CONFIG.town.castle) || { q: 0, r: 0 };
    return HexMath.key(c.q, c.r);
  }
  function stock(state) {
    if (!state.castleStock || typeof state.castleStock !== "object") state.castleStock = {};
    return state.castleStock;
  }
  function need(node) { return (node && node.materials) || {}; }

  // Materials already secured in transit on live castle carts (any phase), so we
  // never over-dispatch beyond what a node still needs.
  function inFlight(state, gid) {
    let n = 0;
    for (const c of (state.carts || [])) if (!c.done && c.kind === "castle" && c.goodId === gid) n += c.qty;
    return n;
  }
  // How much of a material the active node has ALREADY drawn from castleStock
  // (Slice A metering) — so remaining() doesn't re-buy what's been consumed.
  function consumedOf(state, gid) {
    return (state && state.research && state.research.consumed && state.research.consumed[gid]) || 0;
  }
  // Still-needed qty of a material = required − already-consumed − held in
  // castleStock − in transit.
  function remaining(state, node, gid) {
    return (need(node)[gid] || 0) - consumedOf(state, gid) - (stock(state)[gid] || 0) - inFlight(state, gid);
  }
  function materialsSatisfied(state, node) {
    const m = need(node), s = stock(state);
    for (const gid in m) if ((s[gid] || 0) < m[gid]) return false;
    return true;
  }
  function consumeMaterials(state, node) {
    const m = need(node), s = stock(state);
    for (const gid in m) s[gid] = Math.max(0, (s[gid] || 0) - m[gid]);
  }
  // === RSF: per-town share of the ACTIVE node's still-needed materials. Sim
  // adds this into each town's demand (so prices rise and town traders import
  // the goods), and the dispatch surplus check below EXCLUDES it from the
  // seller hold-back (the castle must not be blocked by its own demand echo).
  function townShare(state, gid) {
    const R = state && state.research;
    const node = (R && R.active && typeof Research !== "undefined") ? Research.get(R.active) : null;
    if (!node) return 0;
    const rem = remaining(state, node, gid);
    if (!(rem > 0)) return 0;
    const n = (state.towns || []).length;
    return n > 0 ? rem / n : 0;
  }
  // === /RSF ===
  function activeCastleCarts(state) {
    let n = 0;
    for (const c of (state.carts || [])) if (!c.done && c.kind === "castle") n++;
    return n;
  }

  // Seller reservation helpers — identical model to Trade.tick's EC-D reservation.
  function reservedOf(t, gid) { return (t && t.reserved && t.reserved[gid]) || 0; }
  function reserve(t, gid, n) { if (!t.reserved) t.reserved = {}; t.reserved[gid] = (t.reserved[gid] || 0) + n; }
  function release(t, gid, n) { if (t && t.reserved) t.reserved[gid] = Math.max(0, (t.reserved[gid] || 0) - n); }
  function priceOf(town, gid) {
    const p = town.prices && town.prices[gid];
    if (typeof p === "number") return p;
    if (typeof Sim !== "undefined" && Sim.priceFor) return Sim.priceFor(town, gid);
    return (CONFIG.goods[gid] && CONFIG.goods[gid].basePrice) || 1;
  }
  const townKey = (t) => HexMath.key(t.q, t.r);

  // Advance the castle-trade layer one tick. `open` is retained for signature
  // compatibility (RT-A2 removed the panel gate; dispatch now depends only on an
  // active node). Mutates State only (state.carts, state.treasury, town
  // stock/gold, state.castleStock). Deterministic via state.researchSeed.
  function tick(state, open) {
    if (!state) return state;
    if (!Array.isArray(state.carts)) state.carts = [];
    if (typeof state.treasury !== "number") state.treasury = 0;
    if (typeof state.researchSeed !== "number") state.researchSeed = 0;
    stock(state);
    const C = cfg();
    const towns = state.towns || [];
    const byId = new Map(towns.map(t => [t.id, t]));

    // Per-tick seeded RNG (independent of Trade's stream), advanced by a fixed LCG
    // step each tick so the sequence is reproducible and never touches Math.random.
    const rng = mulberry32(state.researchSeed | 0);
    state.researchSeed = (Math.imul(state.researchSeed | 0, 1664525) + 1013904223) | 0;

    const buffer = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
    // RSF: subtract the castle's own demand echo (townShare) before the hold-back.
    const needOf = (t, gid) => Math.max(0, ((t.demand && t.demand[gid]) || 0) - townShare(state, gid)) * buffer;
    const cartCapacity = C.cartCapacity;
    const paved = (typeof Research !== "undefined" && Research.has && Research.has(state, "paved_roads"));
    const cartSpeed = C.cartSpeed * (paved ? ((CONFIG.trade && CONFIG.trade.pavedRoadSpeed) || 1) : 1);

    // --- 1. Dispatch. Castle traders buy the UNION of (a) the active node's
    //     still-to-consume materials AND (b) the Research Center's outstanding
    //     build / upgrade materials — even when no node is active (a center under
    //     construction still needs hauling). All deliver into state.castleStock. ---
    const R = state.research;
    const node = (R && R.active && typeof Research !== "undefined") ? Research.get(R.active) : null;
    const centerCons = (typeof Research !== "undefined" && Research.centerConstructionNeed) ? Research.centerConstructionNeed(state) : {};
    const centerUpg  = (typeof Research !== "undefined" && Research.centerUpgradeNeed)  ? Research.centerUpgradeNeed(state)  : {};
    // Candidate material ids across all three demands (recomputed rem below each pass).
    const wantGids = new Set();
    if (node) for (const g in need(node)) wantGids.add(g);
    for (const g in centerCons) wantGids.add(g);
    for (const g in centerUpg)  wantGids.add(g);
    // rem[gid] = (node need − consumed) + centerConstruction + centerUpgrade − stock − in-flight.
    const remFor = (gid) => {
      let total = 0;
      if (node) total += Math.max(0, (need(node)[gid] || 0) - consumedOf(state, gid));
      total += (centerCons[gid] || 0) + (centerUpg[gid] || 0);
      return total - (stock(state)[gid] || 0) - inFlight(state, gid);
    };
    if (wantGids.size) {
      const fromKey = castleHex();
      let guard = 0;
      // Fill up to the trader cap; each pass buys one material batch from one city.
      while (activeCastleCarts(state) < C.maxTraders && guard++ <= C.maxTraders) {
        // (a) Still-needed materials (respecting stock + in-flight).
        const gaps = [];
        for (const gid of wantGids) {
          const rem = remFor(gid);
          if (rem > C.buyThreshold && rem > 0) gaps.push({ gid, rem });
        }
        if (!gaps.length) break;   // everything gathered or already on the road
        gaps.sort((a, b) => b.rem - a.rem || (a.gid < b.gid ? -1 : a.gid > b.gid ? 1 : 0));
        const gapSlate = gaps.slice(0, C.topRandom);
        const want = gapSlate[Math.min(gapSlate.length - 1, Math.floor(rng() * gapSlate.length))];

        // (b) Best reachable seller holding a genuine surplus of want.gid.
        const offers = [];
        for (const seller of towns) {
          if (!seller || !seller.stock) continue;
          const surplus = (seller.stock[want.gid] || 0) - reservedOf(seller, want.gid) - needOf(seller, want.gid);
          if (surplus <= 0) continue;
          const route = Pathing.route(state, fromKey, townKey(seller));
          if (!route) continue;
          offers.push({ seller, surplus, route, price: priceOf(seller, want.gid) });
        }
        if (!offers.length) break;   // no reachable seller for a needed material
        offers.sort((a, b) => b.surplus - a.surplus || a.price - b.price || a.route.cost - b.route.cost || a.seller.id - b.seller.id);
        const slate = offers.slice(0, C.topRandom);
        const pick = slate[Math.min(slate.length - 1, Math.floor(rng() * slate.length))];

        // (c) Dispatch: qty capped by cart capacity, seller surplus, remaining
        //     need, and treasury affordability at the AGREED unit price (carried).
        const agreedUnit = pick.price;
        const affordable = agreedUnit > 0 ? (state.treasury || 0) / agreedUnit : cartCapacity;
        const qty = Math.min(cartCapacity, pick.surplus, want.rem, affordable);
        if (!(qty > 0)) break;   // can't afford / nothing to buy → stop this tick
        const agreedGold = agreedUnit * qty;

        reserve(pick.seller, want.gid, qty);
        state.treasury = (state.treasury || 0) - agreedGold;   // carried up front

        state.carts.push({
          id: (state._nextCartId = (state._nextCartId || 0) + 1),
          kind: "castle",                        // renders as a cart; Trade.tick ignores it
          fromId: CASTLE_ID, toId: pick.seller.id,
          goodId: want.gid, qty: qty, unitBuy: agreedUnit, agreedGold: agreedGold,
          path: pick.route.path.slice(),         // castle → seller hex keys
          progress: 0, phase: "outbound", done: false,
        });
      }
    }

    // --- 2. Advance castle traders: travel, then PARK to load / unload (not instant).
    //     The PURCHASE settles atomically on arrival (no tariff — the castle buys for
    //     the kingdom); the dwell is load TIME and the haul meters into castleStock.
    //     Phases mirror Trade.tick: outbound → loading → return → unloading → done.
    const perTick = (C.transferRate || 5) * (((CONFIG.econ && CONFIG.econ.baseTickMs) || 500) / 1000);
    const dwellFor = (n) => Math.max(1, Math.ceil((Math.max(0, n) || 0) / (perTick || 1)));
    for (const cart of state.carts) {
      if (cart.done || cart.kind !== "castle") continue;

      // -- Loading dwell (cargo secured on arrival) --
      if (cart.phase === "loading") {
        cart.loaded = Math.min(cart.qty, (cart.loaded || 0) + perTick);
        if ((cart.dwell = (cart.dwell || 0) - 1) <= 0) {
          cart.phase = "return"; cart.progress = 0;
          cart.path = cart.path.slice().reverse();            // seller → castle
        }
        continue;
      }

      // -- Unloading dwell: meter into castleStock over several ticks --
      if (cart.phase === "unloading") {
        const move = Math.min(perTick, cart.qty - (cart.unloaded || 0));
        if (move > 0) {
          stock(state)[cart.goodId] = (stock(state)[cart.goodId] || 0) + move;   // into the castle
          cart.unloaded = (cart.unloaded || 0) + move;
        }
        if ((cart.dwell = (cart.dwell || 0) - 1) <= 0 || (cart.unloaded || 0) >= cart.qty) cart.done = true;
        continue;
      }

      // -- Travel (outbound / return) --
      cart.progress += cartSpeed;
      if (cart.progress < 1) continue;
      cart.progress = 1;

      if (cart.phase === "outbound") {
        const seller = byId.get(cart.toId);
        const carried = cart.agreedGold || (cart.unitBuy || 0) * cart.qty;
        if (seller) release(seller, cart.goodId, cart.qty);   // release reservation on arrival
        if (!seller) { state.treasury = (state.treasury || 0) + carried; cart.done = true; continue; }
        if (!seller.stock) seller.stock = {};
        const take = Math.min(cart.qty, Math.max(0, seller.stock[cart.goodId] || 0));
        if (!(take > 0)) { state.treasury = (state.treasury || 0) + carried; cart.done = true; continue; }
        const value = (cart.unitBuy || 0) * take;             // AGREED unit × delivered qty; NO tariff
        seller.stock[cart.goodId] = (seller.stock[cart.goodId] || 0) - take;
        seller.gold = (seller.gold || 0) + value;
        if (carried > value) state.treasury = (state.treasury || 0) + (carried - value);  // refund undelivered
        cart.qty = take;
        cart.phase = "loading"; cart.loaded = 0; cart.dwell = dwellFor(take);
      } else {
        cart.phase = "unloading"; cart.unloaded = 0; cart.dwell = dwellFor(cart.qty);
      }
    }

    // --- 3. Prune retired carts (shared with Trade.tick's filter) --------------
    if (state.carts.some(c => c.done)) state.carts = state.carts.filter(c => !c.done);
    return state;
  }

  return {
    tick, materialsSatisfied, consumeMaterials, remaining, need, townShare,
    activeCastleCarts, stock, castleHex, CASTLE_ID,
  };
})();
// === RESEARCH-ECONOMY END ===
