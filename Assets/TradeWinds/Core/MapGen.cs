using System;
using System.Collections.Generic;

namespace TradeWinds.Core
{
    public sealed class MapSettings
    {
        public int Width = 50;
        public int Height = 25;
        public int Lakes = 3;
        public int MountainRanges = 5;
        public int Patches = 34;
        public int DesertClumps = 4;
        public int FishShoals = 7;
        public int StoneClusters = 5;
    }

    public sealed class GeneratedMap
    {
        public Board Board;
        /// <summary>Where the Kingdom starts (the Castle's spot from Milestone 2). Camera centres here.</summary>
        public Hex Start;
    }

    /// <summary>
    /// Seeded rectangular map (GDD §4, "Fertile" preset, simplified for Milestone 1): water rim, lakes,
    /// mountain ranges, desert clumps, fertile/forest patches, fish shoals and stone, plus start guarantees.
    /// </summary>
    public static class MapGen
    {
        public static GeneratedMap Generate(uint seed, MapSettings s = null)
        {
            s = s ?? new MapSettings();
            var rng = new Rng(seed ^ 0x9E3779B9u);
            var board = new Board(s.Width, s.Height);
            var start = Board.FromOffset(s.Width / 2, s.Height / 2);

            // Water rim.
            for (int row = 0; row < s.Height; row++)
            for (int col = 0; col < s.Width; col++)
            {
                int edge = Math.Min(Math.Min(col, row), Math.Min(s.Width - 1 - col, s.Height - 1 - row));
                if (edge == 0 || (edge == 1 && rng.NextDouble() < 0.45)) board[Board.FromOffset(col, row)] = Terrain.Water;
            }

            for (int i = 0; i < s.DesertClumps; i++) Blob(board, rng, RandomInterior(board, rng, start, 5), 8 + rng.Range(10), Terrain.Desert, OnlyOn(Terrain.Barren));
            for (int i = 0; i < s.Lakes; i++) Blob(board, rng, RandomInterior(board, rng, start, 5), 4 + rng.Range(7), Terrain.Water, OnlyOn(Terrain.Barren, Terrain.Desert));
            for (int i = 0; i < s.MountainRanges; i++) Blob(board, rng, RandomInterior(board, rng, start, 5), 4 + rng.Range(8), Terrain.Mountains, OnlyOn(Terrain.Barren, Terrain.Desert));

            for (int i = 0; i < s.Patches; i++)
            {
                var c = RandomInterior(board, rng, start, 0);
                int size = 3 + rng.Range(8);
                bool pureForest = rng.NextDouble() < 0.25;
                foreach (var h in Blob(board, rng, c, size, Terrain.Fertile, OnlyOn(Terrain.Barren, Terrain.Desert)))
                    if (pureForest || rng.NextDouble() < 0.3) board[h] = Terrain.Forest;
            }

            // Fish shoals: water next to land.
            var shore = new List<Hex>();
            ForEach(board, h =>
            {
                if (board[h] == Terrain.Water && HasLandNeighbor(board, h)) shore.Add(h);
            });
            for (int i = 0; i < s.FishShoals && shore.Count > 0; i++)
            {
                int k = rng.Range(shore.Count);
                board[shore[k]] = Terrain.Fish;
                shore.RemoveAt(k);
            }

            for (int i = 0; i < s.StoneClusters; i++)
            {
                var c = RandomInterior(board, rng, start, 4);
                Blob(board, rng, c, 1 + rng.Range(3), Terrain.Stone, OnlyOn(Terrain.Barren, Terrain.Desert));
            }

            Guarantees(board, rng, start);
            return new GeneratedMap { Board = board, Start = start };
        }

        static void Guarantees(Board board, Rng rng, Hex start)
        {
            board[start] = Terrain.Barren;
            for (int d = 0; d < 6; d++)
                if (board.Contains(start.Neighbor(d))) board[start.Neighbor(d)] = Terrain.Barren;

            var near = Ring(board, start, 2, 4);
            EnsureCount(board, rng, near, Terrain.Fertile, 6);
            EnsureCount(board, rng, near, Terrain.Forest, 3);

            bool fish = false;
            foreach (var h in Ring(board, start, 2, 6))
                if (board[h] == Terrain.Fish) { fish = true; break; }
            if (!fish)
            {
                var spots = Ring(board, start, 5, 6);
                var h = spots[rng.Range(spots.Count)];
                board[h] = Terrain.Fish;
            }
        }

        static void EnsureCount(Board board, Rng rng, List<Hex> area, Terrain t, int want)
        {
            int have = 0;
            foreach (var h in area) if (board[h] == t) have++;
            var candidates = new List<Hex>();
            foreach (var h in area)
                if (board[h] == Terrain.Barren || board[h] == Terrain.Desert || board[h] == Terrain.Mountains || board[h] == Terrain.Water)
                    candidates.Add(h);
            while (have < want && candidates.Count > 0)
            {
                int k = rng.Range(candidates.Count);
                board[candidates[k]] = t;
                candidates.RemoveAt(k);
                have++;
            }
        }

        static List<Hex> Ring(Board board, Hex c, int min, int max)
        {
            var list = new List<Hex>();
            ForEach(board, h =>
            {
                int d = Hex.Distance(c, h);
                if (d >= min && d <= max) list.Add(h);
            });
            return list;
        }

        static Func<Terrain, bool> OnlyOn(params Terrain[] allowed) => t => Array.IndexOf(allowed, t) >= 0;

        static Hex RandomInterior(Board board, Rng rng, Hex avoid, int avoidRadius)
        {
            for (int tries = 0; tries < 200; tries++)
            {
                var h = Board.FromOffset(2 + rng.Range(board.Width - 4), 2 + rng.Range(board.Height - 4));
                if (Hex.Distance(h, avoid) > avoidRadius) return h;
            }
            return Board.FromOffset(2, 2);
        }

        static List<Hex> Blob(Board board, Rng rng, Hex seed, int size, Terrain t, Func<Terrain, bool> canReplace)
        {
            var placed = new List<Hex>();
            if (!board.Contains(seed) || !canReplace(board[seed])) return placed;
            var frontier = new List<Hex> { seed };
            var seen = new HashSet<Hex> { seed };
            while (placed.Count < size && frontier.Count > 0)
            {
                int k = rng.Range(frontier.Count);
                var h = frontier[k];
                frontier.RemoveAt(k);
                if (!canReplace(board[h])) continue;
                board[h] = t;
                placed.Add(h);
                for (int d = 0; d < 6; d++)
                {
                    var n = h.Neighbor(d);
                    if (board.Contains(n) && seen.Add(n)) frontier.Add(n);
                }
            }
            return placed;
        }

        static bool HasLandNeighbor(Board board, Hex h)
        {
            for (int d = 0; d < 6; d++)
            {
                var n = h.Neighbor(d);
                if (board.Contains(n) && !TerrainRules.IsObstacle(board[n])) return true;
            }
            return false;
        }

        public static void ForEach(Board board, Action<Hex> action)
        {
            for (int row = 0; row < board.Height; row++)
            for (int col = 0; col < board.Width; col++)
                action(Board.FromOffset(col, row));
        }
    }
}
