# Balance & Post-Victory Pass — Team Brief

**Read this first.** You are a teammate on a focused balance pass for **Trade Winds**
(a single-file browser economy game, now modularized into `src/*.js` reassembled by
`tools/build.js` into `index.html`). You have no chat history — this doc + the code
are your context. Team-running rules: [`CLAUDE.md`](../CLAUDE.md); project facts:
[`PROJECT.md`](../PROJECT.md).

## PRIMARY OBJECTIVE — change the victory condition (author directive)

**Current victory:** King's Castle reaches **Level 5** (`src/progress.js`: levels
1→5 bought with prestige + treasury gold; L5 → `state.victory = true`). This is a
pure gold/prestige sink that never engages the luxury economy — the reason T3 content
is dead.

**New victory (build this):** **an Aristocrat House that has reached 100% happiness.**
A town has a built `aristocrat_home` AND its **aristocrat-tier happiness = 100** (i.e.
≥ ~99.5). 100% aristocrat happiness requires ALL aristocrat needs met — basics
`lamp, mead, iron_armor, chairs, pottery` + luxuries `brandy, luxury_clothes,
gold_ring` — so this win gate transitively forces the **entire T3 economy** to close.
That is the point: it makes the currently-dead aristocrat/luxury content the end-game.

The rest of this pass exists to make that victory **achievable** — today aristocrats
never even spawn, so the economy must be reworked so a player CAN stand up a fully-happy
aristocrat house. Castle leveling **stays** as a mid-game progression/prestige sink but
is **no longer the victory** (keep L5 as a milestone; do not flip `state.victory` on it).

## The problem (grounded in real playthrough data)

The lead ran the greedy playthrough harness (`TW_HTML=./index.html node
tools/playthrough.js <ticks>`, seed=bal2, fertile map, 3–4 cities):

- **20,000-tick run:** victory (castle L5) at tick **9750**, but via a bad curve:
  castle sits at **L1 until tick 8500**, then rushes L2→L3→L4→L5 in ~1250 ticks.
  A long grind, then an anticlimactic rush, then a dead post-victory (treasury
  balloons to 35k, prestige 477, nothing left to do).
- **Aristocrats NEVER appear** — not even at victory. The entire T3-luxury top of
  the economy (`gold_ring, brandy, luxury_clothes, chairs, lamp, iron_armor`) shows
  `total = 0.0`. Dead content.
- Burghers cap ~55% happy; workers ~65%. Research stalls at **44/51** unlocked.

## Root-cause leads (verify, don't assume)

1. **Upper tiers are growth-locked on scarce T3 luxuries.** In `src/sim.js`
   `CONFIG.needs.tiers`, a tier may only GROW when **all** its `extra[]` (luxury)
   goods are available (`growthThreshold: 0.9999`). Burghers' `extra` includes
   `gold_ring`; aristocrats' `extra` = `brandy, luxury_clothes, gold_ring`. Those
   luxuries need deep research + long chains the economy never sustains → the tier
   can satisfy basics (~70% happy) but can never grow past it. This likely explains
   the burgher plateau AND why aristocrats never spawn.
2. **Aristocrat housing is a chicken-and-egg research gate.** `unlock_aristocrat_home`
   (`src/research.js`) costs **1500**, prereqs `[unlock_manor, unlock_luxury_tailor]`,
   and its material cost (`src/research-economy.js`) is `bricks:30, chairs:10,
   gold_ring:5` — i.e. you must already be producing T3 luxuries to research the
   home that houses the tier that consumes them. The greedy run never reaches it.
3. **Castle L1→L2 wall.** Castle stays L1 for 8500 ticks then rushes. Investigate the
   castle-material / prestige / quest economy that gates leveling (`src/progress.js`,
   `src/research-economy.js` castle buying, `src/config.js` cost curves).

## Exit criteria (QA gates these against `GDD.md`)

1. **New victory works & is the ONLY win.** Victory fires iff a town has a built
   `aristocrat_home` with aristocrat-tier happiness = 100; castle L5 no longer wins
   (verify both: reaching L5 does NOT flip victory; a 100%-happy aristocrat house
   DOES). Save/load of the victory flag still correct.
