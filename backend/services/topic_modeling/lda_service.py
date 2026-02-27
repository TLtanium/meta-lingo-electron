"""
LDA Topic Modeling Service
Using Gensim engine for LDA analysis
"""

import logging
import uuid
from datetime import datetime

import numpy as np
from typing import Dict, List, Any, Optional, Tuple

from .lda_preprocess_service import get_lda_preprocess_service
from . import dynamic_evolution

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
            parsed_date = dynamic_evolution.parse_date(date_str, date_format)
            doc_dates.append(parsed_date)
        
        valid_count = sum(1 for d in doc_dates if d is not None)
        logger.debug(f"[LDA Dynamic] Found {valid_count} documents with valid dates out of {len(doc_dates)}")
        
        if valid_count < 2:
            logger.warning("[LDA Dynamic] Not enough documents with valid dates")
            result['has_dynamic'] = False
            result['dynamic_error'] = 'Not enough documents with valid dates'
            # Update cache with Gensim objects preserved for pyLDAvis
            self._results_cache[result['result_id']] = self._preserve_gensim_objects_in_cache(result)
            return result
        
        # Create time slices (full doc_dates; docs without date get slice -1)
        time_slices = dynamic_evolution.create_time_slices(doc_dates, date_format, nr_bins)
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
        
        evolution_data = dynamic_evolution.calculate_topic_evolution(
            doc_topics, doc_dates, time_slices, num_topics
        )
        
        # Calculate sankey data for topic flow
        sankey_data = dynamic_evolution.calculate_sankey_data(
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
