"""
Orchestrator: entries -> term co-occurrence network -> clusters -> labelled response.

``build_term_network`` returns a payload shape-compatible with the existing
``ClusterView`` (nodes / edges / clusters / modularity / silhouette) but with
term-nodes and the new CiteSpace fields. ``build_timeline_network`` reshapes the same
network into the timeline contract (X = first year, Y = cluster lane).
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List, Optional

from .extract import build_term_index, merge_term_indexes
from .network import build_graph, select_terms
from .prune import prune_graph
from . import cluster as _cluster
from .labels import extract_labels, extract_labels_from_docs

_REFERENCE_TYPES = ("reference", "co-citation")


def _normalize_node_types(node_type) -> List[str]:
    """Accept a single node type or a list (hybrid network)."""
    if isinstance(node_type, (list, tuple, set)):
        out = [str(t) for t in node_type if t]
        return out or ["keyword"]
    return [str(node_type or "keyword")]


def _default_params() -> Dict[str, Any]:
    return dict(
        year_from=None,
        year_to=None,
        years_per_slice=1,
        selection_mode="g_index",   # CiteSpace default node selection
        g_index_k=25,
        top_n=50,
        top_n_percent=10.0,
        threshold_c=1,
        threshold_cc=1,
        threshold_ccv=0.0,
        link_strength="cosine",
        pruning="pathfinder",       # CiteSpace default: backbone so clusters separate
        clustering_algorithm="louvain",  # CiteSpace default is spectral; louvain is faster
        label_algorithm="llr",
        max_nodes=200,
        term_sources=None,
        across_slices=False,
    )


def _build(entries: List[Dict[str, Any]], node_type, params: Dict[str, Any]):
    """Shared pipeline → (graph, term_index, node_cluster, labels, metrics, term_type map).

    ``node_type`` may be a single type or a list — hybrid networks (e.g.
    keyword + reference) select nodes per type independently, then build one
    merged co-occurrence graph so diamonds (terms) and circles (references)
    coexist on the same canvas.
    """
    p = _default_params()
    p.update({k: v for k, v in (params or {}).items() if v is not None})
    types = _normalize_node_types(node_type)

    sel_kwargs = dict(
        year_from=p["year_from"], year_to=p["year_to"],
        years_per_slice=p["years_per_slice"], selection_mode=p["selection_mode"],
        top_n=p["top_n"], top_n_percent=p["top_n_percent"],
        threshold_c=p["threshold_c"], g_index_k=p["g_index_k"],
        across_slices=bool(p.get("across_slices", False)),
    )

    if len(types) == 1:
        idx = build_term_index(entries, types[0], p.get("term_sources"))
        term_type = {t: idx.node_type for t in idx.term_entries}
        preselected = None
    else:
        indexes = {nt: build_term_index(entries, nt, p.get("term_sources")) for nt in types}
        # Each node type is selected independently AND gets its own share of the
        # max_nodes budget — otherwise frequent keywords crowd out the (rarer)
        # cited-reference keys in the global frequency cut.
        per_cap = max(1, math.ceil(p["max_nodes"] / len(indexes)))
        preselected = set()
        for nt, ix in indexes.items():
            sel = select_terms(ix, **sel_kwargs)
            if len(sel) > per_cap:
                tf = ix.term_freq
                sel = set(sorted(sel, key=lambda t: (-tf.get(t, 0), t))[:per_cap])
            preselected |= sel
        idx, term_type = merge_term_indexes(indexes)

    g = build_graph(
        idx,
        threshold_cc=p["threshold_cc"],
        threshold_ccv=p["threshold_ccv"],
        link_strength=p["link_strength"],
        max_nodes=p["max_nodes"],
        preselected=preselected,
        **sel_kwargs,
    )
    g = prune_graph(g, p["pruning"])

    node_cluster = _cluster.detect_communities(g, p["clustering_algorithm"])
    q = _cluster.modularity_q(g, node_cluster)
    s_overall, s_per_cluster = _cluster.silhouette_detail(g, node_cluster)
    btw = _cluster.betweenness(g)

    # Labelling: term-space clusters are named by member terms; clusters made up
    # purely of cited references use reverse-citing naming (citing papers' terms).
    ref_only_clusters = set()
    cluster_members: Dict[int, List[str]] = defaultdict(list)
    for n, cid in node_cluster.items():
        cluster_members[cid].append(n)
    for cid, members in cluster_members.items():
        if members and all(term_type.get(m) in _REFERENCE_TYPES for m in members):
            ref_only_clusters.add(cid)

    if ref_only_clusters == set(cluster_members.keys()) and cluster_members:
        labels = extract_labels_from_docs(idx, node_cluster, p["label_algorithm"])
    else:
        # Exclude reference keys from term-label candidates in hybrid clusters
        term_node_cluster = {n: c for n, c in node_cluster.items()
                             if term_type.get(n) not in _REFERENCE_TYPES}
        labels = extract_labels(idx, term_node_cluster or node_cluster, p["label_algorithm"])
        if ref_only_clusters:
            ref_labels = extract_labels_from_docs(idx, node_cluster, p["label_algorithm"])
            for cid in ref_only_clusters:
                labels[cid] = ref_labels.get(cid, labels.get(cid, []))

    return g, idx, node_cluster, labels, q, s_overall, s_per_cluster, btw, p, term_type


def _eigen_centrality(g) -> Dict[str, float]:
    """Eigenvector centrality (weight-aware); empty dict on failure."""
    try:
        import networkx as nx
        if g.number_of_edges() == 0:
            return {}
        return nx.eigenvector_centrality_numpy(g, weight="weight")
    except Exception:
        return {}


def _cluster_info(g, node_cluster, labels, s_per_cluster) -> List[Dict[str, Any]]:
    members: Dict[int, List[str]] = defaultdict(list)
    for node, cid in node_cluster.items():
        members[cid].append(node)
    out: List[Dict[str, Any]] = []
    for cid in sorted(members.keys()):
        terms = labels.get(cid, []) or sorted(members[cid])
        years = [g.nodes[n].get("first_year") for n in members[cid] if g.nodes[n].get("first_year")]
        out.append({
            "id": cid,
            "label": ", ".join(terms[:3]),
            "size": len(members[cid]),
            "silhouette": round(float(s_per_cluster.get(cid, 0.0)), 4),
            "top_terms": terms[:10],
            "mean_year": int(round(sum(years) / len(years))) if years else None,
        })
    return out


def build_term_network(
    entries: List[Dict[str, Any]],
    node_type: str = "keyword",
    **params: Any,
) -> Dict[str, Any]:
    """CiteSpace-style clustered term co-occurrence network."""
    if not entries:
        return {"nodes": [], "edges": [], "clusters": [],
                "modularity": 0.0, "silhouette": 0.0,
                "node_type": node_type, "label_algorithm": params.get("label_algorithm", "llr")}

    g, idx, node_cluster, labels, q, s_overall, s_per_cluster, btw, p, term_type = _build(entries, node_type, params)

    eig = _eigen_centrality(g)
    burst_ids = _burst_term_ids(entries, idx, g.nodes())

    nodes: List[Dict[str, Any]] = []
    for n in g.nodes():
        freq = int(g.nodes[n].get("freq", 0))
        first_year = g.nodes[n].get("first_year")
        c = float(btw.get(n, 0.0))
        nodes.append({
            "id": n,
            "label": n,
            "weight": round(math.log1p(freq) + 0.3, 4),
            "frequency": freq,
            "centrality": round(c, 4),
            "degree": int(g.degree(n)),
            "eigen_centrality": round(float(eig.get(n, 0.0)), 4),
            "sigma": round((c + 1.0) ** (1.0 if n in burst_ids else 0.0), 4),
            "is_burst": n in burst_ids,
            "term_type": term_type.get(n, "keyword"),
            "cluster": int(node_cluster.get(n, 0)),
            "year": first_year,
            "attributes": {"terms": [n], "first_year": first_year},
        })
    edges = [
        {"source": u, "target": v, "weight": round(float(d.get("weight", 0.0)), 4),
         "cooc": int(d.get("cooc", 0))}
        for u, v, d in g.edges(data=True)
    ]
    clusters = _cluster_info(g, node_cluster, labels, s_per_cluster)

    return {
        "nodes": nodes,
        "edges": edges,
        "clusters": clusters,
        "modularity": round(float(q), 4),
        "silhouette": round(float(s_overall), 4),
        "node_type": idx.node_type,
        "label_algorithm": p["label_algorithm"],
        "params": {k: p[k] for k in (
            "selection_mode", "top_n", "top_n_percent", "years_per_slice",
            "threshold_c", "threshold_cc", "threshold_ccv", "link_strength", "pruning",
        )},
    }


def _burst_term_ids(entries: List[Dict[str, Any]], idx, graph_nodes) -> set:
    """Run real Kleinberg burst detection over the network terms' yearly series.

    Replaces the old ``frequency >= 10`` placeholder: a node is a burst node iff
    its per-year document frequency contains a Kleinberg burst state period.
    """
    from ..burst_detection import kleinberg_burst

    # Per-year totals over all entries (background rate denominator)
    year_totals: Dict[int, int] = defaultdict(int)
    for i, y in enumerate(idx.entry_years):
        if y is not None:
            year_totals[int(y)] += 1
    if not year_totals:
        return set()
    y_lo, y_hi = min(year_totals), max(year_totals)
    year_range = list(range(y_lo, y_hi + 1))
    n_total = [max(1, year_totals.get(y, 0)) for y in year_range]

    # Per-term yearly counts, restricted to terms that are graph nodes
    node_set = set(graph_nodes)
    term_year: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for i, terms in enumerate(idx.entry_terms):
        y = idx.entry_years[i]
        if y is None:
            continue
        for t in terms:
            if t in node_set:
                term_year[t][int(y)] += 1

    burst_ids = set()
    for t, yc in term_year.items():
        counts = [(y, yc.get(y, 0)) for y in year_range]
        if kleinberg_burst(counts, n_total, alpha=1.0, gamma=1.0):
            burst_ids.add(t)
    return burst_ids


def build_timeline_network(
    entries: List[Dict[str, Any]],
    node_type: str = "keyword",
    **params: Any,
) -> Dict[str, Any]:
    """Same network, reshaped onto the timeline (X = first year, Y = cluster lane)."""
    if not entries:
        return {"nodes": [], "edges": [], "clusters": [],
                "time_range": {"start": 0, "end": 0},
                "modularity": 0.0, "silhouette": 0.0, "node_type": node_type}

    g, idx, node_cluster, labels, q, s_overall, s_per_cluster, btw, p, term_type = _build(entries, node_type, params)
    if g.number_of_nodes() == 0:
        return {"nodes": [], "edges": [], "clusters": [],
                "time_range": {"start": 0, "end": 0},
                "modularity": 0.0, "silhouette": 0.0, "node_type": idx.node_type}

    burst_ids = _burst_term_ids(entries, idx, g.nodes())
    eig = _eigen_centrality(g)

    nodes = []
    for n in g.nodes():
        freq = int(g.nodes[n].get("freq", 0))
        first_year = g.nodes[n].get("first_year")
        c = float(btw.get(n, 0.0))
        nodes.append({
            "id": n,
            "label": n,
            "weight": round(math.log1p(freq) + 0.3, 4),
            "frequency": freq,
            "centrality": round(c, 4),
            "degree": int(g.degree(n)),
            "eigen_centrality": round(float(eig.get(n, 0.0)), 4),
            "sigma": round((c + 1.0) ** (1.0 if n in burst_ids else 0.0), 4),
            "term_type": term_type.get(n, "keyword"),
            "cluster": int(node_cluster.get(n, 0)),
            "year": first_year,
        })
    base = {
        "edges": [
            {"source": u, "target": v, "weight": round(float(d.get("weight", 0.0)), 4),
             "cooc": int(d.get("cooc", 0))}
            for u, v, d in g.edges(data=True)
        ],
        "clusters": _cluster_info(g, node_cluster, labels, s_per_cluster),
        "modularity": round(float(q), 4),
        "silhouette": round(float(s_overall), 4),
        "node_type": idx.node_type,
    }

    years = [n["year"] for n in nodes if n.get("year")]
    timeline_nodes = []
    for n in nodes:
        if not n.get("year"):
            continue
        timeline_nodes.append({
            "id": n["id"],
            "label": n["label"],
            "year": int(n["year"]),
            "cluster": n["cluster"],
            "weight": n["weight"],
            "frequency": n["frequency"],
            "centrality": n["centrality"],
            "degree": n["degree"],
            "eigen_centrality": n["eigen_centrality"],
            "sigma": n["sigma"],
            "term_type": n["term_type"],
            "is_burst": n["id"] in burst_ids,
        })

    # cluster lanes with year spans
    clusters = []
    for c in base.get("clusters", []):
        cid = c["id"]
        cnodes = [n for n in timeline_nodes if n["cluster"] == cid]
        if not cnodes:
            continue
        cyears = [n["year"] for n in cnodes]
        clusters.append({
            "id": cid,
            "label": c["label"],
            "size": len(cnodes),
            "silhouette": c.get("silhouette", 0.0),
            "year_start": min(cyears),
            "year_end": max(cyears),
        })

    return {
        "nodes": timeline_nodes,
        "edges": base.get("edges", []),
        "clusters": clusters,
        "time_range": {"start": min(years), "end": max(years)} if years else {"start": 0, "end": 0},
        "modularity": base.get("modularity", 0.0),
        "silhouette": base.get("silhouette", 0.0),
        "node_type": base.get("node_type", node_type),
    }
