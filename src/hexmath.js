// Pointy-top axial hex math (GDD §3.1, §9.1).
const HexMath = {
  DIRS: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
  key(q, r) { return q + "," + r; },
  hexToPixel(q, r, size) {
    return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
  },
  pixelToHex(x, y, size) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
    const r = (2 / 3 * y) / size;
    return HexMath.hexRound(q, r);
  },
  hexRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  },
  neighbors(q, r) {
    return HexMath.DIRS.map(d => ({ q: q + d[0], r: r + d[1] }));
  },
  dist(aq, ar, bq, br) {
    return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
  },
  // All hexes within distance n of (cq,cr).
  range(cq, cr, n) {
    const out = [];
    for (let dq = -n; dq <= n; dq++) {
      const lo = Math.max(-n, -dq - n), hi = Math.min(n, -dq + n);
      for (let dr = lo; dr <= hi; dr++) out.push({ q: cq + dq, r: cr + dr });
    }
    return out;
  },
};
