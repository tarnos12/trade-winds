// === PP-A === CITY LEDGER — bounded per-town gold history + per-tick flow tally.
// Pure and save-safe (guards every field). town.ledger = {
//   hist:      [numbers]                       // town.gold sampled once per Sim tick (bounded)
//   tally:     {tax,sales,buys,transfers,net}  // flows accumulating for the CURRENT window
//   tallyHist: [{tax,sales,buys,transfers,net}]// bounded ring of per-tick snapshots (for averages)
// }
// Flow hooks: Sim records "tax", Trade records "sales"/"buys" on settle, the UI
// Give/Take buttons record "transfers" via recordTransfer(). sample() (called at
// the TOP of each town's Sim step) snapshots the flows accumulated since the last
// sample, pushes the gold reading, then RESETS the tally so the new window starts
// clean — so a snapshot captures one tick's worth of flows (prev Sim tax + prev
// Trade sales/buys + transfers). Gold moves at trade DISPATCH but sales/buys are
// recorded at SETTLE, so hist dips and the tally entries can land a few ticks
// apart — fine for a budget chart (documented).
var Ledger = (function () {
  const KEYS = ["tax", "sales", "buys", "transfers"];
  const cap = () => (CONFIG.town && CONFIG.town.ledgerHist) || 600;
  function freshTally() { return { tax: 0, sales: 0, buys: 0, transfers: 0, net: 0 }; }
  function ensure(town) {
    if (!town) return null;
    let L = town.ledger;
    if (!L || typeof L !== "object") { L = town.ledger = { hist: [], tally: freshTally(), tallyHist: [] }; }
    if (!Array.isArray(L.hist)) L.hist = [];
    if (!L.tally || typeof L.tally !== "object") L.tally = freshTally();
    else { for (const k of KEYS) if (typeof L.tally[k] !== "number") L.tally[k] = 0;
           if (typeof L.tally.net !== "number") L.tally.net = 0; }
    if (!Array.isArray(L.tallyHist)) L.tallyHist = [];
    return L;
  }
  // Load-time normalizer: preserve a valid ledger, hard-reset a malformed one.
  function normalizeTown(town) {
    if (!town) return null;
    const L = town.ledger;
    const bad = !L || typeof L !== "object" || !Array.isArray(L.hist) ||
      L.hist.some(x => typeof x !== "number") || !L.tally || typeof L.tally !== "object" ||
      (L.tallyHist != null && !Array.isArray(L.tallyHist));
    if (bad) town.ledger = { hist: [], tally: freshTally(), tallyHist: [] };
    return ensure(town);
  }
  function record(town, key, amount) {
    if (!amount || KEYS.indexOf(key) < 0) return;
    const L = ensure(town); if (L) L.tally[key] += amount;
  }
  function recordTransfer(town, amount) {
    if (!amount) return; const L = ensure(town); if (L) L.tally.transfers += amount;
  }
  // Snapshot the accumulated tally + gold, then reset the tally for the next window.
  function sample(town) {
    const L = ensure(town); if (!L) return;
    L.tally.net = (L.tally.tax || 0) + (L.tally.sales || 0) - (L.tally.buys || 0) + (L.tally.transfers || 0);
    const C = cap();
    L.hist.push((town && typeof town.gold === "number") ? town.gold : 0);
    while (L.hist.length > C) L.hist.shift();
    L.tallyHist.push({ tax: L.tally.tax, sales: L.tally.sales, buys: L.tally.buys,
                       transfers: L.tally.transfers, net: L.tally.net });
    while (L.tallyHist.length > C) L.tallyHist.shift();
    L.tally = freshTally();
  }
  // Mean of a tally key over the last n snapshots (for the budget chart / breakdown).
  function lastNAverage(town, key, n) {
    const L = ensure(town); if (!L) return 0;
    const h = L.tallyHist; const cnt = Math.min(n || 0, h.length);
    if (cnt <= 0) return 0;
    let s = 0; for (let i = h.length - cnt; i < h.length; i++) s += (h[i][key] || 0);
    return s / cnt;
  }
  return { ensure, normalizeTown, record, recordTransfer, sample, lastNAverage };
})();
