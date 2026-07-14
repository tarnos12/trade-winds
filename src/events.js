/* BUILD:progress END */
// === EVENTS-CORE START ===  (P4-C / slot #4 — random events: cozy market
// opportunities, GDD §7.3). Pure + deterministic: no DOM / canvas / Math.random —
// timing draws from a seeded stream on State (state.eventSeed), mirroring Trade.
// Effects are exposed as DATA HOOKS (farmMultiplier / crazeGood / adjustDemand /
// tariffMultiplier) that Sim.tick & Trade.tick read through `typeof Events` guards,
// so the pure cores stay independently testable. Wired into the 500ms accumulator
// right AFTER Trade.tick(state). Events are opportunities, never progress-eaters:
// they boost output, spike a price, waive the tariff, or reroute one road (which
// auto-repairs) — nothing is destroyed.
Object.assign(CONFIG, {
  events: {
    minGapTicks: 40,      // quiet stretch after an event ends before another may start
    checkEveryTicks: 12,  // ticks between "roll for a new event" checks
    startChance: 0.5,     // chance an eligible check actually starts one
    defs: {
      bumper: { id: "bumper", name: "Bumper Harvest", icon: "🌾",
        desc: "Farms are overflowing — grain output +50%.",
        weight: 3, durationTicks: 60, farmMultiplier: 1.5 },
      craze:  { id: "craze", name: "Demand Craze", icon: "🔥",
        desc: "One good is all the rage — its demand triples.",
        weight: 3, durationTicks: 50, demandMultiplier: 3, demandFloor: 6 },
      fair:   { id: "fair", name: "Kingdom Fair", icon: "🎪",
        desc: "Tariff-free trading — carts pay no tariff.",
        weight: 2, durationTicks: 40, tariffFree: true },
      // AA: "Collapsed Bridge" (road-cutting) event removed — it was the only
      // collapseRoad event; the road-cut machinery below is now dead but harmless.
    },
  },
});

