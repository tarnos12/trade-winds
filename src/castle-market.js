// CASTLE MARKET (buying side). A self-contained layer that runs AFTER
// ResearchEconomy.tick in the accumulator, sharing the SAME castle-trader fleet
// (kind:"castle") and cap (CONFIG.researchEconomy.maxTraders). It dispatches royal
// buyers for the goods the player ENABLED in state.castleTrade, up to each good's
// `limit`, into state.castleStock (no tariff — same as research buying). Research
// materials get FIRST pick because ResearchEconomy.tick fills the fleet first; the
// market only sees whatever cap remains. Its carts are advanced + settled by
// ResearchEconomy's own advance loop (kind:"castle"), so buying logic lives here
// and movement stays in one place — a cart dispatched here first advances on the
// NEXT tick (1-tick latency; harmless). Deterministic via state.castleMarketSeed.
var CastleMarket = (function () {
  function normalize(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const gid in raw) {
      const v = raw[gid];
      if (!v || typeof v !== "object") continue;
      const limit = (typeof v.limit === "number" && isFinite(v.limit) && v.limit >= 0) ? v.limit : 0;
      out[gid] = { enabled: !!v.enabled, limit: limit };
    }
    return out;
  }
  // Units of a good already committed to the castle across live carts (research +
  // market carts are both kind:"castle" and deliver into castleStock).
  function inFlightCastle(state, gid) {
    let n = 0;
    for (const c of (state.carts || [])) if (!c.done && c.kind === "castle" && c.goodId === gid) n += c.qty;
    return n;
  }
  // Units still worth buying toward a good's limit = limit − held − in-flight.
  function remaining(state, gid) {
    const ct = state.castleTrade && state.castleTrade[gid];
    if (!ct || !ct.enabled) return 0;
    const held = (state.castleStock && state.castleStock[gid]) || 0;
    return (ct.limit || 0) - held - inFlightCastle(state, gid);
  }
  function enabledSellStock(state) {
    const out = {}; const ct = (state && state.castleTrade) || {};
    for (const gid in ct) if (ct[gid] && ct[gid].enabled) out[gid] = (state.castleStock && state.castleStock[gid]) || 0;
    return out;
  }
  function tick(state) {
    if (!state) return state;
    if (typeof ResearchEconomy === "undefined") return state;
    if (!Array.isArray(state.carts)) state.carts = [];
    if (typeof state.treasury !== "number") state.treasury = 0;
    if (typeof state.castleMarketSeed !== "number") state.castleMarketSeed = 0;
    const ct = state.castleTrade;
    if (!ct || typeof ct !== "object") return state;
    const C = CONFIG.researchEconomy;
    const towns = state.towns || [];
    ResearchEconomy.stock(state);   // ensure state.castleStock exists

    // Dedicated seeded RNG stream (NOT researchSeed/tradeSeed — keeps those in sync).
    const rng = mulberry32(state.castleMarketSeed | 0);
    state.castleMarketSeed = (Math.imul(state.castleMarketSeed | 0, 1664525) + 1013904223) | 0;

    const buffer = (CONFIG.econ && CONFIG.econ.bufferTarget) || 1;
    const needOf = (t, gid) => ((t.demand && t.demand[gid]) || 0) * buffer;
    const reservedOf = (t, gid) => (t && t.reserved && t.reserved[gid]) || 0;
    const reserve = (t, gid, n) => { if (!t.reserved) t.reserved = {}; t.reserved[gid] = (t.reserved[gid] || 0) + n; };
    const priceOf = (town, gid) => {
      const p = town.prices && town.prices[gid];
      if (typeof p === "number") return p;
      if (typeof Sim !== "undefined" && Sim.priceFor) return Sim.priceFor(town, gid);
      return (CONFIG.goods[gid] && CONFIG.goods[gid].basePrice) || 1;
    };
    const townKey = (t) => HexMath.key(t.q, t.r);
    const fromKey = ResearchEconomy.castleHex();
    const cartCapacity = C.cartCapacity;

    let guard = 0;
    while (ResearchEconomy.activeCastleCarts(state) < C.maxTraders && guard++ <= C.maxTraders) {
      // (a) enabled goods still under their limit (respecting held + in-flight).
      const gaps = [];
      for (const gid in ct) {
        if (!ct[gid] || !ct[gid].enabled) continue;
        const rem = remaining(state, gid);
        if (rem > C.buyThreshold && rem > 0) gaps.push({ gid, rem });
      }
      if (!gaps.length) break;
      gaps.sort((a, b) => b.rem - a.rem || (a.gid < b.gid ? -1 : a.gid > b.gid ? 1 : 0));
      const gapSlate = gaps.slice(0, C.topRandom);
      const want = gapSlate[Math.min(gapSlate.length - 1, Math.floor(rng() * gapSlate.length))];

      // (b) best reachable surplus seller of want.gid.
      const offers = [];
      for (const seller of towns) {
        if (!seller || !seller.stock) continue;
        const surplus = (seller.stock[want.gid] || 0) - reservedOf(seller, want.gid) - needOf(seller, want.gid);
        if (surplus <= 0) continue;
        const route = Pathing.route(state, fromKey, townKey(seller));
        if (!route) continue;
        offers.push({ seller, surplus, route, price: priceOf(seller, want.gid) });
      }
      if (!offers.length) break;
      offers.sort((a, b) => b.surplus - a.surplus || a.price - b.price || a.route.cost - b.route.cost || a.seller.id - b.seller.id);
      const slate = offers.slice(0, C.topRandom);
      const pick = slate[Math.min(slate.length - 1, Math.floor(rng() * slate.length))];

      // (c) dispatch: treasury pays the agreed gold up front; no tariff on castle buys.
      const agreedUnit = pick.price;
      const affordable = agreedUnit > 0 ? (state.treasury || 0) / agreedUnit : cartCapacity;
      const qty = Math.min(cartCapacity, pick.surplus, want.rem, affordable);
      if (!(qty > 0)) break;
      const agreedGold = agreedUnit * qty;
      reserve(pick.seller, want.gid, qty);
      state.treasury = (state.treasury || 0) - agreedGold;
      state.carts.push({
        id: (state._nextCartId = (state._nextCartId || 0) + 1),
        kind: "castle", fromId: ResearchEconomy.CASTLE_ID, toId: pick.seller.id,
        goodId: want.gid, qty: qty, unitBuy: agreedUnit, agreedGold: agreedGold,
        path: pick.route.path.slice(), progress: 0, phase: "outbound", done: false,
      });
    }
    return state;
  }
  return { tick, normalize, enabledSellStock, remaining, inFlightCastle };
})();
// === /PP-A ===
