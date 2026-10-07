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
- Layout (as built):

| Module | Path | Assembly | Owns |
|---|---|---|---|
| Sim core | `Assets/TradeWinds/Core/` | `TradeWinds.Core` (*no engine references*) | Hex math, map gen, Towns, needs, prices, pathing, Traders, Tariff, research, Missions, save model |
| Core tests | `Assets/TradeWinds/Core.Tests/` | `TradeWinds.Core.Tests` (Edit Mode) | Headless deterministic tests |
| Content | `Assets/TradeWinds/Core/GameContent.cs` | `TradeWinds.Core` | Goods, buildings, tiers, research, Missions (C# data) |
| Balance data | `Assets/TradeWinds/Data/Balance.asset` | `TradeWinds.Game` (`BalanceAsset`) | Inspector-editable tuning numbers → copied into the core per realm |
| Game view | `Assets/TradeWinds/Game/` | `TradeWinds.Game` | Tick driver + saves (`GameController`), Tilemap board/fog/tokens (`BoardView`), camera, input |
| UI | `Assets/TradeWinds/Game/Hud.cs`, `Game/UI/` | `TradeWinds.Game` | UI Toolkit HUD built in code (Town/Castle/research panels, start screen) |
| Editor tools | `Assets/TradeWinds/Editor/` | `TradeWinds.Editor` | Scene builder, headless balance runner |
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

- **M1 — Economy core ✅** (Peasant tier, Porters as real logistics) a potato Town and a timber Town trade Potato ↔ Wood unattended, Tariff
  accrues (no road needed); a road between them visibly speeds trade and narrows the price gap,
  removing it widens the gap again; Core covered by Edit Mode tests.
- **M2 — The Kingdom ✅** Castle + Castle market, fog/Scouts/provisions, save/load, Town levels, Worker tier;
  a two-tier Kingdom grows unattended without stalling.
- **M3 — Progression ✅** research + Research Center, Missions, Burgher + Aristocrat tiers, start
  screen, tutorial; deterministic test reaches Victory.
- **M4 — 1.0 🔜** author art, balance, polish; a stranger reaches Victory without questions.

## How to run / verify

- Open the project in Unity 6000.3.12f1 (or drive the open Editor via MCP for Unity).
- Play: open `Assets/TradeWinds/Scenes/Game.unity` → Play (start screen → New realm / Continue).
  Rebuild the scene any time with **Trade Winds → Build Game Scene**.
- Tests: Unity Test Runner → Edit Mode (or MCP `run_tests`), or headless `dotnet test tools/CoreTests`.
- Balance: **Trade Winds → Run Balance Simulation** plays the benchmark Kingdom (`BenchmarkKingdom`)
  with the current `Data/Balance.asset` and logs progress to the Console.
- Saves: `%USERPROFILE%/AppData/LocalLow/Tarnos/Trade Winds/trade-winds-save.json` (autosave 30 s).

---

## Current status (update every commit)

- **2026-10-04** — Web game archived to `old-game-files/`; empty Unity 2D URP project with MCP for
  Unity committed. Design grilled and recorded: `GDD.md` rewritten for the port, `CONTEXT.md`
  glossary, ADR 0001 (Unity desktop port), ADR 0002 (pure C# sim core). GDD then rebuilt from a full read of the web code + docs (§13 known problems, §14 cut list, §16 open questions). **Next: Milestone 1 step 1
  — headless `TradeWinds.Core` with tests.**
- **2026-10-06** — M1 step 1 in progress: `TradeWinds.Core` (hex board, Towns, Peasant tier, real Porters,
  production, needs/happiness/population, Tax, prices, Traders with optional roads, Tariff) + 19 tests green
  headless (`dotnet test tools/CoreTests`). Two specialised Towns trade unattended and fill their houses.
  Findings: road effect on price gap is small at this scale; Tariff ≈ 16/min vs Tax ≈ 140/min (GDD §13).
  **Next: M1 step 2 — hex Tilemap board + Town/Trader view in the scene.**
- **2026-10-06** — **M1 step 2: playable in Unity.** Open `Assets/TradeWinds/Scenes/Game.unity` → Play.
  Seeded 50×25 hex map (`MapGen`), hex Tilemap board, Town/building tokens, Traders following real
  routes, Porters walking to buildings, camera (right-drag/WASD/wheel), UI Toolkit HUD (treasury +
  Tariff/min, speeds, goal checklist, build bar, hover hints, Town panel). Scene is generated by
  menu **Trade Winds → Build Game Scene** (`GameSceneBuilder`). 23 Edit Mode tests green in Unity.
  Placeholder art is code-generated. **Next:** play-test M1 exit in the scene, then M2 (Castle,
  Castle market, fog/Scouts, save/load, Town levels, Worker tier).
- **2026-10-07** — **M2 + M3 done: playable from start screen to Victory.** Full catalogue (26 Goods,
  4 tiers, ~33 buildings, research tree, 9 Missions with gold rewards); Castle + Castle Stock + royal
  market and Traders; fog of war, Scouts, provisions; Town levels; Give/Take; upgrades; destroy;
  versioned save/load + autosave; ore deposits in MapGen; full HUD (start screen, Missions, Event Log,
  tiered build bar, Town/Castle panels, research tree, victory card). Scripted benchmark Kingdom
  reaches Victory in ~220 game-minutes (test + editor balance runner). Balance runs forced trade fixes
  (GDD §8). 38 Edit Mode tests green in Unity and headless. **Next (M4):** author art, audio/juice
  decision, balance answers (GDD §16 Q3–Q4), play-testing by a stranger.
