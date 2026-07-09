// Headless test for Trade Winds P4-B — the pure PROGRESS-CORE (town leveling +
// King's quests + prestige + castle levels). Evals the code between the
// PURE_CORE markers in index.html (CONFIG + Sim + … + Town/Castle/Quests) — no
// browser needed.
//   node test/progress.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* PURE_CORE_START \*\/([\s\S]*?)\/\* PURE_CORE_END \*\//);
if (!m) { console.error("FAIL: could not find PURE_CORE markers in index.html"); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  m[1] + "\nthis.CONFIG=CONFIG; this.HexMath=HexMath; this.Sim=Sim;" +
         "this.Town=Town; this.Castle=Castle; this.Quests=Quests;",
  sandbox
);
const { CONFIG, Town, Castle, Quests } = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

function mkTown(over) {
  return Object.assign({
    id: 1, q: 0, r: 0, level: 1, gold: 0,
    pop: { peasants: 0, workers: 0, burghers: 0 }, happiness: 100,
  }, over);
}

// ---- 1. Town.canUpgrade gating ----------------------------------------------
(function () {
  const req = CONFIG.town.upgrade[2];
  ok("town upgrade req defined for L2", req && req.pop > 0 && req.gold > 0);

  // Under both thresholds → blocked.
  const poor = mkTown({ level: 1, gold: 0, pop: { peasants: 0, workers: 0, burghers: 0 } });
  ok("canUpgrade fails with no pop/gold", Town.canUpgrade(poor).ok === false);

  // Enough pop but not gold → blocked.
  const noGold = mkTown({ level: 1, gold: 0, pop: { peasants: req.pop, workers: 0, burghers: 0 } });
  ok("canUpgrade fails without gold", Town.canUpgrade(noGold).ok === false);

  // Enough gold but not pop → blocked.
  const noPop = mkTown({ level: 1, gold: req.gold, pop: { peasants: 1, workers: 0, burghers: 0 } });
  ok("canUpgrade fails without pop", Town.canUpgrade(noPop).ok === false);

  // Both met → allowed.
  const ready = mkTown({ level: 1, gold: req.gold + 50, pop: { peasants: req.pop, workers: 0, burghers: 0 } });
  ok("canUpgrade passes over threshold", Town.canUpgrade(ready).ok === true);

  // Applying the upgrade deducts gold and raises level.
  const before = ready.gold;
  const res = Town.upgrade(ready);
  ok("upgrade succeeds", res.ok === true);
  ok("upgrade raises level to 2", ready.level === 2);
  ok("upgrade deducts gold", ready.gold === before - req.gold);
  ok("town L2 can trade threshold", ready.level >= 2);

  // Max level: upgrade to 4 then blocked.
  const maxed = mkTown({ level: CONFIG.town.maxLevel, gold: 99999, pop: { peasants: 999, workers: 0, burghers: 0 } });
  ok("canUpgrade fails at max level", Town.canUpgrade(maxed).ok === false);
})();

// ---- 2. Quest: deliver completes + pays prestige ----------------------------
(function () {
  const tmpl = CONFIG.quests.find(q => q.kind === "deliver");
  ok("a deliver template exists", !!tmpl);
  const state = { warehouse: {}, treasury: 0, prestige: 0, towns: [], quest: { id: tmpl.id, progress: 0, ticks: 0 } };

  // Not enough delivered yet → no reward.
  state.warehouse[tmpl.good] = tmpl.target - 1;
  Quests.tick(state);
  ok("deliver under target pays nothing", state.prestige === 0 && (state.quest && state.quest.id === tmpl.id));

  // Meet the target → reward paid, goods consumed, new quest rolled.
  state.warehouse[tmpl.good] = tmpl.target;
  Quests.tick(state);
  ok("deliver at target pays prestige", state.prestige === tmpl.reward.prestige);
  ok("deliver pays gold", state.treasury === tmpl.reward.gold);
  ok("deliver consumes the goods", (state.warehouse[tmpl.good] || 0) === 0);
  ok("a new quest is rolled after completion", state.quest && state.quest.id !== undefined);
})();

// ---- 3. Quest: treasury completes -------------------------------------------
(function () {
  const tmpl = CONFIG.quests.find(q => q.kind === "treasury");
  ok("a treasury template exists", !!tmpl);
  const state = { warehouse: {}, treasury: tmpl.target, prestige: 0, towns: [], quest: { id: tmpl.id, progress: 0, ticks: 0 } };
  Quests.tick(state);
  ok("treasury quest pays prestige at target", state.prestige === tmpl.reward.prestige);
})();

// ---- 4. Castle upgrade consumes prestige + gold, increments level -----------
(function () {
  const req2 = CONFIG.castle.levels[2];
  ok("castle L2 requirement defined", req2 && req2.goldReq > 0);

  const state = { castleLevel: 1, prestige: 0, treasury: 0 };
  ok("castle upgrade blocked when broke", Castle.canUpgrade(state).ok === false);

  state.prestige = req2.prestigeReq + 5;
  state.treasury = req2.goldReq + 100;
  ok("castle upgrade allowed when funded", Castle.canUpgrade(state).ok === true);

  const res = Castle.upgrade(state);
  ok("castle upgrade succeeds", res.ok === true);
  ok("castle level increments to 2", state.castleLevel === 2);
  ok("castle upgrade consumes prestige", state.prestige === 5);
  ok("castle upgrade consumes gold", state.treasury === 100);
  ok("castle L2 is not victory", state.victory !== true);
})();

// ---- 5. Reaching level 5 flags victory --------------------------------------
(function () {
  // Fund the castle heavily and upgrade until max.
  const state = { castleLevel: 1, prestige: 1000, treasury: 100000 };
  let guard = 0;
  while (Castle.canUpgrade(state).ok && guard++ < 10) Castle.upgrade(state);
  ok("castle reaches max level 5", state.castleLevel === CONFIG.castle.maxLevel);
  ok("castle level 5 flags victory", state.victory === true);
  ok("no upgrade past max", Castle.canUpgrade(state).ok === false);
})();

// -----------------------------------------------------------------------------
if (fail) { console.error(`progress: ${pass} passed, ${fail} FAILED`); process.exit(1); }

// === BAL2: quest rotation skips deliver-quests for unproducible goods =========
(function () {
  // Fresh state: bread/iron_tool/clothes producers are all research-locked, so the
  // rotation must land only on non-deliver quests (treasury/happiness) until then.
  const st = { research: { unlocked: [], active: null, progress: 0, spent: 0, queue: [] },
               towns: [], warehouse: {}, treasury: 0, _questSeq: 0 };
  let sawLockedDeliver = false;
  for (let i = 0; i < 12; i++) {
    const t = Quests.pick(st);
    if (t.kind === "deliver") sawLockedDeliver = true;
  }
  ok("no deliver-quest offered while its good is unproducible", !sawLockedDeliver);
  // Unlock the bakery chain -> deliver-bread becomes offerable again.
  st.research.unlocked.push("unlock_bakery");
  let sawBread = false;
  for (let i = 0; i < 12; i++) if (Quests.pick(st).id === "deliver-bread") sawBread = true;
  ok("deliver-bread returns once the bakery is unlocked", sawBread);
})();
// === /BAL2 ====================================================================

console.log(`progress: ${pass} passed`);
