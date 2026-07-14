// === TRADE START ===  (TR-A — external-buyer trade model; supersedes the T8 sell model)
// Pure, deterministic trade layer (GDD §6.2–6.3). No DOM / canvas / I/O and NO
// Math.random — every decision draws from a seeded stream stored on State
// (state.tradeSeed), so the whole sim+trade step is reproducible and safe to
// fast-forward / autoplay. Wired into the 500ms accumulator right AFTER
// Sim.tick(state).
//
// MODEL (TR-A): each city runs ONE external trader that BUYS the good it is most
// short on from a road-connected city holding a genuine surplus. Selling is
// PASSIVE — a city only "sells" when another city's trader arrives to buy from
// it. The trader is available from LEVEL 1 (the old `level >= 2` gate is gone),
// so a connected town trades the moment it has a shortfall and a reachable seller
// — fixing the "towns stuck at L1 never trade" bug. The player still earns the
// effective tariff (state.tariffRate + research tariffBonus, × Events multiplier,
// clamped) on every purchase → state.treasury.
//
// It only READS prices (Sim.tick already republished them via Sim.priceFor) and
// mutates only town.stock / town.gold, state.carts and state.treasury. Anti-
// herding: a min-shortfall threshold, seeded top-N seller/shortfall picks, and a
// one-trader-per-city cap (research `extraCarts` may add more). Carts carry
// `kind:'external'` so TR-B can render internal vs external traders distinctly.
Object.assign(CONFIG, {
  trade: {
    tariffRate: 0.25,          // 25% of every inter-town transaction → treasury (GDD §6.3)
    profitThreshold: 5,        // (legacy) retained for save/config compat; unused by the buy model
    distanceCostPerStep: 0.5,  // (legacy) retained for compat; route.cost is now only a seller tiebreak
    cartCapacity: 10,          // max units one external trader hauls per trip
    cartSpeed: 0.5,            // progress (0..1 along the path) added per tick
    transferRate: 5,           // items/sec (game time) a parked trader loads/unloads — trades are NOT instant
    maxCartsPerTown: 3,        // (legacy) cap kept for config compat; the buy model runs 1 trader/city
    topRandom: 3,              // pick among the top-N sellers / tied shortfalls (anti-herding)
    buyThreshold: 1,           // TR-A: min shortfall (need − stock) before a city dispatches its trader
    // === TRADEFIX: a city provisions at least `minStock` of ANY good it consumes,
    // on top of the price-buffer target (demand × econ.bufferTarget). Without this
    // floor, a small city's per-tick demand (e.g. 0.2 wood) × buffer(2) = 0.4 stayed
    // BELOW buyThreshold(1), so it NEVER dispatched a trader and slowly starved. The
    // floor only applies to goods with demand > 0 (a city doesn't hoard what it does
    // not use), so large-demand trades (cart-capped) and multi-good cargo are
    // unchanged, and the price model (separate bufferTarget) is untouched. ===
    minStock: 6,               // floor inventory a city keeps of each good it consumes
    pavedRoadSpeed: 1.5,       // P5-A: cart-speed multiplier once "Paved Roads" is researched
    offRoadSpeedMult: 0.5,     // OFFROAD: carts with no road route travel at half speed (roads = 2× faster)
    maxTariffRate: 0.9,        // P5-A: clamp the research-boosted tariff to a sane ceiling
    castleSellMargin: 1.0,     // PP-A: castle-as-seller unit price = basePrice × this (tunable)
    // === CAPFIX === safety multiplier on the naive unload dwell. A cart whose buyer
    // is near storageCap delivers slower than dwellFor() assumes; it keeps unloading
    // (waiting for warehouse room) until fully delivered OR ~this×the naive dwell has
    // elapsed, then FORCE-DELIVERS any remainder into the buyer's stock (the buyer
    // already paid; Sim's overstock cap clamps the excess). Money-conserving; prevents
    // silent cargo loss without minting gold.
    unloadTimeoutMult: 4,
  },
});