var Events = (typeof Events !== "undefined" && Events) || {};
(function () {
  // ---- effect hooks (read by Sim.tick / Trade.tick through typeof guards) ----
  Events.farmMultiplier = function (state) {           // bumper harvest
    const e = state && state.event;
    if (e && e.id === "bumper") { const d = CONFIG.events.defs.bumper; return (d && d.farmMultiplier) || 1; }
    return 1;
  };
  Events.crazeGood = function (state) {                // id of the craze good, or null
    const e = state && state.event;
    return (e && e.id === "craze" && e.goodId) ? e.goodId : null;
  };
  Events.adjustDemand = function (state, goodId, base) { // craze: triples + floors demand
    if (Events.crazeGood(state) === goodId) {
      const d = CONFIG.events.defs.craze;
      return (base || 0) * (d.demandMultiplier || 3) + (d.demandFloor || 0);
    }
    return base || 0;
  };
  Events.tariffMultiplier = function (state) {         // fair: waives the tariff
    const e = state && state.event;
    return (e && e.id === "fair") ? 0 : 1;
  };
  Events.isActive = function (state) { return !!(state && state.event); };

  // ---- road helpers (state.roads is a Set at runtime, an array from a save) ---
  function roadList(state) {
    const r = state && state.roads;
    if (!r) return [];
    if (typeof r.has === "function" && typeof r.forEach === "function") return Array.from(r); // Set
    if (Array.isArray(r)) return r.slice();
    return [];
  }
  function delRoad(state, key) {
    const r = state.roads;
    if (r && typeof r.delete === "function") r.delete(key);
    else if (Array.isArray(r)) { const i = r.indexOf(key); if (i >= 0) r.splice(i, 1); }
  }
  function addRoad(state, key) {
    const r = state.roads;
    if (r && typeof r.add === "function") r.add(key);
    else if (Array.isArray(r)) { if (r.indexOf(key) < 0) r.push(key); }
  }
  function invalidatePathing() {
    if (typeof Pathing !== "undefined" && Pathing.invalidate) Pathing.invalidate();
  }
  // P1: is hex `key` ("q,r") currently occupied by a town center, one of its
  // buildings, or the research center? Pure/deterministic (HexMath only). Used to
  // suppress a bridge "repair" that would otherwise drop a road back onto a hex
  // the player built on while it was collapsed.
  function hexOccupied(state, key) {
    for (const t of (state.towns || [])) {
      if (!t) continue;
      if (HexMath.key(t.q, t.r) === key) return true;
      for (const b of (t.buildings || [])) if (b && HexMath.key(b.q, b.r) === key) return true;
    }
    const rc = state.researchCenter;
    if (rc && HexMath.key(rc.q, rc.r) === key) return true;
    return false;
  }

  function weightedPick(rng) {
    const defs = CONFIG.events.defs, ids = Object.keys(defs);
    let total = 0; for (const id of ids) total += defs[id].weight || 1;
    let r = rng() * total;
    for (const id of ids) { r -= defs[id].weight || 1; if (r <= 0) return id; }
    return ids[ids.length - 1];
  }

  // Start `id`. Returns true on success, false if it can't fire (e.g. a bridge
  // collapse with no roads to collapse). Mutates state (state.event, maybe roads).
  function beginEvent(state, id, rng) {
    const def = CONFIG.events.defs[id];
    if (!def) return false;
    const ev = { id: id, ticksLeft: def.durationTicks };
    if (id === "craze") {
      const goods = Object.keys(CONFIG.goods);
      ev.goodId = goods[Math.floor(rng() * goods.length)] || goods[0];
    }
    if (def.collapseRoad) {
      const roads = roadList(state);
      if (!roads.length) return false;              // nothing to collapse — skip cleanly
      ev.roadKey = roads[Math.floor(rng() * roads.length)];
      delRoad(state, ev.roadKey);
      invalidatePathing();
    }
    state.event = ev;
    return true;
  }

  // End the current event, undoing any reversible world change (bridge repair).
  // M3: gate on the DEF's collapseRoad flag rather than a hardcoded id string —
  // a loaded event whose id no longer names a def (retired/renamed in a later
  // version) or a garbage roadKey (bad save) must not leave a road permanently
  // missing with no repair path.
  function endEvent(state) {
    const e = state.event;
    if (!e) return;
    const def = CONFIG.events.defs[e.id];
    // M3 + P1: restore the collapsed road only if the def marks it collapseRoad,
    // roadKey is a real string, AND the vacated hex is still empty. If the player
    // founded a town or built on that hex while the bridge was out, re-adding the
    // road would double-occupy it (a Pathing road-node under a live building —
    // carts route through the structure and placement reports a phantom road
    // there forever). In that case drop the repair; the road stays gone.
    if (def && def.collapseRoad && typeof e.roadKey === "string" && !hexOccupied(state, e.roadKey)) {
      addRoad(state, e.roadKey); invalidatePathing();
    }
    state.event = null;
  }

  // Advance the event layer by one tick. Deterministic (seeded). Sets a transient
  // state._eventNotice ({type:'start'|'end', id}) the browser layer drains for toasts.
  Events.tick = function (state) {
    if (!state) return state;
    if (typeof state.eventSeed !== "number") state.eventSeed = 0;
    if (typeof state.eventCooldown !== "number") state.eventCooldown = CONFIG.events.minGapTicks;
    const cfg = CONFIG.events;
    const rng = mulberry32(state.eventSeed | 0);
    state.eventSeed = (Math.imul(state.eventSeed | 0, 1664525) + 1013904223) | 0;
    state._eventNotice = null;

    if (state.event) {                              // an event is running — count it down
      state.event.ticksLeft = (state.event.ticksLeft | 0) - 1;
      if (state.event.ticksLeft <= 0) {
        const endedId = state.event.id;
        endEvent(state);
        state.eventCooldown = cfg.minGapTicks;
        state._eventNotice = { type: "end", id: endedId };
      }
      return state;
    }

    if (state.eventCooldown > 0) { state.eventCooldown--; return state; }

    // cooldown elapsed → roll. Reset the gap either way so rolls are paced.
    state.eventCooldown = cfg.checkEveryTicks;
    if (rng() < cfg.startChance) {
      const id = weightedPick(rng);
      if (beginEvent(state, id, rng)) state._eventNotice = { type: "start", id: id };
    }
    return state;
  };

  // Force-start a specific event now (used by the headless smoke test / debug).
  Events.force = function (state, id) {
    if (!state) return false;
    if (typeof state.eventSeed !== "number") state.eventSeed = 0;
    const rng = mulberry32(((state.eventSeed | 0) ^ 0x9e3779b9) | 0);
    if (state.event) endEvent(state);
    const ok = beginEvent(state, id, rng);
    state._eventNotice = ok ? { type: "start", id: id } : null;
    return ok;
  };
})();
// === EVENTS-CORE END ===
