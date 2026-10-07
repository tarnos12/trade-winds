using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>One Town in an <see cref="AutoPlayer"/> plan: where it stands and what it builds, in order.</summary>
    public sealed class TownPlan
    {
        public Hex Center;
        public string Name;
        public readonly List<string> Builds = new List<string>();
        /// <summary>Assigned hex for each entry in <see cref="Builds"/> (filled by <see cref="AutoPlayer.LayOut"/>).</summary>
        public readonly List<Hex> Spots = new List<Hex>();

        public TownPlan Add(string id, int count = 1)
        {
            for (int i = 0; i < count; i++) Builds.Add(id);
            return this;
        }
    }

    /// <summary>
    /// A simple scripted player for headless balance runs and the Milestone 3 exit test: founds planned
    /// Towns, follows a research order, places buildings as they unlock, levels Towns, upgrades Huts and
    /// uses the Crown's Take when the treasury runs dry. Deterministic for a given World.
    /// </summary>
    public sealed class AutoPlayer
    {
        public readonly World World;
        public readonly List<TownPlan> Plans;
        public readonly List<string> ResearchOrder;
        public int ThinkEveryTicks = 20;
        public double TreasuryReserve = 300;

        readonly Dictionary<TownPlan, Town> _towns = new Dictionary<TownPlan, Town>();
        readonly Dictionary<TownPlan, int> _placed = new Dictionary<TownPlan, int>();

        public AutoPlayer(World world, List<TownPlan> plans, List<string> researchOrder)
        {
            World = world;
            Plans = plans;
            ResearchOrder = researchOrder;
        }

        /// <summary>Paint each planned building's hex with the terrain it needs (test boards only) and assign spots.</summary>
        public static void LayOut(World world, IEnumerable<TownPlan> plans)
        {
            var board = world.Board;
            foreach (var plan in plans)
            {
                board[plan.Center] = Terrain.Barren;
                var ring = new List<Hex>();
                for (int radius = 1; radius <= 4; radius++)
                    foreach (var h in Ring(plan.Center, radius))
                        if (board.Contains(h)) ring.Add(h);
                plan.Spots.Clear();
                for (int i = 0; i < plan.Builds.Count && i < ring.Count; i++)
                {
                    var def = world.Content.Building(plan.Builds[i]);
                    var h = ring[i];
                    board[h] = def.Kind == BuildingKind.Extractor ? def.Terrains[0] : Terrain.Barren;
                    plan.Spots.Add(h);
                }
            }
        }

        static IEnumerable<Hex> Ring(Hex c, int radius)
        {
            var h = new Hex(c.Q - radius, c.R + radius);
            for (int side = 0; side < 6; side++)
                for (int step = 0; step < radius; step++)
                {
                    yield return h;
                    h = h.Neighbor(side);
                }
        }

        public void Step()
        {
            if (World.Tick % ThinkEveryTicks == 0) Think();
            World.Step();
        }

        public void Run(int ticks)
        {
            for (int i = 0; i < ticks; i++) Step();
        }

        void Think()
        {
            var w = World;
            var castle = w.Castle;

            if (castle != null && castle.Find("research_center") == null)
                for (int d = 0; d < 6; d++)
                    if (w.PlaceBuilding(w.Content.Building("research_center"), castle.Center.Neighbor(d), out _).Ok) break;

            if (castle != null && w.ActiveResearch == null)
                foreach (var id in ResearchOrder)
                {
                    var node = w.Content.ResearchNode(id);
                    if (node != null && ResearchSim.IsAvailable(w, node))
                    {
                        ResearchSim.Start(w, id);
                        break;
                    }
                }

            var rc = castle?.Find("research_center");
            if (rc != null && w.CanUpgradeCastleBuilding(rc).Ok && w.Treasury > 3000) w.UpgradeCastleBuilding(rc);

            foreach (var plan in Plans)
            {
                if (!_towns.TryGetValue(plan, out var town))
                {
                    if (w.Treasury >= w.Content.Balance.TownFoundCost + TreasuryReserve && w.FoundTown(plan.Center, out town).Ok)
                    {
                        town.Name = plan.Name ?? town.Name;
                        _towns[plan] = town;
                        _placed[plan] = 0;
                    }
                    break; // found Towns in order
                }
                if (!town.Built) continue;
                BuildNext(plan, town);
                ManageTown(town);
            }

            // ☆ Priority for producers of anything the Castle needs for research.
            if (castle != null)
                foreach (var t in w.Towns)
                    foreach (var b in t.Buildings)
                        if (b.IsWorkplace && b.Def.OutputGood >= 0)
                            b.Priority = ResearchSim.RemainingNeed(w, b.Def.OutputGood) > 0;

            // Crown Give: keep importing Towns solvent once the treasury can afford it.
            foreach (var t in w.Towns)
                if (t.Gold < 1000 && w.Treasury > 5000 && w.CanGive(t).Ok) w.Give(t);

            if (w.Treasury < 800)
            {
                Town richest = null;
                foreach (var t in w.Towns)
                    if (w.CanTake(t).Ok && t.Gold >= 2000 && (richest == null || t.Gold > richest.Gold)) richest = t;
                if (richest != null) w.Take(richest);
            }
        }

        void BuildNext(TownPlan plan, Town town)
        {
            var w = World;
            for (int i = 0; i < plan.Builds.Count && i < plan.Spots.Count; i++)
            {
                var spot = plan.Spots[i];
                if (town.Occupies(spot)) continue;
                var def = w.Content.Building(plan.Builds[i]);
                if (!w.IsUnlocked(def)) continue;
                if (w.Treasury < def.GoldCost + TreasuryReserve) return;
                if (w.SlotsUsed(town) >= w.SlotCap(town))
                {
                    if (w.CanLevelUp(town).Ok) w.LevelUp(town);
                    return;
                }
                if (w.PlaceBuilding(def, spot, out _).Ok) return;
            }
        }

        void ManageTown(Town town)
        {
            var w = World;
            if (w.CanLevelUp(town).Ok && town.Gold > w.Content.Balance.TownLevelCost[town.Level - 1] + 1500) w.LevelUp(town);

            foreach (var b in town.Buildings)
            {
                if (b.IsUpgrading) return;
            }
            foreach (var b in town.Buildings)
            {
                if (!b.IsHouse || !b.Built) continue;
                if (town.Gold < 1200) return;
                if (w.CanUpgrade(b).Ok)
                {
                    w.StartUpgrade(b);
                    return;
                }
            }
        }

        public string Report()
        {
            var w = World;
            var pop = new double[4];
            foreach (var t in w.Towns)
                for (int i = 0; i < 4; i++) pop[i] += t.Population[i];
            var mission = MissionSim.Current(w);
            return $"t={w.Tick / 120}min towns={w.Towns.Count} mission={w.MissionIndex}:{mission?.Id ?? "done"} research={w.ResearchDone.Count} active={w.ActiveResearch ?? "-"} " +
                   $"pop P{pop[0]:0.0}/W{pop[1]:0.0}/B{pop[2]:0.0}/A{pop[3]:0.0} treasury={w.Treasury:0} tariff={w.LifetimeTariff:0} estate={MissionSim.EstateHappiness(w):0.0}";
        }
    }
}
