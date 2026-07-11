# CLAUDE.md — Operating Manual (Agent-Team Orchestrator Guide)

Project-agnostic guide for the **lead (orchestrator)** session: it governs *how*
work is run, never *what* is built. Claude Code auto-loads a **repo-root**
`CLAUDE.md` as standing instructions every session — that is why this file lives
at the root and README does not (README is not auto-loaded).

**Companion docs (all at the repo root):**
- **`PROJECT.md`** — everything project-specific (goal, stack, constraints,
  module→ownership map, roster, milestone exit criteria). Generated **once** from
  the project's `GDD.md` at first session; not regenerated unless the author
  asks. Example shape:
  <https://github.com/tarnos12/claude-rules/blob/master/templates/PROJECT.md>.
- **[`AGENT_TEAMS.md`](AGENT_TEAMS.md)** — the Claude Code agent-teams *feature*
  reference (enabling, inter-agent messaging, the shared task list, limits).
  This file is the *methodology*; that one is the *mechanics*.
- **`.claude/settings.json`** — enables agent teams for every session
  (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
- **`GDD.md`** — the author-written design authority `PROJECT.md` is distilled from.

---

## ⚠️ THE 3 RULES — non-negotiable, apply to every teammate

1. **Own territory** — each agent owns its own file(s) and deliverables; it may send work and
   communicate, but only ever *edits its own* files (module boundary = ownership boundary).
2. **Direct messaging** — teammates message each other directly for dependencies; do not route
   every exchange through the lead.
3. **Parallel work** — teammates work simultaneously and react to each other throughout. If the
   work is purely sequential hand-offs (1→2→3), it is **not** an agent team — use subagents.

These three govern every spawn, assignment, and message. Details below.

---

## Project specifics live in `PROJECT.md`

Everything particular to the repo — goal, design authority, stack, directory layout, hard
constraints, the instantiated roster, and milestone exit criteria — lives in **`PROJECT.md`**, not
here. Read it before the audit so you know what the project is and what "done" means. Teammates wake
with **no** conversation history, so `PROJECT.md` (plus the state-of-project summary you write) is
the shared context they build on.

**Generating `PROJECT.md` (once):** if `PROJECT.md` is **missing**, generate it a single time at
session start by distilling the project's design authority (`GDD.md`) — its goal, stack, hard
constraints, module→ownership map, instantiated roster, and milestone exit criteria. Model the shape
on the [`templates/PROJECT.md`](https://github.com/tarnos12/claude-rules/blob/master/templates/PROJECT.md)
example. **Once `PROJECT.md` exists in the repo, do NOT regenerate it** on later sessions — treat the
committed file as the source of truth and edit it in place only when the author explicitly asks.
(`GDD.md` is authored by the author; `PROJECT.md` is the team-facing distillation of it, regenerated
only on request.)

---

## THIS IS AN EXISTING PROJECT — audit before you assign

Assume **not greenfield**. The lead's first job is not to build; it is to understand what already
exists. **Do not spawn a single teammate until the audit is complete.**

### 1. Audit protocol (do this yourself, first)
1. Read the current source tree. Map which modules exist and what is stubbed vs. functional.
2. Build/run the project and observe what actually works. Cross-reference against the design
   authority to determine **what is done, what is in progress, and what specifically remains**.
3. Read any shared config/constants files to learn the current surface. Read existing tests for
   coverage.
4. Check version control / recent changes; note WIP and known-broken areas.
5. Write a short **state-of-project summary** (current status, working parts, gaps, risks) to a
   shared doc all teammates can read.
6. Drop any large/relevant reference docs (framework, MCP, this guide's linked docs) as local
   markdown in `/docs` so the team can consult them without re-fetching.

### 2. Readiness gate (after the audit, before the full team)
Judge whether the codebase is **team-ready**: modules map cleanly to boundaries, each is separately
ownable, shared/global files are genuinely isolated, project constraints are intact, and files don't
cross-cut in ways that force two teammates to edit the same file.

- **If team-ready:** proceed to spawn the live team against remaining work.
- **If NOT team-ready:** run a **restructuring pass first** with a small temporary team (2–4):
  - Scope = **shape only**. Carve code onto clean boundaries, hoist stray constants into their
    designated home, remove constraint violations, define each module's exposed interface.
    **No new features.**
  - Temp roster: a **Refactor Architect** (Opus, owns target module map + interfaces),
    1–2 **Refactor Devs** (Sonnet, move code without changing behavior),
    **QA/Verification** (Opus, confirms behavior is *identical* before/after). Have the Test Author
    write **characterization tests** first as the regression net.
  - Work in an isolated branch/worktree. Merge only when QA confirms behavioral equivalence and the
    boundaries are clean.
  - **Disband the temp team**, update the state-of-project summary to describe the new structure,
    then spawn the proper build team.
  - Exit criterion: *"same behavior, clean seams, characterization tests green."*

**Lead decision flow:** audit → readiness gate → (optional restructure team → verify → disband) →
build team → build to next milestone → QA sign-off.

---

## The 3 key rules (detail)
1. **Own territory.** Each agent owns its own file(s) and deliverables. Teammates may send work and
   communicate, but each only *edits its own* files (module/directory boundary = ownership).
2. **Direct messaging.** Teammates message each other directly for dependencies — no routing every
   exchange through the lead. (Mechanics: [`AGENT_TEAMS.md`](AGENT_TEAMS.md).)
3. **Parallel work.** Teammates work simultaneously and react to each other throughout. If work is
   purely sequential hand-offs (1→2→3), it is **not** an agent team — use subagents.

## Dos and don'ts
- **Do** give each agent specific file ownership. **Don't** let two agents share/overwrite a file.
- **Do** define concrete deliverables. **Don't** use vague outputs.
- **Do** name recipients explicitly (who messages whom). **Don't** assume they'll infer it.
- **Do** keep the **live team at 3–5**. **Don't** run 10+ swarms (each agent ≈ 1× more cost).
- **Do** give full context in every spawn prompt — teammates inherit **no** conversation history.

## Team hygiene
- Teammates inherit the lead's **permissions**, and can access all project **files, MCP servers,
  and skills**. Preapprove common tools/bash commands in local settings so teammates don't stall on
  prompts.
- Use **plan-approval mode** for risky work (restructures especially): teammates plan first, and the
  lead (or a dedicated plan-reviewer teammate) approves before execution.
- Have teammates persist intermediate work to **temp files** so nothing is lost between hand-offs.
- **Shutdown = save cleanly.** On a shutdown request a teammate may say "not done, let me save."
  Only shut down once teammates confirm; never force-kill mid-work.

## Model selection
Match reasoning tier to task difficulty:
- **Opus** — hard, cross-cutting, or emergent work where a subtle mistake is expensive (lead,
  hardest subsystem, QA/verification).
- **Sonnet** — solid feature implementation and test authoring (most domain teammates).
- **Haiku** — mechanical, high-volume, low-reasoning work (asset/data wrangling, config plumbing).
- **Fable** — creative or writing-heavy work (content, copy, narrative, design feel).

---

## Roster (a BENCH, not a standing team)

Generic archetypes — instantiate per project against the actual modules. Spawn only the **3–5** the
current milestone needs at once. Roles marked *(subagent)* are usually focused subagents spawned by
the relevant teammate: they hand off an artifact and don't need parallel back-and-forth.

| Archetype | Model | Owns / does | Talks to |
|---|---|---|---|
| **Lead / Integrator & Architect** | Opus | Module interfaces, sequencing, integration passes. The hub. | everyone |
| **Domain Dev(s)** | Sonnet | One module/feature area each; own separate files | adjacent domains, QA |
| **Hard-Problem Dev** | Opus | The most complex / emergent subsystem in the project | related domains, QA |
| **Shared-Standard Owner** | Fable/Sonnet | **Sole writer** of the shared config/constants/schema file | every dev, QA |
| **Test Author** | Sonnet | Unit, integration, and regression/characterization tests | every dev, QA |
| **QA / Verification** | Opus | The adversary: runs suite, hunts failures, verifies fixes, gates milestone exits | Lead, Test Author, any dev |
| **Persistence / Infra** *(subagent)* | Sonnet | Save/schema/migration, build/CI plumbing | contributing modules |
| **Asset / Data Pipeline** *(subagent)* | Haiku | Assets, data tables, mapping docs, mechanical plumbing | relevant devs |

**Shared-file rule:** any shared/global file (config, constants, schema, shared types) has **one
designated owner** — everyone else requests a change rather than editing it. This keeps the single
most-touched file from becoming the main merge-conflict point.

### Game-dev discipline bench (optional expansion)

For **game projects**, instantiate from this expanded bench in addition to the generic archetypes
above (ignore this table for non-game projects). Each row is still an *archetype* — map it to the
actual module and pick the model by task difficulty. Keep the live team at 3–5 per milestone — this
is a menu, not a headcount.

| Discipline | Model | Owns / does | Talks to |
|---|---|---|---|
| **Gameplay AI** | Opus | Agent behavior, pathfinding, decision-making, steering, task/utility selection | World/Sim, Systems, QA |
| **Graphics / Rendering** | Sonnet | Render pipeline, layers/compositing, sprites/atlases or shaders, camera, animation, culling | World, Gameplay, UI, Asset |
| **World / Procedural Generation** | Sonnet (Opus if complex) | World/level/terrain generation, seeding, biomes, spawn placement, chunking | Rendering, Sim, Systems |
| **Simulation / Physics** | Opus/Sonnet | Movement, collision, gravity, fluids/particles, tick loop, determinism, LOD | Gameplay AI, World, Perf |
| **Gameplay Systems / Mechanics** | Sonnet | Rules and progression: crafting, economy, inventory, combat, quests, scoring | Gameplay AI, UI, Balance |
| **Audio** | Sonnet (Fable for creative sound/music design) | Event-driven SFX + music hooks, audio bus/mixing, ambience triggers | Systems, Gameplay, UI |
| **UI / UX / HUD** | Sonnet | Menus, HUD, panels, input handling, player-facing controls and feedback | every gameplay owner, Rendering |
| **Performance / Optimization** | Opus | Profiling, frame/tick budgets, memory, hot-path tuning, load management | Rendering, Sim, Gameplay AI |
| **Tools / Build / Infra** *(subagent)* | Sonnet | Build/CI, editor tooling, data pipelines, packaging, save/schema/migration | contributing modules |
| **Content / Asset Pipeline** *(subagent)* | Haiku | Art/audio imports, data tables, mapping docs, license credits, mechanical plumbing | Rendering, Audio, Systems |
| **Level / Encounter Design & Balance** | Fable | Tuning tables, difficulty curves, encounter/level layout, playtesting for feel | Systems, Gameplay AI, QA |
| **Narrative / Content Writing** | Fable | Story, dialogue, item/flavor text, tutorials, in-world copy | Systems, UI, Design |
| **Netcode / Multiplayer** *(if applicable)* | Opus | Netcode, state sync, prediction/rollback, lobby/session, anti-cheat | Sim, Gameplay, Systems |

Standard **Test Author** (Sonnet) and **QA / Verification** (Opus) apply to game projects unchanged.

---

## General working rules (apply on every project, team or solo)

- **Git & committing.** Commit after every completed task — one task = one focused, well-described
  commit; push after committing. Land each completed task as a **PR** and merge it once tested. If
  on the default branch and the change is substantial, branch first. `git fetch` and check the base
  before starting (other sessions may share the repo).
- **Session continuity.** Keep the project's current state where it belongs — `PROJECT.md` or a
  dedicated status doc it points to — and **update it in the SAME commit as the code change**, so any
  session (a different Claude instance, a cloud agent, or the author weeks later) can resume cold.
- **Verify before claiming done.** Actually run the code / exercise the change and check behavior;
  report failures honestly with real output. Prefer the fastest feedback loop that proves it
  (headless test over driving the full app). After a change, tell the author **how to see it
  running** and include a link (deployed URL or a published Artifact — a dev-server localhost a
  remote session can't reach is not enough). Bump any cache-busting version tag on a code change.
- **Style.** Direct, outcome first. Loop the author in on load-bearing findings and direction
  changes; don't narrate every step. For a multi-part task, do the whole thing rather than stopping
  to ask permission for each reversible step.

---

## Deliverable

Whatever the current milestone requires, advanced to its **next exit criterion** and **verified by
QA against the design authority** before it is called done. Define each milestone's exit criterion
explicitly (a concrete, checkable outcome) so QA has a clear gate to sign off against.
