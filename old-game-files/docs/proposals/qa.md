# QA / Verification — Phase 1 Proposal (Balance & Post-Victory Pass)

**Role:** QA/Verification. **Owns:** `tools/playthrough.js` (report extensions only),
`test/*.test.js` (characterization tests). **Does NOT edit** `src/*`.
**Phase 1 = diagnosis, read-only on source.** This doc is the measurement contract the
lead freezes before Phase 2.

Baseline measured on `main` at HEAD, seed=bal2, fertile map, 4 cities (player.js seeds a
4th road-isolated city), Research Center placed at setup.

---

## 1. Baseline "before" numbers (current castle-L5 victory)

Command: `TW_HTML=./index.html node tools/playthrough.js <ticks>`.
All 15 pure-core suites GREEN at baseline (editor excluded). Runs are **bit-deterministic**
(two 8000-tick runs produced byte-identical milestone/final lines).

### 1a. Milestones & victory (20 000-tick run; identical at 40 000)

| Metric | Value |
|---|---|
| **Victory (castle L5)** | **tick 9750** |
| Castle timeline | L1@1 · **L2@8500** · L3@8575 · L4@9125 · L5@9750 |
| First peasants pop≥1 / ≥70% | 111 / 216 |
| First workers pop≥1 / ≥70% | 2670 / 3017 |
| First burghers pop≥1 / ≥70% | 3946 / **8592** |
| **First aristocrats pop≥1 / ≥70%** | **NEVER / NEVER** (still NEVER at 40 000t) |
| Research unlocked | **44 / 51** (stalls; never reaches the aristocrat chain) |
| Final treasury / prestige | 35 619 / 477 (dead post-victory balloon) |

### 1b. Per-tier population & happiness at end (20 000t)

| City | Lvl | peas pop/th% | work pop/th% | burg pop/th% | **aris pop/th%** |
|---|---|---|---|---|---|
| #1 | L4 | 28.7 / 100 | 6.9 / 100 | 4.6 / **70** | 0 / — |
| #2 | L4 | 23.0 / 76 | 8.6 / 52 | 0 / — | 0 / — |
| #3 | L4 | 28.7 / 100 | 6.9 / 100 | 0 / — | 0 / — |
| #4 | L2 | 10.0 / 70 | 0 / — | 0 / — | 0 / — |

Burghers plateau at exactly **70%** (basics-only ceiling; their extra `gold_ring`
is never produced). City#4 is **road-isolated** (no link in `player.js` `links[]`) and
stalls at L2/peasants — all its advanced buildings stay `✗` scaffolds.

### 1c. T3-luxury production (kingdom totals over the whole run)

