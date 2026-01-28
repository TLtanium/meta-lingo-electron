"""
Keyword Extraction Service
Implements both single-document algorithms and keyness comparison methods
"""

import os
import json
import math
import logging
import sqlite3
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import Counter
from pathlib import Path

import numpy as np
from scipy import stats

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DATA_DIR, CORPORA_DIR, MODELS_DIR

logger = logging.getLogger(__name__)

# NLTK stopwords directory
NLTK_STOPWORDS_DIR = MODELS_DIR / "nltk" / "corpora" / "stopwords"

# Language name mapping (corpus language -> NLTK stopwords file name)
LANGUAGE_MAPPING = {
    'chinese': 'chinese',
    'zh': 'chinese',
    'english': 'english',
    'en': 'english',
    'german': 'german',
    'de': 'german',
    'french': 'french',
    'fr': 'french',
    'spanish': 'spanish',
    'es': 'spanish',
    'italian': 'italian',
    'it': 'italian',
    'portuguese': 'portuguese',
    'pt': 'portuguese',
    'russian': 'russian',
    'ru': 'russian',
    'japanese': 'japanese',
    'ja': 'japanese',
    'korean': 'korean',
    'ko': 'korean',
    'arabic': 'arabic',
    'ar': 'arabic',
}

# Default statistical threshold values (academic standards)
DEFAULT_THRESHOLDS = {
    'log_likelihood': {'min_score': 6.63, 'p_value': 0.01},  # LL > 6.63 -> p < 0.01
    'chi_squared': {'min_score': 6.63, 'p_value': 0.01},     # Chi2 > 6.63 -> p < 0.01
    'log_ratio': {'min_score': 1.0, 'p_value': None},        # |Log Ratio| > 1
    'dice': {'min_score': 0.0, 'p_value': None},
    'mi': {'min_score': 0.0, 'p_value': None},
    'mi3': {'min_score': 0.0, 'p_value': None},
    't_score': {'min_score': 1.96, 'p_value': 0.05},         # T-score > 1.96 -> p < 0.05
    'simple_keyness': {'min_score': 0.0, 'p_value': None},
    'fishers_exact': {'min_score': 0.0, 'p_value': 0.01},    # p < 0.01
}


