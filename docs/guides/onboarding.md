# UI and onboarding — review findings (2026-10-13)

Read-only review by the UI/UX + Onboarding designer + Writer, walking the first hour as a new player.
Task: "First-hour onboarding fixes" (blockers + quick wins) and "Words and terms pass" (texts).

## Blockers in the first hour (most harmful first)
1. **Mission 6 "The Workers Arrive" hides its prerequisites.** It needs Quarry research → Cottages,
   20 Stone per Cottage (Quarry on a Stone Deposit), Fish and Coal (Coal Deposits usually in fog;
   Scouts are never taught). The objective says "Build a Cottage" but 4 Workers need 2.
2. **Mission 4's tip points at an upgrade that costs Planks** before the player has a Sawmill.
3. **Mission 3 doesn't say which research to pick** or where the Research Center goes.
4. **The Town-limit refusal names the wrong research** (Town Charters gives slots; Township Grants
   gives more Towns).
5. **Research queued before its prerequisite waits forever without a word.**
6. **An empty Town says nothing**; its bubble says "All is fine here."
7. **"Traders will buy it" can be false** when no Town makes the Good (Stone).
8. **Mission 2 doesn't mention Huts**, so farms in the second Town sit idle.
9. **A Town next to the Castle can block the Research Center's hexes.**

## UI flow
- Toasts and the confirm dialog are hidden behind the Research panel → bring them to front.
- Disabled buttons do nothing when clicked → toast the reason.
- After founding a Town, switch the build bar to the Peasant tab; rename "Build" → "Towns & Roads".
- After placing the Research Center: "Press R to choose a research"; idle label "Research: choose one (R)".
- Building letters collide (C, M, B) → two letters until real icons arrive.
- Town panel Demolish doesn't warn about chained removals (the map tool does).
- Scouts/fog never taught; "Unexplored." should say "send a Scout (Castle panel)".
- GDD §12 HUD items still missing: Kingdom Overview, Goods strip, alert icons; K opens the Castle.

## Words (CONTEXT.md terms)
"Larger Carts"/"Extra Caravan" → "Trader Packs"/"Extra Trader"; "Tariff paid" → "Tariff earned for the
Crown"; "too young to be taxed" → Take wording; "Missing needs"/"Would enjoy" → "Missing Basic
Needs"/"Luxuries wanted"; "Earn 20 Tariff" → "Earn 20 gold in Tariff"; "Stone deposit" → "Stone
Deposit"; raw terrain names in refusals → "A Lumberjack must stand on a Forest hex."; Castle "Buy *" →
"Buying ✓".

## To check in balance
A Hut costs 300 treasury gold but a Cottage only 90.
