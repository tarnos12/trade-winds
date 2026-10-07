using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    public sealed class Building
    {
        public int Id;
        public BuildingDef Def;
        public Hex Hex;
        public Town Town;
        public long PlacedTick;
        public bool Built;
        public int Level = 1;
        /// <summary>Level being upgraded to (0 = not upgrading).</summary>
        public int UpgradingTo;
        public long UpgradeStartTick;
        public bool Priority;

        /// <summary>Construction or upgrade materials already carried to the site, per Good.</summary>
        public double[] Delivered;
        /// <summary>Materials Porters are carrying here right now, per Good.</summary>
        public double[] DeliveringNow;

        // Workplaces
        public double Workers;
        public double Pending;
        public double OutputStore;
        public int BatchTimer;

        // Houses (needs) and processors (inputs)
        public double[] Buffer;
        public double[] BufferInbound;
        public double Residents;

        public bool IsHouse => Def.Kind == BuildingKind.House;
        public bool IsWorkplace => Def.Kind == BuildingKind.Extractor || Def.Kind == BuildingKind.Processor;
        public bool IsUpgrading => UpgradingTo > 0;
        /// <summary>Under construction or upgrade: waiting for materials.</summary>
        public bool NeedsMaterials => !Built || IsUpgrading;

        /// <summary>Material bill currently being delivered (construction or upgrade).</summary>
        public GoodAmount[] ActiveBill =>
            !Built ? Def.MaterialCost : IsUpgrading ? Def.UpgradeTo(UpgradingTo).MaterialCost : Array.Empty<GoodAmount>();

        public double MaterialOutstanding(int good)
        {
            if (!NeedsMaterials) return 0;
            double need = 0;
            foreach (var m in ActiveBill)
                if (m.Good == good) need += m.Amount;
            return Math.Max(0, need - Delivered[good] - DeliveringNow[good]);
        }

        public bool AllMaterialsDelivered()
        {
            foreach (var m in ActiveBill)
                if (Delivered[m.Good] + 1e-9 < m.Amount) return false;
            return true;
        }

        /// <summary>Product of this building's Output upgrade multipliers, or 1.</summary>
        public double UpgradeMultiplier(UpgradeEffect effect)
        {
            double m = 1;
            foreach (var u in Def.Upgrades)
                if (u.Level <= Level && u.Effect == effect) m *= u.Value;
            return m;
        }

        public double ExtraCapacity()
        {
            double c = 0;
            foreach (var u in Def.Upgrades)
                if (u.Level <= Level && u.Effect == UpgradeEffect.HouseCapacity) c += u.Value;
            return c;
        }

        public int WorkerSlots()
        {
            int s = Def.WorkerSlots;
            foreach (var u in Def.Upgrades)
                if (u.Level <= Level) s += u.ExtraWorkerSlots;
            return s;
        }
    }

    public enum PorterJob
    {
        Idle,
        Collect,
        DeliverNeeds,
        DeliverMaterials,
    }

    /// <summary>A carrier inside one Town. The only way Goods move between buildings and the Town's Stock.</summary>
    public sealed class Porter
    {
        public PorterJob Job;
        public long StartTick;
        public Building Target;
        public int Good;
        public double Amount;
        /// <summary>Tick at which the carried Goods arrive.</summary>
        public long ArriveTick;
        public bool Arrived;
        /// <summary>Tick at which the Porter is back at the Town centre and free.</summary>
        public long FreeTick;
    }

    public enum TraderState
    {
        Idle,
        Outbound,
        Loading,
        Inbound,
        Unloading,
    }

    /// <summary>Buys Goods for its home (a Town, or the Castle for royal Traders) and carries them back.</summary>
    public sealed class Trader
    {
        /// <summary>Home Town; null for a royal Trader (home = the Castle).</summary>
        public Town Home;
        public TraderState State;
        /// <summary>Seller Town; null when buying from the Castle.</summary>
        public Town Seller;
        public int Good;
        public double Amount;
        public int LegTicks;
        public long PhaseEndTick;
        public bool OnRoad;
        /// <summary>Route from home to the seller (walked in reverse on the way back).</summary>
        public Hex[] Path = Array.Empty<Hex>();

        public bool IsRoyal => Home == null;
    }

    public sealed class Town
    {
        public int Id;
        public string Name;
        public Hex Center;
        public int Level = 1;
        public long FoundedTick;
        public bool Built;
        public long BuiltTick = -1;

        public double Gold;
        public double[] Stock;
        public double[] Price;
        /// <summary>Goods bought and on their way here, per Good.</summary>
        public double[] Inbound;
        /// <summary>Residents' + processors' consumption per game-minute, per Good (last tick).</summary>
        public double[] ConsumptionPerMin;

        public readonly List<Building> Buildings = new List<Building>();
        public readonly List<Porter> Porters = new List<Porter>();
        public readonly List<Trader> Traders = new List<Trader>();

        /// <summary>Per tier.</summary>
        public double[] Population = new double[4];
        /// <summary>Per tier: happiness from needs only (drives population).</summary>
        public double[] Happiness = new double[4];
        public int[] TicksOverTarget = new int[4];
        /// <summary>Per tier, per Good: smoothed satisfaction 0..1.</summary>
        public double[][] Satisfaction = new double[4][];

        // Crown Give/Take
        public double CrownModifier;
        public long CrownModifierUntil;
        public long LastCrownTick = long.MinValue / 2;
        public double GoldTaken;
        public double GoldSpentByCrown;

        // Per-tick trade caches (not saved)
        internal long CacheTick = -1;
        internal bool[] ConsumesCache;
        internal bool[] BasicCache;
        internal double[] ConstructionCache;

        // Ledger (lifetime)
        public double TaxEarned;
        public double SalesIncome;
        public double PurchaseSpend;
        public double TariffGenerated;
        public double GoodsSold;
        public double GoodsBought;

        public double TotalPopulation
        {
            get
            {
                double p = 0;
                foreach (var x in Population) p += x;
                return p;
            }
        }

        public double CrownEffect(long tick) => tick < CrownModifierUntil ? CrownModifier : 0;

        /// <summary>Needs happiness plus any Give/Take effect, 0..100 (drives Tax and work speed).</summary>
        public double EffectiveHappiness(int tier, long tick) => Math.Max(0, Math.Min(100, Happiness[tier] + CrownEffect(tick)));

        /// <summary>Population-weighted effective happiness across tiers (start value when empty).</summary>
        public double OverallHappiness(double whenEmpty, long tick)
        {
            double pop = 0, sum = 0;
            for (int t = 0; t < 4; t++)
            {
                pop += Population[t];
                sum += Population[t] * EffectiveHappiness(t, tick);
            }
            return pop > 1e-9 ? sum / pop : Math.Max(0, Math.Min(100, whenEmpty + CrownEffect(tick)));
        }

        public bool Occupies(Hex h)
        {
            if (h == Center) return true;
            foreach (var b in Buildings)
                if (b.Hex == h) return true;
            return false;
        }

        public Building BuildingAt(Hex h)
        {
            foreach (var b in Buildings)
                if (b.Hex == h) return b;
            return null;
        }
    }

    public sealed class CastleOrder
    {
        public bool Buy;
        public bool Sell;
        public double Limit;
    }

    public sealed class CastleBuilding
    {
        public BuildingDef Def;
        public Hex Hex;
        public int Level = 1;
    }

    /// <summary>The King's hub: not a Town. Holds the Castle Stock, the royal market and the Compound.</summary>
    public sealed class Castle
    {
        public Hex Center;
        public double[] Stock;
        public double[] Inbound;
        public CastleOrder[] Orders;
        public readonly List<Trader> Traders = new List<Trader>();
        public readonly List<CastleBuilding> Compound = new List<CastleBuilding>();
        public double Provisions;
        public int ProvisionTimer;

        public CastleBuilding Find(string defId)
        {
            foreach (var b in Compound)
                if (b.Def.Id == defId) return b;
            return null;
        }

        public bool Occupies(Hex h)
        {
            if (h == Center) return true;
            foreach (var b in Compound)
                if (b.Hex == h) return true;
            return false;
        }
    }

    public enum ScoutState
    {
        Idle,
        Exploring,
        Returning,
        Refilling,
    }

    public sealed class Scout
    {
        public int Id;
        public Hex Position;
        public ScoutState State;
        public Hex Flag;
        public bool HasFlag;
        public double Carry;
        public List<Hex> Path = new List<Hex>();
        public int PathIndex;
        public int PauseTicks;
    }

    /// <summary>Lifetime counters used by Missions and the end screen.</summary>
    public sealed class Stats
    {
        public int TownsFounded;
        public int Upgrades;
        public int ResearchDone;
        public double[] GoodsTraded;
        public double PeakPopulation;
    }
}
