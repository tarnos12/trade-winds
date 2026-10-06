using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    /// <summary>Hand-built boards for economy tests.</summary>
    public static class Scenarios
    {
        public const int TicksPerMinute = 120;

        public static Hex At(int col, int row) => Board.FromOffset(col, row);

        /// <summary>
        /// Milestone 1 exit scenario: a potato Town (fertile land, no forest) and a timber Town (forest,
        /// no fertile land), 16 columns apart on open ground. Each has 3 Huts and 2 producers.
        /// </summary>
        public static World TwoSpecialisedTowns(uint seed, out Town potatoTown, out Town timberTown, bool road = false)
        {
            var board = new Board(30, 12);
            var potatoCenter = At(4, 5);
            var timberCenter = At(20, 5);
            board[potatoCenter.Neighbor(0)] = Terrain.Fertile;
            board[potatoCenter.Neighbor(1)] = Terrain.Fertile;
            board[timberCenter.Neighbor(3)] = Terrain.Forest;
            board[timberCenter.Neighbor(4)] = Terrain.Forest;

            var world = new World(PeasantContent.Create(), board, seed);
            Assert.That(world.FoundTown(potatoCenter, out potatoTown).Ok);
            Assert.That(world.FoundTown(timberCenter, out timberTown).Ok);

            Place(world, "potato_farm", potatoCenter.Neighbor(0));
            Place(world, "potato_farm", potatoCenter.Neighbor(1));
            Place(world, "hut", potatoCenter.Neighbor(2));
            Place(world, "hut", potatoCenter.Neighbor(3));
            Place(world, "hut", potatoCenter.Neighbor(4));

            Place(world, "lumberjack", timberCenter.Neighbor(3));
            Place(world, "lumberjack", timberCenter.Neighbor(4));
            Place(world, "hut", timberCenter.Neighbor(0));
            Place(world, "hut", timberCenter.Neighbor(1));
            Place(world, "hut", timberCenter.Neighbor(5));

            if (road) BuildStraightRoad(world, 5, 19, 5);
            return world;
        }

        public static void Place(World world, string id, Hex h)
        {
            var r = world.PlaceBuilding(id, h);
            Assert.That(r.Ok, $"place {id} at {h}: {r}");
        }

        public static void BuildStraightRoad(World world, int fromCol, int toCol, int row)
        {
            for (int c = fromCol; c <= toCol; c++)
            {
                var r = world.BuildRoad(At(c, row));
                Assert.That(r.Ok, $"road at col {c}: {r}");
            }
        }

        public static double PeasantCapacity(Town t)
        {
            double cap = 0;
            foreach (var b in t.Buildings)
                if (b.Built && b.IsHouse) cap += b.Def.HouseCapacity;
            return cap;
        }
    }
}
