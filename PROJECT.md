# PROJECT.md — Project-Specific Instructions (Trade Winds)

Project detail for the agent team. **For team-running rules (the 3 rules, audit protocol, readiness
gate, hygiene), see [`CLAUDE.md`](CLAUDE.md); for the agent-teams feature mechanics, see
[`AGENT_TEAMS.md`](AGENT_TEAMS.md).** This file holds *what* is built; CLAUDE.md holds *how* the team
operates. The design authority is [`GDD.md`](GDD.md); this file is its team-facing distillation.

**Keep the "Current status" section current — update it in the same commit as every completed task.**

**Shipping ritual (author's standing request): every time you ship (commit + push a user-facing change), also refresh the preview Artifact from the current `index.html` and give the author the link.** The preview Artifact is:
<https://claude.ai/code/artifact/61de603d-e712-4a2d-81fa-443ed426b565> (favicon ⛵). Read it once per session before the first republish (publish gate), then republish the same file path to keep the URL stable.

---

## Goal

**Trade Winds** — a browser, single-file 2D economy game in the spirit of *Let Them Trade*. You build
a network of **autonomous towns** on a hex board; they produce, consume, and trade with each other on
their own. You shape the conditions (town placement, production buildings, roads) and earn a **tariff**
on every inter-town transaction, spending it to upgrade the King's castle. Core loop: **observe the
market → build/upgrade → towns trade themselves → earn tariff → invest (research, castle, new towns)**.

Cozy, no fail state in sandbox; **win = an Aristocrat's House at 100% happiness** (forces the full T3
luxury economy to close; castle L5 is now a mid-game milestone, not the win) (+ a planned scenario campaign). Full scope,
pillars, and staged roadmap: [`GDD.md`](GDD.md).

## Stack & structure

- **Single `index.html`**, Canvas 2D, **zero external dependencies**, saves in `localStorage`. No
  build step, offline-first, desktop-first. "Run" = open `index.html` in a browser.
- **This is a SINGLE-FILE project** — there is no `/src` module tree. The logical modules below all
  live inside `index.html` (between `PURE_CORE_START` / `PURE_CORE_END` fences for the deterministic
  core). Because everything is one hot file, the live-agent-team "one file per teammate" model does
  **not** apply cleanly here — see *Team model* below.

Logical modules (ownership = the fenced section, not a separate file):

| Logical module | What it owns |
|---|---|
| `CONFIG` | **Single source of balance truth** — all constants (goods, buildings, upgrades, research, researchCenter, econ, trade). |
| `HexMath` / `MapGen` | Axial hex math; seeded (mulberry32) map/biome/fog generation. |
| `Sim` (pure core) | Economy tick: production → consumption → prices → happiness → population; construction delivery. |
| `Trade` (pure core) | Autonomous cart dispatch, transactions, tariff, gradual load/unload. |
| `Pathing` | Road graph + Dijkstra + route cache. |
| `Research` + `ResearchEconomy` (pure core) | Resource-metered research, Research Center speed/build, castle material buying. |
| `Buildings` (pure core) | Placement/construction/upgrade rules, incl. the Research Center. |
| `Renderer` | Canvas world: terrain pre-render, roads, buildings, carts, overlays, the center. |
| `UI` | DOM panels layered over canvas (town/building/keep/kingdom panels, tech tree, HUD). |
| `Save` | Versioned `localStorage` save + stepwise migration + JSON export/import. |
| Tests | `test/*.test.js` — headless Node harnesses that eval the PURE_CORE block. |
| Tooling | `tools/` — the playthrough harness and the standalone research-tree editor (`tools/research-editor.html`, shipped via Artifact). |

## Hard constraints (enforce on every teammate / subagent)

- **`CONFIG` is the only home for balance constants** — no magic numbers in logic.
- **The `Sim`/`Trade`/`Research` core is pure & deterministic**: no DOM, canvas, `Math.random`, or
  `Date`/wall-clock inside the tick path (seeded RNG only). This is what makes it headless-testable
  and runnable at 4×.
