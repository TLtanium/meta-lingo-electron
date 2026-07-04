"""
CiteSpace-aligned co-occurrence network + clustering engine for bibliographic
visualization.

Unlike the legacy ``cluster_service`` (whose nodes are *papers* clustered by Jaccard
keyword overlap), this engine builds a **co-occurrence network of terms** (keyword /
author / institution / country), clusters that network with modularity optimisation,
labels the clusters with LLR / TF-IDF / MI, and reports strict Newman Modularity Q +
Mean Silhouette S — matching CiteSpace's model.

Public entry point: :func:`build_term_network`.
"""

from .engine import build_term_network, build_timeline_network

__all__ = ["build_term_network", "build_timeline_network"]
