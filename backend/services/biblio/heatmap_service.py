"""
Heatmap Service for Bibliographic Visualization

Generates a 2D density landscape via Kernel Density Estimation (KDE) over a
*deterministic network layout*:

1. The same CiteSpace-style term co-occurrence network as the cluster view is
   built (identical node type / term sources / pruning parameters), so the
   heatmap is semantically consistent with the cluster & timeline views.
2. Node coordinates come from a seeded force-directed layout
   (networkx spring_layout, seed=42) — the density surface reflects actual
   network proximity and is reproducible run to run.
3. Density is a weighted Gaussian KDE (weight = frequency + 10 x centrality).
"""

from typing import List, Dict, Any, Optional
import math
import numpy as np
from scipy.stats import gaussian_kde


class HeatmapService:
    """Generates heatmap visualization data from bibliographic entries"""

    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries

    def generate_heatmap(
        self,
        bandwidth: Optional[float] = None,
        grid_size: int = 50,
        cluster_by: str = "keyword",
        citespace: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate heatmap visualization data with KDE density grid.

        Args:
            bandwidth: KDE bandwidth (None -> 0.15, sharper local peaks)
            grid_size: Resolution of the density grid (NxN)
            cluster_by: node type, same options as the cluster view
            citespace: CiteSpace engine params (term sources, pruning, ...)

        Returns:
            Dict with points, clusters, time_range, density_grid
        """
        empty = {
            'points': [], 'clusters': [],
            'time_range': {'start': 0, 'end': 0},
            'density_grid': {'x': [], 'y': [], 'z': []}
        }
        if not self.entries:
            return empty

        # Same engine + params as the cluster view -> consistent semantics
        from .citespace import build_term_network
        net = build_term_network(self.entries, cluster_by, **(citespace or {}))
        nodes = net.get('nodes', [])
        edges = net.get('edges', [])
        clusters = net.get('clusters', [])
        if not nodes:
            return {**empty, 'clusters': clusters}

        points = self._layout_points(nodes, edges)

        years = [
            e.get('year') for e in self.entries
            if e.get('year') and isinstance(e.get('year'), (int, float))
            and 1900 <= e.get('year') <= 2100
        ]
        time_range = {
            'start': min(years) if years else 0,
            'end': max(years) if years else 0
        }

        density_grid = self._compute_density_grid(points, bandwidth, grid_size)

        return {
            'points': points,
            'clusters': clusters,
            'time_range': time_range,
            'density_grid': density_grid
        }

    def _layout_points(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Deterministic force-directed 2D positions for the term network."""
        import networkx as nx

        g = nx.Graph()
        for n in nodes:
            g.add_node(n['id'])
        for e in edges:
            if e.get('source') in g and e.get('target') in g:
                g.add_edge(e['source'], e['target'], weight=float(e.get('weight', 1.0)))

        # Seeded spring layout: same input -> same coordinates, and clusters end
        # up spatially grouped because their nodes are densely interconnected.
        k = 1.2 / math.sqrt(max(len(g), 2))
        pos = nx.spring_layout(g, weight='weight', seed=42, k=k, iterations=80, scale=5.0)

        points = []
        for node in nodes:
            x, y = pos.get(node['id'], (0.0, 0.0))
            weight = max(node.get('frequency', 0), 1) + node.get('centrality', 0) * 10
            points.append({
                'x': round(float(x), 4),
                'y': round(float(y), 4),
                'weight': round(float(weight), 4),
                'id': node.get('id', ''),
                'label': node.get('label', ''),
                'cluster': node.get('cluster', 0),
                'year': node.get('year')
            })
        return points

    def _compute_density_grid(
        self,
        points: List[Dict[str, Any]],
        bandwidth: Optional[float],
        grid_size: int
    ) -> Dict[str, Any]:
        """Compute 2D KDE density on a regular grid."""
        if len(points) < 2:
            return {'x': [], 'y': [], 'z': []}

        xs = np.array([p['x'] for p in points])
        ys = np.array([p['y'] for p in points])
        weights = np.array([p['weight'] for p in points])

        # Clamp grid_size
        grid_size = max(10, min(grid_size, 100))

        try:
            xy = np.vstack([xs, ys])
            # Default to lower bandwidth (0.15) for sharper, more localized density peaks
            bw = bandwidth if bandwidth and bandwidth > 0 else 0.15
            kde = gaussian_kde(xy, bw_method=bw, weights=weights)

            margin = 2.0
            x_grid = np.linspace(xs.min() - margin, xs.max() + margin, grid_size)
            y_grid = np.linspace(ys.min() - margin, ys.max() + margin, grid_size)
            X, Y = np.meshgrid(x_grid, y_grid)
            positions = np.vstack([X.ravel(), Y.ravel()])
            Z = kde(positions).reshape(X.shape)

            return {
                'x': x_grid.round(4).tolist(),
                'y': y_grid.round(4).tolist(),
                'z': Z.round(6).tolist()
            }
        except Exception:
            return {'x': [], 'y': [], 'z': []}
