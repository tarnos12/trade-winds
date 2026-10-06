namespace TradeWinds.Core
{
    /// <summary>Seeded, deterministic random numbers (mulberry32). The only randomness the sim may use.</summary>
    public sealed class Rng
    {
        uint _state;

        public Rng(uint seed)
        {
            _state = seed;
        }

        public uint State => _state;

        public uint NextUInt()
        {
            unchecked
            {
                _state += 0x6D2B79F5;
                uint t = _state;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return t ^ (t >> 14);
            }
        }

        /// <summary>Uniform in [0, 1).</summary>
        public double NextDouble() => NextUInt() / 4294967296.0;

        /// <summary>Uniform integer in [0, count).</summary>
        public int Range(int count) => count <= 1 ? 0 : (int)(NextDouble() * count);
    }
}
