using System.Text;
using TradeWinds.Core;
using TradeWinds.Game;
using UnityEditor;
using UnityEngine;

namespace TradeWinds.EditorTools
{
    /// <summary>Headless balance runner (GDD §3): plays the benchmark Kingdom with the current Balance asset and
    /// logs progress every 30 game-minutes until Victory or 6 game-hours. Successor to the web Balance Lab.</summary>
    public static class BalanceRunner
    {
        [MenuItem("Trade Winds/Run Balance Simulation")]
        public static void Run()
        {
            var asset = GameSceneBuilder.EnsureBalance();
            var bot = BenchmarkKingdom.Create(3, asset.CreateCopy());
            var log = new StringBuilder("[TradeWinds] Balance run (benchmark Kingdom, seed 3)\n");
            const int minute = 120;
            try
            {
                for (int m = 1; m <= 360 && !bot.World.Victory; m++)
                {
                    bot.Run(minute);
                    if (m % 30 == 0) log.AppendLine(bot.Report());
                    if (EditorUtility.DisplayCancelableProgressBar("Trade Winds balance run", bot.Report(), m / 360f)) break;
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
            var w = bot.World;
            log.AppendLine(w.Victory ? $"VICTORY at {w.VictoryTick / minute} game-minutes." : "No Victory within 6 game-hours.");
            log.AppendLine($"Lifetime Tariff {w.LifetimeTariff:N0} · Mission gold {w.MissionGoldEarned:N0} · treasury {w.Treasury:N0}");
            foreach (var t in w.Towns)
            {
                log.Append($"{t.Name} L{t.Level} purse {t.Gold:N0}:");
                for (int tier = 0; tier < 4; tier++)
                {
                    double cap = TownSim.TierCapacity(w, t, tier);
                    if (cap > 0) log.Append($" {(Tier)tier} {t.Population[tier]:0.0}/{cap:0} @{t.Happiness[tier]:0}%");
                }
                log.AppendLine();
            }
            Debug.Log(log.ToString());
        }
    }
}