- **Two clocks:** render on `requestAnimationFrame`; economy on a fixed 500 ms × gameSpeed timestep
  (2 ticks = 1 game-second).
- **UI in DOM, world in canvas.** Terrain pre-rendered to an offscreen canvas (1 `drawImage`/frame).
- **Persistence is versioned** (`saveVersion`) with a stepwise migration path — never discard old
  saves on a bump.
- **Prefer additive, fenced modules** over editing shared hot regions; keep the single file coherent.

## Team model (single-file caveat)

Per CLAUDE.md's readiness gate, a single-file codebase is **not** "team-ready" for a live agent team
(every teammate would edit `index.html`). So for Trade Winds we use the **in-session subagent model**:
the lead splits a feature into slices, spawns **worktree-isolated subagents** (`Agent` tool,
`isolation: "worktree"`) — sequentially when they touch the same file, in parallel only when they
touch genuinely disjoint files (e.g. `index.html` vs `tools/research-editor.html`) — and the lead is
the **sole serial integrator into `main`**, re-running the full suite after each merge. Model tiers:
Opus for hard pure-core + adversarial review, Sonnet for UI/moderate implementation, Haiku for release
chores, delegating by complexity. Plan → implement → adversarial review.

## Instantiated roster (map CLAUDE.md archetypes → this project)

Spawn only the 3–5 a milestone needs. For a single-file game these are usually **worktree subagents**,
not live teammates (see Team model).

| Role | Model | Owns / does |
|---|---|---|
| **Lead / Integrator** | Opus | Slice split, interface/data contract, serial integration into `main`, verification. |
| **Sim / Economy Dev** | Opus/Sonnet | Pure-core `Sim`/`Trade`/`Research`/`ResearchEconomy` + their tests. |
| **Systems / Buildings Dev** | Sonnet | `Buildings`, placement/upgrade rules, save/migration. |
| **UI / UX Dev** | Sonnet | DOM panels, tech tree, HUD, map render hooks. |
| **Balance / Design** | Fable | `CONFIG` tuning tables, curves, playtest-for-feel. |
| **Test Author** | Sonnet | Headless PURE_CORE harnesses (seed → expected state after N ticks). |
| **QA / Verification** | Opus | Adversarial review (fuzz, edge cases), gates milestone exits against GDD criteria. |
| **Tools** *(subagent)* | Sonnet | `tools/` playthrough harness + the research-tree editor. |

## Milestone exit criteria (QA gates each against GDD.md)

- **Stage 0 — Prototype ✅** map from a seed, camera, roads, 60 FPS.
- **Stage 1 — MVP ✅** specialized towns reach a stable trade equilibrium unattended; cutting a road
  causes a visible price crisis; save/load correct.
- **Stage 2 — Demo ✅** a sandbox run reaches castle-L5 victory with a real difficulty arc
  (deterministic test reaches victory).
- **Stage 3 — 1.0 🔜 (current)** feature-complete + balanced + no blocking issues; a stranger can
  finish scenario 1 without questions. **Remaining:** campaign scenarios + start screen; tutorial;
  audio; juice; balance pass on the 4-tier economy and the new Research Center costs/speeds.

---

## Current status (update every commit)

