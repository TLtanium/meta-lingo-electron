"""
Cluster label extraction: LLR (default), TF-IDF, and MI.

Each cluster is labelled by its most characteristic member terms. Documents (entries)
are assigned to the cluster their terms most belong to, then candidate terms are ranked
by their association with that cluster's document set — mirroring CiteSpace's labelling
(`#0 large language model`, ...).
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Dict, List, Set, Tuple

from .extract import TermIndex, _tokenize_terms


def _assign_docs(idx: TermIndex, node_cluster: Dict[str, int]) -> List[int]:
    """Assign each entry to the cluster most of its node-terms belong to (-1 if none)."""
    doc_cluster: List[int] = []
    for terms in idx.entry_terms:
        votes: Dict[int, int] = defaultdict(int)
        for t in terms:
            cid = node_cluster.get(t)
            if cid is not None:
                votes[cid] += 1
        if votes:
            doc_cluster.append(max(votes.items(), key=lambda kv: (kv[1], -kv[0]))[0])
        else:
            doc_cluster.append(-1)
    return doc_cluster


def _g2(a: float, b: float, n1: float, n2: float) -> float:
    """Dunning log-likelihood (G2) for term over-representation in cluster docs.

    a = docs-in-cluster containing the term, b = docs-out containing the term.
    Returns 0 when the term is not over-represented in the cluster.
    """
    if a <= 0 or n1 <= 0:
        return 0.0
    total = n1 + n2
    e1 = n1 * (a + b) / total if total else 0.0
    e2 = n2 * (a + b) / total if total else 0.0
    # only reward over-representation
    if e1 <= 0 or (a / n1) <= ((a + b) / total):
        return 0.0
    ll = 0.0
    if a > 0 and e1 > 0:
        ll += a * math.log(a / e1)
    if b > 0 and e2 > 0:
        ll += b * math.log(b / e2)
    return 2.0 * ll


def _mi(a: float, b: float, n1: float, n2: float) -> float:
    """Mutual information of the binary term/cluster contingency table."""
    total = n1 + n2
    if total <= 0 or a <= 0:
        return 0.0
    c = n1 - a  # in cluster, no term
    d = n2 - b  # out cluster, no term
    cells = [
        (a, n1, a + b),
        (b, n2, a + b),
        (c, n1, c + d),
        (d, n2, c + d),
    ]
    mi = 0.0
    for cnt, col_tot, row_tot in cells:
        if cnt <= 0 or col_tot <= 0 or row_tot <= 0:
            continue
        p = cnt / total
        mi += p * math.log(p / ((row_tot / total) * (col_tot / total)))
    return mi


def extract_labels(
    idx: TermIndex,
    node_cluster: Dict[str, int],
    algorithm: str = "llr",
    top_k: int = 10,
) -> Dict[int, List[str]]:
    """Return ``{cluster_id: [ranked label terms]}`` using the chosen algorithm."""
    algorithm = (algorithm or "llr").lower()
    doc_cluster = _assign_docs(idx, node_cluster)
    n_docs = len(doc_cluster)

    # cluster -> member terms; term -> set of docs containing it (restricted to nodes)
    cluster_terms: Dict[int, List[str]] = defaultdict(list)
    for term, cid in node_cluster.items():
        cluster_terms[cid].append(term)

    # docs-in-cluster sizes
    cluster_doc_count: Dict[int, int] = defaultdict(int)
    for cid in doc_cluster:
        if cid >= 0:
            cluster_doc_count[cid] += 1

    # term -> docs containing it (entry indices)
    term_docs = {t: idxs for t, idxs in idx.term_entries.items()}

    # term -> number of clusters whose docs contain it (for TF-IDF idf)
    num_clusters = len(cluster_terms) or 1

    result: Dict[int, List[str]] = {}
    for cid, terms in cluster_terms.items():
        n1 = cluster_doc_count.get(cid, 0)
        n2 = n_docs - n1
        scored: List[Tuple[str, float]] = []
        for t in terms:
            docs = term_docs.get(t, set())
            a = sum(1 for di in docs if doc_cluster[di] == cid)
            b = len(docs) - a
            if algorithm == "tfidf":
                # clusters in which this term appears among assigned docs
                clusters_with_t = {doc_cluster[di] for di in docs if doc_cluster[di] >= 0}
                df = max(1, len(clusters_with_t))
                score = a * math.log((num_clusters + 1) / df)
            elif algorithm == "mi":
                score = _mi(a, b, n1, n2)
            else:  # llr (default)
                score = _g2(a, b, n1, n2)
            # tie-break with frequency so a label always exists
            scored.append((t, score))
        scored.sort(key=lambda kv: (-kv[1], -len(term_docs.get(kv[0], set())), kv[0]))
        result[cid] = [t for t, _ in scored[:top_k]]
    return result


def extract_labels_from_docs(
    idx: TermIndex,
    node_cluster: Dict[str, int],
    algorithm: str = "llr",
    top_k: int = 10,
) -> Dict[int, List[str]]:
    """Reverse-citing naming (for co-citation clusters): label each cluster with the most
    characteristic *terms from the citing papers* (title+abstract), not the reference keys
    themselves. Mirrors CiteSpace's cluster labelling for co-citation networks.
    """
    algorithm = (algorithm or "llr").lower()
    doc_cluster = _assign_docs(idx, node_cluster)
    n_docs = len(doc_cluster)

    # Tokenise each citing paper's title+abstract into candidate label terms.
    doc_terms: List[Set[str]] = [set(_tokenize_terms(idx.entry_docs[i])) for i in range(n_docs)]
    term_docs: Dict[str, Set[int]] = defaultdict(set)
    for i, ts in enumerate(doc_terms):
        for t in ts:
            term_docs[t].add(i)

    cluster_doc_count: Dict[int, int] = defaultdict(int)
    cluster_doc_idxs: Dict[int, List[int]] = defaultdict(list)
    for i, cid in enumerate(doc_cluster):
        if cid >= 0:
            cluster_doc_count[cid] += 1
            cluster_doc_idxs[cid].append(i)

    num_clusters = len(set(c for c in doc_cluster if c >= 0)) or 1
    result: Dict[int, List[str]] = {}
    for cid in set(node_cluster.values()):
        n1 = cluster_doc_count.get(cid, 0)
        n2 = n_docs - n1
        cands: Set[str] = set()
        for i in cluster_doc_idxs.get(cid, []):
            cands |= doc_terms[i]
        scored: List[Tuple[str, float]] = []
        for t in cands:
            docs = term_docs.get(t, set())
            a = sum(1 for di in docs if doc_cluster[di] == cid)
            b = len(docs) - a
            if algorithm == "tfidf":
                clusters_with_t = {doc_cluster[di] for di in docs if doc_cluster[di] >= 0}
                df = max(1, len(clusters_with_t))
                score = a * math.log((num_clusters + 1) / df)
            elif algorithm == "mi":
                score = _mi(a, b, n1, n2)
            else:
                score = _g2(a, b, n1, n2)
            scored.append((t, score))
        scored.sort(key=lambda kv: (-kv[1], -len(term_docs.get(kv[0], set())), kv[0]))
        result[cid] = [t for t, _ in scored[:top_k]] or ["(cluster %d)" % cid]
    return result
