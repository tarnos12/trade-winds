using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>
    /// The full game catalogue (GDD §6–§11): 26 Goods, four Population Tiers, ~33 buildings, the research
    /// tree and the Mission chain. Numbers start from the web version's tuned values.
    /// </summary>
    public static class GameContent
    {
        public static Content Create(Balance balance = null)
        {
            var goods = new List<GoodDef>();
            var ids = new Dictionary<string, int>();

            void G(string id, string name, double price)
            {
                ids[id] = goods.Count;
                goods.Add(new GoodDef { Id = id, Name = name, BasePrice = price, Index = goods.Count });
            }

            // Raw
            G("potato", "Potato", 4); G("wood", "Wood", 5); G("fish", "Fish", 5); G("wool", "Wool", 7);
            G("stone", "Stone", 6); G("grain", "Grain", 4); G("clay", "Clay", 6); G("coal", "Coal", 10);
            G("iron", "Iron", 8); G("gold", "Gold", 42);
            // Processed
            G("planks", "Planks", 14); G("flour", "Flour", 12); G("mead", "Mead", 14); G("bricks", "Bricks", 16);
            G("clothes", "Clothes", 22); G("stone_tools", "Stone Tools", 28); G("oil", "Oil", 15); G("iron_tool", "Iron Tools", 22);
            // Luxury
            G("bread", "Bread", 30); G("pottery", "Pottery", 22); G("lamp", "Lamp", 40); G("chairs", "Chairs", 64);
            G("iron_armor", "Iron Armor", 70); G("brandy", "Brandy", 72); G("gold_ring", "Gold Ring", 120);
            G("luxury_clothes", "Luxury Clothes", 240);

            GoodAmount A(string id, double n) => new GoodAmount(ids[id], n);
            GoodAmount[] L(params GoodAmount[] a) => a;

            var ground = new[] { Terrain.Barren, Terrain.Fertile, Terrain.Desert };
            var houseGround = new[] { Terrain.Barren, Terrain.Fertile, Terrain.Desert, Terrain.Snow };
            var buildings = new List<BuildingDef>();

            BuildingDef Extractor(string id, string name, Tier tier, Terrain on, string good, double rate, double gold, GoodAmount[] cost, string unlock)
            {
                var b = new BuildingDef
                {
                    Id = id, Name = name, Kind = BuildingKind.Extractor, Tier = tier, Terrains = new[] { on },
                    OutputGood = ids[good], OutputPerWorkerPerMin = rate, GoldCost = gold, MaterialCost = cost,
                    BuildSec = BuildSec(tier), UnlockedBy = unlock,
                };
                buildings.Add(b);
                return b;
            }

            BuildingDef Processor(string id, string name, Tier tier, string good, double rate, GoodAmount[] inputs, double gold, GoodAmount[] cost, string unlock)
            {
                var b = new BuildingDef
                {
                    Id = id, Name = name, Kind = BuildingKind.Processor, Tier = tier, Terrains = ground,
                    OutputGood = ids[good], OutputPerWorkerPerMin = rate, InputsPerOutput = inputs,
                    GoldCost = gold, MaterialCost = cost, BuildSec = BuildSec(tier), UnlockedBy = unlock,
                };
                buildings.Add(b);
                return b;
            }

            BuildingDef House(string id, string name, Tier tier, double gold, GoodAmount[] cost, string unlock)
            {
                var b = new BuildingDef
                {
                    Id = id, Name = name, Kind = BuildingKind.House, Tier = tier, Terrains = houseGround,
                    HouseCapacity = 2, GoldCost = gold, MaterialCost = cost, BuildSec = BuildSec(tier), UnlockedBy = unlock,
                };
                buildings.Add(b);
                return b;
            }

            UpgradeLevel Up(int level, string unlock, double gold, GoodAmount[] cost, UpgradeEffect effect, double value, int slots = 0) =>
                new UpgradeLevel { Level = level, UnlockedBy = unlock, GoldCost = gold, MaterialCost = cost, Effect = effect, Value = value, ExtraWorkerSlots = slots };

            // ---- Houses
            var hut = House("hut", "Hut", Tier.Peasant, 300, L(A("wood", 10)), null);
            hut.Upgrades = new[]
            {
                Up(2, "r_hut2", 100, L(A("wood", 30), A("planks", 10)), UpgradeEffect.HouseCapacity, 1),
                Up(3, "r_hut3", 250, L(A("stone", 30), A("planks", 20), A("stone_tools", 5)), UpgradeEffect.HouseCapacity, 1),
                Up(4, "r_hut4", 500, L(A("bricks", 30), A("stone", 20), A("stone_tools", 10)), UpgradeEffect.BasicUse, 0.7),
                Up(5, "r_hut5", 900, L(A("bricks", 60), A("iron", 30), A("iron_tool", 10)), UpgradeEffect.LuxuryUse, 0.7),
            };
            House("cottage", "Cottage", Tier.Worker, 90, L(A("wood", 30), A("stone", 20), A("planks", 5)), "r_cottage");
            House("manor", "Manor", Tier.Burgher, 220, L(A("wood", 40), A("stone", 30), A("planks", 10), A("bricks", 10)), "r_manor");
            House("aristocrat_home", "Aristocrats Home", Tier.Aristocrat, 400, L(A("wood", 40), A("stone", 30), A("bricks", 20)), "r_aristocrat_home");

            // ---- Peasant workplaces
            var lumberjack = Extractor("lumberjack", "Lumberjack", Tier.Peasant, Terrain.Forest, "wood", 7.5, 0, L(A("wood", 10)), null);
            lumberjack.Upgrades = new[]
            {
                Up(2, "r_lumber2", 200, L(A("wood", 20)), UpgradeEffect.Output, 1.25),
                Up(3, "r_lumber3", 450, L(A("wood", 30), A("stone", 15)), UpgradeEffect.Output, 1.5),
            };
            var potatoFarm = Extractor("potato_farm", "Potato Farm", Tier.Peasant, Terrain.Fertile, "potato", 6, 0, L(A("wood", 10)), null);
            potatoFarm.Upgrades = new[]
            {
                Up(2, "r_potato2", 200, L(A("wood", 20)), UpgradeEffect.Output, 1.25),
                Up(3, "r_potato3", 450, L(A("wood", 30), A("stone", 15)), UpgradeEffect.Output, 1.5),
            };
            Extractor("fishery", "Fishery", Tier.Peasant, Terrain.Fish, "fish", 6, 0, L(A("wood", 10)), "r_fishery");
            Extractor("sheep_farm", "Sheep Farm", Tier.Peasant, Terrain.Fertile, "wool", 5, 0, L(A("wood", 15)), "r_sheep");
            Extractor("farm", "Grain Farm", Tier.Peasant, Terrain.Fertile, "grain", 6, 250, L(), "r_farm");
            Extractor("quarry", "Quarry", Tier.Peasant, Terrain.Stone, "stone", 4, 0, L(A("wood", 15)), "r_quarry");
            var sawmill = Processor("sawmill", "Sawmill", Tier.Peasant, "planks", 2.5, L(A("wood", 1)), 0, L(A("wood", 20)), null);
            sawmill.Upgrades = new[]
            {
                Up(2, "r_sawmill2", 220, L(A("wood", 25)), UpgradeEffect.Output, 1.25),
                Up(3, "r_sawmill3", 480, L(A("wood", 35), A("stone", 15), A("stone_tools", 5)), UpgradeEffect.Output, 1.5, 1),
            };
            Processor("charcoal_burner", "Charcoal Burner", Tier.Peasant, "coal", 4, L(A("wood", 1)), 40, L(A("wood", 20), A("stone", 5)), "r_charcoal");

            // ---- Worker workplaces
            var mineCost = L(A("wood", 20), A("planks", 5));
            Extractor("coal_mine", "Coal Mine", Tier.Worker, Terrain.Coal, "coal", 4, 60, mineCost, "r_coal_mine");
            Extractor("clay_pit", "Clay Pit", Tier.Worker, Terrain.Clay, "clay", 4, 60, mineCost, "r_clay_pit");
            Extractor("iron_mine", "Iron Mine", Tier.Worker, Terrain.Iron, "iron", 4, 60, mineCost, "r_iron_mine");
            Extractor("gold_mine", "Gold Mine", Tier.Worker, Terrain.Gold, "gold", 4, 120, L(A("planks", 15), A("stone", 15)), "r_gold_mine");
            var wCost = L(A("wood", 20), A("stone", 10), A("planks", 5));
            Processor("mill", "Mill", Tier.Worker, "flour", 4, L(A("grain", 1)), 90, wCost, "r_mill");
            Processor("bakery", "Bakery", Tier.Worker, "bread", 4, L(A("flour", 1)), 90, wCost, "r_bakery");
            Processor("brewery", "Brewery", Tier.Worker, "mead", 4, L(A("grain", 1)), 90, wCost, "r_brewery");
            Processor("brickworks", "Brickworks", Tier.Worker, "bricks", 4, L(A("clay", 1)), 90, wCost, "r_brickworks");
            Processor("tailoring", "Tailoring", Tier.Worker, "clothes", 4, L(A("wool", 1)), 90, wCost, "r_tailoring");
            Processor("stone_tools_maker", "Stone Tools Maker", Tier.Worker, "stone_tools", 4, L(A("planks", 1), A("stone", 1)), 90, wCost, "r_stone_tools");
            Processor("oil_maker", "Oil Maker", Tier.Worker, "oil", 4, L(A("fish", 1)), 90, wCost, "r_oil");
            Processor("pottery", "Pottery", Tier.Worker, "pottery", 4, L(A("clay", 1)), 90, wCost, "r_pottery");
            Processor("lamp_maker", "Lamp Maker", Tier.Worker, "lamp", 4, L(A("oil", 1)), 90, wCost, "r_lamp");
            Processor("carpentry", "Carpentry", Tier.Worker, "chairs", 4, L(A("planks", 1), A("oil", 1)), 90, wCost, "r_carpentry");

            // ---- Burgher workplaces
            var bCost = L(A("planks", 15), A("bricks", 10), A("stone", 10));
            Processor("forge", "Forge", Tier.Burgher, "iron_tool", 4, L(A("wood", 1), A("iron", 1)), 180, bCost, "r_forge");
            Processor("armory", "Armory", Tier.Burgher, "iron_armor", 4, L(A("coal", 1), A("iron", 1)), 180, bCost, "r_armory");
            Processor("distillery", "Distillery", Tier.Burgher, "brandy", 4, L(A("mead", 1), A("pottery", 1)), 180, bCost, "r_distillery");
            Processor("goldsmith", "Goldsmith", Tier.Burgher, "gold_ring", 4, L(A("gold", 1), A("iron_tool", 1)), 240, bCost, "r_goldsmith");
            Processor("luxury_tailor", "Luxury Tailor", Tier.Burgher, "luxury_clothes", 4, L(A("clothes", 1), A("gold_ring", 1)), 240, bCost, "r_luxury_tailor");

            // ---- Castle Compound
            buildings.Add(new BuildingDef
            {
                Id = "research_center", Name = "Research Center", Kind = BuildingKind.Castle, Terrains = ground,
                GoldCost = 300, MaterialCost = L(A("stone", 20), A("wood", 10)),
                Upgrades = new[]
                {
                    Up(2, null, 400, L(A("planks", 20), A("stone", 15)), UpgradeEffect.Output, 3),
                    Up(3, null, 800, L(A("planks", 30), A("iron_tool", 15)), UpgradeEffect.Output, 4),
                    Up(4, null, 1500, L(A("iron_tool", 25), A("chairs", 15)), UpgradeEffect.Output, 6),
                },
            });
            buildings.Add(new BuildingDef
            {
                Id = "provisioner", Name = "Provisioner", Kind = BuildingKind.Castle, Terrains = ground, GoldCost = 200,
            });
            buildings.Add(new BuildingDef
            {
                Id = "advanced_provisioner", Name = "Advanced Provisioner", Kind = BuildingKind.Castle, Terrains = ground,
                GoldCost = 400, UnlockedBy = "r_adv_provisioner",
            });

            // ---- Needs (per person per game-minute; GDD §7 matrix)
            const double basic = 1.08, lux = 0.6;
            var tiers = new[]
            {
                new TierNeeds
                {
                    Tier = Tier.Peasant, TaxPerPersonPerMin = 12,
                    Basic = L(A("potato", 1.3), A("wood", 0.9)), Luxury = L(A("fish", lux), A("wool", lux)),
                },
                new TierNeeds
                {
                    Tier = Tier.Worker, TaxPerPersonPerMin = 18,
                    Basic = L(A("fish", basic), A("coal", basic)), Luxury = L(A("clothes", lux), A("bread", lux), A("mead", lux)),
                },
                new TierNeeds
                {
                    Tier = Tier.Burgher, TaxPerPersonPerMin = 26.4,
                    Basic = L(A("lamp", basic), A("bread", basic), A("mead", basic), A("clothes", basic)),
                    Luxury = L(A("chairs", lux), A("pottery", lux), A("gold_ring", lux)),
                },
                new TierNeeds
                {
                    Tier = Tier.Aristocrat, TaxPerPersonPerMin = 48,
                    Basic = L(A("lamp", basic), A("mead", basic), A("iron_armor", basic), A("chairs", basic), A("pottery", basic)),
                    Luxury = L(A("brandy", lux), A("luxury_clothes", lux), A("gold_ring", lux)),
                },
            };

            // ---- Research
            var research = new List<ResearchNode>();
            void R(string id, string name, ResearchBand band, GoodAmount[] mats, string[] req = null, Modifier mod = Modifier.None, double value = 0, string desc = null) =>
                research.Add(new ResearchNode { Id = id, Name = name, Band = band, Materials = mats, Requires = req ?? new string[0], Modifier = mod, Value = value, Description = desc });

            // Peasant band
            R("r_fishery", "Fishery", ResearchBand.Peasant, L(A("wood", 15), A("potato", 10)), desc: "Unlocks the Fishery (fish hex).");
            R("r_sheep", "Sheep Farm", ResearchBand.Peasant, L(A("wood", 20), A("potato", 15)), desc: "Unlocks the Sheep Farm (wool).");
            R("r_quarry", "Quarry", ResearchBand.Peasant, L(A("wood", 25)), desc: "Unlocks the Quarry (stone hex).");
            R("r_farm", "Grain Farm", ResearchBand.Peasant, L(A("wood", 20), A("planks", 10)), desc: "Unlocks the Grain Farm.");
            R("r_charcoal", "Charcoal Burner", ResearchBand.Peasant, L(A("wood", 30), A("planks", 5)), new[] { "r_quarry" }, desc: "Wood → coal.");
            R("r_hut2", "Sturdy Huts", ResearchBand.Peasant, L(A("wood", 25), A("planks", 10)), desc: "Hut level 2: +1 resident.");
            R("r_lumber2", "Lumber Tools", ResearchBand.Peasant, L(A("wood", 30)), desc: "Lumberjack level 2: ×1.25.");
            R("r_potato2", "Better Plows", ResearchBand.Peasant, L(A("wood", 20), A("potato", 20)), desc: "Potato Farm level 2: ×1.25.");
            R("r_sawmill2", "Saw Blades", ResearchBand.Peasant, L(A("planks", 20)), desc: "Sawmill level 2: ×1.25.");

            // Worker band
            R("r_cottage", "Cottages", ResearchBand.Worker, L(A("wood", 30), A("stone", 20), A("planks", 10)), new[] { "r_quarry" }, desc: "Unlocks the Cottage: Workers move in.");
            R("r_coal_mine", "Coal Mine", ResearchBand.Worker, L(A("stone", 20), A("planks", 15)), new[] { "r_cottage" });
            R("r_clay_pit", "Clay Pit", ResearchBand.Worker, L(A("wood", 20), A("stone", 15)), new[] { "r_cottage" });
            R("r_tailoring", "Tailoring", ResearchBand.Worker, L(A("planks", 15), A("wool", 10)), new[] { "r_cottage", "r_sheep" });
            R("r_mill", "Mill", ResearchBand.Worker, L(A("planks", 15), A("grain", 10)), new[] { "r_cottage", "r_farm" });
            R("r_bakery", "Bakery", ResearchBand.Worker, L(A("planks", 20), A("flour", 10)), new[] { "r_mill" });
            R("r_brewery", "Brewery", ResearchBand.Worker, L(A("planks", 20), A("grain", 15)), new[] { "r_mill" });
            R("r_brickworks", "Brickworks", ResearchBand.Worker, L(A("planks", 15), A("clay", 15)), new[] { "r_clay_pit" });
            R("r_stone_tools", "Stone Tools", ResearchBand.Worker, L(A("planks", 20), A("stone", 20)), new[] { "r_cottage" });
            R("r_oil", "Oil Maker", ResearchBand.Worker, L(A("fish", 20), A("planks", 15)), new[] { "r_cottage", "r_fishery" });
            R("r_pottery", "Pottery", ResearchBand.Worker, L(A("clay", 20), A("planks", 10)), new[] { "r_clay_pit" });
            R("r_lamp", "Lamp Maker", ResearchBand.Worker, L(A("oil", 15), A("planks", 15)), new[] { "r_oil" });
            R("r_carpentry", "Carpentry", ResearchBand.Worker, L(A("planks", 25), A("oil", 10)), new[] { "r_oil" });
            R("r_iron_mine", "Iron Mine", ResearchBand.Worker, L(A("planks", 20), A("stone_tools", 10)), new[] { "r_stone_tools" });
            R("r_hut3", "Stone Huts", ResearchBand.Worker, L(A("stone", 30), A("planks", 20), A("stone_tools", 5)), new[] { "r_hut2", "r_stone_tools" }, desc: "Hut level 3: +1 resident.");
            R("r_lumber3", "Felling Crews", ResearchBand.Worker, L(A("wood", 30), A("stone", 15)), new[] { "r_lumber2" }, desc: "Lumberjack level 3: ×1.5.");
            R("r_potato3", "Irrigation", ResearchBand.Worker, L(A("wood", 30), A("stone", 15)), new[] { "r_potato2" }, desc: "Potato Farm level 3: ×1.5.");
            R("r_sawmill3", "Water Wheel", ResearchBand.Worker, L(A("planks", 20), A("stone_tools", 5)), new[] { "r_sawmill2", "r_stone_tools" }, desc: "Sawmill level 3: ×1.5, +1 worker slot.");

            // Burgher band
            R("r_manor", "Manors", ResearchBand.Burgher, L(A("bricks", 20), A("planks", 20)), new[] { "r_brickworks" }, desc: "Unlocks the Manor: Burghers move in.");
            R("r_forge", "Forge", ResearchBand.Burgher, L(A("bricks", 15), A("iron", 15)), new[] { "r_manor", "r_iron_mine" });
            R("r_armory", "Armory", ResearchBand.Burgher, L(A("iron_tool", 10), A("coal", 20)), new[] { "r_forge", "r_coal_mine" });
            R("r_distillery", "Distillery", ResearchBand.Burgher, L(A("pottery", 15), A("mead", 15)), new[] { "r_manor", "r_brewery", "r_pottery" });
            R("r_gold_mine", "Gold Mine", ResearchBand.Burgher, L(A("iron_tool", 10), A("bricks", 15)), new[] { "r_forge" });
            R("r_goldsmith", "Goldsmith", ResearchBand.Burgher, L(A("gold", 10), A("iron_tool", 10)), new[] { "r_gold_mine" });
            R("r_luxury_tailor", "Luxury Tailor", ResearchBand.Burgher, L(A("clothes", 20), A("gold_ring", 5)), new[] { "r_goldsmith", "r_tailoring" });
            R("r_hut4", "Brick Huts", ResearchBand.Burgher, L(A("bricks", 30), A("stone", 20), A("stone_tools", 10)), new[] { "r_hut3", "r_brickworks" }, desc: "Hut level 4: −30% Basic Need use.");
            R("r_hut5", "Fine Huts", ResearchBand.Burgher, L(A("bricks", 40), A("iron", 20), A("iron_tool", 10)), new[] { "r_hut4", "r_forge" }, desc: "Hut level 5: −30% Luxury use.");

            // Aristocrat band
            R("r_aristocrat_home", "Aristocrats Home", ResearchBand.Aristocrat, L(A("bricks", 30), A("planks", 15)), new[] { "r_manor", "r_luxury_tailor" }, desc: "Unlocks the Aristocrats Home.");

            // Kingdom
            R("k_crop", "Crop Rotation", ResearchBand.Kingdom, L(A("wood", 20), A("potato", 15)), null, Modifier.ExtractorOutput, 1.2, "Extractors produce ×1.2.");
            R("k_paved", "Paved Roads", ResearchBand.Kingdom, L(A("wood", 25), A("planks", 10)), null, Modifier.TraderSpeed, 1.5, "Traders travel ×1.5 faster.");
            R("k_tax", "Tax Ledgers", ResearchBand.Kingdom, L(A("potato", 20), A("wood", 15)), null, Modifier.TariffBonus, 0.03, "Tariff +3%.");
            R("k_scouts", "Scouting Party", ResearchBand.Kingdom, L(A("potato", 20), A("wood", 20)), null, Modifier.ExtraScouts, 1, "+1 Scout.");
            R("k_guilds", "Guild Halls", ResearchBand.Kingdom, L(A("planks", 20), A("stone", 25)), new[] { "k_crop" }, Modifier.ProcessorOutput, 1.2, "Processors produce ×1.2.");
            R("k_carts", "Larger Carts", ResearchBand.Kingdom, L(A("planks", 25), A("wood", 20)), new[] { "k_paved" }, Modifier.TraderCapacity, 1.5, "Traders carry ×1.5.");
            R("k_caravan", "Extra Caravan", ResearchBand.Kingdom, L(A("planks", 30), A("stone_tools", 10)), new[] { "k_paved" }, Modifier.ExtraTraders, 1, "+1 Trader per Town.");
            R("k_tariff_office", "Tariff Office", ResearchBand.Kingdom, L(A("clothes", 15), A("planks", 20)), new[] { "k_tax" }, Modifier.TariffSlider, 1, "Set the Tariff between 10% and 40%.");
            R("k_charters", "Town Charters", ResearchBand.Kingdom, L(A("planks", 20), A("stone_tools", 15)), new[] { "k_tax" }, Modifier.TownSlots, 1, "+1 building slot per Town.");
            R("k_grants", "Township Grants", ResearchBand.Kingdom, L(A("planks", 30), A("stone", 30)), new[] { "k_tax" }, Modifier.TownCap, 3, "Town limit +3.");
            R("k_census", "Royal Census", ResearchBand.Kingdom, L(A("bread", 20), A("clothes", 20)), new[] { "k_grants" }, Modifier.HousingBonus, 1.15, "Houses hold ×1.15 residents.");
            R("k_province", "Provincial Rule", ResearchBand.Kingdom, L(A("bricks", 30), A("iron_tool", 15)), new[] { "k_grants" }, Modifier.TownCap, 3, "Town limit +3.");
            R("k_bureaucracy", "Grand Bureaucracy", ResearchBand.Kingdom, L(A("gold_ring", 15), A("chairs", 25)), new[] { "k_tariff_office" }, Modifier.TariffBonus, 0.07, "Tariff +7%.");
            R("r_adv_provisioner", "Advanced Provisioner", ResearchBand.Kingdom, L(A("fish", 15), A("planks", 10)), new[] { "r_fishery" }, desc: "Unlocks the Advanced Provisioner (fish + potato → provisions).");

            // ---- Missions (sequential; Victory = completing the last one)
            Objective O(ObjectiveKind k, double n, string label, string target = null, Tier tier = Tier.Peasant) =>
                new Objective { Kind = k, Count = n, Label = label, Target = target, Tier = tier };
            var missions = new[]
            {
                new MissionDef
                {
                    Id = "m1", Name = "Found Your Realm", RewardGold = 300,
                    Objectives = new[] { O(ObjectiveKind.FoundTowns, 1, "Found a Town"), O(ObjectiveKind.Construct, 2, "Build 2 Lumberjacks", "lumberjack"), O(ObjectiveKind.Construct, 2, "Build 2 Huts", "hut") },
                    Tip = "Found a Town on open ground beside a forest. Huts bring Peasants; Peasants work the Lumberjacks.",
                },
                new MissionDef
                {
                    Id = "m2", Name = "Trade Winds", RewardGold = 500,
                    Objectives = new[] { O(ObjectiveKind.FoundTowns, 2, "Found a second Town"), O(ObjectiveKind.Construct, 2, "Build 2 Potato Farms", "potato_farm"), O(ObjectiveKind.TariffEarned, 20, "Earn 20 Tariff") },
                    Tip = "Give your second Town potato fields. Specialised Towns trade with each other, and every trade pays the Crown a Tariff.",
                },
                new MissionDef
                {
                    Id = "m3", Name = "The King's Scholars", RewardGold = 500,
                    Objectives = new[] { O(ObjectiveKind.Construct, 1, "Build the Research Center", "research_center"), O(ObjectiveKind.ResearchDone, 1, "Finish a research") },
                    Tip = "Place the Research Center next to the Castle. Research is paid in Goods from the Castle Stock — royal Traders buy them from your Towns.",
                },
                new MissionDef
                {
                    Id = "m4", Name = "A Growing Town", RewardGold = 600,
                    Objectives = new[] { O(ObjectiveKind.Construct, 1, "Build a Sawmill", "sawmill"), O(ObjectiveKind.Upgrades, 1, "Upgrade a building") },
                    Tip = "Research an upgrade (e.g. Sturdy Huts), then select a building in its Town panel and upgrade it.",
                },
                new MissionDef
                {
                    Id = "m5", Name = "Trade Routes", RewardGold = 800,
                    Objectives = new[] { O(ObjectiveKind.TradeGood, 60, "Trade 60 Potato between Towns", "potato"), O(ObjectiveKind.TariffEarned, 300, "Earn 300 Tariff in total") },
                    Tip = "Roads double Trader speed. More Towns trading means more Tariff.",
                },
                new MissionDef
                {
                    Id = "m6", Name = "The Workers Arrive", RewardGold = 1000,
                    Objectives = new[] { O(ObjectiveKind.Construct, 1, "Build a Cottage", "cottage"), O(ObjectiveKind.Residents, 4, "House 4 Workers", null, Tier.Worker) },
                    Tip = "Workers need Fish and Coal. Research the Fishery and a Charcoal Burner or Coal Mine first.",
                },
                new MissionDef
                {
                    Id = "m7", Name = "The King's Works", RewardGold = 1200,
                    Objectives = new[] { O(ObjectiveKind.Construct, 20, "Have 20 buildings"), O(ObjectiveKind.Upgrades, 3, "Make 3 upgrades") },
                    Tip = "Level up your Towns (Town panel) for more building slots and Traders.",
                },
                new MissionDef
                {
                    Id = "m8", Name = "Burghers", RewardGold = 1500,
                    Objectives = new[] { O(ObjectiveKind.Construct, 1, "Build a Manor", "manor"), O(ObjectiveKind.Residents, 4, "House 4 Burghers", null, Tier.Burgher) },
                    Tip = "Burghers need Lamps, Bread, Mead and Clothes — a web of Worker-tier chains across your Towns.",
                },
                new MissionDef
                {
                    Id = "m9", Name = "The Good Life", RewardGold = 0,
                    Objectives = new[] { O(ObjectiveKind.Construct, 1, "Build an Aristocrats Home", "aristocrat_home"), O(ObjectiveKind.EstateHappiness, 99.5, "Aristocrats at 100% happiness") },
                    Tip = "Aristocrats need Lamps, Mead, Iron Armor, Chairs and Pottery, plus Brandy, Luxury Clothes and Gold Rings. Make them perfectly happy to win.",
                },
            };

            return new Content(goods, buildings, tiers, balance, research, missions);
        }

        static double BuildSec(Tier tier) => tier == Tier.Peasant ? 6 : tier == Tier.Worker ? 10 : tier == Tier.Burgher ? 14 : 18;
    }
}
