"""
LDA Topic Modeling Service
Using Gensim engine for LDA analysis
"""

import logging
import uuid
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

from .lda_preprocess_service import get_lda_preprocess_service

logger = logging.getLogger(__name__)


class LDAService:
    """Service for LDA topic modeling using Gensim"""
    
    def __init__(self):
        self.preprocess_service = get_lda_preprocess_service()
        self._results_cache: Dict[str, Dict] = {}
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        preprocess_config: Dict[str, Any],
        lda_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Full LDA analysis pipeline using Gensim
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            preprocess_config: Preprocessing configuration (includes min_df/max_df)
            lda_config: LDA configuration
            
        Returns:
            LDA analysis result
        """
        # Preprocess texts
        preprocess_result = self.preprocess_service.preprocess_corpus_texts(
            corpus_id,
            text_ids,
            language,
            preprocess_config
        )
        
        if not preprocess_result['documents']:
            return {
                'success': False,
                'error': 'No valid documents after preprocessing'
            }
        
        # Merge min_df/max_df from preprocess_config into lda_config
        merged_lda_config = lda_config.copy()
        if 'min_df' in preprocess_config:
            merged_lda_config['min_df'] = preprocess_config['min_df']
        if 'max_df' in preprocess_config:
            merged_lda_config['max_df'] = preprocess_config['max_df']
        
        # Train LDA using Gensim
        result = self.train_gensim_lda(
            preprocess_result['documents'],  # Token lists for gensim
            merged_lda_config
        )
        
        if result.get('success'):
            result['preprocess_stats'] = preprocess_result['stats']
            result['text_ids'] = preprocess_result['text_ids']
        
        return result
    
    def train_gensim_lda(
        self,
        documents: List[List[str]],
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Train LDA model using Gensim
        
        Args:
            documents: List of tokenized documents (list of token lists)
            config: LDA configuration
                - num_topics: Number of topics (default 10)
                - passes: Number of passes through corpus (default 10)
                - iterations: Max iterations per document (default 50)
                - chunksize: Number of documents per chunk (default 2000)
                - alpha: Document-topic prior ('symmetric', 'asymmetric', 'auto', or list)
                - eta: Topic-word prior ('symmetric', 'auto', or float)
                - random_state: Random seed (default 42)
                - update_every: Update model every N chunks (default 1)
                - eval_every: Evaluate perplexity every N updates (default 10)
                - minimum_probability: Minimum topic probability (default 0.01)
                - top_n_keywords: Number of keywords per topic (default 10)
                
        Returns:
            LDA result dictionary
        """
        try:
            from gensim import corpora
            from gensim.models import LdaModel, CoherenceModel
        except ImportError:
            return {
                'success': False,
                'error': 'Gensim is not installed. Please install gensim>=4.3.0'
            }
        
        num_topics = config.get('num_topics', 10)
        passes = config.get('passes', 10)
        iterations = config.get('iterations', 50)
        chunksize = config.get('chunksize', 2000)
        alpha_config = config.get('alpha', 'symmetric')
        eta_config = config.get('eta', 'symmetric')
        random_state = config.get('random_state', 42)
        update_every = config.get('update_every', 1)
        eval_every = config.get('eval_every', 10)
        minimum_probability = config.get('minimum_probability', 0.01)
        top_n_keywords = config.get('top_n_keywords', 10)
        
        # Filter empty documents
        documents = [doc for doc in documents if doc]
        
        if len(documents) < 2:
            return {
                'success': False,
                'error': 'Need at least 2 documents for LDA'
            }
        
        # Create dictionary and corpus
        try:
            dictionary = corpora.Dictionary(documents)
            
            # Filter extremes (optional, based on config)
            min_df = config.get('min_df', 2)
            max_df_ratio = config.get('max_df', 0.95)
            dictionary.filter_extremes(
                no_below=min_df,
                no_above=max_df_ratio
            )
            
            if len(dictionary) < num_topics:
                return {
                    'success': False,
                    'error': f'Not enough vocabulary ({len(dictionary)} words) for {num_topics} topics'
                }
            
            corpus = [dictionary.doc2bow(doc) for doc in documents]
        except Exception as e:
            logger.error(f"Gensim corpus creation error: {e}")
            return {
                'success': False,
                'error': f'Failed to create corpus: {str(e)}'
            }
        
        # Handle alpha parameter
        if alpha_config == 'asymmetric':
            # Generate asymmetric alpha (decreasing values)
            alpha = np.array([1.0 / (i + np.sqrt(num_topics)) for i in range(num_topics)])
            alpha = alpha / alpha.sum()  # Normalize
        elif alpha_config == 'auto':
            alpha = 'auto'
        elif isinstance(alpha_config, list):
            alpha = alpha_config
        else:
            alpha = 'symmetric'
        
        # Handle eta parameter
        if eta_config == 'auto':
            eta = 'auto'
        elif isinstance(eta_config, (int, float)):
            eta = float(eta_config)
        else:
            eta = 'symmetric'
        
        # Train LDA model
        try:
            lda_model = LdaModel(
                corpus=corpus,
                id2word=dictionary,
                num_topics=num_topics,
                passes=passes,
                iterations=iterations,
                chunksize=chunksize,
                alpha=alpha,
                eta=eta,
                random_state=random_state,
                update_every=update_every,
                eval_every=eval_every,
                minimum_probability=minimum_probability
            )
        except Exception as e:
            logger.error(f"Gensim LDA training error: {e}")
            return {
                'success': False,
                'error': f'LDA training failed: {str(e)}'
            }
        
        # Extract topics with keywords
        topics = []
        for topic_idx in range(num_topics):
            topic_terms = lda_model.get_topic_terms(topic_idx, topn=top_n_keywords)
            top_words = [
                {
                    'word': dictionary[word_id],
                    'weight': float(weight)
                }
                for word_id, weight in topic_terms
            ]
            topics.append({
                'topic_id': topic_idx,
                'keywords': top_words,
                'total_weight': sum(w['weight'] for w in top_words)
            })
        
        # Calculate perplexity
        try:
            log_perplexity = lda_model.log_perplexity(corpus)
            perplexity = float(np.exp(-log_perplexity))
        except Exception as e:
            logger.warning(f"Error calculating perplexity: {e}")
            perplexity = None
        
        # Calculate coherence using u_mass (c_v requires external Wikipedia corpus which blocks in packaged apps)
        try:
            coherence_model = CoherenceModel(
                model=lda_model,
                corpus=corpus,
                dictionary=dictionary,
                coherence='u_mass'
            )
            coherence = float(coherence_model.get_coherence())
        except Exception as e:
            logger.warning(f"Error calculating coherence: {e}")
            coherence = None
        
        # Document-topic distribution
        doc_topics = []
        for doc_idx, bow in enumerate(corpus):
            topic_dist = lda_model.get_document_topics(bow, minimum_probability=0.0)
            dist = [0.0] * num_topics
            for topic_id, prob in topic_dist:
                dist[topic_id] = float(prob)
            
            dominant_topic = int(np.argmax(dist))
            doc_topics.append({
                'doc_id': doc_idx,
                'distribution': dist,
                'dominant_topic': dominant_topic,
                'dominant_topic_weight': float(dist[dominant_topic])
            })
        
        # Generate result ID
        result_id = str(uuid.uuid4())[:8]
        
        result = {
            'success': True,
            'result_id': result_id,
            'num_topics': num_topics,
            'num_documents': len(documents),
            'vocabulary_size': len(dictionary),
            'topics': topics,
            'doc_topics': doc_topics,
            'perplexity': perplexity,
            'coherence': coherence,
            'config': config,
            'timestamp': datetime.now().isoformat()
        }
        
        # Cache result with Gensim objects for pyLDAvis (stored separately to avoid serialization)
        cached_result = result.copy()
        cached_result['_gensim_model'] = lda_model
        cached_result['_gensim_corpus'] = corpus
        cached_result['_gensim_dictionary'] = dictionary
        cached_result['_documents'] = documents  # Token lists
        
        self._results_cache[result_id] = cached_result
        
        return result
    
    def optimize_num_topics(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        preprocess_config: Dict[str, Any],
        lda_config: Dict[str, Any],
        topic_range: Tuple[int, int] = (2, 20),
        step: int = 2
    ) -> Dict[str, Any]:
        """
        Find optimal number of topics by testing different values using Gensim
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language
            preprocess_config: Preprocessing configuration (includes min_df/max_df)
            lda_config: Base LDA configuration
            topic_range: (min, max) topic range
            step: Step size
            
        Returns:
            Optimization results with perplexity/coherence curves
        """
        # Preprocess texts once
        preprocess_result = self.preprocess_service.preprocess_corpus_texts(
            corpus_id,
            text_ids,
            language,
            preprocess_config
        )
        
        if not preprocess_result['documents']:
            return {
                'success': False,
                'error': 'No valid documents after preprocessing'
            }
        
        # Merge min_df/max_df from preprocess_config into lda_config
        merged_lda_config = lda_config.copy()
        if 'min_df' in preprocess_config:
            merged_lda_config['min_df'] = preprocess_config['min_df']
        if 'max_df' in preprocess_config:
            merged_lda_config['max_df'] = preprocess_config['max_df']
        
        results = []
        min_topics, max_topics = topic_range
        
        for num_topics in range(min_topics, max_topics + 1, step):
            config_copy = merged_lda_config.copy()
            config_copy['num_topics'] = num_topics
            
            result = self.train_gensim_lda(
                preprocess_result['documents'],
                config_copy
            )
            
            if result.get('success'):
                results.append({
                    'num_topics': num_topics,
                    'perplexity': result.get('perplexity'),
                    'coherence': result.get('coherence'),
                    'log_likelihood': result.get('log_likelihood')
                })
        
        # Find best by coherence (higher is better)
        best_by_coherence = max(results, key=lambda x: x.get('coherence', float('-inf'))) if results else None
        
        # Find best by perplexity (lower is better)
        best_by_perplexity = min(results, key=lambda x: x.get('perplexity', float('inf'))) if results else None
        
        return {
            'success': True,
            'results': results,
            'best_by_coherence': best_by_coherence,
            'best_by_perplexity': best_by_perplexity,
            'topic_range': topic_range,
            'step': step
        }
    
    def get_cached_result(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get cached LDA result by ID"""
        return self._results_cache.get(result_id)
    
    def get_topic_similarity_matrix(self, result_id: str) -> Optional[Dict[str, Any]]:
        """
        Calculate topic similarity matrix for visualization
        
        Args:
            result_id: LDA result ID
            
        Returns:
            Similarity matrix data
        """
        result = self.get_cached_result(result_id)
        if not result or not result.get('success'):
            return None
        
        topics = result.get('topics', [])
        num_topics = len(topics)
        
        # Build word weight vectors for each topic
        all_words = set()
        for topic in topics:
            for kw in topic['keywords']:
                all_words.add(kw['word'])
        
        word_list = list(all_words)
        word_to_idx = {w: i for i, w in enumerate(word_list)}
        
        # Create topic vectors
        topic_vectors = np.zeros((num_topics, len(word_list)))
        for topic_idx, topic in enumerate(topics):
            for kw in topic['keywords']:
                word_idx = word_to_idx[kw['word']]
                topic_vectors[topic_idx, word_idx] = kw['weight']
        
        # Calculate cosine similarity
        from sklearn.metrics.pairwise import cosine_similarity
        similarity_matrix = cosine_similarity(topic_vectors)
        
        # Format for heatmap visualization
        data = []
        for i in range(num_topics):
            for j in range(num_topics):
                data.append([i, j, float(similarity_matrix[i, j])])
        
        return {
            'type': 'heatmap',
            'data': data,
            'labels': [f'Topic {i}' for i in range(num_topics)],
            'min_value': 0.0,
            'max_value': 1.0
        }
    
    def analyze_dynamic(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        preprocess_config: Dict[str, Any],
        lda_config: Dict[str, Any],
        dynamic_config: Dict[str, Any],
        text_dates: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        LDA analysis with dynamic topic evolution based on document dates using Gensim
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            preprocess_config: Preprocessing configuration
            lda_config: LDA configuration
            dynamic_config: Dynamic analysis configuration
                - enabled: Whether dynamic analysis is enabled
                - date_format: 'year_only' or 'full_date'
                - nr_bins: Number of time bins (optional)
            text_dates: Mapping of text_id to date string
            
        Returns:
            LDA analysis result with dynamic evolution data
        """
        # First run standard LDA analysis
        result = self.analyze(
            corpus_id, text_ids, language, preprocess_config, lda_config
        )
        
        if not result.get('success'):
            return result
        
        # If dynamic analysis is not enabled, return standard result
        if not dynamic_config.get('enabled', False):
            logger.debug("[LDA Dynamic] Dynamic analysis not enabled")
            result['has_dynamic'] = False
            return result
        
        logger.debug(f"[LDA Dynamic] Starting dynamic analysis with config: {dynamic_config}")
        logger.debug(f"[LDA Dynamic] Received {len(text_dates)} text dates")
        
        # Parse dates and create time slices
        date_format = dynamic_config.get('date_format', 'year_only')
        nr_bins = dynamic_config.get('nr_bins')
        
        # Map text_ids to their indices in doc_topics
        text_id_to_idx = {tid: idx for idx, tid in enumerate(result.get('text_ids', text_ids))}
        
        # Parse dates for each document
        doc_dates = []
        for text_id in result.get('text_ids', text_ids):
            date_str = text_dates.get(text_id, '')
            parsed_date = self._parse_date(date_str, date_format)
            doc_dates.append(parsed_date)
        
        # Filter documents with valid dates
        valid_indices = [i for i, d in enumerate(doc_dates) if d is not None]
        logger.debug(f"[LDA Dynamic] Found {len(valid_indices)} documents with valid dates out of {len(doc_dates)}")
        
        if len(valid_indices) < 2:
            logger.warning("[LDA Dynamic] Not enough documents with valid dates")
            result['has_dynamic'] = False
            result['dynamic_error'] = 'Not enough documents with valid dates'
            # Update cache with Gensim objects preserved for pyLDAvis
            self._results_cache[result['result_id']] = self._preserve_gensim_objects_in_cache(result)
            return result
        
        # Create time slices
        valid_dates = [doc_dates[i] for i in valid_indices]
        time_slices = self._create_time_slices(valid_dates, date_format, nr_bins)
        logger.debug(f"[LDA Dynamic] Created {len(time_slices['timestamps'])} time slices: {time_slices['timestamps']}")
        
        if len(time_slices['timestamps']) < 2:
            logger.warning("[LDA Dynamic] Not enough distinct time periods")
            result['has_dynamic'] = False
            result['dynamic_error'] = 'Not enough distinct time periods'
            # Update cache with Gensim objects preserved for pyLDAvis
            self._results_cache[result['result_id']] = self._preserve_gensim_objects_in_cache(result)
            return result
        
        # Calculate topic evolution
        doc_topics = result.get('doc_topics', [])
        num_topics = result.get('num_topics', 10)
        
        evolution_data = self._calculate_topic_evolution(
            doc_topics, doc_dates, time_slices, num_topics
        )
        
        # Calculate sankey data for topic flow
        sankey_data = self._calculate_sankey_data(
            doc_topics, doc_dates, time_slices, num_topics
        )
        
        result['has_dynamic'] = True
        result['dynamic_config'] = dynamic_config
        result['topic_evolution'] = evolution_data
        result['sankey_data'] = sankey_data
        result['time_slices'] = time_slices
        
        logger.debug(f"[LDA Dynamic] SUCCESS - has_dynamic: True, evolution_series: {len(evolution_data.get('series', []))}, sankey_nodes: {len(sankey_data.get('nodes', []))}")
        
        # Update cache - preserve Gensim objects from original analysis for pyLDAvis
        self._results_cache[result['result_id']] = self._preserve_gensim_objects_in_cache(result)
        
        return result
    
    def _preserve_gensim_objects_in_cache(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Create cached version with Gensim objects preserved for pyLDAvis visualization
        
        Returns a copy of result with Gensim objects from original cache, 
        suitable for storing in cache (not for API response)
        """
        result_id = result.get('result_id')
        cached_result = result.copy()
        
        if result_id and result_id in self._results_cache:
            cached = self._results_cache[result_id]
            # Copy Gensim objects to the new cached result
            cached_result['_gensim_model'] = cached.get('_gensim_model')
            cached_result['_gensim_corpus'] = cached.get('_gensim_corpus')
            cached_result['_gensim_dictionary'] = cached.get('_gensim_dictionary')
            cached_result['_documents'] = cached.get('_documents')
        
        return cached_result
    
    def _parse_date(self, date_str: str, date_format: str) -> Optional[str]:
        """Parse date string to normalized format
        
        Args:
            date_str: Date string from corpus metadata
            date_format: 'year_only' for just year (e.g., "2020"), 
                        'full_date' for complete date (e.g., "2020-03-15")
        
        Returns:
            Formatted date string or None if parsing fails
        """
        if not date_str:
            return None
        
        try:
            # Try different date formats
            for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%Y%m%d', '%Y']:
                try:
                    dt = datetime.strptime(date_str.strip(), fmt)
                    if date_format == 'year_only':
                        return str(dt.year)
                    else:
                        # full_date: return complete date format
                        return dt.strftime('%Y-%m-%d')
                except ValueError:
                    continue
            
            # Try to extract year only
            import re
            year_match = re.search(r'(\d{4})', date_str)
            if year_match:
                return year_match.group(1)
            
            return None
        except Exception:
            return None
    
    def _create_time_slices(
        self,
        dates: List[str],
        date_format: str,
        nr_bins: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create time slices from document dates"""
        # Get unique sorted timestamps
        unique_dates = sorted(set(d for d in dates if d))
        
        if nr_bins and len(unique_dates) > nr_bins:
            # Bin dates into nr_bins groups
            step = len(unique_dates) // nr_bins
            binned_dates = [unique_dates[i * step] for i in range(nr_bins)]
            if unique_dates[-1] not in binned_dates:
                binned_dates.append(unique_dates[-1])
            unique_dates = binned_dates
        
        # Create mapping from date to slice index
        date_to_slice = {d: i for i, d in enumerate(unique_dates)}
        
        # Map each document date to nearest slice
        doc_slices = []
        for d in dates:
            if d in date_to_slice:
                doc_slices.append(date_to_slice[d])
            else:
                # Find nearest slice
                nearest_idx = 0
                for i, ud in enumerate(unique_dates):
                    if ud <= d:
                        nearest_idx = i
                doc_slices.append(nearest_idx)
        
        return {
            'timestamps': unique_dates,
            'doc_slices': doc_slices,
            'num_slices': len(unique_dates)
        }
    
    def _calculate_topic_evolution(
        self,
        doc_topics: List[Dict],
        doc_dates: List[Optional[str]],
        time_slices: Dict[str, Any],
        num_topics: int
    ) -> Dict[str, Any]:
        """Calculate topic distribution evolution over time"""
        timestamps = time_slices['timestamps']
        doc_slices = time_slices['doc_slices']
        num_slices = len(timestamps)
        
        # Initialize topic counts per time slice
        topic_counts = np.zeros((num_slices, num_topics))
        slice_doc_counts = np.zeros(num_slices)
        
        # Aggregate topic weights per time slice
        for doc_idx, doc in enumerate(doc_topics):
            if doc_idx < len(doc_slices):
                slice_idx = doc_slices[doc_idx]
                dist = doc.get('distribution', [])
                if dist:
                    for topic_idx, weight in enumerate(dist):
                        if topic_idx < num_topics:
                            topic_counts[slice_idx, topic_idx] += weight
                    slice_doc_counts[slice_idx] += 1
        
        # Normalize by document count per slice
        for slice_idx in range(num_slices):
            if slice_doc_counts[slice_idx] > 0:
                topic_counts[slice_idx] /= slice_doc_counts[slice_idx]
        
        # Build series data for visualization
        series = []
        for topic_idx in range(num_topics):
            series.append({
                'topic_id': topic_idx,
                'topic_name': f'Topic {topic_idx}',
                'values': topic_counts[:, topic_idx].tolist()
            })
        
        return {
            'type': 'topics_over_time',
            'timestamps': timestamps,
            'series': series,
            'doc_counts': slice_doc_counts.tolist()
        }
    
    def _calculate_sankey_data(
        self,
        doc_topics: List[Dict],
        doc_dates: List[Optional[str]],
        time_slices: Dict[str, Any],
        num_topics: int
    ) -> Dict[str, Any]:
        """Calculate sankey diagram data for topic flow between time slices"""
        timestamps = time_slices['timestamps']
        doc_slices = time_slices['doc_slices']
        num_slices = len(timestamps)
        
        if num_slices < 2:
            return {'nodes': [], 'links': []}
        
        # Create nodes for each topic at each time slice
        nodes = []
        node_id = 0
        node_map = {}  # (slice_idx, topic_idx) -> node_id
        
        for slice_idx, timestamp in enumerate(timestamps):
            for topic_idx in range(num_topics):
                nodes.append({
                    'id': node_id,
                    'name': f'T{topic_idx}',
                    'timestamp': timestamp,
                    'topic_id': topic_idx,
                    'slice_idx': slice_idx
                })
                node_map[(slice_idx, topic_idx)] = node_id
                node_id += 1
        
        # Calculate topic transitions between consecutive time slices
        # Count documents that move from topic A at time T to topic B at time T+1
        topic_transitions = np.zeros((num_slices - 1, num_topics, num_topics))
        
        # Group documents by time slice
        slice_docs = [[] for _ in range(num_slices)]
        for doc_idx, doc in enumerate(doc_topics):
            if doc_idx < len(doc_slices):
                slice_idx = doc_slices[doc_idx]
                slice_docs[slice_idx].append((doc_idx, doc))
        
        # For simplicity, calculate topic flow based on topic distribution changes
        # This represents how topics "flow" between time periods
        for slice_idx in range(num_slices - 1):
            curr_topic_weights = np.zeros(num_topics)
            next_topic_weights = np.zeros(num_topics)
            
            # Aggregate current slice topic weights
            for _, doc in slice_docs[slice_idx]:
                dist = doc.get('distribution', [])
                for t_idx, w in enumerate(dist):
                    if t_idx < num_topics:
                        curr_topic_weights[t_idx] += w
            
            # Aggregate next slice topic weights
            for _, doc in slice_docs[slice_idx + 1]:
                dist = doc.get('distribution', [])
                for t_idx, w in enumerate(dist):
                    if t_idx < num_topics:
                        next_topic_weights[t_idx] += w
            
            # Normalize
            if curr_topic_weights.sum() > 0:
                curr_topic_weights /= curr_topic_weights.sum()
            if next_topic_weights.sum() > 0:
                next_topic_weights /= next_topic_weights.sum()
            
            # Create flow based on weight products (simplified model)
            for from_topic in range(num_topics):
                for to_topic in range(num_topics):
                    # Weight flow proportional to both topic weights
                    flow = curr_topic_weights[from_topic] * next_topic_weights[to_topic]
                    topic_transitions[slice_idx, from_topic, to_topic] = flow
        
        # Build links
        links = []
        for slice_idx in range(num_slices - 1):
            for from_topic in range(num_topics):
                for to_topic in range(num_topics):
                    flow_value = topic_transitions[slice_idx, from_topic, to_topic]
                    if flow_value > 0.01:  # Filter small flows
                        source_node = node_map[(slice_idx, from_topic)]
                        target_node = node_map[(slice_idx + 1, to_topic)]
                        links.append({
                            'source': source_node,
                            'target': target_node,
                            'value': float(flow_value),
                            'from_topic': from_topic,
                            'to_topic': to_topic,
                            'from_timestamp': timestamps[slice_idx],
                            'to_timestamp': timestamps[slice_idx + 1]
                        })
        
        return {
            'nodes': nodes,
            'links': links,
            'timestamps': timestamps,
            'num_topics': num_topics
        }
    
    def get_evolution_data(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get topic evolution data for visualization"""
        result = self.get_cached_result(result_id)
        if not result or not result.get('has_dynamic'):
            return None
        return result.get('topic_evolution')
    
    def get_sankey_data(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get sankey diagram data for visualization"""
        result = self.get_cached_result(result_id)
        if not result or not result.get('has_dynamic'):
            return None
        return result.get('sankey_data')


# Singleton instance
_lda_service = None


def get_lda_service() -> LDAService:
    """Get LDA service singleton"""
    global _lda_service
    if _lda_service is None:
        _lda_service = LDAService()
    return _lda_service
