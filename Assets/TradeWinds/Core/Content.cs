using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    public enum Tier
    {
        Peasant = 0,
        Worker = 1,
        Burgher = 2,
        Aristocrat = 3,
    }

    public enum BuildingKind
    {
        Extractor,
        Processor,
        House,
    }

    public readonly struct GoodAmount
    {
        public readonly int Good;
        public readonly double Amount;

        public GoodAmount(int good, double amount)
        {
            Good = good;
            Amount = amount;
        }
    }

    public sealed class GoodDef
    {
        public int Index;
        public string Id;
        public string Name;
        public double BasePrice;
    }

    public sealed class BuildingDef
    {
        public int Index;
        public string Id;
        public string Name;
        public BuildingKind Kind;
        /// <summary>Staffing tier for workplaces; resident tier for houses.</summary>
        public Tier Tier;
        /// <summary>Terrains this building may stand on.</summary>
        public Terrain[] Terrains = Array.Empty<Terrain>();

        public int OutputGood = -1;
        public double OutputPerWorkerPerMin;
        /// <summary>Processor inputs consumed per unit of output.</summary>
        public GoodAmount[] InputsPerOutput = Array.Empty<GoodAmount>();
        public int WorkerSlots = 2;

        public int HouseCapacity;

        public double GoldCost;
        public GoodAmount[] MaterialCost = Array.Empty<GoodAmount>();
        public double BuildSec;

        public bool AllowsTerrain(Terrain t) => Array.IndexOf(Terrains, t) >= 0;
    }

    public sealed class TierNeeds
    {
        public Tier Tier;
        /// <summary>Per person per game-minute.</summary>
        public GoodAmount[] Basic = Array.Empty<GoodAmount>();
        public GoodAmount[] Luxury = Array.Empty<GoodAmount>();
        public double TaxPerPersonPerMin;
    }

    /// <summary>Tuning numbers. Defaults are the web version's tuned values (see GDD.md).</summary>
    public sealed class Balance
    {
        public int TicksPerSecond = 2;

        // Crown
        public double StartTreasury = 10000;
        public double RoadCostPerHex = 5;
        public double TariffRate = 0.30;

        // Towns
        public double TownFoundCost = 1000;
        public double TownStartGold = 1000;
        public int TownCap = 4;
        public double TownBuildSec = 10;
        public double TownSellGraceSec = 30;
        public double StockCap = 80;
        public int[] SlotsByLevel = { 8, 12, 17, 24 };
        public int[] TradersByLevel = { 2, 4, 6, 8 };
        public int[] PortersByLevel = { 4, 5, 6, 7 };

        // Production
        public double BatchSec = 16;
        public double ProducerStoreCap = 30;

        // People
        public double BasicHappy = 70;
        public double LuxuryHappy = 30;
        public double FullHousingAt = 70;
        public double StartHappiness = 50;
        public double SatisfactionSmoothing = 0.05;
        public double HappinessEase = 0.10;
        public double GrowthPerTick = 0.0095;
        public double DeclinePerTick = 0.05;
        public int DeclineDelayTicks = 3;
        public double TaxBonusPerHappyPoint = 0.02;
        public double WorkSpeedBase = 0.5;
        public double WorkSpeedPerHappy = 0.7;
        /// <summary>Game-seconds of a house's own use that Porters try to keep in its buffer.</summary>
        public double HouseBufferSec = 60;
        public double HouseBufferMin = 4;
        /// <summary>Construction leaves this many game-seconds of residents' Basic Needs in Stock.</summary>
        public double BasicReserveSec = 60;

        // Porters
        public double PorterCapacity = 10;
        public double PorterSecPerHex = 1;

        // Prices
        public double PriceCoverMin = 2;
        public double PriceMinConsumptionPerMin = 0.5;
        public double PriceCeiling = 1.9;
        public double PriceFloor = 0.4;
        public double PriceEase = 0.10;

        // Traders
        public double TraderCapacity = 10;
        public double BuyFloor = 6;
        public double MinShortfall = 1;
        public int ChoiceSpread = 3;
        /// <summary>Hexes per tick on a road; off-road travel costs twice as much per hex.</summary>
        public double TraderHexesPerTick = 2;
        public int MinLegTicks = 4;
        public double OffRoadCostMultiplier = 2;
        public double LoadItemsPerSec = 2.5;

        public int Ticks(double seconds) => (int)Math.Round(seconds * TicksPerSecond);
        public double PerTick(double perMinute) => perMinute / (60.0 * TicksPerSecond);
    }

    /// <summary>All static game data: Goods, buildings, tier needs and balance.</summary>
    public sealed class Content
    {
        public readonly GoodDef[] Goods;
        public readonly BuildingDef[] Buildings;
        public readonly TierNeeds[] Tiers;
        public readonly Balance Balance;

        readonly Dictionary<string, GoodDef> _goodsById = new Dictionary<string, GoodDef>();
        readonly Dictionary<string, BuildingDef> _buildingsById = new Dictionary<string, BuildingDef>();

        public Content(IList<GoodDef> goods, IList<BuildingDef> buildings, IList<TierNeeds> tiers, Balance balance)
        {
            Goods = new GoodDef[goods.Count];
            for (int i = 0; i < goods.Count; i++)
            {
                goods[i].Index = i;
                Goods[i] = goods[i];
                _goodsById.Add(goods[i].Id, goods[i]);
            }

            Buildings = new BuildingDef[buildings.Count];
            for (int i = 0; i < buildings.Count; i++)
            {
                buildings[i].Index = i;
                Buildings[i] = buildings[i];
                _buildingsById.Add(buildings[i].Id, buildings[i]);
            }

            Tiers = new TierNeeds[4];
            foreach (var t in tiers) Tiers[(int)t.Tier] = t;
            for (int i = 0; i < Tiers.Length; i++)
                if (Tiers[i] == null) Tiers[i] = new TierNeeds { Tier = (Tier)i };

            Balance = balance ?? new Balance();
        }

        public int GoodCount => Goods.Length;
        public GoodDef Good(string id) => _goodsById[id];
        public int GoodIndex(string id) => _goodsById[id].Index;
        public BuildingDef Building(string id) => _buildingsById[id];

        public bool IsBasicNeed(int good)
        {
            foreach (var t in Tiers)
                foreach (var n in t.Basic)
                    if (n.Good == good) return true;
            return false;
        }
    }
}
