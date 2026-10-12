# Code health — review findings (2026-10-13)

Read-only review by the Code health reviewer. Core rules hold: no UnityEngine, `System.Random` or
`DateTime` in Core; GameObjects own no sim state. Each finding below is a plan task or part of one.

## Bugs (task: "Fix save and determinism bugs") — all fixed 2026-10-13 (✅)
1. ✅ **Route cache goes stale.** `Pathing` clears its cache only on `RoadVersion`, but Town centres
   count as road and `FoundTown`/`DestroyTown` don't bump it. A restored world starts fresh and drifts
   from the live one. Fix: bump the version when Towns appear or vanish.
2. ~~Upkeep and purse-overflow ledgers not saved~~ — fixed with back-haul (2026-10-13).
3. ✅ **No save migration.** Restore throws on any version mismatch and `Array.Copy(..., n)` throws if
   the Good count changes. Fix: copy `Math.Min` lengths everywhere; add a migrate step per version.
4. ✅ **Unknown research ids on load** (active/queue) → null refs in research UI. Fix: drop them.
5. ✅ **Cancel upgrade loses Goods** that Porters are still carrying. Fix: return late arrivals to Stock.
6. ✅ **Royal Traders keep a demolished seller.** `DestroyTown` clears only Town Traders.
7. ✅ **Disk check every frame** (`File.Exists` from the start menu code). Fix: only when the menu opens.
8. ✅ **Stale selected Scout after load**; "Demolished." toast even when demolish fails.
9. ✅ **`Balance.asset` out of date** (old Tariff keys, missing purse/upkeep fields). The game reads the
   asset, tests read code defaults. Fix: re-save it and add an editor check.

## Rule drift: numbers that belong in Balance
Upgrade time (`TownSim` hard-codes it; `Balance.UpgradeSec` is unused), new-Town start Stock
(60 wood, 40 potato), castle order limit 20, provision recipes, Porter priorities, the "starving"
threshold 0.25, UI texts that repeat balance values, and `/2` ticks-per-second in the HUD.

## Duplication
`TradeSim.Buy` vs royal dispatch (offers, sort, quantity, launch); `Surplus` vs `CrownSurplus` grace
check; hex-radius loops (three copies); HUD pointer checks; Castle stock checks; Give/Take cooldowns.

## Fragile spots
Hard-coded string ids (`"wood"`, `"potato"`, building ids) that throw if content changes; per-tick list
allocations in trade; O(Towns²) work per tick (`HasSeller`, population sums, `IsRoadLike`); per-frame
LINQ and O(B²) sweeps in the view; feedback dictionaries never pruned; "New realm" overwrites the save
without asking.

## Test gaps
Save field coverage (reflection test: every public sim field has a DTO field); a `JsonUtility` round
trip; save/load after founding a Town mid-trade; cancel-upgrade conservation; restore edge cases;
`TariffFromSeller`; Castle last-resort sale; DestroyTown refund and Trader cleanup; upkeep never below
zero; research queue with a missing prerequisite.

## Dead code
`Town.GoldSpentByCrown` never written; `UpgradeSec`, `ScoutHexesPerTick`, `EstateWinHappiness` unused;
`PeasantContent`/`BenchmarkKingdom`/`AutoPlayer` ship in the runtime assembly (move to a dev asmdef).

## Tools
`set-task.cjs` should validate the status and refuse a regex that matches several tasks;
`build-plan.cjs` should escape HTML.
