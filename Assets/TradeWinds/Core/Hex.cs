using System;

namespace TradeWinds.Core
{
    /// <summary>A hex in axial coordinates (pointy-top).</summary>
    public readonly struct Hex : IEquatable<Hex>
    {
        public readonly int Q;
        public readonly int R;

        public Hex(int q, int r)
        {
            Q = q;
            R = r;
        }

        public int S => -Q - R;

        static readonly Hex[] Directions =
        {
            new Hex(1, 0), new Hex(1, -1), new Hex(0, -1),
            new Hex(-1, 0), new Hex(-1, 1), new Hex(0, 1),
        };

        public Hex Neighbor(int direction)
        {
            var d = Directions[direction];
            return new Hex(Q + d.Q, R + d.R);
        }

        public static int Distance(Hex a, Hex b) =>
            (Math.Abs(a.Q - b.Q) + Math.Abs(a.R - b.R) + Math.Abs(a.S - b.S)) / 2;

        public bool Equals(Hex other) => Q == other.Q && R == other.R;
        public override bool Equals(object obj) => obj is Hex h && Equals(h);
        public override int GetHashCode() => unchecked(Q * 73856093 ^ R * 19349663);
        public static bool operator ==(Hex a, Hex b) => a.Equals(b);
        public static bool operator !=(Hex a, Hex b) => !a.Equals(b);
        public override string ToString() => $"({Q},{R})";
    }
}
