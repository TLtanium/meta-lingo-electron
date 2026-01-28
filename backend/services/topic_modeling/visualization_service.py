"""
Topic Modeling Visualization Service
Generates ECharts-compatible visualization data using BERTopic
Also provides Plotly.js visualization data using BERTopic's built-in methods
Returns data in formats expected by frontend components
"""

import logging
import numpy as np
from datetime import date, timedelta
from typing import Dict, List, Any, Optional
from sklearn.metrics.pairwise import cosine_similarity
import json

logger = logging.getLogger(__name__)

# Color palette for topics
TOPIC_COLORS = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5C7BD9',
    '#8BC34A', '#FF9800', '#E91E63', '#00BCD4', '#795548'
]


class TopicVisualizationService:
    """Service for generating ECharts visualization data using BERTopic"""
    
    def _get_topic_color(self, index: int) -> str:
        """Get color for topic by index"""
        return TOPIC_COLORS[index % len(TOPIC_COLORS)]
    
    def _get_custom_labels(self, topics: List[Dict], use_custom: bool = False) -> Optional[Dict[int, str]]:
        """Get custom labels mapping if enabled"""
        if not use_custom:
            return None
        
        labels = {}
        for t in topics:
            tid = t.get('id', -1)
            custom = t.get('custom_label', '')
            if custom and str(custom).strip():
                labels[tid] = str(custom).strip()
        
        return labels if labels else None
    
    def _get_topic_name(self, topic: Dict, custom_labels: Optional[Dict[int, str]] = None) -> str:
        """Get topic name with custom label if available"""
        tid = topic.get('id', -1)
        if custom_labels and tid in custom_labels:
            return custom_labels[tid]
        return topic.get('name', f'Topic {tid}')
    
    def _get_top_words(self, topic: Dict, n_words: int = 5) -> str:
        """Get top words as comma-separated string"""
        words = topic.get('words', [])
        if isinstance(words, list):
            word_list = [w.get('word', '') if isinstance(w, dict) else str(w) for w in words[:n_words]]
            return ', '.join(word_list)
        return str(words)
    
    def generate_barchart(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic word scores bar chart data for ECharts TopicBarChart component
        Expected format: [{topic_id, topic_name, words: [{word, weight}], color?}]
        """
        try:
            logger.info("Generating barchart visualization")
            
            top_n_topics = params.get('top_n_topics', 8)
            n_words = params.get('n_words', 5)
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Filter valid topics (exclude outliers)
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)[:top_n_topics]
            
            echarts_data = []
            for i, topic in enumerate(valid_topics):
                topic_id = topic.get('id', i)
                topic_name = self._get_topic_name(topic, custom_labels)
                
                # Get words and weights
                words_data = []
                raw_words = topic.get('words', [])
                for w in raw_words[:n_words]:
                    if isinstance(w, dict):
                        words_data.append({
                            'word': w.get('word', ''),
                            'weight': float(w.get('weight', 0)) * 100  # Convert to percentage
                        })
                    elif isinstance(w, tuple) and len(w) >= 2:
                        words_data.append({
                            'word': str(w[0]),
                            'weight': float(w[1]) * 100
                        })
                
                echarts_data.append({
                    'topic_id': topic_id,
                    'topic_name': topic_name,
                    'words': words_data,
                    'color': self._get_topic_color(i)
                })
            
            return {
                'type': 'barchart',
                'echarts_data': echarts_data
            }
            
        except Exception as e:
            logger.error(f"Error generating barchart: {e}")
            return {'type': 'barchart', 'error': str(e)}
    
    def generate_topics(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic distribution scatter plot data (Intertopic Distance Map).
        Uses UMAP for dimensionality reduction to preserve local structure and create 
        clustering effect like BERTopic's Plotly visualize_topics().
        
        Expected format: {
            echarts_data: [{topic_id, topic_name, x, y, size, count, words, color?}],
            links: [{source, target, similarity}]
        }
        """
        try:
            logger.info("Generating topics distribution visualization (Intertopic Distance Map with UMAP)")
            
            top_n_topics = params.get('top_n_topics')
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            show_links = params.get('show_links', True)
            link_threshold = params.get('link_threshold', 0.3)
            
            # Get c-TF-IDF embeddings
            c_tf_idf = topic_model.c_tf_idf_
            if c_tf_idf is None:
                return {'type': 'topics', 'error': 'No c-TF-IDF data available'}
            
            # Filter valid topics
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            if top_n_topics:
                valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)[:top_n_topics]
            
            if len(valid_topics) < 2:
                return {'type': 'topics', 'error': 'Need at least 2 topics for visualization'}
            
            # Get topic IDs that are within c_tf_idf bounds
            topic_ids = [t.get('id', 0) for t in valid_topics if t.get('id', 0) < c_tf_idf.shape[0]]
            
            if len(topic_ids) < 2:
                return {'type': 'topics', 'error': 'Not enough valid topics for visualization'}
            
            # Get topic embeddings and normalize
            from sklearn.preprocessing import normalize
            
            topic_embeddings = c_tf_idf[topic_ids].toarray()
            topic_embeddings = normalize(topic_embeddings, norm='l2')
            
            # Compute similarity matrix using cosine similarity
            similarity = cosine_similarity(topic_embeddings)
            
            # Use UMAP for 2D layout - UMAP preserves local structure better than MDS,
            # creating the "clustering" effect seen in BERTopic's Plotly visualization
            n_topics = len(topic_ids)
            
            if n_topics >= 4:
                from umap import UMAP
                
                # UMAP parameters tuned for topic visualization:
                # - n_neighbors: smaller values preserve more local structure
                # - min_dist: small value allows tighter clusters
                # - metric: cosine for text embeddings
                n_neighbors = min(15, n_topics - 1)  # Ensure n_neighbors < n_samples
                
                umap_model = UMAP(
                    n_neighbors=n_neighbors,
                    n_components=2,
                    min_dist=0.1,
                    metric='cosine',
                    random_state=42
                )
                reduced = umap_model.fit_transform(topic_embeddings)
                logger.info(f"UMAP reduction completed with n_neighbors={n_neighbors}")
            else:
                # For very few topics, use PCA instead
                from sklearn.decomposition import PCA
                pca = PCA(n_components=2, random_state=42)
                reduced = pca.fit_transform(topic_embeddings)
                logger.info("Using PCA for small number of topics")
            
            # Center the coordinates around origin
            reduced = reduced - reduced.mean(axis=0)
            
            # Scale to reasonable range for D3 force layout
            # Keep a larger range to preserve UMAP's cluster structure
            max_range = np.abs(reduced).max()
            if max_range > 0:
                reduced = reduced / max_range * 5  # Scale to [-5, 5] for better force layout
            
            # Calculate sizes based on document count
            counts = [next((t.get('count', 0) for t in valid_topics if t.get('id') == tid), 0) for tid in topic_ids]
            max_count = max(counts) if counts else 1
            min_count = min(counts) if counts else 0
            
            echarts_data = []
            for i, tid in enumerate(topic_ids):
                topic = next((t for t in valid_topics if t.get('id') == tid), None)
                if topic is None:
                    continue
                
                count = topic.get('count', 0)
                # Scale size between 20-70 based on relative document count
                if max_count > min_count:
                    normalized = (count - min_count) / (max_count - min_count)
                else:
                    normalized = 0.5
                size = 20 + normalized * 50
                
                echarts_data.append({
                    'topic_id': tid,
                    'topic_name': self._get_topic_name(topic, custom_labels),
                    'x': float(reduced[i, 0]),
                    'y': float(reduced[i, 1]),
                    'size': size,
                    'count': count,
                    'words': self._get_top_words(topic),
                    'color': self._get_topic_color(i)
                })
            
            # Generate links based on similarity (for connection lines between topics)
            links = []
            if show_links:
                for i in range(len(topic_ids)):
                    for j in range(i + 1, len(topic_ids)):
                        sim_value = float(similarity[i, j])
                        if sim_value >= link_threshold:
                            links.append({
                                'source': topic_ids[i],
                                'target': topic_ids[j],
                                'similarity': round(sim_value, 4)
                            })
                
                # Sort links by similarity (descending) and limit to avoid clutter
                links = sorted(links, key=lambda x: x['similarity'], reverse=True)[:50]
            
            logger.info(f"Topics visualization: {len(echarts_data)} topics, {len(links)} links")
            
            return {
                'type': 'topics',
                'echarts_data': echarts_data,
                'links': links
            }
            
        except Exception as e:
            logger.error(f"Error generating topics visualization: {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'topics', 'error': str(e)}
    
    def generate_documents(
        self,
        topic_model,
        documents: List[str],
        embeddings: np.ndarray,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate document distribution scatter plot data for ECharts DocumentDistribution component
        Expected format: [{x, y, topic, topic_name, doc_preview, color?}]
        """
        try:
            logger.info("Generating documents distribution visualization")
            
            sample_size = params.get('sample_size', 2000)
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Sample if too many documents
            n_docs = len(documents)
            if n_docs > sample_size:
                indices = np.random.choice(n_docs, sample_size, replace=False)
            else:
                indices = np.arange(n_docs)
            
            sample_docs = [documents[i] for i in indices]
            sample_embeddings = embeddings[indices]
            sample_topics = [topic_model.topics_[i] for i in indices]
            
            # Reduce to 2D using UMAP
            from umap import UMAP
            n_neighbors = min(15, len(sample_docs) - 1) if len(sample_docs) > 1 else 1
            
            reduced = UMAP(
                n_neighbors=n_neighbors,
                n_components=2,
                min_dist=0.0,
                metric='cosine',
                random_state=42
            ).fit_transform(sample_embeddings)
            
            # Create topic name mapping
            topic_name_map = {}
            topic_color_map = {}
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            for i, t in enumerate(valid_topics):
                tid = t.get('id', -1)
                topic_name_map[tid] = self._get_topic_name(t, custom_labels)
                topic_color_map[tid] = self._get_topic_color(i)
            
            echarts_data = []
            for i, (doc, topic_id) in enumerate(zip(sample_docs, sample_topics)):
                topic_name = topic_name_map.get(topic_id, f'Topic {topic_id}')
                color = topic_color_map.get(topic_id, self._get_topic_color(abs(topic_id) % len(TOPIC_COLORS)))
                
                # Preview is first 100 characters
                doc_preview = doc[:100] + '...' if len(doc) > 100 else doc
                
                echarts_data.append({
                    'x': float(reduced[i, 0]),
                    'y': float(reduced[i, 1]),
                    'topic': topic_id,
                    'topic_name': topic_name,
                    'doc_preview': doc_preview,
                    'color': color
                })
            
            return {
                'type': 'documents',
                'echarts_data': echarts_data,
                'total_docs': n_docs,
                'sample_size': len(sample_docs)
            }
            
        except Exception as e:
            logger.error(f"Error generating documents visualization: {e}")
            return {'type': 'documents', 'error': str(e)}
    
    def generate_hierarchy(
        self,
        topic_model,
        documents: List[str],
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate hierarchical topic clustering data for ECharts TopicHierarchy component
        Uses scipy hierarchical clustering to create true dendrogram structure.
        Expected format: {name, value?, topic_id?, words?, children?: [...], distance?, merged_words?}
        
        Internal nodes now include merged_words - the combined c-TF-IDF representation 
        of all topics under that cluster, following BERTopic's hierarchical_topics behavior.
        """
        try:
            logger.info("Generating hierarchy visualization")
            from scipy.cluster.hierarchy import linkage, to_tree
            from scipy.spatial.distance import pdist
            
            top_n_topics = params.get('top_n_topics')
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Get valid topics
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            if len(valid_topics) < 2:
                return {'type': 'hierarchy', 'error': 'Need at least 2 topics for hierarchy'}
            
            if top_n_topics:
                valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)[:top_n_topics]
            
            # Get c-TF-IDF embeddings for hierarchical clustering
            c_tf_idf = topic_model.c_tf_idf_
            if c_tf_idf is None:
                return {'type': 'hierarchy', 'error': 'No c-TF-IDF data available'}
            
            # Get topic IDs within bounds
            topic_ids = [t.get('id', 0) for t in valid_topics if t.get('id', 0) < c_tf_idf.shape[0]]
            
            if len(topic_ids) < 2:
                return {'type': 'hierarchy', 'error': 'Not enough valid topics for hierarchy'}
            
            # Get topic embeddings
            topic_embeddings = c_tf_idf[topic_ids].toarray()
            
            # Get feature names (vocabulary) for extracting words from merged c-TF-IDF
            feature_names = None
            if hasattr(topic_model, 'vectorizer_model') and topic_model.vectorizer_model is not None:
                try:
                    feature_names = topic_model.vectorizer_model.get_feature_names_out()
                except:
                    try:
                        feature_names = topic_model.vectorizer_model.get_feature_names()
                    except:
                        pass
            
            # Compute hierarchical clustering using cosine distance
            # pdist computes pairwise distances, linkage builds the tree
            distances = pdist(topic_embeddings, metric='cosine')
            # Use 'average' linkage for balanced tree
            linkage_matrix = linkage(distances, method='average')
            
            # Convert linkage to tree structure
            root_node, node_list = to_tree(linkage_matrix, rd=True)
            
            # Build topic info mapping (index -> info)
            topic_info_map = {}
            for i, tid in enumerate(topic_ids):
                topic = next((t for t in valid_topics if t.get('id') == tid), None)
                if topic:
                    topic_info_map[i] = {
                        'topic_id': tid,
                        'name': self._get_topic_name(topic, custom_labels),
                        'count': topic.get('count', 0),
                        'words': self._get_top_words(topic),
                        'color': self._get_topic_color(i),
                        'embedding_idx': i  # Store the index for c-TF-IDF lookup
                    }
            
            # Log linkage matrix for debugging
            logger.info(f"Hierarchy: linkage_matrix shape: {linkage_matrix.shape}")
            logger.info(f"Hierarchy: linkage distances range: {linkage_matrix[:, 2].min():.4f} - {linkage_matrix[:, 2].max():.4f}")
            
            def get_leaf_indices(node):
                """Recursively get all leaf node indices under a node"""
                if node.is_leaf():
                    return [node.id]
                else:
                    return get_leaf_indices(node.left) + get_leaf_indices(node.right)
            
            def compute_merged_words(leaf_indices, n_words=5):
                """
                Compute merged topic representation from multiple topics.
                Average the c-TF-IDF vectors and extract top words.
                """
                if feature_names is None or len(leaf_indices) == 0:
                    return ''
                
                try:
                    # Get embeddings for all leaves
                    embeddings = topic_embeddings[leaf_indices]
                    # Average the embeddings (like BERTopic's merge behavior)
                    merged_embedding = np.mean(embeddings, axis=0)
                    # Get top word indices
                    top_indices = np.argsort(merged_embedding)[::-1][:n_words]
                    # Get word names
                    words = [feature_names[i] for i in top_indices if merged_embedding[i] > 0]
                    return ', '.join(words[:n_words])
                except Exception as e:
                    logger.warning(f"Error computing merged words: {e}")
                    return ''
            
            # Recursively build ECharts tree data
            def build_tree_node(node, depth=0):
                if node.is_leaf():
                    # Leaf node - actual topic
                    info = topic_info_map.get(node.id, {})
                    return {
                        'name': info.get('name', f'Topic {node.id}'),
                        'value': info.get('count', 0),
                        'topic_id': info.get('topic_id', node.id),
                        'words': info.get('words', ''),
                        'itemStyle': {'color': info.get('color', self._get_topic_color(node.id))},
                        'distance': 0,
                        'is_leaf': True
                    }
                else:
                    # Internal node - cluster
                    left_child = build_tree_node(node.left, depth + 1)
                    right_child = build_tree_node(node.right, depth + 1)
                    
                    # Calculate combined count
                    combined_count = (left_child.get('value', 0) or 0) + (right_child.get('value', 0) or 0)
                    
                    node_distance = float(node.dist)
                    
                    # Get all leaf indices under this internal node
                    leaf_indices = get_leaf_indices(node)
                    
                    # Compute merged topic words for this cluster
                    merged_words = compute_merged_words(leaf_indices)
                    
                    logger.debug(f"Hierarchy: Internal node at depth {depth}, distance: {node_distance:.4f}, leaves: {leaf_indices}, merged_words: {merged_words[:50]}...")
                    
                    return {
                        'name': f'Cluster {node.id - len(topic_ids)}' if depth > 0 else 'Topics',
                        'value': combined_count,
                        'distance': node_distance,
                        'children': [left_child, right_child],
                        'merged_words': merged_words,  # Topic representation at this hierarchy level
                        'is_leaf': False
                    }
            
            echarts_data = build_tree_node(root_node)
            # Rename root
            echarts_data['name'] = 'Topics'
            
            # Log the tree structure distances for debugging
            def log_distances(node, path=""):
                dist = node.get('distance', 'N/A')
                name = node.get('name', 'unknown')
                merged = node.get('merged_words', '')[:30] + '...' if node.get('merged_words') else ''
                logger.info(f"Hierarchy node: {path}{name} -> distance={dist}, merged={merged}")
                for i, child in enumerate(node.get('children', [])):
                    log_distances(child, path + "  ")
            
            log_distances(echarts_data)
            
            return {
                'type': 'hierarchy',
                'echarts_data': echarts_data
            }
            
        except Exception as e:
            logger.error(f"Error generating hierarchy visualization: {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'hierarchy', 'error': str(e)}
    
    def generate_heatmap(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic similarity heatmap data for ECharts TopicHeatmap component
        Expected format: {type?, data: [[i, j, value]], labels, min_value?, max_value?}
        """
        try:
            logger.info("Generating heatmap visualization")
            
            top_n_topics = params.get('top_n_topics')
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Get c-TF-IDF
            c_tf_idf = topic_model.c_tf_idf_
            if c_tf_idf is None:
                return {'type': 'heatmap', 'error': 'No c-TF-IDF data available'}
            
            # Filter valid topics
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            if top_n_topics:
                valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)[:top_n_topics]
            
            # Get topic IDs within bounds
            topic_ids = [t.get('id', 0) for t in valid_topics if t.get('id', 0) < c_tf_idf.shape[0]]
            
            if len(topic_ids) < 2:
                return {'type': 'heatmap', 'error': 'Need at least 2 topics for heatmap'}
            
            # Get topic embeddings - prefer topic_embeddings_ if available (denser)
            # Otherwise use c-TF-IDF
            topic_embeddings = None
            if hasattr(topic_model, 'topic_embeddings_') and topic_model.topic_embeddings_ is not None:
                try:
                    # topic_embeddings_ uses topic IDs as keys
                    embeddings_list = []
                    for tid in topic_ids:
                        if tid in topic_model.topic_embeddings_:
                            embeddings_list.append(topic_model.topic_embeddings_[tid])
                        elif tid < len(topic_model.topic_embeddings_):
                            embeddings_list.append(topic_model.topic_embeddings_[tid])
                    
                    if len(embeddings_list) == len(topic_ids):
                        topic_embeddings = np.array(embeddings_list)
                        logger.info("Using topic_embeddings_ for heatmap")
                except Exception as e:
                    logger.warning(f"Could not use topic_embeddings_: {e}")
            
            # Fallback to c-TF-IDF with L2 normalization for better similarity
            if topic_embeddings is None:
                topic_embeddings = c_tf_idf[topic_ids].toarray()
                # L2 normalize to get unit vectors for better cosine similarity
                from sklearn.preprocessing import normalize
                topic_embeddings = normalize(topic_embeddings, norm='l2')
                logger.info("Using normalized c-TF-IDF for heatmap")
            
            # Compute similarity matrix
            similarity = cosine_similarity(topic_embeddings)
            
            # Get labels
            labels = []
            for tid in topic_ids:
                topic = next((t for t in valid_topics if t.get('id') == tid), None)
                if topic:
                    labels.append(self._get_topic_name(topic, custom_labels))
                else:
                    labels.append(f'Topic {tid}')
            
            # Create heatmap data [[i, j, value], ...]
            # Round values to avoid floating point issues
            heatmap_data = []
            min_val, max_val = 1.0, 0.0
            for i in range(len(topic_ids)):
                for j in range(len(topic_ids)):
                    val = float(similarity[i, j])
                    # Clamp to [0, 1] range
                    val = max(0.0, min(1.0, val))
                    heatmap_data.append([i, j, round(val, 4)])
                    if i != j:  # Track non-diagonal values for range
                        min_val = min(min_val, val)
                        max_val = max(max_val, val)
            
            logger.info(f"Heatmap similarity range (non-diagonal): {min_val:.4f} - {max_val:.4f}")
            
            return {
                'type': 'heatmap',
                'echarts_data': {
                    'type': 'heatmap',
                    'data': heatmap_data,
                    'labels': labels,
                    'min_value': 0.0,
                    'max_value': 1.0
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating heatmap visualization: {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'heatmap', 'error': str(e)}
    
    def generate_term_rank(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate term rank visualization data for ECharts WordRank component
        Expected format: [{topic_id, topic_name, word, rank, weight, color?}]
        """
        try:
            logger.info("Generating term rank visualization")
            
            top_n_topics = params.get('top_n_topics')
            n_words = params.get('n_words', 30)  # Default to 30 words per topic, configurable
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            logger.info(f"Term rank: n_words={n_words}, top_n_topics={top_n_topics}")
            
            # Filter valid topics
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)
            if top_n_topics:
                valid_topics = valid_topics[:top_n_topics]
            
            echarts_data = []
            for i, topic in enumerate(valid_topics):
                tid = topic.get('id', i)
                topic_name = self._get_topic_name(topic, custom_labels)
                color = self._get_topic_color(i)
                
                # Get words with ranks - use n_words parameter
                words = topic.get('words', [])
                for rank, w in enumerate(words[:n_words], 1):
                    if isinstance(w, dict):
                        word = w.get('word', '')
                        weight = float(w.get('weight', 0)) * 100
                    elif isinstance(w, tuple) and len(w) >= 2:
                        word = str(w[0])
                        weight = float(w[1]) * 100
                    else:
                        continue
                    
                    echarts_data.append({
                        'topic_id': tid,
                        'topic_name': topic_name,
                        'word': word,
                        'rank': rank,
                        'weight': weight,
                        'color': color
                    })
            
            logger.info(f"Term rank: generated {len(echarts_data)} data points for {len(valid_topics)} topics")
            
            return {
                'type': 'term_rank',
                'echarts_data': echarts_data
            }
            
        except Exception as e:
            logger.error(f"Error generating term rank visualization: {e}")
            return {'type': 'term_rank', 'error': str(e)}
    
    def _format_timestamp(self, ts, date_format: str = 'year_only') -> str:
        """
        Format timestamp to readable date string.
        Handles both days-since-epoch (int) and datetime objects.
        
        Args:
            ts: Timestamp value (int days since epoch, datetime, or numpy datetime64)
            date_format: 'year_only' for just year (e.g., "2010"), 
                        'full_date' for complete date (e.g., "2010-03-15")
        """
        try:
            dt = None
            
            # If already a datetime/date object
            if hasattr(ts, 'strftime'):
                dt = ts
            
            # If it's a numpy datetime64 or pandas Timestamp
            elif hasattr(ts, 'astype') or str(type(ts).__name__) in ['Timestamp', 'datetime64']:
                try:
                    import pandas as pd
                    dt = pd.Timestamp(ts).to_pydatetime()
                except Exception as e:
                    logger.warning(f"Failed to convert {type(ts).__name__} to datetime: {e}")
                    pass
            
            # If it's an integer (days since epoch)
            elif isinstance(ts, (int, float, np.integer, np.floating)):
                ts_int = int(ts)
                # Check if this looks like days since epoch (reasonable range)
                # Days from 1970 to 2100 would be about 47,000 days
                if -50000 < ts_int < 100000:
                    # Convert days since 1970-01-01 to date
                    epoch = date(1970, 1, 1)
                    dt = epoch + timedelta(days=ts_int)
                else:
                    # Might be a Unix timestamp in seconds
                    try:
                        dt = datetime.fromtimestamp(ts_int)
                    except (ValueError, OSError):
                        # Might be milliseconds
                        try:
                            dt = datetime.fromtimestamp(ts_int / 1000)
                        except (ValueError, OSError):
                            pass
            
            if dt is not None:
                # Format based on date_format setting
                if date_format == 'year_only':
                    return str(dt.year)
                else:
                    # full_date: return complete date format
                    return dt.strftime('%Y-%m-%d')
            
            # Fallback: return as string
            logger.warning(f"Could not convert timestamp {ts} (type: {type(ts).__name__}) to date, using string fallback")
            return str(ts)
        except Exception as e:
            logger.warning(f"Could not format timestamp {ts}: {e}")
            return str(ts)
    
    def generate_topics_over_time(
        self,
        topic_model,
        topics_over_time_data,
        topics: List[Dict],
        params: Dict[str, Any],
        date_format: str = 'year_only'
    ) -> Dict[str, Any]:
        """
        Generate topics over time data for ECharts TopicsOverTime component
        Expected format: {type?, series: [{topic_id, topic_name, words?, values, color?}], timestamps}
        
        Args:
            date_format: 'year_only' for just year (e.g., "2010"), 'full_date' for YYYY-MM
        """
        try:
            logger.info(f"Generating topics over time visualization (date_format={date_format})")
            
            if topics_over_time_data is None:
                return {'type': 'topics_over_time', 'error': 'No topics over time data available'}
            
            top_n_topics = params.get('top_n_topics')
            normalize_frequency = params.get('normalize_frequency', False)
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Get unique timestamps and topic IDs
            timestamps = sorted(topics_over_time_data['Timestamp'].unique().tolist())
            unique_topics = topics_over_time_data['Topic'].unique().tolist()
            
            # Filter to valid topics (exclude -1)
            unique_topics = [t for t in unique_topics if t != -1]
            
            if top_n_topics:
                # Get top topics by total frequency
                topic_freq = topics_over_time_data[topics_over_time_data['Topic'] != -1].groupby('Topic')['Frequency'].sum()
                top_topic_ids = topic_freq.nlargest(top_n_topics).index.tolist()
                unique_topics = [t for t in unique_topics if t in top_topic_ids]
            
            # Build series data
            series = []
            for i, tid in enumerate(unique_topics):
                # Get topic info
                topic = next((t for t in topics if t.get('id') == tid), None)
                if topic:
                    topic_name = self._get_topic_name(topic, custom_labels)
                    words = self._get_top_words(topic)
                else:
                    topic_name = f'Topic {tid}'
                    words = ''
                
                # Get values for each timestamp
                topic_data = topics_over_time_data[topics_over_time_data['Topic'] == tid]
                values = []
                for ts in timestamps:
                    row = topic_data[topic_data['Timestamp'] == ts]
                    if len(row) > 0:
                        freq = float(row['Frequency'].values[0])
                        if normalize_frequency:
                            total = topics_over_time_data[topics_over_time_data['Timestamp'] == ts]['Frequency'].sum()
                            freq = freq / total if total > 0 else 0
                        values.append(freq)
                    else:
                        values.append(0)
                
                series.append({
                    'topic_id': tid,
                    'topic_name': topic_name,
                    'words': words,
                    'values': values,
                    'color': self._get_topic_color(i)
                })
            
            # Format timestamps to readable date strings based on date_format
            formatted_timestamps = [self._format_timestamp(ts, date_format) for ts in timestamps]
            
            return {
                'type': 'topics_over_time',
                'echarts_data': {
                    'type': 'topics_over_time',
                    'series': series,
                    'timestamps': formatted_timestamps
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating topics over time visualization: {e}")
            return {'type': 'topics_over_time', 'error': str(e)}
    
    def generate_sankey(
        self,
        topic_model,
        documents: List[str],
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate sankey diagram data showing document flow to topics
        Expected format: {nodes: [{id, name, type, count?, words?}], links: [{source, target, value}]}
        """
        try:
            logger.info("Generating sankey diagram visualization")
            
            top_n_topics = params.get('top_n_topics', 10)
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Debug: log topics parameter structure
            logger.info(f"Sankey: topics parameter has {len(topics)} items")
            if topics and len(topics) > 0:
                logger.info(f"Sankey: First topic structure: {topics[0]}")
            
            # Get topic assignments from model
            topic_assignments = topic_model.topics_
            if topic_assignments is None:
                logger.error("Sankey: topic_model.topics_ is None")
                return {'type': 'sankey', 'error': 'No topic assignments available'}
            
            # Convert to list if numpy array
            if hasattr(topic_assignments, 'tolist'):
                topic_assignments = topic_assignments.tolist()
            
            logger.info(f"Sankey: Found {len(topic_assignments)} document assignments")
            
            # Debug: show unique topic IDs in assignments
            unique_assignments = set(topic_assignments)
            logger.info(f"Sankey: Unique topic IDs in assignments: {sorted(unique_assignments)}")
            
            # Filter valid topics (exclude outliers with id=-1) and sort by count
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)[:top_n_topics]
            
            if not valid_topics:
                logger.error("Sankey: No valid topics found after filtering")
                return {'type': 'sankey', 'error': 'No valid topics for sankey diagram'}
            
            logger.info(f"Sankey: Processing {len(valid_topics)} valid topics")
            
            # Create nodes
            nodes = []
            
            # Source node (all documents)
            total_docs = len(documents) if documents else len(topic_assignments)
            nodes.append({
                'id': 'source_all',
                'name': f'All Documents ({total_docs})',
                'type': 'source',
                'count': total_docs
            })
            
            # Topic nodes - ensure integer IDs for comparison
            topic_id_set = set()
            for i, topic in enumerate(valid_topics):
                tid = int(topic.get('id', i))  # Ensure integer
                topic_id_set.add(tid)
                nodes.append({
                    'id': f'topic_{tid}',
                    'name': self._get_topic_name(topic, custom_labels),
                    'type': 'topic',
                    'count': topic.get('count', 0),
                    'words': self._get_top_words(topic)
                })
            
            logger.info(f"Sankey: Topic IDs in set: {sorted(topic_id_set)}")
            
            # Check intersection between valid topic IDs and actual assignments
            intersection = topic_id_set.intersection(unique_assignments)
            logger.info(f"Sankey: Intersection between valid topics and assignments: {sorted(intersection)}")
            
            # Create links
            links = []
            
            # Count documents per topic - ensure integer comparison
            topic_doc_counts = {}
            for topic_id in topic_assignments:
                tid = int(topic_id)  # Ensure integer
                if tid in topic_id_set:
                    topic_doc_counts[tid] = topic_doc_counts.get(tid, 0) + 1
            
            logger.info(f"Sankey: Topic doc counts: {topic_doc_counts}")
            
            # Create links from source to topics
            for tid, count in topic_doc_counts.items():
                if count > 0:
                    links.append({
                        'source': 'source_all',
                        'target': f'topic_{tid}',
                        'value': count
                    })
            
            # Sort links by value for better visualization
            links = sorted(links, key=lambda x: x['value'], reverse=True)
            
            logger.info(f"Sankey: Generated {len(nodes)} nodes and {len(links)} links")
            
            # Warn if no links generated
            if len(links) == 0:
                logger.warning("Sankey: No links generated! Check topic ID matching.")
                logger.warning(f"  - Valid topic IDs: {sorted(topic_id_set)}")
                logger.warning(f"  - Assignment unique IDs: {sorted(unique_assignments)}")
            
            return {
                'type': 'sankey',
                'echarts_data': {
                    'nodes': nodes,
                    'links': links
                }
            }
            
        except Exception as e:
            logger.error(f"Error generating sankey diagram: {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'sankey', 'error': str(e)}
    
    # ============ Plotly.js Visualization Methods ============
    
    def _convert_plotly_figure_to_dict(self, fig) -> Dict[str, Any]:
        """Convert Plotly figure to dictionary for JSON serialization"""
        try:
            # Use to_json() to ensure proper JSON serialization (handles numpy arrays, etc.)
            import json
            import plotly.io as pio
            
            # Convert to JSON string first, then parse to dict
            # This ensures all numpy arrays and special types are properly serialized
            json_str = pio.to_json(fig)
            fig_dict = json.loads(json_str)
            return fig_dict
        except Exception as e:
            logger.error(f"Error converting Plotly figure to dict: {e}")
            # Fallback: try figure's to_dict() method
            try:
                fig_dict = fig.to_dict()
                # Recursively convert numpy arrays to lists
                return self._make_json_serializable(fig_dict)
            except Exception as e2:
                logger.error(f"Error converting Plotly figure: {e2}")
                import traceback
                traceback.print_exc()
                raise
    
    def _make_json_serializable(self, obj):
        """Recursively convert numpy arrays and other non-serializable types to JSON-compatible types"""
        import numpy as np
        
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._make_json_serializable(item) for item in obj]
        elif hasattr(obj, '__dict__'):
            return self._make_json_serializable(obj.__dict__)
        else:
            return obj
    
    def generate_topic_info_table(
        self,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic information table data
        Returns structured data for table display
        """
        try:
            logger.info("Generating topic information table")
            
            custom_labels = self._get_custom_labels(topics, params.get('custom_labels', False))
            
            # Filter valid topics (exclude outliers)
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            valid_topics = sorted(valid_topics, key=lambda x: x.get('count', 0), reverse=True)
            
            table_data = []
            for topic in valid_topics:
                topic_id = topic.get('id', -1)
                topic_name = self._get_topic_name(topic, custom_labels)
                count = topic.get('count', 0)
                
                # Get top words as string
                words = topic.get('words', [])
                if isinstance(words, list) and len(words) > 0:
                    word_list = []
                    for w in words[:10]:  # Top 10 words
                        if isinstance(w, dict):
                            word_list.append(w.get('word', ''))
                        elif isinstance(w, tuple) and len(w) >= 1:
                            word_list.append(str(w[0]))
                        else:
                            word_list.append(str(w))
                    words_str = ', '.join(word_list)
                else:
                    words_str = str(words) if words else ''
                
                table_data.append({
                    'topic_id': topic_id,
                    'topic_name': topic_name,
                    'count': count,
                    'words': words_str
                })
            
            return {
                'type': 'topic_info_table',
                'table_data': table_data,
                'total_topics': len(table_data)
            }
            
        except Exception as e:
            logger.error(f"Error generating topic info table: {e}")
            return {'type': 'topic_info_table', 'error': str(e)}
    
    def _apply_custom_labels(self, topic_model, topics: List[Dict], use_custom: bool = False):
        """
        Apply custom labels to topic model using set_topic_labels().
        BERTopic requires calling set_topic_labels() before visualization
        methods can use custom_labels=True.
        
        Args:
            topic_model: BERTopic model instance
            topics: List of topic dictionaries with 'id' and 'custom_label'
            use_custom: Whether to apply custom labels
        """
        if not use_custom:
            return
        
        custom_labels_dict = {}
        for t in topics:
            tid = t.get('id', -1)
            custom = t.get('custom_label', '')
            if custom and str(custom).strip():
                custom_labels_dict[tid] = str(custom).strip()
        
        if custom_labels_dict:
            try:
                topic_model.set_topic_labels(custom_labels_dict)
                logger.info(f"Applied {len(custom_labels_dict)} custom labels to topic model")
            except Exception as e:
                logger.warning(f"Failed to set topic labels: {e}")
    
    def generate_barchart_plotly(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic word scores bar chart using BERTopic's visualize_barchart()
        Returns Plotly figure as dictionary
        """
        try:
            logger.info("Generating barchart visualization (Plotly)")
            
            # Prepare parameters for BERTopic's visualize_barchart
            barchart_params = {
                'top_n_topics': params.get('top_n_topics', 8),
                'n_words': params.get('n_words', 5),
                'title': params.get('title', 'Topic Word Scores')
            }
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                barchart_params['custom_labels'] = True
            
            # Generate Plotly figure using BERTopic
            fig = topic_model.visualize_barchart(**barchart_params)
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'barchart',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating barchart (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'barchart', 'error': str(e)}
    
    def generate_topics_plotly(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate inter-topic distance map using BERTopic's visualize_topics()
        Returns Plotly figure as dictionary
        """
        try:
            logger.info("Generating topics visualization (Plotly - Intertopic Distance Map)")
            
            # Get valid topics count
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            num_topics = len(valid_topics)
            
            if num_topics < 2:
                return {'type': 'topics', 'error': 'Need at least 2 topics for intertopic distance map'}
            
            # Prepare parameters
            topics_params = {
                'title': params.get('title', 'Intertopic Distance Map')
            }
            
            # Note: visualize_topics() doesn't support top_n_topics parameter well
            # It can cause "zero-size array" errors, so we don't pass it
            # Users can filter topics through custom_labels if needed
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                topics_params['custom_labels'] = True
            
            # Generate Plotly figure
            fig = topic_model.visualize_topics(**topics_params)
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'topics',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating topics visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'topics', 'error': str(e)}
    
    def generate_hierarchy_plotly(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any],
        documents: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Generate hierarchical topic clustering using BERTopic's visualize_hierarchy()
        Returns Plotly figure as dictionary
        
        CRITICAL: We must first compute hierarchical_topics and then pass it to visualize_hierarchy()
        to ensure proper multi-level hierarchy display. Without this, the visualization only shows
        a single layer of the hierarchy tree.
        
        Reference: https://maartengr.github.io/BERTopic/getting_started/visualization/visualize_hierarchy.html
        """
        try:
            logger.info("Generating hierarchy visualization (Plotly)")
            
            # Check if we have enough topics
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            num_valid_topics = len(valid_topics)
            if num_valid_topics < 2:
                return {'type': 'hierarchy', 'error': 'Need at least 2 topics for hierarchy'}
            
            # Check if we have documents (required for hierarchical_topics computation)
            if documents is None or len(documents) == 0:
                error_msg = (
                    'Documents are required for hierarchy visualization. '
                    'This usually means you are using an old analysis result. '
                    'Please re-run the topic modeling analysis to generate a new result with document data.'
                )
                logger.error(f"Hierarchy visualization error: {error_msg}")
                return {'type': 'hierarchy', 'error': error_msg}
            
            logger.info(f"Documents available: {len(documents)} items")
            
            # Check if hierarchical labels should be shown
            # When show_hierarchical_labels=True, we pass hierarchical_topics to visualize_hierarchy()
            # This enables hover tooltips showing topic representations at each level (Hierarchical labels)
            # Reference: https://maartengr.github.io/BERTopic/getting_started/visualization/visualize_hierarchy.html
            # When show_hierarchical_labels=False, we don't pass hierarchical_topics, so hover tooltips won't show
            # but the hierarchy structure will still be displayed
            show_hierarchical_labels = params.get('show_hierarchical_labels', True)
            
            # STEP 1: Always compute hierarchical_topics for proper multi-level hierarchy display
            # This ensures the hierarchy structure is correct regardless of label display setting
            logger.info("Computing hierarchical_topics...")
            try:
                hierarchical_topics = topic_model.hierarchical_topics(documents)
                logger.info(f"Hierarchical topics computed: {len(hierarchical_topics)} merge steps")
                
                # Log merge steps for debugging
                if len(hierarchical_topics) > 0:
                    logger.info(f"First merge: {hierarchical_topics.iloc[0]['Topics']}")
                    logger.info(f"Last merge: {hierarchical_topics.iloc[-1]['Topics']}")
                
            except Exception as e:
                logger.error(f"Failed to compute hierarchical_topics: {e}")
                import traceback
                traceback.print_exc()
                return {'type': 'hierarchy', 'error': f'Failed to compute hierarchy: {str(e)}'}
            
            # Prepare parameters
            hierarchy_params = {
                'title': params.get('title', 'Topic Hierarchy')
            }
            
            # Only pass hierarchical_topics if hierarchical labels are enabled
            # When passed, hover tooltips will show topic representations at each level
            # When not passed, hierarchy structure is still displayed but without hover tooltips
            if show_hierarchical_labels:
                hierarchy_params['hierarchical_topics'] = hierarchical_topics
                logger.info("Hierarchical labels enabled: hover tooltips will show topic representations")
            else:
                logger.info("Hierarchical labels disabled: hierarchy structure displayed without hover tooltips")
            
            # Validate and adjust top_n_topics if specified
            if 'top_n_topics' in params and params['top_n_topics'] is not None:
                top_n = params['top_n_topics']
                if top_n >= num_valid_topics:
                    top_n = max(1, num_valid_topics - 1)
                    logger.info(f"Adjusted top_n_topics to {top_n}")
                hierarchy_params['top_n_topics'] = top_n
            
            # Add orientation parameter
            # BERTopic's visualize_hierarchy() supports: 'top', 'left', 'bottom', 'right'
            # Map frontend 'horizontal'/'vertical' to BERTopic's format
            orientation = params.get('orientation', 'horizontal')
            if orientation == 'horizontal':
                hierarchy_params['orientation'] = 'left'  # Horizontal = left-to-right
            elif orientation == 'vertical':
                hierarchy_params['orientation'] = 'top'   # Vertical = top-to-bottom
            elif orientation in ['top', 'left', 'bottom', 'right']:
                hierarchy_params['orientation'] = orientation
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                hierarchy_params['custom_labels'] = True
            
            # STEP 2: Generate Plotly figure with hierarchical_topics
            logger.info(f"Calling visualize_hierarchy with params: {list(hierarchy_params.keys())}")
            fig = topic_model.visualize_hierarchy(**hierarchy_params)
            
            # Enhance layout for better visualization
            fig.update_layout(
                width=params.get('width', 800),
                height=params.get('height', 800),
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(248,249,250,0.3)',
                font=dict(color='#495057', family='Arial, sans-serif', size=12)
            )
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'hierarchy',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating hierarchy visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'hierarchy', 'error': str(e)}
    
    def generate_heatmap_plotly(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate topic similarity heatmap using BERTopic's visualize_heatmap()
        Returns Plotly figure as dictionary
        """
        try:
            logger.info("Generating heatmap visualization (Plotly)")
            
            # Get valid topics count
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            num_topics = len(valid_topics)
            
            if num_topics < 2:
                return {'type': 'heatmap', 'error': 'Need at least 2 topics for heatmap'}
            
            # Prepare parameters
            heatmap_params = {
                'title': params.get('title', 'Topic Similarity Matrix')
            }
            
            # Validate and set n_clusters (must be less than number of topics)
            n_clusters = params.get('n_clusters')
            if n_clusters is not None:
                if n_clusters >= num_topics:
                    return {
                        'type': 'heatmap',
                        'error': f'Number of clusters ({n_clusters}) must be less than the total number of topics ({num_topics})'
                    }
                if n_clusters < 1:
                    return {'type': 'heatmap', 'error': 'Number of clusters must be at least 1'}
                heatmap_params['n_clusters'] = n_clusters
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                heatmap_params['custom_labels'] = True
            
            # Generate Plotly figure
            fig = topic_model.visualize_heatmap(**heatmap_params)
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'heatmap',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating heatmap visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'heatmap', 'error': str(e)}
    
    def generate_documents_plotly(
        self,
        topic_model,
        documents: List[str],
        embeddings: np.ndarray,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate document distribution plot using BERTopic's visualize_documents()
        Returns Plotly figure as dictionary
        """
        try:
            logger.info("Generating documents visualization (Plotly)")
            
            # Prepare parameters
            docs_params = {
                'hide_annotations': params.get('hide_document_hover', True),
                'title': params.get('title', 'Document Topic Distribution')
            }
            
            # Sample documents if needed
            sample_size = params.get('sample_size', 2000)
            n_docs = len(documents)
            if n_docs > sample_size:
                indices = np.random.choice(n_docs, sample_size, replace=False)
                sample_docs = [documents[i] for i in indices]
                sample_embeddings = embeddings[indices]
            else:
                sample_docs = documents
                sample_embeddings = embeddings
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                docs_params['custom_labels'] = True
            
            # Generate Plotly figure
            fig = topic_model.visualize_documents(sample_docs, embeddings=sample_embeddings, **docs_params)
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'documents',
                'plotly_data': fig_dict,
                'total_docs': n_docs,
                'sample_size': len(sample_docs)
            }
            
        except Exception as e:
            logger.error(f"Error generating documents visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'documents', 'error': str(e)}
    
    def generate_term_rank_plotly(
        self,
        topic_model,
        topics: List[Dict],
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate term rank visualization using BERTopic's visualize_term_rank()
        Returns Plotly figure as dictionary
        
        Note: visualize_term_rank() does NOT support top_n_topics parameter.
        When there are many topics, it may fail with "inhomogeneous shape" error
        due to different word counts per topic causing numpy array shape mismatches.
        """
        try:
            logger.info("Generating term rank visualization (Plotly)")
            
            # Get valid topics count for logging
            valid_topics = [t for t in topics if t.get('id', -1) != -1]
            num_topics = len(valid_topics)
            
            # Prepare parameters
            # Note: visualize_term_rank() does NOT support top_n_topics parameter
            term_rank_params = {
                'log_scale': params.get('log_scale', False),
                'title': params.get('title', 'Term Score Decline per Topic')
            }
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                term_rank_params['custom_labels'] = True
            
            # Generate Plotly figure
            # Note: If there are too many topics, this may fail with inhomogeneous shape error
            fig = topic_model.visualize_term_rank(**term_rank_params)
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'term_rank',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating term rank visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            
            # If error is related to inhomogeneous shape, provide helpful error message
            error_str = str(e).lower()
            if 'inhomogeneous' in error_str or 'array element with a sequence' in error_str:
                return {
                    'type': 'term_rank',
                    'error': f'Too many topics ({num_topics}) causing shape mismatch. BERTopic\'s visualize_term_rank() has limitations with many topics due to different word counts per topic. This visualization may not work well with more than ~20-30 topics.'
                }
            
            return {'type': 'term_rank', 'error': str(e)}
    
    def generate_topics_over_time_plotly(
        self,
        topic_model,
        topics_over_time_data,
        topics: List[Dict],
        params: Dict[str, Any],
        date_format: str = 'year_only'
    ) -> Dict[str, Any]:
        """
        Generate topics over time visualization using BERTopic's visualize_topics_over_time()
        Returns Plotly figure as dictionary
        
        Args:
            topic_model: BERTopic model
            topics_over_time_data: DataFrame from BERTopic's topics_over_time()
            topics: List of topic dictionaries
            params: Visualization parameters
            date_format: 'year_only' for just year (e.g., "2010"), 'full_date' for YYYY-MM
        """
        try:
            logger.info(f"Generating topics over time visualization (Plotly, date_format={date_format})")
            
            if topics_over_time_data is None:
                return {'type': 'topics_over_time', 'error': 'No topics over time data available'}
            
            import pandas as pd
            
            # Make a copy of the DataFrame to avoid modifying the original
            df = topics_over_time_data.copy()
            
            # Log original timestamp info for debugging
            if 'Timestamp' in df.columns:
                original_timestamps = df['Timestamp'].unique().tolist()
                logger.info(f"Original timestamps type: {type(original_timestamps[0]) if original_timestamps else 'empty'}")
                logger.info(f"Original timestamps sample: {original_timestamps[:5]}")
                
                # Sort by timestamp to ensure correct chronological order
                df = df.sort_values('Timestamp').reset_index(drop=True)
            
            # Prepare parameters
            time_params = {
                'top_n_topics': params.get('top_n_topics'),
                'normalize_frequency': params.get('normalize_frequency', False),
                'title': params.get('title', 'Topics over Time')
            }
            
            # Apply custom labels to topic model first, then enable in visualization
            use_custom = params.get('custom_labels', False)
            if use_custom:
                self._apply_custom_labels(topic_model, topics, True)
                time_params['custom_labels'] = True
            
            # Generate Plotly figure with datetime timestamps (Plotly handles sorting)
            fig = topic_model.visualize_topics_over_time(df, **time_params)
            
            # Modify X-axis date format based on user preference
            if fig is not None:
                # Set X-axis date format
                if date_format == 'year_only':
                    # Show only year
                    fig.update_xaxes(
                        tickformat='%Y',
                        dtick='M12'  # One tick per year
                    )
                else:
                    # Show full date - use actual data timestamps as tick positions
                    # Without tickmode='array', Plotly auto-selects tick positions (e.g., Jan 1st of each year)
                    # which causes dates like "01-01" to appear instead of the actual data dates
                    unique_timestamps = sorted(df['Timestamp'].unique().tolist()) if 'Timestamp' in df.columns else []
                    fig.update_xaxes(
                        tickformat='%Y-%m-%d',
                        tickmode='array',
                        tickvals=unique_timestamps,
                        tickangle=-45  # Angle labels to prevent overlap
                    )
                
                logger.info(f"Applied X-axis date format: {date_format}")
            
            # Convert to dictionary
            fig_dict = self._convert_plotly_figure_to_dict(fig)
            
            return {
                'type': 'topics_over_time',
                'plotly_data': fig_dict
            }
            
        except Exception as e:
            logger.error(f"Error generating topics over time visualization (Plotly): {e}")
            import traceback
            traceback.print_exc()
            return {'type': 'topics_over_time', 'error': str(e)}


# Singleton instance
_viz_service = None


def get_topic_visualization_service() -> TopicVisualizationService:
    """Get visualization service singleton"""
    global _viz_service
    if _viz_service is None:
        _viz_service = TopicVisualizationService()
    return _viz_service
