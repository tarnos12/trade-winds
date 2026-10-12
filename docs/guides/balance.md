# Balance guide

Owner: the **Balance designer**. Keep this current whenever a number that changes how the economy feels moves.
Numbers live in `Balance` (`Assets/TradeWinds/Core/Content.cs`, editable in `Assets/TradeWinds/Data/Balance.asset`)
and in the content catalogue (`GameContent.cs`).

## Targets (owner decisions)

- A full run to Victory takes **about 4 hours** for a normal player (owner, 2026-10-12). The scripted benchmark
  plays efficiently and wins sooner; treat ~190–230 game-minutes for the benchmark as on target.
- The **Tariff is the Crown's main income** and is **always exactly 30%** (no slider, no research bonuses).
- Cozy: no fail state. Importing Towns should rarely run out of gold.

## How to measure

- Headless: `Trade Winds → Run Balance Simulation` in the Editor, or a small `dotnet` probe over
  `BenchmarkKingdom.Create(seed, balance)`. The `AutoPlayer` counts the Crown's Gives and Takes.
- Report for every change: Victory minute, largest Town purse, late-game Tariff per minute, "Take potential"
  (what pressing Take on every Town every 2 minutes could pull per minute), Gives, minutes Towns spent below 100
  gold, average happiness.

## Money flows (as measured 2026-10-12, benchmark seed 3)

- Gold enters Towns as **Tax** (minted, ~2,700/min across 7 Towns late game) and leaves only through level-ups,
  upgrades and the Crown's Take. Sales and purchases between Towns move gold around but cancel out.
- Before the fix, Town purses equalled the Tax ever paid: ~515k in total, the richest Town 128k at Victory.
- Exporting Towns whose residents are fed by their own buildings earn Tax without spending it; importing Towns
  (e.g. the Aristocrat estate) spend their Tax on imports and sometimes need a Give.

## Decision: purse limits (2026-10-12)

Each Town's purse holds at most **3,000 / 6,000 / 12,000 / 20,000 gold** at levels 1–4; above that the residents
spend the rest (tracked as `PurseOverflow`). Benchmark result: largest purse 20,057 (was 128,055); Victory minute,
Gives, broke-minutes and happiness unchanged.

Levers tried and rejected (all available in `Balance` at neutral defaults):

| Lever | Effect | Why not (yet) |
|---|---|---|
| Lower Tax (`TaxScale` 0.3–0.6) | Smaller purses | Importing Towns go broke: Gives ×4–5, broke-minutes ×5–10 |
| Tariff from the seller's price (`TariffFromSeller`) | Moves Town gold to the Crown on every trade | Tariff income −20%; purses still grow without a limit |
| Building upkeep (`UpkeepPerMinByTier`) | Sink proportional to Town size | Hits poor importers first; rich Towns still hoard |

## Open

- **Take loophole:** even with purse limits, pressing Take on every rich Town every 2 minutes could pull ~2,300
  gold/min versus ~1,150/min of Tariff, because Take skims each Town's ongoing Tax surplus. Only a limit on Take
  closes it without starving importers. Question for the owner in the Hub (`take_limit`).
