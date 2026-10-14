using System.Collections.Generic;
using UnityEngine;
using Terrain = TradeWinds.Core.Terrain;

namespace TradeWinds.Game
{
    /// <summary>
    /// The owner's terrain sheet (Resources/terrain-sheet.png): 32×32 pointy-top hexes on a 48 px grid.
    /// Which tile is which was answered in the Hub (docs/design/owner-picks-2026-10-14.json).
    /// Sprites are 1 unit wide at 32 pixels per unit, matching the Board grid cell (1 × 1).
    /// </summary>
    public static class TerrainArt
    {
        const int Cell = 48, Size = 32;
        public const int PixelsPerUnit = 32;
        public const int WaterFrames = 3;

        static Texture2D _sheet;
        static bool _tried;
        static readonly Dictionary<int, Sprite> Cache = new Dictionary<int, Sprite>();
        static Sprite _mask, _outline;

        public static bool Available => Sheet != null;

        static Texture2D Sheet
        {
            get
            {
                if (_tried) return _sheet;
                _tried = true;
                _sheet = Resources.Load<Texture2D>("terrain-sheet");
                if (_sheet != null) _sheet.filterMode = FilterMode.Point;
                return _sheet;
            }
        }

        /// <summary>A few tiles sit one pixel lower in their cell.</summary>
        static int DropOf(int row, int col) => (row == 1 && col == 4) || (row == 6 && col != 1) ? 1 : 0;

        static Sprite At(int row, int col)
        {
            int key = row * 16 + col;
            if (Cache.TryGetValue(key, out var s)) return s;
            var sheet = Sheet;
            int y = sheet.height - row * Cell - Size - DropOf(row, col);
            s = Sprite.Create(sheet, new Rect(col * Cell, y, Size, Size), new Vector2(0.5f, 0.5f), PixelsPerUnit, 0, SpriteMeshType.FullRect);
            s.name = $"terrain r{row}c{col}";
            Cache[key] = s;
            return s;
        }

        /// <summary>Ground hexes; null for terrain without art (Mountains: drawn as a tinted hex).</summary>
        public static Sprite[] Ground(Terrain t)
        {
            switch (t)
            {
                case Terrain.Barren:
                case Terrain.Stone:
                case Terrain.Coal:
                case Terrain.Iron:
                case Terrain.Gold:
                    return new[] { At(1, 0) };
                case Terrain.Clay: return new[] { At(1, 1) };
                case Terrain.Snow: return new[] { At(1, 2), At(1, 8) };
                case Terrain.Desert: return new[] { At(1, 3) };
                case Terrain.Fertile: return new[] { At(1, 4) };
                case Terrain.Forest: return new[] { At(1, 5), At(1, 6), At(1, 7) };
                default: return null;
            }
        }

        /// <summary>Water animation frames. Depth 0 = shallow (by the coast), 1 = open, 2 = deep.</summary>
        public static Sprite[] Water(int depth, bool fish)
        {
            int row = 2 + 2 * Mathf.Clamp(depth, 0, 2) + (fish ? 1 : 0);
            return new[] { At(row, 0), At(row, 1), At(row, 2) };
        }

        /// <summary>Deposit objects drawn on top of the ground hex; null for none.</summary>
        public static Sprite[] Deposit(Terrain t)
        {
            switch (t)
            {
                case Terrain.Gold: return new[] { At(8, 1) };
                case Terrain.Stone: return new[] { At(8, 2), At(8, 5) };
                case Terrain.Coal: return new[] { At(8, 3) };
                case Terrain.Iron: return new[] { At(8, 4) };
                default: return null;
            }
        }

        public static Sprite Castle => Available ? At(0, 0) : null;
        public static Sprite Hut => Available ? At(0, 1) : null;

        /// <summary>The art's hex shape in white (tinted for fog, roads, plain terrain); null without art.</summary>
        public static Sprite HexMask => Available ? (_mask ? _mask : (_mask = MakeMask(false))) : null;

        public static Sprite HexOutline => Available ? (_outline ? _outline : (_outline = MakeMask(true))) : null;

        static Sprite MakeMask(bool outline)
        {
            // Shape from the Barren hex (r1c0). Built from a readable copy: the sheet itself needn't be readable.
            var sheet = Sheet;
            var rt = RenderTexture.GetTemporary(sheet.width, sheet.height, 0, RenderTextureFormat.ARGB32);
            Graphics.Blit(sheet, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var copy = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            copy.ReadPixels(new Rect(0, sheet.height - Cell - Size, Size, Size), 0, 0);
            copy.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);

            var src = copy.GetPixels32();
            bool In(int x, int y) => x >= 0 && y >= 0 && x < Size && y < Size && src[y * Size + x].a > 127;
            var px = new Color32[Size * Size];
            for (int y = 0; y < Size; y++)
            for (int x = 0; x < Size; x++)
            {
                bool inside = In(x, y);
                bool edge = inside && (!In(x - 1, y) || !In(x + 1, y) || !In(x, y - 1) || !In(x, y + 1));
                px[y * Size + x] = new Color32(255, 255, 255, (byte)(outline ? (edge ? 255 : 0) : inside ? 255 : 0));
            }
            Object.Destroy(copy);
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            tex.SetPixels32(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, Size, Size), new Vector2(0.5f, 0.5f), PixelsPerUnit, 0, SpriteMeshType.FullRect);
        }
    }
}
