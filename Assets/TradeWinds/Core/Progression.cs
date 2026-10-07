using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>Castle Compound upkeep: Provisioners turn food into provisions for Scouts (GDD §11).</summary>
    public static class CastleSim
    {
        public static void Tick(World world)
        {
            var castle = world.Castle;
            var b = world.Content.Balance;
            if (++castle.ProvisionTimer < b.Ticks(b.ProvisionerSec)) return;
            castle.ProvisionTimer = 0;
            if (!world.Content.HasGood("potato")) return;
            int potato = world.Content.GoodIndex("potato");

            if (castle.Find("provisioner") != null && castle.Provisions + 1 <= b.ProvisionsCap && Spare(world, potato) >= 2)
            {
                castle.Stock[potato] -= 2;
                castle.Provisions += 1;
            }
            if (world.Content.HasGood("fish") && castle.Find("advanced_provisioner") != null && castle.Provisions + 2 <= b.ProvisionsCap)
            {
                int fish = world.Content.GoodIndex("fish");
                if (Spare(world, potato) >= 1 && Spare(world, fish) >= 1)
                {
                    castle.Stock[potato] -= 1;
                    castle.Stock[fish] -= 1;
                    castle.Provisions += 2;
                }
            }
        }

        /// <summary>Castle Stock not held for the active research.</summary>
        static double Spare(World world, int good) => world.Castle.Stock[good] - ResearchSim.RemainingNeed(world, good);
    }

    /// <summary>Goods-only research metered by the Research Center (GDD §11).</summary>
    public static class ResearchSim
    {
        public static bool IsAvailable(World world, ResearchNode node)
        {
            if (world.ResearchDone.Contains(node.Id)) return false;
            foreach (var r in node.Requires)
                if (!world.ResearchDone.Contains(r)) return false;
            return true;
        }

        public static double Speed(World world)
        {
            var rc = world.Castle?.Find("research_center");
            if (rc == null) return 0;
            var speeds = world.Content.Balance.ResearchSpeedByLevel;
            return speeds[Math.Min(rc.Level, speeds.Length) - 1];
        }

        /// <summary>What the active research still needs of a Good.</summary>
        public static double RemainingNeed(World world, int good)
        {
            if (world.ActiveResearch == null) return 0;
            var node = world.Content.ResearchNode(world.ActiveResearch);
            foreach (var m in node.Materials)
                if (m.Good == good) return Math.Max(0, m.Amount - world.ResearchConsumed[good]);
            return 0;
        }

        /// <summary>0..1 progress of the active research.</summary>
        public static double Progress(World world)
        {
            if (world.ActiveResearch == null) return 0;
            var node = world.Content.ResearchNode(world.ActiveResearch);
            double total = 0, done = 0;
            foreach (var m in node.Materials)
            {
                total += m.Amount;
                done += Math.Min(m.Amount, world.ResearchConsumed[m.Good]);
            }
            return total > 0 ? done / total : 1;
        }

        /// <summary>Start a node now, or queue it if something is already running.</summary>
        public static CommandResult Start(World world, string id)
        {
            var node = world.Content.ResearchNode(id);
            if (node == null) return CommandResult.Fail("Unknown research.");
            if (world.ResearchDone.Contains(id)) return CommandResult.Fail("Already researched.");
            if (world.ActiveResearch == id || world.ResearchQueue.Contains(id)) return CommandResult.Fail("Already planned.");
            if (world.ActiveResearch == null && IsAvailable(world, node))
            {
                Begin(world, id);
                return CommandResult.Success;
            }
            world.ResearchQueue.Add(id);
            return CommandResult.Success;
        }

        public static void Cancel(World world, string id)
        {
            if (world.ActiveResearch == id)
            {
                world.ActiveResearch = null;
                Array.Clear(world.ResearchConsumed, 0, world.ResearchConsumed.Length);
            }
            world.ResearchQueue.Remove(id);
        }

        static void Begin(World world, string id)
        {
            world.ActiveResearch = id;
            world.ResearchTimer = 0;
            Array.Clear(world.ResearchConsumed, 0, world.ResearchConsumed.Length);
        }

        public static void Tick(World world)
        {
            if (world.ActiveResearch == null)
            {
                foreach (var q in world.ResearchQueue)
                {
                    var n = world.Content.ResearchNode(q);
                    if (n != null && IsAvailable(world, n))
                    {
                        world.ResearchQueue.Remove(q);
                        Begin(world, q);
                        break;
                    }
                }
                if (world.ActiveResearch == null) return;
            }

            double speed = Speed(world);
            if (speed <= 0) return;
            var b = world.Content.Balance;
            if (++world.ResearchTimer < b.TicksPerSecond) return;
            world.ResearchTimer = 0;

            // Drain every material in equal proportion so a node's inputs finish together; any shortfall pauses it.
            var node = world.Content.ResearchNode(world.ActiveResearch);
            double largest = 0;
            foreach (var m in node.Materials) largest = Math.Max(largest, m.Amount);
            double seconds = Math.Max(1, Math.Ceiling(largest / speed));
            var stock = world.Castle.Stock;
            var take = new double[node.Materials.Length];
            for (int i = 0; i < node.Materials.Length; i++)
            {
                var m = node.Materials[i];
                take[i] = Math.Min(m.Amount / seconds, m.Amount - world.ResearchConsumed[m.Good]);
                if (stock[m.Good] + 1e-9 < take[i]) return;
            }
            for (int i = 0; i < node.Materials.Length; i++)
            {
                var m = node.Materials[i];
                stock[m.Good] -= take[i];
                world.ResearchConsumed[m.Good] += take[i];
            }

            foreach (var m in node.Materials)
                if (world.ResearchConsumed[m.Good] + 1e-6 < m.Amount) return;

            world.ResearchDone.Add(node.Id);
            world.Stats.ResearchDone++;
            world.ActiveResearch = null;
            Array.Clear(world.ResearchConsumed, 0, world.ResearchConsumed.Length);
            world.SyncScouts();
            world.Log($"Research complete: {node.Name}.");
        }
    }

    /// <summary>Scouts walk discovered land, reveal fog and spend provisions (GDD §4, §11).</summary>
    public static class ScoutSim
    {
        public static CommandResult Explore(World world, Scout scout, Hex flag)
        {
            if (!world.Board.Contains(flag)) return CommandResult.Fail("Outside the board.");
            if (!world.IsRevealed(flag)) return CommandResult.Fail("Pick a discovered hex near the fog.");
            scout.Flag = flag;
            scout.HasFlag = true;
            scout.Path.Clear();
            scout.PathIndex = 0;
            if (scout.State == ScoutState.Idle || scout.State == ScoutState.Returning) scout.State = ScoutState.Exploring;
            return CommandResult.Success;
        }

        public static void Recall(World world, Scout scout)
        {
            scout.HasFlag = false;
            StartReturn(world, scout);
        }

        public static void Tick(World world)
        {
            foreach (var s in world.Scouts) Step(world, s);
        }

        static void Step(World world, Scout s)
        {
            var b = world.Content.Balance;
            var castle = world.Castle;
            if (s.PauseTicks > 0)
            {
                s.PauseTicks--;
                return;
            }

            switch (s.State)
            {
                case ScoutState.Idle:
                    return;

                case ScoutState.Refilling:
                    if (s.Carry < b.ScoutCarry && castle.Provisions >= 0.5)
                    {
                        double add = Math.Min(0.5, Math.Min(b.ScoutCarry - s.Carry, castle.Provisions));
                        s.Carry += add;
                        castle.Provisions -= add;
                        return;
                    }
                    s.State = s.HasFlag && s.Carry >= 1 ? ScoutState.Exploring : ScoutState.Idle;
                    return;

                case ScoutState.Returning:
                    if (Walk(world, s))
                    {
                        s.State = ScoutState.Refilling;
                        s.Path.Clear();
                    }
                    return;

                case ScoutState.Exploring:
                    if (s.Path.Count == 0 || s.PathIndex >= s.Path.Count)
                    {
                        if (s.Carry < 1)
                        {
                            StartReturn(world, s);
                            return;
                        }
                        var stop = PickStop(world, s);
                        if (stop == null)
                        {
                            s.HasFlag = false;
                            StartReturn(world, s);
                            return;
                        }
                        s.Path = FindPath(world, s.Position, stop.Value);
                        s.PathIndex = 0;
                        if (s.Path.Count == 0)
                        {
                            s.HasFlag = false;
                            StartReturn(world, s);
                        }
                        return;
                    }
                    if (Walk(world, s))
                    {
                        int revealed = world.RevealAround(s.Position, b.ScoutRevealRadius, (int)Math.Floor(s.Carry));
                        s.Carry -= revealed;
                        s.Path.Clear();
                        s.PauseTicks = b.ScoutPauseTicks;
                    }
                    return;
            }
        }

        static void StartReturn(World world, Scout s)
        {
            s.State = ScoutState.Returning;
            s.Path = FindPath(world, s.Position, world.Castle.Center);
            s.PathIndex = 0;
            if (s.Path.Count == 0 || s.Position == world.Castle.Center)
            {
                s.Position = world.Castle.Center;
                s.State = ScoutState.Refilling;
            }
        }

        /// <summary>Advance along the path; true when the end is reached.</summary>
        static bool Walk(World world, Scout s)
        {
            if (s.PathIndex >= s.Path.Count) return true;
            int steps = world.Roads.Contains(s.Position) ? 2 : 1;
            for (int i = 0; i < steps && s.PathIndex < s.Path.Count; i++)
                s.Position = s.Path[s.PathIndex++];
            return s.PathIndex >= s.Path.Count;
        }

        static Hex? PickStop(World world, Scout s)
        {
            var b = world.Content.Balance;
            Hex? best = null;
            int bestScore = 0, bestDist = int.MaxValue;
            int r = b.ScoutSearchRadius;
            for (int dq = -r; dq <= r; dq++)
            for (int dr = Math.Max(-r, -dq - r); dr <= Math.Min(r, -dq + r); dr++)
            {
                var h = new Hex(s.Flag.Q + dq, s.Flag.R + dr);
                if (!world.Board.Contains(h) || !world.IsRevealed(h) || !world.Board.IsPassable(h)) continue;
                int score = FogAround(world, h, b.ScoutRevealRadius);
                if (score == 0) continue;
                int dist = Hex.Distance(h, s.Position);
                if (score > bestScore || (score == bestScore && dist < bestDist))
                {
                    best = h;
                    bestScore = score;
                    bestDist = dist;
                }
            }
            return best;
        }

        static int FogAround(World world, Hex c, int radius)
        {
            int n = 0;
            for (int dq = -radius; dq <= radius; dq++)
            for (int dr = Math.Max(-radius, -dq - radius); dr <= Math.Min(radius, -dq + radius); dr++)
            {
                var h = new Hex(c.Q + dq, c.R + dr);
                if (world.Board.Contains(h) && !world.IsRevealed(h)) n++;
            }
            return n;
        }

        /// <summary>BFS over discovered, passable hexes (excludes the start, includes the goal).</summary>
        public static List<Hex> FindPath(World world, Hex from, Hex to)
        {
            var result = new List<Hex>();
            if (from == to) return result;
            var prev = new Dictionary<Hex, Hex>();
            var queue = new Queue<Hex>();
            queue.Enqueue(from);
            prev[from] = from;
            while (queue.Count > 0)
            {
                var cur = queue.Dequeue();
                if (cur == to) break;
                for (int d = 0; d < 6; d++)
                {
                    var n = cur.Neighbor(d);
                    if (prev.ContainsKey(n)) continue;
                    if (n != to && (!world.Board.IsPassable(n) || !world.IsRevealed(n))) continue;
                    if (!world.Board.Contains(n)) continue;
                    prev[n] = cur;
                    queue.Enqueue(n);
                }
            }
            if (!prev.ContainsKey(to)) return result;
            var c = to;
            while (c != from)
            {
                result.Add(c);
                c = prev[c];
            }
            result.Reverse();
            return result;
        }
    }

    /// <summary>The Mission chain: sequential Crown goals that pay gold; completing the last is Victory (GDD §11).</summary>
    public static class MissionSim
    {
        public static MissionDef Current(World world) =>
            world.MissionIndex < world.Content.Missions.Length ? world.Content.Missions[world.MissionIndex] : null;

        public static void Tick(World world)
        {
            if (world.Tick % world.Content.Balance.TicksPerSecond != 0) return;
            var m = Current(world);
            if (m == null) return;
            foreach (var o in m.Objectives)
                if (Progress(world, o) + 1e-9 < o.Count) return;

            world.Treasury += m.RewardGold;
            world.MissionGoldEarned += m.RewardGold;
            world.MissionIndex++;
            world.Log(m.RewardGold > 0 ? $"Mission complete: {m.Name} (+{m.RewardGold:0} gold)." : $"Mission complete: {m.Name}.");
            if (world.MissionIndex >= world.Content.Missions.Length && !world.Victory)
            {
                world.Victory = true;
                world.VictoryTick = world.Tick;
                world.Log("Victory! The Kingdom thrives.");
            }
        }

        public static double Progress(World world, Objective o)
        {
            switch (o.Kind)
            {
                case ObjectiveKind.FoundTowns:
                {
                    int n = 0;
                    foreach (var t in world.Towns) if (t.Built) n++;
                    return n;
                }
                case ObjectiveKind.Construct:
                {
                    int n = 0;
                    foreach (var t in world.Towns)
                        foreach (var b in t.Buildings)
                            if (b.Built && (o.Target == null || b.Def.Id == o.Target)) n++;
                    if (world.Castle != null)
                        foreach (var c in world.Castle.Compound)
                            if (o.Target == null || c.Def.Id == o.Target) n++;
                    return n;
                }
                case ObjectiveKind.Upgrades: return world.Stats.Upgrades;
                case ObjectiveKind.TradeGood:
                    return world.Content.HasGood(o.Target) ? world.Stats.GoodsTraded[world.Content.GoodIndex(o.Target)] : 0;
                case ObjectiveKind.TariffEarned: return world.LifetimeTariff;
                case ObjectiveKind.ResearchDone: return world.Stats.ResearchDone;
                case ObjectiveKind.Residents:
                {
                    double n = 0;
                    foreach (var t in world.Towns) n += t.Population[(int)o.Tier];
                    return Math.Floor(n + 1e-6);
                }
                case ObjectiveKind.EstateHappiness: return EstateHappiness(world);
                default: return 0;
            }
        }

        /// <summary>Best Aristocrat happiness (needs only, not boosted by Give) in a Town with a lived-in Aristocrats Home.</summary>
        public static double EstateHappiness(World world)
        {
            double best = 0;
            foreach (var t in world.Towns)
                if (t.Population[(int)Tier.Aristocrat] >= 0.5)
                    best = Math.Max(best, t.Happiness[(int)Tier.Aristocrat]);
            return best;
        }
    }
}
