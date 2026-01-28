"""
Visualization Service for Bibliographic Analysis

Generates visualization data for various CiteSpace-style visualizations.
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict
import math

from .network_builder import NetworkBuilder, build_collaboration_network
from .cluster_service import ClusterService, cluster_entries
from .burst_detection import BurstDetector, detect_bursts


class VisualizationService:
    """Main service for generating bibliographic visualizations"""
    
    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries
        self._prepare_data()
    
    def _prepare_data(self):
        """Prepare data structures for visualization"""
        self.years = []
        self.year_entries = defaultdict(list)
        
        for entry in self.entries:
            year = entry.get('year')
            if year:
                self.year_entries[year].append(entry)
                if year not in self.years:
                    self.years.append(year)
        
        self.years.sort()
        self.year_range = (min(self.years), max(self.years)) if self.years else (0, 0)
    
    def get_timeline_view(self, time_slice: int = 1, top_n: int = 10) -> Dict[str, Any]:
        """
        Generate timeline view data
        
        Clusters are arranged horizontally, time flows left to right
        """
        default_response = {
            'nodes': [], 
            'edges': [], 
            'clusters': [], 
            'time_range': {'start': 2000, 'end': 2024}
        }
        
        if not self.entries:
            return default_response
        
        try:
            # Get valid years first
            valid_entries = []
            for entry in self.entries:
                year = entry.get('year')
                if year and isinstance(year, (int, float)) and 1900 <= year <= 2100:
                    valid_entries.append(entry)
            
            if not valid_entries:
                # No entries with valid years, return simple list
                return default_response
            
            # Cluster the entries with valid years
            cluster_result = cluster_entries(valid_entries, cluster_by="keyword")
            
            if not cluster_result:
                return default_response
            
            nodes = cluster_result.get('nodes', [])
            clusters = cluster_result.get('clusters', [])
            edges = cluster_result.get('edges', [])
            
            # Build timeline nodes
            timeline_nodes = []
            for node in nodes:
                year = node.get('year')
                if not year:
                    continue
                    
                try:
                    year_int = int(year)
                except (ValueError, TypeError):
                    continue
                
                cluster_id = node.get('cluster', 0)
                is_burst = (node.get('frequency') or 0) > 10
                
                timeline_nodes.append({
                    'id': str(node.get('id', '')),
                    'label': str(node.get('label', ''))[:50],
                    'year': year_int,
                    'cluster': cluster_id,
                    'weight': node.get('weight', 1) or 1,
                    'is_burst': is_burst
                })
            
            if not timeline_nodes:
                return default_response
            
            # Build timeline clusters
            timeline_clusters = []
            for cluster in clusters:
                cluster_id = cluster.get('id', 0)
                cluster_nodes = [n for n in timeline_nodes if n.get('cluster') == cluster_id]
                
                if cluster_nodes:
                    years = [n['year'] for n in cluster_nodes]
                    timeline_clusters.append({
                        'id': cluster_id,
                        'label': str(cluster.get('label', f'Cluster {cluster_id}'))[:30],
                        'size': len(cluster_nodes),
                        'year_start': min(years),
                        'year_end': max(years)
                    })
            
            # Calculate time range
            all_years = [n['year'] for n in timeline_nodes]
            time_range = {
                'start': min(all_years),
                'end': max(all_years)
            }
            
            return {
                'nodes': timeline_nodes,
                'edges': edges[:500],  # Limit edges to prevent performance issues
                'clusters': timeline_clusters,
                'time_range': time_range
            }
            
        except Exception as e:
            import traceback
            print(f"Error in get_timeline_view: {e}")
            traceback.print_exc()
            return default_response
    
    def get_timezone_view(self, time_slice: int = 1) -> Dict[str, Any]:
        """
        Generate timezone view data
        
        Entries are arranged vertically by year
        """
        default_response = {
            'slices': [], 
            'edges': [], 
            'time_range': {'start': 2000, 'end': 2024}
        }
        
        if not self.entries:
            return default_response
        
        try:
            # Group entries by year
            slices = []
            for year in self.years:
                year_entries = self.year_entries.get(year, [])
                
                entries_data = []
                for entry in year_entries:
                    # Safely get list fields
                    authors = entry.get('authors') or []
                    if isinstance(authors, str):
                        authors = [authors]
                    
                    keywords = entry.get('keywords') or []
                    if isinstance(keywords, str):
                        keywords = [keywords]
                    
                    entries_data.append({
                        'id': str(entry.get('id', '')),
                        'title': str(entry.get('title', ''))[:100],
                        'authors': authors[:5],  # Limit authors
                        'journal': str(entry.get('journal', '') or ''),
                        'keywords': keywords[:10],  # Limit keywords
                        'citation_count': entry.get('citation_count') or 0
                    })
                
                slices.append({
                    'year': year,
                    'entries': entries_data,
                    'count': len(entries_data)
                })
            
            if not slices:
                return default_response
            
            # Build edges between years (keyword connections)
            edges = []
            keyword_years = defaultdict(list)
            
            for entry in self.entries:
                year = entry.get('year')
                if not year:
                    continue
                
                keywords = entry.get('keywords') or []
                if isinstance(keywords, str):
                    keywords = [keywords]
                
                for kw in keywords:
                    if kw and isinstance(kw, str):
                        keyword_years[kw.lower()].append((entry.get('id'), year))
            
            # Create edges for keywords spanning multiple years
            for kw, occurrences in keyword_years.items():
                if len(occurrences) > 1:
                    occurrences.sort(key=lambda x: x[1] if x[1] else 0)
                    for i in range(len(occurrences) - 1):
                        edges.append({
                            'source': str(occurrences[i][0]),
                            'target': str(occurrences[i + 1][0]),
                            'weight': 1
                        })
            
            return {
                'slices': slices,
                'edges': edges[:500],  # Limit edges
                'time_range': {
                    'start': self.year_range[0] if self.year_range[0] else 2000,
                    'end': self.year_range[1] if self.year_range[1] else 2024
                }
            }
            
        except Exception as e:
            import traceback
            print(f"Error in get_timezone_view: {e}")
            traceback.print_exc()
            return default_response
    
    def get_landscape_view(self) -> Dict[str, Any]:
        """
        Generate landscape (3D terrain) view data
        
        Height represents centrality/citation count
        """
        if not self.entries:
            return {'points': [], 'clusters': []}
        
        # Cluster entries
        cluster_result = cluster_entries(self.entries, cluster_by="keyword")
        
        nodes = cluster_result['nodes']
        clusters = cluster_result['clusters']
        
        # Generate 3D positions using cluster-based layout
        points = []
        cluster_positions = {}
        
        # Assign cluster center positions
        n_clusters = len(clusters)
        for i, cluster in enumerate(clusters):
            angle = 2 * math.pi * i / n_clusters if n_clusters > 0 else 0
            radius = 5
            cluster_positions[cluster['id']] = (
                radius * math.cos(angle),
                radius * math.sin(angle)
            )
        
        for node in nodes:
            cluster_id = node.get('cluster', 0)
            base_x, base_y = cluster_positions.get(cluster_id, (0, 0))
            
            # Add some random offset within cluster
            import random
            x = base_x + random.uniform(-1, 1)
            y = base_y + random.uniform(-1, 1)
            
            # Height based on centrality and citations
            z = node.get('centrality', 0) * 5 + node.get('frequency', 0) * 0.1
            
            points.append({
                'x': x,
                'y': y,
                'z': z,
                'id': node['id'],
                'label': node['label'],
                'cluster': cluster_id
            })
        
        return {
            'points': points,
            'clusters': cluster_result['clusters']
        }
    
    def get_dual_map_overlay(self) -> Dict[str, Any]:
        """
        Generate dual-map overlay data
        
        Left map: citing journals, Right map: cited journals
        Connections show knowledge flow
        """
        if not self.entries:
            return {'citing_nodes': [], 'cited_nodes': [], 'links': []}
        
        # Group by journal (as proxy for dual-map)
        journal_years = defaultdict(lambda: {'early': 0, 'recent': 0, 'total': 0})
        
        mid_year = sum(self.years) / len(self.years) if self.years else 2020
        
        for entry in self.entries:
            journal = entry.get('journal')
            year = entry.get('year')
            
            if journal and year:
                journal_years[journal]['total'] += 1
                if year <= mid_year:
                    journal_years[journal]['early'] += 1
                else:
                    journal_years[journal]['recent'] += 1
        
        # Create citing (recent) and cited (early) nodes
        citing_nodes = []
        cited_nodes = []
        
        # Sort journals by total count
        sorted_journals = sorted(
            journal_years.items(), 
            key=lambda x: -x[1]['total']
        )[:50]  # Top 50 journals
        
        for i, (journal, counts) in enumerate(sorted_journals):
            # Position nodes in a grid-like layout
            row = i // 5
            col = i % 5
            
            if counts['recent'] > 0:
                citing_nodes.append({
                    'id': f"citing_{journal}",
                    'label': journal[:30],
                    'x': -5 + col * 0.5,
                    'y': row * 0.5,
                    'weight': counts['recent'],
                    'side': 'citing'
                })
            
            if counts['early'] > 0:
                cited_nodes.append({
                    'id': f"cited_{journal}",
                    'label': journal[:30],
                    'x': 5 + col * 0.5,
                    'y': row * 0.5,
                    'weight': counts['early'],
                    'side': 'cited'
                })
        
        # Create links (self-citation within same journal)
        links = []
        for journal, counts in sorted_journals:
            if counts['early'] > 0 and counts['recent'] > 0:
                links.append({
                    'source': f"citing_{journal}",
                    'target': f"cited_{journal}",
                    'weight': min(counts['early'], counts['recent'])
                })
        
        return {
            'citing_nodes': citing_nodes,
            'cited_nodes': cited_nodes,
            'links': links
        }


def generate_visualization(
    entries: List[Dict[str, Any]],
    viz_type: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Generate visualization data
    
    Args:
        entries: List of bibliographic entries
        viz_type: Type of visualization
        **kwargs: Additional parameters
    
    Returns:
        Visualization data
    """
    service = VisualizationService(entries)
    
    if viz_type == 'co-author':
        return build_collaboration_network(
            entries, 'author',
            kwargs.get('min_weight', 1),
            kwargs.get('max_nodes', 100)
        )
    
    elif viz_type == 'co-institution':
        return build_collaboration_network(
            entries, 'institution',
            kwargs.get('min_weight', 1),
            kwargs.get('max_nodes', 100)
        )
    
    elif viz_type == 'co-country':
        return build_collaboration_network(
            entries, 'country',
            kwargs.get('min_weight', 1),
            kwargs.get('max_nodes', 100)
        )
    
    elif viz_type == 'keyword-cooccur':
        return build_collaboration_network(
            entries, 'keyword',
            kwargs.get('min_weight', 1),
            kwargs.get('max_nodes', 100)
        )
    
    elif viz_type == 'co-citation':
        return build_collaboration_network(
            entries, 'citation',
            kwargs.get('min_weight', 1),
            kwargs.get('max_nodes', 100)
        )
    
    elif viz_type == 'cluster':
        return cluster_entries(
            entries,
            kwargs.get('cluster_by', 'keyword'),
            kwargs.get('n_clusters')
        )
    
    elif viz_type == 'timeline':
        try:
            return service.get_timeline_view(
                kwargs.get('time_slice', 1),
                kwargs.get('top_n', 10)
            )
        except Exception as e:
            print(f"Error generating timeline: {e}")
            import traceback
            traceback.print_exc()
            return {'nodes': [], 'edges': [], 'clusters': [], 'time_range': {'start': 0, 'end': 0}}
    
    elif viz_type == 'timezone':
        try:
            return service.get_timezone_view(
                kwargs.get('time_slice', 1)
            )
        except Exception as e:
            print(f"Error generating timezone: {e}")
            import traceback
            traceback.print_exc()
            return {'slices': [], 'edges': [], 'time_range': {'start': 0, 'end': 0}}
    
    elif viz_type == 'burst':
        return detect_bursts(
            entries,
            kwargs.get('burst_type', 'keyword'),
            kwargs.get('min_frequency', 2),
            kwargs.get('gamma', 1.0)
        )
    
    elif viz_type == 'landscape':
        return service.get_landscape_view()
    
    elif viz_type == 'dual-map':
        return service.get_dual_map_overlay()
    
    else:
        raise ValueError(f"Unknown visualization type: {viz_type}")

