"""
Network Builder Service for Bibliographic Visualization

Builds various co-occurrence and collaboration networks from bibliographic data.
"""

from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
import math
import re


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
    
    @staticmethod
    def _parse_cited_references(cr_text: str) -> List[str]:
        """Parse a WOS CR (Cited References) field into normalized reference keys.

        Each cited reference is one line, typically formatted as:
            "Savoy J, 2022, DIGIT SCHOLARSH HUM, V37, P229, DOI 10.1093/..."
        We normalize to "FirstAuthor, Year" (e.g. "Savoy J, 2022"), which is the
        standard unit of analysis in author co-citation analysis (ACA).
        """
        refs: List[str] = []
        if not cr_text:
            return refs
        for line in cr_text.split('\n'):
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split(',')]
            author = parts[0].strip()
            if not author or author.lower().startswith('[anonymous'):
                # "[Anonymous]" entries conflate many unrelated works; skip them.
                continue
            year = None
            for p in parts[1:]:
                if re.fullmatch(r'(1[5-9]|20)\d{2}', p):
                    year = p
                    break
            refs.append(f"{author}, {year}" if year else author)
        # De-duplicate within a single paper (a paper co-cites a pair only once)
        seen = set()
        unique = []
        for r in refs:
            if r not in seen:
                seen.add(r)
                unique.append(r)
        return unique

    def build_co_citation_network(self, min_weight: int = 1, max_nodes: int = 100) -> Dict[str, Any]:
        """
        Build a co-citation network from the cited references (CR field) carried
        in each entry's raw_data. Two references are "co-cited" when they appear
        together in the reference list of the same paper; edge weight is the
        number of papers that co-cite both.

        Requires the WOS "Full Record and Cited References" export. When no entry
        carries cited references (e.g. legacy exports), falls back to a
        keyword-similarity proxy so the view still renders something useful.
        """
        # Gather per-paper reference lists from raw_data['CR'].
        paper_refs: List[List[str]] = []
        ref_freq: Dict[str, int] = defaultdict(int)
        ref_years: Dict[str, List[int]] = defaultdict(list)

        for entry in self.entries:
            raw = entry.get('raw_data') or {}
            cr_text = raw.get('CR') if isinstance(raw, dict) else None
            refs = self._parse_cited_references(cr_text) if cr_text else []
            if not refs:
                continue
            paper_refs.append(refs)
            for r in refs:
                ref_freq[r] += 1
                m = re.search(r'(\d{4})\s*$', r)
                if m:
                    ref_years[r].append(int(m.group(1)))

        # Fall back to the legacy keyword-similarity proxy when no real cited
        # references are available.
        if not paper_refs:
            return self._build_co_citation_proxy(min_weight, max_nodes)

        # Keep only the most-cited references as nodes.
        top_refs = set(r for r, _ in sorted(ref_freq.items(), key=lambda x: -x[1])[:max_nodes])

        # Count co-citations among the top references.
        cooccurrence: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for refs in paper_refs:
            present = [r for r in refs if r in top_refs]
            for a in range(len(present)):
                for b in range(a + 1, len(present)):
                    r1, r2 = present[a], present[b]
                    cooccurrence[r1][r2] += 1
                    cooccurrence[r2][r1] += 1

        return self._build_network_from_cooccurrence(
            cooccurrence, ref_freq, ref_years,
            min_weight, max_nodes, "citation"
        )

    def _build_co_citation_proxy(self, min_weight: int, max_nodes: int) -> Dict[str, Any]:
        """Legacy fallback: papers as nodes, shared-keyword count as edges."""
        nodes = []
        edges = []

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

