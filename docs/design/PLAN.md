# Trade Winds: plan

Updated 2026-10-12 16:00. The plan by milestone, kept in docs/design/plan.json; the Hub's Plan tab and docs/design/PLAN.md are built from it. Do not edit PLAN.md by hand: edit plan.json and run `node tools/plan/build-plan.cjs`.

**33 of 41 tasks done**, 0 in progress, 2 to do, 2 blocked, 4 waiting.

| # | Milestone | Gate | Status | Tasks done |
|---|---|---|---|---|
| M1 | Economy core |  | Done | 3 / 3 |
| M2 | The Kingdom |  | Done | 5 / 5 |
| M3 | Progression |  | Done | 5 / 5 |
| M4 | 1.0 |  | Blocked | 20 / 28 |

**Task status:** Done: built and checked. In progress: an agent is working on it now (see Being worked on now). To do: ready to start, nothing stops it. Blocked: cannot start until something arrives (art, an answer, another task). Waiting: could start, but not a good time yet (the reason is shown).

**Owners:** Claude: the AI team: builds, tests and reports. Mariusz: the owner: decides, supplies art and play-tests. Art AI: the art AI (ChatGPT image generation): draws what docs/art/ASSETS_NEEDED.md asks for, via the shared Drive folder.

## M1: Economy core. Done

Prove the heart of the game: Towns that grow when their needs are met and trade with each other on their own, with the Crown earning a Tariff on every trade.

**Exit:** A potato Town and a timber Town trade Potato and Wood unattended, fill their houses and pay the Crown Tariff; a road between them speeds trade; checked by a test.

| Status | Task | Detail | Owner |
|---|---|---|---|
| Done | Simulation core with tests | The economy runs on its own, outside Unity, so it can be tested and sped up: Towns, Peasants, Porters, prices, Traders and the Tariff. | Claude |
| Done | Hex board on screen | A seeded hex map you can pan and zoom, with Towns, buildings, Traders and Porters drawn on it. | Claude |
| Done | Two Towns trade on their own | A potato Town and a timber Town fill their houses by trading, and the Crown earns Tariff. Checked by a test. | Claude |

## M2: The Kingdom. Done

Give the economy a home and a horizon: the Castle with its own market, unexplored land to discover, Towns that level up, and a second class of residents.

**Exit:** A two-tier Kingdom grows unattended without stalling, and a saved realm continues exactly where it was.

| Status | Task | Detail | Owner |
|---|---|---|---|
| Done | Castle and royal market | The Castle holds the treasury and its own Stock; the King can buy and sell Goods, and royal Traders fetch research materials. | Claude |
| Done | Fog of war and Scouts | Only the land around the Castle is known at the start; Scouts reveal more and spend provisions from the Provisioner. | Claude |
| Done | Save and load | The realm saves every 30 seconds and when the game closes; Continue on the start screen picks it up exactly where it was. | Claude |
| Done | Town levels, Give and Take, upgrades | Towns level up for more slots and Traders; the Crown can move gold in or out; buildings upgrade after research. | Claude |
| Done | Worker tier | Cottages, Workers and their chains (fish, coal, clothes, bread, mead). | Claude |

## M3: Progression. Done

Turn the sandbox into a game with a goal: research that opens new chains, the Burgher and Aristocrat classes, and a chain of Missions that teaches the game and ends in Victory.

**Exit:** A run from the start screen completes every Mission (Victory), shown by a scripted run that wins in about 220 game-minutes.

| Status | Task | Detail | Owner |
|---|---|---|---|
| Done | Research and Research Center | 51 research nodes in five bands, paid in Goods from the Castle Stock at the Research Center's speed. | Claude |
| Done | Mission chain and Victory | Nine Missions that teach the game and pay gold; finishing the last one (Aristocrats at 100% happiness) wins. | Claude |
| Done | Burgher and Aristocrat tiers | Manors, Aristocrats Homes and the luxury chains they need. | Claude |
| Done | Start screen, panels, research tree | Seed and map size, Town and Castle panels, the research tree, Event Log and victory card. | Claude |
| Done | Scripted Kingdom reaches Victory | A scripted player wins in about 220 game-minutes; the same run powers the balance tool in the editor. | Claude |

## M4: 1.0. Blocked

Make it a finished game: real art, the balance answers you choose, the extras you want back, and a play-test by someone who has never seen it.

**Exit:** Feature-complete and balanced with no known blocking issues, and a stranger reaches Victory without asking questions.