| Good | total | producer building | producer unlocked? |
|---|---|---|---|
| lamp | 84.3 | lamp_maker | yes (built in City#1/#3) |
| **pottery** | **0.0** | pottery_workshop | yes, but only in City#4's plan |
| **iron_armor** | **0.0** | armory | yes, City#4 only |
| **chairs** | **0.0** | carpentry | yes, City#4 only |
| **gold_ring** | **0.0** | goldsmith | yes, City#4 only |
| **brandy** | **0.0** | distillery | research NOT unlocked |
| **luxury_clothes** | **0.0** | luxury_tailor | research NOT unlocked |

Six of seven T3 luxuries are **dead content** (total 0 for the entire run; prices pinned
at the 3× scarcity ceiling). This is the problem the pass exists to fix.

### 1d. Research nodes NOT unlocked (7)

`unlock_luxury_tailor`, `unlock_distillery`, `unlock_aristocrat_home`, `industrialize`,
`trade_network`, `town_charters`, `bureaucracy`.

---

## 2. Why the greedy policy CANNOT reach the new victory unaided

**New victory** (`Castle`/`progress.js`): a town has a **built `aristocrat_home`** AND its
**`tierHappiness.aristocrats` ≥ ~99.5**. From `sim.js`:
`th = 70·bs + 30·es`, where `bs` = demand-weighted satisfaction of aristocrat basics
`[lamp, mead, iron_armor, chairs, pottery]` and `es` = of extras `[brandy, luxury_clothes,
gold_ring]`. Reaching 100 requires **all 8 T3 goods** available with `gsat=1` and `tempMod=0`.

The baseline is blocked by a **structural chicken-and-egg + a harness geography bug**:

1. **All T3-luxury producers live only in City#4's plan, and City#4 has no road**
   (`player.js` `links = [[0,1],[1,2],[1,3],[0,2],[2,3]]` — node 4 omitted; comment says
   connecting it "collapses the deterministic run"). City#4 can't trade → its manor / forge /
   goldsmith / carpentry / pottery / armory / distillery / luxury_tailor / aristocrat_home
   all remain `✗` unbuilt → **zero** chairs/pottery/gold_ring/iron_armor/brandy/luxury_clothes
   produced kingdom-wide.
2. **Research self-gates on producible materials.** `selectResearch()` skips any node whose
   `materials` include a good nothing currently produces. `unlock_luxury_tailor` needs
   `gold_ring:5`; `unlock_distillery` needs `pottery:10`; `unlock_aristocrat_home` needs
   `chairs:10, gold_ring:5`. Since those goods are never produced (block #1), these three
   nodes **never unlock** — and `luxury_tailor` is a prereq of `aristocrat_home`.
3. **`aristocrat_home`'s build cost is itself T3** — `chairs:2, gold_ring:1` (+wood/stone/
   bricks/400g). Even with the research done, it can't be built without T3 production.

**Verdict: NO — the greedy policy reaches the new victory in 0 configurations today.**
Aristocrats never spawn even at 40 000 ticks. Making it achievable needs BOTH an EconDev/
Balance economy rework (un-gate the luxury chains so T3 actually flows) AND the QA harness
changes below (road City#4 or relocate the aristocrat chain onto a connected city, extend the
research order/material-gate, add build plans). Exit criterion 2 cannot pass on source changes
alone if the harness never drives the AI to build/populate an aristocrat_home.

---

## 3. Harness-extension plan (`tools/playthrough.js` + `player.js`)

Ownership note: `player.js` is shared harness plumbing (map/roads/greedy policy). It is not in
any Phase-2 source-owner's list; **QA owns the harness**, so QA proposes and (Phase 2) makes
these changes. Flagged for the lead in case `player.js` must be treated as shared.

### 3a. NEW report fields (playthrough.js `report()` + `snapshot()`) — REQUIRED so the win is measurable

1. **New-victory detector & timeline.** Track first tick at which ANY town has a built
   `aristocrat_home` with `tierHappiness.aristocrats ≥ 99.5`. Print
   `NEW VICTORY (aristocrat_home @100%): tick N` (or `NOT REACHED`) alongside the legacy
   castle-L5 line. Also print `first aristocrat_home BUILT: city#X @tick`.
2. **Per-aristocrat-home line.** For each town, list each `aristocrat_home` building with
   `built ✓/✗` and the town's live `tierHappiness.aristocrats`, plus the per-basic/per-extra
   satisfaction breakdown (which of lamp/mead/iron_armor/chairs/pottery/brandy/luxury_clothes/
   gold_ring is short) — this is the diagnostic that shows WHICH good is capping the aristocrat.
3. **Per-T3-good production totals** already appear in the good table; add an explicit
   **"T3 LUXURY STATUS"** block listing each of the 7 goods with total + producing-city so a
   pass/fail read is one line, not a scan.
4. **Castle-L5-does-not-win assertion in-report.** Print whether `state.victory` fired before
   or after reaching castle L5 — the report should make it obvious that L5 no longer wins.

These are additive report lines; they do not change the run, so the deterministic economy is
untouched by 3a.

### 3b. Policy/geography tweaks (playthrough.js `RESEARCH_ORDER`/`PLANS`, player.js `links`) — needed for criterion 2

Only after EconDev/Balance land the economy rework, and coordinated with them (the run is
finely tuned). Candidate changes, smallest-first:

- **Connect City#4** (add `[0,4]` or `[1,4]` to `player.js links`) OR **relocate the T3-luxury
  chain + aristocrat_home into a connected city's PLAN** (City#3 is the natural luxury capital —
  it already runs oil→lamp). Whichever EconDev's rework assumes.