**v0.40.0 — current on `main`.** Economy granularity overhaul (EconAgent, integrated by lead): `town.stock` is now integer everywhere (fractional carry so nothing is lost); producing buildings bank output and release whole units on a per-building timer (`CONFIG.econ.productionIntervalSec` — extractor 8s / processor 12s, throughput unchanged); integer consumption via per-town carry while satisfaction still reads real fractional demand (satEMA smoothness preserved); trader/porter hauls are whole units ≥1; the 1-wood porter flicker is gone (batched production is the fix, no threshold hack); internal porters now scale movement with `state.gameSpeed` (MotionDev fade preserved). Prior — **v0.39.0** Custom Map + preset retune (MapAgent, integrated by lead): `CONFIG.mapTiers` (6 axes × 3 tiers) + `MapGen.applyTiers(base, sel)` build a resolved preset from a base + dropdown selection; start-screen gains a "Custom…" panel (`#ssCustom`, 6 `#ssTier_*` dropdowns, `#ssRegen`) with live no-save preview; custom `{preset,tiers}` persisted in the save. The 5 presets are retuned to read as distinct (Fertile/Oasis/Big World + new Highlands, Isles). Integration note: the agent worktrees forked from stale `main` (v0.34); lead re-removed reintroduced Kingdom-Events save lines and restored the v0.38.2 Main Menu wiring during merge. Prior — **v0.38.3** Castle land guarantee: `MapGen.ensureCastleCore` clears water/mountains from the castle's 7-hex core (deposits kept), and `MapGen.ensureCastleConnected` flood-fills road-passable land and carves a barren land-bridge if the castle is islanded — fixes the Oasis central-lake stranding. Prior — **v0.38.2** Added a **🏠 Main Menu** button to the ☰ Menu (`#btnMainMenu`, wired in start-screen.js): it `saveGame()`s, closes the popup, and reopens the title overlay via `StartScreen.show()` so Continue resumes the same game. Prior — **v0.38.1** Moved the bottom-center Build/Peasant bar down to the bottom edge (`#buildBar` bottom 96px→18px; the corner widgets it used to clear are gone). Prior — **v0.38.0** The board is now a **rectangle** (`CONFIG.map.rect`, 50×25 pointy-top hexes centered on the castle at axial (0,0)) instead of the old hex disc — MapGen builds the grid with a per-row axial shear so it reads as a true screen-space rectangle; water falloff switched to a Chebyshev (rectangular) edge distance, and the snow pole keys off the top row. Board test re-baselined (hex count = rect w·h = 1250; balance guard 50%→60% since the desert-dominant oasis preset is ~52% desert by design). Prior — **v0.37.0** System declutter: **retired the random Kingdom-Events system** (`events.js` / `Events` / `CONFIG.events` — Bumper Harvest / Demand Craze / Kingdom Fair) entirely, along with its event chip + kingdom banner; its guarded pure-core hooks (Sim farm/craze multipliers, Trade tariff waiver) and save fields are gone, and the module was dropped from the build MANIFEST (36→35). `showToast` (build-error feedback) and the bottom-right Event Log are kept. Also: the objectives panel no longer repeats the mission name below its header. Prior — **v0.36.0** UI declutter & feel pass (Let-Them-Trade style; agent team: lead HUD restructure + MotionDev camera/porter smoothing): corner-anchored HUD, a ☰ Menu popup housing all non-essential controls (seed/tools/reveal/help/debug), a collapsible bottom-right Event Log, right-edge objectives, and eased camera pan/zoom. Prior: feel/juice pass (agent team: EconDev/JuiceDev/AudioDev): the post-victory happiness **sawtooth is fixed** (satisfaction EMA, `CONFIG.needs.satSmoothing`; supplied estate holds a plateau), plus richer transaction/build VFX + chimney smoke and warmer audio cues + a market ambience bed. Brief: [`docs/JUICE_POLISH_BRIEF.md`](docs/JUICE_POLISH_BRIEF.md).

**v0.34.0.** The game is fully modular (`src/*.js` → `index.html` via
`tools/build.js`; `--check` guards drift) and well past the old v0.23 log below. Since then, shipped
in this line of work:
- **Balance Lab (🧪 start-screen tool)** — a professional card-based economy editor: compose cities
  from real buildings/populations, live per-good production-vs-consumption + a persistent Resources
  panel (net /min, staffed producers by level), hover/pin a resource for a summed produced/consumed
  breakdown, per-building pause + slot caps by city level, house needs split Basic/Luxury, carrying-
  capacity ratios, and a **ground-truth Run-sim** over the real `Sim`/`Trade`. Scenario persists.
