# Team roster and guides (Trade Winds)

The owner's game-dev agent team, mapped onto this game. Designers are **permanent roles that each own a guide**
in this folder (created the first time the role does real work, then kept current). Task specialists are started
for one task and hand back a result. Every agent follows the rules at the bottom.

## Designers

| Role | In Trade Winds | Guide | Status |
|---|---|---|---|
| World designer | Map generation and presets, terrain mix, Deposit distance bands, fog, which research gates what | `world.md` | when map work starts |
| Story designer | No story: becomes the **Mission designer** (the Mission chain, its order, rewards and the final goal, e.g. the Kingdom festival) | `missions.md` | when Missions change |
| Level / overworld designer | Merged into the World designer (the board is procedural; readability of terrain and tokens) | `world.md` | merged |
| Interior / room designer | Not used: the game has no interiors | — | not used |
| Character / creature designer | Not used as such: becomes the **Content designer** (Goods, buildings, production chains, the needs matrix, research tree) | `content.md` | when content changes |
| Art director | One look for hexes, tokens, icons and UI; scale and palette rules for the owner's art | `art.md` | when art arrives |
| In-game art reviewer | How art looks in play: tile seams, token readability at every zoom, layering | `art.md` | when art arrives |
| UI/UX designer | HUD, panels, research tree, start screen; number of clicks for common actions | `ui.md` | next UI pass |
| UI QA reviewer | Every button state, text overflow, mouse and keyboard paths (desktop; no gamepad target) | `ui.md` | next UI pass |
| Balance designer | Economy, prices, Tax and Tariff, purse limits, research costs, run length (about 4 hours) | [`balance.md`](balance.md) | **active** |
| Encounter / content designer | Merged into the Content designer (what Deposits and terrain appear where is the World designer's) | `content.md` | merged |
| AI designer | Trader, Porter and Town buying behaviour; the scripted player (`AutoPlayer`) and simulated playthroughs | `ai.md` | when trade logic changes |
| Writer | Mission names and tips, speech bubbles, building and Good names, UI copy, tone | `writing.md` | next copy pass |
| Onboarding designer | The first hour: Missions as tutorial, tips, the first two Towns | `onboarding.md` | before the stranger test |
| Accessibility reviewer | Text size, colour-blind-safe tokens and charts, key remapping, motion (juice) settings | `accessibility.md` | before 1.0 |
| Playtester | Plays as a new player (scripted runs + the owner's sessions), reports confusion, walls, boredom | `playtest.md` | after each milestone |
| Performance reviewer | Frame rate on Large maps, tick cost, memory, build size | `performance.md` | before 1.0 |
| Code health reviewer | Duplicates, fragile spots, test coverage, tech debt | `code-health.md` | per milestone |

## Task specialists

| Role | In Trade Winds |
|---|---|
| Engine pass | Brings changes into Unity in a background copy, screenshots, smoke test (MCP for Unity), full tour |
| Art importer | Checks the owner's art deliveries, fixes small alignment issues, imports or sends back with exact notes |
| Integrator | Merges branches and worktrees into `main`, keeps the test gate green |
| Feature builder | One system end to end: core data and logic, Unity view, UI, tests |
| Hub builder | The owner Hub (`tools/hub`, `docs/design`) and the plan |
| Release builder | Windows builds, demo builds, packaging |

## Rules for every agent

- Read `docs/design/plan.json` and the owner's decisions (`docs/design/owner-picks-*.json`, GDD §16) first.
- Every agent has its own plan task with a `now` line while it works.
- Owner questions go only to the Hub's Questions tab (`docs/design/questions.json`), with pictures if visual.
- Work in your own branch or a background copy (`git worktree add ../trade-winds-<task> -b <task>`); never in the
  owner's open project. Engine passes that need Unity use a separate copy, not the owner's open Editor.
- Run the test gate before pushing: `dotnet test tools/CoreTests` **and** a Unity compile with zero errors (the
  headless tests do not compile the Unity view and UI code: refresh via MCP for Unity and read the console, or
  run Unity in batch mode on the copy), plus Unity Edit Mode tests on engine passes. Report results plainly,
  including failures.
- Then: merge to `main`, rebuild + republish the Hub, end the report with the Hub link.
