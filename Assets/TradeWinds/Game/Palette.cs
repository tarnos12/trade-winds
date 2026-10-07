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
        public static readonly Color Panel = new Color(0.11f, 0.086f, 0.059f, 0.92f);
        public static readonly Color PanelEdge = Hex("#6b5636");
        public static readonly Color Accent = Hex("#c98a3c");
        public static readonly Color Good = Hex("#7fbf5a");
        public static readonly Color Bad = Hex("#d9644a");
        public static readonly Color Warn = Hex("#e0b04a");
        public static readonly Color Muted = Hex("#9a8b74");
        public static readonly Color Road = Hex("#8a6a43");
        public static readonly Color Trader = Hex("#f0c35a");
        public static readonly Color Porter = Hex("#fff3d6");
        public static readonly Color Castle = Hex("#e6c15a");
        public static readonly Color Scout = Hex("#e05a4a");
        public static readonly Color Fog = new Color(0.08f, 0.07f, 0.05f, 0.93f);

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
                case Terrain.Fish: return Hex("#3f9ad0");
                case Terrain.Stone: return Hex("#a9a49b");
                case Terrain.Clay: return Hex("#b77a54");
                case Terrain.Coal: return Hex("#4a4642");
                case Terrain.Iron: return Hex("#8d6e63");
                case Terrain.Gold: return Hex("#d8b648");
                default: return Color.magenta;
            }
        }

        public static Color ForTier(Tier tier)
        {
            switch (tier)
            {
                case Tier.Peasant: return Hex("#8fbf5a");
                case Tier.Worker: return Hex("#e0954a");
                case Tier.Burgher: return Hex("#a07fd0");
                default: return Hex("#d0609a");
            }
        }

        public static Color ForBuilding(BuildingDef def)
        {
            if (def.Kind == BuildingKind.Castle) return Castle;
            var c = ForTier(def.Tier);
            return def.Kind == BuildingKind.House ? Color.Lerp(c, Paper, 0.45f) : c;
        }

        /// <summary>Initials of the building name ("Potato Farm" → "PF").</summary>
        public static string Letter(BuildingDef def)
        {
            var parts = def.Name.Split(' ');
            if (parts.Length == 1) return def.Name.Substring(0, 1);
            return parts[0].Substring(0, 1) + parts[1].Substring(0, 1);
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
