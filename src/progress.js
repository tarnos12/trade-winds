// === PROGRESS-CORE START ===  (P4-B / slot #3 — town leveling + King's quests + prestige + castle levels)
// Pure, deterministic progression layer (GDD §3.3, §7.2, §7.4). No DOM / canvas /
// I/O and no Math.random — Quests.tick reads/mutates only State (state.quest,
// state.prestige, state.treasury, state.warehouse) and is wired into the 500ms
// accumulator right AFTER Trade.tick(state). Town/Castle upgrades are pure gate +
// apply helpers the browser UI calls on a button press. Headless: test/progress.test.js.

// --- Config -----------------------------------------------------------------
// Town-center upgrade thresholds, keyed by the TARGET level (2..4). Reaching a
// level needs both a population floor and a gold cost paid from the town's purse.
Object.assign(CONFIG.town, {
  maxLevel: 4,
  upgrade: {
    2: { pop: 8,  gold: 150 },   // BAL2: reachable on peasant housing (hut cap 2)
    3: { pop: 16, gold: 400 },
    4: { pop: 26, gold: 900 },  // BAL2b: 30 was 1 above a maxed L3 city's housing (29) — unreachable
  },
});

// King's Quests were RETIRED (onboarding lives in the Getting Started missions).
// They ran invisibly (banner removed in Q) and were the sole prestige source, so
// with them gone the castle now levels on GOLD alone (see Castle.canUpgrade),
// mirroring the gold-only town upgrades from Z.

// === BALPV (Phase 2A): NEW victory condition. The game is won when any town has a
// BUILT aristocrat_home whose aristocrat-tier happiness has reached ~100% (see
// Victory.check below). This supersedes the old castle-L5 victory (Castle.upgrade no
// longer flips state.victory). Threshold lives here so QA tests + UI read one source. ===
Object.assign(CONFIG, { victory: { aristocratHappiness: 99.5 } });

// Castle levels 1→5 (GDD §3.3, §7.4). levels[N] = requirement to REACH level N
// from N-1; both prestige and treasury are consumed. Level 5 = victory.
// CONFIG.castle may already exist (the browser CASTLE-UI slice adds warehouse
// fields); merge so both survive whichever loads first.
CONFIG.castle = CONFIG.castle || {};
Object.assign(CONFIG.castle, {
  maxLevel: 5,
  levels: [
    null,                                   // index 0 unused
    { prestigeReq: 0,  goldReq: 0 },        // level 1 (start)
    { prestigeReq: 3,  goldReq: 300 },      // → 2
    { prestigeReq: 8,  goldReq: 800 },      // → 3
    { prestigeReq: 16, goldReq: 1800 },     // → 4
    { prestigeReq: 28, goldReq: 3500 },     // → 5 (victory)
  ],
});

// --- Town leveling (pure gate + apply) --------------------------------------
var Town = (typeof Town !== "undefined" && Town) || {};
Town.popTotal = function (town) {
  const p = (town && town.pop) || {};
  return (p.peasants || 0) + (p.workers || 0) + (p.burghers || 0) + (p.aristocrats || 0);   // === CC ===
};
Town.upgradeReq = function (town) {
  const next = ((town && town.level) || 1) + 1;
  if (next > CONFIG.town.maxLevel) return null;
  return CONFIG.town.upgrade[next] || null;
};
// { ok:true } when the town meets the pop + gold thresholds for its next level,
// else { ok:false, reason }. Reads only the town (no side effects).
Town.canUpgrade = function (town) {
  if (!town) return { ok: false, reason: "No town" };
  const req = Town.upgradeReq(town);
  if (!req) return { ok: false, reason: "Max level" };
  // Z: population requirement removed — a town upgrades on gold alone.
  if ((town.gold || 0) < req.gold) return { ok: false, reason: "Needs " + req.gold + " g" };
  return { ok: true };
};
// Apply an upgrade if gated-in: deduct gold, raise level (→ higher slotCap + cart
// cap, both already indexed by level elsewhere). Returns the gate result.
Town.upgrade = function (town) {
  const res = Town.canUpgrade(town);
  if (!res.ok) return res;
  const req = Town.upgradeReq(town);
  town.gold = (town.gold || 0) - req.gold;
  town.level = (town.level || 1) + 1;
  return { ok: true, level: town.level };
};

// --- Castle leveling (pure gate + apply) ------------------------------------
var Castle = (typeof Castle !== "undefined" && Castle) || {};
Castle.nextReq = function (state) {
  const lvl = (state && state.castleLevel) || 1;
  if (lvl >= CONFIG.castle.maxLevel) return null;
  return (CONFIG.castle.levels || [])[lvl + 1] || null;
};
Castle.canUpgrade = function (state) {
  const req = Castle.nextReq(state);
  if (!req) return { ok: false, reason: "Castle at maximum" };
  // Quests retired → GOLD ONLY (prestige had no other source). prestigeReq in the
  // level table is now vestigial and ignored.
  if ((state.treasury || 0) < req.goldReq) return { ok: false, reason: "Needs " + req.goldReq + " g" };
  return { ok: true };
};
// Consume treasury and raise state.castleLevel. Reaching maxLevel (5) is a
// MILESTONE only — it no longer wins the game (BALPV Phase 2A: the victory is now
// a 100%-happy aristocrat estate, see Victory.check). Returns the gate result
// (+ level on success). Deliberately does NOT set/return state.victory.
Castle.upgrade = function (state) {
  const res = Castle.canUpgrade(state);
  if (!res.ok) return res;
  const req = Castle.nextReq(state);
  state.treasury = (state.treasury || 0) - req.goldReq;
  state.castleLevel = (state.castleLevel || 1) + 1;
  return { ok: true, level: state.castleLevel };
};

// --- Victory: a fully-happy aristocrat estate (BALPV Phase 2A) ---------------
// The game is won when ANY town has a BUILT aristocrat_home AND that town's
// aristocrat-tier happiness has reached the target (~100%). Pure — reads only
// state, no Math.random / Date — and LATCHES on state.victory, so it is
// save/load-safe (a loaded win stays won; a loaded near-win re-detects next tick).
// tierHappiness.aristocrats is null unless aristocrats actually live there
// (Sim sets it null when pop.aristocrats<=0), so an empty home can never false-win.
// Wired into the fixed timestep right after Quests.tick(state).
var Victory = (typeof Victory !== "undefined" && Victory) || {};
Victory.check = function (state) {
  if (!state || state.victory) return state;                 // latch
  const need = (CONFIG.victory && CONFIG.victory.aristocratHappiness) || 99.5;
  for (const t of (state.towns || [])) {
    if (!t) continue;
    const th = t.tierHappiness && t.tierHappiness.aristocrats;
    if (typeof th !== "number" || th < need) continue;       // null/absent → no win
    const homes = Array.isArray(t.buildings) ? t.buildings : [];
    if (homes.some(b => b && b.typeId === "aristocrat_home" && b.built !== false)) {
      state.victory = true;
      break;
    }
  }
  return state;
};

// === PROGRESS-CORE END ===
/* BUILD:events START */
