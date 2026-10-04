# EconDev — Phase 1 Proposal (Balance & Post-Victory Pass)

**Role:** EconDev (Opus). **Owns:** `src/sim.js`, `src/buildings.js`, `src/research.js`,
`src/research-economy.js`, `src/progress.js`. **Does NOT edit** `src/config.js` / `src/goods.js`
(Balance) — price/cost changes there are filed as REQUESTS below.
**Phase 1 = diagnosis, read-only on source.** Grounded on a 20 000-tick BAL2 run
(`TW_HTML=./index.html node tools/playthrough.js 20000`, seed=bal2, fertile, 3+1 cities).

---

## HEADLINE FINDING — the lead's lead-hypothesis is STALE

> "Upper tiers are growth-locked because a tier may only GROW when ALL its `extra[]`
> luxuries are available (`growthThreshold` in sim.js)."

**That gate no longer exists.** It was removed in a prior `CC→BAL2` pass. See
`src/sim.js:333-339`:

```
// === CC→BAL2: the per-tier LUXURY growth gate is GONE. It deadlocked the
// economy ... The author's model needs no gate — capacity already follows
// happiness (70% = full), and luxuries only lift happiness above 70 ...
```

Population now grows purely on happiness: `target = round(capacity × min(1, tierHappiness/70))`
(`src/sim.js:422-423`). The config constant `growthThreshold: 0.9999` (`src/sim.js:39`) is now
**dead/vestigial** — verified with a repo-wide grep, it is referenced nowhere in `src/`.
So removing a growth gate is NOT the fix. The real blockers are housing + supply (Item 1) and the
research material gate (Item 2).

---

## Item 1 — Why aristocrats never spawn / grow

### Verified root cause
For `pop.aristocrats > 0`, the Sim population loop (`src/sim.js:398-435`) requires **both**:

1. **`capacity.aristocrats > 0`** — i.e. a **BUILT** `aristocrat_home`. Capacity comes only from
   `Buildings.housingCapacity` (`src/buildings.js:45-63`), which sums `houseCapacity` of houses with
   `built !== false` and `houseTier === "aristocrat"`. `aristocrat_home` is the sole such house
   (`src/goods.js:308-313`, `houseCapacity: 1`).
2. **`tierHappiness.aristocrats > 0`** — an empty tier bootstraps its happiness from the
   fraction of its own basic/extra goods present on that town's shelf
   (`src/sim.js:416-421`, `availFrac`). Aristocrat basics = `lamp, mead, iron_armor, chairs,
   pottery`; extras = `brandy, luxury_clothes, gold_ring`.

**In the run neither holds** (report §a/§d): `unlock_aristocrat_home` never completes (research
44/51 — see Item 2), so no home is ever built → `capacity.aristocrats = 0` in all four cities
(report: `aris:0` housing everywhere). The only city that *plans* homes (City#4) is road-isolated,
stalls at L2 / 10 peasants, and is slot-capped (12/12) before it ever reaches the home entries — all
its advanced buildings stay `✗` scaffolds. Aristocrat onset = **NEVER**. Six of seven T3 goods
(`pottery, iron_armor, chairs, gold_ring, brandy, luxury_clothes`) show `total = 0.0` — dead content.

The Sim mechanic itself is CORRECT: `test/sim.test.js:737-739` already proves *"aristocrats grow from
aristocrat_home when all their needs are met."* The failure is entirely **upstream** (no built home +
no T3 supply), not in the `sim.js` population code.

