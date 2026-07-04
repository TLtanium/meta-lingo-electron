"""
Network pruning: Pathfinder (PFNET, r=inf, q=n-1) and Minimum Spanning Tree.

Pruning removes redundant edges so the network's backbone stands out — both a
CiteSpace staple and a big rendering-performance win (fewer SVG edges).
"""

from __future__ import annotations

from typing import List, Tuple

import networkx as nx


def _pathfinder(g: nx.Graph) -> nx.Graph:
    """PFNET with r=inf, q=n-1 using the (min, max) bottleneck closure.

    Keep edge (i, j) iff its direct distance equals the minimax (bottleneck) distance
    over all paths between i and j — i.e. no indirect path is at least as strong on
    its weakest link. O(n^3); n is capped upstream, so this stays cheap.
    """
    nodes: List = list(g.nodes())
    n = len(nodes)
    if n <= 2 or g.number_of_edges() == 0:
        return g.copy()

    index = {node: k for k, node in enumerate(nodes)}
    INF = float("inf")
    # bottleneck distance matrix; start with direct edge distances
    dist = [[INF] * n for _ in range(n)]
    for k in range(n):
        dist[k][k] = 0.0
    for u, v, data in g.edges(data=True):
        i, j = index[u], index[v]
        d = float(data.get("distance", 1.0))
        dist[i][j] = min(dist[i][j], d)
        dist[j][i] = dist[i][j]

    direct = [row[:] for row in dist]

    # Floyd-Warshall on the (min over paths, max over edges) semiring.
    for k in range(n):
        dk = dist[k]
        for i in range(n):
            dik = dist[i][k]
            if dik == INF:
                continue
            di = dist[i]
            for j in range(n):
                # bottleneck of path i..k..j is max(dik, dkj)
                alt = dik if dik > dk[j] else dk[j]
                if alt < di[j]:
                    di[j] = alt

    pruned = nx.Graph()
    pruned.add_nodes_from(g.nodes(data=True))
    eps = 1e-9
    for u, v, data in g.edges(data=True):
        i, j = index[u], index[v]
        # keep edges that lie on a minimax path (direct distance is not bettered)
        if direct[i][j] <= dist[i][j] + eps:
            pruned.add_edge(u, v, **data)
    return pruned


def _mst(g: nx.Graph) -> nx.Graph:
    """Maximum spanning tree on edge strength (keeps the strongest backbone)."""
    if g.number_of_edges() == 0:
        return g.copy()
    tree = nx.maximum_spanning_tree(g, weight="weight")
    pruned = nx.Graph()
    pruned.add_nodes_from(g.nodes(data=True))
    for u, v, data in tree.edges(data=True):
        pruned.add_edge(u, v, **data)
    return pruned


def prune_graph(g: nx.Graph, method: str) -> nx.Graph:
    """Apply the requested pruning. ``method`` in {none, pathfinder, mst}."""
    method = (method or "none").lower()
    if method == "pathfinder":
        return _pathfinder(g)
    if method in ("mst", "minimum_spanning_tree"):
        return _mst(g)
    return g
