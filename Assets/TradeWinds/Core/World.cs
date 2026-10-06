using System.Collections.Generic;

namespace TradeWinds.Core
{
    public readonly struct CommandResult
    {
        public readonly bool Ok;
        public readonly string Reason;

        CommandResult(bool ok, string reason)
        {
            Ok = ok;
            Reason = reason;
        }

        public static CommandResult Success => new CommandResult(true, null);
        public static CommandResult Fail(string reason) => new CommandResult(false, reason);
        public override string ToString() => Ok ? "ok" : Reason;
    }

    /// <summary>The whole simulation state plus the player's commands. Advance it with <see cref="Step"/>.</summary>
    public sealed class World
    {
        public readonly Content Content;
        public readonly Board Board;
        public readonly Rng Rng;
        public readonly Pathing Pathing;

        public long Tick;
        public double Treasury;
        public double LifetimeTariff;
        public readonly List<Town> Towns = new List<Town>();
        public readonly HashSet<Hex> Roads = new HashSet<Hex>();
        public int RoadVersion;

        int _nextTownId = 1;
        int _nextBuildingId = 1;

        public World(Content content, Board board, uint seed)
        {
            Content = content;
            Board = board;
            Rng = new Rng(seed);
            Pathing = new Pathing(this);
            Treasury = content.Balance.StartTreasury;
        }

        Balance B => Content.Balance;

        /// <summary>Advance the economy by one fixed tick (500 ms of game time).</summary>
        public void Step()
        {
            foreach (var town in Towns) TownSim.Tick(this, town);
            TradeSim.Tick(this);
            Tick++;
        }

        public void Run(int ticks)
        {
            for (int i = 0; i < ticks; i++) Step();
        }

        // ------------------------------------------------------------------ queries

        public Town TownAt(Hex h)
        {
            foreach (var t in Towns)
                if (t.Occupies(h)) return t;
            return null;
        }

        public bool IsOccupied(Hex h) => TownAt(h) != null;

        bool TouchesTown(Hex h, Town town)
        {
            for (int d = 0; d < 6; d++)
                if (town.Occupies(h.Neighbor(d))) return true;
            return false;
        }

        public int SlotsUsed(Town town) => 1 + town.Buildings.Count;

        public int SlotCap(Town town) => B.SlotsByLevel[System.Math.Min(town.Level, B.SlotsByLevel.Length) - 1];

        // ------------------------------------------------------------------ commands

        public CommandResult CanFoundTown(Hex h)
        {
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!TerrainRules.IsBuildableGround(Board[h])) return CommandResult.Fail("A Town needs open ground.");
            if (IsOccupied(h)) return CommandResult.Fail("That hex is taken.");
            if (Roads.Contains(h)) return CommandResult.Fail("Can't found a Town on a road.");
            foreach (var t in Towns)
                if (TouchesTown(h, t)) return CommandResult.Fail("Too close to another Town — leave a gap.");
            if (Towns.Count >= B.TownCap) return CommandResult.Fail($"Town limit reached ({B.TownCap}).");
            if (Treasury < B.TownFoundCost) return CommandResult.Fail($"Needs {B.TownFoundCost:0} gold in the treasury.");
            return CommandResult.Success;
        }

        public CommandResult FoundTown(Hex h, out Town town)
        {
            town = null;
            var check = CanFoundTown(h);
            if (!check.Ok) return check;

            Treasury -= B.TownFoundCost;
            int n = Content.GoodCount;
            town = new Town
            {
                Id = _nextTownId++,
                Center = h,
                FoundedTick = Tick,
                Gold = B.TownStartGold,
                Stock = new double[n],
                Price = new double[n],
                Inbound = new double[n],
                ConsumptionPerMin = new double[n],
            };
            town.Name = "Town #" + town.Id;
            for (int g = 0; g < n; g++) town.Price[g] = Content.Goods[g].BasePrice;
            for (int t = 0; t < 4; t++)
            {
                town.Happiness[t] = B.StartHappiness;
                town.Satisfaction[t] = new double[n];
            }

            town.Stock[Content.GoodIndex("wood")] = 60;
            town.Stock[Content.GoodIndex("potato")] = 40;

            Towns.Add(town);
            SyncFleets(town);
            return CommandResult.Success;
        }

        /// <summary>Make the Town's Porter and Trader counts match its level.</summary>
        public void SyncFleets(Town town)
        {
            int lvl = System.Math.Min(town.Level, B.PortersByLevel.Length) - 1;
            while (town.Porters.Count < B.PortersByLevel[lvl]) town.Porters.Add(new Porter());
            while (town.Traders.Count < B.TradersByLevel[lvl]) town.Traders.Add(new Trader { Home = town });
        }

        public CommandResult CanPlaceBuilding(BuildingDef def, Hex h, out Town town)
        {
            town = null;
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (IsOccupied(h)) return CommandResult.Fail("That hex is taken.");
            if (!def.AllowsTerrain(Board[h])) return CommandResult.Fail($"{def.Name} can't stand on {Board[h]}.");

            Town touching = null;
            foreach (var t in Towns)
            {
                if (!TouchesTown(h, t)) continue;
                if (touching != null) return CommandResult.Fail("Touches two Towns — leave a gap.");
                touching = t;
            }

            if (touching == null) return CommandResult.Fail("Must be placed next to a Town or its buildings.");
            if (SlotsUsed(touching) >= SlotCap(touching)) return CommandResult.Fail($"{touching.Name} has no free building slots.");
            if (Treasury < def.GoldCost) return CommandResult.Fail($"Needs {def.GoldCost:0} gold in the treasury.");
            town = touching;
            return CommandResult.Success;
        }

        public CommandResult PlaceBuilding(BuildingDef def, Hex h, out Building building)
        {
            building = null;
            var check = CanPlaceBuilding(def, h, out var town);
            if (!check.Ok) return check;

            Treasury -= def.GoldCost;
            int n = Content.GoodCount;
            building = new Building
            {
                Id = _nextBuildingId++,
                Def = def,
                Hex = h,
                Town = town,
                PlacedTick = Tick,
                Delivered = new double[n],
                DeliveringNow = new double[n],
                Buffer = new double[n],
                BufferInbound = new double[n],
            };
            town.Buildings.Add(building);
            return CommandResult.Success;
        }

        public CommandResult PlaceBuilding(string defId, Hex h) => PlaceBuilding(Content.Building(defId), h, out _);

        public CommandResult BuildRoad(Hex h)
        {
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!Board.IsPassable(h)) return CommandResult.Fail("Roads can't cross water or mountains.");
            if (Roads.Contains(h)) return CommandResult.Fail("Already a road.");
            if (Treasury < B.RoadCostPerHex) return CommandResult.Fail("Not enough gold in the treasury.");
            Treasury -= B.RoadCostPerHex;
            Roads.Add(h);
            RoadVersion++;
            return CommandResult.Success;
        }

        public CommandResult RemoveRoad(Hex h)
        {
            if (!Roads.Remove(h)) return CommandResult.Fail("No road there.");
            RoadVersion++;
            return CommandResult.Success;
        }
    }
}
