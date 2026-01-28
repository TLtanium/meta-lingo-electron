"""
Cluster Analysis Service for Bibliographic Visualization

Implements clustering algorithms for bibliographic network analysis.
Uses Louvain algorithm for community detection.
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math
import random


class ClusterService:
    """Clustering service for bibliographic networks"""
    
    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries
    
    def cluster_by_keywords(self, n_clusters: Optional[int] = None) -> Dict[str, Any]:
        """
        Cluster entries based on keyword similarity
        
        Uses a simplified Louvain-like community detection
        """
        # Build keyword co-occurrence graph
        keyword_entries = defaultdict(list)  # keyword -> list of entry indices
        entry_keywords = []  # entry index -> set of keywords
        
        for i, entry in enumerate(self.entries):
            # Handle keywords safely - could be None, string, or list
            raw_keywords = entry.get('keywords') or []
            if isinstance(raw_keywords, str):
                raw_keywords = [raw_keywords]
            keywords = set(k.lower().strip() for k in raw_keywords if k and isinstance(k, str) and k.strip())
            entry_keywords.append(keywords)
            for kw in keywords:
                keyword_entries[kw].append(i)
        
        # Build similarity matrix (Jaccard similarity)
        n = len(self.entries)
        similarity = defaultdict(lambda: defaultdict(float))
        
        for i in range(n):
            for j in range(i + 1, n):
                kw1, kw2 = entry_keywords[i], entry_keywords[j]
                if kw1 and kw2:
                    jaccard = len(kw1 & kw2) / len(kw1 | kw2)
                    if jaccard > 0.1:  # Threshold
                        similarity[i][j] = jaccard
                        similarity[j][i] = jaccard
        
        # Run simplified community detection
        clusters = self._detect_communities(similarity, n, n_clusters)
        
        # Build response
        return self._build_cluster_response(clusters, entry_keywords)
    
    def cluster_by_authors(self, n_clusters: Optional[int] = None) -> Dict[str, Any]:
        """Cluster entries based on author overlap"""
        entry_authors = []
        
        for entry in self.entries:
            # Handle authors safely - could be None, string, or list
            raw_authors = entry.get('authors') or []
            if isinstance(raw_authors, str):
                raw_authors = [raw_authors]
            authors = set(a.lower().strip() for a in raw_authors if a and isinstance(a, str) and a.strip())
            entry_authors.append(authors)
        
        n = len(self.entries)
        similarity = defaultdict(lambda: defaultdict(float))
        
        for i in range(n):
            for j in range(i + 1, n):
                a1, a2 = entry_authors[i], entry_authors[j]
                if a1 and a2:
                    overlap = len(a1 & a2)
                    if overlap > 0:
                        similarity[i][j] = overlap / min(len(a1), len(a2))
                        similarity[j][i] = similarity[i][j]
        
        clusters = self._detect_communities(similarity, n, n_clusters)
        
        # Get top terms for each cluster
        cluster_terms = defaultdict(lambda: defaultdict(int))
        for i, cluster_id in enumerate(clusters):
            for author in entry_authors[i]:
                cluster_terms[cluster_id][author] += 1
        
        return self._build_cluster_response(clusters, entry_authors, cluster_terms, "author")
    
    def cluster_by_institutions(self, n_clusters: Optional[int] = None) -> Dict[str, Any]:
        """Cluster entries based on institutional affiliation"""
        entry_institutions = []
        
        for entry in self.entries:
            # Handle institutions safely - could be None, string, or list
            raw_insts = entry.get('institutions') or []
            if isinstance(raw_insts, str):
                raw_insts = [raw_insts]
            insts = set(i.lower().strip() for i in raw_insts if i and isinstance(i, str) and i.strip())
            entry_institutions.append(insts)
        
        n = len(self.entries)
        similarity = defaultdict(lambda: defaultdict(float))
        
        for i in range(n):
            for j in range(i + 1, n):
                i1, i2 = entry_institutions[i], entry_institutions[j]
                if i1 and i2:
                    overlap = len(i1 & i2)
                    if overlap > 0:
                        similarity[i][j] = overlap / min(len(i1), len(i2))
                        similarity[j][i] = similarity[i][j]
        
        clusters = self._detect_communities(similarity, n, n_clusters)
        
        cluster_terms = defaultdict(lambda: defaultdict(int))
        for i, cluster_id in enumerate(clusters):
            for inst in entry_institutions[i]:
                cluster_terms[cluster_id][inst] += 1
        
        return self._build_cluster_response(clusters, entry_institutions, cluster_terms, "institution")
    
    def _detect_communities(
        self,
        similarity: Dict,
        n: int,
        n_clusters: Optional[int] = None
    ) -> List[int]:
        """
        Simple community detection using label propagation
        
        Returns list of cluster assignments (one per entry)
        """
        if n == 0:
            return []
        
        # Initialize each node in its own community
        labels = list(range(n))
        
        # Iterative label propagation
        max_iterations = 50
        for _ in range(max_iterations):
            changed = False
            order = list(range(n))
            random.shuffle(order)
            
            for i in order:
                if not similarity[i]:
                    continue
                
                # Count neighbor labels
                label_weights = defaultdict(float)
                for j, weight in similarity[i].items():
                    label_weights[labels[j]] += weight
                
                if label_weights:
                    # Choose label with highest weight
                    best_label = max(label_weights.items(), key=lambda x: x[1])[0]
                    if labels[i] != best_label:
                        labels[i] = best_label
                        changed = True
            
            if not changed:
                break
        
        # Renumber clusters to be contiguous
        unique_labels = sorted(set(labels))
        label_map = {old: new for new, old in enumerate(unique_labels)}
        labels = [label_map[l] for l in labels]
        
        # If n_clusters is specified and we have too many, merge small clusters
        if n_clusters and len(set(labels)) > n_clusters:
            labels = self._merge_clusters(labels, n_clusters)
        
        return labels
    
    def _merge_clusters(self, labels: List[int], target_n: int) -> List[int]:
        """Merge smallest clusters until we reach target number"""
        # Count cluster sizes
        cluster_sizes = defaultdict(int)
        for l in labels:
            cluster_sizes[l] += 1
        
        while len(cluster_sizes) > target_n:
            # Find smallest cluster
            smallest = min(cluster_sizes.items(), key=lambda x: x[1])
            smallest_id = smallest[0]
            
            # Find largest cluster to merge into
            largest = max(
                [(k, v) for k, v in cluster_sizes.items() if k != smallest_id],
                key=lambda x: x[1]
            )
            largest_id = largest[0]
            
            # Merge
            labels = [largest_id if l == smallest_id else l for l in labels]
            cluster_sizes[largest_id] += cluster_sizes[smallest_id]
            del cluster_sizes[smallest_id]
        
        # Renumber
        unique = sorted(set(labels))
        mapping = {old: new for new, old in enumerate(unique)}
        return [mapping[l] for l in labels]
    
    def _build_cluster_response(
        self,
        clusters: List[int],
        entry_terms: List[set],
        cluster_terms: Optional[Dict] = None,
        term_type: str = "keyword"
    ) -> Dict[str, Any]:
        """Build the cluster visualization response"""
        
        if cluster_terms is None:
            # Build cluster terms from keywords
            cluster_terms = defaultdict(lambda: defaultdict(int))
            for i, cluster_id in enumerate(clusters):
                for term in entry_terms[i]:
                    cluster_terms[cluster_id][term] += 1
        
        # Build nodes
        nodes = []
        for i, entry in enumerate(self.entries):
            cluster_id = clusters[i]
            keywords = list(entry_terms[i])[:5]  # Top 5 terms for label
            
            nodes.append({
                'id': entry.get('id', str(i)),
                'label': entry.get('title', '')[:50],
                'weight': 1,
                'frequency': entry.get('citation_count', 0),
                'centrality': 0.0,
                'cluster': cluster_id,
                'year': entry.get('year'),
                'attributes': {
                    'terms': keywords,
                    'title': entry.get('title'),
                    'authors': entry.get('authors', [])
                }
            })
        
        # Build edges (within-cluster connections)
        edges = []
        n = len(self.entries)
        for i in range(n):
            for j in range(i + 1, n):
                if clusters[i] == clusters[j]:
                    # Check if they share terms
                    shared = len(entry_terms[i] & entry_terms[j])
                    if shared > 0:
                        edges.append({
                            'source': self.entries[i].get('id', str(i)),
                            'target': self.entries[j].get('id', str(j)),
                            'weight': shared
                        })
        
        # Build cluster info
        cluster_info = []
        unique_clusters = sorted(set(clusters))
        
        for cluster_id in unique_clusters:
            # Get entries in this cluster
            cluster_entries = [i for i, c in enumerate(clusters) if c == cluster_id]
            
            # Get top terms
            terms = cluster_terms[cluster_id]
            top_terms = sorted(terms.items(), key=lambda x: -x[1])[:10]
            
            # Calculate silhouette (simplified)
            silhouette = self._calculate_cluster_silhouette(cluster_id, clusters, entry_terms)
            
            cluster_info.append({
                'id': cluster_id,
                'label': ', '.join([t[0] for t in top_terms[:3]]),
                'size': len(cluster_entries),
                'silhouette': silhouette,
                'top_terms': [t[0] for t in top_terms]
            })
        
        # Calculate overall metrics
        modularity = self._calculate_modularity(clusters, entry_terms)
        avg_silhouette = sum(c['silhouette'] for c in cluster_info) / len(cluster_info) if cluster_info else 0
        
        return {
            'nodes': nodes,
            'edges': edges,
            'clusters': cluster_info,
            'modularity': modularity,
            'silhouette': avg_silhouette
        }
    
    def _calculate_cluster_silhouette(
        self,
        cluster_id: int,
        clusters: List[int],
        entry_terms: List[set]
    ) -> float:
        """Calculate silhouette coefficient for a cluster"""
        cluster_entries = [i for i, c in enumerate(clusters) if c == cluster_id]
        
        if len(cluster_entries) < 2:
            return 0.0
        
        # Calculate average intra-cluster similarity
        intra_sim = 0
        count = 0
        for i, idx1 in enumerate(cluster_entries):
            for idx2 in cluster_entries[i+1:]:
                t1, t2 = entry_terms[idx1], entry_terms[idx2]
                if t1 and t2:
                    sim = len(t1 & t2) / len(t1 | t2)
                    intra_sim += sim
                    count += 1
        
        intra_sim = intra_sim / count if count > 0 else 0
        
        # Simplified silhouette based on intra-cluster cohesion
        return min(1.0, intra_sim * 2)  # Scale to 0-1
    
    def _calculate_modularity(
        self,
        clusters: List[int],
        entry_terms: List[set]
    ) -> float:
        """Calculate modularity of the clustering"""
        n = len(clusters)
        if n < 2:
            return 0.0
        
        # Count edges within and between clusters
        within = 0
        total = 0
        
        for i in range(n):
            for j in range(i + 1, n):
                t1, t2 = entry_terms[i], entry_terms[j]
                if t1 and t2:
                    sim = len(t1 & t2) / len(t1 | t2)
                    if sim > 0.1:
                        total += 1
                        if clusters[i] == clusters[j]:
                            within += 1
        
        return within / total if total > 0 else 0.0


def cluster_entries(
    entries: List[Dict[str, Any]],
    cluster_by: str = "keyword",
    n_clusters: Optional[int] = None
) -> Dict[str, Any]:
    """
    Cluster bibliographic entries
    
    Args:
        entries: List of bibliographic entries
        cluster_by: One of 'keyword', 'author', 'institution'
        n_clusters: Target number of clusters (auto if None)
    
    Returns:
        Cluster visualization data
    """
    service = ClusterService(entries)
    
    if cluster_by == "keyword":
        return service.cluster_by_keywords(n_clusters)
    elif cluster_by == "author":
        return service.cluster_by_authors(n_clusters)
    elif cluster_by == "institution":
        return service.cluster_by_institutions(n_clusters)
    else:
        raise ValueError(f"Unknown cluster_by type: {cluster_by}")