### Secondary mechanic to flag (rounding × cap=1)
`aristocrat_home` is `houseCapacity: 1` and **non-upgradable** (author rule — `src/buildings.js:134`,
`src/research.js:90`). With `target = round(cap × capFrac)` and `cap = 1`, a **cold/empty** aristocrat
tier needs `capFrac ≥ 0.5` → `tierHappiness ≥ 35` → ~**3 of 5** aristocrat basics present in-town
*before the first aristocrat appears*. With **≥2 homes** (City#4 plans 3 ⇒ cap 3) the bar drops to
`capFrac ≥ 1/6` → ~1 basic. **Consequence:** the tier can only bootstrap where ≥2 homes exist AND
aristocrat basics (`lamp`, `mead`, …) are supplied by trade. This is real friction but not a hard
block — the plan's 3 homes are sufficient *if* City#4 develops.

### Proposed EconDev edits (Item 1)
- **No gate to remove** (already gone). The substantive fix is delivered through **Item 2** (make the
  home researchable) plus the cross-seam city-development fix QA owns.
- **Optional cleanup** (`src/sim.js:39`): delete the dead `growthThreshold: 0.9999` line (or annotate
  it `// vestigial — gate removed, see :333`) so future readers don't chase a non-existent gate.
  Determinism-safe (unreferenced). Low priority.

### Cross-seam (Item 1)
- **QA:** the home-hosting city must not be road-isolated and must *receive aristocrat basics by
  trade* (`lamp, mead, iron_armor, chairs, pottery`) before aristocrats bootstrap. This is the
  `player.js` `links[]` / city-plan issue QA already flagged. My files cannot force City#4 to develop.

---

## Item 2 — The aristocrat research gate (chicken-and-egg)

### Verified root cause
`unlock_aristocrat_home` materials = `{ bricks:30, chairs:10, gold_ring:5 }`
(`src/research-economy.js:124`). `chairs` (carpentry, burgher) and `gold_ring` (goldsmith, burgher)
are the very **T3 luxuries the tier is meant to CONSUME** — both are `0.0` kingdom-wide in the run.
Its prereq `unlock_luxury_tailor` = `{ clothes:15, gold_ring:5 }` (`src/research-economy.js:123`)
**also** gates on `gold_ring`. So the home and its prereq both hinge on the scarcest luxury and never
complete. (Note: the node's `cost: 1500` gold field is now **irrelevant** — research is
material-metered; `Research.canStart` dropped the gold gate, `src/research.js:196-203`. Only
`materials` gate.)

This is a genuine inversion: to research the *housing* for the tier that *produces demand* for T3
luxuries, you must already be producing those T3 luxuries.

### Proposed EconDev edits (`src/research-economy.js` — MINE, `RESEARCH_MATERIALS`)
| Node | before | after | rationale |
|---|---|---|---|
| `unlock_aristocrat_home` | `{ bricks:30, chairs:10, gold_ring:5 }` | **`{ bricks:30, planks:15 }`** | Home is the *vessel*; the NEW victory (100% aristocrat happiness) already forces the full T3 economy, so the home research need not pre-require T3. Worker-band mats (bricks, planks) are reachable once brickworks+sawmill run → the player can stand up a home, then work UP to 100%. |
| `unlock_luxury_tailor` | `{ clothes:15, gold_ring:5 }` | **`{ clothes:15, planks:10 }`** | Gating the *research* of the first finery unlock on `gold_ring` — which its own building then consumes as an INPUT (`src/goods.js:279`) — is circular. The building input is the correct forcing point; the research gate should be reachable from burgher basics. |

- **Alternative for `unlock_aristocrat_home`** (if Balance/QA want the research to still prove a
  burgher processor runs): `{ bricks:30, chairs:8 }` — drops only `gold_ring`, keeps `chairs` as a
  soft "carpentry works" gate. **Primary recommendation is the worker-band version** because `chairs`
  are also `0.0` in the run, so keeping them risks re-introducing the stall.
- **Leave `unlock_distillery` `{ pottery:10, planks:20 }` as-is.** `pottery` is a burgher *basic*
  (reachable once any manor-city staffs a pottery_workshop), not a deep luxury — let the burgher-city
  fix (QA/city-plan) carry it rather than re-tiering here. Flag only.

### REQUESTS to Balance (`src/goods.js` — not mine)
- **`aristocrat_home` BUILD cost** (`src/goods.js:312`) = `{ wood:40, stone:30, bricks:20, chairs:2,
  gold_ring:1, gold:400 }`. The `chairs:2` + `gold_ring:1` mean the home cannot finish
  **construction** until 1 gold_ring + 2 chairs are delivered — a *second* luxury gate on the vessel,
  in addition to the research gate I'm clearing. **REQUEST:** drop `gold_ring:1` (and ideally
  `chairs:2`) from the build cost, leaving a bricks-based cost, so the FIRST home can be constructed
  in a cold economy; the player then supplies luxuries to raise happiness to 100%. Once a goldsmith
  runs this is trivial, but it blocks the first home before the luxury loop closes.
- **Ownership split (agree explicitly):** *I* own whether `gold_ring` gates the home / luxury_tailor
  **research** (dropping it). *Balance* owns whether `gold_ring` gates the home **build cost**. Both
  must clear or the deadlock only half-lifts.

### Cross-seam (Item 2)
- **Balance:** the two build-cost lines above. Also, if Balance is separately cheapening luxury goods,
  coordinate so we don't double-discount — I'm only changing *which goods gate research*, not prices.
- **QA:** after the regrade, `unlock_luxury_tailor` / `unlock_aristocrat_home` / `unlock_distillery`
  should appear in the unlocked set and the seven T3 goods should show non-zero totals — that is the
  Item-2 measurement.

---

## Item 3 — The NEW victory condition (`src/progress.js` — MINE)

### Requirement
Victory fires iff some town has a **BUILT** `aristocrat_home` **AND** that town's
**aristocrat-tier happiness ≥ 99.5**; **castle L5 no longer flips `state.victory`** (L5 stays a
milestone). Deterministic, save/load-safe.

