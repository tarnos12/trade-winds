using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class MapGenTests
    {
        [Test]
        public void SameSeed_SameMap()
        {
            var a = MapGen.Generate(123);
            var b = MapGen.Generate(123);
            bool same = true;
            MapGen.ForEach(a.Board, h => { if (a.Board[h] != b.Board[h]) same = false; });
            Assert.That(same);
            Assert.That(b.Start, Is.EqualTo(a.Start));
        }

        [TestCase(1u)]
        [TestCase(77u)]
        [TestCase(4242u)]
        public void Start_HasFoodWoodAndFishNearby(uint seed)
        {
            var map = MapGen.Generate(seed);
            int fertile = 0, forest = 0, fish = 0;
            MapGen.ForEach(map.Board, h =>
            {
                int d = Hex.Distance(map.Start, h);
                if (d <= 4 && map.Board[h] == Terrain.Fertile) fertile++;
                if (d <= 4 && map.Board[h] == Terrain.Forest) forest++;
                if (d >= 2 && d <= 6 && map.Board[h] == Terrain.Fish) fish++;
            });
            Assert.That(fertile, Is.GreaterThanOrEqualTo(6));
            Assert.That(forest, Is.GreaterThanOrEqualTo(3));
            Assert.That(fish, Is.GreaterThanOrEqualTo(1));
            Assert.That(TerrainRules.IsBuildableGround(map.Board[map.Start]));
        }
    }
}
