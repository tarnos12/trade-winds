using System;
using NUnit.Framework;

namespace TradeWinds.Core.Tests
{
    public class KingdomTests
    {
        const int Minute = Scenarios.TicksPerMinute;

        /// <summary>40×16 open board, Castle in the middle, fertile land west of it and forest east.</summary>
        static World NewKingdom(out Hex castle, uint seed = 9, bool fog = false)
        {
            var board = new Board(40, 16);
            castle = Scenarios.At(20, 8);
            for (int c = 8; c <= 13; c++)
                for (int r = 5; r <= 11; r++) board[Scenarios.At(c, r)] = Terrain.Fertile;
            for (int c = 27; c <= 31; c++)
                for (int r = 5; r <= 11; r++) board[Scenarios.At(c, r)] = Terrain.Forest;
            var w = new World(GameContent.Create(), board, seed, castle);
            if (!fog) w.RevealAround(castle, 40);
            return w;
        }

        static int G(World w, string id) => w.Content.GoodIndex(id);

        static void PlaceOn(World w, Town town, string id, Terrain terrain, int count)
        {
            int placed = 0;
            for (int d = 0; d < 6 && placed < count; d++)
            {
                var h = town.Center.Neighbor(d);
                if (w.Board.Contains(h) && w.Board[h] == terrain && w.PlaceBuilding(id, h).Ok) placed++;
            }
            Assert.That(placed, Is.EqualTo(count), $"placed {id}");
        }

        [Test]
        public void Castle_StartsWithStock_AndFogHidesTheFarBoard()
        {
            var w = NewKingdom(out var castle, fog: true);
            Assert.That(w.Castle.Stock[G(w, "wood")], Is.EqualTo(40));
            Assert.That(w.Castle.Stock[G(w, "stone")], Is.EqualTo(40));
            Assert.That(w.IsRevealed(castle));
            Assert.That(w.IsRevealed(Scenarios.At(1, 1)), Is.False);
            Assert.That(w.FoundTown(Scenarios.At(2, 2), out _).Reason, Does.Contain("Unexplored"));
        }

        [Test]
        public void Towns_KeepAGapFromTheCastle()
        {
            var w = NewKingdom(out var castle);
            Assert.That(w.FoundTown(castle.Neighbor(0), out _).Ok, Is.False);
            Assert.That(w.FoundTown(castle.Neighbor(0).Neighbor(0), out _).Ok);
        }

        [Test]
        public void Research_IsPausedWithoutAResearchCenter_ThenDrainsCastleStock()
        {
            var w = NewKingdom(out var castle);
            Assert.That(ResearchSim.Start(w, "r_fishery").Ok);
            w.Run(Minute);
            Assert.That(w.ResearchDone.Contains("r_fishery"), Is.False, "no Research Center yet");

            Assert.That(w.PlaceBuilding(w.Content.Building("research_center"), castle.Neighbor(3), out _).Ok);
            Assert.That(w.Castle.Stock[G(w, "stone")], Is.EqualTo(20), "center built from Castle Stock");
            w.Run(Minute);

            Assert.That(w.ResearchDone.Contains("r_fishery"));
            Assert.That(w.IsUnlocked(w.Content.Building("fishery")));
            Assert.That(w.Castle.Stock[G(w, "wood")], Is.EqualTo(40 - 10 - 15).Within(1e-6));
            Assert.That(w.Castle.Stock[G(w, "potato")], Is.EqualTo(0).Within(1e-6));
        }

        [Test]
        public void CastleBuildings_MustTouchTheCastle()
        {
            var w = NewKingdom(out var castle);
            var rc = w.Content.Building("research_center");
            Assert.That(w.PlaceBuilding(rc, castle.Neighbor(3).Neighbor(3).Neighbor(3), out _).Ok, Is.False);
            Assert.That(w.PlaceBuilding(rc, castle.Neighbor(3), out _).Ok);
            Assert.That(w.PlaceBuilding(rc, castle.Neighbor(0), out _).Ok, Is.False, "unique");
            Assert.That(w.PlaceBuilding(w.Content.Building("provisioner"), castle.Neighbor(3).Neighbor(3), out _).Ok, "chains through the compound");
        }

