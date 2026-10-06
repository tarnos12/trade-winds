using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class PlacementTests
    {
        static World NewWorld() => new World(PeasantContent.Create(), new Board(30, 12), 7);

        [Test]
        public void FoundingATown_CostsTreasuryAndStartsWithStock()
        {
            var world = NewWorld();
            double before = world.Treasury;
            Assert.That(world.FoundTown(Scenarios.At(5, 5), out var town).Ok);
            Assert.That(world.Treasury, Is.EqualTo(before - 1000));
            Assert.That(town.Gold, Is.EqualTo(1000));
            Assert.That(town.Stock[world.Content.GoodIndex("wood")], Is.EqualTo(60));
            Assert.That(town.Stock[world.Content.GoodIndex("potato")], Is.EqualTo(40));
            Assert.That(town.Traders.Count, Is.EqualTo(2));
            Assert.That(town.Porters.Count, Is.EqualTo(4));
        }

        [Test]
        public void Towns_MustKeepAGap()
        {
            var world = NewWorld();
            var c = Scenarios.At(5, 5);
            Assert.That(world.FoundTown(c, out _).Ok);
            Assert.That(world.FoundTown(c.Neighbor(0), out _).Ok, Is.False);
            Assert.That(world.FoundTown(c.Neighbor(0).Neighbor(0), out _).Ok);
        }

        [Test]
        public void TownCap_IsFour()
        {
            var world = NewWorld();
            for (int i = 0; i < 4; i++) Assert.That(world.FoundTown(Scenarios.At(2 + i * 6, 5), out _).Ok);
            Assert.That(world.FoundTown(Scenarios.At(26, 9), out _).Ok, Is.False);
        }

        [Test]
        public void Buildings_MustTouchExactlyOneTown()
        {
            var world = NewWorld();
            var a = Scenarios.At(5, 5);
            var b = Scenarios.At(7, 5);
            Assert.That(world.FoundTown(a, out _).Ok);
            Assert.That(world.FoundTown(b, out _).Ok);

            Assert.That(world.PlaceBuilding("hut", Scenarios.At(14, 5)).Ok, Is.False, "not touching any Town");
            Assert.That(world.PlaceBuilding("hut", Scenarios.At(6, 5)).Ok, Is.False, "touches both Towns");
            Assert.That(world.PlaceBuilding("hut", a.Neighbor(3)).Ok);
            Assert.That(world.PlaceBuilding("hut", a.Neighbor(3).Neighbor(3)).Ok, "footprint grows contiguously");
        }

        [Test]
        public void Extractors_NeedTheirResourceHex()
        {
            var board = new Board(20, 10);
            var c = Scenarios.At(5, 5);
            board[c.Neighbor(0)] = Terrain.Forest;
            var world = new World(PeasantContent.Create(), board, 1);
            Assert.That(world.FoundTown(c, out _).Ok);
            Assert.That(world.PlaceBuilding("lumberjack", c.Neighbor(1)).Ok, Is.False);
            Assert.That(world.PlaceBuilding("hut", c.Neighbor(0)).Ok, Is.False, "houses can't stand on forest");
            Assert.That(world.PlaceBuilding("lumberjack", c.Neighbor(0)).Ok);
        }

        [Test]
        public void Slots_AreCappedByTownLevel()
        {
            var world = new World(PeasantContent.Create(), new Board(30, 12), 1);
            var c = Scenarios.At(10, 5);
            Assert.That(world.FoundTown(c, out var town).Ok);
            // Level 1: 8 slots, the centre uses one.
            var spots = new[]
            {
                c.Neighbor(0), c.Neighbor(1), c.Neighbor(2), c.Neighbor(3), c.Neighbor(4), c.Neighbor(5),
                c.Neighbor(0).Neighbor(0),
            };
            foreach (var h in spots) Assert.That(world.PlaceBuilding("hut", h).Ok);
            Assert.That(world.SlotsUsed(town), Is.EqualTo(8));
            Assert.That(world.PlaceBuilding("hut", c.Neighbor(0).Neighbor(0).Neighbor(0)).Ok, Is.False);
        }

        [Test]
        public void Roads_CostGoldAndCantCrossWater()
        {
            var board = new Board(10, 5);
            board[Scenarios.At(3, 2)] = Terrain.Water;
            var world = new World(PeasantContent.Create(), board, 1);
            double before = world.Treasury;
            Assert.That(world.BuildRoad(Scenarios.At(2, 2)).Ok);
            Assert.That(world.Treasury, Is.EqualTo(before - 5));
            Assert.That(world.BuildRoad(Scenarios.At(3, 2)).Ok, Is.False);
        }
    }
}
