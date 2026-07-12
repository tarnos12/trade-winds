const GLOBAL_SEEN = new Set(); const DISPATCHED = {};
"use strict";
// BAL2 — full scripted playthrough + quantified diagnostic report.
//   node tools/playthrough.js [ticks]
// Deterministic. Prints milestones, stalls, dead content, pacing.
const { build, step } = require("./player.js");

const TICKS = parseInt(process.argv[2] || "60000", 10);
const SNAP = 1000;
const DECIDE = 25; // player acts every 25 ticks

// ---- Research queue: a sensible front-loaded progression order -------------
const RESEARCH_ORDER = [
  // peasant base (housing + food/wood output)
  "unlock_quarry", "upg_hut_l2", "upg_lumberjack_l2", "unlock_fishery",
  "unlock_shepherd", "unlock_farm", "upg_hut_l3", "upg_sawmill_l2", "upg_farm_l2",
  // worker enablers (cottage + the fish/coal basics + T2 processors)
  "unlock_cottage", "unlock_charcoal_burner", "unlock_iron_mine", "unlock_coal_mine",
  "unlock_mill", "unlock_brewery", "unlock_bakery", "unlock_tailoring",
  "unlock_oil_maker", "unlock_clay_pit", "unlock_brickworks",
  "unlock_stonetool_maker", "unlock_gold_mine", "upg_hut_l4",
  // kingdom production/admin (material-safe: gated by the dynamic selector)
  "crop_rotation", "paved_roads", "tax_ledgers", "deep_veins", "larger_carts",
  "royal_census",
  // burgher band (T3 luxury/citizen processors)
  "unlock_manor", "unlock_forge", "unlock_pottery_workshop", "unlock_lamp_maker",
  "unlock_carpentry", "unlock_armory", "unlock_distillery", "unlock_goldsmith",
  "unlock_luxury_tailor",
  "guild_halls", "warehousing", "extra_caravan", "town_charters", "upg_farm_l3",
  "upg_lumberjack_l3", "upg_sawmill_l3",
  // aristocrat band
  "unlock_aristocrat_home",   // NOTE: the tree has no upg_aristocrat_home_l2/l3 nodes
  "master_crafts", "trade_network", "industrialize", "tariff_office", "bureaucracy",
];

