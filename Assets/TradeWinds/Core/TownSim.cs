using System;

namespace TradeWinds.Core
{
    /// <summary>One Town's economy tick: construction and upgrades, staffing, production, Porters, consumption,
    /// happiness, population, Tax and prices (GDD §5–§9).</summary>
    public static class TownSim
    {
        public static void Tick(World world, Town town)
        {
            var b = world.Content.Balance;
            if (!town.Built)
            {
                if (world.Tick - town.FoundedTick >= b.Ticks(b.TownBuildSec))
                {
                    town.Built = true;
                    town.BuiltTick = world.Tick;
                    world.RevealAround(town.Center, 1);
                    world.Log($"{town.Name} is ready.");
                }
                else return;
            }

            world.SyncFleets(town);
            ResolvePorters(world, town);
            FinishConstruction(world, town);
            Array.Clear(town.ConsumptionPerMin, 0, town.ConsumptionPerMin.Length);
            Staff(world, town);
            Produce(world, town);
            ConsumeAndSatisfy(world, town);
            UpdatePopulation(world, town);
            CollectTax(world, town);
            AssignPorters(world, town);
            UpdatePrices(world, town);
        }

        // ------------------------------------------------------------------ construction & upgrades

        static void FinishConstruction(World world, Town town)
        {
            var b = world.Content.Balance;
            foreach (var bld in town.Buildings)
            {
                if (!bld.Built)
                {
                    if (world.Tick - bld.PlacedTick < b.Ticks(bld.Def.BuildSec)) continue;
                    if (!bld.AllMaterialsDelivered()) continue;
                    bld.Built = true;
                    Array.Clear(bld.Delivered, 0, bld.Delivered.Length);
                    world.RevealAround(bld.Hex, 1);
                }
                else if (bld.IsUpgrading)
                {
                    if (world.Tick - bld.UpgradeStartTick < b.Ticks(UpgradeSec(b, bld))) continue;
                    if (!bld.AllMaterialsDelivered()) continue;
                    bld.Level = bld.UpgradingTo;
                    bld.UpgradingTo = 0;
                    Array.Clear(bld.Delivered, 0, bld.Delivered.Length);
                    world.Stats.Upgrades++;
                    world.Log($"{bld.Def.Name} in {town.Name} upgraded to level {bld.Level}.");
                }
            }
        }

        static double UpgradeSec(Balance b, Building bld) => Math.Min(20, bld.Def.BuildSec + 2 * (bld.UpgradingTo - 1));

        /// <summary>0..1 — the lower of time elapsed and share of materials delivered.</summary>
        public static double ConstructionProgress(World world, Building bld)
        {
            if (!bld.NeedsMaterials) return 1;
            var b = world.Content.Balance;
            long start = bld.Built ? bld.UpgradeStartTick : bld.PlacedTick;
            double secs = bld.Built ? UpgradeSec(b, bld) : bld.Def.BuildSec;
            int need = Math.Max(1, b.Ticks(secs));
            double time = Math.Min(1, (world.Tick - start) / (double)need);
            double total = 0, got = 0;
            foreach (var m in bld.ActiveBill)
            {
                total += m.Amount;
                got += Math.Min(m.Amount, bld.Delivered[m.Good]);
            }
            double mats = total > 0 ? got / total : 1;
            return Math.Min(time, mats);
        }

        // ------------------------------------------------------------------ staffing & production

        static bool CanWork(Building bld) => bld.Built && bld.IsWorkplace && !bld.IsUpgrading;

        static void Staff(World world, Town town)
        {
            var content = world.Content;
            var b = content.Balance;
            var free = (double[])town.Population.Clone();
            foreach (var bld in town.Buildings) bld.Workers = 0;

            // Pass 1: producers of a Basic Need the Town is short of (under 2 min of use) feed themselves first.
            foreach (var bld in town.Buildings)
            {
                if (!CanWork(bld) || bld.Def.OutputGood < 0) continue;
                int g = bld.Def.OutputGood;
                if (!content.IsBasicNeed(g)) continue;
                double use = ResidentUsePerMin(content, town, g);
                if (use <= 0 || town.Stock[g] >= use * 2) continue;
                AssignWorkers(bld, free);
            }

            // Pass 2: ☆ priority; pass 3: the rest; blocked (full) producers last.
            foreach (var bld in town.Buildings)
                if (CanWork(bld) && bld.Priority && bld.Workers == 0) AssignWorkers(bld, free);
            foreach (var bld in town.Buildings)
                if (CanWork(bld) && bld.Workers == 0 && bld.OutputStore < b.ProducerStoreCap) AssignWorkers(bld, free);
            foreach (var bld in town.Buildings)
                if (CanWork(bld) && bld.Workers == 0) AssignWorkers(bld, free);
        }