- **Relax `selectResearch()`'s material gate for the aristocrat chain** so
  `unlock_luxury_tailor`/`unlock_distillery`/`unlock_aristocrat_home` can be researched once
  their prereqs are met and gold is available (the gate exists to avoid hard-stalling on a
  single active node; but with the chain now suppliable it should let these through — otherwise
  the AI never pursues the win). Keep it deterministic (priority order, no RNG).
- **Add `aristocrat_home` + T3 producers to a connected city's build plan** with enough
  aristocrat housing to spawn ≥1 aristocrat, and ensure worker/labor balancing (`balanceLabor`)
  staffs the new T3 producers.

**Constraint:** every harness change stays deterministic (seeded, priority-ordered). QA will
re-verify bit-identical replay after each tweak.

---

## 4. Pass/fail thresholds per exit criterion (the QA gate)

| # | Exit criterion (brief §Exit) | Concrete measurable check | PASS threshold |
|---|---|---|---|
| **1a** | New victory fires on aristocrat_home @100% | Unit test: town with built `aristocrat_home` + `tierHappiness.aristocrats=100` → `Castle`/progress detector sets `state.victory=true` | victory flag true |
| **1b** | Castle L5 no longer wins | Unit test: drive `Castle.upgrade` to level 5 with NO aristocrat_home → `state.victory` stays false | victory flag false at L5 |
| **1c** | Save/load of victory flag correct | Migration/round-trip test: save with victory=true, load → still true; new-rule detector re-derives correctly | flag preserved |
| **2a** | Aristocrats spawn & reach 100% | Playthrough: `first aristocrats pop≥1` ≠ NEVER; some town reaches `tierHappiness.aristocrats ≥ 99.5` | both true |
| **2b** | Every T3 luxury has non-zero production | Playthrough good totals: each of `gold_ring, brandy, luxury_clothes, chairs, iron_armor, pottery, lamp` total > 0.5 at end | all 7 > 0 |
| **2c** | New victory reached in reasonable time | Playthrough `NEW VICTORY` tick is set and finite | tick ≤ ~30 000 (proposed; lead to confirm the "reasonable" bar) |
| **3** | Smoother curve, no long plateau | Castle L1→L2 gap and any tier ≥70% plateau < a threshold; no single level/tier flat for an implausible stretch | no plateau > ~4000 ticks (was: castle L1 for 8500t; burgher-70 at 8592t) |
| **4a** | No regression: pure-core suites | `for f in test/*.test.js …; node $f` | 15/15 green (incl. updated progress test) |
| **4b** | Build check | `node tools/build.js --check` | OK, no drift |
| **4c** | Editor harness | `node test/editor.test.js` | 95/95 |
| **4d** | Headless browser boot | start game → 4× economy → open tech tree/kingdom/editor | zero page errors |
| **4e** | Determinism | two identical-tick playthroughs | byte-identical milestone/final lines |

Numeric bars in 2c/3 are QA proposals — the lead freezes the exact "reasonable time" and
"plateau" numbers into the change contract; QA then locks the achieved curve in a test.

---

## 5. Characterization-test plan (files + assertions)

### Detector API — PINNED with EconDev (confirmed)

- **Function:** `Victory.check(state) -> state` — new pure object `Victory` in `progress.js`
  (after the Castle block). Side effect: sets `state.victory = true` when a town has a BUILT
  `aristocrat_home` AND `tierHappiness.aristocrats >= CONFIG.victory.aristocratHappiness`.
  **Latches** (early-returns if `state.victory` already true). Deterministic, reads only state.
- **Threshold:** `CONFIG.victory.aristocratHappiness` (default **99.5**), added in `progress.js`.
  Tests assert against `CONFIG.victory.aristocratHappiness`, **not a hardcoded literal**.
