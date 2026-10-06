using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Generates placeholder sprites in code (white, tinted per use) until author art arrives.</summary>
    public static class SpriteFactory
    {
        const int HexH = 128;
        const float Sqrt3 = 1.7320508f;

        static Sprite _hex, _hexOutline, _circle, _square, _diamond;

        /// <summary>Pointy-top hex exactly one Tilemap cell (0.866 × 1 units) with a soft edge.</summary>
        public static Sprite Hex => _hex ? _hex : (_hex = MakeHex(false));

        public static Sprite HexOutline => _hexOutline ? _hexOutline : (_hexOutline = MakeHex(true));
        public static Sprite Circle => _circle ? _circle : (_circle = MakeShape(64, (x, y) => x * x + y * y <= 1f, (x, y) => x * x + y * y > 0.78f));
        public static Sprite Square => _square ? _square : (_square = MakeShape(32, (x, y) => Mathf.Abs(x) <= 0.9f && Mathf.Abs(y) <= 0.9f, (x, y) => Mathf.Abs(x) > 0.7f || Mathf.Abs(y) > 0.7f));
        public static Sprite Diamond => _diamond ? _diamond : (_diamond = MakeShape(48, (x, y) => Mathf.Abs(x) + Mathf.Abs(y) <= 1f, (x, y) => Mathf.Abs(x) + Mathf.Abs(y) > 0.8f));

        static Sprite MakeHex(bool outlineOnly)
        {
            int w = Mathf.RoundToInt(HexH * Sqrt3 / 2f);
            var tex = NewTexture(w, HexH);
            float r = HexH / 2f;
            var px = new Color32[w * HexH];
            for (int y = 0; y < HexH; y++)
            for (int x = 0; x < w; x++)
            {
                float dx = Mathf.Abs(x + 0.5f - w / 2f);
                float dy = Mathf.Abs(y + 0.5f - HexH / 2f);
                // Distance inside a pointy-top hexagon, normalised to 1 at the edge.
                float d = Mathf.Max(dx / (r * Sqrt3 / 2f), (dx / Sqrt3 + dy) / r);
                byte a = 0, v = 255;
                if (d <= 1f)
                {
                    if (outlineOnly)
                    {
                        a = d > 0.86f ? (byte)255 : (byte)0;
                    }
                    else
                    {
                        a = 255;
                        if (d > 0.93f) v = 205;
                    }
                }
                px[y * w + x] = new Color32(v, v, v, a);
            }
            tex.SetPixels32(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, w, HexH), new Vector2(0.5f, 0.5f), HexH);
        }

        static Sprite MakeShape(int size, System.Func<float, float, bool> inside, System.Func<float, float, bool> edge)
        {
            var tex = NewTexture(size, size);
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float nx = (x + 0.5f) / size * 2f - 1f;
                float ny = (y + 0.5f) / size * 2f - 1f;
                bool i = inside(nx, ny);
                byte v = i && edge(nx, ny) ? (byte)170 : (byte)255;
                px[y * size + x] = new Color32(v, v, v, i ? (byte)255 : (byte)0);
            }
            tex.SetPixels32(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), size);
        }

        static Texture2D NewTexture(int w, int h) =>
            new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
    }
}
