using TradeWinds.Core;
using Terrain = TradeWinds.Core.Terrain;
using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Placeholder board-game palette (warm parchment / wood) until author art arrives.</summary>
    public static class Palette
    {
        public static readonly Color Background = Hex("#14110c");
        public static readonly Color Paper = Hex("#f2e6cf");
        public static readonly Color Ink = Hex("#3b2f22");
        public static readonly Color Panel = new Color(0.11f, 0.086f, 0.059f, 0.88f);
        public static readonly Color PanelEdge = Hex("#6b5636");
        public static readonly Color Accent = Hex("#c98a3c");
        public static readonly Color Good = Hex("#7fbf5a");
        public static readonly Color Bad = Hex("#d9644a");
        public static readonly Color Road = Hex("#8a6a43");
        public static readonly Color Trader = Hex("#f0c35a");
        public static readonly Color Porter = Hex("#fff3d6");

        public static Color For(Terrain t)
        {
            switch (t)
            {
                case Terrain.Fertile: return Hex("#9dbb5e");
                case Terrain.Barren: return Hex("#c8b182");
                case Terrain.Desert: return Hex("#e2cd92");
                case Terrain.Snow: return Hex("#eef1f2");
                case Terrain.Water: return Hex("#5585b3");
                case Terrain.Mountains: return Hex("#857a70");
                case Terrain.Forest: return Hex("#3e7438");
                case Terrain.Fish: return Hex("#4a90c2");
                case Terrain.Stone: return Hex("#a9a49b");
                case Terrain.Clay: return Hex("#b77a54");
                case Terrain.Coal: return Hex("#4a4642");
                case Terrain.Iron: return Hex("#8d6e63");
                case Terrain.Gold: return Hex("#d8b648");
                default: return Color.magenta;
            }
        }

        public static Color ForBuilding(string id)
        {
            switch (id)
            {
                case "hut": return Hex("#d9b382");
                case "lumberjack": return Hex("#6b8f3a");
                case "potato_farm": return Hex("#b98d4c");
                case "fishery": return Hex("#5fa3cf");
                case "sheep_farm": return Hex("#e8e2d4");
                default: return Paper;
            }
        }

        public static string Letter(string id)
        {
            switch (id)
            {
                case "hut": return "H";
                case "lumberjack": return "L";
                case "potato_farm": return "P";
                case "fishery": return "F";
                case "sheep_farm": return "S";
                default: return "?";
            }
        }

        static readonly Color[] TownColors =
        {
            Hex("#c0504d"), Hex("#4f81bd"), Hex("#9bbb59"), Hex("#8064a2"),
            Hex("#f79646"), Hex("#4bacc6"), Hex("#d4a017"), Hex("#c45a9a"),
        };

        public static Color ForTown(int id) => TownColors[(id - 1) % TownColors.Length];

        public static Color Hex(string html) => ColorUtility.TryParseHtmlString(html, out var c) ? c : Color.magenta;
    }
}
