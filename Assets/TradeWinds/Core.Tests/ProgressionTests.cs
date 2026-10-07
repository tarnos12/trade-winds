using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class ProgressionTests
    {
        const int Minute = Scenarios.TicksPerMinute;

        /// <summary>Milestone 3 exit (GDD §15): a deterministic run completes the Mission chain.</summary>
        [Test]
        public void ScriptedKingdom_CompletesEveryMission_ForVictory()
        {
            var bot = BenchmarkKingdom.Create();
            for (int m = 0; m < 300 && !bot.World.Victory; m++) bot.Run(Minute);
            TestContext.WriteLine(bot.Report());

            var w = bot.World;
            Assert.That(w.Victory, "Victory within 5 game-hours. " + bot.Report());
            Assert.That(w.MissionIndex, Is.EqualTo(w.Content.Missions.Length));
            Assert.That(MissionSim.EstateHappiness(w), Is.GreaterThanOrEqualTo(99.5));
            Assert.That(w.MissionGoldEarned, Is.GreaterThan(0));
            Assert.That(w.LifetimeTariff, Is.GreaterThan(w.MissionGoldEarned), "Tariff is the Crown's main income");
        }

        [Test]
        public void ScriptedKingdom_IsDeterministic()
        {
            var a = BenchmarkKingdom.Create();
            var b = BenchmarkKingdom.Create();
            a.Run(40 * Minute);
            b.Run(40 * Minute);
            Assert.That(KingdomTests.Fingerprint(b.World), Is.EqualTo(KingdomTests.Fingerprint(a.World)));
        }
    }
}
