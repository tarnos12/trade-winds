using System.Collections.Generic;
using TradeWinds.Core;
using Terrain = TradeWinds.Core.Terrain;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace TradeWinds.Game
{
    /// <summary>Draws the sim: hex Tilemap terrain, roads and fog; Castle, Town and building tokens; moving
    /// Traders, Porters and Scouts. Reads the core only; never owns sim state (ADR 0002).</summary>
    public sealed class BoardView : MonoBehaviour
    {
        public Grid Grid;
        public Tilemap TerrainMap;
        public Tilemap RoadMap;
        public Tilemap FogMap;

        const int OrderBuilding = 10, OrderLabel = 11, OrderPorter = 12, OrderTrader = 13, OrderScout = 14, OrderHover = 30;

        World _world;
        readonly Dictionary<Terrain, Tile> _terrainTiles = new Dictionary<Terrain, Tile>();
        Tile _roadTile, _fogTile;
        int _drawnRoadVersion = -1, _drawnFogVersion = -1;
        Font _font;

        readonly Dictionary<Town, Token> _towns = new Dictionary<Town, Token>();
        readonly Dictionary<Building, Token> _buildings = new Dictionary<Building, Token>();
        readonly Dictionary<CastleBuilding, Token> _compound = new Dictionary<CastleBuilding, Token>();
        Token _castle;
        readonly List<SpriteRenderer> _traderPool = new List<SpriteRenderer>();
        readonly List<SpriteRenderer> _porterPool = new List<SpriteRenderer>();
        readonly List<SpriteRenderer> _scoutPool = new List<SpriteRenderer>();
        readonly List<SpriteRenderer> _markerPool = new List<SpriteRenderer>();
        SpriteRenderer _hover;
        SpriteRenderer _selection;
        Transform _dynamicRoot;

        sealed class Token
        {
            public GameObject Root;
            public SpriteRenderer Body;
            public TextMesh Label;
            public SpriteRenderer Bar;
        }

        public void Bind(World world)
        {
            _world = world;
            if (_font == null) _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (_dynamicRoot != null) Destroy(_dynamicRoot.gameObject);
            _dynamicRoot = new GameObject("Dynamic").transform;
            _dynamicRoot.SetParent(transform, false);
            _towns.Clear();
            _buildings.Clear();
            _compound.Clear();
            _castle = null;
            _traderPool.Clear();
            _porterPool.Clear();
            _scoutPool.Clear();
            _markerPool.Clear();

            TerrainMap.ClearAllTiles();
            RoadMap.ClearAllTiles();
            if (FogMap != null) FogMap.ClearAllTiles();
            var board = world.Board;
            for (int row = 0; row < board.Height; row++)
            for (int col = 0; col < board.Width; col++)
                TerrainMap.SetTile(new Vector3Int(col, row, 0), TileFor(board[Core.Board.FromOffset(col, row)]));
            _drawnRoadVersion = -1;
            _drawnFogVersion = -1;

            _hover = NewSprite("Hover", SpriteFactory.HexOutline, Color.white, OrderHover);
            _hover.transform.localScale = Vector3.one * 0.98f;
            _selection = NewSprite("Selection", SpriteFactory.HexOutline, Palette.Accent, OrderHover - 1);
            _selection.gameObject.SetActive(false);
        }

        Tile TileFor(Terrain t)
        {
            if (_terrainTiles.TryGetValue(t, out var tile)) return tile;
            tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = SpriteFactory.Hex;
            tile.color = Palette.For(t);
            tile.flags = TileFlags.LockColor;
            _terrainTiles[t] = tile;
            return tile;
        }

        // ------------------------------------------------------------------ coordinates

        public Vector3 HexToWorld(Hex h)
        {
            Core.Board.ToOffset(h, out int col, out int row);
            return Grid.GetCellCenterWorld(new Vector3Int(col, row, 0));
        }

        public Hex WorldToHex(Vector3 world)
        {
            var cell = Grid.WorldToCell(world);
            return Core.Board.FromOffset(cell.x, cell.y);
        }

        // ------------------------------------------------------------------ per-frame

        /// <param name="alpha">Fraction of the way to the next tick, for smooth movement.</param>
        public void Render(float alpha)
        {
            if (_world == null) return;
            SyncRoads();
            SyncFog();
            SyncCastle();
            SyncTowns();
            SyncBuildings();
            DrawTraders(alpha);
            DrawPorters(alpha);
            DrawScouts();
        }

        public void SetHover(Hex? hex, bool valid)
        {
            if (hex == null || !_world.Board.Contains(hex.Value))
            {
                _hover.gameObject.SetActive(false);
                return;
            }
            _hover.gameObject.SetActive(true);
            _hover.transform.position = HexToWorld(hex.Value);
            _hover.color = valid ? Palette.Good : Palette.Bad;
        }

        public void SetSelection(Hex? hex)
        {
            if (_selection == null) return;
            _selection.gameObject.SetActive(hex.HasValue);
            if (hex.HasValue) _selection.transform.position = HexToWorld(hex.Value);
        }

        void SyncRoads()
        {
            if (_drawnRoadVersion == _world.RoadVersion) return;
            _drawnRoadVersion = _world.RoadVersion;
            if (_roadTile == null)
            {
                _roadTile = ScriptableObject.CreateInstance<Tile>();
                _roadTile.sprite = SpriteFactory.Hex;
                _roadTile.color = new Color(Palette.Road.r, Palette.Road.g, Palette.Road.b, 0.85f);
                _roadTile.flags = TileFlags.LockColor;
                _roadTile.transform = Matrix4x4.Scale(new Vector3(0.45f, 0.45f, 1f));
            }
            RoadMap.ClearAllTiles();
            foreach (var h in _world.Roads)
            {
                Core.Board.ToOffset(h, out int col, out int row);
                RoadMap.SetTile(new Vector3Int(col, row, 0), _roadTile);
            }
        }

        void SyncFog()
        {
            if (FogMap == null || _drawnFogVersion == _world.FogVersion) return;
            _drawnFogVersion = _world.FogVersion;
            if (_fogTile == null)
            {
                _fogTile = ScriptableObject.CreateInstance<Tile>();
                _fogTile.sprite = SpriteFactory.Hex;
                _fogTile.color = Palette.Fog;
                _fogTile.flags = TileFlags.LockColor;
            }
            var board = _world.Board;
            for (int row = 0; row < board.Height; row++)
            for (int col = 0; col < board.Width; col++)
            {
                var cell = new Vector3Int(col, row, 0);
                bool fog = !_world.IsRevealed(Core.Board.FromOffset(col, row));
                if (fog != FogMap.HasTile(cell)) FogMap.SetTile(cell, fog ? _fogTile : null);
            }
        }

        void SyncCastle()
        {
            var castle = _world.Castle;
            if (castle == null) return;
            if (_castle == null)
            {
                _castle = NewToken("Castle", SpriteFactory.Diamond, Palette.Castle, 0.85f, "K");
                _castle.Root.transform.position = HexToWorld(castle.Center);
                _castle.Label.color = Palette.Ink;
                SetBar(_castle, 1);
            }
            foreach (var cb in castle.Compound)
            {
                if (_compound.ContainsKey(cb)) continue;
                var tok = NewToken(cb.Def.Name, SpriteFactory.Square, Palette.Castle, 0.5f, Palette.Letter(cb.Def));
                tok.Root.transform.position = HexToWorld(cb.Hex);
                SetBar(tok, 1);
                _compound[cb] = tok;
            }
            foreach (var kv in _compound)
                kv.Value.Label.text = Palette.Letter(kv.Key.Def) + (kv.Key.Level > 1 ? kv.Key.Level.ToString() : "");
        }

        void SyncTowns()
        {
            foreach (var town in _world.Towns)
            {
                if (!_towns.TryGetValue(town, out var tok))
                {
                    tok = NewToken("Town " + town.Id, SpriteFactory.Diamond, Palette.ForTown(town.Id), 0.62f, town.Id.ToString());
                    tok.Label.color = Palette.Paper;
                    tok.Label.fontStyle = FontStyle.Bold;
                    tok.Root.transform.position = HexToWorld(town.Center);
                    _towns[town] = tok;
                }
                var c = Palette.ForTown(town.Id);
                tok.Body.color = town.Built ? c : new Color(c.r, c.g, c.b, 0.45f);
                double progress = town.Built ? 1 : (_world.Tick - town.FoundedTick) / (double)_world.Content.Balance.Ticks(_world.Content.Balance.TownBuildSec);
                SetBar(tok, progress);
            }
            Sweep(_towns, t => _world.Towns.Contains(t));
        }

        void SyncBuildings()
        {
            int markers = 0;
            foreach (var town in _world.Towns)
            foreach (var b in town.Buildings)
            {
                if (!_buildings.TryGetValue(b, out var tok))
                {
                    tok = NewToken(b.Def.Name, b.IsHouse ? SpriteFactory.Square : SpriteFactory.Circle,
                        Palette.ForBuilding(b.Def), 0.5f, Palette.Letter(b.Def));
                    tok.Root.transform.position = HexToWorld(b.Hex);
                    _buildings[b] = tok;
                }
                var c = Palette.ForBuilding(b.Def);
                bool idle = b.Built && b.IsWorkplace && b.Workers <= 0.01 && !b.IsUpgrading;
                tok.Body.color = !b.Built ? new Color(c.r, c.g, c.b, 0.4f) : idle ? Color.Lerp(c, Color.gray, 0.6f) : c;
                tok.Label.text = Palette.Letter(b.Def) + (b.Level > 1 ? b.Level.ToString() : "");
                SetBar(tok, TownSim.ConstructionProgress(_world, b));
                if (b.Priority)
                {
                    var star = Pooled(_markerPool, markers++, "Priority", SpriteFactory.Diamond, Palette.Accent, OrderLabel + 1, 0.14f);
                    star.transform.position = HexToWorld(b.Hex) + new Vector3(0.22f, 0.22f, 0);
                }
            }
            for (int i = markers; i < _markerPool.Count; i++) _markerPool[i].gameObject.SetActive(false);
            Sweep(_buildings, b => b.Town != null && _world.Towns.Contains(b.Town) && b.Town.Buildings.Contains(b));
        }

        static void Sweep<T>(Dictionary<T, Token> map, System.Func<T, bool> alive)
        {
            List<T> dead = null;
            foreach (var kv in map)
                if (!alive(kv.Key)) (dead ?? (dead = new List<T>())).Add(kv.Key);
            if (dead == null) return;
            foreach (var k in dead)
            {
                Destroy(map[k].Root);
                map.Remove(k);
            }
        }

        void DrawTraders(float alpha)
        {
            int used = 0;
            double now = _world.Tick + alpha;
            foreach (var town in _world.Towns)
                foreach (var t in town.Traders)
                    DrawTrader(t, now, ref used, Palette.Trader);
            if (_world.Castle != null)
                foreach (var t in _world.Castle.Traders)
                    DrawTrader(t, now, ref used, Palette.Castle);
            for (int i = used; i < _traderPool.Count; i++) _traderPool[i].gameObject.SetActive(false);
        }

        void DrawTrader(Trader t, double now, ref int used, Color color)
        {
            if (t.State == TraderState.Idle || t.Path.Length == 0) return;
            Vector3 pos;
            switch (t.State)
            {
                case TraderState.Outbound:
                    pos = AlongPath(t.Path, 1 - Clamp01((t.PhaseEndTick - now) / t.LegTicks), false);
                    break;
                case TraderState.Loading:
                    pos = HexToWorld(t.Path[t.Path.Length - 1]);
                    break;
                case TraderState.Inbound:
                    pos = AlongPath(t.Path, 1 - Clamp01((t.PhaseEndTick - now) / t.LegTicks), true);
                    break;
                default:
                    pos = HexToWorld(t.Path[0]);
                    break;
            }
            var sr = Pooled(_traderPool, used++, "Trader", SpriteFactory.Square, color, OrderTrader, 0.26f);
            sr.transform.position = pos + new Vector3(0, 0.12f, 0);
            bool loaded = t.State == TraderState.Inbound || t.State == TraderState.Unloading;
            sr.color = loaded ? color : Color.Lerp(color, Color.white, 0.5f);
        }

        void DrawPorters(float alpha)
        {
            int used = 0;
            double now = _world.Tick + alpha;
            foreach (var town in _world.Towns)
            foreach (var p in town.Porters)
            {
                if (p.Job == PorterJob.Idle || p.Target == null) continue;
                double total = System.Math.Max(1, p.FreeTick - p.StartTick);
                double f = Clamp01((now - p.StartTick) / total);
                double outward = f < 0.5 ? f * 2 : (1 - f) * 2;
                var pos = Vector3.Lerp(HexToWorld(town.Center), HexToWorld(p.Target.Hex), (float)outward);
                var sr = Pooled(_porterPool, used++, "Porter", SpriteFactory.Circle, Palette.Porter, OrderPorter, 0.14f);
                sr.transform.position = pos + new Vector3(0.12f, -0.1f, 0);
            }
            for (int i = used; i < _porterPool.Count; i++) _porterPool[i].gameObject.SetActive(false);
        }

        void DrawScouts()
        {
            int used = 0;
            foreach (var s in _world.Scouts)
            {
                if (s.State == ScoutState.Idle || s.State == ScoutState.Refilling) continue;
                var sr = Pooled(_scoutPool, used++, "Scout", SpriteFactory.Circle, Palette.Scout, OrderScout, 0.24f);
                sr.transform.position = HexToWorld(s.Position) + new Vector3(-0.1f, 0.1f, 0);
            }
            for (int i = used; i < _scoutPool.Count; i++) _scoutPool[i].gameObject.SetActive(false);
        }

        Vector3 AlongPath(Hex[] path, double f, bool reverse)
        {
            if (path.Length == 1) return HexToWorld(path[0]);
            if (reverse) f = 1 - f;
            double x = f * (path.Length - 1);
            int i = Mathf.Clamp((int)x, 0, path.Length - 2);
            return Vector3.Lerp(HexToWorld(path[i]), HexToWorld(path[i + 1]), (float)(x - i));
        }

        static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

        // ------------------------------------------------------------------ helpers

        SpriteRenderer Pooled(List<SpriteRenderer> pool, int index, string name, Sprite sprite, Color color, int order, float scale)
        {
            while (pool.Count <= index)
            {
                var sr = NewSprite(name, sprite, color, order);
                sr.transform.localScale = Vector3.one * scale;
                pool.Add(sr);
            }
            var s = pool[index];
            s.gameObject.SetActive(true);
            return s;
        }

        SpriteRenderer NewSprite(string name, Sprite sprite, Color color, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_dynamicRoot, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.color = color;
            sr.sortingOrder = order;
            return sr;
        }

        Token NewToken(string name, Sprite sprite, Color color, float size, string letter)
        {
            var tok = new Token();
            tok.Root = new GameObject(name);
            tok.Root.transform.SetParent(_dynamicRoot, false);

            tok.Body = tok.Root.AddComponent<SpriteRenderer>();
            tok.Body.sprite = sprite;
            tok.Body.color = color;
            tok.Body.sortingOrder = OrderBuilding;
            tok.Root.transform.localScale = Vector3.one * size;

            var labelGo = new GameObject("Label");
            labelGo.transform.SetParent(tok.Root.transform, false);
            tok.Label = labelGo.AddComponent<TextMesh>();
            tok.Label.text = letter;
            tok.Label.font = _font;
            tok.Label.fontSize = 64;
            tok.Label.characterSize = 0.06f / size * 0.5f;
            tok.Label.anchor = TextAnchor.MiddleCenter;
            tok.Label.alignment = TextAlignment.Center;
            tok.Label.color = Palette.Ink;
            var mr = labelGo.GetComponent<MeshRenderer>();
            mr.sharedMaterial = _font.material;
            mr.sortingOrder = OrderLabel;

            var barGo = new GameObject("Progress");
            barGo.transform.SetParent(tok.Root.transform, false);
            tok.Bar = barGo.AddComponent<SpriteRenderer>();
            tok.Bar.sprite = SpriteFactory.Square;
            tok.Bar.color = Palette.Accent;
            tok.Bar.sortingOrder = OrderLabel;
            return tok;
        }

        static void SetBar(Token tok, double progress)
        {
            bool show = progress < 0.999;
            tok.Bar.gameObject.SetActive(show);
            if (!show) return;
            float p = Mathf.Clamp01((float)progress);
            tok.Bar.transform.localScale = new Vector3(0.9f * p, 0.12f, 1f);
            tok.Bar.transform.localPosition = new Vector3(-0.45f * (1 - p), -0.62f, 0);
        }
    }
}
