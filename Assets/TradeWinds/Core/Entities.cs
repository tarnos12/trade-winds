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

        /// <summary>Construction materials already carried to the site, per Good.</summary>
        public double[] Delivered;
        /// <summary>Construction materials Porters are carrying here right now, per Good.</summary>
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
        public bool IsWorkplace => Def.Kind != BuildingKind.House;

        public double MaterialOutstanding(int good)
        {
            if (Built) return 0;
            double need = 0;
            foreach (var m in Def.MaterialCost)
                if (m.Good == good) need += m.Amount;
            return System.Math.Max(0, need - Delivered[good] - DeliveringNow[good]);
        }

        public bool AllMaterialsDelivered()
        {
            foreach (var m in Def.MaterialCost)
                if (Delivered[m.Good] + 1e-9 < m.Amount) return false;
            return true;
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

    /// <summary>Buys Goods for its home Town from another Town and carries them back.</summary>
    public sealed class Trader
    {
        public Town Home;
        public TraderState State;
        public Town Seller;
        public int Good;
        public double Amount;
        public int LegTicks;
        public long PhaseEndTick;
        public bool OnRoad;
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
        public double[] Happiness = new double[4];
        public int[] TicksOverTarget = new int[4];
        /// <summary>Per tier, per Good: smoothed satisfaction 0..1.</summary>
        public double[][] Satisfaction = new double[4][];

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

        /// <summary>Population-weighted happiness across tiers (start value when empty).</summary>
        public double OverallHappiness(double whenEmpty)
        {
            double pop = 0, sum = 0;
            for (int t = 0; t < 4; t++)
            {
                pop += Population[t];
                sum += Population[t] * Happiness[t];
            }
            return pop > 1e-9 ? sum / pop : whenEmpty;
        }

        public bool Occupies(Hex h)
        {
            if (h == Center) return true;
            foreach (var b in Buildings)
                if (b.Hex == h) return true;
            return false;
        }
    }
}
