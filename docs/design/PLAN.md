# Trade Winds: plan

Updated 2026-10-12 15:30. The plan by milestone, kept in docs/design/plan.json; the Hub's Plan tab and docs/design/PLAN.md are built from it. Do not edit PLAN.md by hand: edit plan.json and run `node tools/plan/build-plan.cjs`.

**24 of 29 tasks done**, 0 in progress, 0 to do, 2 blocked, 3 waiting.

| # | Milestone | Gate | Status | Tasks done |
|---|---|---|---|---|
| M1 | Economy core |  | Done | 3 / 3 |
| M2 | The Kingdom |  | Done | 5 / 5 |
| M3 | Progression |  | Done | 5 / 5 |
| M4 | 1.0 |  | Blocked | 11 / 16 |

**Task status:** Done: built and checked. In progress: an agent is working on it now (see Being worked on now). To do: ready to start, nothing stops it. Blocked: cannot start until something arrives (art, an answer, another task). Waiting: could start, but not a good time yet (the reason is shown).

**Owners:** Claude: the AI team: builds, tests and reports. Mariusz: the owner: decides, supplies art and play-tests.

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
| Done | Rebalance: stop Towns hoarding 100k gold | Town purses now stop at 3,000 / 6,000 / 12,000 / 20,000 gold by level; the residents spend the rest. In the simulated run the richest Town holds 20,000 instead of 128,000, and nothing else changes (Victory time, Crown Gives, happiness). Measurements: docs/guides/balance.md. | Claude |
| Done | Take stays a safety net | You chose to leave Take as it is (2026-10-12): it is there so a player who runs out of gold can keep playing, not as an income. The Tariff stays the main income. | Claude |
| Done | Set the length of a full run | You chose about 4 hours, so the current pace stays: an efficient player wins in about 3 h 40 min. | Claude |
| Done | Tariff fixed at 30%, no slider | You chose a stable 30% Tariff: the Tariff Office research and the slider are removed from the game. | Claude |
| Done | Tariff always exactly 30% | You chose a stable Tariff: the two research nodes that raised it (Tax Ledgers, Grand Bureaucracy) are removed. | Claude |
| Done | Juice: coin bursts, chimney smoke, build bursts | A coin burst and a small +Tariff number when Towns trade, smoke from working chimneys, and a burst when a building or upgrade finishes (you picked this, 2026-10-12). | Claude |
| Done | Soft sounds and an ambient bed | Gentle sounds for placing, trading, finishing buildings and Missions, plus a quiet wind-and-drone background; with a mute switch (you picked this, 2026-10-12). | Claude |
| Done | Town speech bubbles | Towns say what they lack or dream of ("We don't have any Potato!", "We dream of Fish"), a few seconds at a time (you picked this, 2026-10-12). | Claude |
| Done | Title stays "Trade Winds" | You confirmed the title. | Mariusz |
| Waiting | Trader back-haul and sales pressure | Traders carry their home's surplus on the way back, and a seller's price rises a little with each sale, as in the web version. | Claude |
| Waiting | Content editable in the Inspector | Move Goods, buildings, research and Missions from code into assets you can edit in Unity. | Claude |
| Blocked | Play-test with a real mouse | Play a full session in Unity and report anything confusing or broken; all checks so far were scripted. | Mariusz |
| Waiting | Stranger reaches Victory without help | The 1.0 exit test: someone new plays from the start screen to Victory without asking questions. | Mariusz |