| Status | Task | Detail | Owner |
|---|---|---|---|
| Done | Owner Hub | One page for game data, charts, the plan and every open question, rebuilt from the project files. | Claude |
| Done | Adopt the game-dev agent team | Your roster is mapped onto Trade Winds in docs/guides/README.md: which designers apply (and which are merged or not used), each one's guide, the task specialists, and the working rules. | Claude |
| Blocked | Final art | Replace the code-drawn placeholder hexes, tokens and icons with real art. | Mariusz |
| Done | Terrain tiles from your sheet | Your terrain sheet is in the game: Barren, Clay, Desert, Fertile, Snow (2 looks) and Forest (3 looks) hexes; water in 3 depths by distance from land, animated, with fish shoals; Gold, Stone (2 looks), Coal and Iron Deposits drawn on the ground; Castle and Hut sprites. Mountains have no art yet (grey hex). | Claude |
| Done | Art pipeline with the art AI | The shared Drive folder AI files/Trade Winds now holds the request document (ASSETS_NEEDED.md), a handoff file for the art AI, and reference pictures (your terrain sheet, the exact hex shape, its 76 colours, two screenshots). A checker lists new deliveries; every delivery is logged in docs/art/deliveries.md. | Claude |
| Waiting | Mountains art (request section 1) | Two looks of a mountain hex in the sheet style, darker than every other terrain so it reads as impassable. | Art AI |
| Waiting | Building sample: Town centre, Lumberjack, Potato Farm (section 2a) | Three buildings plus a Town flag the game colours per Town, so you can judge the look before all 34 are drawn. | Art AI |
| Done | Rebalance: stop Towns hoarding 100k gold | Town purses now stop at 3,000 / 6,000 / 12,000 / 20,000 gold by level; the residents spend the rest. In the simulated run the richest Town holds 20,000 instead of 128,000, and nothing else changes (Victory time, Crown Gives, happiness). Measurements: docs/guides/balance.md. | Claude |
| Done | Take stays a safety net | You chose to leave Take as it is (2026-10-12): it is there so a player who runs out of gold can keep playing, not as an income. The Tariff stays the main income. | Claude |
| Done | Set the length of a full run | You chose about 4 hours, so the current pace stays: an efficient player wins in about 3 h 40 min. | Claude |
| Done | Tariff fixed at 30%, no slider | You chose a stable 30% Tariff: the Tariff Office research and the slider are removed from the game. | Claude |
| Done | Tariff always exactly 30% | You chose a stable Tariff: the two research nodes that raised it (Tax Ledgers, Grand Bureaucracy) are removed. | Claude |
| Done | Juice: coin bursts, chimney smoke, build bursts | A coin burst and a small +Tariff number when Towns trade, smoke from working chimneys, and a burst when a building or upgrade finishes (you picked this, 2026-10-12). | Claude |
| Done | Soft sounds and an ambient bed | Gentle sounds for placing, trading, finishing buildings and Missions, plus a quiet wind-and-drone background; with a mute switch (you picked this, 2026-10-12). | Claude |
| Done | Town speech bubbles | Towns say what they lack or dream of ("We don't have any Potato!", "We dream of Fish"), a few seconds at a time (you picked this, 2026-10-12). | Claude |
| Done | Title stays "Trade Winds" | You confirmed the title. | Mariusz |
| Done | Trader back-haul and sales pressure | Traders heading out to buy also carry their home's surplus and sell it to the Town they visit; each sale lifts the seller's price a little (up to 1.35×) and unsold Goods slowly get cheaper (down to 0.75×). In the simulated run Victory now comes at 163 game-minutes instead of 187. | Claude |
| Waiting | Content editable in the Inspector | Move Goods, buildings, research and Missions from code into assets you can edit in Unity. | Claude |
| Blocked | Play-test with a real mouse | Play a full session in Unity and report anything confusing or broken; all checks so far were scripted. | Mariusz |
| Waiting | Stranger reaches Victory without help | The 1.0 exit test: someone new plays from the start screen to Victory without asking questions. | Mariusz |
| Done | Windows build you can play | Built: D:WORKUnity	rade-winds-buildsTradeWinds-latestTrade Winds.exe (about 100 MB). Rebuild any time with the menu Trade Winds → Build Windows Player. | Claude |
| Done | Code health review | Findings in docs/guides/code-health.md: 9 bugs (mostly save/load), numbers that belong in Balance, duplicated trade code, test gaps. They became the tasks below. | Claude |
| Done | UI and onboarding review | Findings in docs/guides/onboarding.md: Mission 6 hides its prerequisites, tips point at things the player can't do yet, toasts hidden behind the research panel, wording that breaks the glossary. They became the tasks below. | Claude |
| Done | Fix save and determinism bugs | Fixed: routes refresh after a Town is founded or abandoned, saves survive content changes, unknown research is dropped on load, Goods are no longer lost when an upgrade is cancelled, royal Traders forget abandoned Towns, and the Balance asset now holds the purse limits and trade settings. | Claude |
| Done | First-hour onboarding fixes | Mission tips now say exactly what to do (Mission 6 asks for 2 Cottages and explains Quarry, Stone, Fish, Coal and Scouts); picking a research queues its missing steps first and says so; a greyed-out button says why when clicked; messages stay on top of the research tree; after founding a Town the build bar jumps to the Peasant tab; empty Towns and missing materials say how to fix them. | Claude |
| Done | Words and terms pass | Refusals and labels use the glossary (Trader Packs, Extra Trader, Tariff earned for the Crown, Basic Needs, Luxuries, Deposit) and say how to fix the problem. Building tags on the map are now unique (Co, Ca, Mi, Ma...) until real icons arrive. | Claude |
| To do | Kingdom Overview and Goods strip | The HUD parts from the design that are still missing: which Town makes and lacks what, at a glance, plus alert icons. | Claude |
| To do | Code cleanup: numbers into Balance, shared trade code | Move hard-coded numbers into the Balance asset, merge the duplicated trade code, add the missing tests. | Claude |