2. **It is ACHIEVABLE** — a standard greedy playthrough (`TW_HTML=./index.html node
   tools/playthrough.js <ticks>`, seed=bal2) reaches the new victory in a reasonable
   time, which requires: aristocrats spawn AND reach 100% happy, and every T3 luxury
   (`gold_ring, brandy, luxury_clothes, chairs, iron_armor, pottery, lamp`) shows
   non-zero production/trade. (The greedy AI may need harness tweaks to pursue the new
   goal — QA owns that; if the AI can't get there, the economy is still too gated.)
3. **Smoother curve** — no tier/level plateaus for an implausibly long stretch; the
   climb to a full aristocrat house feels like a build-up, not a wall then a rush.
4. **No regression** — all 15 pure-core suites green, `node tools/build.js --check`
   OK, editor harness 95/95, clean headless browser boot, determinism bit-identical.
   (The victory-condition test in the suite must be updated to the new rule.)

## File ownership (module boundary = ownership boundary — NEVER edit another's file)

| Owner | Files | Scope |
|---|---|---|
| **EconDev** (Opus) | `src/sim.js`, `src/buildings.js`, `src/research.js`, `src/research-economy.js`, `src/progress.js` | Tier-progression pipeline: the `Needs` matrix (growth/decline gates, per-tier basic/extra), aristocrat housing/spawn, the aristocrat research gate (prereqs/cost/materials), castle-material economy, **and the new victory-condition detection in `progress.js`** (fire on aristocrat_home @100%, stop firing on castle L5). |
| **Balance** (Fable) | `src/config.js`, `src/goods.js` | Numeric curve only: good base prices/values, building & upgrade costs, castle level-cost curve, econ knobs. (The `Needs` matrix lives in `sim.js` = EconDev's; you tune prices/costs, not the needs lists.) |
| **QA / Test** (Opus) | `tools/playthrough.js` (may extend its report), `test/*.test.js` (author characterization tests) | Measure adversarially, lock the improved curve in tests, gate exit criteria vs GDD. |
| **Lead** | integration only (+ `src/progress-ui.js` victory-overlay copy) | Sole builder + measurer + committer. Owns `index.html` reassembly and `main`, and updates the victory overlay text (progress-ui.js) to match the new win. |

## Working protocol (avoids build races; matches CLAUDE.md §12)

- **Edit only `src/<your files>`. Do NOT run `tools/build.js` or the playthrough
  yourself, and do NOT commit** — the lead is the sole builder/measurer/integrator
  (concurrent `build.js` runs would race on `index.html`). Leave your changes in the
  working tree; tell the lead what you changed and why.
- **Phase 1 = diagnosis, READ-ONLY.** Do not edit source yet. Produce a concrete
  proposal (specific edits: file, symbol, before→after value, rationale) to
  `docs/proposals/<role>.md`. The lead reads all three, resolves overlaps, freezes a
  change contract, then greenlights Phase 2 implementation.
- **Coordinate across seams by message**, not by editing each other's files: e.g. if
  Balance wants the aristocrat luxury cheaper AND EconDev is changing which goods gate
  growth, agree the split first. Balance owns the price of `gold_ring`; EconDev owns
  whether `gold_ring` gates burgher growth.
- **Determinism is sacred** — no `Math.random`/`Date`/wall-clock in the pure core
  (seeded RNG only). `CONFIG` is the home for balance constants; no magic numbers in
  logic.

## Quick reference

- Build after edits (lead only): `node tools/build.js` then `node tools/build.js --check`.
- Suites (lead/QA): `for f in test/*.test.js; do case "$f" in *editor.test.js) continue;; esac; node "$f"; done`.
- Playthrough (lead/QA): `TW_HTML=./index.html node tools/playthrough.js 20000`.
- The `Needs` matrix + growth gates: top of `src/sim.js` (`CONFIG.needs.tiers`,
  `growthThreshold`, `growthRate`, `capacityFullAt`).