        static void AssignWorkers(Building bld, double[] free)
        {
            int tier = (int)bld.Def.Tier;
            double n = Math.Min(bld.WorkerSlots(), free[tier]);
            if (n <= 0) return;
            bld.Workers = n;
            free[tier] -= n;
        }

        public static double WorkSpeed(World world, Town town)
        {
            var b = world.Content.Balance;
            return b.WorkSpeedBase + b.WorkSpeedPerHappy * town.OverallHappiness(b.StartHappiness, world.Tick) / 100.0;
        }

        /// <summary>Output units per tick at full crew right now (for UI and buffers).</summary>
        public static double OutputRate(World world, Building bld)
        {
            var b = world.Content.Balance;
            double research = bld.Def.Kind == BuildingKind.Extractor
                ? world.ModifierProduct(Modifier.ExtractorOutput)
                : world.ModifierProduct(Modifier.ProcessorOutput);
            return b.PerTick(bld.Def.OutputPerWorkerPerMin) * bld.UpgradeMultiplier(UpgradeEffect.Output) * research;
        }

        static void Produce(World world, Town town)
        {
            var b = world.Content.Balance;
            double speed = WorkSpeed(world, town);
            int batchTicks = b.Ticks(b.BatchSec);

            foreach (var bld in town.Buildings)
            {
                if (!CanWork(bld) || bld.Def.OutputGood < 0) continue;

                if (bld.OutputStore < b.ProducerStoreCap && bld.Workers > 0)
                {
                    double units = OutputRate(world, bld) * bld.Workers * speed;
                    foreach (var input in bld.Def.InputsPerOutput)
                        units = Math.Min(units, bld.Buffer[input.Good] / input.Amount);
                    foreach (var input in bld.Def.InputsPerOutput)
                    {
                        double used = units * input.Amount;
                        bld.Buffer[input.Good] -= used;
                    }
                    bld.Pending += units;
                }

                foreach (var input in bld.Def.InputsPerOutput)
                    town.ConsumptionPerMin[input.Good] += OutputRate(world, bld) * bld.Workers * input.Amount * 60 * b.TicksPerSecond;

                if (++bld.BatchTimer >= batchTicks)
                {
                    bld.BatchTimer = 0;
                    double move = Math.Min(bld.Pending, b.ProducerStoreCap - bld.OutputStore);
                    if (move > 0)
                    {
                        bld.OutputStore += move;
                        bld.Pending -= move;
                    }
                }
            }
        }

        // ------------------------------------------------------------------ people

        public static double HouseCapacity(World world, Building house) =>
            (house.Def.HouseCapacity + house.ExtraCapacity()) * world.ModifierProduct(Modifier.HousingBonus);

        public static double TierCapacity(World world, Town town, int tier)
        {
            double cap = 0;
            foreach (var bld in town.Buildings)
                if (bld.Built && bld.IsHouse && (int)bld.Def.Tier == tier) cap += HouseCapacity(world, bld);
            return cap;
        }

        /// <summary>Residents' use of a Good per game-minute at current population.</summary>
        public static double ResidentUsePerMin(Content content, Town town, int good)
        {
            double use = 0;
            for (int t = 0; t < 4; t++)
            {
                if (town.Population[t] <= 0) continue;
                foreach (var n in content.Tiers[t].Basic)
                    if (n.Good == good) use += n.Amount * town.Population[t];
                foreach (var n in content.Tiers[t].Luxury)
                    if (n.Good == good) use += n.Amount * town.Population[t];
            }
            return use;
        }

