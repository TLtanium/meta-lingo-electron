"""
NMF (Non-negative Matrix Factorization) Topic Modeling Service
Uses sklearn NMF for topic extraction from document-term matrix
"""

import logging
import uuid
import time
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from sklearn.decomposition import NMF
from sklearn.feature_extraction.text import TfidfVectorizer

from .lda_preprocess_service import get_lda_preprocess_service

logger = logging.getLogger(__name__)


class NMFService:
    """Service for NMF topic modeling using sklearn"""
    
    def __init__(self):
        self.preprocess_service = get_lda_preprocess_service()
        self._results_cache: Dict[str, Dict] = {}
    
    def _calculate_sparsity(self, W_matrix: np.ndarray, H_matrix: np.ndarray) -> float:
        """
        Calculate sparsity metric for NMF matrices
        
        Args:
            W_matrix: Document-topic matrix
            H_matrix: Topic-word matrix
            
        Returns:
            Average sparsity ratio (0-1)
        """
        try:
            W_sparsity = np.sum(W_matrix == 0) / W_matrix.size
            H_sparsity = np.sum(H_matrix == 0) / H_matrix.size
            return float((W_sparsity + H_sparsity) / 2)
        except Exception:
            return 0.0
    
    def train_nmf_model(
        self,
        documents: List[str],
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Train NMF model using sklearn
        
        Args:
            documents: List of preprocessed document strings
            config: NMF configuration
                - num_topics: Number of topics/components (default 10)
                - num_keywords: Number of keywords per topic (default 10)
                - init: Initialization method ('nndsvd', 'nndsvda', 'nndsvdar', 'random')
                - solver: Solver ('cd', 'mu')
                - max_iter: Maximum iterations (default 200)
                - tol: Tolerance for convergence (default 1e-4)
                - alpha_W: Regularization for W matrix (default 0.0)
                - alpha_H: Regularization for H matrix (default 0.0)
                - l1_ratio: L1/L2 regularization ratio (default 0.0)
                - beta_loss: Beta divergence loss ('frobenius', 'kullback-leibler', 'itakura-saito')
                - shuffle: Shuffle data in solver (default False)
                - random_state: Random seed (default 42)
                - max_features: Maximum vocabulary size (default 10000)
                - min_df: Minimum document frequency (default 2)
                - max_df: Maximum document frequency ratio (default 0.95)
                
        Returns:
            NMF result dictionary
        """
        start_time = time.time()
        
        # Extract config parameters
        num_topics = config.get('num_topics', 10)
        num_keywords = config.get('num_keywords', 10)
        init = config.get('init', 'nndsvd')
        solver = config.get('solver', 'cd')
        max_iter = config.get('max_iter', 200)
        tol = config.get('tol', 1e-4)
        alpha_W = config.get('alpha_W', 0.0)
        alpha_H = config.get('alpha_H', 0.0)
        l1_ratio = config.get('l1_ratio', 0.0)
        beta_loss = config.get('beta_loss', 'frobenius')
        shuffle = config.get('shuffle', False)
        random_state = config.get('random_state', 42)
        max_features = config.get('max_features', 10000)
        min_df = config.get('min_df', 2)
        max_df = config.get('max_df', 0.95)
        
        # Validate documents
        if not documents or len(documents) < 2:
            return {
                'success': False,
                'error': 'Need at least 2 documents for NMF'
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
        
        # Configure NMF parameters
        nmf_params = {
            'n_components': num_topics,
            'init': init,
            'solver': solver,
            'max_iter': max_iter,
            'tol': tol,
            'alpha_W': alpha_W,
            'alpha_H': alpha_H,
            'l1_ratio': l1_ratio,
            'random_state': random_state
        }
        
        # Add solver-specific parameters
        if solver == 'mu':
            nmf_params['beta_loss'] = beta_loss
        if solver == 'cd':
            nmf_params['shuffle'] = shuffle
        
        # Train NMF model
        try:
            model = NMF(**nmf_params)
            W_matrix = model.fit_transform(dtm)  # Document-topic matrix
            H_matrix = model.components_  # Topic-word matrix
        except Exception as e:
            logger.error(f"NMF training error: {e}")
            return {
                'success': False,
                'error': f'NMF training failed: {str(e)}'
            }
        
        # Extract topics with keywords
        topics = []
        for topic_idx in range(num_topics):
            topic_weights = H_matrix[topic_idx]
            # Get top keyword indices
            top_indices = topic_weights.argsort()[-num_keywords:][::-1]
            
            # Normalize weights for display
            total_weight = np.sum(topic_weights)
            if total_weight > 0:
                normalized_weights = topic_weights / total_weight
            else:
                normalized_weights = topic_weights
            
            keywords = [
                {
                    'word': feature_names[i],
                    'weight': float(normalized_weights[i])
                }
                for i in top_indices
            ]
            
            topics.append({
                'topic_id': topic_idx,
                'keywords': keywords,
                'total_weight': float(total_weight)
            })
        
        # Calculate metrics
        reconstruction_error = float(model.reconstruction_err_)
        n_iter = int(model.n_iter_)
        sparsity = self._calculate_sparsity(W_matrix, H_matrix)
        
        # Document-topic distribution
        doc_topics = []
        for doc_idx, dist in enumerate(W_matrix):
            # Normalize to get probability-like distribution
            dist_sum = np.sum(dist)
            if dist_sum > 0:
                dist_normalized = dist / dist_sum
            else:
                dist_normalized = np.zeros_like(dist)
            
            dominant_topic = int(np.argmax(dist))
            doc_topics.append({
                'doc_id': doc_idx,
                'distribution': dist_normalized.tolist(),
                'dominant_topic': dominant_topic,
                'dominant_topic_weight': float(dist_normalized[dominant_topic]) if dist_sum > 0 else 0.0
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
            'reconstruction_error': reconstruction_error,
            'sparsity': sparsity,
            'n_iter': n_iter,
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
        nmf_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Full NMF analysis pipeline
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            preprocess_config: Preprocessing configuration
            nmf_config: NMF configuration
            
        Returns:
            NMF analysis result
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
        
        # Merge min_df/max_df from preprocess_config into nmf_config
        merged_config = nmf_config.copy()
        if 'min_df' in preprocess_config:
            merged_config['min_df'] = preprocess_config['min_df']
        if 'max_df' in preprocess_config:
            merged_config['max_df'] = preprocess_config['max_df']
        
        # Train NMF
        result = self.train_nmf_model(documents, merged_config)
        
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
        nmf_config: Dict[str, Any],
        topic_range: Tuple[int, int] = (2, 20),
        step: int = 1
    ) -> Dict[str, Any]:
        """
        Find optimal number of topics by testing different values
        and calculating reconstruction error curve
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language
            preprocess_config: Preprocessing configuration
            nmf_config: Base NMF configuration
            topic_range: (min, max) topic range
            step: Step size
            
        Returns:
            Optimization results with reconstruction error curve
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
        merged_config = nmf_config.copy()
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
            # Configure NMF
            nmf_params = {
                'n_components': num_topics,
                'init': merged_config.get('init', 'nndsvd'),
                'solver': merged_config.get('solver', 'cd'),
                'max_iter': merged_config.get('max_iter', 200),
                'tol': merged_config.get('tol', 1e-4),
                'alpha_W': merged_config.get('alpha_W', 0.0),
                'alpha_H': merged_config.get('alpha_H', 0.0),
                'l1_ratio': merged_config.get('l1_ratio', 0.0),
                'random_state': merged_config.get('random_state', 42)
            }
            
            # Add solver-specific parameters
            solver = merged_config.get('solver', 'cd')
            if solver == 'mu':
                nmf_params['beta_loss'] = merged_config.get('beta_loss', 'frobenius')
            if solver == 'cd':
                nmf_params['shuffle'] = merged_config.get('shuffle', False)
            
            try:
                model = NMF(**nmf_params)
                model.fit(dtm)
                
                # Get reconstruction error (lower is better)
                reconstruction_error = float(model.reconstruction_err_)
                
                results.append({
                    'num_topics': num_topics,
                    'reconstruction_error': reconstruction_error
                })
                
                logger.info(f"Topics={num_topics}, Reconstruction Error={reconstruction_error:.4f}")
                
            except Exception as e:
                logger.warning(f"Error at {num_topics} topics: {e}")
                continue
        
        # Find best topic count (minimum reconstruction error)
        best_topic_count = None
        min_error = float('inf')
        
        if results:
            for r in results:
                if r['reconstruction_error'] < min_error:
                    min_error = r['reconstruction_error']
                    best_topic_count = r['num_topics']
        
        return {
            'success': True,
            'results': results,
            'best_topic_count': best_topic_count,
            'best_reconstruction_error': min_error if best_topic_count else None,
            'topic_range': [min_topics, max_topics],
            'step': step
        }
    
    def get_cached_result(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get cached NMF result by ID"""
        return self._results_cache.get(result_id)
    
    def get_topic_similarity_matrix(self, result_id: str) -> Optional[Dict[str, Any]]:
        """
        Calculate topic similarity matrix for visualization
        
        Args:
            result_id: NMF result ID
            
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
_nmf_service = None


def get_nmf_service() -> NMFService:
    """Get NMF service singleton"""
    global _nmf_service
    if _nmf_service is None:
        _nmf_service = NMFService()
    return _nmf_service
