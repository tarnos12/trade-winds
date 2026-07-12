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

  // Dijkstra from fromKey to toKey over the road graph. Uniform edge cost 1.
  Pathing.route = function (state, fromKey, toKey) {
    const ck = fromKey + "|" + toKey;
    if (cache.has(ck)) return cache.get(ck);

    const roads = (state && state.roads) || new Set();
    let result = null;

    if (fromKey === toKey) {
      result = { path: [fromKey], cost: 0 };
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
        result = { path, cost: dist.get(toKey) };
      }
    }

    cache.set(ck, result);
    return result;
  };
})();
// === PATHING END ===
