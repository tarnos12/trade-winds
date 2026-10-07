using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    public readonly struct CommandResult
    {
        public readonly bool Ok;
        public readonly string Reason;

        CommandResult(bool ok, string reason)
        {
            Ok = ok;
            Reason = reason;
        }

        public static CommandResult Success => new CommandResult(true, null);
        public static CommandResult Fail(string reason) => new CommandResult(false, reason);
        public override string ToString() => Ok ? "ok" : Reason;
    }

    /// <summary>The whole simulation state plus the player's commands. Advance it with <see cref="Step"/>.</summary>
    public sealed class World
    {
        public readonly Content Content;
        public readonly Board Board;
        public Rng Rng { get; internal set; }
        public readonly Pathing Pathing;
        public readonly uint Seed;

        public long Tick;
        public double Treasury;
        public double LifetimeTariff;
        public double MissionGoldEarned;
        /// <summary>Player-set Tariff (the slider, once researched); research bonuses add on top.</summary>
        public double TariffSetting;
        public readonly List<Town> Towns = new List<Town>();
        public readonly HashSet<Hex> Roads = new HashSet<Hex>();
        public int RoadVersion;

        /// <summary>Null in sandbox/test worlds without a Castle (no fog, no research).</summary>
        public Castle Castle;
        public readonly List<Scout> Scouts = new List<Scout>();
        bool[] _revealed;
        public int FogVersion;

        // Research
        public readonly HashSet<string> ResearchDone = new HashSet<string>();
        public string ActiveResearch;
        public double[] ResearchConsumed;
        public readonly List<string> ResearchQueue = new List<string>();
        public int ResearchTimer;

        // Missions
        public int MissionIndex;
        public bool Victory;
        public long VictoryTick = -1;

        public readonly Stats Stats = new Stats();
        public readonly List<string> Events = new List<string>();

        internal int NextTownId = 1;
        internal int NextBuildingId = 1;

        public World(Content content, Board board, uint seed, Hex? castle = null)
        {
            Content = content;
            Board = board;
            Seed = seed;
            Rng = new Rng(seed);
            Pathing = new Pathing(this);
            Treasury = content.Balance.StartTreasury;
            TariffSetting = content.Balance.TariffRate;
            Stats.GoodsTraded = new double[content.GoodCount];
            ResearchConsumed = new double[content.GoodCount];
            if (castle.HasValue) CreateCastle(castle.Value);
        }

        Balance B => Content.Balance;

        /// <summary>Advance the economy by one fixed tick (500 ms of game time).</summary>
        public void Step()
        {
            foreach (var town in Towns) TownSim.Tick(this, town);
            TradeSim.Tick(this);
            if (Castle != null)
            {
                CastleSim.Tick(this);
                ResearchSim.Tick(this);
                ScoutSim.Tick(this);
            }
            MissionSim.Tick(this);
            Tick++;
        }

        public void Run(int ticks)
        {
            for (int i = 0; i < ticks; i++) Step();
        }

        public void Log(string message)
        {
            long s = Tick / B.TicksPerSecond;
            Events.Add($"{s / 60}:{s % 60:00}  {message}");
            if (Events.Count > 60) Events.RemoveAt(0);
        }

        // ------------------------------------------------------------------ castle & fog

        void CreateCastle(Hex h)
        {
            int n = Content.GoodCount;
            Castle = new Castle
            {
                Center = h,
                Stock = new double[n],
                Inbound = new double[n],
                Orders = new CastleOrder[n],
                Provisions = B.ProvisionsStart,
            };
            for (int g = 0; g < n; g++) Castle.Orders[g] = new CastleOrder { Limit = 20 };
            SetCastleStart("wood", B.CastleStartWood);
            SetCastleStart("stone", B.CastleStartStone);
            SetCastleStart("potato", B.CastleStartPotato);
            for (int i = 0; i < B.RoyalTraders; i++) Castle.Traders.Add(new Trader());

            _revealed = new bool[Board.Count];
            int radius = Board.Width <= 40 ? B.RevealRadiusSmall : Board.Width <= 58 ? B.RevealRadiusNormal : B.RevealRadiusLarge;
            RevealAround(h, radius);
            SyncScouts();
        }

        void SetCastleStart(string good, double amount)
        {
            if (Content.HasGood(good)) Castle.Stock[Content.GoodIndex(good)] = amount;
        }

        public bool FogEnabled => _revealed != null;

        public bool IsRevealed(Hex h) => _revealed == null || (Board.Contains(h) && _revealed[Board.Index(h)]);

        /// <summary>Reveal every hex within <paramref name="radius"/>; returns how many were newly revealed.</summary>
        public int RevealAround(Hex center, int radius, int budget = int.MaxValue)
        {
            if (_revealed == null) return 0;
            int count = 0;
            for (int dq = -radius; dq <= radius; dq++)
            for (int dr = Math.Max(-radius, -dq - radius); dr <= Math.Min(radius, -dq + radius); dr++)
            {
                if (count >= budget) break;
                var h = new Hex(center.Q + dq, center.R + dr);
                if (!Board.Contains(h)) continue;
                int i = Board.Index(h);
                if (_revealed[i]) continue;
                _revealed[i] = true;
                count++;
            }
            if (count > 0) FogVersion++;
            return count;
        }

        public bool[] RevealedMask => _revealed;

        internal void RestoreFog(bool[] mask)
        {
            _revealed = mask;
            FogVersion++;
        }

        public void SyncScouts()
        {
            if (Castle == null) return;
            int want = 1 + (int)Math.Round(ModifierSum(Modifier.ExtraScouts));
            while (Scouts.Count < want)
                Scouts.Add(new Scout { Id = Scouts.Count + 1, Position = Castle.Center, Carry = B.ScoutCarry });
        }

        // ------------------------------------------------------------------ modifiers

        public bool IsResearched(string id) => id == null || ResearchDone.Contains(id);

        public bool IsUnlocked(BuildingDef def) => IsResearched(def.UnlockedBy);

        public double ModifierProduct(Modifier m)
        {
            double v = 1;
            foreach (var id in ResearchDone)
            {
                var n = Content.ResearchNode(id);
                if (n != null && n.Modifier == m) v *= n.Value;
            }
            return v;
        }

        public double ModifierSum(Modifier m)
        {
            double v = 0;
            foreach (var id in ResearchDone)
            {
                var n = Content.ResearchNode(id);
                if (n != null && n.Modifier == m) v += n.Value;
            }
            return v;
        }

        public bool HasModifier(Modifier m) => ModifierSum(m) > 0;

        public double EffectiveTariff =>
            Math.Max(B.TariffMin, Math.Min(B.TariffMax, TariffSetting + ModifierSum(Modifier.TariffBonus)));

        public CommandResult SetTariff(double rate)
        {
            if (!HasModifier(Modifier.TariffSlider)) return CommandResult.Fail("Research the Tariff Office first.");
            TariffSetting = Math.Max(B.TariffMin, Math.Min(B.TariffMax, rate));
            return CommandResult.Success;
        }

        public int TownCap => B.TownCap + (int)Math.Round(ModifierSum(Modifier.TownCap));

        // ------------------------------------------------------------------ queries

        public Town TownAt(Hex h)
        {
            foreach (var t in Towns)
                if (t.Occupies(h)) return t;
            return null;
        }

        public bool IsOccupied(Hex h) => TownAt(h) != null || (Castle != null && Castle.Occupies(h));

        static bool Touches(Hex h, Func<Hex, bool> occupied)
        {
            for (int d = 0; d < 6; d++)
                if (occupied(h.Neighbor(d))) return true;
            return false;
        }

        bool TouchesCastle(Hex h) => Castle != null && Touches(h, Castle.Occupies);

        public int SlotsUsed(Town town) => 1 + town.Buildings.Count;

        public int SlotCap(Town town) =>
            B.SlotsByLevel[Math.Min(town.Level, B.SlotsByLevel.Length) - 1] + (int)Math.Round(ModifierSum(Modifier.TownSlots));

        // ------------------------------------------------------------------ towns

        public CommandResult CanFoundTown(Hex h)
        {
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!IsRevealed(h)) return CommandResult.Fail("Unexplored — send a Scout first.");
            if (!TerrainRules.IsBuildableGround(Board[h])) return CommandResult.Fail("A Town needs open ground.");
            if (IsOccupied(h)) return CommandResult.Fail("That hex is taken.");
            if (Roads.Contains(h)) return CommandResult.Fail("Can't found a Town on a road.");
            foreach (var t in Towns)
                if (Touches(h, t.Occupies)) return CommandResult.Fail("Too close to another Town — leave a gap.");
            if (TouchesCastle(h)) return CommandResult.Fail("Too close to the Castle — leave a gap.");
            if (Towns.Count >= TownCap) return CommandResult.Fail($"Town limit reached ({TownCap}). Research charters for more.");
            if (Treasury < B.TownFoundCost) return CommandResult.Fail($"Needs {B.TownFoundCost:0} gold in the treasury.");
            return CommandResult.Success;
        }

        public CommandResult FoundTown(Hex h, out Town town)
        {
            town = null;
            var check = CanFoundTown(h);
            if (!check.Ok) return check;

            Treasury -= B.TownFoundCost;
            town = NewTown(NextTownId++, h);
            town.Gold = B.TownStartGold;
            if (Content.HasGood("wood")) town.Stock[Content.GoodIndex("wood")] = 60;
            if (Content.HasGood("potato")) town.Stock[Content.GoodIndex("potato")] = 40;
            Towns.Add(town);
            SyncFleets(town);
            Stats.TownsFounded++;
            Log($"{town.Name} founded.");
            return CommandResult.Success;
        }

        internal Town NewTown(int id, Hex h)
        {
            int n = Content.GoodCount;
            var town = new Town
            {
                Id = id,
                Center = h,
                FoundedTick = Tick,
                Stock = new double[n],
                Price = new double[n],
                Inbound = new double[n],
                ConsumptionPerMin = new double[n],
                Name = "Town #" + id,
            };
            for (int g = 0; g < n; g++) town.Price[g] = Content.Goods[g].BasePrice;
            for (int t = 0; t < 4; t++)
            {
                town.Happiness[t] = B.StartHappiness;
                town.Satisfaction[t] = new double[n];
            }
            return town;
        }

        /// <summary>Make the Town's Porter and Trader counts match its level and research.</summary>
        public void SyncFleets(Town town)
        {
            int lvl = Math.Min(town.Level, B.PortersByLevel.Length) - 1;
            int traders = B.TradersByLevel[lvl] + (int)Math.Round(ModifierSum(Modifier.ExtraTraders));
            while (town.Porters.Count < B.PortersByLevel[lvl]) town.Porters.Add(new Porter());
            while (town.Traders.Count < traders) town.Traders.Add(new Trader { Home = town });
        }

        public CommandResult CanLevelUp(Town town)
        {
            if (town.Level >= B.SlotsByLevel.Length) return CommandResult.Fail("Already at the highest level.");
            double cost = B.TownLevelCost[town.Level - 1];
            if (town.Gold < cost) return CommandResult.Fail($"{town.Name} needs {cost:0} gold (has {town.Gold:0}).");
            return CommandResult.Success;
        }

        public CommandResult LevelUp(Town town)
        {
            var check = CanLevelUp(town);
            if (!check.Ok) return check;
            town.Gold -= B.TownLevelCost[town.Level - 1];
            town.Level++;
            SyncFleets(town);
            Log($"{town.Name} reached level {town.Level}.");
            return CommandResult.Success;
        }

        // ------------------------------------------------------------------ crown

        public CommandResult CanGive(Town town)
        {
            if (!town.Built) return CommandResult.Fail("The Town isn't finished yet.");
            if (Tick - town.LastCrownTick < B.Ticks(B.CrownCooldownSec)) return CommandResult.Fail("Wait for the Crown cooldown.");
            if (Treasury < B.CrownTransfer) return CommandResult.Fail($"Needs {B.CrownTransfer:0} gold in the treasury.");
            return CommandResult.Success;
        }

        public CommandResult Give(Town town)
        {
            var check = CanGive(town);
            if (!check.Ok) return check;
            Treasury -= B.CrownTransfer;
            town.Gold += B.CrownTransfer;
            town.GoldTaken -= B.CrownTransfer;
            town.LastCrownTick = Tick;
            town.CrownModifier = B.GiveHappiness;
            town.CrownModifierUntil = Tick + B.Ticks(B.CrownEffectSec);
            return CommandResult.Success;
        }

        public CommandResult CanTake(Town town)
        {
            if (!town.Built) return CommandResult.Fail("The Town isn't finished yet.");
            if (Tick - town.LastCrownTick < B.Ticks(B.CrownCooldownSec)) return CommandResult.Fail("Wait for the Crown cooldown.");
            if (Tick - town.BuiltTick < B.Ticks(B.TakeMinTownAgeSec)) return CommandResult.Fail("The Town is too young to be taxed by the Crown.");
            if (town.TotalPopulation < B.TakeMinResidents) return CommandResult.Fail("The Town needs residents first.");
            if (town.Gold < B.CrownTransfer) return CommandResult.Fail($"The Town has less than {B.CrownTransfer:0} gold.");
            return CommandResult.Success;
        }

        public CommandResult Take(Town town)
        {
            var check = CanTake(town);
            if (!check.Ok) return check;
            Treasury += B.CrownTransfer;
            town.Gold -= B.CrownTransfer;
            town.GoldTaken += B.CrownTransfer;
            town.LastCrownTick = Tick;
            town.CrownModifier = B.TakeHappiness;
            town.CrownModifierUntil = Tick + B.Ticks(B.CrownEffectSec);
            return CommandResult.Success;
        }

        // ------------------------------------------------------------------ buildings

        public CommandResult CanPlaceBuilding(BuildingDef def, Hex h, out Town town)
        {
            town = null;
            if (def.Kind == BuildingKind.Castle) return CanPlaceCastleBuilding(def, h);
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!IsRevealed(h)) return CommandResult.Fail("Unexplored — send a Scout first.");
            if (!IsUnlocked(def)) return CommandResult.Fail($"Research {Content.ResearchNode(def.UnlockedBy)?.Name ?? def.UnlockedBy} first.");
            if (IsOccupied(h)) return CommandResult.Fail("That hex is taken.");
            if (!def.AllowsTerrain(Board[h])) return CommandResult.Fail($"{def.Name} can't stand on {Board[h]}.");
            if (TouchesCastle(h)) return CommandResult.Fail("Too close to the Castle — leave a gap.");

            Town touching = null;
            foreach (var t in Towns)
            {
                if (!Touches(h, t.Occupies)) continue;
                if (touching != null) return CommandResult.Fail("Touches two Towns — leave a gap.");
                touching = t;
            }

            if (touching == null) return CommandResult.Fail("Must be placed next to a Town or its buildings.");
            if (SlotsUsed(touching) >= SlotCap(touching)) return CommandResult.Fail($"{touching.Name} has no free building slots — level it up.");
            if (Treasury < def.GoldCost) return CommandResult.Fail($"Needs {def.GoldCost:0} gold in the treasury.");
            town = touching;
            return CommandResult.Success;
        }

        public CommandResult PlaceBuilding(BuildingDef def, Hex h, out Building building)
        {
            building = null;
            if (def.Kind == BuildingKind.Castle) return PlaceCastleBuilding(def, h);
            var check = CanPlaceBuilding(def, h, out var town);
            if (!check.Ok) return check;

            Treasury -= def.GoldCost;
            building = NewBuilding(NextBuildingId++, def, h, town);
            town.Buildings.Add(building);
            return CommandResult.Success;
        }

        internal Building NewBuilding(int id, BuildingDef def, Hex h, Town town)
        {
            int n = Content.GoodCount;
            return new Building
            {
                Id = id,
                Def = def,
                Hex = h,
                Town = town,
                PlacedTick = Tick,
                Delivered = new double[n],
                DeliveringNow = new double[n],
                Buffer = new double[n],
                BufferInbound = new double[n],
            };
        }

        public CommandResult PlaceBuilding(string defId, Hex h) => PlaceBuilding(Content.Building(defId), h, out _);

        public CommandResult CanUpgrade(Building b)
        {
            if (!b.Built) return CommandResult.Fail("Finish building it first.");
            if (b.IsUpgrading) return CommandResult.Fail("Already upgrading.");
            var next = b.Def.UpgradeTo(b.Level + 1);
            if (next == null) return CommandResult.Fail("No further upgrades.");
            if (!IsResearched(next.UnlockedBy)) return CommandResult.Fail($"Research {Content.ResearchNode(next.UnlockedBy)?.Name ?? next.UnlockedBy} first.");
            if (b.Town.Gold < next.GoldCost) return CommandResult.Fail($"{b.Town.Name} needs {next.GoldCost:0} gold.");
            if (b.IsWorkplace)
                foreach (var m in next.MaterialCost)
                    if (m.Good == b.Def.OutputGood && b.Town.Stock[m.Good] < m.Amount)
                        return CommandResult.Fail($"Stock {m.Amount:0} {Content.Goods[m.Good].Name} first (have {b.Town.Stock[m.Good]:0}) — it pauses while upgrading.");
            return CommandResult.Success;
        }

        public CommandResult StartUpgrade(Building b)
        {
            var check = CanUpgrade(b);
            if (!check.Ok) return check;
            var next = b.Def.UpgradeTo(b.Level + 1);
            b.Town.Gold -= next.GoldCost;
            b.UpgradingTo = next.Level;
            b.UpgradeStartTick = Tick;
            Array.Clear(b.Delivered, 0, b.Delivered.Length);
            return CommandResult.Success;
        }

        public CommandResult CancelUpgrade(Building b)
        {
            if (!b.IsUpgrading) return CommandResult.Fail("Not upgrading.");
            var next = b.Def.UpgradeTo(b.UpgradingTo);
            b.Town.Gold += next.GoldCost;
            for (int g = 0; g < b.Delivered.Length; g++)
            {
                b.Town.Stock[g] = Math.Min(B.StockCap, b.Town.Stock[g] + b.Delivered[g]);
                b.Delivered[g] = 0;
            }
            b.UpgradingTo = 0;
            return CommandResult.Success;
        }

        public void TogglePriority(Building b) => b.Priority = !b.Priority;

        /// <summary>Remove a building: refunds its treasury gold; anything it cut off from the Town centre goes too.</summary>
        public CommandResult DestroyBuilding(Building b, out int cascaded)
        {
            cascaded = 0;
            var town = b.Town;
            if (!town.Buildings.Contains(b)) return CommandResult.Fail("Not found.");
            RemoveBuilding(b);

            // Cascade: keep only buildings still connected to the centre.
            var connected = new HashSet<Hex> { town.Center };
            bool grew = true;
            while (grew)
            {
                grew = false;
                foreach (var x in town.Buildings)
                {
                    if (connected.Contains(x.Hex)) continue;
                    for (int d = 0; d < 6; d++)
                        if (connected.Contains(x.Hex.Neighbor(d)))
                        {
                            connected.Add(x.Hex);
                            grew = true;
                            break;
                        }
                }
            }
            foreach (var orphan in town.Buildings.ToArray())
                if (!connected.Contains(orphan.Hex))
                {
                    RemoveBuilding(orphan);
                    cascaded++;
                }
            return CommandResult.Success;
        }

        void RemoveBuilding(Building b)
        {
            var town = b.Town;
            Treasury += b.Def.GoldCost;
            town.Buildings.Remove(b);
            foreach (var p in town.Porters)
            {
                if (p.Target != b || p.Job == PorterJob.Idle) continue;
                if (!p.Arrived && p.Job != PorterJob.Collect)
                    town.Stock[p.Good] = Math.Min(B.StockCap, town.Stock[p.Good] + p.Amount);
                p.Job = PorterJob.Idle;
                p.Target = null;
            }
        }

        /// <summary>Abandon a Town: refunds founding + building gold minus what the Crown has taken.</summary>
        public CommandResult DestroyTown(Town town, out double refund)
        {
            refund = 0;
            if (!Towns.Contains(town)) return CommandResult.Fail("Not found.");
            double gold = B.TownFoundCost;
            foreach (var b in town.Buildings) gold += b.Def.GoldCost;
            refund = Math.Max(0, gold - Math.Max(0, town.GoldTaken));
            Treasury += refund;
            Towns.Remove(town);
            foreach (var other in Towns)
                foreach (var t in other.Traders)
                    if (t.Seller == town) t.Seller = null;
            Log($"{town.Name} was abandoned.");
            return CommandResult.Success;
        }

        // ------------------------------------------------------------------ castle compound

        public CommandResult CanPlaceCastleBuilding(BuildingDef def, Hex h)
        {
            if (Castle == null) return CommandResult.Fail("No Castle in this realm.");
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!IsRevealed(h)) return CommandResult.Fail("Unexplored.");
            if (!IsUnlocked(def)) return CommandResult.Fail($"Research {Content.ResearchNode(def.UnlockedBy)?.Name ?? def.UnlockedBy} first.");
            if (Castle.Find(def.Id) != null) return CommandResult.Fail($"The Castle already has a {def.Name}.");
            if (IsOccupied(h)) return CommandResult.Fail("That hex is taken.");
            if (!def.AllowsTerrain(Board[h])) return CommandResult.Fail("Needs open ground.");
            if (!Touches(h, Castle.Occupies)) return CommandResult.Fail("Must touch the Castle or another Castle building.");
            foreach (var t in Towns)
                if (Touches(h, t.Occupies)) return CommandResult.Fail("Too close to a Town — leave a gap.");
            if (Treasury < def.GoldCost) return CommandResult.Fail($"Needs {def.GoldCost:0} gold in the treasury.");
            foreach (var m in def.MaterialCost)
                if (Castle.Stock[m.Good] < m.Amount)
                    return CommandResult.Fail($"Castle Stock needs {m.Amount:0} {Content.Goods[m.Good].Name} (has {Castle.Stock[m.Good]:0}).");
            return CommandResult.Success;
        }

        CommandResult PlaceCastleBuilding(BuildingDef def, Hex h)
        {
            var check = CanPlaceCastleBuilding(def, h);
            if (!check.Ok) return check;
            Treasury -= def.GoldCost;
            foreach (var m in def.MaterialCost) Castle.Stock[m.Good] -= m.Amount;
            Castle.Compound.Add(new CastleBuilding { Def = def, Hex = h });
            if (def.Id == "provisioner") EnableBuy("potato", B.ProvisionerBuyLimit);
            if (def.Id == "advanced_provisioner") EnableBuy("fish", B.ProvisionerBuyLimit);
            Log($"{def.Name} built at the Castle.");
            return CommandResult.Success;
        }

        void EnableBuy(string good, double limit)
        {
            if (!Content.HasGood(good)) return;
            var o = Castle.Orders[Content.GoodIndex(good)];
            o.Buy = true;
            o.Limit = Math.Max(o.Limit, limit);
        }

        public CommandResult CanUpgradeCastleBuilding(CastleBuilding b)
        {
            var next = b.Def.UpgradeTo(b.Level + 1);
            if (next == null) return CommandResult.Fail("No further upgrades.");
            if (Treasury < next.GoldCost) return CommandResult.Fail($"Needs {next.GoldCost:0} gold in the treasury.");
            foreach (var m in next.MaterialCost)
                if (Castle.Stock[m.Good] < m.Amount)
                    return CommandResult.Fail($"Castle Stock needs {m.Amount:0} {Content.Goods[m.Good].Name} (has {Castle.Stock[m.Good]:0}).");
            return CommandResult.Success;
        }

        public CommandResult UpgradeCastleBuilding(CastleBuilding b)
        {
            var check = CanUpgradeCastleBuilding(b);
            if (!check.Ok) return check;
            var next = b.Def.UpgradeTo(b.Level + 1);
            Treasury -= next.GoldCost;
            foreach (var m in next.MaterialCost) Castle.Stock[m.Good] -= m.Amount;
            b.Level = next.Level;
            Log($"{b.Def.Name} upgraded to level {b.Level}.");
            return CommandResult.Success;
        }

        public void SetCastleOrder(int good, bool buy, bool sell, double limit)
        {
            var o = Castle.Orders[good];
            o.Buy = buy;
            o.Sell = sell;
            o.Limit = Math.Max(0, limit);
        }

        // ------------------------------------------------------------------ roads

        public CommandResult BuildRoad(Hex h)
        {
            if (!Board.Contains(h)) return CommandResult.Fail("Outside the board.");
            if (!IsRevealed(h)) return CommandResult.Fail("Unexplored.");
            if (!Board.IsPassable(h)) return CommandResult.Fail("Roads can't cross water or mountains.");
            if (Roads.Contains(h)) return CommandResult.Fail("Already a road.");
            if (Treasury < B.RoadCostPerHex) return CommandResult.Fail("Not enough gold in the treasury.");
            Treasury -= B.RoadCostPerHex;
            Roads.Add(h);
            RoadVersion++;
            return CommandResult.Success;
        }

        public CommandResult RemoveRoad(Hex h)
        {
            if (!Roads.Remove(h)) return CommandResult.Fail("No road there.");
            RoadVersion++;
            return CommandResult.Success;
        }
    }
}
