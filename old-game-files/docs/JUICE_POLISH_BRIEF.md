# Milestone Brief — "Juice & Feel Polish" (v0.35.0 target)

**Lead-authored shared context for the agent team.** You (a teammate) wake with NO
conversation history — this brief + `PROJECT.md` + `GDD.md` are your context. Read
this fully before editing.

## Milestone goal (author-chosen)
Make the *running* economy feel alive and stable, without changing what the game
*is*. Three disjoint slices:
1. **VFX** — richer transaction/coin particles + chimney smoke + placement pops.
2. **Audio** — deeper, more satisfying event SFX + subtle ambience/mixing.
3. **Economy smoothing** — fix the known **post-victory happiness sawtooth**
   (estate happiness oscillates ~56%↔99% because imports arrive in bursts).

## Current state of the project (as of v0.34.0 — PROJECT.md "Current status" is stale, trust THIS)
Fully modular single-file game: editable source in `src/*.js`, reassembled into the
shipped `index.html` by `node tools/build.js` (marker splice; `--check` guards drift).
Since the last PROJECT.md log (v0.23) these shipped: a **Balance Lab** tool (🧪),
a **game-wide economy rebalance to clean per-minute numbers** (v0.32: extractors
20–60/min, processors ~10/min at 2:1, needs 2.5/min basic + 1.5/min luxury), an
**Electron desktop app** with disk auto-save (v0.33), and the **King's Quests system
was fully retired** (v0.34: castle now upgrades on gold alone). Tests: 21 pure-core
suites + editor harness, all green. Win condition = an Aristocrat's House at 100%
happiness (GDD).

## THE 3 RULES (from CLAUDE.md — non-negotiable)
1. **Own only your file(s).** Edit ONLY the files your slice lists below. Never edit
   another slice's files or `index.html`.
2. Message the lead for anything cross-cutting; don't touch a shared hot file.
3. You work in a **worktree** in parallel with the other two slices.

## Hard constraints (enforced on every slice)
- `CONFIG` (in `src/config.js` + `src/goods.js`/`src/sim.js` sub-objects) is the ONLY
  home for balance/tuning constants — **no magic numbers in logic**. (Economy slice
  owns config edits; VFX/Audio keep their own tuning constants local to their module.)
- **Pure core stays pure & deterministic**: `Sim`/`Trade`/`Research` tick path has NO
  DOM, canvas, `Math.random`, or `Date`/wall-clock (seeded RNG only). This is what
  keeps it headless-testable and 4×-runnable. VFX/Audio live in the SHELL only.
- **Two clocks**: render on rAF `dt`; economy on the fixed 500ms×speed timestep
  (2 ticks = 1 game-second; per-minute = per-tick ×120). VFX/Audio are render-clock;
  never gate economy on them.
- Additive & fenced: prefer enriching your module over cross-cutting edits.

## Build / commit protocol (so the lead can integrate cleanly)
- You are in an isolated **git worktree**. You MAY run `node tools/build.js` and the
  tests THERE to verify.
- **Commit ONLY your slice's `src/` and `test/` files** — do NOT `git add index.html`
  (the lead rebuilds it once during integration to avoid 3-way conflicts on the build
  output). Example: `git add src/juice.js && git commit`.
- Leave your worktree branch with that commit; report the branch name + a summary.

---

## Slice A — Economy smoothing (the sawtooth fix)  [OWNER: EconDev, Opus]
**Files you own:** `src/sim.js`, `src/trade.js`, `src/config.js` (+ `src/goods.js`
CONFIG sub-objects if a tuning constant lives there) and the pure-core tests
`test/sim.test.js` / `test/trade.test.js` / `test/balance.test.js` (re-baseline/extend
as needed).

**Problem:** After victory the aristocrat estate's happiness *sawtooths* (~56%↔99%)
because inter-city imports arrive in bursts (a cart dumps a load, happiness spikes;
stock drains before the next cart, happiness craters). Root cause is bursty import
distribution + happiness reading instantaneous stock, not the economy being broken.

