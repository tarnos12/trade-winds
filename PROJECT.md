# PROJECT.md — Project-Specific Instructions (Trade Winds, Unity)

Project detail for the agent team. **For team-running rules (the 3 rules, audit protocol, readiness
gate, hygiene), see [`CLAUDE.md`](CLAUDE.md); for the agent-teams feature mechanics, see
[`AGENT_TEAMS.md`](AGENT_TEAMS.md).** The design authority is [`GDD.md`](GDD.md); this file is its
team-facing distillation. Vocabulary: [`CONTEXT.md`](CONTEXT.md). Decisions: [`docs/adr/`](docs/adr/).

**Keep the "Current status" section current — update it in the same commit as every completed task.**

---

## Goal

**Trade Winds** — a 2D hex-board economy game in the spirit of *Let Them Trade*, being ported from a
finished web prototype (frozen in [`old-game-files/`](old-game-files/)) to Unity. The player founds
autonomous **Towns** that produce, consume and trade on their own; the Crown earns a **Tariff** on
every trade. Cozy, no fail state; **Victory = completing the Mission chain**. The port is
*port-and-rethink*: the web code is a behavioural reference, not a parity target.

## Stack & structure

- **Unity 6000.3.12f1**, 2D URP, C#, Input System, UI Toolkit. Target: Windows standalone.
- **MCP for Unity** (`com.coplaydev.unity-mcp`) drives the open Editor; `.mcp.json` registers it.
  Several Unity projects share the MCP server — target instance `trade-winds@…` (`set_active_instance`).
- Planned layout (create as each module lands):

| Module | Path | Assembly | Owns |
|---|---|---|---|
| Sim core | `Assets/TradeWinds/Core/` | `TradeWinds.Core` (*no engine references*) | Hex math, map gen, Towns, needs, prices, pathing, Traders, Tariff, research, Missions, save model |
| Core tests | `Assets/TradeWinds/Core.Tests/` | `TradeWinds.Core.Tests` (Edit Mode) | Headless deterministic tests |
| Data | `Assets/TradeWinds/Data/` | `TradeWinds.Data` | ScriptableObject definitions (Goods, buildings, tiers, Missions) → plain core data |
| Game view | `Assets/TradeWinds/Game/` | `TradeWinds.Game` | MonoBehaviours: tick driver, Tilemap board, camera, input, Trader visuals |
| UI | `Assets/TradeWinds/UI/` | `TradeWinds.UI` | UI Toolkit panels/HUD (UXML/USS + controllers) |
| Editor tools | `Assets/TradeWinds/Editor/` | `TradeWinds.Editor` | Headless balance runner, data tooling |
| Art | `Assets/TradeWinds/Art/` | — | Placeholder sprites until author art arrives |

## Hard constraints

- **`TradeWinds.Core` never references `UnityEngine`** — no `Time`, `Random`, `Debug`, MonoBehaviour.
  Seeded RNG only; deterministic for a given seed + inputs. (ADR 0002)
- **Fixed 500 ms × speed tick** (2 ticks = 1 game-second); visuals interpolate; pause on focus loss
  (setting, default on).
- **No magic balance numbers in logic** — they come from data (ScriptableObjects → core data).
- **GameObjects never own sim state**; the view reads the core.
- **Saves are versioned** (start at 1) with stepwise migration; web saves are not imported.
- **Use the `CONTEXT.md` vocabulary** in code, UI copy and docs (Town, Trader, Good, Stock, Tariff…).
- Grow content **one Population Tier at a time**; balance each before adding the next.

## Team model

The Unity layout is multi-assembly, so modules map to ownership boundaries (Core / Data / Game / UI /
Editor). Core is the hot module early on — serialize edits to it until its interfaces settle; Game
and UI work can then run in parallel against those interfaces. The lead integrates into `main` via
PRs and merges them itself after tests pass.

## Instantiated roster

| Role | Model | Owns |
|---|---|---|
| **Lead / Integrator** | Opus | Interfaces between Core/Data/Game/UI, integration, PR merges |
| **Sim / Economy Dev** | Opus | `TradeWinds.Core` + its tests |
| **Game View Dev** | Sonnet | `TradeWinds.Game` (board, camera, input, Trader visuals) |
| **UI Dev** | Sonnet | `TradeWinds.UI` |
| **Balance / Design** | Fable | Data assets, tuning, playtest-for-feel |
| **Test Author** | Sonnet | Edit Mode / Play Mode tests |
| **QA / Verification** | Opus | Gates milestone exits against GDD |
| **Tools** *(subagent)* | Sonnet | `TradeWinds.Editor` balance runner |

## Milestone exit criteria (QA gates each against GDD.md §4)

- **M1 — Economy core 🔜** a potato Town and a timber Town trade Potato ↔ Wood unattended, Tariff
  accrues, cutting the road causes a visible price crisis; Core covered by Edit Mode tests.
- **M2 — The Kingdom** Castle + Castle Stock + market, Porters, fog/scouts, save/load, Worker tier;
  a two-tier Kingdom grows unattended without stalling.
- **M3 — Progression** research + Research Center, Missions, Burgher + Aristocrat tiers, start
  screen, tutorial; deterministic test reaches Victory.
- **M4 — 1.0** author art, balance, polish; a stranger reaches Victory without questions.

## How to run / verify

- Open the project in Unity 6000.3.12f1 (or drive the open Editor via MCP for Unity).
- Tests: Unity Test Runner → Edit Mode (or MCP `run_tests`).

---

## Current status (update every commit)

- **2026-10-04** — Web game archived to `old-game-files/`; empty Unity 2D URP project with MCP for
  Unity committed. Design grilled and recorded: `GDD.md` rewritten for the port, `CONTEXT.md`
  glossary, ADR 0001 (Unity desktop port), ADR 0002 (pure C# sim core). **Next: Milestone 1 step 1
  — headless `TradeWinds.Core` with tests.**
