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
        /// <summary>Part of the Castle Compound (Research Center, Provisioner): unique, no workers.</summary>
        Castle,
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

    public enum UpgradeEffect
    {
        HouseCapacity,
        BasicUse,
        LuxuryUse,
        Output,
    }

    /// <summary>One level of a building's upgrade ladder (level 2 is the first upgrade).</summary>
    public sealed class UpgradeLevel
    {
        public int Level;
        /// <summary>Research node that unlocks this level.</summary>
        public string UnlockedBy;
        /// <summary>Paid from Town gold.</summary>
        public double GoldCost;
        public GoodAmount[] MaterialCost = Array.Empty<GoodAmount>();
        public UpgradeEffect Effect;
        /// <summary>+capacity for HouseCapacity; multiplier for the others.</summary>
        public double Value;
        public int ExtraWorkerSlots;
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
        /// <summary>Research node that unlocks it; null = available from the start.</summary>
        public string UnlockedBy;

        public int OutputGood = -1;
        public double OutputPerWorkerPerMin;
        /// <summary>Processor inputs consumed per unit of output.</summary>
        public GoodAmount[] InputsPerOutput = Array.Empty<GoodAmount>();
        public int WorkerSlots = 2;

        public int HouseCapacity;

        /// <summary>Treasury gold, paid on placement.</summary>
        public double GoldCost;
        /// <summary>Delivered by Porters from the Town's Stock (Castle buildings: taken from Castle Stock).</summary>
        public GoodAmount[] MaterialCost = Array.Empty<GoodAmount>();
        public double BuildSec;

        public UpgradeLevel[] Upgrades = Array.Empty<UpgradeLevel>();

        public bool AllowsTerrain(Terrain t) => Array.IndexOf(Terrains, t) >= 0;
        public int MaxLevel => 1 + Upgrades.Length;

        public UpgradeLevel UpgradeTo(int level)
        {
            foreach (var u in Upgrades)
                if (u.Level == level) return u;
            return null;
        }
    }

    public sealed class TierNeeds
    {
        public Tier Tier;
        /// <summary>Per person per game-minute.</summary>
        public GoodAmount[] Basic = Array.Empty<GoodAmount>();
        public GoodAmount[] Luxury = Array.Empty<GoodAmount>();
        public double TaxPerPersonPerMin;
    }

    public enum ResearchBand
    {
        Peasant,
        Worker,
        Burgher,
        Aristocrat,
        Kingdom,
    }

    /// <summary>Kingdom-wide effects a research node can grant.</summary>
    public enum Modifier
    {
        None,
        ExtractorOutput,
        ProcessorOutput,
        TraderSpeed,
        TraderCapacity,
        ExtraTraders,
        TariffBonus,
        TariffSlider,
        TownSlots,
        TownCap,
        HousingBonus,
        ExtraScouts,
    }

    public sealed class ResearchNode
    {
        public string Id;
        public string Name;
        public ResearchBand Band;
        public string[] Requires = Array.Empty<string>();
        /// <summary>Drained from Castle Stock at the Research Center's speed.</summary>
        public GoodAmount[] Materials = Array.Empty<GoodAmount>();
        public Modifier Modifier;
        public double Value;
        public string Description;
    }

    public enum ObjectiveKind
    {
        FoundTowns,
        Construct,
        Upgrades,
        TradeGood,
        TariffEarned,
        ResearchDone,
        Residents,
        EstateHappiness,
    }

    public sealed class Objective
    {
        public ObjectiveKind Kind;
        /// <summary>Building id (Construct; null = any), Good id (TradeGood).</summary>
        public string Target;
        public Tier Tier;
        public double Count;
        public string Label;
    }

    public sealed class MissionDef
    {
        public string Id;
        public string Name;
        public Objective[] Objectives = Array.Empty<Objective>();
        public double RewardGold;
        public string Tip;
    }

    /// <summary>Tuning numbers. Defaults are the web version's tuned values (see GDD.md).</summary>
    [Serializable]
    public sealed class Balance
    {
        public int TicksPerSecond = 2;

        // Crown
        public double StartTreasury = 10000;
        public double RoadCostPerHex = 5;
        public double TariffRate = 0.30;
        public double TariffMin = 0.10;
        public double TariffMax = 0.40;
        public double CrownTransfer = 1000;
        public double CrownCooldownSec = 120;
        public double GiveHappiness = 10;
        public double TakeHappiness = -30;
        public double CrownEffectSec = 60;
        public double TakeMinTownAgeSec = 300;
        public double TakeMinResidents = 2;

        // Castle
        public double CastleStartWood = 40;
        public double CastleStartStone = 40;
        public double CastleStartPotato = 10;
        public int RoyalTraders = 10;
        public double RoyalTraderCapacity = 10;
        public double CastleSellPriceMultiplier = 1.0;
        public double ProvisionsStart = 15;
        public double ProvisionsCap = 30;
        public double ProvisionerSec = 3;
        public double ProvisionerBuyLimit = 40;
        public double[] ResearchSpeedByLevel = { 2, 3, 4, 6 };

        // Fog & scouts
        public int RevealRadiusSmall = 6;
        public int RevealRadiusNormal = 8;
        public int RevealRadiusLarge = 10;
        public int ScoutRevealRadius = 2;
        public int ScoutSearchRadius = 8;
        public double ScoutCarry = 10;
        public double ScoutHexesPerTick = 1;
        public int ScoutPauseTicks = 4;

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
        public double[] TownLevelCost = { 150, 400, 900 };

        // Production
        public double BatchSec = 16;
        public double ProducerStoreCap = 30;
        public double UpgradeSec = 4;

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
        public double InputBufferSec = 60;
        /// <summary>Construction leaves this many game-seconds of residents' Basic Needs in Stock.</summary>
        public double BasicReserveSec = 60;
        public double EstateWinHappiness = 99.5;

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
        /// <summary>A Town keeps this many game-minutes of its own use on hand (buy target), at least <see cref="BuyFloor"/>.</summary>
        public double BuyCoverMin = 1.5;
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

    /// <summary>All static game data: Goods, buildings, tier needs, research, Missions and balance.</summary>
    public sealed class Content
    {
        public readonly GoodDef[] Goods;
        public readonly BuildingDef[] Buildings;
        public readonly TierNeeds[] Tiers;
        public readonly Balance Balance;
        public readonly ResearchNode[] Research;
        public readonly MissionDef[] Missions;

        readonly Dictionary<string, GoodDef> _goodsById = new Dictionary<string, GoodDef>();
        readonly Dictionary<string, BuildingDef> _buildingsById = new Dictionary<string, BuildingDef>();
        readonly Dictionary<string, ResearchNode> _researchById = new Dictionary<string, ResearchNode>();
        readonly bool[] _isBasic;

        public Content(IList<GoodDef> goods, IList<BuildingDef> buildings, IList<TierNeeds> tiers, Balance balance,
            IList<ResearchNode> research = null, IList<MissionDef> missions = null)
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

            Research = research != null ? new List<ResearchNode>(research).ToArray() : Array.Empty<ResearchNode>();
            foreach (var r in Research) _researchById.Add(r.Id, r);
            Missions = missions != null ? new List<MissionDef>(missions).ToArray() : Array.Empty<MissionDef>();

            _isBasic = new bool[Goods.Length];
            foreach (var t in Tiers)
                foreach (var n in t.Basic)
                    _isBasic[n.Good] = true;

            Balance = balance ?? new Balance();
        }

        public int GoodCount => Goods.Length;
        public GoodDef Good(string id) => _goodsById[id];
        public int GoodIndex(string id) => _goodsById[id].Index;
        public bool HasGood(string id) => _goodsById.ContainsKey(id);
        public BuildingDef Building(string id) => _buildingsById[id];
        public bool HasBuilding(string id) => _buildingsById.ContainsKey(id);
        public ResearchNode ResearchNode(string id) => _researchById.TryGetValue(id, out var n) ? n : null;
        public bool IsBasicNeed(int good) => _isBasic[good];
    }
}
