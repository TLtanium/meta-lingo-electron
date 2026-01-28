"""
Network Builder Service for Bibliographic Visualization

Builds various co-occurrence and collaboration networks from bibliographic data.
"""

from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import math


class NetworkBuilder:
    """Builds network visualizations from bibliographic entries"""
    
    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries
    
    def build_co_author_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build co-authorship network
        
        Nodes: Authors
        Edges: Co-authorship relationships (weight = number of co-authored papers)
        """
        # Build co-occurrence matrix
        cooccurrence = defaultdict(lambda: defaultdict(int))
        author_freq = defaultdict(int)
        author_years = defaultdict(list)
        
        for entry in self.entries:
            authors = entry.get('authors') or []
            
            # Handle string or list
            if isinstance(authors, str):
                if ';' in authors:
                    authors = [a.strip() for a in authors.split(';')]
                elif ',' in authors:
                    authors = [a.strip() for a in authors.split(',')]
                else:
                    authors = [authors]
            
            # Filter valid authors
            authors = [a.strip() for a in authors if a and isinstance(a, str) and len(a.strip()) > 1]
            
            year = entry.get('year')
            if year:
                try:
                    year = int(year)
                except (ValueError, TypeError):
                    year = None
            
            for author in authors:
                author_freq[author] += 1
                if year:
                    author_years[author].append(year)
            
            # Count co-occurrences
            for i, a1 in enumerate(authors):
                for a2 in authors[i+1:]:
                    cooccurrence[a1][a2] += 1
                    cooccurrence[a2][a1] += 1
        
        return self._build_network_from_cooccurrence(
            cooccurrence, author_freq, author_years,
            min_weight, max_nodes, "author"
        )
    
    def build_co_institution_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build institutional collaboration network
        
        Nodes: Institutions
        Edges: Collaboration relationships
        """
        cooccurrence = defaultdict(lambda: defaultdict(int))
        inst_freq = defaultdict(int)
        inst_years = defaultdict(list)
        
        for entry in self.entries:
            institutions = entry.get('institutions') or []
            
            # Handle string or list
            if isinstance(institutions, str):
                if ';' in institutions:
                    institutions = [i.strip() for i in institutions.split(';')]
                else:
                    institutions = [institutions]
            
            # Filter valid institutions
            institutions = [i.strip() for i in institutions if i and isinstance(i, str) and len(i.strip()) > 2]
            
            year = entry.get('year')
            if year:
                try:
                    year = int(year)
                except (ValueError, TypeError):
                    year = None
            
            for inst in institutions:
                inst_freq[inst] += 1
                if year:
                    inst_years[inst].append(year)
            
            for i, i1 in enumerate(institutions):
                for i2 in institutions[i+1:]:
                    cooccurrence[i1][i2] += 1
                    cooccurrence[i2][i1] += 1
        
        return self._build_network_from_cooccurrence(
            cooccurrence, inst_freq, inst_years,
            min_weight, max_nodes, "institution"
        )
    
    def build_co_country_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build international collaboration network
        
        Nodes: Countries
        Edges: Collaboration relationships
        """
        cooccurrence = defaultdict(lambda: defaultdict(int))
        country_freq = defaultdict(int)
        country_years = defaultdict(list)
        
        for entry in self.entries:
            countries = entry.get('countries') or []
            
            # Handle string or list
            if isinstance(countries, str):
                if ';' in countries:
                    countries = [c.strip() for c in countries.split(';')]
                else:
                    countries = [countries]
            
            # Filter valid countries
            countries = [c.strip() for c in countries if c and isinstance(c, str) and len(c.strip()) > 1]
            
            year = entry.get('year')
            if year:
                try:
                    year = int(year)
                except (ValueError, TypeError):
                    year = None
            
            for country in countries:
                country_freq[country] += 1
                if year:
                    country_years[country].append(year)
            
            for i, c1 in enumerate(countries):
                for c2 in countries[i+1:]:
                    cooccurrence[c1][c2] += 1
                    cooccurrence[c2][c1] += 1
        
        return self._build_network_from_cooccurrence(
            cooccurrence, country_freq, country_years,
            min_weight, max_nodes, "country"
        )
    
    def build_keyword_cooccurrence_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build keyword co-occurrence network
        
        Nodes: Keywords
        Edges: Co-occurrence relationships
        """
        cooccurrence = defaultdict(lambda: defaultdict(int))
        keyword_freq = defaultdict(int)
        keyword_years = defaultdict(list)
        
        for entry in self.entries:
            keywords = entry.get('keywords') or []
            
            # Handle string or list
            if isinstance(keywords, str):
                if ';' in keywords:
                    keywords = [k.strip() for k in keywords.split(';')]
                elif ',' in keywords:
                    keywords = [k.strip() for k in keywords.split(',')]
                else:
                    keywords = [keywords]
            
            year = entry.get('year')
            if year:
                try:
                    year = int(year)
                except (ValueError, TypeError):
                    year = None
            
            # Normalize keywords (lowercase, filter empty)
            keywords = [k.lower().strip() for k in keywords if k and isinstance(k, str) and len(k.strip()) > 1]
            
            for kw in keywords:
                keyword_freq[kw] += 1
                if year:
                    keyword_years[kw].append(year)
            
            for i, k1 in enumerate(keywords):
                for k2 in keywords[i+1:]:
                    cooccurrence[k1][k2] += 1
                    cooccurrence[k2][k1] += 1
        
        return self._build_network_from_cooccurrence(
            cooccurrence, keyword_freq, keyword_years,
            min_weight, max_nodes, "keyword"
        )
    
    def build_co_citation_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build co-citation network (for entries that have cited references)
        
        Note: This requires reference data which may not be available in all formats
        """
        # For co-citation, we would need cited references data
        # Currently return entries as nodes with similarity-based edges
        
        nodes = []
        edges = []
        
        # Use entries themselves as nodes
        for i, entry in enumerate(self.entries[:max_nodes]):
            nodes.append({
                'id': entry.get('id', str(i)),
                'label': entry.get('title', '')[:50],
                'weight': entry.get('citation_count', 0) + 1,
                'frequency': entry.get('citation_count', 0),
                'centrality': 0.0,
                'year': entry.get('year'),
                'attributes': {
                    'authors': entry.get('authors', []),
                    'journal': entry.get('journal'),
                    'doi': entry.get('doi')
                }
            })
        
        # Build edges based on shared keywords/authors (proxy for co-citation)
        for i, e1 in enumerate(self.entries[:max_nodes]):
            kw1 = set(k.lower() for k in e1.get('keywords', []))
            for j, e2 in enumerate(self.entries[i+1:max_nodes], i+1):
                kw2 = set(k.lower() for k in e2.get('keywords', []))
                shared = len(kw1 & kw2)
                if shared >= min_weight:
                    edges.append({
                        'source': e1.get('id', str(i)),
                        'target': e2.get('id', str(j)),
                        'weight': shared
                    })
        
        # Calculate centrality
        self._calculate_centrality(nodes, edges)
        
        return {
            'nodes': nodes,
            'edges': edges,
            'statistics': {
                'node_count': len(nodes),
                'edge_count': len(edges),
                'density': self._calculate_density(len(nodes), len(edges))
            }
        }
    
    def _build_network_from_cooccurrence(
        self,
        cooccurrence: Dict,
        frequency: Dict,
        years: Dict,
        min_weight: int,
        max_nodes: int,
        node_type: str
    ) -> Dict[str, Any]:
        """Build network structure from co-occurrence data"""
        
        # Sort by frequency and take top nodes
        sorted_items = sorted(frequency.items(), key=lambda x: -x[1])[:max_nodes]
        top_items = set(item[0] for item in sorted_items)
        
        nodes = []
        edges = []
        edge_set = set()
        
        # Create nodes
        for item, freq in sorted_items:
            year_list = years.get(item, [])
            avg_year = sum(year_list) / len(year_list) if year_list else None
            
            nodes.append({
                'id': item,
                'label': item,
                'weight': freq,
                'frequency': freq,
                'centrality': 0.0,
                'year': int(avg_year) if avg_year else None,
                'attributes': {
                    'type': node_type,
                    'first_year': min(year_list) if year_list else None,
                    'last_year': max(year_list) if year_list else None
                }
            })
        
        # Create edges (only between top nodes)
        for item1 in top_items:
            for item2, weight in cooccurrence.get(item1, {}).items():
                if item2 in top_items and weight >= min_weight:
                    edge_key = tuple(sorted([item1, item2]))
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        edges.append({
                            'source': item1,
                            'target': item2,
                            'weight': weight
                        })
        
        # Calculate centrality
        self._calculate_centrality(nodes, edges)
        
        return {
            'nodes': nodes,
            'edges': edges,
            'statistics': {
                'node_count': len(nodes),
                'edge_count': len(edges),
                'density': self._calculate_density(len(nodes), len(edges)),
                'total_items': len(frequency)
            }
        }
    
    def _calculate_centrality(self, nodes: List[Dict], edges: List[Dict]):
        """Calculate betweenness centrality for nodes"""
        # Build adjacency list
        adj = defaultdict(set)
        for edge in edges:
            adj[edge['source']].add(edge['target'])
            adj[edge['target']].add(edge['source'])
        
        node_ids = [n['id'] for n in nodes]
        n = len(node_ids)
        
        if n < 2:
            return
        
        # Calculate degree centrality as approximation
        for node in nodes:
            degree = len(adj.get(node['id'], set()))
            # Normalize to 0-1
            node['centrality'] = degree / (n - 1) if n > 1 else 0
    
    def _calculate_density(self, n_nodes: int, n_edges: int) -> float:
        """Calculate network density"""
        if n_nodes < 2:
            return 0.0
        max_edges = n_nodes * (n_nodes - 1) / 2
        return n_edges / max_edges if max_edges > 0 else 0.0


def build_collaboration_network(
    entries: List[Dict[str, Any]],
    network_type: str,
    min_weight: int = 1,
    max_nodes: int = 100
) -> Dict[str, Any]:
    """
    Build a collaboration/co-occurrence network
    
    Args:
        entries: List of bibliographic entries
        network_type: One of 'author', 'institution', 'country', 'keyword', 'citation'
        min_weight: Minimum edge weight to include
        max_nodes: Maximum number of nodes
    
    Returns:
        Network data with nodes and edges
    """
    builder = NetworkBuilder(entries)
    
    if network_type == 'author':
        return builder.build_co_author_network(min_weight, max_nodes)
    elif network_type == 'institution':
        return builder.build_co_institution_network(min_weight, max_nodes)
    elif network_type == 'country':
        return builder.build_co_country_network(min_weight, max_nodes)
    elif network_type == 'keyword':
        return builder.build_keyword_cooccurrence_network(min_weight, max_nodes)
    elif network_type == 'citation':
        return builder.build_co_citation_network(min_weight, max_nodes)
    else:
        raise ValueError(f"Unknown network type: {network_type}")