        static void ConsumeAndSatisfy(World world, Town town)
        {
            var content = world.Content;
            var b = content.Balance;

            for (int tier = 0; tier < 4; tier++)
            {
                var needs = content.Tiers[tier];
                double cap = TierCapacity(world, town, tier);
                if (cap <= 0) continue;

                int nb = needs.Basic.Length, nl = needs.Luxury.Length;
                var basicSat = new double[nb];
                var luxSat = new double[nl];

                foreach (var bld in town.Buildings)
                {
                    if (!bld.Built || !bld.IsHouse || (int)bld.Def.Tier != tier) continue;
                    double weight = HouseCapacity(world, bld) / cap;
                    bld.Residents = town.Population[tier] * weight;
                    double basicMult = bld.UpgradeMultiplier(UpgradeEffect.BasicUse);
                    double luxMult = bld.UpgradeMultiplier(UpgradeEffect.LuxuryUse);

                    if (bld.Residents <= 1e-9)
                    {
                        // Empty house: satisfaction follows what's on the shelf.
                        for (int i = 0; i < nb; i++) basicSat[i] += weight * (OnShelf(town, bld, needs.Basic[i].Good) ? 1 : 0);
                        for (int i = 0; i < nl; i++) luxSat[i] += weight * (OnShelf(town, bld, needs.Luxury[i].Good) ? 1 : 0);
                        continue;
                    }

                    // Basic Needs are eaten only when all of them are present.
                    bool allBasic = true;
                    for (int i = 0; i < nb; i++)
                    {
                        double want = bld.Residents * b.PerTick(needs.Basic[i].Amount) * basicMult;
                        bool has = bld.Buffer[needs.Basic[i].Good] + 1e-9 >= want;
                        basicSat[i] += weight * (has ? 1 : 0);
                        if (!has) allBasic = false;
                    }

                    foreach (var n in needs.Basic)
                    {
                        town.ConsumptionPerMin[n.Good] += bld.Residents * n.Amount * basicMult;
                        if (allBasic) bld.Buffer[n.Good] -= bld.Residents * b.PerTick(n.Amount) * basicMult;
                    }

                    for (int i = 0; i < nl; i++)
                    {
                        var n = needs.Luxury[i];
                        double want = bld.Residents * b.PerTick(n.Amount) * luxMult;
                        town.ConsumptionPerMin[n.Good] += bld.Residents * n.Amount * luxMult;
                        if (bld.Buffer[n.Good] + 1e-9 >= want)
                        {
                            bld.Buffer[n.Good] -= want;
                            luxSat[i] += weight;
                        }
                    }
                }

                var sat = town.Satisfaction[tier];
                double basicAvg = 0, luxAvg = 0;
                for (int i = 0; i < nb; i++)
                {
                    int g = needs.Basic[i].Good;
                    sat[g] += (basicSat[i] - sat[g]) * b.SatisfactionSmoothing;
                    basicAvg += sat[g];
                }
                for (int i = 0; i < nl; i++)
                {
                    int g = needs.Luxury[i].Good;
                    sat[g] += (luxSat[i] - sat[g]) * b.SatisfactionSmoothing;
                    luxAvg += sat[g];
                }
                basicAvg = nb > 0 ? basicAvg / nb : 1;
                luxAvg = nl > 0 ? luxAvg / nl : 1;

                double target = b.BasicHappy * basicAvg + b.LuxuryHappy * luxAvg;
                town.Happiness[tier] += (target - town.Happiness[tier]) * b.HappinessEase;
            }
        }

        static bool OnShelf(Town town, Building house, int good) => house.Buffer[good] > 0 || town.Stock[good] > 0;

        static void UpdatePopulation(World world, Town town)
        {
            var b = world.Content.Balance;
            for (int tier = 0; tier < 4; tier++)
            {
                double cap = TierCapacity(world, town, tier);
                if (cap <= 0)
                {
                    town.Population[tier] = 0;
                    continue;
                }

                // Needs-only happiness: a Crown Take hurts mood and Tax, not the housing itself.
                double target = Math.Round(cap * Math.Min(1, town.Happiness[tier] / b.FullHousingAt));
                double pop = town.Population[tier];
                if (pop < target)
                {
                    town.TicksOverTarget[tier] = 0;
                    pop += (target - pop) * b.GrowthPerTick;
                    if (target - pop < 0.01) pop = target;
                }
                else if (pop > target)
                {
                    if (++town.TicksOverTarget[tier] > b.DeclineDelayTicks)
                    {
                        pop += (target - pop) * b.DeclinePerTick;
                        if (pop - target < 0.01) pop = target;
                    }
                }
                else town.TicksOverTarget[tier] = 0;

                town.Population[tier] = Math.Min(cap, Math.Max(0, pop));
            }

            double total = 0;
            foreach (var t in world.Towns) total += t.TotalPopulation;
            if (total > world.Stats.PeakPopulation) world.Stats.PeakPopulation = total;
        }

        static void CollectTax(World world, Town town)
        {
            var content = world.Content;
            var b = content.Balance;
            for (int tier = 0; tier < 4; tier++)
            {
                double pop = town.Population[tier];
                if (pop <= 0) continue;
                double mood = town.EffectiveHappiness(tier, world.Tick);
                double mult = 1 + b.TaxBonusPerHappyPoint * Math.Max(0, mood - b.FullHousingAt);
                if (mood < b.FullHousingAt) mult *= mood / b.FullHousingAt;
                double tax = pop * b.PerTick(content.Tiers[tier].TaxPerPersonPerMin) * mult;
                town.Gold += tax;
                town.TaxEarned += tax;
            }
        }