- **Game-wide economy rebalance (v0.32)** to clean per-minute anchors: extractors 20–60/min,
  every processor ~10/min at its 2:1 input ratio, needs 2.5/min per basic + 1.5/min per luxury,
  across all four tiers. Peasants/workers stay single-town self-sufficient; burgher/aristocrat full
  happiness now depends on inter-city trade (intended). Prices/costs/housing untouched.
- **Windows desktop app (v0.33, Electron)** — `electron/main.js` serves the game from a secure
  `app://` origin (so the blob-iframe editors' localStorage works) + a preload that auto-saves ALL
  data (game + research/mission/balance editors) to one editable JSON file on disk. `DESKTOP.md`;
  the same `index.html` still runs in any browser.
- **King's Quests fully retired (v0.34)** — they had no UI and ran invisibly; removed the engine +
  `CONFIG.quests` + dead banner UI; castle now upgrades on **gold alone** (prestige's only source
  was quests), mirroring the gold-only town upgrades.
- Plus: 60fps render cap, sound-debug panel, gold-only town upgrades, per-minute rate displays,
  smooth cart interpolation, internal-trader icons, mission editor + data-driven Getting Started
  onboarding, "Collapsed Bridge" event removed.

Tests: **21 pure-core suites + the editor harness, all green**; `--check` OK; determinism preserved.

**Shipped: "Juice & Feel Polish" (v0.35.0).** Author-chosen from the
Stage-3 tail. Three disjoint slices owned by worktree subagents (lead integrates serially): **VFX**
(`src/juice.js`), **Audio** (`src/audio.js`), **Economy smoothing** (`src/sim.js`/`trade.js`/
`config.js` — fix the post-victory happiness sawtooth via consumer buffers / trade smoothing). Full
brief + exit criteria: [`docs/JUICE_POLISH_BRIEF.md`](docs/JUICE_POLISH_BRIEF.md).

**Stage-3 → 1.0 remaining after this:** the **campaign scenarios + scenario-select** (the last big
headline item; exit = "a stranger finishes Scenario 1 without questions"); optional Stage-4
(harbors/water trade, bandits/guards).

<details><summary>Older status log (v0.21–v0.23, condensed) — kept for history</summary>

**v0.23.0 — Playtest-feedback batch (on `main`).** Ten items shipped by a 4-person agent team
(CoreDev/RenderDev/UIDev/QA) on the modular `src/`. **Trade works without roads** now — `Pathing.route`
always returns a route (`road:false` off-road fallback) and off-road carts travel at half speed
(`CONFIG.trade.offRoadSpeedMult`), so a road route is 2× faster. **Bug fixed (root cause):**
construction/upgrade material delivery ran *after* production in `Sim.tick`, so a staffed producer ate
imported wood before builds/upgrades could claim it — builds crawled and upgrades looked dead. Delivery
now runs **before** production (construction 60→7 ticks); the building panel also shows an upgrade
progress bar + "waiting on delivery". New: **tile hover tooltip** (terrain name + what's buildable),
**Destroy road / Destroy building** in the build flyout (road no-confirm; building via `uiConfirm`),
**smooth cart interpolation** (glide, no tile-jumping), **internal traders** get a distinct color + show
carried-good icons, **peasant deposits (stone/clay) seed nearer spawn** (`mapgen`), and all UI rate
displays are **per-second** (`window.perSec`, 2 ticks = 1s). Verified: 17/17 pure-core suites (trade
105/0, pathing 28/0 re-baselined to the off-road intent), `--check` OK, editor 95/95, deterministic,
clean headless boot + in-browser feature checks (tooltip, destroy flyout, perSec). Brief:
[`docs/proposals/BATCH2_BRIEF.md`](docs/proposals/BATCH2_BRIEF.md).

**v0.22.0 — New victory + aristocrat-economy balance pass (on `main`).** The win is now **an
Aristocrat's House reaching 100% happiness** (`Victory.check` in `progress.js`, threshold
`CONFIG.victory.aristocratHappiness = 99.5`; castle L5 no longer flips victory — it's a milestone).
100% aristocrat happiness requires the full T3 luxury set (`lamp, mead, iron_armor, chairs, pottery,
brandy, luxury_clothes, gold_ring`), so the win transitively forces the whole top-tier economy — which
was previously **dead content** (aristocrats never spawned, 6/7 T3 luxuries produced nothing). Run by a
4-person agent team (Lead + EconDev + Balance + QA) on the now-modular `src/`. Fixes: aristocrat-home
research regraded off T3 (`bricks/planks`), the home's T3 build cost dropped, slot cap 20→24, manor
housing 4→6, two luxury processors re-tiered to worker labour (breaks the burgher self-lock), margin
repairs, and goldsmith `gold_ring` yield 1→3 (the good is triple-sunk). Measured (greedy 20k
playthrough): **new victory reached at tick ~5431** (was unreachable), all 7 T3 luxuries live, the old
castle-L1 wall gone (L2@850 vs 8500). **17/17 pure-core suites green** (+`victory.test.js`,
`aristocrat_economy.test.js`), determinism bit-identical, build `--check` OK, editor 95/95, clean boot.
**Known follow-up (optional):** post-victory estate happiness *sawtooths* (~56%↔99%) because import
distribution to the aristocrat city is bursty — the win itself latches so this is post-win polish; a
trade-smoothing pass (consumer buffers / cart capacity) would make it a stable plateau. Balance-pass
proposals + frozen contract in [`docs/proposals/`](docs/proposals/).

**v0.21.0 — Research overhaul shipped (on `main`; not yet deployed to gh-pages).** Research is now
**resource-metered, not gold**: a placeable **Research Center** next to the castle (built from
castle-stock materials, no workers, upgradable L1–4 with speeds 2/3/4/6) sets the drain speed;
research is **paused until a center is built**. A node's materials drain **equally** (quantized to
whole game-seconds, floor-cumulative) and advance **atomically** on castle-stock availability. Save
**v2** stepwise migration preserves old saves. UI: map render + placement + upgrade panel, Keep-tab
pipeline rewrite, and a **research progress bar in the Kingdom Overview** (active node + %bar +
per-material consumed/needed). Delivered as 4 slices (Opus A/B, Sonnet C, Opus adversarial review D —
200k-trial drain fuzz, zero over/under-consume, no blockers; 4 minor findings hardened). **14 test
files green** (research 178, buildings 163, ~1,269 asserts). Playtest build published as an Artifact.

Prior shipped (condensed; see git history + [`TASKS.md`](TASKS.md) for the full milestone log):
Phases 1–4 (board, towns+production, trade, progression), Town Interiors, Content Chains v2 (12+
buildings, T3 goods, 4 population tiers peasant→worker→citizen→aristocrat), Terrain & Resources v2,
research-tree overhaul + kingdom resource sidebar, trade fleets, gradual trade transfer,
construction/building logistics, castle-L5 victory + celebratory overlay, and trade/aristocrat
hotfixes. The **research-tree editor** (`tools/research-editor.html`, shipped via Artifact) gained
visual cards (big icons, 2× material chips, no ticks), side-fanning connectors, resizable band panels,
bottom-anchored single-column Kingdom, localStorage autosave + Reset to Default, collapsible help, and
a Peasant-first camera. Each card exposes **8 connection circles** (4 corners + 4 edge mid-points).
Connecting is **click-to-connect**: click a source circle to arm it (highlighted, with a rubber-band
preview), click a destination circle on another card to link — the drawn edge anchors to the exact two
circles clicked; click empty space or press Esc to cancel. The edge-inspector anchor dropdown is also
expanded to those 8 points (+ `auto`). A node's **effect** is edited via dropdown rows (key dropdown +
value input, or a true/false dropdown for flag keys; **+** adds a row, **−** removes with confirmation)
instead of a raw-JSON textarea — keys are the 12 recognized `Research.effect` keys. The effect editor
shows **only for Kingdom cards** (effects are kingdom-only in the game; non-kingdom cards keep
`effect: {}`), and a dedicated **+ Add Kingdom Card** toolbar button creates kingdom nodes. All
destructive confirmations use a **modal-free in-DOM confirm** (`uiConfirm`) instead of native
`confirm()`, which is silently blocked in the Artifact's sandboxed iframe — that was the "Delete card
button doesn't work" bug. The editor now has a headless regression harness (`test/editor.test.js`)
including a sandboxed-iframe case, produced by the QA + Test-Author agent team.

