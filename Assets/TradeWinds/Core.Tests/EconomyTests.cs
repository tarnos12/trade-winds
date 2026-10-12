using System;
using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class EconomyTests
    {
        const int Minute = Scenarios.TicksPerMinute;

        [Test]
        public void SelfSufficientTown_FillsItsHouses()
        {
            var board = new Board(20, 10);
            var c = Scenarios.At(8, 5);
            board[c.Neighbor(0)] = Terrain.Fertile;
            board[c.Neighbor(1)] = Terrain.Forest;
            var world = new World(PeasantContent.Create(), board, 3);
            Assert.That(world.FoundTown(c, out var town).Ok);
            Scenarios.Place(world, "potato_farm", c.Neighbor(0));
            Scenarios.Place(world, "lumberjack", c.Neighbor(1));
            Scenarios.Place(world, "hut", c.Neighbor(2));
            Scenarios.Place(world, "hut", c.Neighbor(3));

            world.Run(15 * Minute);

            Assert.That(town.Population[(int)Tier.Peasant], Is.EqualTo(Scenarios.PeasantCapacity(town)).Within(0.05));
            Assert.That(town.Happiness[(int)Tier.Peasant], Is.GreaterThan(60));
            Assert.That(town.TaxEarned, Is.GreaterThan(0));
        }

        [Test]
        public void WithoutPorters_HousesGoHungry()
        {
            // Porters are real logistics: residents only eat what Porters carry to their house.
            var board = new Board(20, 10);
            var c = Scenarios.At(8, 5);
            board[c.Neighbor(0)] = Terrain.Fertile;
            board[c.Neighbor(1)] = Terrain.Forest;
            var world = new World(PeasantContent.Create(), board, 3);
            Assert.That(world.FoundTown(c, out var town).Ok);
            Scenarios.Place(world, "hut", c.Neighbor(2));
            world.Run(Minute);
            var hut = town.Buildings[0];
            Assert.That(hut.Built, "built with Porters");

            world.Content.Balance.PortersByLevel = new[] { 0, 0, 0, 0 };
            town.Porters.Clear();
            Array.Clear(hut.Buffer, 0, hut.Buffer.Length);
            world.Run(10 * Minute);

            Assert.That(town.Stock[world.Content.GoodIndex("potato")], Is.GreaterThan(10), "food sits in Stock");
            Assert.That(town.Happiness[(int)Tier.Peasant], Is.LessThan(20));
        }

        [Test]
        public void ConstructionWaitsForPorters()
        {
            var world = new World(PeasantContent.Create(), new Board(20, 10), 3);
            var c = Scenarios.At(8, 5);
            Assert.That(world.FoundTown(c, out var town).Ok);
            world.Content.Balance.PortersByLevel = new[] { 0, 0, 0, 0 };
            town.Porters.Clear();
            Scenarios.Place(world, "hut", c.Neighbor(0));
            world.Run(2 * Minute);
            Assert.That(town.Buildings[0].Built, Is.False);
        }

        /// <summary>Milestone 1 exit criterion (GDD §15).</summary>
        [Test]
        public void TwoSpecialisedTowns_TradeUnattended_AndTheCrownEarnsTariff()
        {
            var world = Scenarios.TwoSpecialisedTowns(11, out var potatoTown, out var timberTown);
            int potato = world.Content.GoodIndex("potato");
            int wood = world.Content.GoodIndex("wood");
            double treasuryAfterSetup = world.Treasury;

            world.Run(30 * Minute);

            foreach (var t in new[] { potatoTown, timberTown })
            {
                Assert.That(t.Population[(int)Tier.Peasant], Is.GreaterThan(0.8 * Scenarios.PeasantCapacity(t)), t.Name + " population");
                Assert.That(t.Happiness[(int)Tier.Peasant], Is.GreaterThan(55), t.Name + " happiness");
                Assert.That(t.GoodsBought, Is.GreaterThan(0), t.Name + " bought");
                Assert.That(t.GoodsSold, Is.GreaterThan(0), t.Name + " sold");
            }

            Assert.That(potatoTown.Satisfaction[(int)Tier.Peasant][wood], Is.GreaterThan(0.8), "potato town gets its wood by trade");
            Assert.That(timberTown.Satisfaction[(int)Tier.Peasant][potato], Is.GreaterThan(0.8), "timber town gets its potatoes by trade");
            Assert.That(world.LifetimeTariff, Is.GreaterThan(0));
            Assert.That(world.Treasury, Is.GreaterThan(treasuryAfterSetup));
        }

        [Test]
        public void ARoad_SpeedsTradeAndNarrowsThePriceGap()
        {
            var noRoad = Scenarios.TwoSpecialisedTowns(11, out var pA, out var tA);
            var withRoad = Scenarios.TwoSpecialisedTowns(11, out var pB, out var tB, road: true);
            int wood = noRoad.Content.GoodIndex("wood");

            var offRoute = noRoad.Pathing.Find(pA.Center, tA.Center);
            var roadRoute = withRoad.Pathing.Find(pB.Center, tB.Center);
            Assert.That(roadRoute.AllRoad);
            Assert.That(roadRoute.Cost, Is.LessThan(offRoute.Cost));

            noRoad.Run(10 * Minute);
            withRoad.Run(10 * Minute);
            double gapNoRoad = 0, gapRoad = 0;
            int samples = 0;
            for (int i = 0; i < 20 * Minute; i++)
            {
                noRoad.Step();
                withRoad.Step();
                if (i % 10 != 0) continue;
                gapNoRoad += Math.Abs(pA.Price[wood] - tA.Price[wood]);
                gapRoad += Math.Abs(pB.Price[wood] - tB.Price[wood]);
                samples++;
            }

            TestContext.WriteLine($"avg wood price gap: off-road {gapNoRoad / samples:0.00}, road {gapRoad / samples:0.00}");
            Assert.That(gapRoad, Is.LessThan(gapNoRoad));
        }

        [Test]
        public void SameSeedAndCommands_GiveTheSameKingdom()
        {
            var a = Scenarios.TwoSpecialisedTowns(5, out _, out _);
            var b = Scenarios.TwoSpecialisedTowns(5, out _, out _);
            a.Run(10 * Minute);
            b.Run(10 * Minute);
            Assert.That(Fingerprint(b), Is.EqualTo(Fingerprint(a)));
        }

        [Test]
        public void TargetPrice_FollowsMinutesOfCover()
        {
            var bal = new Balance();
            Assert.That(TownSim.TargetPrice(bal, 10, 0, 5), Is.EqualTo(19).Within(1e-9), "empty shelf");
            Assert.That(TownSim.TargetPrice(bal, 10, 9, 5), Is.EqualTo(10).Within(1e-9), "0.9 ratio = base");
            Assert.That(TownSim.TargetPrice(bal, 10, 80, 5), Is.EqualTo(4).Within(1e-9), "surplus floor");
            Assert.That(TownSim.TargetPrice(bal, 10, 0, 0), Is.EqualTo(10), "no market");
        }

        static string Fingerprint(World w)
        {
            var s = new System.Text.StringBuilder();
            s.Append(w.Tick).Append('|').Append(w.Treasury.ToString("R")).Append('|');
            foreach (var t in w.Towns)
            {
                s.Append(t.Gold.ToString("R"));
                foreach (var x in t.Stock) s.Append(',').Append(x.ToString("R"));
                foreach (var x in t.Population) s.Append(',').Append(x.ToString("R"));
                s.Append(';');
            }
            return s.ToString();
        }

        [Test]
        public void Traders_CarryHomeSurplusOnTheWayOut()
        {
            var world = Scenarios.TwoSpecialisedTowns(11, out _, out _);
            world.Run(30 * Minute);
            TestContext.WriteLine($"back-hauls: {world.Stats.BackHauls}");
            Assert.That(world.Stats.BackHauls, Is.GreaterThan(0), "outbound legs carry goods");

            var off = Scenarios.TwoSpecialisedTowns(11, out _, out _);
            off.Content.Balance.BackHaul = false;
            off.Run(30 * Minute);
            Assert.That(off.Stats.BackHauls, Is.EqualTo(0));
            TestContext.WriteLine($"tariff: back-haul {world.LifetimeTariff:0}, without {off.LifetimeTariff:0}");
        }

        [Test]
        public void SalesPressure_RaisesTheAskOfAGoodThatSells_WithinBounds()
        {
            var world = Scenarios.TwoSpecialisedTowns(11, out var potatoTown, out _);
            var b = world.Content.Balance;
            int potato = world.Content.GoodIndex("potato");
            double peak = 0;
            for (int i = 0; i < 30 * Minute; i++)
            {
                world.Step();
                foreach (var t in world.Towns)
                    foreach (var x in t.SalesAdj)
                        Assert.That(x, Is.InRange(b.SalesPressureMin, b.SalesPressureMax));
                peak = Math.Max(peak, potatoTown.SalesAdj[potato]);
            }
            Assert.That(peak, Is.GreaterThan(1), "potato sales push the potato Town's ask up");
            Assert.That(TradeSim.SellPrice(potatoTown, potato),
                Is.EqualTo(potatoTown.Price[potato] * potatoTown.SalesAdj[potato]).Within(1e-9));
        }
    }
}
