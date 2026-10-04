# Phase-2 Change Contract — Balance & Post-Victory Pass (frozen by Lead)

Reconciled from the three Phase-1 proposals (`econdev.md`, `balance.md`, `qa.md`).
This is the authoritative build list. File ownership is strict (module = owner).
**Teammates: edit only your files, do NOT run `tools/build.js`, do NOT run the
playthrough, do NOT commit. Leave changes in the working tree and report back — the
Lead is the sole builder/measurer/committer.**

## Lead arbitration decisions (where proposals differed)

- **Aristocrat research gate → worker-band mats (EconDev's version wins).** The new
  victory (100% aristocrat happiness) is itself the forcing function for the full T3
  economy; a second T3 gate on *research* only recreates the deadlock. So drop T3 from
  the research materials entirely (Balance R3 "keep a T3 gate" is overruled).
- **aristocrat_home BUILD cost → drop BOTH `gold_ring:1` and `chairs:2`.** Same reason:
  the win condition forces T3; the *first* home must be constructible in a cold economy.
- **Castle curve retune + early prestige quests → DEFERRED to Phase 2B.** Castle L5 is
  no longer the victory, so its pacing is secondary. Ship the victory-critical path
  (2A) first, measure, then decide if the castle ladder/quests need work.

---

## Phase 2A — victory-critical (do now, in parallel by owner)

### EconDev — `src/progress.js`, `src/research-economy.js`
1. `research-economy.js` `RESEARCH_MATERIALS`: `unlock_aristocrat_home` → `{ bricks:30, planks:15 }`; `unlock_luxury_tailor` → `{ clothes:15, planks:10 }`. Leave `unlock_distillery` as-is.
2. `progress.js`: add `Object.assign(CONFIG, { victory: { aristocratHappiness: 99.5 } });`.
3. `progress.js`: add the pure latching `Victory.check(state)` detector exactly as specced in `econdev.md` §3b (built `aristocrat_home` + `tierHappiness.aristocrats >= CONFIG.victory.aristocratHappiness`; null-happiness guards empty-home false-win).
4. `progress.js` `Castle.upgrade`: DELETE the castle-L5 `state.victory = true` flip; drop the `victory` field from the return (`return { ok:true, level:state.castleLevel }`); fix the doc comment.
5. (optional hygiene) delete the vestigial `growthThreshold` line in `sim.js:39`. Skip if it adds risk.
> Keep the `Victory.check` API/threshold-key stable — QA's tests are locked to it.

### Balance — `src/goods.js`
1. `CONFIG.town.slotCap` `[0,8,12,16,20]` → `[0,8,12,17,24]`.
2. `buildings.manor.houseCapacity` `4` → `6`.
3. `goods.oil.basePrice` `18` → `15`; `goods.brandy.basePrice` `60` → `72`; `goods.luxury_clothes.basePrice` `200` → `240`.
4. Re-tier `buildings.pottery_workshop` and `buildings.carpentry`: `workerTier "burgher" → "worker"` + add `researchBand: "burgher"` (lamp_maker precedent). Leave `goldsmith` burgher.
5. `aristocrat_home` build cost (`goods.js:312`): remove `gold_ring:1` AND `chairs:2` (leave `{ wood:40, stone:30, bricks:20, gold:400 }`).
> Early game (L1/L2 caps, T1/T2 prices except oil) stays untouched.

### QA — `tools/playthrough.js`, `test/*.test.js` (may start in parallel; RUN after Lead builds)
1. `playthrough.js` report extensions (`econdev`+`qa` §3a), additive/deterministic: NEW-VICTORY tick line (aristocrat_home @≥99.5), first-home-built line, per-aristocrat-home happiness + per-good satisfaction breakdown, a "T3 LUXURY STATUS" block. Keep the legacy castle-L5 line too.
2. Write `test/victory.test.js` (detector truth table + 99.5/99.4 boundary + multi-town + save/load) and invert `test/progress.test.js` §5 (L5 does NOT win; add "aristocrat house @100% wins"), against the pinned `Victory.check` API. Export `Victory` in the sandbox eval.
3. Hold the geography/policy tweaks (§3b: connect City#4 via a `player.js` link, relax `selectResearch`'s material gate for the aristocrat chain, add aristocrat_home + T3 producers to a connected city's plan) until the Lead has built 2A — then apply, keeping runs bit-deterministic.
4. Do NOT hard-code the victory tick; use bounded asserts until the Lead freezes the curve.

### Lead (me) — `src/mainloop.js`, `src/progress-ui.js`, `src/carts-castle-ui.js`, integration
- `mainloop.js`: append `Victory.check(state);` after `Quests.tick(state);`.
- `progress-ui.js`: update the victory-overlay copy to the aristocrat-estate win.
- `carts-castle-ui.js`: drop the now-dead `if (res.victory) showVictory()` branch.
- Build `index.html`, run the full suite + playthrough, commit per verified slice, iterate.

## Exit criteria (QA gate, from `qa.md` §4)
New victory fires on aristocrat_home @100% and ONLY then (L5 doesn't win, save/load ok);
all 7 T3 luxuries produce > 0; aristocrats spawn and reach ≥99.5 somewhere; new-victory
reached in a finite/reasonable time; no implausible plateau; **no regression** (15/15
pure-core incl. updated victory test, `--check` OK, editor 95/95, clean boot, determinism).

## Phase 2B — polish (after 2A measures green)
Castle cost-curve retune (`progress.js`: `{2,300}{6,900}{12,2200}{20,5000}`) + 1–2 early
prestige quests + 1–2 mid T3-pull quests (EconDev), if pacing still needs it. Lead decides
from the 2A numbers whether to hoist `CONFIG.castle.levels` into `config.js`.
