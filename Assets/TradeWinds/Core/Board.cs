using System;

namespace TradeWinds.Core
{
    public enum Terrain
    {
        Barren,
        Fertile,
        Desert,
        Snow,
        Water,
        Mountains,
        Forest,
        Fish,
        Stone,
        Clay,
        Coal,
        Iron,
        Gold,
    }

    public static class TerrainRules
    {
        /// <summary>Water, mountains and fish (in water) block building, roads and travel.</summary>
        public static bool IsObstacle(Terrain t) => t == Terrain.Water || t == Terrain.Mountains || t == Terrain.Fish;

        /// <summary>Ground any processor, house or Town centre can stand on (snow: houses only).</summary>
        public static bool IsBuildableGround(Terrain t) => t == Terrain.Barren || t == Terrain.Fertile || t == Terrain.Desert;

        public static bool IsPassable(Terrain t) => !IsObstacle(t);
    }

    /// <summary>A rectangle of pointy-top hexes (odd-r offset layout), addressed by axial <see cref="Hex"/>.</summary>
    public sealed class Board
    {
        public readonly int Width;
        public readonly int Height;
        readonly Terrain[] _terrain;

        public Board(int width, int height, Terrain fill = Terrain.Barren)
        {
            if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width));
            Width = width;
            Height = height;
            _terrain = new Terrain[width * height];
            for (int i = 0; i < _terrain.Length; i++) _terrain[i] = fill;
        }

        public static Hex FromOffset(int col, int row) => new Hex(col - (row - (row & 1)) / 2, row);

        public static void ToOffset(Hex h, out int col, out int row)
        {
            row = h.R;
            col = h.Q + (h.R - (h.R & 1)) / 2;
        }

        public bool Contains(Hex h)
        {
            ToOffset(h, out int col, out int row);
            return col >= 0 && col < Width && row >= 0 && row < Height;
        }

        public int Count => Width * Height;

        public Hex HexAt(int index) => FromOffset(index % Width, index / Width);

        public int Index(Hex h)
        {
            ToOffset(h, out int col, out int row);
            return row * Width + col;
        }

        public Terrain this[Hex h]
        {
            get => _terrain[Index(h)];
            set => _terrain[Index(h)] = value;
        }

        public bool IsPassable(Hex h) => Contains(h) && TerrainRules.IsPassable(this[h]);
    }
}
