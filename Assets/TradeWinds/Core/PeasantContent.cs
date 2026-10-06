namespace TradeWinds.Core
{
    /// <summary>
    /// Milestone 1 content: the Peasant tier only (GDD §6–7). Basic Needs Potato + Wood, Luxuries Fish + Wool.
    /// Used by tests and until the ScriptableObject data layer exists.
    /// </summary>
    public static class PeasantContent
    {
        public static Content Create(Balance balance = null)
        {
            var potato = new GoodDef { Id = "potato", Name = "Potato", BasePrice = 4 };
            var wood = new GoodDef { Id = "wood", Name = "Wood", BasePrice = 5 };
            var fish = new GoodDef { Id = "fish", Name = "Fish", BasePrice = 5 };
            var wool = new GoodDef { Id = "wool", Name = "Wool", BasePrice = 7 };
            var goods = new[] { potato, wood, fish, wool };
            for (int i = 0; i < goods.Length; i++) goods[i].Index = i;

            GoodAmount[] Wood(double n) => new[] { new GoodAmount(wood.Index, n) };

            var buildings = new[]
            {
                new BuildingDef
                {
                    Id = "hut", Name = "Hut", Kind = BuildingKind.House, Tier = Tier.Peasant,
                    Terrains = new[] { Terrain.Barren, Terrain.Fertile, Terrain.Desert, Terrain.Snow },
                    HouseCapacity = 2, GoldCost = 300, MaterialCost = Wood(10), BuildSec = 6,
                },
                new BuildingDef
                {
                    Id = "lumberjack", Name = "Lumberjack", Kind = BuildingKind.Extractor, Tier = Tier.Peasant,
                    Terrains = new[] { Terrain.Forest },
                    OutputGood = wood.Index, OutputPerWorkerPerMin = 7.5, MaterialCost = Wood(10), BuildSec = 6,
                },
                new BuildingDef
                {
                    Id = "potato_farm", Name = "Potato Farm", Kind = BuildingKind.Extractor, Tier = Tier.Peasant,
                    Terrains = new[] { Terrain.Fertile },
                    OutputGood = potato.Index, OutputPerWorkerPerMin = 6, MaterialCost = Wood(10), BuildSec = 6,
                },
                new BuildingDef
                {
                    Id = "fishery", Name = "Fishery", Kind = BuildingKind.Extractor, Tier = Tier.Peasant,
                    Terrains = new[] { Terrain.Fish },
                    OutputGood = fish.Index, OutputPerWorkerPerMin = 6, MaterialCost = Wood(10), BuildSec = 6,
                },
                new BuildingDef
                {
                    Id = "sheep_farm", Name = "Sheep Farm", Kind = BuildingKind.Extractor, Tier = Tier.Peasant,
                    Terrains = new[] { Terrain.Fertile },
                    OutputGood = wool.Index, OutputPerWorkerPerMin = 5, MaterialCost = Wood(10), BuildSec = 6,
                },
            };

            var peasant = new TierNeeds
            {
                Tier = Tier.Peasant,
                Basic = new[] { new GoodAmount(potato.Index, 1.3), new GoodAmount(wood.Index, 0.9) },
                Luxury = new[] { new GoodAmount(fish.Index, 0.6), new GoodAmount(wool.Index, 0.6) },
                TaxPerPersonPerMin = 12,
            };

            return new Content(goods, buildings, new[] { peasant }, balance);
        }
    }
}
