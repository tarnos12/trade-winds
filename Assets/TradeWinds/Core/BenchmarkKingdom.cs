using System.Collections.Generic;

namespace TradeWinds.Core
{
    /// <summary>
    /// A hand-laid seven-Town Kingdom on open ground that an <see cref="AutoPlayer"/> plays from the first Town
    /// to Victory (Milestone 3 exit). Each Town's surroundings are painted with the terrain its plan needs.
    /// </summary>
    public static class BenchmarkKingdom
    {
        public static AutoPlayer Create(uint seed = 3, Balance balance = null)
        {
            var board = new Board(64, 30);
            var castle = Board.FromOffset(32, 15);
            var world = new World(GameContent.Create(balance), board, seed, castle);
            world.RevealAround(castle, 80);

            var plans = new List<TownPlan>
            {
                new TownPlan { Center = Board.FromOffset(24, 15), Name = "Farmstead" }
                    .Add("hut", 3).Add("potato_farm", 2).Add("lumberjack", 1)
                    .Add("hut", 2).Add("sheep_farm", 2).Add("fishery", 2).Add("hut", 3).Add("farm", 4).Add("potato_farm", 1).Add("hut", 2),
                new TownPlan { Center = Board.FromOffset(40, 15), Name = "Timberhold" }
                    .Add("hut", 3).Add("lumberjack", 2).Add("sawmill", 1)
                    .Add("hut", 2).Add("quarry", 2).Add("charcoal_burner", 3).Add("lumberjack", 2).Add("hut", 3).Add("sheep_farm", 2).Add("sawmill", 1),
                new TownPlan { Center = Board.FromOffset(24, 6), Name = "Millbrook" }
                    .Add("hut", 2).Add("fishery", 1).Add("lumberjack", 1)
                    .Add("cottage", 4).Add("mill", 1).Add("bakery", 1).Add("brewery", 2).Add("tailoring", 1).Add("cottage", 4).Add("brewery", 1).Add("mill", 1).Add("bakery", 1),
                new TownPlan { Center = Board.FromOffset(40, 6), Name = "Claymoor" }
                    .Add("hut", 2).Add("fishery", 1).Add("potato_farm", 1)
                    .Add("cottage", 4).Add("coal_mine", 1).Add("clay_pit", 1).Add("brickworks", 1).Add("pottery", 1).Add("oil_maker", 1).Add("lamp_maker", 1).Add("cottage", 2),
                new TownPlan { Center = Board.FromOffset(24, 24), Name = "Ironvale" }
                    .Add("hut", 2).Add("fishery", 1).Add("lumberjack", 1)
                    .Add("cottage", 4).Add("coal_mine", 1).Add("stone_tools_maker", 1).Add("iron_mine", 2).Add("carpentry", 1).Add("cottage", 3).Add("tailoring", 2).Add("hut", 2),
                new TownPlan { Center = Board.FromOffset(32, 6), Name = "Fishmarket" }
                    .Add("hut", 3).Add("potato_farm", 2).Add("lumberjack", 1)
                    .Add("hut", 3).Add("fishery", 3).Add("potato_farm", 2).Add("hut", 3).Add("farm", 2).Add("fishery", 1).Add("sheep_farm", 3),
                new TownPlan { Center = Board.FromOffset(40, 24), Name = "Goldcrest" }
                    .Add("hut", 2).Add("potato_farm", 1).Add("lumberjack", 1)
                    .Add("cottage", 3).Add("coal_mine", 1).Add("manor", 5).Add("gold_mine", 1).Add("forge", 1).Add("armory", 1).Add("distillery", 1)
                    .Add("goldsmith", 1).Add("luxury_tailor", 1).Add("aristocrat_home", 1),
            };
            AutoPlayer.LayOut(world, plans);

            var research = new List<string>
            {
                "r_fishery", "r_quarry", "r_sheep", "r_farm", "k_tax", "r_hut2", "k_grants", "r_cottage", "r_charcoal",
                "r_mill", "r_tailoring", "r_bakery", "r_brewery", "r_clay_pit", "r_brickworks", "r_oil", "r_lamp", "r_pottery",
                "r_coal_mine", "r_stone_tools", "r_carpentry", "r_iron_mine", "r_manor", "r_forge", "r_armory", "r_distillery",
                "r_gold_mine", "r_goldsmith", "r_luxury_tailor", "r_aristocrat_home",
                "k_paved", "k_crop", "k_caravan", "k_guilds", "k_carts", "r_lumber2", "r_potato2", "r_sawmill2",
            };
            return new AutoPlayer(world, plans, research);
        }
    }
}
