# Balance proposal — numeric curve for the aristocrat-victory pass (Phase 1, diagnosis)

Role: **Balance** (owns `src/config.js`, `src/goods.js`). Read-only diagnosis per
`docs/BALANCE_PASS_BRIEF.md`; verified against a fresh 20,000-tick BAL2 run
(`TW_HTML=./index.html node tools/playthrough.js 20000` — castle-L5 victory @9750,
aristocrats NEVER, all seven T3 luxuries `total=0.0`, prices pinned at exactly 1.6× base).

## TL;DR

The T3 luxuries are **not mispriced** — every chain has a positive margin at base
prices. They are **structurally unbuildable**: the town slot cap cannot fit a burgher
quarter on top of a working peasant+worker base, burgher labour is too scarce to staff
the seven burgher processors, and (EconDev's seam) burgher growth is gated on goods
only burghers can make. My proposal: widen the mid/late slot curve, enlarge the manor,
re-tier two T3 processors to worker staffing (the established `researchBand` pattern),
and repair three thin price margins. Castle curve: retune as a mid-game sink
(numbers below — constants physically live in EconDev's `progress.js`).

---

## Diagnosed numeric blockers

### B1 — Slot cap: a full T3 city cannot exist (`src/goods.js:319`)

`CONFIG.town.slotCap = [0, 8, 12, 16, 20]`.

Closing the aristocrat economy needs, in whichever city hosts the burgher quarter:
- a self-feeding base (the run's evidence: every viable city spends **13–15 slots**
  on peasant housing/food/wood + worker housing/processors before any T3),
- **7 burgher processors** (forge, armory, pottery_workshop, distillery, goldsmith,
  carpentry, luxury_tailor — `src/goods.js:225-282`), 1 slot each,
- **2–3 manors** to house the burghers who staff them (see B2),
- **1 aristocrat_home**.

That is ≥ 23–25 slots vs. the L4 cap of 20. The playthrough shows the wall directly:
City#1 (the burgher city) ends **20/20** with its plan tail truncated — `manor, forge`
built; `lamp_maker, pottery_workshop` never placed (`tools/playthrough.js:54-69`
documents the truncation as load-bearing). No connected city ever hosts a pottery,
carpentry, goldsmith, armory, distillery or luxury_tailor → six goods at `total=0.0`.

### B2 — Burgher labour arithmetic (`src/goods.js:305` + `src/goods.js:225-282`)

`manor.houseCapacity = 4` (4.6 with royal_census ×1.15). The seven burgher processors
carry 2 `workerSlots` each = **14 burgher jobs**; even minimum-viable staffing
(1 worker each) needs 7 burghers = 2 manors before a single aristocrat exists.
In the run the kingdom's entire burgher population was **4.6** (one manor, City#1);
the forge alone consumed 2, leaving ~2.6 for the other six processors — none of
which had a slot to be built anyway (B1). Slots and labour compound multiplicatively.

### B3 — Burgher growth-ceiling echo (numeric side; needs matrix is EconDev's)

The report's static check (a2): burghers' extras `chairs, pottery, gold_ring` are ALL
produced only by burgher-staffed buildings → the tier is growth-capped at ~70% until
an extra is importable, which keeps the burgher pool tiny (B2) forever. The
**staffing tier lives in my file** (`workerTier`, `src/goods.js:241` and `:271`) and
the codebase already has the exact escape hatch: `charcoal_burner`
(`src/goods.js:198-209`) and `lamp_maker` (`src/goods.js:260-268`) were re-tiered to
lower-tier staffing with `researchBand` keeping the research node in its original
band. Re-tiering **pottery_workshop** and **carpentry** to `worker` makes 2 of 3
burgher extras worker-producible, breaking the self-lock (gold_ring stays a
burgher-made prestige good — the bootstrap manor's 4-6 burghers can staff the
goldsmith). **This interacts with EconDev's tier pipeline — flagged as R1 below;
I will not touch it without their ack.**

### B4 — Thin/inverted T3 margins (`src/goods.js:22-40`)

Stated design bands: T2 = inputs ×1.4–1.5, T3 = ×1.3–2. Actuals:

| good | inputs @base | basePrice | multiple | verdict |
|---|---|---|---|---|
| oil (T2) | fish 2×5 = 10 | 18 | **1.80×** | above T2 band; taxes lamp+chairs |
| lamp | oil 2×18 = 36 | 40 | **1.11×** | broken margin |
| chairs | planks 28 + oil 18 = 46 | 64 | 1.39× | ok-ish, low for band |
| brandy | mead 28 + pottery 22 = 50 | 60 | **1.20×** | below band |
| luxury_clothes | clothes 44 + ring 120 = 164 | 200 | **1.22×** | below band, deepest chain |
| pottery | clay 12 | 22 | 1.83× | fine |
| iron_armor | coal 20 + iron 16 = 36 | 70 | 1.94× | fine |
| gold_ring | gold 42 + tool 22 = 64 | 120 | 1.88× | fine |

Fixing **oil** (the over-priced T2 input) repairs lamp and chairs simultaneously;
brandy and luxury_clothes need their own bumps.

### B5 — Price model observation (`src/goods.js:392`, no change proposed)

`target = base × (1.6 − 0.8·ratio)` with ratio ≥ 0 means the 3.0× ceiling clamp is
**mathematically unreachable** — maximum scarcity premium is 1.6× base (the run
confirms: every never-produced good sits at exactly 1.6×). This mutes the price
signal that would pull traders/producers toward scarce T3 goods. It is also cozy
(no price spikes), so I propose **no change now**; if Phase-2 measurement shows the
demand-pull is still too weak, the one-line lever is the 1.6/0.8 pair (e.g.
2.2/1.4 keeps comfort-price at 0.8× base but lets true scarcity reach 2.2×).

### B6 — Castle curve: wrong shape for a mid-game sink (`src/progress.js:40-50` — EconDev's file)

`levels = [–, {0,0}, {3,300}, {8,800}, {16,1800}, {28,3500}]`. Observed: L1 until
tick **8500**, then L2→L5 in 1250 ticks. Cause split: prestige trickles (2 total by
tick 10000 — quest cadence, EconDev's seam) then floods (477 by 20000), while the
gold requirements are trivial against a 35k treasury. Now that L5 is a milestone,
not victory, the curve should be a **smooth ladder + late gold sink**: lower the
early prestige walls, raise the late gold cost. Numbers in the table; application
belongs to EconDev (or hoist `CONFIG.castle.levels` into `config.js` — R4).

### Not blockers (checked, leave alone)

- **T3 building gold costs** (140–240g) and `aristocrat_home` cost
  (`src/goods.js:312`, 400g + chairs 2 + gold_ring 1): trivial vs. late-game gold,
  thematically right — keep.
- **storageCap 80** (`src/goods.js:328`): pins over-producers (forge idles at 75/80)
  but is not a victory blocker; per-aristocrat demand is ~0.01–0.04/tick, so one
  staffed producer per good vastly oversupplies. Keep (cozy).
- **econ knobs** (`src/goods.js:357-361`): bufferTarget 2.0 / minDemand 0.5 /
  priceSmoothing 0.10 — sane. Keep.
- **City#4 road isolation** (`tools/player.js:134`): the designed "citizen district"
  never trades (0 dispatches) — harness seam, QA's.

---

## Proposed constant changes (my files unless marked)

| # | file | key | before → after | why |
|---|---|---|---|---|
| 1 | `src/goods.js:319` | `CONFIG.town.slotCap` | `[0,8,12,16,20]` → `[0,8,12,17,24]` | B1. L1/L2 untouched (early game unchanged); L3 +1, L4 +4 buys exactly the burgher quarter (2 manors + T3 processors + aristocrat_home). With town_charters (+1) an L4 capital tops at 25. |
| 2 | `src/goods.js:305` | `buildings.manor.houseCapacity` | `4` → `6` | B2. Two manors (12, 13.8 w/census) staff the 5 remaining burgher processors at 2 workers each; halves the housing-slot overhead of the burgher quarter. |
| 3 | `src/goods.js:28` | `goods.oil.basePrice` | `18` → `15` | B4. Restores T2 band (fish 10 ×1.5); repairs lamp (40/30 = 1.33×) and chairs (64/43 = 1.49×) without touching their own prices. |
| 4 | `src/goods.js:39` | `goods.brandy.basePrice` | `60` → `72` | B4. 1.44× over inputs (50); makes the distillery worth staffing with scarce burghers. |
| 5 | `src/goods.js:40` | `goods.luxury_clothes.basePrice` | `200` → `240` | B4. 1.46× over inputs (164); the deepest chain should carry the fattest absolute margin. |
| 6 | `src/goods.js:241` | `buildings.pottery_workshop.workerTier` | `"burgher"` → `"worker"` + add `researchBand: "burgher"` | B3. Pottery is a burgher extra, an aristocrat BASIC, and a distillery input — triple-purposed like lamp; same fix as lamp_maker (`goods.js:260`). **Needs EconDev ack (R1).** |
| 7 | `src/goods.js:271` | `buildings.carpentry.workerTier` | `"burgher"` → `"worker"` + add `researchBand: "burgher"` | B3. Chairs are a burgher extra, an aristocrat BASIC, a research material (×4 nodes) and an aristocrat_home construction material — the single most demanded T3 good; the aristocrat gate should not hang on burgher-staffed supply. **Needs EconDev ack (R1).** |
| 8 | `src/progress.js:45-48` (**EconDev applies — R4**) | `CONFIG.castle.levels[2..5]` | `{3,300} {8,800} {16,1800} {28,3500}` → `{2,300} {6,900} {12,2200} {20,5000}` | B6. Lower early prestige walls (observed prestige = 2 for the first ~10k ticks), shift late weight to gold so the castle becomes the treasury sink the post-victory economy needs (treasury ballooned to 35k with nothing to buy). Target spacing ≈ L2@3k · L3@5.5k · L4@8k · L5@11–12k, contingent on R2 quest cadence. |

Post-change slot audit of a realistic T3 capital (change #1+#2): base 13–15 +
2 manors + 7 burgher-band processors + aristocrat_home = **23–25 ≤ 24(+1 charter)** —
tight but closable, which preserves "a build-up, not a wall-then-rush": the player
must still specialize cities and trade for intermediates.

## REQUESTS to EconDev (their files; I depend on these)

- **R1 (blocking for #6/#7):** Ack the pottery_workshop + carpentry re-tier to
  worker staffing. It touches your tier-progression pipeline: burgher extras become
  `worker/worker/burgher`-produced, opening burgher growth past 70% once a goldsmith
  runs. If you'd rather fix the ceiling in the needs matrix instead (e.g. move
  `pottery` out of burgher `extra`), say so and I'll drop #6/#7 — one of the two
  must land or burghers stay pinned at ~70% / pop ~4.6 and can never staff T3.
- **R2:** Quest/prestige cadence (`src/progress.js:24-33`): add 1–2 early-feasible
  prestige quests (deliver potato/planks band) and 1–2 mid T3-pull quests (deliver
  pottery/chairs) — this both smooths the castle ladder (#8) and creates the first
  external demand for T3 goods before aristocrats exist.
- **R3:** `unlock_aristocrat_home` (`src/research.js:77`, cost 1500;
  `src/research-economy.js:124`, mats `bricks:30, chairs:10, gold_ring:5`) is
  reasonable **once** chairs/rings flow (post #1–#7), and I'd keep a material gate
  as the intended "prove your T3 economy" test. Suggest only trimming
  `gold_ring: 5 → 3` (rings trickle at ~1/tick from a 1-worker goldsmith and are
  also an aristocrat_home construction material + a standing burgher/aristocrat
  need — 5 up-front stacks three sinks on the scarcest good).
- **R4:** Apply the castle numbers (#8) in `progress.js`, or hoist
  `CONFIG.castle.levels` into `src/config.js` so the curve sits with the other
  balance constants going forward (brief scopes the curve to Balance, but the
  literals live in your file — your call, lead arbitrates).

## Coordination notes

- **No magic numbers introduced** — every change is an existing CONFIG literal in
  place; #6/#7 reuse the established `researchBand` mechanism (no logic changes).
- **Early game untouched:** T1/T2 prices (except oil −3), starter costs, L1/L2 slot
  caps, town upgrade gates, and all peasant/worker chains are unchanged — the
  difficulty arc keeps its floor; no fail state is introduced (cozy preserved).
- **Determinism:** pure data edits; the pricing formula and Sim logic are untouched
  (B5 explicitly deferred).
- **Measurement plan for Phase 2 (lead runs):** after integration, the 20k BAL2 run
  should show (a) all seven T3 goods `total > 0`, (b) burgher tierHappiness > 70
  somewhere, (c) castle L2 before tick ~4000, and (d) aristocrat pop ≥ 1 — (d) also
  requires EconDev's victory/housing/needs work, not my constants alone.
- **QA note:** the greedy plans (`tools/playthrough.js` PLANS) hard-truncate at the
  old 20-slot cap and City#4 is road-isolated; once slotCap changes, the plans (and
  the City#4 link) need QA's harness update or the new headroom goes unmeasured.
