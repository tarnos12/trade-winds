using System.Collections.Generic;
using System.Linq;
using TradeWinds.Core;
using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Town speech bubbles (GDD §12): every so often a Town says what it lacks or dreams of. One bubble per
    /// Town at a time, 4 seconds each, at least 20 seconds apart, staggered so Towns don't all speak at once.</summary>
    public sealed class Chatter : MonoBehaviour
    {
        const float ShowSeconds = 4f;
        const float Cooldown = 20f;
        const int Order = 26;

        sealed class Bubble
        {
            public GameObject Root;
            public TextMesh Text;
            public SpriteRenderer Back;
            public float HideAt;
            public float NextAt;
            public readonly HashSet<int> Dreamed = new HashSet<int>();
        }

        GameController _game;
        World _world;
        Font _font;
        Transform _root;
        readonly Dictionary<Town, Bubble> _bubbles = new Dictionary<Town, Bubble>();

        public void Init(GameController game)
        {
            _game = game;
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            _root = new GameObject("Chatter").transform;
            _root.SetParent(transform, false);
        }

        void Update()
        {
            if (_game == null || _game.World == null) return;
            if (_world != _game.World)
            {
                foreach (var b in _bubbles.Values) Destroy(b.Root);
                _bubbles.Clear();
                _world = _game.World;
            }
            if (_game.MenuOpen) return;
            float now = Time.unscaledTime;

            foreach (var t in _world.Towns)
            {
                if (!t.Built) continue;
                if (!_bubbles.TryGetValue(t, out var b))
                {
                    b = NewBubble();
                    b.NextAt = now + 6f + (t.Id * 3.7f) % 9f;
                    _bubbles[t] = b;
                }
                if (b.Root.activeSelf && now >= b.HideAt) b.Root.SetActive(false);
                if (now < b.NextAt || _game.Speed == 0) continue;
                b.NextAt = now + Cooldown + (t.Id * 1.3f) % 4f;
                Show(b, t, Line(t, b));
                b.HideAt = now + ShowSeconds;
            }

            foreach (var dead in _bubbles.Keys.Where(t => !_world.Towns.Contains(t)).ToList())
            {
                Destroy(_bubbles[dead].Root);
                _bubbles.Remove(dead);
            }
        }

        /// <summary>The most useful thing this Town could say right now.</summary>
        string Line(Town t, Bubble b)
        {
            var content = _world.Content;
            for (int tier = 0; tier < 4; tier++)
            {
                if (TownSim.TierCapacity(_world, t, tier) <= 0) continue;
                foreach (var n in content.Tiers[tier].Basic)
                    if (t.Satisfaction[tier][n.Good] < 0.5 && t.Stock[n.Good] < 1)
                    {
                        var maker = content.Buildings.FirstOrDefault(d => d.OutputGood == n.Good && d.Kind == BuildingKind.Extractor)
                            ?? content.Buildings.FirstOrDefault(d => d.OutputGood == n.Good);
                        return $"We don't have any {content.Goods[n.Good].Name}!" + (maker != null ? $" Build a {maker.Name}." : "");
                    }
            }
            for (int tier = 0; tier < 4; tier++)
            {
                if (TownSim.TierCapacity(_world, t, tier) <= 0) continue;
                foreach (var n in content.Tiers[tier].Luxury)
                {
                    if (t.Satisfaction[tier][n.Good] > 0.3 || b.Dreamed.Contains(n.Good)) continue;
                    b.Dreamed.Add(n.Good);
                    string line = $"We dream of {content.Goods[n.Good].Name}";
                    var maker = content.Buildings.FirstOrDefault(d => d.OutputGood == n.Good);
                    if (maker != null && !_world.IsUnlocked(maker))
                        line += $": research {content.ResearchNode(maker.UnlockedBy)?.Name}";
                    return line + ".";
                }
            }
            for (int tier = 3; tier >= 0; tier--)
                if (t.Population[tier] >= 1 && t.EffectiveHappiness(tier, _world.Tick) >= 90)
                    return $"{(Tier)tier}s are very happy and pay more Tax.";
            bool anyHouse = false;
            for (int tier = 0; tier < 4; tier++) anyHouse |= TownSim.TierCapacity(_world, t, tier) > 0;
            return anyHouse ? "All is fine here." : "No one lives here yet. Build Huts!";
        }

        Bubble NewBubble()
        {
            var b = new Bubble { Root = new GameObject("Bubble") };
            b.Root.transform.SetParent(_root, false);
            var backGo = new GameObject("Back");
            backGo.transform.SetParent(b.Root.transform, false);
            b.Back = backGo.AddComponent<SpriteRenderer>();
            b.Back.sprite = SpriteFactory.Square;
            b.Back.color = Palette.Paper;
            b.Back.sortingOrder = Order;
            var textGo = new GameObject("Text");
            textGo.transform.SetParent(b.Root.transform, false);
            b.Text = textGo.AddComponent<TextMesh>();
            b.Text.font = _font;
            b.Text.fontSize = 64;
            b.Text.fontStyle = FontStyle.Bold;
            b.Text.characterSize = 0.03f;
            b.Text.anchor = TextAnchor.MiddleCenter;
            b.Text.color = Palette.Ink;
            var mr = textGo.GetComponent<MeshRenderer>();
            mr.sharedMaterial = _font.material;
            mr.sortingOrder = Order + 1;
            b.Root.SetActive(false);
            return b;
        }

        void Show(Bubble b, Town t, string line)
        {
            b.Root.SetActive(true);
            b.Root.transform.position = _game.Board.HexToWorld(t.Center) + new Vector3(0, 0.75f, 0);
            b.Text.text = line;
            // Measure from the font (the text mesh isn't rebuilt until it renders), then stretch the one-unit
            // square sprite behind the text with a little padding. TextMesh world size = pixels × characterSize / 10.
            _font.RequestCharactersInTexture(line, b.Text.fontSize, b.Text.fontStyle);
            float px = 0;
            foreach (char ch in line)
                if (_font.GetCharacterInfo(ch, out var info, b.Text.fontSize, b.Text.fontStyle)) px += info.advance;
            float width = px * b.Text.characterSize / 10f;
            float height = b.Text.fontSize * b.Text.characterSize / 10f;
            b.Back.transform.localScale = new Vector3(width + 0.24f, height + 0.08f, 1f);
        }
    }
}
