"""
LDA Preprocess Service
Handles text preprocessing for LDA topic modeling with language-specific support
- Chinese: jieba tokenization
- English: SpaCy tokenization
- Common: POS filtering, stopwords, lemmatization
"""

import logging
import json
import re
from typing import Dict, List, Any, Optional, Set, Tuple
from pathlib import Path

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DATA_DIR, CORPORA_DIR, MODELS_DIR

logger = logging.getLogger(__name__)

# NLTK stopwords directory
NLTK_STOPWORDS_DIR = MODELS_DIR / "nltk" / "corpora" / "stopwords"


class LDAPreprocessService:
    """Service for LDA-specific text preprocessing"""
    
    # Universal POS tags with descriptions
    UNIVERSAL_POS_TAGS = {
        'ADJ': {'en': 'Adjective', 'zh': '形容词'},
        'ADP': {'en': 'Adposition', 'zh': '介词'},
        'ADV': {'en': 'Adverb', 'zh': '副词'},
        'AUX': {'en': 'Auxiliary', 'zh': '助动词'},
        'CCONJ': {'en': 'Coordinating conjunction', 'zh': '并列连词'},
        'DET': {'en': 'Determiner', 'zh': '限定词'},
        'INTJ': {'en': 'Interjection', 'zh': '感叹词'},
        'NOUN': {'en': 'Noun', 'zh': '名词'},
        'NUM': {'en': 'Numeral', 'zh': '数词'},
        'PART': {'en': 'Particle', 'zh': '小品词'},
        'PRON': {'en': 'Pronoun', 'zh': '代词'},
        'PROPN': {'en': 'Proper noun', 'zh': '专有名词'},
        'PUNCT': {'en': 'Punctuation', 'zh': '标点'},
        'SCONJ': {'en': 'Subordinating conjunction', 'zh': '从属连词'},
        'SYM': {'en': 'Symbol', 'zh': '符号'},
        'VERB': {'en': 'Verb', 'zh': '动词'},
        'X': {'en': 'Other', 'zh': '其他'}
    }
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.corpora_dir = CORPORA_DIR
        self._stopwords_cache: Dict[str, Set[str]] = {}
        self._corpus_name_cache: Dict[str, str] = {}
        self._jieba_initialized = False
    
    def _init_jieba(self):
        """Initialize jieba for Chinese tokenization"""
        if not self._jieba_initialized:
            import jieba
            jieba.initialize()
            self._jieba_initialized = True
    
    def _get_corpus_dir(self, corpus_id: str) -> Path:
        """Get corpus directory path by corpus ID"""
        import sqlite3
        
        # Check cache
        if corpus_id in self._corpus_name_cache:
            return self.corpora_dir / self._corpus_name_cache[corpus_id]
        
        # Get corpus name from database
        db_path = self.data_dir / "database.sqlite"
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
                    return self.corpora_dir / corpus_name
            except Exception as e:
                logger.warning(f"Error getting corpus name: {e}")
        
        # Fallback to using corpus_id directly
        return self.corpora_dir / corpus_id
    
    def load_stopwords(self, language: str) -> Set[str]:
        """
        Load stopwords for a specific language
        
        Args:
            language: Language name (e.g., 'english', 'chinese')
            
        Returns:
            Set of stopwords
        """
        # Check cache first
        if language in self._stopwords_cache:
            return self._stopwords_cache[language]
        
        stopwords = set()
        
        # Try to load from NLTK stopwords directory
        stopwords_file = NLTK_STOPWORDS_DIR / language
        if stopwords_file.exists():
            try:
                with open(stopwords_file, 'r', encoding='utf-8') as f:
                    stopwords = set(word.strip().lower() for word in f if word.strip())
                logger.info(f"Loaded {len(stopwords)} stopwords for {language}")
            except Exception as e:
                logger.error(f"Error loading stopwords for {language}: {e}")
        else:
            # Try lowercase
            stopwords_file = NLTK_STOPWORDS_DIR / language.lower()
            if stopwords_file.exists():
                try:
                    with open(stopwords_file, 'r', encoding='utf-8') as f:
                        stopwords = set(word.strip().lower() for word in f if word.strip())
                    logger.info(f"Loaded {len(stopwords)} stopwords for {language}")
                except Exception as e:
                    logger.error(f"Error loading stopwords for {language}: {e}")
        
        # Cache the result
        self._stopwords_cache[language] = stopwords
        return stopwords
    
    def get_pos_tags_info(self) -> List[Dict[str, str]]:
        """Get list of POS tags with descriptions"""
        return [
            {
                'tag': tag,
                'description_en': info['en'],
                'description_zh': info['zh']
            }
            for tag, info in self.UNIVERSAL_POS_TAGS.items()
        ]
    
    def get_spacy_annotations(self, corpus_id: str, text_id: str) -> Optional[Dict]:
        """
        Get SpaCy annotations for a specific text
        
        Args:
            corpus_id: Corpus identifier
            text_id: Text identifier
            
        Returns:
            SpaCy annotation data or None
        """
        import sqlite3
        
        try:
            corpus_dir = self._get_corpus_dir(corpus_id)
            
            # Get filename from database
            db_path = self.data_dir / "database.sqlite"
            filename_base = None
            media_type = 'text'
            
            if db_path.exists():
                try:
                    conn = sqlite3.connect(str(db_path))
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT filename, media_type FROM texts WHERE id = ?",
                        (text_id,)
                    )
                    row = cursor.fetchone()
                    conn.close()
                    
                    if row:
                        filename_base = Path(row['filename']).stem
                        media_type = row['media_type']
                except Exception as e:
                    logger.warning(f"Error getting filename from database: {e}")
            
            # Try to find spacy annotation file
            if filename_base:
                if media_type == 'text':
                    spacy_path = corpus_dir / "files" / f"{filename_base}.spacy.json"
                elif media_type == 'audio':
                    spacy_path = corpus_dir / "audios" / f"{filename_base}.spacy.json"
                elif media_type == 'video':
                    spacy_path = corpus_dir / "videos" / f"{filename_base}.spacy.json"
                else:
                    spacy_path = corpus_dir / "files" / f"{filename_base}.spacy.json"
                
                if spacy_path.exists():
                    with open(spacy_path, 'r', encoding='utf-8') as f:
                        return json.load(f)
            
            return None
            
        except Exception as e:
            logger.error(f"Error loading SpaCy annotations: {e}")
            return None
    
    def _load_text_content(self, corpus_dir: Path, text_id: str) -> Optional[str]:
        """Load text content from corpus"""
        import sqlite3
        
        db_path = self.data_dir / "database.sqlite"
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT filename, content_path, media_type, transcript_path FROM texts WHERE id = ?",
                    (text_id,)
                )
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    if row['media_type'] == 'text':
                        if row['content_path'] and Path(row['content_path']).exists():
                            with open(row['content_path'], 'r', encoding='utf-8') as f:
                                return f.read()
                        text_path = corpus_dir / "files" / row['filename']
                        if text_path.exists():
                            with open(text_path, 'r', encoding='utf-8') as f:
                                return f.read()
                    
                    elif row['media_type'] in ('audio', 'video'):
                        if row['transcript_path'] and Path(row['transcript_path']).exists():
                            with open(row['transcript_path'], 'r', encoding='utf-8') as f:
                                data = json.load(f)
                                if 'segments' in data:
                                    return ' '.join(seg.get('text', '') for seg in data['segments'])
                                return data.get('text', '')
            except Exception as e:
                logger.error(f"Error loading text from database: {e}")
        
        return None
    
    def tokenize_chinese(self, text: str, use_jieba: bool = True) -> List[str]:
        """
        Tokenize Chinese text using jieba
        
        Args:
            text: Input text
            use_jieba: Whether to use jieba (default True)
            
        Returns:
            List of tokens
        """
        if use_jieba:
            self._init_jieba()
            import jieba
            return list(jieba.cut(text))
        else:
            # Fallback: character-by-character
            return list(text)
    
    def tokenize_english(self, text: str, spacy_data: Optional[Dict] = None) -> List[Dict]:
        """
        Tokenize English text using SpaCy annotations or simple whitespace
        
        Args:
            text: Input text
            spacy_data: Optional SpaCy annotation data
            
        Returns:
            List of token dicts with text, lemma, pos
        """
        if spacy_data and 'tokens' in spacy_data:
            return spacy_data['tokens']
        
        # Fallback: simple tokenization
        tokens = []
        for word in text.split():
            word = word.strip()
            if word:
                tokens.append({
                    'text': word,
                    'lemma': word.lower(),
                    'pos': 'X',
                    'is_stop': False,
                    'is_punct': bool(re.match(r'^[^\w\s]+$', word)),
                    'is_space': False
                })
        return tokens
    
    def _is_punctuation_or_symbol(self, text: str) -> bool:
        """Check if text is punctuation or symbol"""
        # Regex pattern to match strings that are only punctuation/symbols
        # Includes common punctuation: .,!?;:'"-()[]{}/<>@#$%^&*+=~`|\
        # Also includes Chinese punctuation
        punct_pattern = re.compile(r'^[\s\.,!?;:\'"\-\(\)\[\]\{\}/<>@#\$%\^&\*\+=~`\|\\。，！？；：''""【】、《》·…—\u3000]+$')
        return bool(punct_pattern.match(text))
    
    def _clean_token(self, text: str) -> str:
        """Clean token by removing leading/trailing punctuation"""
        # Remove leading and trailing punctuation/symbols
        text = re.sub(r'^[^\w\u4e00-\u9fff]+', '', text)
        text = re.sub(r'[^\w\u4e00-\u9fff]+$', '', text)
        return text.strip()
    
    def preprocess_text(
        self,
        text: str,
        language: str,
        config: Dict[str, Any],
        spacy_data: Optional[Dict] = None
    ) -> Tuple[List[str], Dict[str, Any]]:
        """
        Preprocess text for LDA
        
        Args:
            text: Input text
            language: Language ('chinese' or 'english')
            config: Preprocessing configuration
                - remove_stopwords: bool
                - remove_punctuation: bool
                - lemmatize: bool
                - lowercase: bool
                - min_word_length: int
                - pos_filter: List[str] - POS tags to keep/filter
                - pos_keep_mode: bool - True for keep mode, False for filter mode
            spacy_data: Optional SpaCy annotation data
            
        Returns:
            Tuple of (processed_tokens, stats)
        """
        remove_stopwords = config.get('remove_stopwords', True)
        remove_punctuation = config.get('remove_punctuation', True)
        lemmatize = config.get('lemmatize', True)
        lowercase = config.get('lowercase', True)
        min_word_length = config.get('min_word_length', 2)
        pos_filter = config.get('pos_filter', [])
        pos_keep_mode = config.get('pos_keep_mode', False)  # Default to filter mode
        
        # Load stopwords
        stopwords = set()
        if remove_stopwords:
            stopwords = self.load_stopwords(language)
        
        processed_tokens = []
        stats = {
            'original_tokens': 0,
            'after_pos_filter': 0,
            'after_stopwords': 0,
            'after_length_filter': 0,
            'final_tokens': 0
        }
        
        if language == 'chinese':
            # Chinese preprocessing
            raw_tokens = self.tokenize_chinese(text)
            stats['original_tokens'] = len(raw_tokens)
            
            # Get POS tags from SpaCy if available
            token_pos_map = {}
            if spacy_data and 'tokens' in spacy_data:
                for t in spacy_data['tokens']:
                    token_pos_map[t.get('text', '')] = t.get('pos', 'X')
            
            for token in raw_tokens:
                token_text = token.strip()
                if not token_text:
                    continue
                
                # Remove punctuation and symbols first
                if remove_punctuation:
                    # Skip if it's pure punctuation/symbol
                    if self._is_punctuation_or_symbol(token_text):
                        continue
                    # Clean leading/trailing punctuation
                    token_text = self._clean_token(token_text)
                    if not token_text:
                        continue
                
                # POS filter
                if pos_filter:
                    original_token = token.strip()
                    token_pos = token_pos_map.get(original_token, 'X')
                    if pos_keep_mode:
                        # Keep mode: only keep tokens with selected POS
                        if token_pos not in pos_filter:
                            continue
                    else:
                        # Filter mode: remove tokens with selected POS
                        if token_pos in pos_filter:
                            continue
                
                stats['after_pos_filter'] = stats.get('after_pos_filter', 0) + 1
                
                # Stopword filter
                if remove_stopwords and token_text.lower() in stopwords:
                    continue
                
                stats['after_stopwords'] = stats.get('after_stopwords', 0) + 1
                
                # Length filter
                if len(token_text) < min_word_length:
                    continue
                
                stats['after_length_filter'] = stats.get('after_length_filter', 0) + 1
                
                # Apply lowercase
                if lowercase:
                    token_text = token_text.lower()
                
                processed_tokens.append(token_text)
        
        else:
            # English preprocessing
            tokens = self.tokenize_english(text, spacy_data)
            stats['original_tokens'] = len(tokens)
            
            for token in tokens:
                # Skip space
                if token.get('is_space', False):
                    continue
                
                token_text = token.get('text', '')
                token_pos = token.get('pos', 'X')
                token_lemma = token.get('lemma', token_text)
                
                if not token_text.strip():
                    continue
                
                # Remove punctuation and symbols
                if remove_punctuation:
                    # Skip if marked as punctuation by SpaCy
                    if token.get('is_punct', False):
                        continue
                    # Skip if it's pure punctuation/symbol
                    if self._is_punctuation_or_symbol(token_text):
                        continue
                    # Clean leading/trailing punctuation
                    token_text = self._clean_token(token_text)
                    token_lemma = self._clean_token(token_lemma)
                    if not token_text:
                        continue
                
                # POS filter
                if pos_filter:
                    if pos_keep_mode:
                        if token_pos not in pos_filter:
                            continue
                    else:
                        if token_pos in pos_filter:
                            continue
                
                stats['after_pos_filter'] = stats.get('after_pos_filter', 0) + 1
                
                # Stopword filter
                if remove_stopwords:
                    if token.get('is_stop', False) or token_text.lower() in stopwords:
                        continue
                
                stats['after_stopwords'] = stats.get('after_stopwords', 0) + 1
                
                # Get final token text
                final_text = token_lemma if lemmatize else token_text
                
                # Length filter
                if len(final_text) < min_word_length:
                    continue
                
                stats['after_length_filter'] = stats.get('after_length_filter', 0) + 1
                
                # Apply lowercase
                if lowercase:
                    final_text = final_text.lower()
                
                processed_tokens.append(final_text)
        
        stats['final_tokens'] = len(processed_tokens)
        
        return processed_tokens, stats
    
    def preprocess_corpus_texts(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Preprocess multiple texts from a corpus for LDA
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            config: Preprocessing configuration
            
        Returns:
            Dictionary with:
                - documents: List of preprocessed token lists (for LDA)
                - document_texts: List of preprocessed text strings (joined tokens)
                - text_ids: List of valid text IDs
                - stats: Processing statistics
        """
        documents = []
        document_texts = []
        valid_text_ids = []
        
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        total_stats = {
            'total': len(text_ids),
            'processed': 0,
            'skipped': 0,
            'with_spacy': 0,
            'without_spacy': 0,
            'total_original_tokens': 0,
            'total_final_tokens': 0,
            'language': language
        }
        
        for text_id in text_ids:
            try:
                # Load text content
                text_content = self._load_text_content(corpus_dir, text_id)
                if not text_content or not text_content.strip():
                    total_stats['skipped'] += 1
                    continue
                
                # Load SpaCy annotations
                spacy_data = self.get_spacy_annotations(corpus_id, text_id)
                
                if spacy_data:
                    total_stats['with_spacy'] += 1
                else:
                    total_stats['without_spacy'] += 1
                
                # Preprocess
                tokens, stats = self.preprocess_text(
                    text_content, 
                    language, 
                    config, 
                    spacy_data
                )
                
                if tokens:
                    documents.append(tokens)
                    document_texts.append(' '.join(tokens))
                    valid_text_ids.append(text_id)
                    total_stats['processed'] += 1
                    total_stats['total_original_tokens'] += stats['original_tokens']
                    total_stats['total_final_tokens'] += stats['final_tokens']
                else:
                    total_stats['skipped'] += 1
                    
            except Exception as e:
                logger.error(f"Error preprocessing text {text_id}: {e}")
                total_stats['skipped'] += 1
        
        return {
            'documents': documents,
            'document_texts': document_texts,
            'text_ids': valid_text_ids,
            'stats': total_stats
        }
    
    def preview_preprocess(
        self,
        corpus_id: str,
        text_ids: List[str],
        language: str,
        config: Dict[str, Any],
        max_preview: int = 5
    ) -> Dict[str, Any]:
        """
        Preview preprocessing results for a few texts
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            language: Language ('chinese' or 'english')
            config: Preprocessing configuration
            max_preview: Maximum number of texts to preview
            
        Returns:
            Preview data with before/after comparison
        """
        preview_ids = text_ids[:max_preview]
        previews = []
        
        corpus_dir = self._get_corpus_dir(corpus_id)
        
        for text_id in preview_ids:
            try:
                # Load text content
                text_content = self._load_text_content(corpus_dir, text_id)
                if not text_content:
                    continue
                
                # Load SpaCy annotations
                spacy_data = self.get_spacy_annotations(corpus_id, text_id)
                
                # Preprocess
                tokens, stats = self.preprocess_text(
                    text_content, 
                    language, 
                    config, 
                    spacy_data
                )
                
                # Truncate for preview
                original_preview = text_content[:500] + ('...' if len(text_content) > 500 else '')
                processed_text = ' '.join(tokens)
                processed_preview = processed_text[:500] + ('...' if len(processed_text) > 500 else '')
                
                previews.append({
                    'text_id': text_id,
                    'original': original_preview,
                    'processed': processed_preview,
                    'original_token_count': stats['original_tokens'],
                    'processed_token_count': stats['final_tokens'],
                    'has_spacy': spacy_data is not None,
                    'stats': stats
                })
                
            except Exception as e:
                logger.error(f"Error previewing text {text_id}: {e}")
        
        return {
            'previews': previews,
            'total_texts': len(text_ids),
            'preview_count': len(previews),
            'config': config,
            'language': language
        }


# Singleton instance
_lda_preprocess_service = None


def get_lda_preprocess_service() -> LDAPreprocessService:
    """Get LDA preprocess service singleton"""
    global _lda_preprocess_service
    if _lda_preprocess_service is None:
        _lda_preprocess_service = LDAPreprocessService()
    return _lda_preprocess_service