### How the data is stored (verified)
- `town.tierHappiness = { peasants, workers, burghers, aristocrats }`, each a number **or `null`**
  (`src/sim.js:367-384`). Crucially, `tierHappiness.aristocrats` is set to `null` whenever
  `pop.aristocrats <= 0` (`src/sim.js:372`) — so *requiring a numeric value ≥ 99.5 implicitly
  requires living aristocrats*; an empty home can never false-win.
- A built home = a `town.buildings[]` entry with `typeId === "aristocrat_home"` and `built !== false`
  (same predicate `housingCapacity` uses, `src/buildings.js:49-52`).
- `state.victory` is already a persisted boolean (`src/save.js:46,95,230`).

### Proposed edits

**(3a) Add the threshold constant** (in the existing `Object.assign(CONFIG, …)` block near
`src/progress.js:24`):
```js
Object.assign(CONFIG, { victory: { aristocratHappiness: 99.5 } });
```

**(3b) Add a pure detector** (new small object, e.g. right after the `Castle` block ~`src/progress.js:109`):
```js
var Victory = (typeof Victory !== "undefined" && Victory) || {};
// Fires when any town has a BUILT aristocrat_home whose aristocrat-tier happiness
// has reached ~100%. Pure (reads only state), deterministic (no RNG/time), and
// LATCHES on state.victory so it is save/load-safe (a loaded win stays won; a
// loaded near-win re-detects next tick). tierHappiness.aristocrats is null unless
// aristocrats actually live there, so an empty home cannot false-win.
Victory.check = function (state) {
  if (!state || state.victory) return state;                 // latch
  const need = (CONFIG.victory && CONFIG.victory.aristocratHappiness) || 99.5;
  for (const t of (state.towns || [])) {
    if (!t) continue;
    const th = t.tierHappiness && t.tierHappiness.aristocrats;
    if (typeof th !== "number" || th < need) continue;
    const homes = Array.isArray(t.buildings) ? t.buildings : [];
    if (homes.some(b => b && b.typeId === "aristocrat_home" && b.built !== false)) {
      state.victory = true;
      break;
    }
  }
  return state;
};
```

**(3c) Stop the castle-L5 flip** (`src/progress.js:100-109`, `Castle.upgrade`):
- DELETE line 107: `if (state.castleLevel >= CONFIG.castle.maxLevel) state.victory = true;`
- Change the return (line 108) to drop the `victory` field: `return { ok: true, level: state.castleLevel };`
- Update the doc comment at lines 98-99 (remove "Level 5 = victory" / "flips state.victory").
  Castle still levels to 5 (milestone/prestige sink) — only the win flip is removed.

**(3d) Wiring (1 line — SHELL, LEAD-owned).** `src/mainloop.js:64` is
`Research.tick(state); Quests.tick(state);` → append `Victory.check(state);` after `Quests.tick`.
*Alternative needing no shell edit:* call `Victory.check(state)` at the top of `Quests.tick`
(`src/progress.js:164`) — but that couples victory to the quest layer; I recommend the explicit
mainloop line.

### Why this is deterministic & save-safe
Reads only `state`; no `Math.random`/`Date`. `state.victory` is persisted, so the latch survives
save/load; a mid-game save that already satisfies the condition re-fires on the next tick after load.
No new persisted fields.

### Cross-seam (Item 3)
- **LEAD:** `src/carts-castle-ui.js:527` (`if (res.victory) showVictory();`) reads `Castle.upgrade`'s
  return — after my change `res.victory` is gone, so **castle L5 no longer pops the overlay**
  (correct). The overlay now fires via `src/progress-ui.js:98,102`, which already poll
  `state.victory` (now set by `Victory.check`). Lead owns updating the overlay COPY (per brief) and
  can drop the dead `res.victory` branch in `carts-castle-ui.js`.
- **QA/Test:** the victory characterization test (`test/progress.test.js`) must flip to the new rule
  — assert (a) reaching castle L5 does NOT set `state.victory`, and (b) a town with a built
  `aristocrat_home` + `tierHappiness.aristocrats ≥ 99.5` DOES. QA owns.

---

## Summary of my Phase-2 change surface (all within my files)
| File | Change |
|---|---|
| `src/research-economy.js` | Regrade `unlock_aristocrat_home` → `{ bricks:30, planks:15 }`; `unlock_luxury_tailor` → `{ clothes:15, planks:10 }`. |
| `src/progress.js` | Add `CONFIG.victory`; add `Victory.check`; remove castle-L5 victory flip + fix its return/comment. |
| `src/sim.js` | (optional) delete vestigial `growthThreshold` line. |
| — | **Requests to Balance:** drop `gold_ring:1` (± `chairs:2`) from `aristocrat_home` build cost (`goods.js:312`). **Wiring to Lead:** one line in `mainloop.js`; overlay copy + `carts-castle-ui.js` branch. **To QA:** update victory test; verify T3 goods non-zero & aristocrat onset finite. |
