// === CROWN === (DESIGN PASS) pure Give/Take gold transfers between the Kingdom
// treasury (state.treasury) and a city's purse (town.gold), plus the destroy-city
// refund rule. Moved out of the CityCards UI closure so the found → Take → Destroy
// loop can be tested headlessly. Player-action hooks only (never called from
// Sim.tick), no DOM / Math.random / Date — deterministic and save-safe.
//
// Per-town fields (all optional; legacy saves self-heal via normalizeTown):
//   foundedTick  state.tick when the city was placed (absent → an old city, no age lock)
//   foundPaid    treasury gold actually charged to found it (absent → CONFIG foundCost)
//   takenGold    NET gold the Crown has withdrawn (Take adds, Give subtracts; may be
//                negative) — deducted from the destroy refund so Take can't be undone
//   cooldownUntil / happyMods  (unchanged EC-C channels, read by Sim)
var Crown = (function () {
  const cfg = () => (CONFIG.town && CONFIG.town.transfer) || {};
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v)) ? v : d;
  const amount = () => num(cfg().amount, 1000);
  const tickOf = (state) => (state && state.tick) || 0;
  const NO_RESIDENTS = "The city has no residents to tax yet";

  function isLive(state, town) {
    return !!town && !!state && Array.isArray(state.towns) && state.towns.includes(town);
  }
  function popOf(town) {
    const p = (town && town.pop) || {};
    return (p.peasants || 0) + (p.workers || 0) + (p.burghers || 0) + (p.aristocrats || 0);
  }
  function cooldownLeft(state, town) {
    return Math.max(0, ((town && town.cooldownUntil) || 0) - tickOf(state));
  }
  // Ticks until the post-founding Take lock lifts (0 = unlocked / legacy city).
  function ageLockLeft(state, town) {
    if (!town || typeof town.foundedTick !== "number") return 0;
    const minAge = num(cfg().takeMinAgeTicks, 600);
    return Math.max(0, minAge - (tickOf(state) - town.foundedTick));
  }
  // "m:ss" of game time for a tick count (2 ticks = 1 game-second).
  function fmtTicks(ticks) {
    const secs = Math.ceil(Math.max(0, ticks) * (num(CONFIG.econ && CONFIG.econ.baseTickMs, 500) / 1000));
    return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  }

  // { ok } | { ok:false, reason } — the reason doubles as the disabled-button tooltip.
  function canTake(state, town) {
    if (!isLive(state, town)) return { ok: false, reason: "No such city" };
    if (town.built === false || popOf(town) < num(cfg().takeMinPop, 2)) return { ok: false, reason: NO_RESIDENTS };
    const lock = ageLockLeft(state, town);
    if (lock > 0) return { ok: false, reason: NO_RESIDENTS + " — its first settlers are still arriving (" + fmtTicks(lock) + ")" };
    const cd = cooldownLeft(state, town);
    if (cd > 0) return { ok: false, reason: "Transfer cooldown " + fmtTicks(cd) };
    if ((town.gold || 0) < amount()) return { ok: false, reason: "The city holds less than " + amount() + "🪙" };
    return { ok: true };
  }
  function canGive(state, town) {
    if (!isLive(state, town)) return { ok: false, reason: "No such city" };
    const cd = cooldownLeft(state, town);
    if (cd > 0) return { ok: false, reason: "Transfer cooldown " + fmtTicks(cd) };
    if ((state.treasury || 0) < amount()) return { ok: false, reason: "The Kingdom holds less than " + amount() + "🪙" };
    return { ok: true };
  }

  function pushMod(state, town, delta) {
    if (!Array.isArray(town.happyMods)) town.happyMods = [];
    town.happyMods.push({ delta, untilTick: tickOf(state) + num(cfg().happyTicks, 120) });
    town.cooldownUntil = tickOf(state) + num(cfg().cooldownTicks, 240);
  }
  // Move `amount` city → Kingdom. Returns true when it happened.
  function take(state, town) {
    if (!canTake(state, town).ok) return false;
    const a = amount();
    town.gold -= a;
    state.treasury = (state.treasury || 0) + a;
    town.takenGold = num(town.takenGold, 0) + a;
    if (typeof Ledger !== "undefined") Ledger.recordTransfer(town, -a);   // PP-A ledger
    pushMod(state, town, num(cfg().takeHappy, -30));
    return true;
  }
  // Move `amount` Kingdom → city. Lowers the net withdrawal, so Take-then-Give
  // restores the full destroy refund (Give-then-Take nets to zero as well).
  function give(state, town) {
    if (!canGive(state, town).ok) return false;
    const a = amount();
    state.treasury -= a;
    town.gold = (town.gold || 0) + a;
    town.takenGold = num(town.takenGold, 0) - a;
    if (typeof Ledger !== "undefined") Ledger.recordTransfer(town, +a);   // PP-A ledger
    pushMod(state, town, num(cfg().giveHappy, 10));
    return true;
  }

  // Sum of the live Give/Take happiness nudges + ticks until the last expires
  // (null when none) — for the town header's "😟 −30 · 0:42" readout.
  function activeMod(state, town) {
    const mods = town && town.happyMods;
    if (!Array.isArray(mods) || !mods.length) return null;
    const now = tickOf(state);
    let delta = 0, until = -1;
    for (const m of mods) {
      if (!m || m.untilTick == null || m.untilTick < now) continue;
      delta += (m.delta || 0);
      if (m.untilTick > until) until = m.untilTick;
    }
    return (until < 0 || !delta) ? null : { delta, ticksLeft: until - now };
  }

  // Stamp a freshly placed city (call right after it joins state.towns).
  function stampFounding(state, town, paid) {
    if (!town) return;
    town.foundedTick = tickOf(state);
    town.foundPaid = num(paid, num(CONFIG.town && CONFIG.town.foundCost, 1000));
    town.takenGold = 0;
  }
  // Treasury gold returned when the city is destroyed: what was paid to found it and
  // its buildings, minus what the Crown has net withdrawn. Never the city's remaining
  // purse (that would open a purse → treasury pipe).
  function cityRefund(town) {
    if (!town) return 0;
    let paid = num(town.foundPaid, num(CONFIG.town && CONFIG.town.foundCost, 0));
    for (const b of (Array.isArray(town.buildings) ? town.buildings : [])) {
      const def = b && CONFIG.buildings[b.typeId];
      paid += (def && def.cost && def.cost.gold) || 0;
    }
    return Math.max(0, paid - Math.max(0, num(town.takenGold, 0)));
  }
  // Load-time repair: drop non-numeric values (absent = legacy semantics above).
  function normalizeTown(town) {
    if (!town) return;
    for (const k of ["foundedTick", "foundPaid", "takenGold"]) {
      if (k in town && num(town[k], null) === null) delete town[k];
    }
  }

  return { canTake, canGive, take, give, activeMod, stampFounding, cityRefund,
           normalizeTown, cooldownLeft, ageLockLeft, fmtTicks, popOf, NO_RESIDENTS };
})();
if (typeof window !== "undefined") window.Crown = Crown;
// === CROWN END ===
