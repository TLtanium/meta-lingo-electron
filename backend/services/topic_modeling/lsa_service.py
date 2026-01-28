"""
LSA (Latent Semantic Analysis) Topic Modeling Service
Uses TruncatedSVD for dimensionality reduction and topic extraction
"""

import logging
import uuid
import time
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer

from .lda_preprocess_service import get_lda_preprocess_service

logger = logging.getLogger(__name__)


class LSAService:
    """Service for LSA topic modeling using TruncatedSVD"""
    
    def __init__(self):
        self.preprocess_service = get_lda_preprocess_service()
        self._results_cache: Dict[str, Dict] = {}
    
    def train_lsa_model(
        self,
        documents: List[str],
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Train LSA model using TruncatedSVD
        
        Args:
            documents: List of preprocessed document strings
            config: LSA configuration
                - num_topics: Number of topics/components (default 10)
                - num_keywords: Number of keywords per topic (default 10)
                - svd_algorithm: SVD algorithm ('randomized', 'arpack') (default 'randomized')
                - max_features: Maximum vocabulary size (default 10000)
                - min_df: Minimum document frequency (default 2)
                - max_df: Maximum document frequency ratio (default 0.95)
                - tol: Tolerance for SVD convergence (default 0.0)
                - random_state: Random seed (default 42)
                - n_iter: Number of iterations for randomized SVD (default 5)
                - n_oversamples: Number of oversamples for randomized SVD (default 10)
                - power_iteration_normalizer: Normalization method ('auto', 'QR', 'LU', 'none')
                
        Returns:
            LSA result dictionary
        """
        start_time = time.time()
        
        num_topics = config.get('num_topics', 10)
        num_keywords = config.get('num_keywords', 10)
        svd_algorithm = config.get('svd_algorithm', 'randomized')
        max_features = config.get('max_features', 10000)
        min_df = config.get('min_df', 2)
        max_df = config.get('max_df', 0.95)
        tol = config.get('tol', 0.0)
        random_state = config.get('random_state', 42)
        n_iter = config.get('n_iter', 5)
        n_oversamples = config.get('n_oversamples', 10)
        power_iteration_normalizer = config.get('power_iteration_normalizer', 'auto')
        
        # Validate documents
        if not documents or len(documents) < 2:
            return {
                'success': False,
                'error': 'Need at least 2 documents for LSA'
            }
        
        # Create TF-IDF document-term matrix
        try:
            vectorizer = TfidfVectorizer(
                min_df=min_df,
                max_df=max_df,
                max_features=max_features,
                token_pattern=r'(?u)\b\w+\b'
            )
            dtm = vectorizer.fit_transform(documents)
            feature_names = vectorizer.get_feature_names_out()
        except ValueError as e:
            logger.error(f"TF-IDF vectorization error: {e}")
            return {
                'success': False,
                'error': f'Vectorization failed: {str(e)}. Try reducing min_df or increasing max_df.'
            }
        
        # Validate vocabulary size
        if len(feature_names) < num_topics:
            return {
                'success': False,
                'error': f'Not enough vocabulary ({len(feature_names)} words) for {num_topics} topics. Try reducing min_df or increasing max_df.'
            }
        
        # Validate matrix dimensions
        if dtm.shape[0] < num_topics or dtm.shape[1] < num_topics:
            return {
                'success': False,
                'error': f'Matrix dimensions ({dtm.shape}) too small for {num_topics} topics.'
            }
        
        # Configure TruncatedSVD parameters
        svd_params = {
            'n_components': num_topics,
            'algorithm': svd_algorithm,
            'tol': tol,
            'random_state': random_state
        }
        
        # Add randomized SVD specific parameters
        if svd_algorithm == 'randomized':
            svd_params['n_iter'] = n_iter
            svd_params['n_oversamples'] = n_oversamples
            svd_params['power_iteration_normalizer'] = power_iteration_normalizer
        
        # Train LSA model
        try:
            model = TruncatedSVD(**svd_params)
            doc_topic_matrix = model.fit_transform(dtm)
        except Exception as e:
            logger.error(f"LSA training error: {e}")
            return {
                'success': False,
                'error': f'LSA training failed: {str(e)}'
            }
        
        # Extract topics with keywords
        topics = []
        for topic_idx in range(num_topics):
            topic_weights = model.components_[topic_idx]
            # Get top keyword indices (use absolute values for ranking)
            top_indices = np.abs(topic_weights).argsort()[-num_keywords:][::-1]
            
            keywords = [
                {
                    'word': feature_names[i],
                    'weight': float(abs(topic_weights[i]))
                }
                for i in top_indices
            ]
            
            topics.append({
                'topic_id': topic_idx,
                'keywords': keywords,
                'total_weight': float(np.sum(np.abs(topic_weights)))
            })
        
        # Calculate explained variance metrics
        individual_variance = model.explained_variance_ratio_.tolist()
        cumulative_variance = np.cumsum(model.explained_variance_ratio_).tolist()
        total_explained_variance = float(np.sum(model.explained_variance_ratio_))
        singular_values_sum = float(np.sum(model.singular_values_))
        
        # Document-topic distribution
        doc_topics = []
        for doc_idx, dist in enumerate(doc_topic_matrix):
            # Normalize to get probability-like distribution
            dist_abs = np.abs(dist)
            dist_sum = np.sum(dist_abs)
            if dist_sum > 0:
                dist_normalized = dist_abs / dist_sum
            else:
                dist_normalized = np.zeros_like(dist_abs)
            
            dominant_topic = int(np.argmax(dist_abs))
            doc_topics.append({
                'doc_id': doc_idx,
                'distribution': dist_normalized.tolist(),
                'dominant_topic': dominant_topic,
                'dominant_topic_weight': float(dist_normalized[dominant_topic])
            })
        
        training_time = time.time() - start_time
        result_id = str(uuid.uuid4())[:8]
        
        result = {
            'success': True,
            'result_id': result_id,
            'num_topics': num_topics,
            'num_documents': len(documents),
            'vocabulary_size': len(feature_names),
            'topics': topics,
            'doc_topics': doc_topics,
            'explained_variance_ratio': total_explained_variance,
            'cumulative_variance': cumulative_variance,
            'individual_variance': individual_variance,
            'singular_values_sum': singular_values_sum,
            'training_time': training_time,
            'config': config,
            'timestamp': datetime.now().isoformat()
        }
        
        # Cache result
        self._results_cache[result_id] = result
        
        return result
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        preprocess_config: Dict[str, Any],
        lsa_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Full LSA analysis pipeline
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            preprocess_config: Preprocessing configuration
            lsa_config: LSA configuration
            
        Returns:
            LSA analysis result
        """
        # Preprocess texts using the shared preprocess service
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
        
        # Get document texts (joined tokens)
        documents = preprocess_result['document_texts']
        
        # Merge min_df/max_df from preprocess_config into lsa_config
        merged_config = lsa_config.copy()
        if 'min_df' in preprocess_config:
            merged_config['min_df'] = preprocess_config['min_df']
        if 'max_df' in preprocess_config:
            merged_config['max_df'] = preprocess_config['max_df']
        
        # Train LSA
        result = self.train_lsa_model(documents, merged_config)
        
        if result.get('success'):
            result['preprocess_stats'] = preprocess_result['stats']
            result['text_ids'] = preprocess_result['text_ids']
        
        return result
    
    def optimize_topics(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        preprocess_config: Dict[str, Any],
        lsa_config: Dict[str, Any],
        topic_range: Tuple[int, int] = (2, 20),
        step: int = 1
    ) -> Dict[str, Any]:
        """
        Find optimal number of topics by testing different values
        and calculating explained variance curve
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language
            preprocess_config: Preprocessing configuration
            lsa_config: Base LSA configuration
            topic_range: (min, max) topic range
            step: Step size
            
        Returns:
            Optimization results with explained variance curve
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
        
        documents = preprocess_result['document_texts']
        
        # Merge min_df/max_df
        merged_config = lsa_config.copy()
        if 'min_df' in preprocess_config:
            merged_config['min_df'] = preprocess_config['min_df']
        if 'max_df' in preprocess_config:
            merged_config['max_df'] = preprocess_config['max_df']
        
        # Create TF-IDF matrix once (for efficiency)
        try:
            vectorizer = TfidfVectorizer(
                min_df=merged_config.get('min_df', 2),
                max_df=merged_config.get('max_df', 0.95),
                max_features=merged_config.get('max_features', 10000),
                token_pattern=r'(?u)\b\w+\b'
            )
            dtm = vectorizer.fit_transform(documents)
        except ValueError as e:
            return {
                'success': False,
                'error': f'Vectorization failed: {str(e)}'
            }
        
        results = []
        min_topics, max_topics = topic_range
        
        # Limit max_topics based on matrix dimensions
        max_allowed = min(dtm.shape) - 1
        if max_topics > max_allowed:
            max_topics = max_allowed
            logger.info(f"Adjusted max_topics to {max_topics} based on matrix dimensions")
        
        for num_topics in range(min_topics, max_topics + 1, step):
            # Configure SVD
            svd_params = {
                'n_components': num_topics,
                'algorithm': merged_config.get('svd_algorithm', 'randomized'),
                'tol': merged_config.get('tol', 0.0),
                'random_state': merged_config.get('random_state', 42)
            }
            
            if svd_params['algorithm'] == 'randomized':
                svd_params['n_iter'] = merged_config.get('n_iter', 5)
                svd_params['n_oversamples'] = merged_config.get('n_oversamples', 10)
            
            try:
                model = TruncatedSVD(**svd_params)
                model.fit(dtm)
                
                # Calculate explained variance
                total_variance = float(np.sum(model.explained_variance_ratio_))
                cumulative = float(np.sum(model.explained_variance_ratio_))
                
                results.append({
                    'num_topics': num_topics,
                    'explained_variance': total_variance,
                    'cumulative_variance': cumulative
                })
                
                logger.info(f"Topics={num_topics}, Explained Variance={total_variance:.4f}")
                
            except Exception as e:
                logger.warning(f"Error at {num_topics} topics: {e}")
                continue
        
        # Find best topic count (e.g., where cumulative variance reaches 90%)
        best_topic_count = None
        for r in results:
            if r['cumulative_variance'] >= 0.9:
                best_topic_count = r['num_topics']
                break
        
        # If no result reaches 90%, use the last one
        if best_topic_count is None and results:
            best_topic_count = results[-1]['num_topics']
        
        return {
            'success': True,
            'results': results,
            'best_topic_count': best_topic_count,
            'topic_range': [min_topics, max_topics],
            'step': step
        }
    
    def get_cached_result(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get cached LSA result by ID"""
        return self._results_cache.get(result_id)
    
    def get_topic_similarity_matrix(self, result_id: str) -> Optional[Dict[str, Any]]:
        """
        Calculate topic similarity matrix for visualization
        
        Args:
            result_id: LSA result ID
            
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
        
        return {
            'matrix': similarity_matrix.tolist(),
            'labels': [f'Topic {i}' for i in range(num_topics)]
        }


# Singleton instance
_lsa_service = None


def get_lsa_service() -> LSAService:
    """Get LSA service singleton"""
    global _lsa_service
    if _lsa_service is None:
        _lsa_service = LSAService()
    return _lsa_service
