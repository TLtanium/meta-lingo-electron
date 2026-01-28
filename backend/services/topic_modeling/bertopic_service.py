"""
BERTopic Analysis Service
Core topic modeling with configurable dimensionality reduction, clustering, and vectorization
"""

import logging
import os
import time
import pickle
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DATA_DIR, MODELS_DIR, TOPIC_MODELING_DIR

logger = logging.getLogger(__name__)

# Fixed SBERT model path for topic representation
SBERT_MODEL_PATH = MODELS_DIR / "sentence_embeddings" / "paraphrase-multilingual-MiniLM-L12-v2"


class BERTopicService:
    """Service for BERTopic-based topic modeling"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.results_dir = TOPIC_MODELING_DIR / "results"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self._embedding_model = None
    
    def _load_embedding_model(self):
        """Lazy load the SBERT model for topic representation"""
        if self._embedding_model is not None:
            return self._embedding_model
        
        try:
            from sentence_transformers import SentenceTransformer
            
            if not SBERT_MODEL_PATH.exists():
                raise ValueError(f"SBERT model not found at {SBERT_MODEL_PATH}")
            
            logger.info(f"Loading SBERT model for topic representation")
            self._embedding_model = SentenceTransformer(str(SBERT_MODEL_PATH))
            return self._embedding_model
            
        except ImportError:
            raise ImportError("sentence-transformers not installed")
    
    def _create_dim_reduction_model(self, method: str, params: Dict[str, Any]):
        """Create dimensionality reduction model"""
        if method == "UMAP":
            from umap import UMAP
            
            default_params = {
                'n_neighbors': 15,
                'n_components': 5,
                'min_dist': 0.1,
                'metric': 'cosine',
                'random_state': 42,
                'low_memory': True
            }
            default_params.update(params)
            
            return UMAP(**default_params)
        
        elif method == "PCA":
            from sklearn.decomposition import PCA
            
            default_params = {
                'n_components': 50,
                'svd_solver': 'auto',
                'whiten': False,
                'random_state': 42
            }
            default_params.update(params)
            
            return PCA(**default_params)
        
        else:
            raise ValueError(f"Unknown dimensionality reduction method: {method}")
    
    def _create_clustering_model(self, method: str, params: Dict[str, Any], calculate_probabilities: bool = False):
        """Create clustering model"""
        if method == "HDBSCAN":
            from hdbscan import HDBSCAN
            from sklearn.metrics.pairwise import cosine_distances
            
            # Only use valid HDBSCAN parameters
            valid_hdbscan_params = {
                'min_cluster_size': params.get('min_cluster_size', 5),
                'min_samples': params.get('min_samples'),
                'metric': params.get('metric', 'euclidean'),
                'cluster_selection_method': params.get('cluster_selection_method', 'eom'),
                'allow_single_cluster': params.get('allow_single_cluster', False),
            }
            
            # Handle alpha specially - ensure it's a valid positive float
            alpha_value = params.get('alpha', 1.0)
            try:
                alpha_value = float(alpha_value) if alpha_value is not None else 1.0
                if alpha_value <= 0:
                    alpha_value = 1.0
            except (TypeError, ValueError):
                alpha_value = 1.0
            valid_hdbscan_params['alpha'] = alpha_value
            
            logger.info(f"HDBSCAN params: {valid_hdbscan_params}")
            
            # Handle cosine metric
            if valid_hdbscan_params.get('metric') == 'cosine':
                valid_hdbscan_params['metric'] = cosine_distances
            
            # Enable probability calculation if needed
            if calculate_probabilities:
                valid_hdbscan_params['prediction_data'] = True
            
            return HDBSCAN(**valid_hdbscan_params)
        
        elif method == "BIRCH":
            from sklearn.cluster import Birch
            
            default_params = {
                'threshold': 0.5,
                'branching_factor': 50,
                'n_clusters': 3
            }
            default_params.update(params)
            
            return Birch(**default_params)
        
        elif method == "K-Means":
            from sklearn.cluster import KMeans
            
            default_params = {
                'n_clusters': 8,
                'init': 'k-means++',
                'max_iter': 300,
                'tol': 0.0001,
                'algorithm': 'lloyd',
                'random_state': 42
            }
            default_params.update(params)
            
            return KMeans(**default_params)
        
        else:
            raise ValueError(f"Unknown clustering method: {method}")
    
    def _create_vectorizer_model(self, vectorizer_type: str, params: Dict[str, Any], language: str = 'english'):
        """Create vectorizer model with language-aware tokenization
        
        Args:
            vectorizer_type: CountVectorizer or TfidfVectorizer
            params: Vectorizer parameters
            language: Corpus language (chinese/english/etc.)
        """
        from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
        
        default_params = {
            'min_df': 1,
            'max_df': 1.0,
            'ngram_range': (1, 1),
            'stop_words': None
        }
        default_params.update(params)
        
        # FIX: max_df=1 (int) means "appear in exactly 1 doc", not "100%"
        # Convert integer 1 to float 1.0 to mean "100% of documents"
        if default_params.get('max_df') == 1 and isinstance(default_params.get('max_df'), int):
            default_params['max_df'] = 1.0
            logger.info("Converted max_df=1 (int) to max_df=1.0 (float) for proper interpretation")
        
        # Handle ngram_range if passed as list
        if isinstance(default_params.get('ngram_range'), list):
            default_params['ngram_range'] = tuple(default_params['ngram_range'])
        
        # For Chinese, use jieba tokenizer
        if language == 'chinese':
            tokenizer = self._get_chinese_tokenizer()
            default_params['tokenizer'] = tokenizer
            # Don't use sklearn's built-in stop_words for Chinese
            # Handle stop_words separately with Chinese stopwords
            stop_words_param = default_params.pop('stop_words', None)
            if stop_words_param and stop_words_param != 'none':
                # Load Chinese stopwords
                chinese_stopwords = self._load_chinese_stopwords()
                default_params['stop_words'] = chinese_stopwords
        
        if vectorizer_type == "CountVectorizer":
            return CountVectorizer(**default_params)
        elif vectorizer_type == "TfidfVectorizer":
            return TfidfVectorizer(**default_params)
        else:
            raise ValueError(f"Unknown vectorizer type: {vectorizer_type}")
    
    def _get_chinese_tokenizer(self):
        """Get jieba tokenizer function for Chinese text"""
        import jieba
        
        def chinese_tokenizer(text):
            """Tokenize Chinese text using jieba"""
            # Use jieba cut for word segmentation
            tokens = jieba.lcut(text)
            # Filter out single characters and whitespace
            return [token for token in tokens if len(token.strip()) > 1]
        
        return chinese_tokenizer
    
    def _load_chinese_stopwords(self) -> list:
        """Load Chinese stopwords from NLTK data"""
        stopwords_file = MODELS_DIR / "nltk" / "corpora" / "stopwords" / "chinese"
        
        stopwords = []
        if stopwords_file.exists():
            try:
                with open(stopwords_file, 'r', encoding='utf-8') as f:
                    stopwords = [word.strip() for word in f if word.strip()]
                logger.info(f"Loaded {len(stopwords)} Chinese stopwords")
            except Exception as e:
                logger.warning(f"Error loading Chinese stopwords: {e}")
        
        return stopwords if stopwords else None
    
    def _create_representation_model(self, model_type: str, params: Dict[str, Any]):
        """Create topic representation model
        
        Note: Ollama is handled as post-processing, not as a BERTopic representation model.
        Users can apply Ollama naming after analysis via the Ollama naming service.
        """
        if not model_type:
            return None
        
        try:
            if model_type == "KeyBERTInspired":
                from bertopic.representation import KeyBERTInspired
                # Filter valid params for KeyBERTInspired
                valid_params = {k: v for k, v in params.items() 
                              if k in ['top_n_words', 'nr_repr_docs', 'nr_samples', 'nr_candidate_words', 'random_state']}
                return KeyBERTInspired(**valid_params)
            
            elif model_type == "MaximalMarginalRelevance":
                from bertopic.representation import MaximalMarginalRelevance
                # Filter valid params for MMR
                valid_params = {k: v for k, v in params.items() 
                              if k in ['diversity', 'top_n_words']}
                return MaximalMarginalRelevance(**valid_params)
            
            elif model_type == "PartOfSpeech":
                from bertopic.representation import PartOfSpeech
                # Filter valid params for PartOfSpeech
                valid_params = {}
                if 'model' in params and params['model']:
                    valid_params['model'] = params['model']
                if 'top_n_words' in params:
                    valid_params['top_n_words'] = params['top_n_words']
                if 'pos_patterns' in params:
                    valid_params['pos_patterns'] = params['pos_patterns']
                return PartOfSpeech(**valid_params)
            
            elif model_type == "ZeroShotClassification":
                from bertopic.representation import ZeroShotClassification
                # Filter valid params
                valid_params = {}
                if 'candidate_topics' in params and params['candidate_topics']:
                    valid_params['candidate_topics'] = params['candidate_topics']
                if 'model' in params:
                    valid_params['model'] = params['model']
                if 'min_prob' in params:
                    valid_params['min_prob'] = params['min_prob']
                return ZeroShotClassification(**valid_params)
            
            elif model_type == "Ollama":
                # Ollama is not a true representation_model in BERTopic
                # It should be applied as post-processing after analysis via the Ollama naming service
                # Return None here - the frontend handles Ollama naming separately
                logger.info("Ollama representation model selected - will be applied as post-processing")
                return None
            
            else:
                logger.warning(f"Unknown representation model: {model_type}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating representation model: {e}")
            return None
    
    def analyze(
        self,
        embeddings: np.ndarray,
        documents: List[str],
        config: Dict[str, Any],
        timestamps: Optional[List[int]] = None,
        dynamic_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """
        Perform BERTopic analysis
        
        Args:
            embeddings: Document embeddings
            documents: List of documents
            config: Analysis configuration
                - dim_reduction: {method, params}
                - clustering: {method, params}
                - vectorizer: {type, params}
                - representation_model: {type, params}
                - reduce_outliers: {enabled, strategy, threshold}
                - calculate_probabilities: bool
            timestamps: Optional list of timestamps for dynamic topic analysis
            dynamic_config: Optional dynamic topic configuration
                - nr_bins: number of time bins
                - evolution_tuning: bool
                - global_tuning: bool
            language: Corpus language for tokenization (chinese/english/etc.)
                
        Returns:
            Analysis results
        """
        from bertopic import BERTopic
        
        logger.info(f"Starting BERTopic analysis on {len(documents)} documents (language: {language})")
        start_time = time.time()
        
        # Extract config
        dim_config = config.get('dim_reduction', {'method': 'UMAP', 'params': {}})
        cluster_config = config.get('clustering', {'method': 'HDBSCAN', 'params': {}})
        vec_config = config.get('vectorizer', {'type': 'CountVectorizer', 'params': {}})
        repr_config = config.get('representation_model', {})
        outlier_config = config.get('reduce_outliers', {'enabled': False})
        calculate_probs = config.get('calculate_probabilities', False)
        
        # Debug: Log outlier config
        logger.info(f"Outlier config received: {outlier_config}")
        
        # Create models
        dim_model = self._create_dim_reduction_model(
            dim_config.get('method', 'UMAP'),
            dim_config.get('params', {})
        )
        
        cluster_model = self._create_clustering_model(
            cluster_config.get('method', 'HDBSCAN'),
            cluster_config.get('params', {}),
            calculate_probs or (outlier_config.get('enabled') and outlier_config.get('strategy') == 'probabilities')
        )
        
        # Create vectorizer with language-aware tokenization
        vectorizer_model = self._create_vectorizer_model(
            vec_config.get('type', 'CountVectorizer'),
            vec_config.get('params', {}),
            language=language
        )
        
        representation_model = None
        if repr_config.get('type'):
            representation_model = self._create_representation_model(
                repr_config.get('type'),
                repr_config.get('params', {})
            )
        
        # Load embedding model
        embedding_model = self._load_embedding_model()
        
        # Create BERTopic model
        topic_model = BERTopic(
            embedding_model=embedding_model,
            umap_model=dim_model,
            hdbscan_model=cluster_model if cluster_config.get('method') == 'HDBSCAN' else None,
            vectorizer_model=vectorizer_model,
            representation_model=representation_model,
            calculate_probabilities=calculate_probs,
            top_n_words=20  # Return up to 20 keywords per topic
        )
        
        # Set cluster model for non-HDBSCAN methods
        if cluster_config.get('method') != 'HDBSCAN':
            topic_model.hdbscan_model = cluster_model
        
        # Fit transform
        logger.info("Running fit_transform...")
        topics, probs = topic_model.fit_transform(documents, embeddings=embeddings)
        
        # Save original topics before any outlier reduction (for estimation)
        original_topics = list(topics)
        
        # Get topic info
        topic_info = topic_model.get_topic_info()
        
        # Handle outlier reduction
        logger.info(f"Outlier reduction enabled: {outlier_config.get('enabled', False)}, strategy: {outlier_config.get('strategy')}, threshold: {outlier_config.get('threshold')}")
        if outlier_config.get('enabled', False):
            logger.info("Reducing outliers...")
            original_outliers = sum(1 for t in topics if t == -1)
            
            new_topics = topic_model.reduce_outliers(
                documents,
                topics,
                embeddings=embeddings,
                probabilities=probs,
                strategy=outlier_config.get('strategy', 'distributions'),
                threshold=outlier_config.get('threshold', 0.0)
            )
            
            topic_model.topics_ = new_topics
            topic_model.update_topics(documents, topics=new_topics)
            topics = new_topics
            topic_info = topic_model.get_topic_info()
            
            new_outliers = sum(1 for t in topics if t == -1)
            logger.info(f"Outliers reduced from {original_outliers} to {new_outliers}")
        
        # Dynamic topic analysis (topics over time)
        topics_over_time_data = None
        if timestamps is not None and len(timestamps) == len(documents):
            # Filter out documents without valid timestamps (timestamp <= 0 means no date)
            valid_indices = [i for i, t in enumerate(timestamps) if t > 0]
            valid_timestamps_days = [timestamps[i] for i in valid_indices]
            valid_documents = [documents[i] for i in valid_indices]
            
            if len(valid_timestamps_days) >= 2 and len(set(valid_timestamps_days)) >= 2:
                logger.info(f"Running dynamic topic analysis with {len(valid_documents)}/{len(documents)} documents that have valid dates...")
                try:
                    # Convert days-since-epoch to date strings for BERTopic
                    # IMPORTANT: Use string format with datetime_format parameter to preserve exact dates
                    # If we pass datetime objects with nr_bins, BERTopic creates equal-interval bins
                    # which loses the original date granularity (all dates become bin boundaries like 01-01)
                    from datetime import datetime, timedelta
                    epoch = datetime(1970, 1, 1)
                    
                    # Convert to YYYY-MM-DD string format for BERTopic
                    valid_timestamps_str = []
                    for d in valid_timestamps_days:
                        date_obj = epoch + timedelta(days=d)
                        valid_timestamps_str.append(date_obj.strftime('%Y-%m-%d'))
                    
                    # Debug: log the conversion
                    logger.info(f"Days since epoch sample: {valid_timestamps_days[:5]}")
                    logger.info(f"Converted date strings sample: {valid_timestamps_str[:5]}")
                    logger.info(f"Converted timestamps: first={valid_timestamps_str[0] if valid_timestamps_str else 'N/A'}, last={valid_timestamps_str[-1] if valid_timestamps_str else 'N/A'}")
                    
                    # Filter dynamic config params
                    dynamic_params = {}
                    if dynamic_config:
                        # Only set nr_bins if explicitly provided by user
                        # When nr_bins is None, BERTopic groups by the original date strings
                        # which preserves the exact date granularity
                        if dynamic_config.get('nr_bins') is not None:
                            dynamic_params['nr_bins'] = dynamic_config['nr_bins']
                            logger.info(f"Using user-specified nr_bins: {dynamic_config['nr_bins']}")
                        else:
                            # Don't set nr_bins - let BERTopic group by original dates
                            # This preserves the original date granularity
                            unique_dates = len(set(valid_timestamps_days))
                            logger.info(f"nr_bins not specified, BERTopic will group by original dates ({unique_dates} unique dates)")
                        if 'evolution_tuning' in dynamic_config:
                            dynamic_params['evolution_tuning'] = dynamic_config['evolution_tuning']
                        if 'global_tuning' in dynamic_config:
                            dynamic_params['global_tuning'] = dynamic_config['global_tuning']
                    
                    # CRITICAL: Use datetime_format to tell BERTopic how to parse our date strings
                    # This ensures dates like "2020-01-04" are correctly parsed as year-month-day
                    # Without this, BERTopic might misinterpret the format
                    dynamic_params['datetime_format'] = '%Y-%m-%d'
                    
                    # Only use documents with valid timestamps for topics_over_time
                    topics_over_time_data = topic_model.topics_over_time(
                        valid_documents,
                        valid_timestamps_str,  # Pass date strings with datetime_format
                        **dynamic_params
                    )
                    logger.info(f"Dynamic topic analysis completed: {len(topics_over_time_data)} rows")
                    
                    # Debug: Log the actual timestamps returned by BERTopic
                    if topics_over_time_data is not None and len(topics_over_time_data) > 0:
                        unique_ts = topics_over_time_data['Timestamp'].unique()
                        logger.info(f"BERTopic returned {len(unique_ts)} unique timestamps:")
                        for ts in sorted(unique_ts)[:10]:
                            logger.info(f"  - {ts}")
                except Exception as e:
                    logger.error(f"Dynamic topic analysis failed: {e}")
                    import traceback
                    traceback.print_exc()
                    topics_over_time_data = None
            else:
                logger.warning(f"Not enough valid timestamps for dynamic analysis: {len(valid_timestamps_days)} valid, {len(set(valid_timestamps_days))} unique")
        
        analysis_time = time.time() - start_time
        logger.info(f"Analysis completed in {analysis_time:.2f}s")
        
        # Prepare results
        result = self._prepare_results(topic_model, topics, probs, documents, topic_info)
        result['stats']['analysis_time'] = round(analysis_time, 2)
        result['config'] = config
        
        # Add dynamic topic data if available
        if topics_over_time_data is not None and len(topics_over_time_data) > 0:
            result['topics_over_time'] = self._prepare_topics_over_time(topics_over_time_data, topic_info)
            result['has_dynamic_topics'] = True
        else:
            result['has_dynamic_topics'] = False
        
        # Store model reference for visualization and outlier estimation
        result['_topic_model'] = topic_model
        result['_embeddings'] = embeddings
        result['_documents'] = documents  # CRITICAL: Required for hierarchy visualization
        result['_topics_over_time_df'] = topics_over_time_data
        result['_raw_topics'] = original_topics  # Original topic assignments before outlier reduction
        result['_probs'] = probs  # Probabilities (may be None)
        
        return result
    
    def _prepare_topics_over_time(
        self,
        topics_over_time_df: pd.DataFrame,
        topic_info: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """Convert topics_over_time DataFrame to serializable format"""
        result = []
        
        # Create topic name mapping
        topic_names = {}
        for _, row in topic_info.iterrows():
            topic_id = int(row['Topic'])
            topic_names[topic_id] = row.get('Name', f'Topic {topic_id}')
        
        for _, row in topics_over_time_df.iterrows():
            topic_id = int(row['Topic'])
            result.append({
                'topic': topic_id,
                'topic_name': topic_names.get(topic_id, f'Topic {topic_id}'),
                'words': row.get('Words', ''),
                'frequency': float(row.get('Frequency', 0)),
                'timestamp': str(row.get('Timestamp', ''))
            })
        
        return result
    
    def _prepare_results(
        self,
        topic_model,
        topics: List[int],
        probs: Optional[np.ndarray],
        documents: List[str],
        topic_info: pd.DataFrame
    ) -> Dict[str, Any]:
        """Prepare analysis results in a serializable format"""
        
        # Convert topic info to dict
        topic_list = []
        for _, row in topic_info.iterrows():
            topic_id = int(row['Topic'])
            
            # Get topic words
            topic_words = topic_model.get_topic(topic_id)
            words = []
            if topic_words:
                # Filter out empty words and ensure valid data (max 20 words)
                for w, s in topic_words[:20]:
                    if w and str(w).strip():
                        words.append({'word': str(w), 'weight': float(s)})
            
            topic_list.append({
                'id': topic_id,
                'name': row.get('Name', f'Topic {topic_id}'),
                'count': int(row['Count']),
                'words': words,
                'custom_label': row.get('CustomName', row.get('Custom_Label', ''))
            })
        
        # Document-topic assignments
        doc_topics = []
        for i, (doc, topic) in enumerate(zip(documents, topics)):
            doc_info = {
                'index': i,
                'topic': int(topic),
                'text_preview': doc[:100] + ('...' if len(doc) > 100 else '')
            }
            if probs is not None and len(probs) > i:
                if isinstance(probs[i], np.ndarray):
                    doc_info['probability'] = float(np.max(probs[i]))
                else:
                    doc_info['probability'] = float(probs[i]) if probs[i] is not None else None
            doc_topics.append(doc_info)
        
        # Statistics
        valid_topics = [t for t in topic_list if t['id'] != -1]
        outlier_count = sum(1 for t in topics if t == -1)
        
        return {
            'topics': topic_list,
            'document_topics': doc_topics,
            'stats': {
                'total_documents': len(documents),
                'total_topics': len(valid_topics),
                'outlier_count': outlier_count,
                'outlier_percentage': round(outlier_count / len(documents) * 100, 2) if documents else 0
            }
        }
    
    def save_results(self, results: Dict[str, Any], result_id: str) -> str:
        """Save analysis results to file"""
        # Remove non-serializable items
        save_data = {k: v for k, v in results.items() if not k.startswith('_')}
        
        result_path = self.results_dir / f"{result_id}.json"
        
        import json
        with open(result_path, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Results saved to {result_path}")
        return str(result_path)
    
    def save_model(self, topic_model, model_id: str) -> str:
        """Save BERTopic model for later use"""
        model_path = self.results_dir / f"{model_id}_model.pkl"
        
        with open(model_path, 'wb') as f:
            pickle.dump(topic_model, f)
        
        logger.info(f"Model saved to {model_path}")
        return str(model_path)
    
    def load_model(self, model_id: str):
        """Load saved BERTopic model"""
        model_path = self.results_dir / f"{model_id}_model.pkl"
        
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        with open(model_path, 'rb') as f:
            return pickle.load(f)


# Singleton instance
_bertopic_service = None


def get_bertopic_service() -> BERTopicService:
    """Get BERTopic service singleton"""
    global _bertopic_service
    if _bertopic_service is None:
        _bertopic_service = BERTopicService()
    return _bertopic_service
