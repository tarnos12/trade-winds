  // === BALANCE-LAB START === (Y/AE — economy balance + scenario tester)
  // A self-contained in-game tool: define cities (buildings × count × level) and
  // populations, then either (a) read a LIVE production-vs-consumption graph that
  // updates as you change values, or (b) RUN the scenario through the real Sim +
  // Trade for N ticks to check self-sustainability (every city happy AND net-
  // positive gold). Uses the REAL CONFIG / Sim / Buildings / Trade / Pathing math
  // (no duplicated formulas) so it reflects the actual game. Builds its own
  // full-screen overlay DOM on open() and appends it to <body> — no pre-placed
  // markup needed beyond the 🧪 button that calls BalanceLab.open().
  //
  // Two PURE, headless-callable entry points (no DOM, no window, deterministic):
  //   BalanceLab.analyze(scenario)        -> static prod-vs-cons + per-city gold
  //   BalanceLab.simulate(scenario,ticks) -> ground-truth run of Sim.tick+Trade.tick
  // Everything else here is the overlay UI (composer + live graph + Run panel).
  const BalanceLab = (function () {
    // ---- rate/time constants ------------------------------------------------
    // The economy runs 2 ticks per game-second (500ms accumulator), and the game
    // shows rates PER MINUTE. So per-minute = per-tick × 2 × 60 = ×120.
    const TICKS_PER_MIN = 120;
    const TIER_KEYS = ["peasants", "workers", "burghers", "aristocrats"];
    const WORKER_TIER_OF_POP = { peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" };

    // ---- catalog helpers (read the REAL CONFIG) -----------------------------
    function buildingEntries() {
      const out = [];
      for (const id in CONFIG.buildings) out.push({ id: id, def: CONFIG.buildings[id] });
      out.sort((a, b) => {
        const ka = kindRank(a.def.kind), kb = kindRank(b.def.kind);
        if (ka !== kb) return ka - kb;
        return (a.def.name || a.id) < (b.def.name || b.id) ? -1 : 1;
      });
      return out;
    }
    function kindRank(kind) { return kind === "house" ? 0 : kind === "extractor" ? 1 : kind === "processor" ? 2 : 3; }
    function maxLevelFor(typeId) {
      const ladder = (Buildings.upgradeLadder && Buildings.upgradeLadder(typeId)) || [];
      let m = 1;
      for (const e of ladder) if (e.level > m) m = e.level;
      return m;
    }
    function goodName(gid) { return gid; }

    // ---- expand a scenario city's building list into concrete building objects
    // Each entry -> `count` plain building objects { typeId, upgradeLevel, built:true }
    // so the REAL Buildings.* helpers (housingCapacity, upgradeEffect,
    // basicConsumptionMult) apply exactly as in-game.
    function expandBuildings(city) {
      const list = [];
      const src = (city && Array.isArray(city.buildings)) ? city.buildings : [];
      for (const spec of src) {
        if (!spec || !spec.typeId || !CONFIG.buildings[spec.typeId]) continue;
        const count = Math.max(0, Math.round(spec.count || 0));
        const level = Math.max(1, Math.round(spec.level || 1));
        // A PAUSED building stays in the list but is inert: paused workplaces
        // don't produce/consume, paused houses add no capacity (their people —
        // and thus their consumption and labour — vanish). Carried through so
        // the staffing + capacity math below can honour it.
        for (let i = 0; i < count; i++) list.push({ typeId: spec.typeId, upgradeLevel: level, built: true, paused: !!spec.paused });
      }
      return list;
    }

    // Housing capacity per tier for a city (real math), incl. baseWorkers peasants.
    // Paused houses are excluded — pausing a house empties it.
    function cityCapacity(buildings) {
      const town = { buildings: buildings.filter(b => !b.paused), pop: {} };
      const cap = Buildings.housingCapacity(town);
      const base = (CONFIG.town && CONFIG.town.baseWorkers) || {};
      cap.peasants = (cap.peasants || 0) + (base.peasants || 0);
      return cap;
    }

    // Resolve the population a city runs at: explicit override, else = capacity.
    function resolvePop(city, cap) {
      const pop = { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 };
      const ov = city && city.pop;
      for (const k of TIER_KEYS) {
        if (ov && typeof ov[k] === "number" && isFinite(ov[k])) pop[k] = Math.max(0, ov[k]);
        else pop[k] = Math.max(0, cap[k] || 0);
      }
      return pop;
    }

    // ---- CORE STATIC ANALYSIS for one city (pure) --------------------------
    // Returns per-minute prod/cons per good + gold income/deficitCost/net.
    function analyzeCity(city) {
      const buildings = expandBuildings(city);
      const cap = cityCapacity(buildings);
      const pop = resolvePop(city, cap);
      const town = { buildings: buildings, pop: pop };
      const bcm = Buildings.basicConsumptionMult(town); // per-tier basic-need reduction (house upgrades)

      // --- production: labour-limited, mirrors Sim's greedy per-tier fill ---
      const pool = {
        peasant: pop.peasants || 0, worker: pop.workers || 0,
        burgher: pop.burghers || 0, aristocrat: pop.aristocrats || 0,
      };
      const prod = {}; // per tick
      const cons = {}; // per tick (population needs + processor inputs)
      const used = []; // staffed producer instances: {goodId, typeId, level}
      for (const b of buildings) {
        if (b.paused) continue;                        // paused: no output, no input draw, frees no labour it isn't using
        const def = CONFIG.buildings[b.typeId];
        if (!def || !def.output || !def.workerTier || !(def.workerSlots > 0)) continue;
        const eff = Buildings.upgradeEffect(b);
        const slots = def.workerSlots + (eff.slotPlus || 0);
        const avail = pool[def.workerTier] || 0;
        const w = Math.min(slots, avail);
        pool[def.workerTier] = avail - (w > 0 ? w : 0);
        if (w <= 0) continue;
        const rate = def.output.ratePerWorker * w * (eff.outputMult || 1);
        prod[def.output.goodId] = (prod[def.output.goodId] || 0) + rate;
        used.push({ goodId: def.output.goodId, typeId: b.typeId, level: b.upgradeLevel || 1 });
        // processor input draw (nominal — assumes inputs are supplied). Mirrors
        // Sim's per-tick input consumption inputs[g] × workers.
        if (def.inputs) for (const gid in def.inputs) cons[gid] = (cons[gid] || 0) + def.inputs[gid] * w;
      }

      // --- consumption: per-tier perCapita over its needs (basic ×bcm) ---
      for (const tk in CONFIG.needs.tiers) {
        const n = pop[tk] || 0;
        if (n <= 0) continue;
        const spec = CONFIG.needs.tiers[tk];
        const tierBcm = (bcm && bcm[tk]) || 1;
        for (const gid in spec.perCapita) {
          const isBasic = spec.basic.indexOf(gid) >= 0;
          cons[gid] = (cons[gid] || 0) + spec.perCapita[gid] * n * (isBasic ? tierBcm : 1);
        }
      }

      // --- to per-minute ---
      const prodMin = {}, consMin = {};
      for (const g in prod) prodMin[g] = prod[g] * TICKS_PER_MIN;
      for (const g in cons) consMin[g] = cons[g] * TICKS_PER_MIN;

      // --- house income (people-tax), assuming needs met => happiness 100 ---
      const pt = CONFIG.needs.peopleTax;
      const mult = 1 + Math.max(0, 100 - pt.happyBase) * pt.bonusPerPoint;
      let income = 0;
      for (const tk of TIER_KEYS) {
        const n = pop[tk] || 0;
        if (n <= 0) continue;
        const rate = (pt.ratePerTier && pt.ratePerTier[tk] != null) ? pt.ratePerTier[tk] : pt.goldPerPop;
        income += n * rate * mult;
      }
      income *= TICKS_PER_MIN;

      // --- cost to import this city's local deficits (at basePrice) ---
      let deficitCost = 0;
      const seen = {};
      for (const g in consMin) seen[g] = 1;
      for (const g in prodMin) seen[g] = 1;
      for (const g in seen) {
        const d = (consMin[g] || 0) - (prodMin[g] || 0);
        if (d > 0) deficitCost += d * ((CONFIG.goods[g] && CONFIG.goods[g].basePrice) || 0);
      }

      return {
        id: city.id, name: city.name || ("City#" + city.id),
        pop: pop, cap: cap, prod: prodMin, cons: consMin, used: used,
        income: income, deficitCost: deficitCost, net: income - deficitCost,
      };
    }

    // ---- PUBLIC: analyze(scenario) -----------------------------------------
    function analyze(scenario) {
      const cities = (scenario && Array.isArray(scenario.cities)) ? scenario.cities : [];
      const perGood = {};
      const perCity = [];
      const detail = []; // internal per-city breakdown (used by the UI)
      const gg = () => ({ prod: 0, cons: 0, byLevel: {}, producer: null });
      for (const city of cities) {
        const c = analyzeCity(city);
        detail.push(c);
        for (const g in c.prod) { (perGood[g] = perGood[g] || gg()).prod += c.prod[g]; }
        for (const g in c.cons) { (perGood[g] = perGood[g] || gg()).cons += c.cons[g]; }
        // staffed producers, grouped by level → "2×L1, 1×L3" (only ones being used)
        for (const u of c.used || []) {
          const pg = (perGood[u.goodId] = perGood[u.goodId] || gg());
          pg.byLevel[u.level] = (pg.byLevel[u.level] || 0) + 1;
          if (!pg.producer) pg.producer = (CONFIG.buildings[u.typeId] && CONFIG.buildings[u.typeId].name) || u.typeId;
        }
        perCity.push({ id: c.id, name: c.name, income: c.income, deficitCost: c.deficitCost, net: c.net });
      }
      for (const g in perGood) perGood[g].net = perGood[g].prod - perGood[g].cons;
      return { perGood: perGood, perCity: perCity, _detail: detail };
    }

    // ---- PUBLIC: ratios() — kingdom-wide CARRYING CAPACITY ------------------
    // Scenario-INDEPENDENT (pure CONFIG math). Because cities specialise and
    // TRADE with each other, the useful balance question isn't "is one city
    // self-sufficient" but "how many consumers does ONE producer feed across
    // the kingdom". For every produced good it answers exactly that:
    //   "1 Lumberjack (240 wood/min) supports 48 peasants AND 10 Sawmills."
    // Each producer/consumer is measured at BASE level (L1), full staffing, per
    // minute (×120). effWorkers = workerSlots (+ any L1 slotPlus). A consumer is
    // either a PEOPLE tier (perCapita need) or a PROCESSOR building (input draw).
    function ratios(opts) {
      const level = (opts && opts.level) || 1;
      function effWorkers(def, typeId) {
        const eff = Buildings.upgradeEffect({ typeId: typeId, upgradeLevel: level });
        return (def.workerSlots || 0) + (eff.slotPlus || 0);
      }
      function outPerMin(id, def) {
        if (!def.output || !def.workerTier || !(def.workerSlots > 0)) return 0;
        const eff = Buildings.upgradeEffect({ typeId: id, upgradeLevel: level });
        return def.output.ratePerWorker * effWorkers(def, id) * (eff.outputMult || 1) * TICKS_PER_MIN;
      }
      const out = [];
      for (const gid in CONFIG.goods) {
        // producers of this good
        const producers = [];
        for (const id in CONFIG.buildings) {
          const def = CONFIG.buildings[id];
          if (def.output && def.output.goodId === gid) {
            const perMin = outPerMin(id, def);
            if (perMin > 0) producers.push({ typeId: id, name: def.name || id, perMin: perMin });
          }
        }
        if (!producers.length) continue; // only rank goods something can produce
        producers.sort((a, b) => b.perMin - a.perMin);
        const ref = producers[0].perMin; // 1 primary producer's output/min

        // consumers: people tiers (perCapita need) + processor buildings (input)
        const consumers = [];
        for (const tk in CONFIG.needs.tiers) {
          const pc = CONFIG.needs.tiers[tk].perCapita || {};
          if (pc[gid] > 0) {
            const each = pc[gid] * TICKS_PER_MIN; // per person, /min
            consumers.push({ kind: "people", key: tk, name: tk, eachPerMin: each,
                             supportedPerProducer: each > 0 ? ref / each : 0 });
          }
        }
        for (const id in CONFIG.buildings) {
          const def = CONFIG.buildings[id];
          if (def.inputs && def.inputs[gid] > 0 && def.workerSlots > 0) {
            const each = def.inputs[gid] * effWorkers(def, id) * TICKS_PER_MIN; // per building, /min
            consumers.push({ kind: "building", key: id, name: def.name || id, eachPerMin: each,
                             supportedPerProducer: each > 0 ? ref / each : 0 });
          }
        }
        if (!consumers.length) continue; // nothing draws it — no ratio to show
        consumers.sort((a, b) => b.eachPerMin - a.eachPerMin);
        out.push({ good: gid, producers: producers, primaryPerMin: ref,
                   primaryKind: (CONFIG.buildings[producers[0].typeId] || {}).kind, consumers: consumers });
      }
      // Order raw chains (extractors) first, then processors — so foundational
      // goods (wood/potato/fish/stone) lead over luxuries; ties by output desc.
      out.sort((a, b) => (kindRank(a.primaryKind) - kindRank(b.primaryKind)) || (b.primaryPerMin - a.primaryPerMin));
      return out;
    }

    // ========================================================================
    // GROUND-TRUTH SIMULATION — build a scratch multi-city state and run the
    // REAL Sim.tick + Trade.tick. Deterministic (fixed seeds, no Math.random).
    // ========================================================================

    // Six spread directions at hex-distance 12 from the castle (0,0); mutually
    // ≥12 apart so footprints never fuse and each keeps its gap from the castle.
    const DIRS = [
      { q: 12, r: 0 }, { q: 0, r: 12 }, { q: -12, r: 12 },
      { q: 0, r: -12 }, { q: 12, r: -12 }, { q: -12, r: 0 },
    ];
    // Abundant terrain disk (mirrors tools/player.js) so EVERY extractor chain is
    // locally buildable — isolates economy balance from map-RNG.
    const FILL = {
      1: ["fertile", "forest", "fish", "barren", "fertile", "forest"],
      2: ["barren", "stone_deposit", "iron_deposit", "clay_deposit", "coal_deposit",
          "gold_deposit", "barren", "fish", "fertile", "forest", "iron_deposit", "coal_deposit"],
      3: ["barren", "barren", "gold_deposit", "clay_deposit", "stone_deposit", "barren",
          "fertile", "forest", "fish", "barren", "iron_deposit", "coal_deposit",
          "gold_deposit", "barren", "fertile", "barren", "forest", "barren"],
      4: ["barren", "barren", "barren", "fertile", "barren", "barren", "forest", "barren",
          "stone_deposit", "fish", "barren", "clay_deposit", "barren", "fertile", "barren",
          "barren", "forest", "gold_deposit", "barren", "fish", "barren", "barren", "barren", "barren"],
    };

    function centerFor(i) {
      const d = DIRS[i % DIRS.length];
      const scale = 1 + Math.floor(i / DIRS.length) * 0.6; // push extra rings outward
      return HexMath.hexRound(d.q * scale, d.r * scale);
    }

    // Terrains reserved for extractors (never pave them with a house/processor).
    function extractorTerrains() {
      const s = new Set();
      for (const id in CONFIG.buildings) {
        const d = CONFIG.buildings[id];
        if (d.kind === "extractor" && d.terrain) s.add(d.terrain);
      }
      return s;
    }

    function buildScratchState(scenario) {
      Pathing.invalidate(); // clear any cached routes from the live game / a prior run

      const cities = (scenario && Array.isArray(scenario.cities)) ? scenario.cities : [];
      const K = (q, r) => HexMath.key(q, r);
      const hexes = new Map();
      const put = (q, r, terrain) => hexes.set(K(q, r), { q, r, terrain, revealed: true });

      const centers = cities.map((_, i) => centerFor(i));
      // Radius that comfortably contains every city disk (r4) plus margin.
      let maxReach = 8;
      for (const c of centers) maxReach = Math.max(maxReach, HexMath.dist(0, 0, c.q, c.r) + 5);
      for (const c of HexMath.range(0, 0, maxReach)) put(c.q, c.r, "barren");
      put(0, 0, "barren"); // castle hex

      // Seed each city's abundant terrain disk.
      for (const ctr of centers) {
        const disk = HexMath.range(ctr.q, ctr.r, 4);
        const idx = { 1: 0, 2: 0, 3: 0, 4: 0 };
        for (const h of disk) {
          const d = HexMath.dist(ctr.q, ctr.r, h.q, h.r);
          if (d === 0) continue;
          const pal = FILL[d]; if (!pal) continue;
          put(h.q, h.r, pal[idx[d]++ % pal.length]);
        }
      }

      const state = {
        map: { seed: "balancelab", radius: maxReach, hexes: hexes },
        roads: new Set(),
        towns: [],
        carts: [],
        treasury: 1e9, // effectively unlimited: founding/road/build gold is not the thing under test
        tariffRate: (CONFIG.trade && CONFIG.trade.tariffRate) || 0.25,
        research: (typeof Research !== "undefined" && Research.fresh) ? Research.fresh() : { unlocked: [], active: null, queue: [], progress: 0 },
        market: (typeof Market !== "undefined" && Market.fresh) ? Market.fresh() : { hist: {}, head: 0, len: 0 },
        warehouse: {},
        castleStock: Object.assign({}, (CONFIG.researchEconomy && CONFIG.researchEconomy.starterStock) || {}),
        castleTrade: {}, castleReserved: {},
        researchSeed: 0x9e3779b9 | 0,
        castleMarketSeed: 0x2545f491 | 0,
        tradeSeed: 0x5bd1e995 | 0,
        prestige: 0, castleLevel: 1, quest: null, victory: false, _questSeq: 0,
        tick: 0,
      };

      function makeTown(id, q, r) {
        const town = {
          id: id, q: q, r: r, level: 4, gold: 4000, // L4 => full slot cap + trade fleet; ample starting trade budget
          pop: { peasants: 0, workers: 0, burghers: 0, aristocrats: 0 },
          stock: Object.assign({}, (CONFIG.town && CONFIG.town.startStock) || {}),
          prices: {}, buildings: [], happiness: 70,
        };
        for (const gid in CONFIG.goods) Sim.priceFor(town, gid);
        return town;
      }

      // Found the towns.
      for (let i = 0; i < cities.length; i++) {
        const ctr = centers[i];
        state.towns.push(makeTown(cities[i].id != null ? cities[i].id : (i + 1), ctr.q, ctr.r));
      }

      // Roads: connect the castle to each center + chain adjacent centers.
      function hexLine(a, b) {
        const N = HexMath.dist(a.q, a.r, b.q, b.r), out = [];
        for (let i = 0; i <= N; i++) {
          const t = N === 0 ? 0 : i / N;
          out.push(HexMath.hexRound(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t));
        }
        return out;
      }
      const nodes = [{ q: 0, r: 0 }].concat(centers);
      const isCenter = (h) => centers.some(c => c.q === h.q && c.r === h.r);
      const link = (a, b) => { for (const h of hexLine(a, b)) if (!isCenter(h)) state.roads.add(K(h.q, h.r)); };
      for (let i = 0; i < centers.length; i++) {
        link(nodes[0], centers[i]);                          // castle -> city
        if (i + 1 < centers.length) link(centers[i], centers[i + 1]); // city -> next city
      }
      Pathing.invalidate();

      // Place each city's buildings using the REAL placement rules.
      const EXTRACTOR_TERRAINS = extractorTerrains();
      function placeBuilding(town, typeId, level) {
        const def = CONFIG.buildings[typeId];
        if (!def) return false;
        const cand = HexMath.range(town.q, town.r, 6);
        cand.sort((a, b) => HexMath.dist(a.q, a.r, town.q, town.r) - HexMath.dist(b.q, b.r, town.q, town.r));
        for (const c of cand) {
          if (def.kind !== "extractor") {
            const hx = hexes.get(K(c.q, c.r));
            if (hx && EXTRACTOR_TERRAINS.has(hx.terrain)) continue; // reserve resource ground
          }
          const r = Buildings.canPlaceBuilding(state, typeId, c.q, c.r);
          if (r.ok && r.town === town) {
            town.buildings.push({
              typeId: typeId, q: c.q, r: c.r, workers: 0,
              upgradeLevel: Math.max(1, level || 1),
              built: true, delivered: {}, // built:true — we test the ECONOMY, not construction logistics
            });
            return true;
          }
        }
        return false;
      }

      const placement = []; // per-city: {requested, placed} for diagnostics
      for (let i = 0; i < cities.length; i++) {
        const town = state.towns[i];
        const specs = expandBuildings(cities[i]).map(b => ({ typeId: b.typeId, level: b.upgradeLevel }));
        // Houses first (so peasant/worker/etc. capacity exists), then extractors, then processors.
        specs.sort((a, b) => kindRank(CONFIG.buildings[a.typeId].kind) - kindRank(CONFIG.buildings[b.typeId].kind));
        let placed = 0;
        for (const s of specs) if (placeBuilding(town, s.typeId, s.level)) placed++;
        placement.push({ id: town.id, requested: specs.length, placed: placed });

        // Seed population = requested override, else full housing capacity, so the
        // run starts populated and settles to steady state quickly.
        const cap = cityCapacity(town.buildings);
        const pop = resolvePop(cities[i], cap);
        for (const k of TIER_KEYS) town.pop[k] = Math.min(pop[k], cap[k] || 0);
        town.happiness = 70;
      }

      return { state: state, placement: placement };
    }

    // One economy step: the REAL Sim + Trade (+ guarded ancillary systems the
    // task names). Kept minimal and deterministic.
    function stepState(state) {
      Sim.tick(state);
      Trade.tick(state);
      if (typeof Market !== "undefined" && Market.tick) Market.tick(state);
    }

    // ---- PUBLIC: simulate(scenario, ticks) ---------------------------------
    function simulate(scenario, ticks) {
      const N = Math.max(1, Math.round(ticks || 3000));
      const built = buildScratchState(scenario);
      const state = built.state;

      // Sample stock totals + per-city gold at ~16 points for trend/slope.
      const SAMPLES = 16;
      const sampleEvery = Math.max(1, Math.floor(N / SAMPLES));
      const goodSeries = {}; for (const g in CONFIG.goods) goodSeries[g] = [];
      const goldSeries = state.towns.map(() => []); // per-city gold samples
      const sampleTicks = [];

      function sample(t) {
        sampleTicks.push(t);
        for (const g in CONFIG.goods) {
          let tot = 0; for (const town of state.towns) tot += (town.stock[g] || 0);
          goodSeries[g].push(tot);
        }
        for (let i = 0; i < state.towns.length; i++) goldSeries[i].push(state.towns[i].gold || 0);
      }

      sample(0);
      for (let t = 1; t <= N; t++) {
        stepState(state);
        if (t % sampleEvery === 0 || t === N) sample(t);
      }

      const minutes = N / TICKS_PER_MIN;

      // Per-city results.
      const cities = state.towns.map((town, i) => {
        const cap = Buildings.housingCapacity(town);
        const base = (CONFIG.town && CONFIG.town.baseWorkers) || {};
        cap.peasants = (cap.peasants || 0) + (base.peasants || 0);
        const present = {}, collapsed = [];
        for (const k of TIER_KEYS) {
          const p = town.pop[k] || 0;
          present[k] = p >= 0.5;
          if ((cap[k] || 0) > 0 && p < 0.5) collapsed.push(k);
        }
        // net gold/min = slope over the final 50% window.
        const gs = goldSeries[i];
        const mid = Math.floor(gs.length / 2);
        const dTicks = (sampleTicks[gs.length - 1] - sampleTicks[mid]) || 1;
        const netGoldPerMin = (gs[gs.length - 1] - gs[mid]) / (dTicks / TICKS_PER_MIN);
        const th = {};
        for (const k of TIER_KEYS) th[k] = (town.tierHappiness && town.tierHappiness[k] != null) ? town.tierHappiness[k] : null;
        const popOut = {}; for (const k of TIER_KEYS) popOut[k] = town.pop[k] || 0;
        return {
          id: town.id, name: (scenario.cities[i] && scenario.cities[i].name) || ("City#" + town.id),
          pop: popOut, tierHappiness: th, happiness: town.happiness,
          gold: town.gold || 0, netGoldPerMin: netGoldPerMin,
          present: present, collapsed: collapsed,
        };
      });

      // Per-good trend.
      const goods = {};
      for (const g in CONFIG.goods) {
        const s = goodSeries[g];
        let mn = Infinity, mx = -Infinity;
        for (const v of s) { if (v < mn) mn = v; if (v > mx) mx = v; }
        const q = Math.max(0, s.length - 1 - Math.floor(s.length / 4));
        const trend = (s[s.length - 1] || 0) - (s[q] || 0);
        goods[g] = { end: s[s.length - 1] || 0, min: isFinite(mn) ? mn : 0, max: isFinite(mx) ? mx : 0, trend: trend, series: s };
      }

      // Verdict.
      const reasons = [], warnings = [];
      let selfSustained = true;
      for (const c of cities) {
        for (const k of TIER_KEYS) {
          if (c.present[k] && (c.tierHappiness[k] == null || c.tierHappiness[k] < 70)) {
            selfSustained = false;
            reasons.push(c.name + ": " + k + " only " + (c.tierHappiness[k] == null ? "n/a" : c.tierHappiness[k].toFixed(0)) + "% happy (<70)");
          }
        }
        if (c.netGoldPerMin < -1e-6) {
          selfSustained = false;
          reasons.push(c.name + ": net gold " + c.netGoldPerMin.toFixed(1) + "/min (<0 — can't fund its imports)");
        }
        for (const k of c.collapsed) warnings.push(c.name + ": " + k + " housing built but population collapsed to ~0");
      }
      if (selfSustained && reasons.length === 0) reasons.push("All present tiers ≥70% happy and every city funds its own imports.");

      return {
        ticks: N, minutes: minutes,
        cities: cities, goods: goods,
        verdict: { selfSustained: selfSustained, reasons: reasons, warnings: warnings },
        _placement: built.placement,
      };
    }

    // ========================================================================
    // OVERLAY UI (composer + live graph + Run panel). All DOM lives here.
    // ========================================================================
    let overlay = null, scn = null, styleEl = null;

    function defaultScenario() {
      return {
        cities: [
          { id: 1, name: "City #1", pop: null, buildings: [
            { typeId: "hut", count: 2, level: 1 }, { typeId: "potato_farm", count: 2, level: 1 } ] },
          { id: 2, name: "City #2", pop: null, buildings: [
            { typeId: "hut", count: 2, level: 1 }, { typeId: "sawmill", count: 1, level: 1 }, { typeId: "fishery", count: 1, level: 1 } ] },
          { id: 3, name: "City #3", pop: null, buildings: [
            { typeId: "hut", count: 2, level: 1 }, { typeId: "shepherd", count: 1, level: 1 }, { typeId: "quarry", count: 1, level: 1 } ] },
          { id: 4, name: "City #4", pop: null, buildings: [
            { typeId: "hut", count: 3, level: 1 }, { typeId: "potato_farm", count: 3, level: 1 } ] },
        ],
      };
    }

    function fmt(n) { return (Math.round(n * 10) / 10).toLocaleString(); }
    function el(tag, attrs, kids) {
      const e = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
      if (kids) for (const c of [].concat(kids)) if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      return e;
    }

    function injectStyle() {
      if (styleEl) return;
      styleEl = document.createElement("style");
      styleEl.textContent = [
        "#balanceLabOverlay #blBody{flex:1 1 auto;display:flex;min-height:0;overflow:hidden;font-size:13px}",
        // main (tabbed) area + persistent right resource panel
        "#balanceLabOverlay .bl-main{flex:1 1 auto;min-width:0;overflow:auto;padding:12px}",
        // cities laid out as a compact responsive grid (many per row)
        "#balanceLabOverlay .bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:10px;align-items:start}",
        "#balanceLabOverlay .bl-side{flex:0 0 288px;width:288px;overflow:auto;padding:12px 14px;border-left:1px solid var(--panel-edge);background:rgba(0,0,0,.14)}",
        "#balanceLabOverlay h3{color:var(--accent);margin:0 0 8px;font-size:14px}",
        "#balanceLabOverlay h4{color:var(--paper);margin:14px 0 6px;font-size:12.5px;opacity:.85}",
        // top tab bar (Cities / Charts)
        "#balanceLabOverlay .bl-tabs{display:flex;gap:4px;margin-left:14px}",
        "#balanceLabOverlay .bl-tab{background:transparent;border:1px solid transparent;border-radius:7px 7px 0 0;color:var(--paper);opacity:.6;padding:5px 13px;cursor:pointer;font-family:inherit;font-size:12.5px}",
        "#balanceLabOverlay .bl-tab.active{opacity:1;background:var(--panel);border-color:var(--panel-edge);border-bottom-color:var(--panel);color:var(--accent);font-weight:bold}",
        // city card
        "#balanceLabOverlay .bl-city{background:var(--panel);border:1px solid var(--panel-edge);border-radius:9px;padding:11px;margin-bottom:12px}",
        "#balanceLabOverlay .bl-city-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}",
        "#balanceLabOverlay .bl-city-hd input.nm{flex:1;font-weight:bold;color:var(--accent);background:#1c160f;border:1px solid var(--panel-edge);border-radius:5px;padding:4px 7px}",
        "#balanceLabOverlay .bl-city-hd .bl-cap{font-size:10.5px;opacity:.6;white-space:nowrap}",
        "#balanceLabOverlay .bl-brow{display:flex;align-items:center;gap:7px;margin:3px 0;padding:3px 6px;background:#1c160f;border:1px solid var(--panel-edge);border-radius:6px}",
        "#balanceLabOverlay .bl-brow .bn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
        "#balanceLabOverlay .bl-brow .bl-idle{color:#e0a860;font-size:10.5px;white-space:nowrap}",
        "#balanceLabOverlay .bl-brow .stp{background:#2c2418;border:1px solid var(--panel-edge);color:var(--paper);width:20px;height:20px;border-radius:5px;cursor:pointer;font-size:13px;line-height:1;padding:0}",
        "#balanceLabOverlay .bl-brow .stp:hover{border-color:var(--accent);color:var(--accent)}",
        "#balanceLabOverlay .bl-brow .cnt{min-width:20px;text-align:center;font-variant-numeric:tabular-nums;font-weight:bold}",
        "#balanceLabOverlay select,#balanceLabOverlay input[type=number]{background:#1c160f;color:var(--paper);border:1px solid var(--panel-edge);border-radius:5px;padding:3px 5px;font-family:inherit;font-size:12px}",
        "#balanceLabOverlay input[type=number]{width:52px}",
        "#balanceLabOverlay button.bl-btn{background:#3a2e1d;color:var(--paper);border:1px solid var(--panel-edge);border-radius:5px;padding:4px 9px;font-family:inherit;font-size:12px;cursor:pointer}",
        "#balanceLabOverlay button.bl-btn:hover{border-color:var(--accent);color:var(--accent)}",
        "#balanceLabOverlay button.bl-x{background:transparent;border:0;color:#c86;cursor:pointer;font-size:14px;padding:0 4px}",
        "#balanceLabOverlay .bl-run{background:var(--accent);color:#201607;border-color:#e0a860;font-weight:bold}",
        // per-card add tabs (Houses / Gatherers / Production) + add chips
        "#balanceLabOverlay .bl-cardtabs{display:flex;gap:4px;margin:9px 0 6px;border-bottom:1px solid var(--panel-edge)}",
        "#balanceLabOverlay .bl-ct{background:transparent;border:0;border-bottom:2px solid transparent;color:var(--paper);opacity:.55;padding:4px 8px;cursor:pointer;font-family:inherit;font-size:11.5px}",
        "#balanceLabOverlay .bl-ct.active{opacity:1;color:var(--accent);border-bottom-color:var(--accent);font-weight:bold}",
        "#balanceLabOverlay .bl-chips{display:flex;flex-wrap:wrap;gap:5px}",
        "#balanceLabOverlay .bl-chip{background:#26201400;background:#26201a;border:1px solid var(--panel-edge);border-radius:14px;color:var(--paper);padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11.5px;white-space:nowrap}",
        "#balanceLabOverlay .bl-chip:hover{border-color:var(--accent);color:var(--accent)}",
        "#balanceLabOverlay .bl-chip .req{opacity:.5;font-size:10px}",
        // resource panel rows (right side)
        "#balanceLabOverlay .bl-res{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--panel-edge)}",
        "#balanceLabOverlay .bl-res-nm{font-weight:bold;color:var(--paper)}",
        "#balanceLabOverlay .bl-res-net{font-variant-numeric:tabular-nums;font-weight:bold;text-align:right;white-space:nowrap}",
        "#balanceLabOverlay .bl-res-lv{grid-column:1 / -1;font-size:10.5px;opacity:.65;display:flex;flex-wrap:wrap;gap:6px}",
        "#balanceLabOverlay .bl-res-lv .none{color:#e0a860;opacity:.9}",
        "#balanceLabOverlay .green{color:#7fc45f}#balanceLabOverlay .red{color:#e08a6a}",
        // charts tab
        "#balanceLabOverlay .bl-good{display:grid;grid-template-columns:88px 1fr 128px;gap:8px;align-items:center;margin:3px 0}",
        "#balanceLabOverlay .bl-good .lbl{text-align:right;opacity:.85;font-variant-numeric:tabular-nums}",
        "#balanceLabOverlay .bl-bar{position:relative;height:16px;background:#150f09;border:1px solid var(--panel-edge);border-radius:4px;overflow:hidden}",
        "#balanceLabOverlay .bl-bar .p{position:absolute;left:0;top:0;bottom:50%;background:#6ea84f}",
        "#balanceLabOverlay .bl-bar .c{position:absolute;left:0;top:50%;bottom:0;background:#b06b4f}",
        "#balanceLabOverlay .bl-num{font-variant-numeric:tabular-nums;font-size:11px;text-align:right}",
        "#balanceLabOverlay table.bl-tbl{width:100%;border-collapse:collapse;font-size:12px}",
        "#balanceLabOverlay table.bl-tbl th,#balanceLabOverlay table.bl-tbl td{padding:4px 6px;border-bottom:1px solid var(--panel-edge);text-align:right;font-variant-numeric:tabular-nums}",
        "#balanceLabOverlay table.bl-tbl th:first-child,#balanceLabOverlay table.bl-tbl td:first-child{text-align:left}",
        "#balanceLabOverlay .bl-verdict{padding:10px 12px;border-radius:8px;margin:8px 0;font-weight:bold}",
        "#balanceLabOverlay .bl-verdict.ok{background:#20301a;border:1px solid #6ea84f;color:#a8dd88}",
        "#balanceLabOverlay .bl-verdict.bad{background:#331d17;border:1px solid #b06b4f;color:#e6a488}",
        "#balanceLabOverlay .bl-note{font-size:11px;opacity:.6;margin:6px 0}",
        "#balanceLabOverlay ul.bl-list{margin:4px 0;padding-left:18px;font-size:11.5px}",
        "#balanceLabOverlay .bl-add{display:flex;gap:6px;margin-top:8px}",
        "#balanceLabOverlay details.bl-ratios{background:var(--panel);border:1px solid var(--panel-edge);border-radius:9px;padding:8px 12px;margin:6px 0 14px}",
        "#balanceLabOverlay details.bl-ratios summary{cursor:pointer;color:var(--accent);font-size:12.5px;font-weight:bold;list-style:none}",
        "#balanceLabOverlay details.bl-ratios summary::-webkit-details-marker{display:none}",
        "#balanceLabOverlay .bl-rt-good{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:9px 0 2px;padding-top:6px;border-top:1px solid var(--panel-edge)}",
        "#balanceLabOverlay .bl-rt-mk{font-weight:bold;color:var(--paper)}",
        "#balanceLabOverlay .bl-rt-out{font-size:11.5px;color:#7fc45f;font-variant-numeric:tabular-nums;white-space:nowrap}",
        "#balanceLabOverlay ul.bl-rt-list{margin:2px 0 4px;padding-left:14px;list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px}",
        "#balanceLabOverlay ul.bl-rt-list li{font-size:11.5px;display:flex;gap:5px;align-items:baseline}",
        "#balanceLabOverlay .bl-rt-n{color:var(--accent);font-weight:bold;font-variant-numeric:tabular-nums}",
        "#balanceLabOverlay .bl-rt-each{opacity:.5;font-size:10.5px;font-variant-numeric:tabular-nums}",
        // --- compact editor extras: city level, slots, per-building flows, tier labels, pause ---
        "#balanceLabOverlay .bl-city{padding:9px 10px}",
        "#balanceLabOverlay .bl-city-hd{margin-bottom:4px}",
        "#balanceLabOverlay select.bl-lvl{font-size:11px;padding:2px 4px;font-weight:bold;color:var(--accent)}",
        "#balanceLabOverlay .bl-city-sub{display:flex;gap:10px;align-items:baseline;margin-bottom:7px;font-size:10.5px}",
        "#balanceLabOverlay .bl-slots{font-variant-numeric:tabular-nums;color:var(--paper);opacity:.8}",
        "#balanceLabOverlay .bl-slots.over{color:#e08a6a;opacity:1;font-weight:bold}",
        "#balanceLabOverlay .bl-cap{opacity:.6}",
        "#balanceLabOverlay .bl-brow{margin:3px 0 0}",
        "#balanceLabOverlay .bl-brow.paused{opacity:.55}",
        "#balanceLabOverlay .bl-brow .stp.on{background:#3a2e1d;border-color:var(--accent);color:var(--accent)}",
        "#balanceLabOverlay .bl-idle.paused{color:#9aa0a6}",
        "#balanceLabOverlay .bl-flows{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:10px;font-variant-numeric:tabular-nums;margin:1px 0 2px 26px;opacity:.9}",
        "#balanceLabOverlay .bl-flows.off{opacity:.35;filter:grayscale(1)}",
        "#balanceLabOverlay .bl-tierlbl{font-size:9px;text-transform:uppercase;letter-spacing:.5px;opacity:.45;margin:6px 0 2px}",
        "#balanceLabOverlay .bl-chipwrap{margin-top:2px}",
        "#balanceLabOverlay .bl-chips{margin-bottom:2px}",
        "#balanceLabOverlay .bl-chip{padding:2px 8px;font-size:11px}",
        "#balanceLabOverlay .bl-chip:disabled{opacity:.3;cursor:not-allowed;border-color:var(--panel-edge);color:var(--paper)}",
        "#balanceLabOverlay .bl-cardtabs{margin:7px 0 4px}",
        "#balanceLabOverlay .stp:disabled{opacity:.3;cursor:not-allowed}",
      ].join("\n");
      document.head.appendChild(styleEl);
    }

    // ---------- building catalog, grouped by kind (Houses / Gatherers / Production)
    const CAT_TABS = [
      { key: "houses", label: "🏠 Houses" },
      { key: "gatherers", label: "⛏ Gatherers" },
      { key: "production", label: "🏭 Production" },
    ];
    // Buildings are ordered by the tier that lives/works in them (peasant →
    // worker → burgher → aristocrat) and grouped under that label, so Houses
    // read Hut → Cottage → Manor → Aristocrat Home, and workplaces cluster by
    // who staffs them. Within a tier we keep the authored CONFIG order.
    const TIER_ORDER = { peasant: 0, worker: 1, burgher: 2, aristocrat: 3 };
    function entryTier(def) { return def.houseTier || def.workerTier || ""; }
    function tierRank(def) { const t = entryTier(def); return TIER_ORDER[t] != null ? TIER_ORDER[t] : 9; }
    function tierLabel(t) { return ({ peasant: "Peasant", worker: "Worker", burgher: "Burgher", aristocrat: "Aristocrat" })[t] || "Other"; }
    function catalog() {
      const c = { houses: [], gatherers: [], production: [] };
      for (const id in CONFIG.buildings) {           // CONFIG insertion order = authored progression
        const def = CONFIG.buildings[id], e = { id: id, def: def };
        if (def.kind === "house") c.houses.push(e);
        else if (def.kind === "extractor") c.gatherers.push(e);
        else if (def.kind === "processor") c.production.push(e);
      }
      const byTier = (a, b) => tierRank(a.def) - tierRank(b.def);   // stable sort keeps config order within a tier
      c.houses.sort(byTier); c.gatherers.sort(byTier); c.production.sort(byTier);
      return c;
    }
    function tierWord(def) {
      return ({ peasant: "peasants", worker: "workers", burgher: "burghers", aristocrat: "aristocrats" })[def.workerTier] || def.workerTier || "workers";
    }
    // Per-ONE-building flows at a given level & full staffing, /min. Workplaces:
    // +output, −inputs. Houses: −basics its residents eat (houseCapacity × need).
    // Returns [{ good, perMin, sign }] (sign +1 produce, −1 consume).
    function buildingFlows(typeId, level) {
      const def = CONFIG.buildings[typeId]; if (!def) return [];
      const out = [];
      if (def.kind === "house" && def.houseTier) {
        const cap = def.houseCapacity || 0;
        const spec = CONFIG.needs.tiers[WORKER_TIER_OF_POP[def.houseTier]];
        if (spec) for (const g in spec.perCapita) out.push({ good: g, perMin: spec.perCapita[g] * cap * TICKS_PER_MIN, sign: -1 });
        return out;
      }
      if (def.workerTier && def.workerSlots > 0) {
        const eff = Buildings.upgradeEffect({ typeId: typeId, upgradeLevel: level || 1 });
        const w = def.workerSlots + (eff.slotPlus || 0);
        if (def.output) out.push({ good: def.output.goodId, perMin: def.output.ratePerWorker * w * (eff.outputMult || 1) * TICKS_PER_MIN, sign: 1 });
        if (def.inputs) for (const g in def.inputs) out.push({ good: g, perMin: def.inputs[g] * w * TICKS_PER_MIN, sign: -1 });
      }
      return out;
    }
    function chipTitle(d) {
      if (d.kind === "house") return (d.name || d.id) + " — adds housing (" + (d.houseTier || "residents") + ")";
      const inp = d.inputs ? "needs " + Object.keys(d.inputs).map(g => d.inputs[g] + "× " + g).join(", ") + "; " : "";
      const out = d.output ? "makes " + d.output.goodId : "";
      return (d.name || d.id) + " — " + inp + out + " · staffed by " + tierWord(d);
    }
    // Slots used (each building instance = 1 slot) and the cap for a city's level.
    function slotsUsed(city) { return (city.buildings || []).reduce((s, b) => s + (b.count || 0), 0); }
    function slotCapOf(city) { return Buildings.slotCap(Math.max(1, Math.min(4, city.level || 1))); }
    // Add one building of typeId to a city (bump an existing L1 row, else new row).
    // Respects the city-level slot cap, like the real game. Returns false if full.
    function addBuilding(city, typeId) {
      city.buildings = city.buildings || [];
      if (slotsUsed(city) >= slotCapOf(city)) return false;   // no free slots at this level
      const row = city.buildings.find(b => b.typeId === typeId && (b.level || 1) === 1);
      if (row) row.count = (row.count || 0) + 1;
      else city.buildings.push({ typeId: typeId, count: 1, level: 1 });
      return true;
    }

    // ---------- CITIES tab: the card editor ----------
    function renderCities(host) {
      host.innerHTML = "";
      host.appendChild(el("div", { class: "bl-note", text: "Build each city with the Houses / Gatherers / Production buttons. Workplaces only run if the city has people to staff them — watch for ⚠ idle." }));
      const cat = catalog();
      const grid = el("div", { class: "bl-grid" });
      scn.cities.forEach((city, ci) => grid.appendChild(renderCityCard(city, ci, cat)));
      host.appendChild(grid);
      const addCity = el("button", { class: "bl-btn", text: "＋ Add city", onclick: () => {
        const id = (scn.cities.reduce((m, c) => Math.max(m, +c.id || 0), 0) || 0) + 1;
        scn.cities.push({ id: id, name: "City #" + id, pop: null, buildings: [] });
        refresh();
      } });
      host.appendChild(el("div", { class: "bl-add" }, [addCity]));
    }

    function renderCityCard(city, ci, cat) {
      const detail = analyzeCity(city);          // real staffing => `used` + capacity
      const staffed = {};                        // "typeId@level" -> staffed count
      for (const u of detail.used) { const k = u.typeId + "@" + u.level; staffed[k] = (staffed[k] || 0) + 1; }
      const cap = detail.cap;

      const card = el("div", { class: "bl-city" });
      const nm = el("input", { class: "nm", value: city.name || ("City #" + city.id) });
      nm.addEventListener("input", () => { city.name = nm.value; refreshSide(); });
      const capTxt = TIER_KEYS.filter(k => (cap[k] || 0) > 0).map(k => Math.round(cap[k]) + " " + k.slice(0, 3)).join(" · ") || "no housing";
      const lvl = Math.max(1, Math.min(4, city.level || 1));
      const slotCap = Buildings.slotCap(lvl);
      const usedSlots = (city.buildings || []).reduce((s, b) => s + (b.count || 0), 0);
      const full = usedSlots >= slotCap;

      const lvlSel = el("select", { class: "bl-lvl", title: "city level (caps building slots)" });
      for (let L = 1; L <= 4; L++) lvlSel.appendChild(el("option", { value: String(L), text: "City L" + L, selected: L === lvl ? "selected" : null }));
      lvlSel.value = String(lvl);
      lvlSel.addEventListener("change", () => { city.level = +lvlSel.value; refresh(); });
      const del = el("button", { class: "bl-x", text: "🗑", title: "remove city", onclick: () => { scn.cities.splice(ci, 1); refresh(); } });
      card.appendChild(el("div", { class: "bl-city-hd" }, [nm, lvlSel, del]));
      card.appendChild(el("div", { class: "bl-city-sub" }, [
        el("span", { class: "bl-slots" + (usedSlots > slotCap ? " over" : ""), title: "buildings used / slots at this city level", text: "🏗 " + usedSlots + "/" + slotCap }),
        el("span", { class: "bl-cap", text: "👥 " + capTxt }),
      ]));

      // current buildings -- name (+level), idle warning, count stepper
      if (!(city.buildings || []).length) card.appendChild(el("div", { class: "bl-note", text: "Empty -- add buildings below." }));
      (city.buildings || []).forEach((b, bi) => {
        const def = CONFIG.buildings[b.typeId] || {};
        const mx = maxLevelFor(b.typeId);
        const row = el("div", { class: "bl-brow" + (b.paused ? " paused" : "") });
        // pause toggle (⏸ running → ▶ paused). Paused: no production; a paused house empties.
        row.appendChild(el("button", { class: "stp" + (b.paused ? " on" : ""), text: b.paused ? "▶" : "⏸",
          title: b.paused ? "resume" : "pause (stop producing / empty the house)", onclick: () => { b.paused = !b.paused; refresh(); } }));
        row.appendChild(el("span", { class: "bn", text: (def.name || b.typeId) + (mx > 1 ? " L" + (b.level || 1) : "") }));

        if (b.paused) {
          row.appendChild(el("span", { class: "bl-idle paused", text: "⏸ paused" }));
        } else if (def.output && def.workerSlots > 0) {   // idle if placed > staffed
          const st = staffed[b.typeId + "@" + (b.level || 1)] || 0;
          if (st < b.count) row.appendChild(el("span", { class: "bl-idle", text: "⚠ " + (b.count - st) + " idle · needs " + tierWord(def) }));
        }
        if (mx > 1) {
          const lvlSel = el("select", { title: "upgrade level" });
          for (let L = 1; L <= mx; L++) lvlSel.appendChild(el("option", { value: String(L), text: "L" + L, selected: L === (b.level || 1) ? "selected" : null }));
          lvlSel.value = String(b.level || 1);
          lvlSel.addEventListener("change", () => { b.level = +lvlSel.value; refresh(); });
          row.appendChild(lvlSel);
        }
        // count stepper — floors at 0 (kept so you can see an empty building), never auto-removes.
        // + is blocked when the city is out of slots for its level.
        row.appendChild(el("button", { class: "stp", text: "−", title: "one fewer (0 = empty, kept)", onclick: () => { b.count = Math.max(0, (b.count || 0) - 1); refresh(); } }));
        row.appendChild(el("span", { class: "cnt", text: String(b.count) }));
        const incBtn = el("button", { class: "stp", text: "+", title: full ? "city is full — raise its level" : "one more", onclick: () => { if (slotsUsed(city) < slotCapOf(city)) { b.count = (b.count || 0) + 1; refresh(); } } });
        if (full) incBtn.disabled = true;
        row.appendChild(incBtn);
        // explicit remove
        row.appendChild(el("button", { class: "bl-x", text: "✕", title: "remove this building", onclick: () => { city.buildings.splice(bi, 1); refresh(); } }));
        card.appendChild(row);

        // per-building produce/consume line (e.g. Sawmill: wood −480 · planks +240)
        const flows = buildingFlows(b.typeId, b.level || 1);
        if (flows.length) {
          const fl = el("div", { class: "bl-flows" + (b.paused || b.count <= 0 ? " off" : "") });
          for (const f of flows) fl.appendChild(el("span", { class: f.sign > 0 ? "green" : "red",
            text: goodName(f.good) + " " + (f.sign > 0 ? "+" : "−") + fmt(f.perMin) }));
          card.appendChild(fl);
        }
      });

      // add-tabs: Houses / Gatherers / Production
      const active = city._addTab || "houses";
      const tabRow = el("div", { class: "bl-cardtabs" });
      for (const t of CAT_TABS) tabRow.appendChild(el("button", { class: "bl-ct" + (t.key === active ? " active" : ""), text: t.label,
        onclick: () => { city._addTab = t.key; refresh(); } }));
      card.appendChild(tabRow);

      // add-chips grouped by worker tier (Peasant → Worker → Burgher → Aristocrat)
      const wrap = el("div", { class: "bl-chipwrap" });
      let lastTier = null, chips = null;
      for (const e of cat[active]) {
        const d = e.def, t = entryTier(d);
        if (t !== lastTier) {
          lastTier = t;
          wrap.appendChild(el("div", { class: "bl-tierlbl", text: tierLabel(t) }));
          chips = el("div", { class: "bl-chips" });
          wrap.appendChild(chips);
        }
        const chip = el("button", { class: "bl-chip", title: full ? "city is full — raise its level to build more" : chipTitle(d), onclick: () => { if (addBuilding(city, e.id)) refresh(); } });
        chip.appendChild(el("span", { text: "＋ " + (d.name || e.id) }));
        if (full) chip.disabled = true;
        chips.appendChild(chip);
      }
      if (full) card.appendChild(el("div", { class: "bl-note", text: "🏗 City is full (" + usedSlots + "/" + slotCap + " slots) — raise the city level to build more." }));
      card.appendChild(wrap);
      return card;
    }

    // ---------- right RESOURCE panel (persistent) ----------
    let sideHost = null;
    function refreshSide() {
      if (!sideHost) return;
      const res = analyze(scn);
      sideHost.innerHTML = "";
      sideHost.appendChild(el("h3", { text: "📦 Resources" }));
      sideHost.appendChild(el("div", { class: "bl-note", text: "Net /min across all cities. Buildings listed are the ones actually staffed." }));
      const goods = Object.keys(res.perGood).filter(g => (res.perGood[g].prod > 1e-6 || res.perGood[g].cons > 1e-6));
      goods.sort((a, b) => (res.perGood[b].prod - res.perGood[b].cons) - (res.perGood[a].prod - res.perGood[a].cons));
      if (!goods.length) { sideHost.appendChild(el("div", { class: "bl-note", text: "Add buildings & population to see resources." })); return; }
      for (const g of goods) {
        const pg = res.perGood[g];
        const net = pg.prod - pg.cons;
        const row = el("div", { class: "bl-res" });
        row.appendChild(el("span", { class: "bl-res-nm", text: goodName(g) }));
        row.appendChild(el("span", { class: "bl-res-net " + (net >= -1e-6 ? "green" : "red"), text: (net >= 0 ? "+" : "") + fmt(net) + "/min" }));
        const lv = el("span", { class: "bl-res-lv" });
        const levels = Object.keys(pg.byLevel || {}).map(Number).sort((a, b) => a - b);
        if (levels.length) {
          lv.appendChild(el("span", { text: (pg.producer || "producer") + ":" }));
          for (const L of levels) lv.appendChild(el("span", { text: pg.byLevel[L] + "×L" + L }));
        } else {
          lv.appendChild(el("span", { class: "none", text: "no producer -- imported" }));
        }
        row.appendChild(lv);
        row.title = "produces " + fmt(pg.prod) + " - consumes " + fmt(pg.cons) + "/min";
        sideHost.appendChild(row);
      }
    }
    // ---------- carrying-capacity / support-ratio panel ----------
    // Scenario-independent reference: "1 producer feeds N consumers" across the
    // whole kingdom (cities specialise + trade). Reads ratios() straight from
    // CONFIG so it's the same no matter what the composer holds.
    function renderRatios(host) {
      const rows = ratios();
      const det = el("details", { class: "bl-ratios" });
      det.open = false;
      const sum = el("summary", { text: "📐 Carrying capacity — 1 producer supports… (tap to expand)" });
      det.appendChild(sum);
      det.appendChild(el("div", { class: "bl-note", text: "Kingdom-wide, at base level & full staffing. Cities specialise and trade, so this is what ONE building feeds no matter where it sits." }));
      for (const r of rows) {
        const prod = r.producers[0];
        const head = el("div", { class: "bl-rt-good" }, [
          el("span", { class: "bl-rt-mk", text: "1 " + prod.name }),
          el("span", { class: "bl-rt-out", text: "→ " + fmt(prod.perMin) + " " + goodName(r.good) + "/min" }),
        ]);
        det.appendChild(head);
        const ul = el("ul", { class: "bl-rt-list" });
        for (const c of r.consumers) {
          const n = c.supportedPerProducer;
          const nTxt = n >= 100 ? fmt(Math.round(n)) : fmt(Math.round(n * 10) / 10);
          const label = c.kind === "people" ? c.name : (c.name + "s");
          ul.appendChild(el("li", {}, [
            el("span", { class: "bl-rt-n", text: nTxt + "×" }),
            el("span", { class: "bl-rt-c", text: label }),
            el("span", { class: "bl-rt-each", text: "(" + fmt(c.eachPerMin) + "/min each)" }),
          ]));
        }
        det.appendChild(ul);
      }
      host.appendChild(det);
    }

    // ---------- CHARTS tab (bars + per-city gold + carrying capacity + sim) ----------
    function renderCharts(host) {
      const res = analyze(scn);
      host.innerHTML = "";
      host.appendChild(el("h3", { text: "Production vs consumption" }));
      host.appendChild(el("div", { class: "bl-note", text: "Per minute, kingdom-wide. Green bar = production, red = consumption; number = net." }));
      const goods = Object.keys(res.perGood).filter(g => (res.perGood[g].prod > 1e-6 || res.perGood[g].cons > 1e-6));
      goods.sort((a, b) => (res.perGood[b].prod + res.perGood[b].cons) - (res.perGood[a].prod + res.perGood[a].cons));
      let scaleMax = 1;
      for (const g of goods) scaleMax = Math.max(scaleMax, res.perGood[g].prod, res.perGood[g].cons);
      if (!goods.length) host.appendChild(el("div", { class: "bl-note", text: "No production or consumption yet -- add buildings and population." }));
      for (const g of goods) {
        const pg = res.perGood[g];
        const surplus = pg.prod - pg.cons;
        const bar = el("div", { class: "bl-bar" });
        const p = el("div", { class: "p" }); p.style.width = (100 * pg.prod / scaleMax) + "%";
        const c = el("div", { class: "c" }); c.style.width = (100 * pg.cons / scaleMax) + "%";
        bar.appendChild(p); bar.appendChild(c);
        const num = el("div", { class: "bl-num " + (surplus >= -1e-6 ? "green" : "red"), text: (surplus >= 0 ? "+" : "") + fmt(surplus) });
        num.title = "prod " + fmt(pg.prod) + " - cons " + fmt(pg.cons);
        host.appendChild(el("div", { class: "bl-good" }, [el("div", { class: "lbl", text: goodName(g) }), bar, num]));
      }

      host.appendChild(el("h4", { text: "Per city -- house income vs import cost (/min gold)" }));
      const tbl = el("table", { class: "bl-tbl" });
      tbl.appendChild(el("tr", {}, [el("th", { text: "City" }), el("th", { text: "Income" }), el("th", { text: "Import cost" }), el("th", { text: "Net" })]));
      for (const c of res.perCity) {
        tbl.appendChild(el("tr", {}, [
          el("td", { text: c.name }),
          el("td", { text: fmt(c.income) }),
          el("td", { text: fmt(c.deficitCost) }),
          el("td", { class: c.net >= -1e-6 ? "green" : "red", text: (c.net >= 0 ? "+" : "") + fmt(c.net) }),
        ]));
      }
      host.appendChild(tbl);

      renderRatios(host);

      const runWrap = el("div", {});
      runWrap.appendChild(el("h4", { text: "Ground-truth simulation" }));
      const ticksInp = el("input", { type: "number", min: "100", step: "500", value: "3000", title: "ticks" });
      const runBtn = el("button", { class: "bl-btn bl-run", text: "▶ Run sim" });
      const out = el("div", {});
      runBtn.addEventListener("click", () => {
        runBtn.disabled = true; runBtn.textContent = "running...";
        out.innerHTML = "";
        setTimeout(() => {
          let r;
          try { r = simulate(scn, +ticksInp.value || 3000); }
          catch (e) { out.appendChild(el("div", { class: "bl-verdict bad", text: "Sim error: " + (e && e.message || e) })); runBtn.disabled = false; runBtn.textContent = "▶ Run sim"; return; }
          renderSimResult(out, r);
          runBtn.disabled = false; runBtn.textContent = "▶ Run sim";
        }, 20);
      });
      runWrap.appendChild(el("div", { class: "bl-add" }, [el("span", { class: "bl-note", text: "Ticks:" }), ticksInp, runBtn]));
      runWrap.appendChild(out);
      host.appendChild(runWrap);
    }
    function renderSimResult(out, r) {
      out.innerHTML = "";
      const v = r.verdict;
      out.appendChild(el("div", { class: "bl-verdict " + (v.selfSustained ? "ok" : "bad"),
        text: (v.selfSustained ? "✓ SELF-SUSTAINED" : "✗ NOT self-sustained") + "  (" + r.ticks + " ticks ≈ " + fmt(r.minutes) + " min)" }));
      if (v.reasons.length) { const ul = el("ul", { class: "bl-list" }); for (const s of v.reasons) ul.appendChild(el("li", { text: s })); out.appendChild(ul); }
      if (v.warnings.length) { out.appendChild(el("div", { class: "bl-note", text: "Warnings:" })); const ul = el("ul", { class: "bl-list" }); for (const s of v.warnings) ul.appendChild(el("li", { text: s })); out.appendChild(ul); }

      const tbl = el("table", { class: "bl-tbl" });
      tbl.appendChild(el("tr", {}, [el("th", { text: "City" }), el("th", { text: "Happy" }),
        el("th", { text: "Tier happiness (pea/wrk/bur/ari)" }), el("th", { text: "Net gold/min" })]));
      for (const c of r.cities) {
        const th = TIER_KEYS.map(k => c.present[k] ? (c.tierHappiness[k] == null ? "–" : Math.round(c.tierHappiness[k])) : "·").join(" / ");
        tbl.appendChild(el("tr", {}, [
          el("td", { text: c.name }),
          el("td", { text: Math.round(c.happiness) + "%" }),
          el("td", { text: th }),
          el("td", { class: c.netGoldPerMin >= -1e-6 ? "green" : "red", text: (c.netGoldPerMin >= 0 ? "+" : "") + fmt(c.netGoldPerMin) }),
        ]));
      }
      out.appendChild(tbl);

      // good trends (only goods that were present)
      const gg = Object.keys(r.goods).filter(g => r.goods[g].max > 0.5);
      gg.sort((a, b) => r.goods[b].end - r.goods[a].end);
      if (gg.length) {
        out.appendChild(el("h4", { text: "Per-good kingdom stock (end / trend)" }));
        const gt = el("table", { class: "bl-tbl" });
        gt.appendChild(el("tr", {}, [el("th", { text: "Good" }), el("th", { text: "End" }), el("th", { text: "Trend" })]));
        for (const g of gg) {
          const t = r.goods[g].trend;
          gt.appendChild(el("tr", {}, [el("td", { text: g }), el("td", { text: fmt(r.goods[g].end) }),
            el("td", { class: t >= -0.5 ? "green" : "red", text: (t >= 0 ? "▲ +" : "▼ ") + fmt(t) })]));
        }
        out.appendChild(gt);
      }
    }

    // ---------- tabs + top-level render ----------
    let mainHost = null, activeTab = "cities";
    const MAIN_TABS = [ { key: "cities", label: "🏙 Cities" }, { key: "charts", label: "📈 Charts & sim" } ];

    function renderMain() {
      if (!mainHost) return;
      if (activeTab === "charts") renderCharts(mainHost);
      else renderCities(mainHost);
      if (overlay) overlay.querySelectorAll(".bl-tab").forEach(btn => btn.classList.toggle("active", btn.getAttribute("data-tab") === activeTab));
    }
    // Re-render the active tab AND the persistent resource panel on every edit.
    function refresh() { renderMain(); refreshSide(); }

    function isOpen() { return !!(overlay && !overlay.classList.contains("hidden")); }
    function close() { if (overlay) overlay.classList.add("hidden"); }
    function open() {
      injectStyle();
      if (!scn) scn = defaultScenario();
      if (!overlay) {
        overlay = el("div", { id: "balanceLabOverlay", class: "hidden" });
        const bar = el("div", { id: "blBar" }, [el("span", { text: "🧪 Balance Lab" })]);
        const tabs = el("div", { class: "bl-tabs" });
        for (const t of MAIN_TABS) tabs.appendChild(el("button", { class: "bl-tab", "data-tab": t.key, text: t.label, onclick: () => { activeTab = t.key; renderMain(); } }));
        bar.appendChild(tabs);
        const resetBtn = el("button", { class: "bl-btn", text: "↺ Reset", onclick: () => { scn = defaultScenario(); refresh(); } });
        const closeBtn = el("button", { id: "blClose", type: "button", text: "✕ Close", onclick: close });
        const right = el("div", {}, [resetBtn, closeBtn]);
        right.style.display = "flex"; right.style.gap = "8px"; right.style.alignItems = "center"; right.style.marginLeft = "auto";
        bar.appendChild(right);
        const body = el("div", { id: "blBody" });
        mainHost = el("div", { class: "bl-main" });
        sideHost = el("div", { class: "bl-side" });
        body.appendChild(mainHost); body.appendChild(sideHost);
        overlay.appendChild(bar); overlay.appendChild(body);
        document.body.appendChild(overlay);
        document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) close(); });
      }
      refresh();
      overlay.classList.remove("hidden");
    }

    return { open: open, close: close, isOpen: isOpen, analyze: analyze, simulate: simulate, ratios: ratios };
    return { open: open, close: close, isOpen: isOpen, analyze: analyze, simulate: simulate, ratios: ratios };
  })();
  if (typeof window !== "undefined") window.BalanceLab = BalanceLab;
  if (typeof globalThis !== "undefined") { try { globalThis.BalanceLab = BalanceLab; } catch (e) {} }
  // === BALANCE-LAB END ===
