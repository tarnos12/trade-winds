using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    // Plain serializable snapshot of a World (public fields, lists and primitive arrays only) so any JSON
    // serializer — Unity's JsonUtility included — can write it. Versioned; bump SaveGame.Version with a
    // stepwise migration on every format change (GDD §12).

    [Serializable] public sealed class HexDto { public int q, r; }

    [Serializable]
    public sealed class BuildingDto
    {
        public int id; public string def; public HexDto hex; public long placedTick; public bool built;
        public int level; public int upgradingTo; public long upgradeStartTick; public bool priority;
        public double[] delivered; public double[] deliveringNow;
        public double workers, pending, outputStore; public int batchTimer;
        public double[] buffer; public double[] bufferInbound; public double residents;
    }

    [Serializable]
    public sealed class PorterDto
    {
        public int job; public long startTick; public int targetId; public int good; public double amount;
        public long arriveTick; public bool arrived; public long freeTick;
    }

    [Serializable]
    public sealed class TraderDto
    {
        public int state; public int sellerId; public int good; public double amount; public int legTicks;
        public long phaseEndTick; public bool onRoad; public List<HexDto> path = new List<HexDto>();
    }

    [Serializable]
    public sealed class TownDto
    {
        public int id; public string name; public HexDto center; public int level; public long foundedTick;
        public bool built; public long builtTick; public double gold;
        public double[] stock, price, inbound, population, happiness, satisfaction; public int[] ticksOverTarget;
        public double crownModifier; public long crownModifierUntil, lastCrownTick; public double goldTaken;
        public double taxEarned, salesIncome, purchaseSpend, tariffGenerated, goodsSold, goodsBought;
        public List<BuildingDto> buildings = new List<BuildingDto>();
        public List<PorterDto> porters = new List<PorterDto>();
        public List<TraderDto> traders = new List<TraderDto>();
    }

    [Serializable] public sealed class CastleBuildingDto { public string def; public HexDto hex; public int level; }

    [Serializable]
    public sealed class CastleDto
    {
        public HexDto center; public double[] stock, inbound; public bool[] buy, sell; public double[] limit;
        public List<TraderDto> traders = new List<TraderDto>();
        public List<CastleBuildingDto> compound = new List<CastleBuildingDto>();
        public double provisions; public int provisionTimer;
    }

    [Serializable]
    public sealed class ScoutDto
    {
        public int id; public HexDto position; public int state; public HexDto flag; public bool hasFlag;
        public double carry; public List<HexDto> path = new List<HexDto>(); public int pathIndex, pauseTicks;
    }

    [Serializable]
    public sealed class SaveData
    {
        public int version;
        public long seed;
        public int width, height;
        public int[] terrain;
        public long tick;
        public long rngState;
        public double treasury, lifetimeTariff, missionGoldEarned, tariffSetting;
        public List<HexDto> roads = new List<HexDto>();
        public bool hasCastle;
        public CastleDto castle;
        public bool[] revealed;
        public List<ScoutDto> scouts = new List<ScoutDto>();
        public List<string> researchDone = new List<string>();
        public string activeResearch;
        public double[] researchConsumed;
        public List<string> researchQueue = new List<string>();
        public int researchTimer;
        public int missionIndex;
        public bool victory;
        public long victoryTick;
        public int townsFounded, upgrades, researchCount;
        public double[] goodsTraded;
        public double peakPopulation;
        public List<TownDto> towns = new List<TownDto>();
        public int nextTownId, nextBuildingId;
        public List<string> events = new List<string>();
    }

    public static class SaveGame
    {
        public const int Version = 1;

        static HexDto H(Hex h) => new HexDto { q = h.Q, r = h.R };
        static Hex H(HexDto d) => new Hex(d.q, d.r);
        static double[] Copy(double[] a) => (double[])a.Clone();

        // ------------------------------------------------------------------ capture

        public static SaveData Capture(World w)
        {
            var d = new SaveData
            {
                version = Version,
                seed = w.Seed,
                width = w.Board.Width,
                height = w.Board.Height,
                terrain = new int[w.Board.Count],
                tick = w.Tick,
                rngState = w.Rng.State,
                treasury = w.Treasury,
                lifetimeTariff = w.LifetimeTariff,
                missionGoldEarned = w.MissionGoldEarned,
                tariffSetting = w.TariffSetting,
                hasCastle = w.Castle != null,
                revealed = w.RevealedMask != null ? (bool[])w.RevealedMask.Clone() : null,
                activeResearch = w.ActiveResearch,
                researchConsumed = Copy(w.ResearchConsumed),
                researchTimer = w.ResearchTimer,
                missionIndex = w.MissionIndex,
                victory = w.Victory,
                victoryTick = w.VictoryTick,
                townsFounded = w.Stats.TownsFounded,
                upgrades = w.Stats.Upgrades,
                researchCount = w.Stats.ResearchDone,
                goodsTraded = Copy(w.Stats.GoodsTraded),
                peakPopulation = w.Stats.PeakPopulation,
                nextTownId = w.NextTownId,
                nextBuildingId = w.NextBuildingId,
                events = new List<string>(w.Events),
            };
            for (int i = 0; i < w.Board.Count; i++) d.terrain[i] = (int)w.Board[w.Board.HexAt(i)];
            foreach (var r in w.Roads) d.roads.Add(H(r));
            d.researchDone.AddRange(w.ResearchDone);
            d.researchQueue.AddRange(w.ResearchQueue);
            foreach (var t in w.Towns) d.towns.Add(CaptureTown(w, t));
            foreach (var s in w.Scouts)
            {
                var sd = new ScoutDto
                {
                    id = s.Id, position = H(s.Position), state = (int)s.State, flag = H(s.Flag), hasFlag = s.HasFlag,
                    carry = s.Carry, pathIndex = s.PathIndex, pauseTicks = s.PauseTicks,
                };
                foreach (var p in s.Path) sd.path.Add(H(p));
                d.scouts.Add(sd);
            }

            if (w.Castle != null)
            {
                var c = w.Castle;
                int n = w.Content.GoodCount;
                var cd = new CastleDto
                {
                    center = H(c.Center), stock = Copy(c.Stock), inbound = Copy(c.Inbound),
                    buy = new bool[n], sell = new bool[n], limit = new double[n],
                    provisions = c.Provisions, provisionTimer = c.ProvisionTimer,
                };
                for (int g = 0; g < n; g++)
                {
                    cd.buy[g] = c.Orders[g].Buy;
                    cd.sell[g] = c.Orders[g].Sell;
                    cd.limit[g] = c.Orders[g].Limit;
                }
                foreach (var t in c.Traders) cd.traders.Add(CaptureTrader(t));
                foreach (var b in c.Compound) cd.compound.Add(new CastleBuildingDto { def = b.Def.Id, hex = H(b.Hex), level = b.Level });
                d.castle = cd;
            }
            return d;
        }

        static TownDto CaptureTown(World w, Town t)
        {
            int n = w.Content.GoodCount;
            var d = new TownDto
            {
                id = t.Id, name = t.Name, center = H(t.Center), level = t.Level, foundedTick = t.FoundedTick,
                built = t.Built, builtTick = t.BuiltTick, gold = t.Gold,
                stock = Copy(t.Stock), price = Copy(t.Price), inbound = Copy(t.Inbound),
                population = Copy(t.Population), happiness = Copy(t.Happiness), ticksOverTarget = (int[])t.TicksOverTarget.Clone(),
                satisfaction = new double[4 * n],
                crownModifier = t.CrownModifier, crownModifierUntil = t.CrownModifierUntil, lastCrownTick = t.LastCrownTick,
                goldTaken = t.GoldTaken, taxEarned = t.TaxEarned, salesIncome = t.SalesIncome, purchaseSpend = t.PurchaseSpend,
                tariffGenerated = t.TariffGenerated, goodsSold = t.GoodsSold, goodsBought = t.GoodsBought,
            };
            for (int tier = 0; tier < 4; tier++)
                Array.Copy(t.Satisfaction[tier], 0, d.satisfaction, tier * n, n);
            foreach (var b in t.Buildings)
                d.buildings.Add(new BuildingDto
                {
                    id = b.Id, def = b.Def.Id, hex = H(b.Hex), placedTick = b.PlacedTick, built = b.Built, level = b.Level,
                    upgradingTo = b.UpgradingTo, upgradeStartTick = b.UpgradeStartTick, priority = b.Priority,
                    delivered = Copy(b.Delivered), deliveringNow = Copy(b.DeliveringNow), workers = b.Workers,
                    pending = b.Pending, outputStore = b.OutputStore, batchTimer = b.BatchTimer,
                    buffer = Copy(b.Buffer), bufferInbound = Copy(b.BufferInbound), residents = b.Residents,
                });
            foreach (var p in t.Porters)
                d.porters.Add(new PorterDto
                {
                    job = (int)p.Job, startTick = p.StartTick, targetId = p.Target?.Id ?? 0, good = p.Good, amount = p.Amount,
                    arriveTick = p.ArriveTick, arrived = p.Arrived, freeTick = p.FreeTick,
                });
            foreach (var tr in t.Traders) d.traders.Add(CaptureTrader(tr));
            return d;
        }

        static TraderDto CaptureTrader(Trader t)
        {
            var d = new TraderDto
            {
                state = (int)t.State, sellerId = t.Seller?.Id ?? 0, good = t.Good, amount = t.Amount,
                legTicks = t.LegTicks, phaseEndTick = t.PhaseEndTick, onRoad = t.OnRoad,
            };
            foreach (var h in t.Path) d.path.Add(H(h));
            return d;
        }

        // ------------------------------------------------------------------ restore

        public static World Restore(SaveData d, Content content)
        {
            if (d == null) throw new ArgumentNullException(nameof(d));
            if (d.version != Version) throw new NotSupportedException($"Save version {d.version} is not supported (expected {Version}).");

            var board = new Board(d.width, d.height);
            for (int i = 0; i < board.Count; i++) board[board.HexAt(i)] = (Terrain)d.terrain[i];
            var w = new World(content, board, (uint)d.seed, d.hasCastle ? H(d.castle.center) : (Hex?)null);

            w.Tick = d.tick;
            w.Rng = new Rng((uint)d.rngState);
            w.Treasury = d.treasury;
            w.LifetimeTariff = d.lifetimeTariff;
            w.MissionGoldEarned = d.missionGoldEarned;
            w.TariffSetting = d.tariffSetting;
            foreach (var r in d.roads) w.Roads.Add(H(r));
            w.RoadVersion++;
            if (d.revealed != null && d.revealed.Length == board.Count) w.RestoreFog((bool[])d.revealed.Clone());
            foreach (var r in d.researchDone) w.ResearchDone.Add(r);
            w.ResearchQueue.AddRange(d.researchQueue);
            w.ActiveResearch = string.IsNullOrEmpty(d.activeResearch) ? null : d.activeResearch;
            if (d.researchConsumed != null) Array.Copy(d.researchConsumed, w.ResearchConsumed, Math.Min(d.researchConsumed.Length, w.ResearchConsumed.Length));
            w.ResearchTimer = d.researchTimer;
            w.MissionIndex = d.missionIndex;
            w.Victory = d.victory;
            w.VictoryTick = d.victoryTick;
            w.Stats.TownsFounded = d.townsFounded;
            w.Stats.Upgrades = d.upgrades;
            w.Stats.ResearchDone = d.researchCount;
            if (d.goodsTraded != null) Array.Copy(d.goodsTraded, w.Stats.GoodsTraded, Math.Min(d.goodsTraded.Length, w.Stats.GoodsTraded.Length));
            w.Stats.PeakPopulation = d.peakPopulation;
            w.NextTownId = d.nextTownId;
            w.NextBuildingId = d.nextBuildingId;
            w.Events.AddRange(d.events);

            var buildings = new Dictionary<int, Building>();
            foreach (var td in d.towns) w.Towns.Add(RestoreTown(w, td, buildings));
            var towns = new Dictionary<int, Town>();
            foreach (var t in w.Towns) towns[t.Id] = t;

            for (int i = 0; i < d.towns.Count; i++)
            {
                var town = w.Towns[i];
                foreach (var pd in d.towns[i].porters)
                {
                    buildings.TryGetValue(pd.targetId, out var target);
                    town.Porters.Add(new Porter
                    {
                        Job = target != null ? (PorterJob)pd.job : PorterJob.Idle, StartTick = pd.startTick, Target = target,
                        Good = pd.good, Amount = pd.amount, ArriveTick = pd.arriveTick, Arrived = pd.arrived, FreeTick = pd.freeTick,
                    });
                }
                foreach (var trd in d.towns[i].traders) town.Traders.Add(RestoreTrader(trd, town, towns));
            }

            if (d.hasCastle)
            {
                var c = w.Castle;
                var cd = d.castle;
                Array.Copy(cd.stock, c.Stock, Math.Min(cd.stock.Length, c.Stock.Length));
                Array.Copy(cd.inbound, c.Inbound, Math.Min(cd.inbound.Length, c.Inbound.Length));
                for (int g = 0; g < c.Orders.Length && g < cd.buy.Length; g++)
                {
                    c.Orders[g].Buy = cd.buy[g];
                    c.Orders[g].Sell = cd.sell[g];
                    c.Orders[g].Limit = cd.limit[g];
                }
                c.Traders.Clear();
                foreach (var trd in cd.traders) c.Traders.Add(RestoreTrader(trd, null, towns));
                foreach (var bd in cd.compound)
                    if (content.HasBuilding(bd.def))
                        c.Compound.Add(new CastleBuilding { Def = content.Building(bd.def), Hex = H(bd.hex), Level = bd.level });
                c.Provisions = cd.provisions;
                c.ProvisionTimer = cd.provisionTimer;

                w.Scouts.Clear();
                foreach (var sd in d.scouts)
                {
                    var s = new Scout
                    {
                        Id = sd.id, Position = H(sd.position), State = (ScoutState)sd.state, Flag = H(sd.flag), HasFlag = sd.hasFlag,
                        Carry = sd.carry, PathIndex = sd.pathIndex, PauseTicks = sd.pauseTicks,
                    };
                    foreach (var p in sd.path) s.Path.Add(H(p));
                    w.Scouts.Add(s);
                }
                w.SyncScouts();
            }
            return w;
        }

        static Town RestoreTown(World w, TownDto d, Dictionary<int, Building> index)
        {
            int n = w.Content.GoodCount;
            var t = w.NewTown(d.id, H(d.center));
            t.Name = d.name;
            t.Level = d.level;
            t.FoundedTick = d.foundedTick;
            t.Built = d.built;
            t.BuiltTick = d.builtTick;
            t.Gold = d.gold;
            Array.Copy(d.stock, t.Stock, n);
            Array.Copy(d.price, t.Price, n);
            Array.Copy(d.inbound, t.Inbound, n);
            Array.Copy(d.population, t.Population, 4);
            Array.Copy(d.happiness, t.Happiness, 4);
            Array.Copy(d.ticksOverTarget, t.TicksOverTarget, 4);
            for (int tier = 0; tier < 4; tier++) Array.Copy(d.satisfaction, tier * n, t.Satisfaction[tier], 0, n);
            t.CrownModifier = d.crownModifier;
            t.CrownModifierUntil = d.crownModifierUntil;
            t.LastCrownTick = d.lastCrownTick;
            t.GoldTaken = d.goldTaken;
            t.TaxEarned = d.taxEarned;
            t.SalesIncome = d.salesIncome;
            t.PurchaseSpend = d.purchaseSpend;
            t.TariffGenerated = d.tariffGenerated;
            t.GoodsSold = d.goodsSold;
            t.GoodsBought = d.goodsBought;

            foreach (var bd in d.buildings)
            {
                if (!w.Content.HasBuilding(bd.def)) continue;
                var b = w.NewBuilding(bd.id, w.Content.Building(bd.def), H(bd.hex), t);
                b.PlacedTick = bd.placedTick;
                b.Built = bd.built;
                b.Level = bd.level;
                b.UpgradingTo = bd.upgradingTo;
                b.UpgradeStartTick = bd.upgradeStartTick;
                b.Priority = bd.priority;
                Array.Copy(bd.delivered, b.Delivered, n);
                Array.Copy(bd.deliveringNow, b.DeliveringNow, n);
                b.Workers = bd.workers;
                b.Pending = bd.pending;
                b.OutputStore = bd.outputStore;
                b.BatchTimer = bd.batchTimer;
                Array.Copy(bd.buffer, b.Buffer, n);
                Array.Copy(bd.bufferInbound, b.BufferInbound, n);
                b.Residents = bd.residents;
                t.Buildings.Add(b);
                index[b.Id] = b;
            }
            return t;
        }

        static Trader RestoreTrader(TraderDto d, Town home, Dictionary<int, Town> towns)
        {
            towns.TryGetValue(d.sellerId, out var seller);
            var t = new Trader
            {
                Home = home, State = (TraderState)d.state, Seller = seller, Good = d.good, Amount = d.amount,
                LegTicks = d.legTicks, PhaseEndTick = d.phaseEndTick, OnRoad = d.onRoad,
            };
            var path = new List<Hex>();
            foreach (var h in d.path) path.Add(H(h));
            t.Path = path.ToArray();
            return t;
        }
    }
}