        [Test]
        public void RoyalTraders_BuyResearchMaterialsFromTowns()
        {
            var w = NewKingdom(out var castle);
            Assert.That(w.FoundTown(Scenarios.At(12, 8), out var farm).Ok);
            var c = farm.Center;
            foreach (var d in new[] { 0, 1, 2 }) Scenarios.Place(w, "potato_farm", c.Neighbor(d));
            foreach (var d in new[] { 3, 4 }) Scenarios.Place(w, "hut", c.Neighbor(d));
            Assert.That(w.PlaceBuilding(w.Content.Building("research_center"), castle.Neighbor(3), out _).Ok);

            Assert.That(ResearchSim.Start(w, "r_sheep").Ok, "needs 15 potato; the Castle has 10");
            w.Run(10 * Minute);

            Assert.That(w.ResearchDone.Contains("r_sheep"));
            Assert.That(farm.GoodsSold, Is.GreaterThan(0), "royal Traders bought from the Town");
        }

        [Test]
        public void TheCastle_SellsAsLastResort()
        {
            var w = NewKingdom(out var castle);
            int wood = G(w, "wood");
            w.SetCastleOrder(wood, buy: false, sell: true, limit: 0);
            Assert.That(w.FoundTown(Scenarios.At(14, 8), out var town).Ok);
            foreach (var d in new[] { 0, 1, 2 }) Scenarios.Place(w, "hut", town.Center.Neighbor(d));
            town.Stock[wood] = 0;
            double before = w.Treasury;
            w.Run(3 * Minute);
            Assert.That(town.GoodsBought, Is.GreaterThan(0));
            Assert.That(w.Castle.Stock[wood], Is.LessThan(40));
            Assert.That(w.Treasury, Is.GreaterThan(before));
            Assert.That(w.LifetimeTariff, Is.EqualTo(0), "no Tariff on the King's own Goods");
        }

        [Test]
        public void TownLevels_AddSlotsAndTraders()
        {
            var w = NewKingdom(out _);
            Assert.That(w.FoundTown(Scenarios.At(14, 8), out var town).Ok);
            Assert.That(w.SlotCap(town), Is.EqualTo(8));
            Assert.That(w.LevelUp(town).Ok);
            Assert.That(town.Level, Is.EqualTo(2));
            Assert.That(town.Gold, Is.EqualTo(1000 - 150));
            Assert.That(w.SlotCap(town), Is.EqualTo(12));
            Assert.That(town.Traders.Count, Is.EqualTo(4));
        }

        [Test]
        public void GiveAndTake_MoveGoldAndMood_ButNotHousing()
        {
            var w = NewKingdom(out _);
            Assert.That(w.FoundTown(Scenarios.At(12, 8), out var town).Ok);
            var c = town.Center;
            Scenarios.Place(w, "potato_farm", c.Neighbor(0));
            Scenarios.Place(w, "hut", c.Neighbor(3));
            Scenarios.Place(w, "hut", c.Neighbor(4));
            Assert.That(w.Take(town).Ok, Is.False, "too young");

            w.Run(6 * Minute);
            town.Gold = Math.Max(town.Gold, 1500);
            double popBefore = town.Population[0];
            double treasury = w.Treasury;
            Assert.That(w.Take(town).Ok);
            Assert.That(w.Treasury, Is.EqualTo(treasury + 1000));
            Assert.That(town.EffectiveHappiness(0, w.Tick), Is.LessThan(town.Happiness[0]));
            w.Run(Minute / 2);
            Assert.That(town.Population[0], Is.GreaterThanOrEqualTo(popBefore - 0.01), "Take hurts mood and Tax, not housing");
            Assert.That(w.Take(town).Ok, Is.False, "cooldown");
        }

        [Test]
        public void Upgrades_NeedResearch_ThenAddCapacity()
        {
            var w = NewKingdom(out _);
            Assert.That(w.FoundTown(Scenarios.At(14, 8), out var town).Ok);
            Assert.That(w.PlaceBuilding(w.Content.Building("hut"), town.Center.Neighbor(0), out var hut).Ok);
            w.Run(Minute);
            Assert.That(hut.Built);
            Assert.That(w.CanUpgrade(hut).Reason, Does.Contain("Research"));

            w.ResearchDone.Add("r_hut2");
            town.Stock[G(w, "planks")] = 20;
            Assert.That(w.StartUpgrade(hut).Ok);
            w.Run(Minute);
            Assert.That(hut.Level, Is.EqualTo(2));
            Assert.That(TownSim.HouseCapacity(w, hut), Is.EqualTo(3));
            Assert.That(w.Stats.Upgrades, Is.EqualTo(1));
        }

