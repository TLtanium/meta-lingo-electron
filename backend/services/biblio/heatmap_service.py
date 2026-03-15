"""
Heatmap Service for Bibliographic Visualization

Generates 2D density heatmap data using Kernel Density Estimation (KDE).
Points are positioned based on cluster layout, density computed with scipy.
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict
import math
import numpy as np
from scipy.stats import gaussian_kde

from .cluster_service import cluster_entries


class HeatmapService:
    """Generates heatmap visualization data from bibliographic entries"""

    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries

    def generate_heatmap(
        self,
        bandwidth: Optional[float] = None,
        grid_size: int = 50
    ) -> Dict[str, Any]:
        """
        Generate heatmap visualization data with KDE density grid.

        Args:
            bandwidth: KDE bandwidth (None for auto via Scott's rule)
            grid_size: Resolution of the density grid (NxN)

        Returns:
            Dict with points, clusters, time_range, density_grid
        """
        if not self.entries:
            return {
                'points': [], 'clusters': [],
                'time_range': {'start': 0, 'end': 0},
                'density_grid': {'x': [], 'y': [], 'z': []}
            }

        # Cluster entries to get node positions
        cluster_result = cluster_entries(self.entries, cluster_by="keyword")
        nodes = cluster_result.get('nodes', [])
        clusters = cluster_result.get('clusters', [])

        if not nodes:
            return {
                'points': [], 'clusters': clusters,
                'time_range': {'start': 0, 'end': 0},
                'density_grid': {'x': [], 'y': [], 'z': []}
            }

        # Assign 2D positions based on cluster layout
        points = self._layout_points(nodes, clusters)

        # Compute time range
        years = [
            e.get('year') for e in self.entries
            if e.get('year') and isinstance(e.get('year'), (int, float))
            and 1900 <= e.get('year') <= 2100
        ]
        time_range = {
            'start': min(years) if years else 0,
            'end': max(years) if years else 0
        }

        # Compute KDE density grid
        density_grid = self._compute_density_grid(
            points, bandwidth, grid_size
        )

        return {
            'points': points,
            'clusters': clusters,
            'time_range': time_range,
            'density_grid': density_grid
        }

    def _layout_points(
        self,
        nodes: List[Dict[str, Any]],
        clusters: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Position nodes in 2D space based on cluster membership."""
        import random
        random.seed(42)

        # Compute cluster center positions (radial layout)
        n_clusters = len(clusters)
        cluster_centers = {}
        for i, cluster in enumerate(clusters):
            angle = 2 * math.pi * i / max(n_clusters, 1)
            radius = 5
            cluster_centers[cluster['id']] = (
                radius * math.cos(angle),
                radius * math.sin(angle)
            )

        points = []
        for node in nodes:
            cluster_id = node.get('cluster', 0)
            cx, cy = cluster_centers.get(cluster_id, (0, 0))

            # Spread within cluster proportional to cluster size
            spread = 1.5
            x = cx + random.gauss(0, spread)
            y = cy + random.gauss(0, spread)

            weight = max(node.get('frequency', 0), 1) + \
                node.get('centrality', 0) * 10

            points.append({
                'x': round(x, 4),
                'y': round(y, 4),
                'weight': round(weight, 4),
                'id': node.get('id', ''),
                'label': node.get('label', ''),
                'cluster': cluster_id,
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