**Research Editor is now in-game.** The start screen has a **🔬 Research Editor** button that opens the
standalone editor in an isolated overlay `<iframe>` (its own document, so its globals don't collide
with the game's). The editor is **bundled into `index.html` at build time** — `tools/build.js` gained
an `ASSETS` step that embeds `tools/research-editor.html` (single source of truth) as a
`RESEARCH_EDITOR_HTML` string via a `/* BUILD:editor-embed */` marker below `PURE_CORE_END`; `--check`
guards drift. Works offline and inside the sandboxed Artifact (blob-URL iframe, no native dialogs).

**Modularization (restructuring pass — FULLY MODULAR: Phase 1 + Phase 2 COMPLETE).** To unlock the
parallel agent-team workflow, the single-file game is split into `src/*.js` modules reassembled by a
**zero-dependency `tools/build.js`** (in-place `/* BUILD:<name> START/END */` marker splice; `build`
/ `--check` / `--extract`). The shipped `index.html` stays one self-contained, offline, zero-dep file
— `src/` is the editable source, `index.html` the committed build output (edit `src` → build → commit
both; `--check` guards drift). **All 33 modules are now extracted** — 16 pure-core (config, rng,
hexmath, mapgen, goods, sim, buildings, pathing, trade, research, research-economy, progress, events,
kingdom-market, ledger, castle-market) + 17 impure-shell (renderer, input, save, mainloop, town-ui,
carts-castle-ui, techtree-ui, progress-ui, kingdom-events-ui, juice, internal-traders, ppe-chatter,
audio, start-screen, editor-overlay, tutorial, version-notes). Only the thin browser-IIFE scaffold
(`(function(){`, `state`, boot tail `})();`) stays inline. Round-trip byte-for-byte (34 regions
spliced incl. the editor asset); verified green: 15/15 pure-core suites, 95/95 editor harness, and a
headless browser smoke (start game → run economy 4× → open tech tree / kingdom / research-editor
overlay) with zero page errors. Plan + per-module map in
[`docs/REFACTOR_PLAN.md`](docs/REFACTOR_PLAN.md). The pure core stays test-covered; the shell is
verified by browser boot (the pure-core suites don't reach it).

**Next (recommended order):**
1. **Balance pass** on the Research Center build/upgrade costs + per-level speeds against real
   playthroughs; wire more research effects into Sim/Trade.
2. **Deploy v0.21.0 to gh-pages** (needs a force-push — the branch diverged during a rollback; get
   author approval).
3. **Stage-3 content:** campaign scenarios + start screen, tutorial-as-onboarding, audio (WebAudio),
   juice (chimney smoke, transaction particles).
4. Optional Stage 4: harbors/water trade, bandits/guards, knights/combat.

Known non-blocking notes: research ETA display can read 1s optimistic (cosmetic; completion is
consumed-gated). Terrain enum as built uses `fertile` (not `field`) — the code is the source of truth.

</details>

## Workflow notes

- One commit per completed task; **update "Current status" above in the same commit.**
- Push after committing. The playable game currently ships via a published **Artifact**; the gh-pages
  mirror is held at the last-good pre-overhaul build until the v0.21.0 deploy is approved.
- Platform: Windows author machine — CRLF warnings from git are expected/harmless.