var Trade = (typeof Trade !== "undefined" && Trade) || {};
(function () {
  // Current local price of a good in a town. Sim.tick republishes every price
  // each tick (Sim.priceFor), so we READ the stored value and only fall back to a
  // fresh computation when a town was never ticked — Trade never re-lerps a price,
  // staying a read-only observer of the price model (no hidden side effects).
  function priceOf(town, gid) {
    const p = town.prices && town.prices[gid];
    return (typeof p === "number") ? p : Sim.priceFor(town, gid);
  }

  const townKey = (t) => HexMath.key(t.q, t.r);

  // EC-D: goods a seller has EARMARKED for in-flight buyers. Every availability
  // check (the seller-surplus scan below) treats a seller's spendable stock as
  // `stock[gid] - reserved[gid]`, so two traders can't claim the same goods and a
  // committed trade's goods aren't sold out from under it. A reservation is placed
  // at DISPATCH (when the trader leaves carrying the agreed gold) and released on
  // arrival at the seller — or refunded/released if the trade is invalidated.
  function reservedOf(t, gid) { return (t && t.reserved && t.reserved[gid]) || 0; }
  function reserve(t, gid, n) { if (!t.reserved) t.reserved = {}; t.reserved[gid] = (t.reserved[gid] || 0) + n; }
  function release(t, gid, n) { if (t && t.reserved) t.reserved[gid] = Math.max(0, (t.reserved[gid] || 0) - n); }

  // === PP-A === CASTLE-AS-SELLER. When the player ENABLES a good in
  // state.castleTrade, the castle offers whatever it stocks (state.castleStock) at
  // basePrice × castleSellMargin, with NO tariff — proceeds go to state.treasury.
  // Castle stock is reserved in state.castleReserved (mirrors town.reserved) so two
  // buyers can't claim the same units. `SELLER_CASTLE_ID` sorts the castle after
  // towns on the id tiebreak. Selling ignores the `limit` (that's the BUY target):
  // the castle may sell down to 0.
  const SELLER_CASTLE_ID = 1e9;
  function castleReservedOf(s, g) { return (s.castleReserved && s.castleReserved[g]) || 0; }
  function castleReserve(s, g, n) { if (!s.castleReserved) s.castleReserved = {}; s.castleReserved[g] = (s.castleReserved[g] || 0) + n; }
  function castleRelease(s, g, n) { if (s.castleReserved) s.castleReserved[g] = Math.max(0, (s.castleReserved[g] || 0) - n); }
  function castleSellPrice(gid) {
    const g = CONFIG.goods[gid]; const base = g ? g.basePrice : 1;
    return base * ((CONFIG.trade && CONFIG.trade.castleSellMargin) || 1);
  }
  function castleSellAvailable(state, gid) {
    const ct = state.castleTrade && state.castleTrade[gid];
    if (!ct || !ct.enabled) return 0;
    return ((state.castleStock && state.castleStock[gid]) || 0) - castleReservedOf(state, gid);
  }
  function addCastleOffer(state, offers, fromKey, gid) {
    if (typeof ResearchEconomy === "undefined") return;
    const avail = castleSellAvailable(state, gid);
    if (avail <= 0) return;
    const route = Pathing.route(state, fromKey, ResearchEconomy.castleHex());
    if (!route) return;
    offers.push({ seller: null, sellerCastle: true, surplus: avail, route: route, price: castleSellPrice(gid) });
  }
  // seller-agnostic surplus / price / reserve (town OR castle) for the multi-good fill.
  function sellAvailable(state, seller, gid, isCastle, needOf) {
    if (isCastle) return castleSellAvailable(state, gid);
    if (!seller || !seller.stock) return 0;
    return (seller.stock[gid] || 0) - reservedOf(seller, gid) - needOf(seller, gid);
  }
  function sellPrice(state, seller, gid, isCastle) {
    return isCastle ? castleSellPrice(gid) : priceOf(seller, gid);
  }
  function sellReserve(state, seller, gid, n, isCastle) {
    if (isCastle) castleReserve(state, gid, n); else reserve(seller, gid, n);
  }

  // How many external traders a city may keep on the road at once — scales with
  // town level (CONFIG.town.externalTradersByLevel; formula level*2 out of range).
  // Research extraCarts is added on top by the dispatch loop.
  Trade.externalFleet = function (town) {
    const lvl = (town && town.level) || 1;
    const arr = CONFIG.town && CONFIG.town.externalTradersByLevel;
    const v = (arr && arr[lvl] != null) ? arr[lvl] : lvl * 2;
    return Math.max(0, Math.round(v));
  };
  // === /PP-A ===

  // Count a city's live (not-done) external traders (carts it owns as buyer).
  // All state.carts are external traders in this model; a cart missing `kind`
  // (e.g. an old save) is treated as external. Used to enforce one-trader/city.
  function activeCarts(carts, townId) {
    let n = 0;
    for (const c of carts) if (!c.done && c.fromId === townId && (c.kind || "external") === "external") n++;
    return n;
  }

  // Advance the whole trade layer by one tick. Mutates State only.
  Trade.tick = function (state) {
    if (!state) return state;
    if (!Array.isArray(state.carts)) state.carts = [];
    if (typeof state.treasury !== "number") state.treasury = 0;
    if (typeof state.tradeSeed !== "number") state.tradeSeed = 0;
    if (typeof Sim !== "undefined" && Sim.ensureStats) Sim.ensureStats(state);   // MISSION-STATS: counter shape
    const cfg = CONFIG.trade;
    const towns = state.towns || [];
    const byId = new Map(towns.map(t => [t.id, t]));

    // Deterministic per-tick RNG: seed from state.tradeSeed, then advance the seed
    // by a fixed LCG step (independent of how many draws we make this tick) so the
    // stream evolves reproducibly across ticks and never touches Math.random.
    const rng = mulberry32(state.tradeSeed | 0);
    state.tradeSeed = (Math.imul(state.tradeSeed | 0, 1664525) + 1013904223) | 0;

    // --- P5-A: research effects (guarded; identical to base when no research) ---
    const hasResearch = (typeof Research !== "undefined" && Research.effect);
    const rEffect = (key, fb) => hasResearch ? Research.effect(state, key, fb) : fb;
    const rHas = (id) => (typeof Research !== "undefined" && Research.has) ? Research.has(state, id) : false;
    const extraCarts  = rEffect("extraCarts", 0);                        // more carts on the road
    const cartCapacity = cfg.cartCapacity * rEffect("cartCapacity", 1);  // larger carts haul more
    const cartSpeed = cfg.cartSpeed * (rHas("paved_roads") ? cfg.pavedRoadSpeed : 1); // paved roads → faster
    // === TARIFF-SLIDER === P5D-D: the player-set base (state.tariffRate, GDD §6.3)
    // replaces the CONFIG constant as the base; research tariffBonus still adds on top,
    // Events.tariffMultiplier still applies below. Clamp the composed rate to [0.10, 0.40]
    // (bounded by cfg.maxTariffRate). Falls back to cfg.tariffRate when a state/save
    // predates the slider, so default behaviour stays 0.25.
    const baseTariff = (typeof state.tariffRate === "number") ? state.tariffRate : cfg.tariffRate;
    const tariffRate = Math.max(0.10, Math.min(Math.min(0.40, cfg.maxTariffRate),
      baseTariff + rEffect("tariffBonus", 0)));                          // tax ledgers / bureaucracy
    // === /TARIFF-SLIDER ===

    // TRADEFIX: target stock = demand × price-buffer, floored at CONFIG.trade.minStock
    // for any good the city actually consumes (demand > 0). The floor makes small
    // cities' shortfalls clear buyThreshold so they trade; goods a city doesn't use
    // stay at 0 (no hoarding), so seller hold-back + multi-good behavior are unchanged.
    const buffer = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
    const minStock = (CONFIG.trade && CONFIG.trade.minStock) || 0;
    const needOf = (t, gid) => {
      const d = (t.demand && t.demand[gid]) || 0;
      return d > 0 ? Math.max(d * buffer, minStock) : 0;
    };

    // --- 1. Dispatch: each city's ONE external trader BUYS its biggest shortfall
    //        from a road-connected city with a real surplus (available at L1). ---
    for (const home of towns) {
      if (!home || !home.stock) continue;                     // no level gate: L1 cities trade
      // === PP-A === fleet scales with city level; +research caravans. The fleet
      // fills over successive ticks — the dispatch loop still sends at most ONE new
      // cart per city per tick, so the seeded rng stream shape (one gap-draw + one
      // seller-draw per city per tick) is unchanged and determinism is preserved.
      const cap = Trade.externalFleet(home) + Math.max(0, Math.round(extraCarts));    // PP-A: was 1 + extraCarts
      if (activeCarts(state.carts, home.id) >= cap) continue;

      const fromKey = townKey(home);

      // === PP-A === in-flight accounting. With a multi-cart fleet the shortfall
      // must subtract goods ALREADY on the way in this city's own live traders
      // (un-delivered cargo), or a still-empty buyer would dispatch a fresh cart
      // every tick and grossly over-buy. So the fleet only grows while the REMAINING
      // shortfall (after incoming) still warrants another trip — a chronically
      // short city fills its fleet; a satisfied-by-one-cart city sends exactly one.
      const incoming = {};
      for (const c of state.carts) {
        if (c.done || c.fromId !== home.id || (c.kind || "external") !== "external") continue;
        const items = Array.isArray(c.cargo) ? c.cargo
          : [{ goodId: c.goodId, qty: c.qty, unloaded: c.unloaded }];
        for (const it of items) {
          const left = Math.max(0, (it.qty || 0) - (it.unloaded || 0));
          if (left > 0) incoming[it.goodId] = (incoming[it.goodId] || 0) + left;
        }
      }
      // === /PP-A ===

      // (a) Biggest shortfall (need − stock − incoming) across every demanded good.
      const gaps = [];
      for (const gid in CONFIG.goods) {
        const need = needOf(home, gid);
        if (need <= 0) continue;                              // city doesn't want this good
        const shortfall = need - (home.stock[gid] || 0) - (incoming[gid] || 0);  // PP-A: net of in-flight
        if (shortfall > cfg.buyThreshold) gaps.push({ gid, shortfall });
      }
      if (!gaps.length) continue;
      gaps.sort((a, b) => b.shortfall - a.shortfall || (a.gid < b.gid ? -1 : a.gid > b.gid ? 1 : 0));

      // (b) Offers for a good = reachable cities (+ the castle) holding a real surplus.
      const offersFor = (gid) => {
        const out = [];
        for (const seller of towns) {
          if (seller === home || !seller || !seller.stock) continue;
          const surplus = (seller.stock[gid] || 0) - reservedOf(seller, gid) - needOf(seller, gid);
          if (surplus <= 0) continue;
          const route = Pathing.route(state, fromKey, townKey(seller));
          if (!route) continue;
          out.push({ seller, surplus, route, price: priceOf(seller, gid) });
        }
        addCastleOffer(state, out, fromKey, gid);   // PP-A: castle sells enabled goods
        return out;
      };
      // === TRADEFIX: only dispatch a trader with a PURPOSE. Walk the shortfalls in
      // priority order and keep the ones a reachable seller can actually FILL — a
      // city must not waste its trip (or give up for the tick) on its single biggest
      // shortfall when that good is unsellable (e.g. an extra nobody produces) while
      // a good it CAN buy waits. Then seeded-pick among the top-N tradeable gaps. ===
      const tradeable = [];
      for (const g of gaps) {
        const o = offersFor(g.gid);
        if (o.length) { tradeable.push({ gap: g, offers: o }); if (tradeable.length >= cfg.topRandom) break; }
      }
      if (!tradeable.length) continue;   // nothing this city needs is for sale anywhere reachable
      const chosen = tradeable[Math.min(tradeable.length - 1, Math.floor(rng() * tradeable.length))];
      const want = chosen.gap;
      const offers = chosen.offers;
      // === /TRADEFIX ===
      offers.sort((a, b) =>
        b.surplus - a.surplus ||
        a.price - b.price ||
        a.route.cost - b.route.cost ||
        (a.sellerCastle ? SELLER_CASTLE_ID : a.seller.id) - (b.sellerCastle ? SELLER_CASTLE_ID : b.seller.id));
      const slate = offers.slice(0, cfg.topRandom);
      const pick = slate[Math.min(slate.length - 1, Math.floor(rng() * slate.length))]; // one draw

      // (c) Dispatch (EC-D): the PRIMARY item (top shortfall) is sized exactly as
      //     before — capped by cart capacity, the seller's un-reserved surplus,
      //     buyer shortfall, and affordability NOW (the trader carries the agreed
      //     gold up front). === PP-A === Then the REMAINING cart capacity is filled
      //     with the buyer's next shortfalls that the SAME seller can supply
      //     (multi-good cargo). No rng is drawn in the fill (it walks the already-
      //     sorted `gaps`), so determinism is preserved. Castle sellers stay valid
      //     candidates for every cargo item (guarded by `sellerIsCastle`).
      const sellerIsCastle = !!pick.sellerCastle;
      const primaryUnit = pick.price;
      const primaryAfford = primaryUnit > 0 ? (home.gold || 0) / primaryUnit : cartCapacity;
      const primaryQty = Math.min(cartCapacity, pick.surplus, want.shortfall, primaryAfford);
      if (!(primaryQty > 0)) continue;

      const cargo = [{ goodId: want.gid, qty: primaryQty, unitBuy: primaryUnit }];
      sellReserve(state, pick.seller, want.gid, primaryQty, sellerIsCastle);
      let capLeft = cartCapacity - primaryQty;
      let goldLeft = (home.gold || 0) - primaryUnit * primaryQty;

      for (let gi = 0; gi < gaps.length && capLeft > 0; gi++) {
        const g = gaps[gi];
        if (g.gid === want.gid) continue;
        const avail = sellAvailable(state, pick.seller, g.gid, sellerIsCastle, needOf);
        if (avail <= 0) continue;
        const unit = sellPrice(state, pick.seller, g.gid, sellerIsCastle);
        const afford = unit > 0 ? goldLeft / unit : capLeft;
        const q = Math.min(capLeft, avail, g.shortfall, afford);
        if (!(q > 0)) continue;
        cargo.push({ goodId: g.gid, qty: q, unitBuy: unit });
        sellReserve(state, pick.seller, g.gid, q, sellerIsCastle);
        capLeft -= q; goldLeft -= unit * q;
      }

      let totalQty = 0, totalGold = 0;
      for (const it of cargo) { totalQty += it.qty; totalGold += it.unitBuy * it.qty; }
      home.gold = (home.gold || 0) - totalGold;   // carry the whole cargo's gold up front

      state.carts.push({
        id: (state._nextCartId = (state._nextCartId || 0) + 1),
        kind: "external",                     // TR-B renders external vs internal traders
        fromId: home.id,                      // fromId = buyer (owns the trader)
        toId: sellerIsCastle ? ResearchEconomy.CASTLE_ID : pick.seller.id, // seller (castle sentinel)
        sellerCastle: sellerIsCastle,
        // back-compat mirror of the PRIMARY (first/largest) cargo item so existing
        // render / hover / not-yet-updated tests keep reading a single-good shape.
        goodId: cargo[0].goodId, qty: cargo[0].qty, unitBuy: cargo[0].unitBuy, agreedGold: totalGold,
        cargo: cargo, totalQty: totalQty,     // PP-A: full multi-good cargo + total units
        path: pick.route.path.slice(),        // buyer → seller hex keys (contract shape)
        road: pick.route.road !== false,      // OFFROAD: false ⇒ no road link ⇒ half speed
        progress: 0, phase: "outbound", done: false,
      });
    }

    // --- 2. Advance traders; travel, then PARK to load / unload (not instant) -----
    // A trader travels (progress += cartSpeed), then dwells to LOAD at the seller and
    // to UNLOAD at the buyer for ceil(qty / perTick) ticks — so a trade takes visible
    // time (CONFIG.trade.transferRate items/sec of game time). Phases:
    //   outbound → loading (dwell @ seller) → return → unloading (dwell @ buyer) → done.
    // The PURCHASE settles atomically on arrival at the seller (as before) so market
    // moves / Sim consumption can't nibble a half-loaded cart; the dwell is the load
    // TIME, and the haul is metered into the buyer's stock as it unloads.
    const perTick = (cfg.transferRate || 5) * (((CONFIG.econ && CONFIG.econ.baseTickMs) || 500) / 1000);
    const dwellFor = (n) => Math.max(1, Math.ceil((Math.max(0, n) || 0) / (perTick || 1)));
    for (const cart of state.carts) {
      if (cart.done) continue;
      if (cart.kind === "castle") continue;   // CRE: castle-owned traders are driven by ResearchEconomy.tick

      // -- Loading dwell: cargo already secured on arrival; ramp the chip for feel. --
      if (cart.phase === "loading") {
        cart.loaded = Math.min(cart.qty, (cart.loaded || 0) + perTick);
        if ((cart.dwell = (cart.dwell || 0) - 1) <= 0) {
          cart.phase = "return"; cart.progress = 0;
          cart.path = cart.path.slice().reverse();            // seller → buyer
        }
        continue;
      }

      // -- Unloading dwell: meter the haul into the buyer's stock over several ticks. --
      // === PP-A === multi-good: meter EACH cargo item (up to perTick/tick, capped
      // by storage room) into the buyer's stock; retire once every item is fully
      // unloaded or the dwell elapses. Legacy carts (no cargo array) keep the old
      // single-good path so an in-flight pre-PP-A save still unloads correctly.
      if (cart.phase === "unloading") {
        const buyer = byId.get(cart.fromId);
        const capG = (CONFIG.town && CONFIG.town.storageCap) || Infinity;   // EV3 storage cap
        // === CAPFIX === The naive dwell (dwellFor(totalQty)) assumes an UNCONSTRAINED
        // per-tick move, but the actual move is also capped by warehouse room
        // (capG − buyer.stock). A buyer near storageCap throttles delivery below that
        // estimate, so the plain `dwell<=0` cutoff used to retire a cart with cargo
        // STILL aboard — silently destroying the paid-for remainder. Fix: completion is
        // now `allDone` (primary) OR a generous SAFETY timeout (dwell decremented past
        // −dwellLimit ≈ 5× the naive total). On the timeout path — only there — the
        // still-aboard units are FORCE-DELIVERED into the buyer's stock (even above
        // storageCap): the buyer already paid for them at the outbound settle (the
        // seller banked that gold), so the goods must land — a gold REFUND here would
        // MINT money (seller keeps payment + buyer gets gold back). Any over-cap excess
        // is then clamped by Sim's normal per-tick overstock cap (step 6), identical to
        // an over-import/over-production, so this conserves gold exactly. Pre-fix
        // in-flight carts have no dwellLimit ⇒ fall back to the old `dwell<=0` cutoff,
        // but now force-deliver instead of losing cargo (strict improvement, no save
        // migration).
        const finishUnload = () => {
          const items = Array.isArray(cart.cargo) ? cart.cargo
            : [{ goodId: cart.goodId, qty: cart.qty, unitBuy: cart.unitBuy, unloaded: cart.unloaded }];
          if (buyer) {
            if (!buyer.stock) buyer.stock = {};
            for (const it of items) {
              const left = (it.qty || 0) - (it.unloaded || 0);
              if (left > 1e-9) {   // force-deliver the paid-for remainder (money-conserving); Sim clamps any over-cap excess
                buyer.stock[it.goodId] = (buyer.stock[it.goodId] || 0) + left;
                it.unloaded = (it.unloaded || 0) + left;
                if (typeof Sim !== "undefined" && Sim.statTraded) Sim.statTraded(state, it.goodId, left);   // MISSION-STATS: units delivered
              }
            }
          }
          cart.done = true;
        };
        if (Array.isArray(cart.cargo)) {
          if (buyer) {
            if (!buyer.stock) buyer.stock = {};
            for (const item of cart.cargo) {
              const room = Math.max(0, capG - (buyer.stock[item.goodId] || 0));
              const move = Math.min(perTick, item.qty - (item.unloaded || 0), room);
              if (move > 0) {
                buyer.stock[item.goodId] = (buyer.stock[item.goodId] || 0) + move;
                item.unloaded = (item.unloaded || 0) + move;
                if (typeof Sim !== "undefined" && Sim.statTraded) Sim.statTraded(state, item.goodId, move);   // MISSION-STATS: units delivered
              }
            }
          }
          const allDone = cart.cargo.every(it => (it.unloaded || 0) >= it.qty);
          cart.dwell = (cart.dwell || 0) - 1;
          if (allDone) cart.done = true;                                   // delivered in full
          else if (cart.dwell <= -(cart.dwellLimit || 0)) finishUnload();  // safety timeout → force-deliver remainder
        } else {
          if (buyer) {
            if (!buyer.stock) buyer.stock = {};
            const move = Math.min(perTick, cart.qty - (cart.unloaded || 0),
                                  Math.max(0, capG - (buyer.stock[cart.goodId] || 0)));
            if (move > 0) {
              buyer.stock[cart.goodId] = (buyer.stock[cart.goodId] || 0) + move;
              cart.unloaded = (cart.unloaded || 0) + move;
              if (typeof Sim !== "undefined" && Sim.statTraded) Sim.statTraded(state, cart.goodId, move);   // MISSION-STATS: units delivered
            }
          }
          cart.dwell = (cart.dwell || 0) - 1;
          if ((cart.unloaded || 0) >= cart.qty) cart.done = true;          // delivered in full
          else if (cart.dwell <= -(cart.dwellLimit || 0)) finishUnload();  // safety timeout → force-deliver remainder
        }
        continue;
      }

      // -- Travel (outbound / return) --  OFFROAD: no road link ⇒ half speed.
      cart.progress += cartSpeed * (cart.road === false ? (cfg.offRoadSpeedMult || 0.5) : 1);
      if (cart.progress < 1) continue;
      cart.progress = 1;

      if (cart.phase === "outbound") {
        // Arrived at the SELLER — settle the purchase ATOMICALLY at the AGREED
        // amount (EC-D). === PP-A === now per CARGO ITEM: each item mirrors the old
        // single-good settle. Town seller: tariff on each delivered value → treasury,
        // seller nets value − tariff. CASTLE seller: no tariff, full value → treasury.
        // Undelivered gold per item is refunded to the buyer; items that deliver
        // nothing are dropped, and a cart that bought nothing retires.
        const buyer = byId.get(cart.fromId);
        const sellerIsCastle = !!cart.sellerCastle;
        const seller = sellerIsCastle ? null : byId.get(cart.toId);
        const cargo = Array.isArray(cart.cargo) ? cart.cargo
          : [{ goodId: cart.goodId, qty: cart.qty, unitBuy: cart.unitBuy }];   // legacy cart
        // Town seller vanished ⇒ refund the whole carried amount and retire.
        if (!sellerIsCastle && !seller) {
          const carried = cart.agreedGold || cargo.reduce((s, it) => s + (it.unitBuy || 0) * it.qty, 0);
          if (buyer) buyer.gold = (buyer.gold || 0) + carried;
          cart.done = true; continue;
        }
        // P4-C hook: a "Kingdom Fair" event waives the tariff (multiplier → 0).
        const tariffMult = (typeof Events !== "undefined" && Events.tariffMultiplier)
          ? Events.tariffMultiplier(state) : 1;
        let liveQty = 0;
        for (const item of cargo) {
          const carriedForItem = (item.unitBuy || 0) * item.qty;
          let take, value;
          if (sellerIsCastle) {
            castleRelease(state, item.goodId, item.qty);      // release castle reservation
            if (!state.castleStock) state.castleStock = {};
            const cs = state.castleStock[item.goodId] || 0;
            take = Math.min(item.qty, Math.max(0, cs));
            value = (item.unitBuy || 0) * take;
            if (take > 0) {
              state.castleStock[item.goodId] = cs - take;
              state.treasury += value;                        // castle sells for the kingdom (NO tariff)
            }
          } else {
            release(seller, item.goodId, item.qty);           // release reservation on arrival
            if (!seller.stock) seller.stock = {};
            take = Math.min(item.qty, Math.max(0, seller.stock[item.goodId] || 0));
            value = (item.unitBuy || 0) * take;
            const tariff = tariffRate * value * tariffMult;   // GDD §6.3: cut (+ research bonus)
            if (take > 0) {
              seller.stock[item.goodId] = (seller.stock[item.goodId] || 0) - take;  // passive sale
              seller.gold = (seller.gold || 0) + (value - tariff);                  // seller nets value − tariff
              state.treasury += tariff;                                             // → player's treasury
              if (typeof Sim !== "undefined" && Sim.statTaxEarned) Sim.statTaxEarned(state, tariff);   // MISSION-STATS: tariff/tax earned
              if (typeof Ledger !== "undefined") Ledger.record(seller, "sales", value - tariff);  // PP-A ledger
            }
          }
          if (buyer && carriedForItem > value) buyer.gold = (buyer.gold || 0) + (carriedForItem - value);  // refund undelivered
          if (buyer && take > 0 && typeof Ledger !== "undefined") Ledger.record(buyer, "buys", value);     // PP-A ledger
          item.qty = take;            // carry only what was actually bought
          item.unloaded = 0;
          liveQty += take;
        }
        cart.cargo = cargo.filter(it => it.qty > 0);          // drop fully-undelivered items
        cart.totalQty = liveQty;
        if (!cart.cargo.length) { cart.done = true; continue; }  // bought nothing → retire (already refunded)
        cart.goodId = cart.cargo[0].goodId; cart.qty = cart.cargo[0].qty; cart.unitBuy = cart.cargo[0].unitBuy;  // re-mirror primary
        cart.phase = "loading"; cart.loaded = 0; cart.dwell = dwellFor(cart.totalQty);
      } else {
        // === CAPFIX === keep the naive dwell for feel, plus a generous safety ceiling
        // (dwellLimit) so a warehouse-throttled unload waits for room instead of the
        // cart retiring with cargo aboard. See the unloading block above.
        cart.phase = "unloading"; cart.unloaded = 0;
        cart.dwell = dwellFor(cart.totalQty || cart.qty);
        cart.dwellLimit = cart.dwell * ((CONFIG.trade && CONFIG.trade.unloadTimeoutMult) || 4);
      }
    }

    // --- 3. Prune retired carts ---------------------------------------------
    if (state.carts.some(c => c.done)) state.carts = state.carts.filter(c => !c.done);

    return state;
  };
})();
// === TRADE END ===
