using System.Collections.Generic;

namespace TradeWinds.Core
{
    public readonly struct Route
    {
        public readonly bool Found;
        /// <summary>Travel cost: 1 per road step, <see cref="Balance.OffRoadCostMultiplier"/> per off-road step.</summary>
        public readonly double Cost;
        public readonly int Steps;
        public readonly bool AllRoad;
        /// <summary>Hexes from start to end, inclusive (empty if not found).</summary>
        public readonly Hex[] Path;

        public Route(bool found, double cost, int steps, bool allRoad, Hex[] path = null)
        {
            Found = found;
            Cost = cost;
            Steps = steps;
            AllRoad = allRoad;
            Path = path ?? System.Array.Empty<Hex>();
        }
    }

    /// <summary>
    /// Shortest routes between hexes. Roads are optional: Traders cross any passable hex, but a step
    /// between two road hexes (Town centres count as road) is cheaper.
    /// </summary>
    public sealed class Pathing
    {
        readonly World _world;
        readonly Dictionary<long, Route> _cache = new Dictionary<long, Route>();
        int _cachedRoadVersion = -1;

        public Pathing(World world)
        {
            _world = world;
        }

        bool IsRoadLike(Hex h)
        {
            if (_world.Roads.Contains(h)) return true;
            foreach (var t in _world.Towns)
                if (t.Center == h) return true;
            return false;
        }

        static long Key(Hex a, Hex b) =>
            ((long)(a.Q & 0xFFFF) << 48) | ((long)(a.R & 0xFFFF) << 32) | ((long)(b.Q & 0xFFFF) << 16) | (long)(b.R & 0xFFFF);

        public Route Find(Hex from, Hex to)
        {
            if (_cachedRoadVersion != _world.RoadVersion)
            {
                _cache.Clear();
                _cachedRoadVersion = _world.RoadVersion;
            }

            long key = Key(from, to);
            if (_cache.TryGetValue(key, out var cached)) return cached;
            var route = Search(from, to);
            _cache[key] = route;
            return route;
        }

        Route Search(Hex from, Hex to)
        {
            var board = _world.Board;
            double offRoad = _world.Content.Balance.OffRoadCostMultiplier;
            if (from == to) return new Route(true, 0, 0, true, new[] { from });

            var dist = new Dictionary<Hex, double> { [from] = 0 };
            var steps = new Dictionary<Hex, int> { [from] = 0 };
            var allRoad = new Dictionary<Hex, bool> { [from] = true };
            var prev = new Dictionary<Hex, Hex>();
            var open = new MinHeap();
            open.Push(from, 0);

            while (open.Count > 0)
            {
                open.Pop(out var cur, out double d);
                if (d > dist[cur] + 1e-9) continue;
                if (cur == to) return new Route(true, d, steps[cur], allRoad[cur], Reconstruct(prev, from, to));

                bool curRoad = IsRoadLike(cur);
                for (int dir = 0; dir < 6; dir++)
                {
                    var next = cur.Neighbor(dir);
                    if (!board.IsPassable(next) && next != to) continue;
                    bool road = curRoad && IsRoadLike(next);
                    double nd = d + (road ? 1 : offRoad);
                    if (dist.TryGetValue(next, out double old) && old <= nd) continue;
                    dist[next] = nd;
                    steps[next] = steps[cur] + 1;
                    allRoad[next] = allRoad[cur] && road;
                    prev[next] = cur;
                    open.Push(next, nd);
                }
            }

            return new Route(false, 0, 0, false);
        }

        static Hex[] Reconstruct(Dictionary<Hex, Hex> prev, Hex from, Hex to)
        {
            var list = new List<Hex> { to };
            var cur = to;
            while (cur != from)
            {
                cur = prev[cur];
                list.Add(cur);
            }
            list.Reverse();
            return list.ToArray();
        }

        sealed class MinHeap
        {
            readonly List<(Hex hex, double pri, long seq)> _items = new List<(Hex, double, long)>();
            long _seq;

            public int Count => _items.Count;

            static bool Less((Hex hex, double pri, long seq) a, (Hex hex, double pri, long seq) b) =>
                a.pri < b.pri || (a.pri == b.pri && a.seq < b.seq);

            public void Push(Hex h, double pri)
            {
                _items.Add((h, pri, _seq++));
                int i = _items.Count - 1;
                while (i > 0)
                {
                    int p = (i - 1) / 2;
                    if (!Less(_items[i], _items[p])) break;
                    (_items[i], _items[p]) = (_items[p], _items[i]);
                    i = p;
                }
            }

            public void Pop(out Hex hex, out double pri)
            {
                var top = _items[0];
                hex = top.hex;
                pri = top.pri;
                int last = _items.Count - 1;
                _items[0] = _items[last];
                _items.RemoveAt(last);
                int i = 0;
                while (true)
                {
                    int l = 2 * i + 1, r = l + 1, m = i;
                    if (l < _items.Count && Less(_items[l], _items[m])) m = l;
                    if (r < _items.Count && Less(_items[r], _items[m])) m = r;
                    if (m == i) break;
                    (_items[i], _items[m]) = (_items[m], _items[i]);
                    i = m;
                }
            }
        }
    }
}