- **Predicate** (matches EconDev's impl):
  built home `town.buildings.some(b => b && b.typeId === "aristocrat_home" && b.built !== false)`
  · happiness `typeof town.tierHappiness.aristocrats === "number" && ... >= threshold`.
- **Empty-home safety:** `tierHappiness.aristocrats` is `null` unless aristocrats actually live
  there (sim.js:372) → a built-but-empty home cannot false-win → **required test case**.
- **Castle L5:** EconDev removes the flip at `progress.js:107` and drops the `victory` field from
  `Castle.upgrade`'s return (→ `{ ok:true, level }`). Tests assert L5 does NOT set `state.victory`
  AND `Castle.upgrade(...)` return has no truthy `.victory`.
- **Wiring:** shell adds `Victory.check(state)` after `Quests.tick` in mainloop.js:64 (lead).
  Tests call `Victory.check(state)` directly (no shell change needed for the pure test).

### 5a. MODIFY `test/progress.test.js` — invert the victory rule

The current section **"5. Reaching level 5 flags victory"** (lines 120–129) asserts
`castle level 5 flags victory` — **inverted** to the new rule:

- **Rewrite section 5** → "Reaching level 5 does NOT flag victory": fund castle to L5 with no
  aristocrat_home → assert `state.victory !== true`, `state.castleLevel === 5`, AND the final
  `Castle.upgrade` return has no truthy `.victory`. Keep the "reaches max level 5" + "no upgrade
  past max" assertions.
- **ADD section 6** "Aristocrat house at 100% flags victory": town with a **built**
  `aristocrat_home` + `tierHappiness.aristocrats = CONFIG.victory.aristocratHappiness` (or 100) →
  `Victory.check(state)` → assert `state.victory === true`.
- Keep sections 1–4 unchanged — castle leveling stays a prestige sink; only the L5→victory flip
  is removed. Export `Victory` from the sandbox eval alongside `Town/Castle/Quests`.

### 5b. ADD `test/victory.test.js` (new) — focused new-victory characterization

- **Detector truth table** (pure, no playthrough): matrix over {aristocrat_home built y/n} ×
  {aristocrats th = 100 / 99.4 / 70 / null} → exactly one cell (built + th≥99.5) sets victory.
- **Boundary:** th = 99.5 wins, 99.4 does not (locks the ≥~99.5 threshold the brief specifies).
- **Multiple towns:** victory fires if ANY town qualifies, not only town #1.
- **Save/load:** serialize a victorious state → deserialize → detector still agrees / flag
  preserved (coordinate with `migration.test.js` conventions).

### 5c. ADD `test/aristocrat_economy.test.js` (new) — achievability lock (post-Phase-2)

Once EconDev/Balance land the rework, capture the improved curve as regression:
- Drive the pure Sim (like `sim.test.js`) with an aristocrat_home + full T3 supply stocked →
  assert `tierHappiness.aristocrats` climbs to ≥99.5 within N ticks (all 8 goods present).
- Assert that removing any ONE aristocrat good (e.g. drop `brandy`) caps th < 100 — proves the
  win gate transitively requires the whole T3 set (the design intent).

### 5d. Determinism regression (harness, not a `.test.js`)

Add a note/asserting wrapper: two `playthrough.js` runs at equal ticks must produce identical
`NEW VICTORY`/milestone lines. Optionally a tiny `test/playthrough_determinism.test.js` that
loads the core twice and checks a short Sim replay is bit-identical (guards against any
non-determinism the harness tweaks in §3b might introduce).

**Do NOT** hard-code the exact new-victory tick into a committed test until the lead freezes the
final economy — a brittle `=== 14237` assertion would break on every balance nudge. Use
`> 0 && < ceiling` bounds; lock the precise tick only once the curve is signed off.

---

## Summary of the contract

Baseline is castle-L5 victory at **tick 9750** with aristocrats and 6/7 T3 luxuries as
**dead content (total 0 forever)**. The greedy AI **cannot** reach the new aristocrat-house
victory unaided — three hard blocks (road-isolated City#4 owning the only T3 chain, the
research material-gate self-blocking the luxury nodes, and aristocrat_home's own T3 build cost).
QA will extend the report with a new-victory detector + per-aristocrat-home happiness + T3-luxury
status block, tweak roads/plans/research-order (coordinated, deterministic) so a successful run
is measurable, invert the progress.test.js L5 assertion, and add `victory.test.js` +
`aristocrat_economy.test.js` to lock the new rule and the achievable curve.