        // ------------------------------------------------------------------ porters

        static int LegTicks(World world, Town town, Building bld)
        {
            var b = world.Content.Balance;
            int hexes = Math.Max(1, Hex.Distance(town.Center, bld.Hex));
            return Math.Max(1, b.Ticks(hexes * b.PorterSecPerHex));
        }

        static void ResolvePorters(World world, Town town)
        {
            var b = world.Content.Balance;
            foreach (var p in town.Porters)
            {
                if (p.Job == PorterJob.Idle) continue;
                if (!p.Arrived && world.Tick >= p.ArriveTick)
                {
                    p.Arrived = true;
                    switch (p.Job)
                    {
                        case PorterJob.Collect:
                            town.Stock[p.Good] = Math.Min(b.StockCap, town.Stock[p.Good] + p.Amount);
                            break;
                        case PorterJob.DeliverNeeds:
                            p.Target.Buffer[p.Good] += p.Amount;
                            p.Target.BufferInbound[p.Good] -= p.Amount;
                            break;
                        case PorterJob.DeliverMaterials:
                            p.Target.Delivered[p.Good] += p.Amount;
                            p.Target.DeliveringNow[p.Good] -= p.Amount;
                            break;
                    }
                }

                if (p.Arrived && world.Tick >= p.FreeTick)
                {
                    p.Job = PorterJob.Idle;
                    p.Target = null;
                }
            }
        }

        static double CollectingNow(Town town, int good)
        {
            double sum = 0;
            foreach (var p in town.Porters)
                if (p.Job == PorterJob.Collect && !p.Arrived && p.Good == good) sum += p.Amount;
            return sum;
        }

        /// <summary>Stock construction must leave for residents' Basic Needs.</summary>
        static double BasicReserve(World world, Town town, int good)
        {
            var content = world.Content;
            if (!content.IsBasicNeed(good)) return 0;
            double perMin = 0;
            for (int t = 0; t < 4; t++)
                foreach (var n in content.Tiers[t].Basic)
                    if (n.Good == good) perMin += n.Amount * town.Population[t];
            return perMin * content.Balance.BasicReserveSec / 60.0;
        }

        public static double HouseBufferTarget(World world, Building house, double perPersonPerMin) =>
            Math.Max(world.Content.Balance.HouseBufferMin, HouseCapacity(world, house) * perPersonPerMin * world.Content.Balance.HouseBufferSec / 60.0);

        static double InputBufferTarget(World world, Building bld, double perOutput)
        {
            var b = world.Content.Balance;
            double perSec = OutputRate(world, bld) * bld.WorkerSlots() * b.TicksPerSecond * perOutput;
            return Math.Max(b.HouseBufferMin, perSec * b.InputBufferSec);
        }

        static void AssignPorters(World world, Town town)
        {
            foreach (var p in town.Porters)
            {
                if (p.Job != PorterJob.Idle) continue;
                if (TryCollect(world, town, p)) continue;
                if (TryDeliverMaterials(world, town, p)) continue;
                if (TryDeliverNeeds(world, town, p)) continue;
            }
        }

        static void StartJob(World world, Town town, Porter p, PorterJob job, Building target, int good, double amount)
        {
            int leg = LegTicks(world, town, target);
            p.Job = job;
            p.Target = target;
            p.Good = good;
            p.Amount = amount;
            p.Arrived = false;
            p.StartTick = world.Tick;
            if (job == PorterJob.Collect)
            {
                // Walk out, load, walk back, unload into Stock.
                p.ArriveTick = world.Tick + 2 * leg + 1;
                p.FreeTick = p.ArriveTick;
            }
            else
            {
                // Load at the centre, walk out, unload at the target, walk back.
                p.ArriveTick = world.Tick + leg + 1;
                p.FreeTick = world.Tick + 2 * leg + 2;
            }
        }

        static bool TryCollect(World world, Town town, Porter p)
        {
            var b = world.Content.Balance;
            Building best = null;
            foreach (var bld in town.Buildings)
            {
                if (!bld.IsWorkplace || bld.Def.OutputGood < 0 || bld.OutputStore < 1) continue;
                int g = bld.Def.OutputGood;
                if (b.StockCap - town.Stock[g] - CollectingNow(town, g) < 1) continue;
                if (best == null || bld.OutputStore > best.OutputStore) best = bld;
            }
            if (best == null) return false;

            int good = best.Def.OutputGood;
            double room = b.StockCap - town.Stock[good] - CollectingNow(town, good);
            double amount = Math.Min(b.PorterCapacity, Math.Min(best.OutputStore, room));
            best.OutputStore -= amount;
            StartJob(world, town, p, PorterJob.Collect, best, good, amount);
            return true;
        }

