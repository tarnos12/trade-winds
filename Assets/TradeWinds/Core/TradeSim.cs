using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>Traders between Towns: buying decisions, travel, and the Crown's Tariff (GDD §8–§9).</summary>
    public static class TradeSim
    {
        public static void Tick(World world)
        {
            foreach (var town in world.Towns)
                foreach (var trader in town.Traders)
                    Advance(world, trader);

            foreach (var town in world.Towns)
                if (town.Built) TryDispatch(world, town);
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
                    var home = t.Home;
                    home.Stock[t.Good] = Math.Min(b.StockCap, home.Stock[t.Good] + t.Amount);
                    home.Inbound[t.Good] -= t.Amount;
                    t.State = TraderState.Idle;
                    t.Seller = null;
                    t.Amount = 0;
                    break;
            }
        }

        // ------------------------------------------------------------------ demand

        /// <summary>Does this Town use the Good itself (residents of a placed house tier, or processor input)?</summary>
        public static bool Consumes(World world, Town town, int good)
        {
            var content = world.Content;
            foreach (var bld in town.Buildings)
            {
                if (bld.IsHouse)
                {
                    var needs = content.Tiers[(int)bld.Def.Tier];
                    foreach (var n in needs.Basic) if (n.Good == good) return true;
                    foreach (var n in needs.Luxury) if (n.Good == good) return true;
                }
                else
                {
                    foreach (var i in bld.Def.InputsPerOutput) if (i.Good == good) return true;
                }
            }
            return false;
        }

        static double ConstructionOutstanding(Town town, int good)
        {
            double sum = 0;
            foreach (var bld in town.Buildings) sum += bld.MaterialOutstanding(good);
            return sum;
        }

        /// <summary>How much of a Good the Town wants on hand (floor for what it uses + construction lumps).</summary>
        public static double BuyTarget(World world, Town town, int good)
        {
            var b = world.Content.Balance;
            double target = ConstructionOutstanding(town, good);
            if (Consumes(world, town, good))
                target += Math.Max(b.BuyFloor, b.PerTick(town.ConsumptionPerMin[good]) * 2);
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

        // ------------------------------------------------------------------ dispatch

        static void TryDispatch(World world, Town buyer)
        {
            Trader free = null;
            foreach (var t in buyer.Traders)
                if (t.State == TraderState.Idle) { free = t; break; }
            if (free == null) return;

            var content = world.Content;
            var b = content.Balance;

            // Priority layers: Basic Needs → construction materials → Luxuries / other.
            for (int layer = 0; layer < 3; layer++)
            {
                var candidates = new List<(int good, double gap)>();
                for (int g = 0; g < content.GoodCount; g++)
                {
                    if (LayerOf(world, buyer, g) != layer) continue;
                    double gap = Shortfall(world, buyer, g);
                    if (gap <= b.MinShortfall) continue;
                    if (!HasSeller(world, buyer, g)) continue;
                    candidates.Add((g, gap));
                }
                if (candidates.Count == 0) continue;

                candidates.Sort((x, y) => y.gap.CompareTo(x.gap) != 0 ? y.gap.CompareTo(x.gap) : x.good.CompareTo(y.good));
                var pick = candidates[world.Rng.Range(Math.Min(b.ChoiceSpread, candidates.Count))];
                if (Buy(world, buyer, free, pick.good, pick.gap)) return;
            }
        }

        /// <summary>0 = a Basic Need, 1 = construction-only material, 2 = Luxury / other, -1 = not wanted.</summary>
        static int LayerOf(World world, Town town, int good)
        {
            var content = world.Content;
            bool consumes = Consumes(world, town, good);
            if (consumes && content.IsBasicNeed(good)) return 0;
            if (!consumes && ConstructionOutstanding(town, good) > 0) return 1;
            if (consumes || ConstructionOutstanding(town, good) > 0) return 2;
            return -1;
        }

        static bool HasSeller(World world, Town buyer, int good)
        {
            foreach (var s in world.Towns)
                if (s != buyer && Surplus(world, s, good) >= 1) return true;
            return false;
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
            if (offers.Count == 0) return false;

            bool starving = content.IsBasicNeed(good) && buyer.Stock[good] < 0.25 * BuyTarget(world, buyer, good);
            offers.Sort((x, y) =>
            {
                int c;
                if (starving && (c = x.route.Cost.CompareTo(y.route.Cost)) != 0) return c;
                if ((c = y.surplus.CompareTo(x.surplus)) != 0) return c;
                if ((c = x.price.CompareTo(y.price)) != 0) return c;
                if ((c = x.route.Cost.CompareTo(y.route.Cost)) != 0) return c;
                return x.seller.Id.CompareTo(y.seller.Id);
            });
            var offer = offers[world.Rng.Range(Math.Min(b.ChoiceSpread, offers.Count))];

            double qty = Math.Min(b.TraderCapacity, Math.Min(Math.Ceiling(gap), Math.Floor(offer.surplus)));
            if (offer.price > 0) qty = Math.Min(qty, Math.Floor(buyer.Gold / offer.price));
            if (qty < 1) return false;

            // Settle: the buyer pays the seller; the Crown mints its Tariff on top.
            double cost = qty * offer.price;
            double tariff = b.TariffRate * Math.Max(offer.price, content.Goods[good].BasePrice) * qty;
            var seller = offer.seller;
            seller.Stock[good] -= qty;
            seller.Gold += cost;
            seller.SalesIncome += cost;
            seller.GoodsSold += qty;
            seller.TariffGenerated += tariff;
            buyer.Gold -= cost;
            buyer.PurchaseSpend += cost;
            buyer.GoodsBought += qty;
            buyer.Inbound[good] += qty;
            world.Treasury += tariff;
            world.LifetimeTariff += tariff;

            trader.State = TraderState.Outbound;
            trader.Seller = seller;
            trader.Good = good;
            trader.Amount = qty;
            trader.OnRoad = offer.route.AllRoad;
            trader.Path = offer.route.Path;
            trader.LegTicks = Math.Max(b.MinLegTicks, (int)Math.Ceiling(offer.route.Cost / b.TraderHexesPerTick));
            trader.PhaseEndTick = world.Tick + trader.LegTicks;
            return true;
        }
    }
}
