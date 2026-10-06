using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class BoardTests
    {
        [Test]
        public void Distance_CountsHexSteps()
        {
            var a = new Hex(0, 0);
            Assert.That(Hex.Distance(a, a), Is.EqualTo(0));
            for (int d = 0; d < 6; d++) Assert.That(Hex.Distance(a, a.Neighbor(d)), Is.EqualTo(1));
            Assert.That(Hex.Distance(a, new Hex(3, -1)), Is.EqualTo(3));
        }

        [Test]
        public void Offset_RoundTripsAcrossTheRectangle()
        {
            var board = new Board(9, 7);
            for (int row = 0; row < 7; row++)
            for (int col = 0; col < 9; col++)
            {
                var h = Board.FromOffset(col, row);
                Assert.That(board.Contains(h));
                Board.ToOffset(h, out int c, out int r);
                Assert.That((c, r), Is.EqualTo((col, row)));
            }
            Assert.That(board.Contains(Board.FromOffset(9, 0)), Is.False);
            Assert.That(board.Contains(Board.FromOffset(0, -1)), Is.False);
        }

        [Test]
        public void Rng_IsDeterministicPerSeed()
        {
            var a = new Rng(42);
            var b = new Rng(42);
            var c = new Rng(43);
            bool differs = false;
            for (int i = 0; i < 100; i++)
            {
                uint x = a.NextUInt();
                Assert.That(b.NextUInt(), Is.EqualTo(x));
                if (c.NextUInt() != x) differs = true;
            }
            Assert.That(differs);
        }

        [Test]
        public void Pathing_RoadsAreCheaperButNotRequired()
        {
            var world = new World(PeasantContent.Create(), new Board(20, 5), 1);
            var from = Scenarios.At(2, 2);
            var to = Scenarios.At(12, 2);
            var offRoad = world.Pathing.Find(from, to);
            Assert.That(offRoad.Found);
            Assert.That(offRoad.AllRoad, Is.False);

            Scenarios.BuildStraightRoad(world, 2, 12, 2);
            var onRoad = world.Pathing.Find(from, to);
            Assert.That(onRoad.Found);
            Assert.That(onRoad.AllRoad);
            Assert.That(onRoad.Cost, Is.LessThan(offRoad.Cost));
        }

        [Test]
        public void Pathing_GoesAroundWater()
        {
            var board = new Board(12, 7);
            for (int row = 0; row < 6; row++) board[Scenarios.At(6, row)] = Terrain.Water;
            var world = new World(PeasantContent.Create(), board, 1);
            var route = world.Pathing.Find(Scenarios.At(2, 1), Scenarios.At(10, 1));
            Assert.That(route.Found);
            Assert.That(route.Steps, Is.GreaterThan(Hex.Distance(Scenarios.At(2, 1), Scenarios.At(10, 1))));
        }
    }
}
