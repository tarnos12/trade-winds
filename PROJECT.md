# PROJECT.md — Project-Specific Instructions (Trade Winds)

Project detail for the agent team. **For team-running rules (the 3 rules, audit protocol, readiness
gate, hygiene), see [`CLAUDE.md`](CLAUDE.md); for the agent-teams feature mechanics, see
[`AGENT_TEAMS.md`](AGENT_TEAMS.md).** This file holds *what* is built; CLAUDE.md holds *how* the team
operates. The design authority is [`GDD.md`](GDD.md); this file is its team-facing distillation.

**Keep the "Current status" section current — update it in the same commit as every completed task.**

---

## Goal

**Trade Winds** — a browser, single-file 2D economy game in the spirit of *Let Them Trade*. You build
a network of **autonomous towns** on a hex board; they produce, consume, and trade with each other on
their own. You shape the conditions (town placement, production buildings, roads) and earn a **tariff**
on every inter-town transaction, spending it to upgrade the King's castle. Core loop: **observe the
market → build/upgrade → towns trade themselves → earn tariff → invest (research, castle, new towns)**.

Cozy, no fail state in sandbox; **win = castle level 5** (+ a planned scenario campaign). Full scope,
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
a Peasant-first camera.

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

## Workflow notes

- One commit per completed task; **update "Current status" above in the same commit.**
- Push after committing. The playable game currently ships via a published **Artifact**; the gh-pages
  mirror is held at the last-good pre-overhaul build until the v0.21.0 deploy is approved.
- Platform: Windows author machine — CRLF warnings from git are expected/harmless.