class KeywordService:
    """Service for keyword extraction using various algorithms"""
    
    def __init__(self):
        self.spacy_data_cache = {}
        self._corpus_name_cache: Dict[str, str] = {}
        self._stopwords_cache: Dict[str, Set[str]] = {}
    
    def load_stopwords(self, language: str) -> Set[str]:
        """
        Load stopwords for a specific language from NLTK data
        
        Args:
            language: Language name (e.g., 'english', 'chinese', 'zh', 'en')
            
        Returns:
            Set of stopwords
        """
        # Normalize language name
        lang_lower = language.lower().strip() if language else ''
        nltk_lang = LANGUAGE_MAPPING.get(lang_lower, lang_lower)
        
        # Check cache first
        if nltk_lang in self._stopwords_cache:
            return self._stopwords_cache[nltk_lang]
        
        stopwords = set()
        
        # Try to load from NLTK stopwords directory
        stopwords_file = NLTK_STOPWORDS_DIR / nltk_lang
        if stopwords_file.exists():
            try:
                with open(stopwords_file, 'r', encoding='utf-8') as f:
                    stopwords = set(word.strip().lower() for word in f if word.strip())
                logger.info(f"Loaded {len(stopwords)} stopwords for {nltk_lang}")
            except Exception as e:
                logger.error(f"Error loading stopwords for {nltk_lang}: {e}")
        else:
            logger.warning(f"Stopwords file not found for language: {nltk_lang}")
        
        # Cache the result
        self._stopwords_cache[nltk_lang] = stopwords
        return stopwords
    
    def _apply_stopwords_filter(
        self,
        words: List[Tuple[str, str]],
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> List[Tuple[str, str]]:
        """
        Apply stopwords filtering to word list
        
        Args:
            words: List of (word, pos) tuples
            stopwords_config: Config with removeStopwords bool and excludeWords list
            language: Language for stopwords
            
        Returns:
            Filtered list of (word, pos) tuples
        """
        if not stopwords_config:
            return words
        
        remove_stopwords = stopwords_config.get('removeStopwords', False)
        exclude_words = stopwords_config.get('excludeWords', [])
        
        # Build exclusion set
        exclude_set = set()
        
        # Add stopwords if enabled
        if remove_stopwords:
            exclude_set.update(self.load_stopwords(language))
        
        # Add custom exclude words
        if exclude_words:
            exclude_set.update(w.lower().strip() for w in exclude_words if w.strip())
        
        if not exclude_set:
            return words
        
        # Filter words
        return [(w, p) for w, p in words if w.lower() not in exclude_set]
    
    def _get_corpus_dir(self, corpus_id: str) -> Path:
        """Get corpus directory path by corpus ID"""
        # Check cache
        if corpus_id in self._corpus_name_cache:
            return CORPORA_DIR / self._corpus_name_cache[corpus_id]
        
        # Get corpus name from database
        db_path = DATA_DIR / "database.sqlite"
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM corpora WHERE id = ?", (corpus_id,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    corpus_name = row[0]
                    self._corpus_name_cache[corpus_id] = corpus_name
                    return CORPORA_DIR / corpus_name
            except Exception as e:
                logger.warning(f"Error getting corpus name: {e}")
        
        # Fallback to using corpus_id directly
        return CORPORA_DIR / corpus_id
    
    def _get_texts_from_db(self, corpus_id: str, text_ids: List[str] | str) -> List[Dict[str, Any]]:
        """Get text list from database"""
        db_path = DATA_DIR / "database.sqlite"
        if not db_path.exists():
            return []
        
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            if text_ids == 'all':
                cursor.execute(
                    "SELECT id, filename, media_type FROM texts WHERE corpus_id = ?",
                    (corpus_id,)
                )
            else:
                placeholders = ','.join('?' * len(text_ids))
                cursor.execute(
                    f"SELECT id, filename, media_type FROM texts WHERE corpus_id = ? AND id IN ({placeholders})",
                    (corpus_id, *text_ids)
                )
            
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {'id': row[0], 'filename': row[1], 'media_type': row[2]}
                for row in rows
            ]
        except Exception as e:
            logger.warning(f"Error getting texts from database: {e}")
            return []
    
    def _load_spacy_data(self, corpus_id: str, text_ids: List[str] | str) -> List[Dict[str, Any]]:
        """Load SpaCy annotation data for given texts"""
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        if not corpus_dir.exists():
            raise ValueError(f"Corpus not found: {corpus_id}")
        
        # Get texts from database
        texts = self._get_texts_from_db(corpus_id, text_ids)
        
        if not texts:
            logger.warning(f"No texts found for corpus: {corpus_id}")
            return []
        
        all_tokens = []
        
        for text_info in texts:
            filename = text_info.get('filename', '')
            media_type = text_info.get('media_type', 'text')
            
            # Get base filename without extension
            base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
            
            # Determine SpaCy file path based on media type
            if media_type == 'text':
                spacy_file = corpus_dir / "files" / f"{base_name}.spacy.json"
            elif media_type == 'audio':
                spacy_file = corpus_dir / "audios" / f"{base_name}.spacy.json"
            elif media_type == 'video':
                spacy_file = corpus_dir / "videos" / f"{base_name}.spacy.json"
            else:
                continue
            
            if spacy_file.exists():
                try:
                    with open(spacy_file, 'r', encoding='utf-8') as f:
                        spacy_data = json.load(f)
                    
                    # Handle different SpaCy data formats
                    if isinstance(spacy_data, list):
                        # Multiple sentences
                        for sent in spacy_data:
                            if isinstance(sent, dict) and 'tokens' in sent:
                                all_tokens.extend(sent['tokens'])
                            elif isinstance(sent, list):
                                all_tokens.extend(sent)
                    elif isinstance(spacy_data, dict):
                        if 'tokens' in spacy_data:
                            all_tokens.extend(spacy_data['tokens'])
                        elif 'sentences' in spacy_data:
                            for sent in spacy_data['sentences']:
                                if isinstance(sent, dict) and 'tokens' in sent:
                                    all_tokens.extend(sent['tokens'])
                except Exception as e:
                    logger.warning(f"Failed to load SpaCy data for {filename}: {e}")
            else:
                logger.debug(f"SpaCy file not found: {spacy_file}")
        
        return all_tokens
    
    def _filter_by_pos(
        self, 
        tokens: List[Dict], 
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True
    ) -> List[Tuple[str, str]]:
        """Filter tokens by POS and return (word, pos) tuples"""
        if not pos_filter:
            pos_filter = {'selectedPOS': [], 'keepMode': True}
        
        selected_pos = set(pos_filter.get('selectedPOS', []))
        keep_mode = pos_filter.get('keepMode', True)
        
        result = []
        for token in tokens:
            word = token.get('text', token.get('word', ''))
            pos = token.get('pos', token.get('upos', 'X'))
            
            if not word or not word.strip():
                continue
            
            # POS filtering
            if selected_pos:
                if keep_mode and pos not in selected_pos:
                    continue
                if not keep_mode and pos in selected_pos:
                    continue
            
            if lowercase:
                word = word.lower()
            
            result.append((word, pos))
        
        return result
    
    def _get_text_content(self, corpus_id: str, text_ids: List[str] | str) -> str:
        """Get concatenated text content for algorithms that need raw text"""
        tokens = self._load_spacy_data(corpus_id, text_ids)
        words = [t.get('text', t.get('word', '')) for t in tokens if t.get('text', t.get('word', ''))]
        return ' '.join(words)
    
    # ==================== Single Document Algorithms ====================
    
    def _load_spacy_data_by_text(
        self, 
        corpus_id: str, 
        text_ids: List[str] | str
    ) -> List[Tuple[str, List[Dict[str, Any]]]]:
        """Load SpaCy annotation data grouped by text file, returns list of (text_id, tokens)"""
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        if not corpus_dir.exists():
            raise ValueError(f"Corpus not found: {corpus_id}")
        
        # Get texts from database
        texts = self._get_texts_from_db(corpus_id, text_ids)
        
        if not texts:
            logger.warning(f"No texts found for corpus: {corpus_id}")
            return []
        
        result = []
        
        for text_info in texts:
            text_id = text_info.get('id', '')
            filename = text_info.get('filename', '')
            media_type = text_info.get('media_type', 'text')
            
            # Get base filename without extension
            base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
            
            # Determine SpaCy file path based on media type
            if media_type == 'text':
                spacy_file = corpus_dir / "files" / f"{base_name}.spacy.json"
            elif media_type == 'audio':
                spacy_file = corpus_dir / "audios" / f"{base_name}.spacy.json"
            elif media_type == 'video':
                spacy_file = corpus_dir / "videos" / f"{base_name}.spacy.json"
            else:
                continue
            
            if spacy_file.exists():
                try:
                    with open(spacy_file, 'r', encoding='utf-8') as f:
                        spacy_data = json.load(f)
                    
                    tokens = []
                    # Handle different SpaCy data formats
                    if isinstance(spacy_data, list):
                        for sent in spacy_data:
                            if isinstance(sent, dict) and 'tokens' in sent:
                                tokens.extend(sent['tokens'])
                            elif isinstance(sent, list):
                                tokens.extend(sent)
                    elif isinstance(spacy_data, dict):
                        if 'tokens' in spacy_data:
                            tokens.extend(spacy_data['tokens'])
                        elif 'sentences' in spacy_data:
                            for sent in spacy_data['sentences']:
                                if isinstance(sent, dict) and 'tokens' in sent:
                                    tokens.extend(sent['tokens'])
                    
                    if tokens:
                        result.append((text_id, tokens))
                except Exception as e:
                    logger.warning(f"Failed to load SpaCy data for {filename}: {e}")
        
        return result
    
    def analyze_tfidf(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """TF-IDF keyword extraction - treats each text as a separate document"""
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            
            logger.info(f"TF-IDF analysis started for corpus: {corpus_id}")
            
            # Load data grouped by text
            texts_data = self._load_spacy_data_by_text(corpus_id, text_ids)
            logger.info(f"Loaded {len(texts_data)} texts")
            
            if not texts_data:
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'tfidf'
                }
            
            # Build documents - each text file is a separate document
            documents = []
            all_filtered_words = []
            
            for text_id, tokens in texts_data:
                filtered = self._filter_by_pos(tokens, pos_filter, lowercase)
                # Apply stopwords filter
                filtered = self._apply_stopwords_filter(filtered, stopwords_config, language)
                words = [w for w, _ in filtered]
                all_filtered_words.extend(words)
                doc_text = ' '.join(words)
                if doc_text.strip():
                    documents.append(doc_text)
            
            if not documents:
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'tfidf'
                }
            
            max_features = config.get('maxFeatures', 50)
            ngram_range = tuple(config.get('ngramRange', [1, 2]))
            
            # For single document, we use different strategy
            if len(documents) == 1:
                # Split single document into sentences/chunks for IDF calculation
                sentences = documents[0].split('.')
                sentences = [s.strip() for s in sentences if s.strip() and len(s.strip().split()) > 2]
                if len(sentences) > 3:
                    documents = sentences
            
            # If still too few documents, use simple TF approach
            if len(documents) < 2:
                logger.info(f"Using TF fallback: only {len(documents)} documents, {len(all_filtered_words)} words")
                # Fallback to simple term frequency
                word_freq = Counter(all_filtered_words)
                total_words = len(all_filtered_words)
                
                results = []
                for word, freq in word_freq.most_common(max_features):
                    # Simple TF score
                    tf_score = freq / total_words if total_words > 0 else 0
                    results.append({
                        'keyword': word,
                        'score': float(tf_score),
                        'frequency': freq,
                        'algorithm': 'tfidf'
                    })
                
                for i, r in enumerate(results):
                    r['rank'] = i + 1
                
                logger.info(f"TF fallback returning {len(results)} results")
                return {
                    'success': True,
                    'results': results,
                    'total_keywords': len(results),
                    'algorithm': 'tfidf'
                }
            
            # Configure TF-IDF - always use safe defaults
            vectorizer = TfidfVectorizer(
                max_features=max_features * 3,
                min_df=1,  # At least 1 document
                max_df=1.0,  # Allow in all documents
                ngram_range=ngram_range,
                token_pattern=r'(?u)\b\w+\b',
                sublinear_tf=True  # Use log(1+tf) for better results
            )
            
            try:
                tfidf_matrix = vectorizer.fit_transform(documents)
            except ValueError as e:
                logger.warning(f"TF-IDF vectorizer failed: {e}")
                # Fallback to simple term frequency
                word_freq = Counter(all_filtered_words)
                total_words = len(all_filtered_words)
                
                results = []
                for word, freq in word_freq.most_common(max_features):
                    tf_score = freq / total_words if total_words > 0 else 0
                    results.append({
                        'keyword': word,
                        'score': float(tf_score),
                        'frequency': freq,
                        'algorithm': 'tfidf'
                    })
                
                for i, r in enumerate(results):
                    r['rank'] = i + 1
                
                return {
                    'success': True,
                    'results': results,
                    'total_keywords': len(results),
                    'algorithm': 'tfidf'
                }
            
            feature_names = vectorizer.get_feature_names_out()
            
            # Calculate average TF-IDF score across all documents
            avg_scores = tfidf_matrix.mean(axis=0).A1
            
            # Also calculate max score for each term
            max_scores = tfidf_matrix.max(axis=0).toarray()[0]
            
            # Combined score: weighted average of avg and max
            combined_scores = 0.6 * avg_scores + 0.4 * max_scores
            
            # Get word frequencies from all texts
            word_freq = Counter(all_filtered_words)
            
            # Create results
            results = []
            for word, score in zip(feature_names, combined_scores):
                if score > 0:
                    results.append({
                        'keyword': word,
                        'score': float(score),
                        'frequency': word_freq.get(word, 0),
                        'algorithm': 'tfidf'
                    })
            
            # Sort by score and limit
            results.sort(key=lambda x: x['score'], reverse=True)
            results = results[:max_features]
            
            # Add ranks
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            logger.info(f"TF-IDF returning {len(results)} keywords")
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'algorithm': 'tfidf'
            }
            
        except Exception as e:
            logger.error(f"TF-IDF analysis failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'tfidf',
                'error': str(e)
            }
    
    def analyze_textrank(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """TextRank keyword extraction using graph-based ranking"""
        try:
            import networkx as nx
            
            tokens = self._load_spacy_data(corpus_id, text_ids)
            filtered = self._filter_by_pos(tokens, pos_filter, lowercase)
            # Apply stopwords filter
            filtered = self._apply_stopwords_filter(filtered, stopwords_config, language)
            words = [w for w, _ in filtered]
            
            if len(words) < 2:
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'textrank'
                }
            
            window_size = config.get('windowSize', 4)
            damping = config.get('damping', 0.85)
            max_iter = config.get('maxIter', 100)
            top_n = config.get('topN', 50)
            
            # Build co-occurrence graph
            graph = nx.Graph()
            
            # Add edges based on co-occurrence within window
            for i, word in enumerate(words):
                for j in range(i + 1, min(i + window_size, len(words))):
                    other = words[j]
                    if word != other:
                        if graph.has_edge(word, other):
                            graph[word][other]['weight'] += 1
                        else:
                            graph.add_edge(word, other, weight=1)
            
            if len(graph.nodes()) == 0:
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'textrank'
                }
            
            # Run PageRank
            try:
                scores = nx.pagerank(
                    graph, 
                    alpha=damping, 
                    max_iter=max_iter,
                    weight='weight'
                )
            except nx.PowerIterationFailedConvergence:
                scores = nx.pagerank(graph, alpha=damping, max_iter=max_iter * 2)
            
            # Get word frequencies
            word_freq = Counter(words)
            
            # Create results
            results = []
            for word, score in scores.items():
                results.append({
                    'keyword': word,
                    'score': float(score),
                    'frequency': word_freq.get(word, 0),
                    'algorithm': 'textrank'
                })
            
            # Sort by score and limit
            results.sort(key=lambda x: x['score'], reverse=True)
            results = results[:top_n]
            
            # Add ranks
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'algorithm': 'textrank'
            }
            
        except Exception as e:
            logger.error(f"TextRank analysis failed: {e}")
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'textrank',
                'error': str(e)
            }
    
    def analyze_yake(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """YAKE! keyword extraction"""
        try:
            import yake
            
            # Get text content
            tokens = self._load_spacy_data(corpus_id, text_ids)
            filtered = self._filter_by_pos(tokens, pos_filter, lowercase)
            # Apply stopwords filter
            filtered = self._apply_stopwords_filter(filtered, stopwords_config, language)
            text = ' '.join([w for w, _ in filtered])
            
            if not text.strip():
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'yake'
                }
            
            max_ngram_size = config.get('maxNgramSize', 3)
            dedup_threshold = config.get('dedupThreshold', 0.9)
            top_n = config.get('topN', 50)
            window_size = config.get('windowSize', 2)
            
            # Create YAKE extractor
            kw_extractor = yake.KeywordExtractor(
                n=max_ngram_size,
                dedupLim=dedup_threshold,
                top=top_n,
                windowsSize=window_size
            )
            
            keywords = kw_extractor.extract_keywords(text)
            
            # Get word frequencies
            word_freq = Counter([w for w, _ in filtered])
            
            # YAKE returns (keyword, score) where lower score = more important
            # Invert scores for consistency (higher = better)
            results = []
            max_score = max([s for _, s in keywords]) if keywords else 1
            
            for keyword, score in keywords:
                # Invert and normalize score
                inverted_score = 1 - (score / (max_score + 0.001))
                results.append({
                    'keyword': keyword,
                    'score': float(inverted_score),
                    'frequency': sum(word_freq.get(w, 0) for w in keyword.split()),
                    'algorithm': 'yake'
                })
            
            # Sort by score (already sorted, but ensure consistency)
            results.sort(key=lambda x: x['score'], reverse=True)
            
            # Add ranks
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'algorithm': 'yake'
            }
            
        except ImportError:
            logger.error("YAKE not installed. Install with: pip install yake")
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'yake',
                'error': 'YAKE library not installed'
            }
        except Exception as e:
            logger.error(f"YAKE analysis failed: {e}")
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'yake',
                'error': str(e)
            }
    
    def analyze_rake(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """RAKE keyword extraction"""
        try:
            from rake_nltk import Rake
            
            # Get text content
            tokens = self._load_spacy_data(corpus_id, text_ids)
            filtered = self._filter_by_pos(tokens, pos_filter, lowercase)
            # Apply stopwords filter
            filtered = self._apply_stopwords_filter(filtered, stopwords_config, language)
            text = ' '.join([w for w, _ in filtered])
            
            if not text.strip():
                return {
                    'success': True,
                    'results': [],
                    'total_keywords': 0,
                    'algorithm': 'rake'
                }
            
            min_length = config.get('minLength', 1)
            max_length = config.get('maxLength', 3)
            top_n = config.get('topN', 50)
            
            # Create RAKE extractor
            rake = Rake(
                min_length=min_length,
                max_length=max_length
            )
            
            rake.extract_keywords_from_text(text)
            keywords_with_scores = rake.get_ranked_phrases_with_scores()
            
            # Get word frequencies
            word_freq = Counter([w for w, _ in filtered])
            
            # Normalize scores
            max_score = max([s for s, _ in keywords_with_scores]) if keywords_with_scores else 1
            
            results = []
            for score, keyword in keywords_with_scores[:top_n]:
                normalized_score = score / (max_score + 0.001)
                results.append({
                    'keyword': keyword,
                    'score': float(normalized_score),
                    'frequency': sum(word_freq.get(w, 0) for w in keyword.split()),
                    'algorithm': 'rake'
                })
            
            # Add ranks
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'algorithm': 'rake'
            }
            
        except ImportError:
            logger.error("rake-nltk not installed. Install with: pip install rake-nltk")
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'rake',
                'error': 'rake-nltk library not installed'
            }
        except Exception as e:
            logger.error(f"RAKE analysis failed: {e}")
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': 'rake',
                'error': str(e)
            }
    
    def analyze_single_doc(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        algorithm: str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Dict[str, Any]:
        """Dispatch to appropriate single-document algorithm"""
        algorithms = {
            'tfidf': self.analyze_tfidf,
            'textrank': self.analyze_textrank,
            'yake': self.analyze_yake,
            'rake': self.analyze_rake
        }
        
        if algorithm not in algorithms:
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'algorithm': algorithm,
                'error': f'Unknown algorithm: {algorithm}'
            }
        
        return algorithms[algorithm](
            corpus_id, text_ids, config, pos_filter, lowercase,
            stopwords_config, language
        )
    
    # ==================== Keyness Comparison Methods ====================
    
    def _build_frequency_table(
        self,
        corpus_id: str,
        text_ids: List[str] | str,
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english'
    ) -> Tuple[Counter, int]:
        """Build word frequency counter and total token count"""
        tokens = self._load_spacy_data(corpus_id, text_ids)
        filtered = self._filter_by_pos(tokens, pos_filter, lowercase)
        # Apply stopwords filter
        if stopwords_config:
            filtered = self._apply_stopwords_filter(filtered, stopwords_config, language)
        words = [w for w, _ in filtered]
        return Counter(words), len(words)
    
    def _calculate_log_likelihood(
        self,
        o11: int, o12: int, o21: int, o22: int
    ) -> float:
        """Calculate Log-Likelihood (G²) statistic"""
        n = o11 + o12 + o21 + o22
        if n == 0:
            return 0.0
        
        # Expected frequencies
        r1 = o11 + o12
        r2 = o21 + o22
        c1 = o11 + o21
        c2 = o12 + o22
        
        e11 = (r1 * c1) / n if n > 0 else 0
        e12 = (r1 * c2) / n if n > 0 else 0
        e21 = (r2 * c1) / n if n > 0 else 0
        e22 = (r2 * c2) / n if n > 0 else 0
        
        # G² calculation
        g2 = 0
        for o, e in [(o11, e11), (o12, e12), (o21, e21), (o22, e22)]:
            if o > 0 and e > 0:
                g2 += o * math.log(o / e)
        
        return 2 * g2
    
    def _calculate_chi_squared(
        self,
        o11: int, o12: int, o21: int, o22: int
    ) -> float:
        """Calculate Chi-squared statistic with Yates correction"""
        n = o11 + o12 + o21 + o22
        if n == 0:
            return 0.0
        
        # Expected frequencies
        r1 = o11 + o12
        r2 = o21 + o22
        c1 = o11 + o21
        c2 = o12 + o22
        
        e11 = (r1 * c1) / n if n > 0 else 0
        e12 = (r1 * c2) / n if n > 0 else 0
        e21 = (r2 * c1) / n if n > 0 else 0
        e22 = (r2 * c2) / n if n > 0 else 0
        
        # Chi-squared with Yates correction
        chi2 = 0
        for o, e in [(o11, e11), (o12, e12), (o21, e21), (o22, e22)]:
            if e > 0:
                chi2 += ((abs(o - e) - 0.5) ** 2) / e
        
        return chi2
    
    def _calculate_log_ratio(
        self,
        study_freq: int, study_total: int,
        ref_freq: int, ref_total: int
    ) -> float:
        """Calculate Log Ratio effect size"""
        # Add smoothing to avoid division by zero
        study_norm = (study_freq + 0.5) / (study_total + 1)
        ref_norm = (ref_freq + 0.5) / (ref_total + 1)
        
        if ref_norm <= 0:
            return 0.0
        
        return math.log2(study_norm / ref_norm)
    
    def _calculate_dice(
        self,
        o11: int, r1: int, c1: int
    ) -> float:
        """Calculate Dice coefficient"""
        denominator = r1 + c1
        if denominator == 0:
            return 0.0
        return (2 * o11) / denominator
    
    def _calculate_mi(
        self,
        o11: int, r1: int, c1: int, n: int
    ) -> float:
        """Calculate Mutual Information"""
        if o11 == 0 or r1 == 0 or c1 == 0 or n == 0:
            return 0.0
        
        expected = (r1 * c1) / n
        if expected == 0:
            return 0.0
        
        return math.log2((o11 * n) / (r1 * c1))
    
    def _calculate_mi3(
        self,
        o11: int, r1: int, c1: int, n: int
    ) -> float:
        """Calculate MI³ (cubed MI)"""
        if o11 == 0 or r1 == 0 or c1 == 0 or n == 0:
            return 0.0
        
        return math.log2(((o11 ** 3) * n) / (r1 * c1))
    
    def _calculate_t_score(
        self,
        o11: int, r1: int, c1: int, n: int
    ) -> float:
        """Calculate T-score"""
        if o11 == 0 or n == 0:
            return 0.0
        
        expected = (r1 * c1) / n
        return (o11 - expected) / math.sqrt(o11)
    
    def _calculate_simple_keyness(
        self,
        study_freq: int, study_total: int,
        ref_freq: int, ref_total: int
    ) -> float:
        """Calculate simple keyness (frequency ratio)"""
        study_norm = study_freq / study_total if study_total > 0 else 0
        ref_norm = ref_freq / ref_total if ref_total > 0 else 0
        
        if ref_norm == 0:
            return study_norm * 1000000 if study_norm > 0 else 0
        
        return study_norm / ref_norm
    
    def _calculate_fishers_exact_pvalue(
        self,
        o11: int, o12: int, o21: int, o22: int
    ) -> float:
        """Calculate Fisher's exact test p-value"""
        try:
            _, pvalue = stats.fisher_exact([[o11, o12], [o21, o22]])
            return pvalue
        except Exception:
            return 1.0
    
    def _get_significance_level(self, score: float, statistic: str) -> Tuple[float, str]:
        """Get p-value and significance stars for a statistic"""
        # Critical values for chi-squared/log-likelihood (df=1)
        # p < 0.05: 3.84, p < 0.01: 6.64, p < 0.001: 10.83
        
        if statistic in ['log_likelihood', 'chi_squared']:
            if score >= 10.83:
                return 0.001, '***'
            elif score >= 6.64:
                return 0.01, '**'
            elif score >= 3.84:
                return 0.05, '*'
            else:
                return 1.0, ''
        else:
            # For other statistics, we don't calculate p-value directly
            return 0.0, ''
    
    def analyze_keyness(
        self,
        study_corpus_id: str,
        study_text_ids: List[str] | str,
        reference_corpus_id: str,
        reference_text_ids: List[str] | str,
        statistic: str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english',
        threshold_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Perform keyness analysis comparing study corpus to reference corpus"""
        try:
            # Build frequency tables with stopwords filtering
            study_freq, study_total = self._build_frequency_table(
                study_corpus_id, study_text_ids, pos_filter, lowercase,
                stopwords_config, language
            )
            ref_freq, ref_total = self._build_frequency_table(
                reference_corpus_id, reference_text_ids, pos_filter, lowercase,
                stopwords_config, language
            )
            
            if study_total == 0 or ref_total == 0:
                return {
                    'success': False,
                    'results': [],
                    'total_keywords': 0,
                    'study_corpus_size': study_total,
                    'ref_corpus_size': ref_total,
                    'statistic': statistic,
                    'error': 'One or both corpora are empty after filtering'
                }
            
            # Get config values
            min_freq_study = config.get('minFreqStudy', 3)
            min_freq_ref = config.get('minFreqRef', 3)
            show_negative = config.get('showNegative', False)
            effect_size_threshold = config.get('effectSizeThreshold', 0)
            
            # Get all words from both corpora
            all_words = set(study_freq.keys()) | set(ref_freq.keys())
            
            results = []
            n = study_total + ref_total  # Total tokens
            
            for word in all_words:
                sf = study_freq.get(word, 0)  # o11: word in study
                rf = ref_freq.get(word, 0)    # o21: word in reference
                
                # Apply frequency filters
                if sf < min_freq_study and rf < min_freq_ref:
                    continue
                
                # Build contingency table
                o11 = sf                        # word in study
                o12 = study_total - sf          # other words in study
                o21 = rf                        # word in reference
                o22 = ref_total - rf            # other words in reference
                
                r1 = o11 + o12  # study corpus total
                c1 = o11 + o21  # word total
                
                # Calculate statistics based on method
                if statistic == 'log_likelihood':
                    score = self._calculate_log_likelihood(o11, o12, o21, o22)
                elif statistic == 'chi_squared':
                    score = self._calculate_chi_squared(o11, o12, o21, o22)
                elif statistic == 'log_ratio':
                    score = self._calculate_log_ratio(sf, study_total, rf, ref_total)
                elif statistic == 'dice':
                    score = self._calculate_dice(o11, r1, c1)
                elif statistic == 'mi':
                    score = self._calculate_mi(o11, r1, c1, n)
                elif statistic == 'mi3':
                    score = self._calculate_mi3(o11, r1, c1, n)
                elif statistic == 't_score':
                    score = self._calculate_t_score(o11, r1, c1, n)
                elif statistic == 'simple_keyness':
                    score = self._calculate_simple_keyness(sf, study_total, rf, ref_total)
                elif statistic == 'fishers_exact':
                    score = -math.log10(self._calculate_fishers_exact_pvalue(o11, o12, o21, o22) + 1e-300)
                else:
                    score = self._calculate_log_likelihood(o11, o12, o21, o22)
                
                # Calculate effect size (Log Ratio) for all methods
                effect_size = self._calculate_log_ratio(sf, study_total, rf, ref_total)
                
                # Determine direction
                study_norm = sf / study_total * 1000000  # per million
                ref_norm = rf / ref_total * 1000000
                direction = 'positive' if study_norm >= ref_norm else 'negative'
                
                # Skip negative keywords if not requested
                if not show_negative and direction == 'negative':
                    continue
                
                # Apply effect size threshold
                if abs(effect_size) < effect_size_threshold:
                    continue
                
                # Get significance
                p_value, significance = self._get_significance_level(score, statistic)
                
                # Apply threshold filtering if configured
                if threshold_config:
                    min_score = threshold_config.get('minScore')
                    max_p_value = threshold_config.get('maxPValue')
                    
                    # Apply minimum score threshold
                    if min_score is not None and abs(score) < min_score:
                        continue
                    
                    # Apply p-value threshold for LL and chi-squared
                    if max_p_value is not None and statistic in ['log_likelihood', 'chi_squared']:
                        if p_value > max_p_value:
                            continue
                    
                    # Apply p-value threshold for Fisher's exact test
                    if max_p_value is not None and statistic == 'fishers_exact':
                        actual_p = self._calculate_fishers_exact_pvalue(o11, o12, o21, o22)
                        if actual_p > max_p_value:
                            continue
                
                results.append({
                    'keyword': word,
                    'study_freq': sf,
                    'ref_freq': rf,
                    'study_norm': round(study_norm, 2),
                    'ref_norm': round(ref_norm, 2),
                    'score': round(score, 4),
                    'effect_size': round(effect_size, 4),
                    'p_value': p_value,
                    'significance': significance,
                    'direction': direction
                })
            
            # Sort by absolute score
            results.sort(key=lambda x: abs(x['score']), reverse=True)
            
            # Add ranks
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'study_corpus_size': study_total,
                'ref_corpus_size': ref_total,
                'statistic': statistic
            }
            
        except Exception as e:
            logger.error(f"Keyness analysis failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'study_corpus_size': 0,
                'ref_corpus_size': 0,
                'statistic': statistic,
                'error': str(e)
            }
    
    def analyze_keyness_with_resource(
        self,
        study_corpus_id: str,
        study_text_ids: List[str] | str,
        resource_id: str,
        statistic: str,
        config: Dict[str, Any],
        pos_filter: Optional[Dict] = None,
        lowercase: bool = True,
        stopwords_config: Optional[Dict[str, Any]] = None,
        language: str = 'english',
        threshold_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform keyness analysis comparing study corpus to a corpus resource (CSV)
        
        Args:
            study_corpus_id: Study corpus ID
            study_text_ids: Text IDs in study corpus
            resource_id: Corpus resource ID (e.g., 'oanc_total', 'bnc_spoken')
            statistic: Statistical method to use
            config: Analysis configuration
            pos_filter: POS filter configuration
            lowercase: Whether to lowercase
            stopwords_config: Stopwords configuration
            language: Language for stopwords
            threshold_config: Statistical threshold configuration
        """
        try:
            from services.corpus_resource_service import get_corpus_resource_service
            
            # Build study corpus frequency table
            study_freq, study_total = self._build_frequency_table(
                study_corpus_id, study_text_ids, pos_filter, lowercase,
                stopwords_config, language
            )
            
            if study_total == 0:
                return {
                    'success': False,
                    'results': [],
                    'total_keywords': 0,
                    'study_corpus_size': 0,
                    'ref_corpus_size': 0,
                    'statistic': statistic,
                    'error': 'Study corpus is empty after filtering'
                }
            
            # Load reference corpus from CSV resource
            resource_service = get_corpus_resource_service()
            ref_freq_table = resource_service.build_frequency_table(resource_id, lowercase)
            
            if not ref_freq_table:
                return {
                    'success': False,
                    'results': [],
                    'total_keywords': 0,
                    'study_corpus_size': study_total,
                    'ref_corpus_size': 0,
                    'statistic': statistic,
                    'error': f'Corpus resource not found: {resource_id}'
                }
            
            # Apply stopwords filter to reference corpus
            if stopwords_config and stopwords_config.get('removeStopwords'):
                stopwords = self.load_stopwords(language)
                exclude_words = set(w.lower().strip() for w in stopwords_config.get('excludeWords', []) if w.strip())
                exclude_set = stopwords | exclude_words
                ref_freq_table = {k: v for k, v in ref_freq_table.items() if k.lower() not in exclude_set}
            
            ref_freq = Counter(ref_freq_table)
            ref_total = sum(ref_freq_table.values())
            
            if ref_total == 0:
                return {
                    'success': False,
                    'results': [],
                    'total_keywords': 0,
                    'study_corpus_size': study_total,
                    'ref_corpus_size': 0,
                    'statistic': statistic,
                    'error': 'Reference corpus is empty after filtering'
                }
            
            # Get config values
            min_freq_study = config.get('minFreqStudy', 3)
            min_freq_ref = config.get('minFreqRef', 3)
            show_negative = config.get('showNegative', False)
            effect_size_threshold = config.get('effectSizeThreshold', 0)
            
            # Get all words from both corpora
            all_words = set(study_freq.keys()) | set(ref_freq.keys())
            
            results = []
            n = study_total + ref_total
            
            for word in all_words:
                sf = study_freq.get(word, 0)
                rf = ref_freq.get(word, 0)
                
                # Apply frequency filters
                if sf < min_freq_study and rf < min_freq_ref:
                    continue
                
                # Build contingency table
                o11 = sf
                o12 = study_total - sf
                o21 = rf
                o22 = ref_total - rf
                
                r1 = o11 + o12
                c1 = o11 + o21
                
                # Calculate statistics
                if statistic == 'log_likelihood':
                    score = self._calculate_log_likelihood(o11, o12, o21, o22)
                elif statistic == 'chi_squared':
                    score = self._calculate_chi_squared(o11, o12, o21, o22)
                elif statistic == 'log_ratio':
                    score = self._calculate_log_ratio(sf, study_total, rf, ref_total)
                elif statistic == 'dice':
                    score = self._calculate_dice(o11, r1, c1)
                elif statistic == 'mi':
                    score = self._calculate_mi(o11, r1, c1, n)
                elif statistic == 'mi3':
                    score = self._calculate_mi3(o11, r1, c1, n)
                elif statistic == 't_score':
                    score = self._calculate_t_score(o11, r1, c1, n)
                elif statistic == 'simple_keyness':
                    score = self._calculate_simple_keyness(sf, study_total, rf, ref_total)
                elif statistic == 'fishers_exact':
                    score = -math.log10(self._calculate_fishers_exact_pvalue(o11, o12, o21, o22) + 1e-300)
                else:
                    score = self._calculate_log_likelihood(o11, o12, o21, o22)
                
                effect_size = self._calculate_log_ratio(sf, study_total, rf, ref_total)
                
                study_norm = sf / study_total * 1000000
                ref_norm = rf / ref_total * 1000000
                direction = 'positive' if study_norm >= ref_norm else 'negative'
                
                if not show_negative and direction == 'negative':
                    continue
                
                if abs(effect_size) < effect_size_threshold:
                    continue
                
                p_value, significance = self._get_significance_level(score, statistic)
                
                # Apply threshold filtering
                if threshold_config:
                    min_score = threshold_config.get('minScore')
                    max_p_value = threshold_config.get('maxPValue')
                    
                    if min_score is not None and abs(score) < min_score:
                        continue
                    
                    if max_p_value is not None and statistic in ['log_likelihood', 'chi_squared']:
                        if p_value > max_p_value:
                            continue
                    
                    if max_p_value is not None and statistic == 'fishers_exact':
                        actual_p = self._calculate_fishers_exact_pvalue(o11, o12, o21, o22)
                        if actual_p > max_p_value:
                            continue
                
                results.append({
                    'keyword': word,
                    'study_freq': sf,
                    'ref_freq': rf,
                    'study_norm': round(study_norm, 2),
                    'ref_norm': round(ref_norm, 2),
                    'score': round(score, 4),
                    'effect_size': round(effect_size, 4),
                    'p_value': p_value,
                    'significance': significance,
                    'direction': direction
                })
            
            results.sort(key=lambda x: abs(x['score']), reverse=True)
            
            for i, r in enumerate(results):
                r['rank'] = i + 1
            
            return {
                'success': True,
                'results': results,
                'total_keywords': len(results),
                'study_corpus_size': study_total,
                'ref_corpus_size': ref_total,
                'statistic': statistic,
                'reference_resource_id': resource_id
            }
            
        except Exception as e:
            logger.error(f"Keyness analysis with resource failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'results': [],
                'total_keywords': 0,
                'study_corpus_size': 0,
                'ref_corpus_size': 0,
                'statistic': statistic,
                'error': str(e)
            }
    
    def get_default_thresholds(self) -> Dict[str, Dict[str, Any]]:
        """Get default statistical thresholds"""
        return DEFAULT_THRESHOLDS
    
    # ==================== Algorithm/Statistic Info ====================
    
    def get_single_doc_algorithms(self) -> List[Dict[str, str]]:
        """Get list of available single-document algorithms"""
        return [
            {
                'id': 'tfidf',
                'name_en': 'TF-IDF',
                'name_zh': 'TF-IDF',
                'description_en': 'Term Frequency-Inverse Document Frequency',
                'description_zh': '词频-逆文档频率'
            },
            {
                'id': 'textrank',
                'name_en': 'TextRank',
                'name_zh': 'TextRank',
                'description_en': 'Graph-based ranking algorithm',
                'description_zh': '基于图的排序算法'
            },
            {
                'id': 'yake',
                'name_en': 'YAKE!',
                'name_zh': 'YAKE!',
                'description_en': 'Yet Another Keyword Extractor',
                'description_zh': '基于统计特征的关键词提取'
            },
            {
                'id': 'rake',
                'name_en': 'RAKE',
                'name_zh': 'RAKE',
                'description_en': 'Rapid Automatic Keyword Extraction',
                'description_zh': '快速自动关键词提取'
            }
        ]
    
    def get_keyness_statistics(self) -> List[Dict[str, str]]:
        """Get list of available keyness statistics"""
        return [
            {
                'id': 'log_likelihood',
                'name_en': 'Log-Likelihood (G²)',
                'name_zh': '对数似然比 (G²)',
                'description_en': 'Most reliable significance test',
                'description_zh': '最可靠的显著性检验'
            },
            {
                'id': 'chi_squared',
                'name_en': 'Chi-squared (χ²)',
                'name_zh': '卡方检验 (χ²)',
                'description_en': 'Classic statistical test',
                'description_zh': '经典统计检验'
            },
            {
                'id': 'log_ratio',
                'name_en': 'Log Ratio',
                'name_zh': '对数比率',
                'description_en': 'Pure effect size measure',
                'description_zh': '纯效应量指标'
            },
            {
                'id': 'dice',
                'name_en': 'Dice Coefficient',
                'name_zh': 'Dice系数',
                'description_en': 'Association strength measure',
                'description_zh': '关联强度指标'
            },
            {
                'id': 'mi',
                'name_en': 'Mutual Information',
                'name_zh': '互信息',
                'description_en': 'Information-theoretic measure',
                'description_zh': '信息论指标'
            },
            {
                'id': 'mi3',
                'name_en': 'MI³',
                'name_zh': 'MI³',
                'description_en': 'Cubed MI for rare words',
                'description_zh': '适用于低频词的MI立方'
            },
            {
                'id': 't_score',
                'name_en': 'T-score',
                'name_zh': 'T-score',
                'description_en': 'Favors high-frequency words',
                'description_zh': '偏向高频词'
            },
            {
                'id': 'simple_keyness',
                'name_en': 'Simple Keyness',
                'name_zh': '简单关键性',
                'description_en': 'Simple frequency ratio',
                'description_zh': '简单频率比值'
            },
            {
                'id': 'fishers_exact',
                'name_en': "Fisher's Exact Test",
                'name_zh': 'Fisher精确检验',
                'description_en': 'Exact test for small samples',
                'description_zh': '小样本精确检验'
            }
        ]


# Singleton instance
_keyword_service = None


def get_keyword_service() -> KeywordService:
    """Get singleton KeywordService instance"""
    global _keyword_service
    if _keyword_service is None:
        _keyword_service = KeywordService()
    return _keyword_service