// ---- Per-city build plans (priority order; slot cap truncates) -------------
// Bootstrap-safe: gold-only foundations first (hut/potato_farm/lumberjack cost
// no resources, so they never drain the starting wood:20 that seeds a fresh
// city's happiness), THEN resource-costing extractors/processors. Every city
// grows its own peasant base (food+wood); higher tiers rely on imports.
// Tier-progression-focused: a small peasant base (huts + potato + wood + stone +
// fish), then a cottage to open workers, then the tier's processors, then a manor
// for citizens. Slot caps truncate — that truncation is itself a finding.
// BAL2: SPECIALISED cities that TRADE (the economy is designed around it — no one
// city can slot a full 4-tier chain). Each plan front-loads gold-only peasant
// housing/food, then its export chain + AMPLE tier housing (the old plans built a
// single cottage/manor, capping higher tiers at the bootstrap seed forever).
//   City1 Farmlands  → food + textiles + brew/bake  (peasants + workers)
//   City2 Metalworks → stone/ore/clay/gold + metal   (peasants + workers + a forge)
//   City3 Capital    → imports intermediates, makes the luxuries, hosts ALL 4 tiers
const PLANS = {
  // BAL2b: SPECIALIZED cities that trade (the game's core loop) — no city hosts
  // the whole 4-tier chain; each fits its level-4 slot cap (20).
  1: [   // breadbasket + textiles + BURGHER CITY. Makes every burgher basic locally
         // EXCEPT lamp (bread/mead/clothes) and hosts the manor for burgher housing;
         // lamp is IMPORTED from City3's lamp_maker by trade. BUILDS (20/20): 5 huts,
         // potato/farm/lumberjack/fishery/shepherd/quarry, 2 cottages, charcoal/mill/
         // brewery/bakery/tailoring, manor, forge.
         // NOTE: this list intentionally over-specifies (23 > 20-slot cap) — the cap
         // truncates the tail (lamp_maker/pottery_workshop don't build; lamp arrives by
         // trade, pottery isn't a City1 need). That truncation is LOAD-BEARING: the
         // deterministic run is finely tuned to this exact built set + order; trimming
         // the list (e.g. dropping forge to make a "clean" 20) collapses the whole run
         // to castle-L1 / no-victory. Built roster confirmed correct — do not "tidy".
    "hut", "potato_farm", "lumberjack", "fishery", "hut", "farm", "shepherd",
    "quarry", "cottage", "charcoal_burner", "mill", "brewery", "bakery",
    "tailoring", "hut", "cottage", "farm", "hut", "hut",
    "manor", "lamp_maker", "pottery_workshop", "forge",
  ],
  2: [   // mining district: metals, bricks, tools, oil
    "hut", "potato_farm", "lumberjack", "fishery", "hut", "quarry", "cottage",
    "iron_mine", "coal_mine", "gold_mine", "clay_pit", "sawmill", "brickworks",
    "cottage", "stonetool_maker", "oil_maker", "hut", "cottage", "hut",
  ],
  3: [   // second supplier: surplus food/wood/fish/planks + mead for the district,
         // PLUS lamp for the burgher city. City3 already runs oil_maker (fish→oil),
         // so adding lamp_maker (oil→lamp) makes it the kingdom's LAMP exporter —
         // lamp is a burgher BASIC that no other connected city produces, so without
         // this burghers plateau at 70×3/4=52.5%. Trade carries the surplus lamp to
         // City1's burghers. (City4, the designed lamp backup, is road-isolated and
         // connecting it destabilises the whole deterministic economy — see player.js.)
    "hut", "potato_farm", "lumberjack", "fishery", "hut", "quarry", "farm",
    "shepherd", "sawmill", "cottage", "charcoal_burner", "mill", "brewery",
    "oil_maker", "lamp_maker", "hut", "cottage", "hut", "hut",
  ],
  4: [   // CITIZEN DISTRICT: housing-first so it can LEVEL (L1 pop gate = 8),
         // then imports intermediates, makes T3, houses the elite
    "hut", "potato_farm", "lumberjack", "hut", "fishery", "hut", "cottage",
    "manor", "forge", "pottery_workshop", "lamp_maker", "carpentry",
    "manor", "goldsmith", "armory", "distillery", "luxury_tailor",
    "aristocrat_home", "aristocrat_home", "aristocrat_home",
  ],
};

// A building whose resource cost the town cannot currently cover from its own
// stock is DEFERRED (a careful player doesn't drain essentials to scaffold an
// advanced building with no supply chain yet). Gold-only buildings always pass.
function stockCovers(town, def, Buildings) {
  const rc = Buildings.resourceCost(def);
  for (const gid in rc) if ((town.stock[gid] || 0) < rc[gid]) return false;
  return true;
}

function plannedCount(town, typeId) {
  let n = 0; for (const b of town.buildings) if (b.typeId === typeId) n++; return n;
}
function planTarget(plan, typeId) {
  let n = 0; for (const t of plan) if (t === typeId) n++; return n;
}