**Deliverable:** a deterministic smoothing so a supplied tier holds a **stable
happiness plateau** instead of oscillating, WITHOUT making the game trivially easy or
breaking self-sustaining balance. Candidate approaches (pick what's cleanest, justify):
- a **consumer buffer / pantry**: a town holds a small smoothed reserve of each need
  so per-tick consumption draws from the reserve, decoupling happiness from cart-burst
  timing; or
- smooth the **happiness lerp** harder / off a moving-average stock; or
- **cart cadence/capacity** tuning so imports arrive in smaller, more frequent loads.
All tuning values go in `CONFIG`. Must stay pure/deterministic (seeded, no wall-clock).

**Exit criteria (QA will measure):**
- Over a long deterministic run of a supplied estate, aristocrat happiness **variance
  drops sharply** (e.g. peak-to-trough < ~8 points, vs the current ~40) and the mean
  stays ≥ the win threshold once supplied.
- The v0.32 balance still holds: peasants/workers remain single-town self-sufficient;
  no tier that was reachable becomes unreachable.
- Determinism preserved (two identical runs bit-identical); full pure-core suite green
  (re-baseline any assertion that legitimately shifts, preserving its intent).

## Slice B — VFX / juice  [OWNER: JuiceDev, Sonnet]
**File you own:** `src/juice.js` ONLY. It's already a self-contained render-clock
particle layer (`Juice.frame(dt)` is wired from `src/mainloop.js`; it reads
`state.{carts,towns}` + render caches, never mutates state). Existing effects:
`coinBurst`, `smokePuff`, `trailDot`, `popIn`, `detectSales`, `emitSmoke`, `emitTrails`.
Hard safeguards already present: a particle cap, an object pool, zoom-culled emission.

**Deliverable:** make the world feel more alive by enriching THIS module only:
- Punchier **transaction feedback** (coin/star burst when a sale settles — tie to the
  existing `detectSales`), a floating "+Ng" tariff popup when the treasury ticks up,
  building **construction/upgrade completion** pops, richer **chimney smoke** for
  actively-producing buildings (idle buildings emit none — read worker/output state),
  subtle **cart dust/trail** improvements. Keep it cozy/board-game, not flashy.
- Respect the perf safeguards (cap, pool, cull); everything read-only off `state`.
  Add any new tuning as local consts at the top of `juice.js`.

**Exit criteria:** visible new effects on sale/build/produce; zero state mutation; no
new page errors; 60fps unaffected (particle cap honored). Verify with a browser smoke
(build in your worktree, drive the economy at 4×, watch for errors + effects).

## Slice C — Audio  [OWNER: AudioDev, Sonnet]
**File you own:** `src/audio.js` ONLY. It's the WebAudio SFX layer (`window.SFX`,
`play`/`playThrottled`, cues: place/trade/levelup/quest/event; has a `_recent` debug
ring buffer read by the top-right debug panel). All cues are synthesized (zero external
assets — CSP blocks them). Guarded so headless/no-WebAudio never throws.

**Deliverable:** deeper, more satisfying sound within THIS module only:
- Improve the existing cues (warmer coin chime on `trade`, a nicer `levelup`/build
  cue, a distinct construction-complete cue), and add **subtle low-volume ambience**
  (e.g. a gentle market/wind bed that respects mute + the first-gesture unlock).
- Keep master volume gentle, keep the mute flag + throttles, keep every cue synthesized
  and headless-safe. Note: the orphaned "quest done" cue was already removed — do NOT
  reintroduce quest audio (quests are retired).

**Exit criteria:** richer cues audibly distinct, ambience is subtle + mutable + never
plays pre-gesture, headless smoke throws nothing, mute still silences everything.

---

## Integration (lead only)
Lead pulls each slice's `src/`+`test/` files (disjoint → clean), rebuilds `index.html`
once, runs the FULL suite + a browser smoke, then QA (Opus) verifies the sawtooth
metric + no regressions before the milestone is called done and committed to `main`.
