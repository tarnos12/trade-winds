# Plan

Generated from `tools/hub/plan.json` (updated 2026-10-12 11:00). Do not edit by hand.

## M1 · Economy core (3/3 done)

- **[done]** Simulation core with tests — The economy runs on its own, outside Unity, so it can be tested and sped up: Towns, Peasants, Porters, prices, Traders and the Tariff. (Claude)
- **[done]** Hex board on screen — A seeded hex map you can pan and zoom, with Towns, buildings, Traders and Porters drawn on it. (Claude)
- **[done]** Two Towns trade on their own — A potato Town and a timber Town fill their houses by trading, and the Crown earns Tariff. Checked by a test. (Claude)

## M2 · The Kingdom (5/5 done)

- **[done]** Castle and royal market — The Castle holds the treasury and its own Stock; the King can buy and sell Goods, and royal Traders fetch research materials. (Claude)
- **[done]** Fog of war and Scouts — Only the land around the Castle is known at the start; Scouts reveal more and spend provisions from the Provisioner. (Claude)
- **[done]** Save and load — The realm saves every 30 seconds and when the game closes; Continue on the start screen picks it up exactly where it was. (Claude)
- **[done]** Town levels, Give and Take, upgrades — Towns level up for more slots and Traders; the Crown can move gold in or out; buildings upgrade after research. (Claude)
- **[done]** Worker tier — Cottages, Workers and their chains (fish, coal, clothes, bread, mead). (Claude)

## M3 · Progression (5/5 done)

- **[done]** Research and Research Center — 51 research nodes in five bands, paid in Goods from the Castle Stock at the Research Center's speed. (Claude)
- **[done]** Mission chain and Victory — Nine Missions that teach the game and pay gold; finishing the last one (Aristocrats at 100% happiness) wins. (Claude)
- **[done]** Burgher and Aristocrat tiers — Manors, Aristocrats Homes and the luxury chains they need. (Claude)
- **[done]** Start screen, panels, research tree — Seed and map size, Town and Castle panels, the research tree, Event Log and victory card. (Claude)
- **[done]** Scripted Kingdom reaches Victory — A scripted player wins in about 220 game-minutes; the same run powers the balance tool in the editor. (Claude)

## M4 · 1.0 (1/9 done)

- **[done]** Owner Hub — This page: game data, charts, the plan and every open question in one place, rebuilt from the repository. (Claude)
- **[blocked]** Final art — Replace the code-drawn placeholder hexes, tokens and icons with real art. _Why: Waiting for art from Mariusz_ (Mariusz)
- **[blocked]** Fix rich exporting Towns — Late in the game exporting Towns hold 100k+ gold, so Take out-earns the Tariff. Pick a fix in Questions. _Why: Owner answer: rich_exporters_ (Claude)
- **[blocked]** Set the length of a full run — Tune costs and rates so a run to Victory lasts as long as you want. _Why: Owner answer: run_length_ (Claude)
- **[blocked]** Juice, sound and chatter — Coin bursts, chimney smoke, soft sounds and Town speech bubbles from the web version, if you want them back. _Why: Owner answer: extras_ (Claude)
- **[waiting]** Trader back-haul and sales pressure — Traders carry their home's surplus on the way back, and a seller's price rises a little with each sale, as in the web version. _Why: After the balance answers, so tuning happens once_ (Claude)
- **[waiting]** Content editable in the Inspector — Move Goods, buildings, research and Missions from code into assets you can edit in Unity. _Why: When you want to edit content yourself_ (Claude)
- **[blocked]** Play-test with a real mouse — Play a full session in Unity and report anything confusing or broken; all checks so far were scripted. _Why: Needs a play session from Mariusz_ (Mariusz)
- **[waiting]** Stranger reaches Victory without help — The 1.0 exit test: someone new plays from the start screen to Victory without asking questions. _Why: After art, balance and your own play-test_ (Mariusz)