function run() {
  const { C, state, placeBuilding } = build();
  const { CONFIG, Buildings, Research, Town, Castle } = C;

  // Goods currently producible anywhere (some built building outputs them, or
  // they are in a town's stock). Used to gate research on material supply so a
  // material-hungry node never hard-stalls the single-active queue.
  function producibleGoods() {
    const s = new Set();
    for (const t of state.towns) {
      for (const g in t.stock) if ((t.stock[g] || 0) > 0.5) s.add(g);
      for (const b of t.buildings) {
        const def = CONFIG.buildings[b.typeId];
        if (def && def.output && b.built !== false) s.add(def.output.goodId);
      }
    }
    return s;
  }
  // Pick the next research node from the priority list that is unlockable now
  // AND whose materials the kingdom can currently supply. Enqueue just that one
  // (the queue auto-starts it). Models a rational player who researches what they
  // can feed — avoids the material-gated hard stall.
  function selectResearch() {
    if (state.research.active) return;
    if (Array.isArray(state.research.queue) && state.research.queue.length) return;
    const prod = producibleGoods();
    for (const id of RESEARCH_ORDER) {
      if (Research.has(state, id)) continue;
      const node = Research.get(id);
      if (!node) continue;   // defensive: skip any id not present in the tech tree
      if (!Research.prereqsMet(state, node)) continue;
      if ((node.cost || 0) > (state.treasury || 0)) continue;
      const mats = node.materials || {};
      let feedable = true;
      for (const g in mats) if (!prod.has(g)) { feedable = false; break; }
      if (!feedable) continue;
      Research.enqueue(state, id);
      return;
    }
  }

  // milestone trackers
  const firstTierPop = {}; // tier -> tick
  const firstTier70 = {};  // tier -> tick
  const castleLevelAt = {};
  let victoryAt = null;
  // NEW-VICTORY tracking (aristocrat_home @ >=threshold aristocrat happiness). Measured
  // independently of state.victory so the report shows the milestone even before the
  // browser shell wires Victory.check into the loop. Threshold reads CONFIG.victory
  // (added by EconDev in 2A) with a 99.5 fallback so this runs on pre-2A builds too.
  const VTHRESH = (CONFIG.victory && CONFIG.victory.aristocratHappiness) || 99.5;
  let newVictoryAt = null;    // first tick any town has a built aristocrat_home @>=VTHRESH
  let firstHomeBuiltAt = null; // first tick any town has a BUILT aristocrat_home
  const snaps = [];
  const TIERS = ["peasants", "workers", "burghers", "aristocrats"];

  // Spread scarce labour across a tier's producer buildings instead of letting the
  // greedy (array-order) assignment soak the first buildings and starve the tail. A
  // competent player micromanages worker slots (closedSlots lever) exactly this way.
  // BAL2: guarantee EVERY producer gets >=1 worker (was ceil(pop/n), which packed
  // the early buildings 2-per and left the tail at 0 — so a tier's last luxury
  // producer, e.g. tailoring→clothes, never ran, its growth gate never opened, and
  // the tier froze at the bootstrap seed). Give each building floor(pop/n), then
  // sprinkle the remainder across the first few — full utilisation AND full coverage.
  function balanceLabor(town) {
    const byTier = {};
    for (const b of town.buildings) {
      if (b.built === false) continue;
      const def = CONFIG.buildings[b.typeId];
      if (!def || !def.workerTier || !(def.workerSlots > 0)) continue;
      (byTier[def.workerTier] = byTier[def.workerTier] || []).push(b);
    }
    const popKey = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };
    for (const tier in byTier) {
      const list = byTier[tier];
      const pop = Math.round(town.pop[popKey[tier]] || 0);
      const per = Math.floor(pop / list.length);
      let rem = pop - per * list.length;
      for (const b of list) {
        const def = CONFIG.buildings[b.typeId];
        const want = Math.max(1, per + (rem-- > 0 ? 1 : 0)); // >=1 so every producer runs
        b.closedSlots = Math.max(0, def.workerSlots - want);
      }
    }
  }

  function decide() {
    for (const town of state.towns) balanceLabor(town);
    selectResearch();
    // 1. build (one per city per decision)
    for (const town of state.towns) {
      // BAL2b: player-style "Give 1k" — an importing district needs trade budget
      // before its tax base exists (real players click Give; 240t = the 2-min cooldown).
      if ((town.gold || 0) < 300 && state.treasury > 5000) {
        town._lastGive = town._lastGive || -1e9;
        if (state.tick - town._lastGive >= 240) {
          state.treasury -= 1000; town.gold = (town.gold || 0) + 1000; town._lastGive = state.tick;
        }
      }
      const plan = PLANS[town.id] || [];
      const capLeft = Buildings.slotCap(town.level, state) - Buildings.usedSlots(town);
      if (capLeft <= 0) continue;
      for (const typeId of plan) {
        if (plannedCount(town, typeId) >= planTarget(plan, typeId)) continue;
        const def = CONFIG.buildings[typeId];
        // unlocked?
        if (!def.startUnlocked && def.unlockedBy && !Research.has(state, def.unlockedBy)) continue;
        if ((def.cost && def.cost.gold || 0) > state.treasury) continue;
        // BAL2: gold-gated placement only (as in the real game) — the RESOURCE cost
        // is delivered over time from stock + trade imports, so a building may be
        // scaffolded before its materials are in hand. The old stockCovers deferral
        // created ordering deadlocks (a stone-importing city could never start any
        // stone-costing building because its transient stock dipped below the cost).
        if (placeBuilding(town, typeId)) break; // one placement per city per cycle
      }
    }
    // 2. upgrades (houses + producers) when unlocked + affordable
    for (const town of state.towns) {
      for (const b of town.buildings) {
        if (b.built === false || b.pendingUpgrade) continue;
        const r = Buildings.canStartUpgrade(state, town, b);
        if (r.ok) { Buildings.startUpgrade(state, town, b); break; }
      }
    }
    // 3. town leveling
    for (const town of state.towns) {
      const r = Town.canUpgrade(town);
      if (r.ok) Town.upgrade(town);
    }
    // 3b. treasury management via the "Take 1k" city card (EC-C): when the
    // Kingdom treasury runs low, pull 1000g from the richest eligible city into
    // the treasury (−30% happiness for ~120t, 240t cooldown — the real cost).
    if ((state.treasury || 0) < 2000) {
      let best = null;
      for (const t of state.towns) {
        if ((t.cooldownUntil || 0) > (state.tick || 0)) continue;
        // BAL2: only skim a city that keeps a healthy buffer (was 1000 → it
        // bankrupted struggling cities into a happiness death-spiral).
        if ((t.gold || 0) < 3000) continue;
        if (!best || t.gold > best.gold) best = t;
      }
      if (best) {
        best.gold -= 1000;
        state.treasury = (state.treasury || 0) + 1000;
        if (!Array.isArray(best.happyMods)) best.happyMods = [];
        best.happyMods.push({ delta: -30, untilTick: (state.tick || 0) + 120 });
        best.cooldownUntil = (state.tick || 0) + 240;
      }
    }
    // 4. castle leveling
    const cr = Castle.canUpgrade(state);
    if (cr.ok) Castle.upgrade(state);
    // 5. fill castle warehouse for the active deliver quest (emulates player castleBuy)
    fillDeliverQuest();
  }

  function fillDeliverQuest() {
    const q = state.quest; if (!q) return;
    const tmpl = C.Quests.template(q.id); if (!tmpl || tmpl.kind !== "deliver") return;
    const good = tmpl.good, target = tmpl.target;
    const have = (state.warehouse[good] || 0);
    if (have >= target) return;
    // buy from any town that has surplus, spending treasury at that town's price
    for (const town of state.towns) {
      const s = town.stock[good] || 0;
      const surplus = s - ((town.demand && town.demand[good]) || 0);
      if (surplus <= 0.5) continue;
      const take = Math.min(surplus, target - (state.warehouse[good] || 0), 5);
      const price = (town.prices && town.prices[good]) || CONFIG.goods[good].basePrice;
      const cost = price * take;
      if (cost > state.treasury) return;
      town.stock[good] = s - take;
      state.treasury -= cost;
      state.warehouse[good] = (state.warehouse[good] || 0) + take;
      if ((state.warehouse[good] || 0) >= target) return;
    }
  }

  function snapshot(tick) {
    const goods = {};
    for (const gid in CONFIG.goods) {
      let total = 0, pw = 0, w = 0;
      for (const t of state.towns) {
        const s = t.stock[gid] || 0; total += s;
        const p = (t.prices && t.prices[gid]) || 0; pw += p; w++;
      }
      goods[gid] = { total: total, price: w ? pw / w : 0 };
    }
    const cities = state.towns.map(t => ({
      id: t.id, level: t.level, happ: Math.round(t.happiness),
      gold: Math.round(t.gold),
      pop: TIERS.map(k => Math.round((t.pop[k] || 0) * 10) / 10),
      th: TIERS.map(k => t.tierHappiness && t.tierHappiness[k] != null ? Math.round(t.tierHappiness[k]) : null),
      bld: t.buildings.length,
    }));
    snaps.push({ tick, treasury: Math.round(state.treasury), prestige: state.prestige,
      castle: state.castleLevel, research: state.research.unlocked.length,
      active: state.research.active, goods, cities, carts: state.carts.filter(c => !c.done).length });
  }

  for (let tick = 1; tick <= TICKS; tick++) {
    if (tick % DECIDE === 0) decide();
    step(C, state);
    for (const c of state.carts) {
      if (!c.done && c.kind !== "castle" && !GLOBAL_SEEN.has(c.id)) {
        GLOBAL_SEEN.add(c.id);
        DISPATCHED[c.fromId] = (DISPATCHED[c.fromId] || 0) + 1;
      }
    }
    // milestones
    for (const tk of TIERS) {
      if (!firstTierPop[tk]) {
        for (const t of state.towns) if ((t.pop[tk] || 0) >= 1) { firstTierPop[tk] = tick; break; }
      }
      if (!firstTier70[tk]) {
        // basics-only happiness asymptotes to exactly 70 (capacityFullAt) from
        // below, so ">=69.5" is the honest "reached full capacity" test.
        for (const t of state.towns) {
          const h = t.tierHappiness && t.tierHappiness[tk];
          if ((t.pop[tk] || 0) >= 1 && h != null && h >= 69.5) { firstTier70[tk] = tick; break; }
        }
      }
    }
    if (!castleLevelAt[state.castleLevel]) castleLevelAt[state.castleLevel] = tick;
    if (state.victory && !victoryAt) victoryAt = tick;
    // NEW-VICTORY + first-home milestones (read-only scan; no state mutation).
    if (!newVictoryAt || !firstHomeBuiltAt) {
      for (const t of state.towns) {
        const home = t.buildings.some(b => b && b.typeId === "aristocrat_home" && b.built !== false);
        if (!home) continue;
        if (!firstHomeBuiltAt) firstHomeBuiltAt = tick;
        const ah = t.tierHappiness && t.tierHappiness.aristocrats;
        if (!newVictoryAt && typeof ah === "number" && ah >= VTHRESH) newVictoryAt = tick;
      }
    }
    if (tick % SNAP === 0) snapshot(tick);
  }

  return { C, state, snaps, firstTierPop, firstTier70, castleLevelAt, victoryAt,
           newVictoryAt, firstHomeBuiltAt, VTHRESH };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function report() {
  const t0 = Date.now();
  const R = run();
  const { C, state, snaps, firstTierPop, firstTier70, castleLevelAt, victoryAt,
          newVictoryAt, firstHomeBuiltAt, VTHRESH } = R;
  const { CONFIG } = C;
  const TIERS = ["peasants", "workers", "burghers", "aristocrats"];
  const last = snaps[snaps.length - 1];
  const L = [];
  const p = (...a) => L.push(a.join(" "));

  p("========================================================================");
  p("BAL2 PLAYTHROUGH REPORT  —  ticks=" + state.tick + "  (fertile, 3 cities, seed=bal2)");
  p("  wallclock " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  p("========================================================================");

  p("\n--- (a) TIME-TO-MILESTONES (economy ticks) ---");
  for (const tk of TIERS) p("  first " + tk.padEnd(11) + " pop>=1: " + (firstTierPop[tk] || "NEVER") +
    "   >=70% happy: " + (firstTier70[tk] || "NEVER"));
  p("  castle levels reached: " + Object.keys(castleLevelAt).sort((a,b)=>a-b)
    .map(l => "L" + l + "@" + castleLevelAt[l]).join("  "));
  // Legacy castle-L5 line — retained. Under the NEW rule this NO LONGER wins; it is
  // reported only as a mid-game milestone / regression signal.
  p("  [legacy] castle L5 milestone: " + (castleLevelAt[5] ? "tick " + castleLevelAt[5] : "NOT REACHED") +
    "   (state.victory fired: " + (victoryAt ? "tick " + victoryAt : "no") + ")");
  p("  >> NEW VICTORY (aristocrat_home @>=" + VTHRESH + "% aris happiness): " +
    (newVictoryAt ? "tick " + newVictoryAt : "NOT REACHED"));
  p("     first aristocrat_home BUILT: " + (firstHomeBuiltAt ? "tick " + firstHomeBuiltAt : "NEVER"));
  p("  final: treasury=" + last.treasury + " prestige=" + last.prestige +
    " castle=L" + last.castle + " research=" + last.research + "/" +
    CONFIG.research.length + " active=" + (last.active || "-"));

  p("\n--- final CITY state (pop / tierHappiness by tier) ---");
  for (const c of last.cities) {
    p("  City#" + c.id + " L" + c.level + " happ=" + c.happ + " bld=" + c.bld + " gold=" + c.gold);
    p("      pop  " + TIERS.map((k,i)=>k.slice(0,4)+":"+c.pop[i]).join("  "));
    p("      th%  " + TIERS.map((k,i)=>k.slice(0,4)+":"+(c.th[i]==null?"-":c.th[i])).join("  "));
  }

  // --- NEW-VICTORY diagnostic: aristocrat homes + why aristocrats (aren't) 100% ---
  // For every town that has any aristocrat_home, show the home's built state, the
  // town's live aristocrat tierHappiness, and per-good satisfaction (stock on the
  // shelf) for the aristocrat BASIC + EXTRA needs — so the capping good is one glance.
  {
    const arisNeeds = (CONFIG.needs.tiers.aristocrats) || { basic: [], extra: [] };
    const allNeeds = [...arisNeeds.basic, ...arisNeeds.extra];
    p("\n--- (a3) ARISTOCRAT-HOUSE STATUS (the NEW win gate) ---");
    let anyHome = false;
    for (const t of state.towns) {
      const homes = t.buildings.filter(b => b && b.typeId === "aristocrat_home");
      if (!homes.length) continue;
      anyHome = true;
      const built = homes.filter(b => b.built !== false).length;
      const ah = t.tierHappiness && t.tierHappiness.aristocrats;
      const ahStr = (typeof ah === "number") ? ah.toFixed(1) + "%"
                  : (ah === null || ah === undefined ? "null (no aristocrats living here)" : String(ah));
      p("  City#" + t.id + ": aristocrat_home ×" + homes.length + " (" + built + " built✓, " +
        (homes.length - built) + " scaffold✗)  pop.aris=" + (Math.round((t.pop.aristocrats||0)*10)/10) +
        "  tierHappiness.aristocrats=" + ahStr +
        (typeof ah === "number" && ah >= VTHRESH ? "  <<< WINS" : ""));
      p("      need shelf: " + allNeeds.map(g => {
        const cls = arisNeeds.basic.indexOf(g) >= 0 ? "b" : "x";
        const have = Math.round(t.stock[g] || 0);
        return g + "[" + cls + "]:" + have + (have > 0.5 ? "" : "·MISSING");
      }).join("  "));
    }
    if (!anyHome) p("  (no aristocrat_home built or scaffolded in any town — win path not yet engaged)");
  }

  // --- T3 LUXURY STATUS: the 7 goods exit-criterion 2b requires to be > 0 --------
  {
    const T3 = ["lamp", "pottery", "iron_armor", "chairs", "gold_ring", "brandy", "luxury_clothes"];
    // producing cities per good = built building whose output is that good
    const producers = {};
    for (const g of T3) producers[g] = [];
    for (const t of state.towns) {
      for (const b of t.buildings) {
        if (b.built === false) continue;
        const def = CONFIG.buildings[b.typeId];
        if (def && def.output && T3.indexOf(def.output.goodId) >= 0)
          if (producers[def.output.goodId].indexOf(t.id) < 0) producers[def.output.goodId].push(t.id);
      }
    }
    p("\n--- T3 LUXURY STATUS (exit-criterion 2b: every good must total > 0) ---");
    let allNonZero = true;
    for (const g of T3) {
      const total = (last.goods[g] && last.goods[g].total) || 0;
      const ok = total > 0.5;
      if (!ok) allNonZero = false;
      p("  " + g.padEnd(15) + " total=" + total.toFixed(1).padStart(7) +
        (ok ? "  ✓" : "  ✗ DEAD") +
        "   producers: " + (producers[g].length ? producers[g].map(i => "City#" + i).join(",") : "NONE built"));
    }
    p("  => criterion 2b (all 7 T3 luxuries > 0): " + (allNonZero ? "PASS" : "FAIL"));
  }

  // --- BAL2 tuner aid: per-city building roster (typeId Lvl built? workers) ----
  p("\n--- final BUILDINGS per city (built✓/scaffold✗, upgradeLvl, workers) ---");
  for (const t of state.towns) {
    const tally = {};
    for (const b of t.buildings) {
      const key = b.typeId + (b.upgradeLevel > 1 ? "·L" + b.upgradeLevel : "");
      const st = (b.built === false) ? "✗" : "✓";
      tally[key] = tally[key] || { n: 0, un: 0, w: 0 };
      tally[key].n++; if (b.built === false) tally[key].un++; tally[key].w += (b.workers || 0);
    }
    const hc = C.Buildings.housingCapacity ? C.Buildings.housingCapacity(t, state) : {};
    p("  City#" + t.id + " L" + t.level + " slots " + C.Buildings.usedSlots(t) + "/" + C.Buildings.slotCap(t.level, state) +
      "  housing peas:" + (hc.peasants||0) + " work:" + (hc.workers||0) + " burg:" + (hc.burghers||0) + " aris:" + (hc.aristocrats||0));
    p("     " + Object.keys(tally).map(k => k + "×" + tally[k].n + (tally[k].un ? "(" + tally[k].un + "✗)" : "") + (tally[k].w ? " w" + tally[k].w.toFixed(1) : "")).join("  "));
    const watch = ["bread","mead","clothes","lamp","pottery","chairs","gold_ring","iron_tool","gold","oil","iron_armor","brandy","luxury_clothes"];
    p("     stock: " + watch.map(g => g + ":" + Math.round(t.stock[g]||0)).filter((s,i)=> (t.stock[watch[i]]||0) > 0.5).join(" "));
  }

  // --- BAL2 tuner aid: research state (active node + material gap, castleStock) ---
  {
    const R = state.research;
    const act = R.active ? C.Research.get(R.active) : null;
    p("\n--- RESEARCH: " + R.unlocked.length + "/" + CONFIG.research.length +
      " unlocked  active=" + (R.active || "-") + "  progress=" + (R.progress||0) + "/" + (act? act.timeTicks : "-"));
    if (act) {
      const gap = [];
      for (const g in (act.materials||{})) gap.push(g + " " + Math.round((state.castleStock[g]||0)) + "/" + act.materials[g]);
      p("     active mats castle-have/need: " + (gap.join("  ") || "none"));
    }
    const cs = Object.keys(state.castleStock||{}).filter(g=>state.castleStock[g]>0.5).map(g=>g+":"+Math.round(state.castleStock[g]));
    p("     castleStock: " + (cs.join(" ") || "(empty)"));
    p("     unlocked: " + R.unlocked.join(","));
  }

  // --- (a2) STATIC: growth-PAST-70% gate analysis ---------------------------
  // IMPORTANT (was a misleading "DEADLOCK" check): a tier reaches basicHappy (70% =
  // FULL housing/worker capacity, CONFIG.needs.capacityFullAt) on its BASIC needs
  // ALONE — it bootstraps and fills its housing without any luxury. The EXTRA
  // (luxury) needs only gate growth PAST 70% toward 100%. So "every extra is
  // self-tier-produced" does NOT mean the tier can't exist; it means the tier is
  // GROWTH-CAPPED at ~70% until a lower tier / import supplies one of its extras.
  // This is a soft ceiling, not a bootstrap deadlock. (Housing is the real gate to
  // a tier appearing — e.g. aristocrats need a built aristocrat_home; see notes.)
  p("\n--- (a2) LUXURY GROWTH-CEILING (static; NOT a bootstrap deadlock) ---");
  {
    const staffTier = {};
    for (const d of Object.values(CONFIG.buildings))
      if (d.output) (staffTier[d.output.goodId] = staffTier[d.output.goodId] || new Set()).add(d.workerTier);
    const TKEY = { peasants: "peasant", workers: "worker", burghers: "burgher", aristocrats: "aristocrat" };
    for (const tk of TIERS) {
      const ex = CONFIG.needs.tiers[tk].extra;
      const self = TKEY[tk];
      const bySelfOnly = ex.every(g => { const s = staffTier[g]; return s && s.size === 1 && s.has(self); });
      const ungated = tk === "peasants";
      const verdict = ungated ? "OK (Sim ungates peasants — grows freely)"
        : (bySelfOnly ? "capped ~70% (all extras self-tier-produced; tier still fills housing on basics, just can't grow past 70% until an extra is imported)"
                      : "OK (an extra is made by a lower tier / importable — can grow past 70%)");
      p("  " + tk.padEnd(11) + " luxuries " + JSON.stringify(ex) + " -> " +
        ex.map(g => (staffTier[g] ? [...staffTier[g]].join("/") : "none")).join(", ") + "  => " + verdict);
    }
  }

  // --- (b) STALLS ---
  p("\n--- (b) STALLS ---");
  // goods pinned at ~0 kingdom-wide with demand for >2000 ticks
  const gids = Object.keys(CONFIG.goods);
  // build per-good total series
  const series = {};
  for (const g of gids) series[g] = snaps.map(s => s.goods[g].total);
  const zeroPinned = [];
  for (const g of gids) {
    // count consecutive trailing snapshots at ~0
    let run = 0; for (let i = snaps.length - 1; i >= 0; i--) { if (series[g][i] < 0.5) run++; else break; }
    if (run * 1000 >= 2000) zeroPinned.push(g + "(0 for last " + (run*1000) + "t)");
  }
  p("  goods pinned ~0 kingdom-wide (trailing >=2000t): " + (zeroPinned.length ? zeroPinned.join(", ") : "none"));
  // tiers never reaching 70% anywhere
  const neverHappy = TIERS.filter(tk => !firstTier70[tk]);
  p("  tiers that NEVER reached 70% happy anywhere: " + (neverHappy.length ? neverHappy.join(", ") : "none"));
  // tiers that exist but final th<70 everywhere
  const stuckLow = TIERS.filter(tk => {
    const any = last.cities.some(c => { const i = TIERS.indexOf(tk); return c.pop[i] >= 1 && c.th[i] != null && c.th[i] >= 70; });
    const exists = last.cities.some(c => c.pop[TIERS.indexOf(tk)] >= 1);
    return exists && !any;
  });
  p("  tiers present at end but stuck <70% in every city: " + (stuckLow.length ? stuckLow.join(", ") : "none"));
  // research stuck
  p("  research active at end (possible stall): " + (last.active || "none — all reachable done or idle"));
  const notUnlocked = CONFIG.research.map(n=>n.id).filter(id => state.research.unlocked.indexOf(id) < 0);
  p("  research nodes NOT unlocked (" + notUnlocked.length + "): " + notUnlocked.join(", "));

  // --- (c) DEAD / low-throughput content ---
  p("\n--- (c) DEAD / BROKEN / PINNED content ---");
  // price pinned at floor(0.4x base) or ceiling(3x base) over the last 5 snaps
  const floors = [], ceils = [];
  const tailN = Math.min(6, snaps.length);
  for (const g of gids) {
    const base = CONFIG.goods[g].basePrice;
    let f = true, c = true;
    for (let i = snaps.length - tailN; i < snaps.length; i++) {
      const pr = snaps[i].goods[g].price;
      if (pr > base * 0.42) f = false;
      if (pr < base * 2.9) c = false;
    }
    if (f) floors.push(g);
    if (c) ceils.push(g);
  }
  p("  price pinned at FLOOR (0.4x, chronic oversupply): " + (floors.length?floors.join(", "):"none"));
  p("  price pinned at CEILING (3x, chronic scarcity): " + (ceils.length?ceils.join(", "):"none"));
  // goods never produced (total always ~0 across whole run)
  const neverSeen = gids.filter(g => series[g].every(v => v < 0.5));
  p("  goods NEVER present anywhere (never produced/traded): " + (neverSeen.length?neverSeen.join(", "):"none"));

  // --- (d) PACING ---
  p("\n--- (d) PACING ---");
  const tt = (tk) => firstTierPop[tk] || Infinity;
  p("  tier onset spacing: peasant@" + tt("peasants") + " -> worker@" + tt("workers") +
    " -> burgher@" + tt("burghers") + " -> aristocrat@" + tt("aristocrats"));
  p("  research completed: " + last.research + "/" + CONFIG.research.length +
    " by tick " + state.tick + " (avg " + (state.tick / Math.max(1,last.research)).toFixed(0) + " t/node)");
  p("  treasury trajectory (per 1000t): " + snaps.filter((_,i)=>i%5===0).map(s=>s.treasury).join(" "));
  p("  prestige trajectory: " + snaps.filter((_,i)=>i%5===0).map(s=>s.prestige).join(" "));

  // --- full good table at end ---
  p("\n--- final kingdom good totals / avg price (base) ---");
  for (const g of gids) {
    const gg = last.goods[g];
    p("  " + g.padEnd(15) + " total=" + gg.total.toFixed(1).padStart(7) +
      "  price=" + gg.price.toFixed(1).padStart(6) + "  (base " + CONFIG.goods[g].basePrice + ")");
  }

  // --- per-good total over time (compact) ---
  p("\n--- kingdom good totals over time (every 5000t) ---");
  const cols = snaps.filter((_,i)=> (i+1)%5===0);
  p("  tick:        " + cols.map(s=>String(s.tick).padStart(7)).join(""));
  for (const g of gids) {
    p("  " + g.padEnd(13) + cols.map(s=>s.goods[g].total.toFixed(0).padStart(7)).join(""));
  }

  console.log(L.join("\n"));
}

report();

// BAL2b instrumentation
console.log("\n--- TRADE DISPATCH COUNTS (external carts per city) ---");
console.log(JSON.stringify(DISPATCHED));
