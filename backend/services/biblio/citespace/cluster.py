"""
Community detection + structural metrics for the term co-occurrence network.

Clusters via greedy modularity optimisation (Clauset-Newman-Moore) and reports the
two metrics CiteSpace shows: strict Newman **Modularity Q** and **Mean Silhouette S**.
Also computes betweenness centrality (the purple-ring "中心度" measure).
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import networkx as nx
from networkx.algorithms import community as nx_comm


def _louvain(g: nx.Graph):
    try:
        return nx_comm.louvain_communities(g, weight="weight", seed=42)
    except Exception:
        try:
            return nx_comm.greedy_modularity_communities(g, weight="weight")
        except Exception:
            return list(nx.connected_components(g))


def _spectral(g: nx.Graph):
    """CiteSpace's default: spectral clustering on the affinity (similarity) matrix.

    K is estimated from a Louvain pass (CiteSpace likewise auto-determines cluster
    count). Falls back to Louvain on any failure.
    """
    nodes = sorted(g.nodes())
    n = len(nodes)
    if n < 4 or g.number_of_edges() == 0:
        return _louvain(g)
    try:
        import numpy as np
        from sklearn.cluster import SpectralClustering
    except Exception:
        return _louvain(g)
    k = max(2, min(len(_louvain(g)), n - 1))
    index = {node: i for i, node in enumerate(nodes)}
    W = np.zeros((n, n), dtype=float)
    for u, v, d in g.edges(data=True):
        w = float(d.get("weight", 0.0))
        i, j = index[u], index[v]
        W[i][j] = w
        W[j][i] = w
    try:
        labels = SpectralClustering(
            n_clusters=k, affinity="precomputed", assign_labels="kmeans",
            random_state=42,
        ).fit_predict(W)
    except Exception:
        return _louvain(g)
    groups: Dict[int, set] = {}
    for node, lab in zip(nodes, labels):
        groups.setdefault(int(lab), set()).add(node)
    return list(groups.values())


def detect_communities(g: nx.Graph, algorithm: str = "louvain") -> Dict[str, int]:
    """Return ``{node: cluster_id}``. ``algorithm`` in {louvain, spectral}.

    Singletons / isolated components each get their own id. Deterministic ordering.
    """
    if g.number_of_nodes() == 0:
        return {}
    if g.number_of_edges() == 0:
        return {n: i for i, n in enumerate(sorted(g.nodes()))}

    communities = _spectral(g) if (algorithm or "louvain").lower() == "spectral" else _louvain(g)

    # Order clusters by size (desc) for stable, meaningful ids (#0 = largest).
    communities = sorted(communities, key=lambda c: (-len(c), sorted(c)[0] if c else ""))
    mapping: Dict[str, int] = {}
    for cid, members in enumerate(communities):
        for node in members:
            mapping[node] = cid
    # any node missed (shouldn't happen) -> own cluster
    next_id = len(communities)
    for n in g.nodes():
        if n not in mapping:
            mapping[n] = next_id
            next_id += 1
    return mapping


def modularity_q(g: nx.Graph, node_cluster: Dict[str, int]) -> float:
    """Strict Newman weighted modularity Q of the partition."""
    if g.number_of_edges() == 0 or not node_cluster:
        return 0.0
    clusters: Dict[int, set] = {}
    for node, cid in node_cluster.items():
        clusters.setdefault(cid, set()).add(node)
    try:
        return float(nx_comm.modularity(g, list(clusters.values()), weight="weight"))
    except Exception:
        return 0.0


def silhouette_detail(g: nx.Graph, node_cluster: Dict[str, int]) -> Tuple[float, Dict[int, float]]:
    """Mean silhouette + per-cluster mean, on the (1 - strength) distance space.

    Returns ``(0.0, {})`` when silhouette is undefined (fewer than 2 clusters, etc.).
    """
    nodes = list(g.nodes())
    n = len(nodes)
    if n < 3:
        return 0.0, {}
    labels = [node_cluster.get(node, 0) for node in nodes]
    distinct = sorted(set(labels))
    if not (2 <= len(distinct) <= n - 1):
        return 0.0, {}

    try:
        import numpy as np
        from sklearn.metrics import silhouette_samples
    except Exception:
        return 0.0, {}

    index = {node: i for i, node in enumerate(nodes)}
    dist = np.ones((n, n), dtype=float)  # 1.0 for non-adjacent pairs
    np.fill_diagonal(dist, 0.0)
    for u, v, data in g.edges(data=True):
        d = float(data.get("distance", 1.0))
        i, j = index[u], index[v]
        dist[i][j] = d
        dist[j][i] = d
    try:
        samples = silhouette_samples(dist, labels, metric="precomputed")
    except Exception:
        return 0.0, {}

    per_cluster: Dict[int, List[float]] = {}
    for lab, s in zip(labels, samples):
        per_cluster.setdefault(lab, []).append(float(s))
    per_cluster_mean = {cid: (sum(v) / len(v) if v else 0.0) for cid, v in per_cluster.items()}
    overall = float(sum(samples) / len(samples)) if len(samples) else 0.0
    return overall, per_cluster_mean


def silhouette_s(g: nx.Graph, node_cluster: Dict[str, int]) -> float:
    """Backward-compatible mean-only silhouette."""
    return silhouette_detail(g, node_cluster)[0]


def betweenness(g: nx.Graph) -> Dict[str, float]:
    """Normalised betweenness centrality keyed by node (distance-weighted)."""
    if g.number_of_nodes() == 0:
        return {}
    try:
        return nx.betweenness_centrality(g, weight="distance", normalized=True)
    except Exception:
        return {n: 0.0 for n in g.nodes()}
