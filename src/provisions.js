// === PROVISIONS START ===  (v0.44 — castle provisioner economy)
// Pure, deterministic castle-side production: converts castle-bought raw goods
// (potato for the built-in provisioner; fish + potato for the research-unlocked
// Advanced Provisioner) into PROVISIONS — the fuel Scout units consume to explore.
// state.provisions is a WHOLE number capped at CONFIG.castle.provisions.cap and
// starts at .start. Runs in the economy accumulator AFTER CastleMarket (which buys
// the raw inputs into state.castleStock). No DOM / rng / time — safe to fast-forward.
// Provisioner balance lives on CONFIG.castle (assembled across modules). start =
// provisions at new-game; cap = max store; each LINE converts `inputs` (whole
// units from castleStock) → `output` provisions every `everyTicks` (2 ticks = 1s).
CONFIG.castle = CONFIG.castle || {};
// The Advanced Provisioner is a research-unlocked building placed next to the
// castle; once built it runs the `advanced` line (1 fish + 1 potato → 2) and the
// castle starts buying fish. Build is instant on gold payment (from the treasury).
if (!CONFIG.advancedProvisioner) {
  CONFIG.advancedProvisioner = { name: "Advanced Provisioner", glyph: "🍲",
    build: { gold: 400 }, research: "advanced_provisioner", fishLimit: 40 };
}
if (!CONFIG.castle.provisions) {
  CONFIG.castle.provisions = {
    start: 15, cap: 30,
    basic:    { inputs: { potato: 2 },            output: 1, everyTicks: 6 },   // built-in: 2 potato → 1 provision (~3s)
    advanced: { inputs: { fish: 1, potato: 1 },   output: 2, everyTicks: 6 },   // Advanced Provisioner (v0.45): 1 fish + 1 potato → 2
  };
}

var Provisioner = (typeof Provisioner !== "undefined" && Provisioner) || {};
(function () {
  function cfg() { return (CONFIG.castle && CONFIG.castle.provisions) || {}; }
  Provisioner.cap = function () { const c = cfg(); return (typeof c.cap === "number") ? c.cap : 30; };
  Provisioner.start = function () { const c = cfg(); return (typeof c.start === "number") ? c.start : 15; };
  // Ensure the provision store + per-line timers exist (migrates old saves).
  Provisioner.ensure = function (state) {
    if (!state) return 0;
    if (typeof state.provisions !== "number") state.provisions = Provisioner.start();
    if (!state._provTimers || typeof state._provTimers !== "object") state._provTimers = {};
    return state.provisions;
  };
  // Is a BUILT Advanced Provisioner present? (a research-unlocked castle building,
  // added in v0.45; until then this is always false and only the built-in runs.)
  Provisioner.hasAdvanced = function (state) {
    return !!(state && state.advancedProvisioner && state.advancedProvisioner.built);
  };
  // One provisioner line: count a per-line timer up to everyTicks, then (while
  // armed) attempt a conversion each tick — consume whole-unit inputs from
  // castleStock and add `output` provisions (clamped to cap), resetting the timer
  // only on a successful conversion so a starved line fires the moment stock arrives.
  function runLine(state, key, def) {
    if (!def || !def.inputs) return;
    const cap = Provisioner.cap();
    const every = Math.max(1, def.everyTicks || 6);
    let t = (state._provTimers[key] || 0) + 1;
    if (t >= every) {
      t = every;   // stay armed
      const stock = state.castleStock || (state.castleStock = {});
      let can = (state.provisions || 0) < cap;
      for (const g in def.inputs) if ((stock[g] || 0) < def.inputs[g]) can = false;
      if (can) {
        for (const g in def.inputs) stock[g] = (stock[g] || 0) - def.inputs[g];
        state.provisions = Math.min(cap, (state.provisions || 0) + (def.output || 1));
        t = 0;
      }
    }
    state._provTimers[key] = t;
  }
  Provisioner.tick = function (state) {
    if (!state) return;
    Provisioner.ensure(state);
    const c = cfg();
    if (c.basic) runLine(state, "basic", c.basic);
    if (c.advanced && Provisioner.hasAdvanced(state)) runLine(state, "advanced", c.advanced);
  };
  // Progress 0..1 of a line toward its next conversion (for the castle-panel UI).
  Provisioner.progress = function (state, key) {
    const c = cfg(); const def = c && c[key]; if (!def) return 0;
    const every = Math.max(1, def.everyTicks || 6);
    const t = (state && state._provTimers && state._provTimers[key]) || 0;
    return Math.max(0, Math.min(1, t / every));
  };
})();
if (typeof window !== "undefined") window.Provisioner = Provisioner;
// === PROVISIONS END ===
