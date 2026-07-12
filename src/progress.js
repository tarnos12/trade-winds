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

// King's requests — a data-driven template list (GDD §7.2). One quest is active
// at a time; kinds: 'deliver' N of a good to the castle warehouse, 'treasury' ≥ N,
// 'happiness' keep `count` towns at ≥ target%. Rewards pay gold → treasury and
// prestige → state.prestige (prestige gates castle levels, §7.2).
Object.assign(CONFIG, {
  quests: [
    { id: "deliver-bread", kind: "deliver", good: "bread", target: 20, reward: { gold: 120, prestige: 1 }, desc: "Deliver 20 Bread to the castle warehouse." },
    { id: "treasury-500",  kind: "treasury", target: 500,               reward: { gold: 0,   prestige: 2 }, desc: "Grow the royal treasury to 500 g." },
    { id: "deliver-tools", kind: "deliver", good: "iron_tool", target: 15, reward: { gold: 180, prestige: 2 }, desc: "Deliver 15 Iron Tools to the castle warehouse." },  // === CC: tools→iron_tool ===
    { id: "happy-3",       kind: "happiness", count: 3, target: 80,      reward: { gold: 150, prestige: 2 }, desc: "Keep 3 towns at 80%+ happiness." },
    { id: "deliver-cloth", kind: "deliver", good: "clothes", target: 18, reward: { gold: 200, prestige: 2 }, desc: "Deliver 18 Clothes to the castle warehouse." },  // === CC: cloth→clothes ===
    { id: "treasury-1500", kind: "treasury", target: 1500,             reward: { gold: 0,   prestige: 3 }, desc: "Grow the royal treasury to 1500 g." },
  ],
});

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
  if (Town.popTotal(town) < req.pop) return { ok: false, reason: "Needs " + req.pop + " population" };
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
  if ((state.prestige || 0) < req.prestigeReq) return { ok: false, reason: "Needs " + req.prestigeReq + " prestige" };
  if ((state.treasury || 0) < req.goldReq) return { ok: false, reason: "Needs " + req.goldReq + " g" };
  return { ok: true };
};
// Consume prestige + treasury and raise state.castleLevel. Reaching maxLevel (5) is
// a MILESTONE / prestige sink only — it no longer wins the game (BALPV Phase 2A: the
// victory is now a 100%-happy aristocrat estate, see Victory.check). Returns the gate
// result (+ level on success). Deliberately does NOT set/return state.victory.
Castle.upgrade = function (state) {
  const res = Castle.canUpgrade(state);
  if (!res.ok) return res;
  const req = Castle.nextReq(state);
  state.prestige = (state.prestige || 0) - req.prestigeReq;
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

// --- King's quests (pure tick) ----------------------------------------------
var Quests = (typeof Quests !== "undefined" && Quests) || {};
Quests.template = function (id) {
  for (const q of CONFIG.quests) if (q.id === id) return q;
  return null;
};
// Deterministic rotation through the template list (no Math.random) so the same
// state replays identically. Avoids repeating the just-finished quest when it can.
Quests.pick = function (state) {
  const list = CONFIG.quests;
  const n = (state._questSeq = (state._questSeq || 0) + 1);
  // === BAL2: skip deliver-quests for goods the kingdom cannot PRODUCE yet
  // (no unlocked building outputs them) — otherwise the deterministic rotation
  // jams on an impossible quest and prestige freezes (castle stuck at L1).
  const producible = (gid) => {
    for (const id in CONFIG.buildings) {
      const def = CONFIG.buildings[id];
      if (!def.output || def.output.goodId !== gid) continue;
      if (def.startUnlocked || !def.unlockedBy) return true;
      if (typeof Research !== "undefined" && Research.has && Research.has(state, def.unlockedBy)) return true;
    }
    return false;
  };
  for (let i = 0; i < list.length; i++) {
    const t = list[(n + i) % list.length];
    if (t.kind !== "deliver" || producible(t.good)) return t;
  }
  return list[n % list.length];   // all deliver goods unproducible → keep old behavior
  // === /BAL2 ===
};
Quests.start = function (state, tmpl) {
  state.quest = { id: tmpl.id, progress: 0, ticks: 0 };
  return state.quest;
};
// Current progress value for a template against live state.
Quests.progressOf = function (state, tmpl) {
  if (tmpl.kind === "deliver") return (state.warehouse && state.warehouse[tmpl.good]) || 0;
  if (tmpl.kind === "treasury") return state.treasury || 0;
  if (tmpl.kind === "happiness") {
    const towns = state.towns || [];
    let n = 0;
    for (const t of towns) if ((t.happiness || 0) >= tmpl.target) n++;
    return n;
  }
  return 0;
};
// The number progress must reach to complete.
Quests.targetOf = function (tmpl) {
  return tmpl.kind === "happiness" ? (tmpl.count || 1) : tmpl.target;
};
// Advance the quest layer one tick: ensure an active quest, track its progress,
// and on success pay the reward (gold→treasury, prestige→state.prestige),
// consume delivered goods, then roll the next quest. Mutates State only.
Quests.tick = function (state) {
  if (!state) return state;
  if (typeof state.prestige !== "number") state.prestige = 0;
  if (typeof state.treasury !== "number") state.treasury = 0;
  if (!Array.isArray(CONFIG.quests) || !CONFIG.quests.length) return state;

  if (!state.quest) Quests.start(state, Quests.pick(state));
  const q = state.quest;
  const tmpl = Quests.template(q.id);
  if (!tmpl) { state.quest = null; return state; }   // stale id (e.g. removed template)

  q.ticks = (q.ticks || 0) + 1;
  const target = Quests.targetOf(tmpl);
  q.progress = Quests.progressOf(state, tmpl);

  if (q.progress >= target) {
    // Deliver quests consume the goods handed over so the next quest can't
    // trivially auto-complete on the same stock.
    if (tmpl.kind === "deliver" && state.warehouse) {
      const left = (state.warehouse[tmpl.good] || 0) - target;
      if (left > 0) state.warehouse[tmpl.good] = left;
      else delete state.warehouse[tmpl.good];
    }
    const r = tmpl.reward || {};
    state.treasury = (state.treasury || 0) + (r.gold || 0);
    state.prestige = (state.prestige || 0) + (r.prestige || 0);
    state._questsCompleted = (state._questsCompleted || 0) + 1;
    state.lastQuestReward = { id: tmpl.id, gold: r.gold || 0, prestige: r.prestige || 0 };
    Quests.start(state, Quests.pick(state));
  }
  return state;
};
// === PROGRESS-CORE END ===
/* BUILD:events START */