        [Test]
        public void Missions_PayGoldAndAdvance()
        {
            var w = NewKingdom(out _);
            Assert.That(w.FoundTown(Scenarios.At(26, 9), out var town).Ok);
            var c = town.Center;
            PlaceOn(w, town, "lumberjack", Terrain.Forest, 2);
            Scenarios.Place(w, "hut", c.Neighbor(2));
            Scenarios.Place(w, "hut", c.Neighbor(3));
            double before = w.Treasury;
            w.Run(Minute);
            Assert.That(w.MissionIndex, Is.EqualTo(1));
            Assert.That(w.Treasury, Is.GreaterThanOrEqualTo(before + 300));
        }

        [Test]
        public void Scouts_RevealFog_AndSpendProvisions()
        {
            var w = NewKingdom(out var castle, fog: true);
            var scout = w.Scouts[0];
            Assert.That(ScoutSim.Explore(w, scout, Scenarios.At(14, 8)).Ok);
            int fogBefore = 0;
            foreach (var x in w.RevealedMask) if (x) fogBefore++;
            w.Run(Minute);
            int revealed = 0;
            foreach (var x in w.RevealedMask) if (x) revealed++;
            Assert.That(revealed, Is.GreaterThan(fogBefore), "the Scout lifted fog");
            Assert.That(scout.Carry + w.Castle.Provisions, Is.LessThan(10 + 15), "provisions spent");
        }

        [Test]
        public void DestroyingABuilding_RefundsGold_AndCascadesOrphans()
        {
            var w = NewKingdom(out _);
            Assert.That(w.FoundTown(Scenarios.At(14, 8), out var town).Ok);
            var a = town.Center.Neighbor(0);
            var b = a.Neighbor(0);
            Assert.That(w.PlaceBuilding(w.Content.Building("hut"), a, out var inner).Ok);
            Assert.That(w.PlaceBuilding(w.Content.Building("hut"), b, out _).Ok);
            double before = w.Treasury;
            Assert.That(w.DestroyBuilding(inner, out int cascaded).Ok);
            Assert.That(cascaded, Is.EqualTo(1));
            Assert.That(town.Buildings, Is.Empty);
            Assert.That(w.Treasury, Is.EqualTo(before + 600));
        }

        [Test]
        public void SaveAndLoad_ContinueIdentically()
        {
            var w = NewKingdom(out var castle, 21);
            Assert.That(w.FoundTown(Scenarios.At(12, 8), out var farm).Ok);
            foreach (var d in new[] { 0, 1 }) Scenarios.Place(w, "potato_farm", farm.Center.Neighbor(d));
            foreach (var d in new[] { 3, 4, 5 }) Scenarios.Place(w, "hut", farm.Center.Neighbor(d));
            Assert.That(w.FoundTown(Scenarios.At(26, 9), out var timber).Ok);
            PlaceOn(w, timber, "lumberjack", Terrain.Forest, 2);
            foreach (var d in new[] { 3, 4, 5 })
                if (!w.PlaceBuilding("hut", timber.Center.Neighbor(d)).Ok) { }
            Assert.That(w.PlaceBuilding(w.Content.Building("research_center"), castle.Neighbor(3), out _).Ok);
            ResearchSim.Start(w, "r_sheep");
            ScoutSim.Explore(w, w.Scouts[0], Scenarios.At(14, 4));
            w.Run(4 * Minute);

            var copy = SaveGame.Restore(SaveGame.Capture(w), GameContent.Create());
            Assert.That(Fingerprint(copy), Is.EqualTo(Fingerprint(w)), "restored state matches");
            w.Run(4 * Minute);
            copy.Run(4 * Minute);
            Assert.That(Fingerprint(copy), Is.EqualTo(Fingerprint(w)), "and continues identically");
        }

        internal static string Fingerprint(World w)
        {
            var s = new System.Text.StringBuilder();
            s.Append(w.Tick).Append('|').Append(w.Treasury.ToString("R")).Append('|').Append(w.Rng.State).Append('|');
            s.Append(w.MissionIndex).Append('|').Append(w.ActiveResearch).Append('|').Append(w.ResearchDone.Count).Append('|');
            if (w.Castle != null)
            {
                foreach (var x in w.Castle.Stock) s.Append(x.ToString("R")).Append(',');
                s.Append(w.Castle.Provisions.ToString("R"));
            }
            foreach (var sc in w.Scouts) s.Append('|').Append(sc.Position).Append(sc.State);
            foreach (var t in w.Towns)
            {
                s.Append(';').Append(t.Gold.ToString("R"));
                foreach (var x in t.Stock) s.Append(',').Append(x.ToString("R"));
                foreach (var x in t.Population) s.Append(',').Append(x.ToString("R"));
                foreach (var b in t.Buildings) s.Append(',').Append(b.Built).Append(b.OutputStore.ToString("R"));
            }
            return s.ToString();
        }
    }
}
