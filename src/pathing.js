// === PATHING START ===
// Pure Dijkstra pathfinder over the road-node graph (GDD §9.1). No DOM/canvas,
// no Math.random. Nodes are road hex keys in state.roads PLUS the two town
// access hexes for a query; edges join adjacent nodes (HexMath.neighbors,
// uniform step cost 1 for dirt roads). A town at (q,r) joins the network if its
// own hex or a neighbour hex is a road, so route() implicitly adds the two
// endpoints and connects them to any road-adjacent hop. Routes are memoized and
// invalidated by Pathing.invalidate(), which the browser layer calls at every
// state.roads mutation so a stale route never survives a road change.
var Pathing = (typeof Pathing !== "undefined" && Pathing) || {};
(function () {
  const cache = new Map();   // "fromKey|toKey" -> {path,cost} | null

  Pathing.invalidate = function () { cache.clear(); };

  function parseKey(k) {
    const i = k.indexOf(",");
    return { q: parseInt(k.slice(0, i), 10), r: parseInt(k.slice(i + 1), 10) };
  }

  // Neighbour node keys of `key` within the graph. A hex is a graph node if it
  // is a road OR one of the two query endpoints. Endpoints connect to adjacent
  // road hexes (and directly to each other if adjacent), which realizes the
  // "town hex or a neighbour hex is a road" connection rule.
  function neighborNodes(key, roads, fromKey, toKey) {
    const { q, r } = parseKey(key);
    const out = [];
    for (const n of HexMath.neighbors(q, r)) {
      const nk = HexMath.key(n.q, n.r);
      if (roads.has(nk) || nk === fromKey || nk === toKey) out.push(nk);
    }
    return out;
  }

  // Off-road fallback: a straight hex line between the two endpoints, used when
  // NO road path connects them. Carts can still trade over open ground — Trade
  // just halves their speed (road === false ⇒ roads are 2× faster). cost is the
  // hex distance ×2 so it reflects the ~2× travel time, and the nearest-seller
  // tiebreak still prefers a road-connected seller when one is comparably close.
  function offRoadRoute(fromKey, toKey) {
    const a = parseKey(fromKey), b = parseKey(toKey);
    const N = HexMath.dist(a.q, a.r, b.q, b.r);
    const path = [];
    for (let i = 0; i <= N; i++) {
      const t = N === 0 ? 0 : i / N;
      const rr = HexMath.hexRound(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t);
      const k = HexMath.key(rr.q, rr.r);
      if (!path.length || path[path.length - 1] !== k) path.push(k);
    }
    if (path[0] !== fromKey) path.unshift(fromKey);
    if (path[path.length - 1] !== toKey) path.push(toKey);
    return { path, cost: N * 2, road: false };
  }

  // Dijkstra from fromKey to toKey over the road graph. Uniform edge cost 1.
  // ALWAYS returns a route: a road path (road:true) when one exists, else the
  // off-road straight-line fallback (road:false). Only null if fromKey/toKey are
  // unusable. Callers gate trade on the road flag for speed, not on existence.
  Pathing.route = function (state, fromKey, toKey) {
    const ck = fromKey + "|" + toKey;
    if (cache.has(ck)) return cache.get(ck);

    const roads = (state && state.roads) || new Set();
    let result = null;

    if (fromKey === toKey) {
      result = { path: [fromKey], cost: 0, road: true };
    } else {
      const dist = new Map([[fromKey, 0]]);
      const prev = new Map();
      const visited = new Set();
      // Frontier scan (boards are small: hundreds of hexes). Picks the
      // unvisited node of least tentative distance each step.
      const frontier = new Map([[fromKey, 0]]);
      while (frontier.size) {
        let cur = null, curD = Infinity;
        for (const [k, d] of frontier) if (d < curD) { curD = d; cur = k; }
        frontier.delete(cur);
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (cur === toKey) break;
        for (const nk of neighborNodes(cur, roads, fromKey, toKey)) {
          if (visited.has(nk)) continue;
          const nd = curD + 1;
          if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) {
            dist.set(nk, nd);
            prev.set(nk, cur);
            frontier.set(nk, nd);
          }
        }
      }
      if (dist.has(toKey)) {
        const path = [];
        let cur = toKey;
        while (cur !== undefined) { path.push(cur); cur = prev.get(cur); }
        path.reverse();
        result = { path, cost: dist.get(toKey), road: true };
      }
    }

    // No ROAD path → fall back to off-road so trade still happens (just slower).
    if (!result) result = offRoadRoute(fromKey, toKey);

    cache.set(ck, result);
    return result;
  };
})();
// === PATHING END ===
