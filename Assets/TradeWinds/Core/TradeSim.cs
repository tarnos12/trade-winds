using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>Traders between Towns (and the Castle): buying decisions, travel, and the Crown's Tariff (GDD §8–§10).</summary>
    public static class TradeSim
    {
        public static void Tick(World world)
        {
            foreach (var town in world.Towns) town.CacheTick = -1;
            TickInner(world);
        }

        static void TickInner(World world)
        {
            foreach (var town in world.Towns)
                foreach (var trader in town.Traders)
                    Advance(world, trader);
            if (world.Castle != null)
                foreach (var trader in world.Castle.Traders)
                    Advance(world, trader);

            foreach (var town in world.Towns)
                if (town.Built) TryDispatch(world, town);
            if (world.Castle != null) TryRoyalDispatch(world);
        }

        static int LoadTicks(Balance b, double amount) =>
            Math.Max(1, (int)Math.Ceiling(amount / (b.LoadItemsPerSec / b.TicksPerSecond)));

        static void Advance(World world, Trader t)
        {
            if (t.State == TraderState.Idle || world.Tick < t.PhaseEndTick) return;
            var b = world.Content.Balance;
            switch (t.State)
            {
                case TraderState.Outbound:
                    t.State = TraderState.Loading;
                    t.PhaseEndTick = world.Tick + LoadTicks(b, t.Amount);
                    break;
                case TraderState.Loading:
                    t.State = TraderState.Inbound;
                    t.PhaseEndTick = world.Tick + t.LegTicks;
                    break;
                case TraderState.Inbound:
                    t.State = TraderState.Unloading;
                    t.PhaseEndTick = world.Tick + LoadTicks(b, t.Amount);
                    break;
                case TraderState.Unloading:
                    if (t.IsRoyal)
                    {
                        world.Castle.Stock[t.Good] += t.Amount;
                        world.Castle.Inbound[t.Good] -= t.Amount;
                    }
                    else
                    {
                        var home = t.Home;
                        home.Stock[t.Good] = Math.Min(b.StockCap, home.Stock[t.Good] + t.Amount);
                        home.Inbound[t.Good] -= t.Amount;
                    }
                    t.State = TraderState.Idle;
                    t.Seller = null;
                    t.Amount = 0;
                    break;
            }
        }

        // ------------------------------------------------------------------ demand

        /// <summary>Recompute the Town's per-Good demand flags once per tick (trade queries hit them a lot).</summary>
        static void EnsureCache(World world, Town town)
        {
            if (town.CacheTick == world.Tick && town.ConsumesCache != null) return;
            int n = world.Content.GoodCount;
            if (town.ConsumesCache == null)
            {
                town.ConsumesCache = new bool[n];
                town.BasicCache = new bool[n];
                town.ConstructionCache = new double[n];
            }
            Array.Clear(town.ConsumesCache, 0, n);
            Array.Clear(town.BasicCache, 0, n);
            Array.Clear(town.ConstructionCache, 0, n);
            var content = world.Content;
            foreach (var bld in town.Buildings)
            {
                if (bld.IsHouse)
                {
                    var needs = content.Tiers[(int)bld.Def.Tier];
                    foreach (var x in needs.Basic) { town.ConsumesCache[x.Good] = true; town.BasicCache[x.Good] = true; }
                    foreach (var x in needs.Luxury) town.ConsumesCache[x.Good] = true;
                }
                else
                {
                    foreach (var i in bld.Def.InputsPerOutput) town.ConsumesCache[i.Good] = true;
                }
                if (bld.NeedsMaterials)
                    foreach (var m in bld.ActiveBill) town.ConstructionCache[m.Good] += bld.MaterialOutstanding(m.Good);
            }
            town.CacheTick = world.Tick;
        }

        /// <summary>Does this Town use the Good itself (residents of a placed house tier, or processor input)?</summary>
        public static bool Consumes(World world, Town town, int good)
        {
            EnsureCache(world, town);
            return town.ConsumesCache[good];
        }

        static double ConstructionOutstanding(World world, Town town, int good)
        {
            EnsureCache(world, town);
            return town.ConstructionCache[good];
        }

        /// <summary>How much of a Good the Town wants on hand (floor for what it uses + construction lumps).</summary>
        public static double BuyTarget(World world, Town town, int good)
        {
            var b = world.Content.Balance;
            double target = ConstructionOutstanding(world, town, good);
            if (Consumes(world, town, good))
                target += Math.Max(b.BuyFloor, town.ConsumptionPerMin[good] * b.BuyCoverMin);
            return target;
        }

        public static double Shortfall(World world, Town town, int good) =>
            BuyTarget(world, town, good) - town.Stock[good] - town.Inbound[good];

        /// <summary>What a Town is willing to sell: Stock above its own buy target.</summary>
        public static double Surplus(World world, Town town, int good)
        {
            var b = world.Content.Balance;
            if (!town.Built || world.Tick - town.BuiltTick < b.Ticks(b.TownSellGraceSec)) return 0;
            return town.Stock[good] - BuyTarget(world, town, good);
        }

        /// <summary>What a Town will sell to the Crown: like <see cref="Surplus"/>, but the King outranks
        /// Luxuries — only Basic Needs and construction materials are held back.</summary>
        public static double CrownSurplus(World world, Town town, int good)
        {
            var b = world.Content.Balance;
            if (!town.Built || world.Tick - town.BuiltTick < b.Ticks(b.TownSellGraceSec)) return 0;
            double hold = ConstructionOutstanding(world, town, good);
            if (TownUsesAsBasic(world, town, good)) hold += Math.Max(b.BuyFloor, town.ConsumptionPerMin[good] * b.BuyCoverMin);
            return town.Stock[good] - hold;
        }

        /// <summary>What the Castle keeps of a Good: its buy limit plus what the active research still needs.</summary>
        public static double CastleKeep(World world, int good)
        {
            var o = world.Castle.Orders[good];
            return (o.Buy ? o.Limit : 0) + ResearchSim.RemainingNeed(world, good);
        }

        public static double CastleSurplus(World world, int good)
        {
            if (world.Castle == null || !world.Castle.Orders[good].Sell) return 0;
            return world.Castle.Stock[good] - CastleKeep(world, good);
        }

        public static double CastleWant(World world, int good)
        {
            if (world.Castle == null) return 0;
            return Math.Ceiling(CastleKeep(world, good) - 1e-6) - world.Castle.Stock[good] - world.Castle.Inbound[good];
        }

        public static double CastleSellPrice(World world, int good) =>
            world.Content.Goods[good].BasePrice * world.Content.Balance.CastleSellPriceMultiplier;

        static double Capacity(World world, Balance b) => b.TraderCapacity * world.ModifierProduct(Modifier.TraderCapacity);

        static int LegTicks(World world, Route route)
        {
            var b = world.Content.Balance;
            double speed = b.TraderHexesPerTick * world.ModifierProduct(Modifier.TraderSpeed);
            return Math.Max(b.MinLegTicks, (int)Math.Ceiling(route.Cost / speed));
        }

        // ------------------------------------------------------------------ town dispatch

        static void TryDispatch(World world, Town buyer)
        {
            var content = world.Content;
            var b = content.Balance;

            // Priority layers: Basic Needs → construction materials → production inputs / Luxuries.
            // Each layer may send one Trader per tick, so lower layers are never starved.
            for (int layer = 0; layer < 3; layer++)
            {
                Trader free = null;
                foreach (var t in buyer.Traders)
                    if (t.State == TraderState.Idle) { free = t; break; }
                if (free == null) return;

                var candidates = new List<(int good, double gap)>();
                for (int g = 0; g < content.GoodCount; g++)
                {
                    if (LayerOf(world, buyer, g) != layer) continue;
                    double gap = Shortfall(world, buyer, g);
                    // Construction must finish: chase even the last fraction of a material bill.
                    double minGap = ConstructionOutstanding(world, buyer, g) > 0 ? 0.01 : b.MinShortfall;
                    if (gap <= minGap) continue;
                    if (!HasSeller(world, buyer, g)) continue;
                    candidates.Add((g, gap));
                }
                if (candidates.Count == 0) continue;

                candidates.Sort((x, y) => y.gap.CompareTo(x.gap) != 0 ? y.gap.CompareTo(x.gap) : x.good.CompareTo(y.good));
                var pick = candidates[world.Rng.Range(Math.Min(b.ChoiceSpread, candidates.Count))];
                Buy(world, buyer, free, pick.good, pick.gap);
            }
        }

        /// <summary>0 = a Basic Need, 1 = construction-only material, 2 = inputs / Luxuries / other, -1 = not wanted.</summary>
        static int LayerOf(World world, Town town, int good)
        {
            var content = world.Content;
            bool consumes = Consumes(world, town, good);
            double construction = ConstructionOutstanding(world, town, good);
            if (consumes && content.IsBasicNeed(good) && TownUsesAsBasic(world, town, good)) return 0;
            if (!consumes && construction > 0) return 1;
            if (consumes || construction > 0) return 2;
            return -1;
        }

        static bool TownUsesAsBasic(World world, Town town, int good)
        {
            EnsureCache(world, town);
            return town.BasicCache[good];
        }

        static bool HasSeller(World world, Town buyer, int good)
        {
            foreach (var s in world.Towns)
                if (s != buyer && Surplus(world, s, good) >= 1) return true;
            return CastleSurplus(world, good) >= 1;
        }

        static bool Buy(World world, Town buyer, Trader trader, int good, double gap)
        {
            var content = world.Content;
            var b = content.Balance;

            var offers = new List<(Town seller, double surplus, double price, Route route)>();
            foreach (var s in world.Towns)
            {
                if (s == buyer) continue;
                double surplus = Surplus(world, s, good);
                if (surplus < 1) continue;
                var route = world.Pathing.Find(buyer.Center, s.Center);
                if (!route.Found) continue;
                offers.Add((s, surplus, s.Price[good], route));
            }

            bool fromCastle = false;
            if (offers.Count == 0)
            {
                // The Castle is the seller of last resort.
                double surplus = CastleSurplus(world, good);
                if (surplus < 1) return false;
                var route = world.Pathing.Find(buyer.Center, world.Castle.Center);
                if (!route.Found) return false;
                offers.Add((null, surplus, CastleSellPrice(world, good), route));
                fromCastle = true;
            }

            bool starving = content.IsBasicNeed(good) && buyer.Stock[good] < 0.25 * BuyTarget(world, buyer, good);
            offers.Sort((x, y) =>
            {
                int c;
                if (starving && (c = x.route.Cost.CompareTo(y.route.Cost)) != 0) return c;
                if ((c = y.surplus.CompareTo(x.surplus)) != 0) return c;
                if ((c = x.price.CompareTo(y.price)) != 0) return c;
                if ((c = x.route.Cost.CompareTo(y.route.Cost)) != 0) return c;
                return (x.seller?.Id ?? 0).CompareTo(y.seller?.Id ?? 0);
            });
            var offer = offers[world.Rng.Range(Math.Min(b.ChoiceSpread, offers.Count))];

            double qty = Math.Min(Capacity(world, b), Math.Min(Math.Max(1, Math.Ceiling(gap)), Math.Floor(offer.surplus)));
            if (offer.price > 0) qty = Math.Min(qty, Math.Floor(buyer.Gold / offer.price));
            if (qty < 1) return false;

            double cost = qty * offer.price;
            buyer.Gold -= cost;
            buyer.PurchaseSpend += cost;
            buyer.GoodsBought += qty;
            buyer.Inbound[good] += qty;

            if (fromCastle)
            {
                // Royal sale: the treasury is paid; no Tariff on the King's own Goods.
                world.Castle.Stock[good] -= qty;
                world.Treasury += cost;
            }
            else
            {
                // Settle: the buyer pays the seller; the Crown mints its Tariff on top.
                double tariff = world.EffectiveTariff * Math.Max(offer.price, content.Goods[good].BasePrice) * qty;
                var seller = offer.seller;
                seller.Stock[good] -= qty;
                seller.Gold += cost;
                seller.SalesIncome += cost;
                seller.GoodsSold += qty;
                seller.TariffGenerated += tariff;
                world.Treasury += tariff;
                world.LifetimeTariff += tariff;
                world.Stats.GoodsTraded[good] += qty;
            }

            trader.State = TraderState.Outbound;
            trader.Seller = offer.seller;
            trader.Good = good;
            trader.Amount = qty;
            trader.OnRoad = offer.route.AllRoad;
            trader.Path = offer.route.Path;
            trader.LegTicks = LegTicks(world, offer.route);
            trader.PhaseEndTick = world.Tick + trader.LegTicks;
            return true;
        }

        // ------------------------------------------------------------------ royal dispatch

        static void TryRoyalDispatch(World world)
        {
            var castle = world.Castle;
            Trader free = null;
            foreach (var t in castle.Traders)
                if (t.State == TraderState.Idle) { free = t; break; }
            if (free == null) return;

            var content = world.Content;
            var b = content.Balance;
            int best = -1;
            double bestWant = 0;
            for (int g = 0; g < content.GoodCount; g++)
            {
                double want = CastleWant(world, g);
                if (want <= 0.01 || want <= bestWant) continue;
                bool anySeller = false;
                foreach (var s in world.Towns)
                    if (CrownSurplus(world, s, g) >= 1) { anySeller = true; break; }
                if (!anySeller) continue;
                best = g;
                bestWant = want;
            }
            if (best < 0) return;

            var offers = new List<(Town seller, double surplus, double price, Route route)>();
            foreach (var s in world.Towns)
            {
                double surplus = CrownSurplus(world, s, best);
                if (surplus < 1) continue;
                var route = world.Pathing.Find(castle.Center, s.Center);
                if (!route.Found) continue;
                offers.Add((s, surplus, s.Price[best], route));
            }
            if (offers.Count == 0) return;
            offers.Sort((x, y) =>
            {
                int c;
                if ((c = y.surplus.CompareTo(x.surplus)) != 0) return c;
                if ((c = x.price.CompareTo(y.price)) != 0) return c;
                if ((c = x.route.Cost.CompareTo(y.route.Cost)) != 0) return c;
                return x.seller.Id.CompareTo(y.seller.Id);
            });
            var offer = offers[world.Rng.Range(Math.Min(b.ChoiceSpread, offers.Count))];

            double qty = Math.Min(b.RoyalTraderCapacity, Math.Min(Math.Max(1, Math.Ceiling(bestWant)), Math.Floor(offer.surplus)));
            if (offer.price > 0) qty = Math.Min(qty, Math.Floor(world.Treasury / offer.price));
            if (qty < 1) return;

            double cost = qty * offer.price;
            world.Treasury -= cost;
            offer.seller.Stock[best] -= qty;
            offer.seller.Gold += cost;
            offer.seller.SalesIncome += cost;
            offer.seller.GoodsSold += qty;
            castle.Inbound[best] += qty;

            free.State = TraderState.Outbound;
            free.Seller = offer.seller;
            free.Good = best;
            free.Amount = qty;
            free.OnRoad = offer.route.AllRoad;
            free.Path = offer.route.Path;
            free.LegTicks = LegTicks(world, offer.route);
            free.PhaseEndTick = world.Tick + free.LegTicks;
        }
    }
}