        static bool TryDeliverMaterials(World world, Town town, Porter p)
        {
            var b = world.Content.Balance;
            // Bootstrap producers and ☆ priority sites first.
            for (int pass = 0; pass < 2; pass++)
            foreach (var bld in town.Buildings)
            {
                if (!bld.NeedsMaterials) continue;
                if (pass == 0 && !bld.Priority && !(bld.IsWorkplace && !bld.Built && IsBootstrap(world, town, bld))) continue;
                foreach (var m in bld.ActiveBill)
                {
                    double outstanding = bld.MaterialOutstanding(m.Good);
                    if (outstanding <= 1e-9) continue;
                    double reserve = bld.IsWorkplace && m.Good == bld.Def.OutputGood ? 0 : BasicReserve(world, town, m.Good);
                    double available = town.Stock[m.Good] - reserve;
                    if (available <= 1e-9) continue;
                    double amount = Math.Min(b.PorterCapacity, Math.Min(outstanding, available));
                    town.Stock[m.Good] -= amount;
                    bld.DeliveringNow[m.Good] += amount;
                    StartJob(world, town, p, PorterJob.DeliverMaterials, bld, m.Good, amount);
                    return true;
                }
            }
            return false;
        }

        /// <summary>An unbuilt producer of a Good its own bill needs (e.g. the first Lumberjack) builds first.</summary>
        static bool IsBootstrap(World world, Town town, Building bld)
        {
            foreach (var m in bld.Def.MaterialCost)
                if (m.Good == bld.Def.OutputGood) return true;
            return false;
        }

        static bool TryDeliverNeeds(World world, Town town, Porter p)
        {
            var content = world.Content;
            var b = content.Balance;
            Building bestTarget = null;
            int bestGood = -1;
            double bestScore = 0, bestGap = 0;

            foreach (var bld in town.Buildings)
            {
                if (!bld.Built) continue;
                if (bld.IsHouse)
                {
                    var needs = content.Tiers[(int)bld.Def.Tier];
                    foreach (var n in needs.Basic) Consider(bld, n.Good, HouseBufferTarget(world, bld, n.Amount), 2.0);
                    foreach (var n in needs.Luxury) Consider(bld, n.Good, HouseBufferTarget(world, bld, n.Amount), 1.0);
                }
                else if (bld.Def.Kind == BuildingKind.Processor && bld.Workers > 0 && !bld.IsUpgrading)
                {
                    foreach (var i in bld.Def.InputsPerOutput) Consider(bld, i.Good, InputBufferTarget(world, bld, i.Amount), 1.5);
                }
            }

            void Consider(Building target, int good, double want, double priority)
            {
                if (town.Stock[good] < 1e-9) return;
                double gap = want - target.Buffer[good] - target.BufferInbound[good];
                if (gap < Math.Min(1, want * 0.5)) return;
                double score = gap / want * priority;
                if (score > bestScore)
                {
                    bestScore = score;
                    bestTarget = target;
                    bestGood = good;
                    bestGap = gap;
                }
            }

            if (bestTarget == null) return false;
            double amount = Math.Min(b.PorterCapacity, Math.Min(bestGap, town.Stock[bestGood]));
            town.Stock[bestGood] -= amount;
            bestTarget.BufferInbound[bestGood] += amount;
            StartJob(world, town, p, PorterJob.DeliverNeeds, bestTarget, bestGood, amount);
            return true;
        }

        // ------------------------------------------------------------------ prices

        /// <summary>Target price from minutes of cover: empty shelf ≈ 1.9× base, ~2 min ≈ 1×, surplus → 0.4×.</summary>
        public static double TargetPrice(Balance b, double basePrice, double stock, double consumptionPerMin)
        {
            if (stock <= 1e-9 && consumptionPerMin <= 1e-9) return basePrice;
            double ratio = stock / (Math.Max(b.PriceMinConsumptionPerMin, consumptionPerMin) * b.PriceCoverMin);
            double mult = Math.Min(b.PriceCeiling, Math.Max(b.PriceFloor, b.PriceCeiling - ratio));
            return basePrice * mult;
        }

        static void UpdatePrices(World world, Town town)
        {
            var content = world.Content;
            var b = content.Balance;
            for (int g = 0; g < content.GoodCount; g++)
            {
                double target = TargetPrice(b, content.Goods[g].BasePrice, town.Stock[g], town.ConsumptionPerMin[g]);
                town.Price[g] += (target - town.Price[g]) * b.PriceEase;
            }
        }
    }
}
