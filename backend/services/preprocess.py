"""
Unified Preprocessing Service
Full text preprocessing with multi-language support
"""

import os
import re
import string
import unicodedata
from typing import List, Optional, Dict, Any, Set
from dataclasses import dataclass, field
from pathlib import Path

from config import MODELS_DIR

# NLTK data path - 使用 config.py 中的 MODELS_DIR
NLTK_DATA_PATH = str(MODELS_DIR / "nltk")


@dataclass
class PreprocessConfig:
    """Preprocessing configuration"""
    normalize_text: bool = True
    remove_punctuation: bool = True
    to_lowercase: bool = True
    remove_stopwords: bool = True
    stopwords_language: str = "english"
    tokenize: bool = True
    extract_entities: bool = False
    custom_stopwords: List[str] = field(default_factory=list)
    advanced_patterns: List[str] = field(default_factory=list)  # Regex patterns for cleaning


@dataclass
class Entity:
    """Named entity"""
    text: str
    label: str
    start: int
    end: int


@dataclass
class PreprocessResult:
    """Preprocessing result"""
    original_text: str
    processed_text: str
    tokens: List[str]
    entities: Optional[List[Entity]] = None
    word_count: int = 0


class TextPreprocessor:
    """
    Unified text preprocessing class
    Supports multiple languages and various preprocessing options
    """
    
    # Supported stopwords languages
    SUPPORTED_LANGUAGES = {
        'english', 'chinese', 'spanish', 'french', 'german', 
        'italian', 'portuguese', 'russian', 'arabic', 'japanese'
    }
    
    def __init__(self, config: PreprocessConfig = None):
        self.config = config or PreprocessConfig()
        self._stopwords: Set[str] = set()
        self._custom_stopwords: Set[str] = set()
        self._advanced_patterns: List[re.Pattern] = []
        self._spacy_model = None
        self._jieba_loaded = False
        
        self._load_stopwords()
        self._compile_patterns()
    
    def _load_stopwords(self):
        """Load stopwords from NLTK data or built-in lists"""
        lang = self.config.stopwords_language.lower()
        
        # Try NLTK stopwords first
        stopwords_path = os.path.join(NLTK_DATA_PATH, "corpora/stopwords", lang)
        
        if os.path.exists(stopwords_path):
            with open(stopwords_path, "r", encoding="utf-8") as f:
                self._stopwords = set(line.strip().lower() for line in f if line.strip())
        else:
            # Use built-in stopwords for common languages
            self._stopwords = self._get_builtin_stopwords(lang)
        
        # Add custom stopwords
        if self.config.custom_stopwords:
            self._custom_stopwords = set(s.lower() for s in self.config.custom_stopwords)
    
    def _get_builtin_stopwords(self, language: str) -> Set[str]:
        """Get built-in stopwords for common languages"""
        # English stopwords (most common)
        english_stops = {
            'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 
            'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
            'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them',
            'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this',
            'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
            'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
            'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
            'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
            'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
            'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
            'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
            'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y'
        }
        
        # Chinese stopwords (common ones)
        chinese_stops = {
            '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
            '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
            '自己', '这', '那', '她', '他', '它', '我们', '你们', '他们', '什么', '这个',
            '那个', '这些', '那些', '但是', '因为', '所以', '如果', '虽然', '而且', '或者'
        }
        
        if language == 'english':
            return english_stops
        elif language == 'chinese':
            return chinese_stops
        else:
            return english_stops  # Default to English
    
    def _compile_patterns(self):
        """Compile advanced cleaning patterns"""
        self._advanced_patterns = []
        for pattern in self.config.advanced_patterns:
            try:
                self._advanced_patterns.append(re.compile(pattern))
            except re.error:
                pass  # Invalid pattern, skip
    
    def load_custom_stopwords(self, stopwords: List[str]):
        """Load additional custom stopwords"""
        self._custom_stopwords.update(s.lower() for s in stopwords)
    
    def load_advanced_patterns(self, patterns: List[str]):
        """Load advanced cleaning patterns"""
        self.config.advanced_patterns = patterns
        self._compile_patterns()
    
    def normalize(self, text: str) -> str:
        """
        Text normalization
        - Unicode normalization (NFKC)
        - Whitespace normalization
        """
        if not self.config.normalize_text:
            return text
        
        # Unicode normalization
        text = unicodedata.normalize('NFKC', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove control characters
        text = ''.join(c for c in text if unicodedata.category(c) != 'Cc' or c in '\n\t')
        
        return text.strip()
    
    def remove_punctuation(self, text: str) -> str:
        """Remove punctuation marks"""
        if not self.config.remove_punctuation:
            return text
        
        # Extended punctuation including Chinese
        punct = string.punctuation + ''.join([
            chr(i) for i in range(0x3000, 0x303F)  # CJK punctuation
        ]) + ''.join([
            chr(i) for i in range(0xFF00, 0xFFEF)  # Fullwidth punctuation
        ])
        
        return ''.join(c for c in text if c not in punct)
    
    def tokenize(self, text: str) -> List[str]:
        """
        Tokenize text
        Uses jieba for Chinese, simple split for others
        """
        if not self.config.tokenize:
            return [text]
        
        lang = self.config.stopwords_language.lower()
        
        if lang == 'chinese':
            return self._tokenize_chinese(text)
        else:
            # Simple word tokenization for other languages
            tokens = re.findall(r'\b\w+\b', text)
            return tokens
    
    def _tokenize_chinese(self, text: str) -> List[str]:
        """Tokenize Chinese text using jieba"""
        try:
            import jieba
            if not self._jieba_loaded:
                jieba.setLogLevel(20)  # Suppress jieba logs
                self._jieba_loaded = True
            return list(jieba.cut(text))
        except ImportError:
            # Fallback: character-based tokenization
            return list(text)
    
    def remove_stopwords(self, tokens: List[str]) -> List[str]:
        """Remove stopwords from token list"""
        if not self.config.remove_stopwords:
            return tokens
        
        all_stopwords = self._stopwords | self._custom_stopwords
        return [t for t in tokens if t.lower() not in all_stopwords and t.strip()]
    
    def apply_advanced_cleaning(self, text: str) -> str:
        """Apply advanced regex-based cleaning patterns"""
        for pattern in self._advanced_patterns:
            text = pattern.sub('', text)
        return text
    
    def extract_entities(self, text: str) -> List[Entity]:
        """
        Extract named entities using spaCy
        Returns empty list if spaCy not available
        """
        if not self.config.extract_entities:
            return []
        
        try:
            if self._spacy_model is None:
                import spacy
                # Try to load English model first
                try:
                    self._spacy_model = spacy.load('en_core_web_sm')
                except OSError:
                    return []
            
            doc = self._spacy_model(text)
            entities = []
            for ent in doc.ents:
                entities.append(Entity(
                    text=ent.text,
                    label=ent.label_,
                    start=ent.start_char,
                    end=ent.end_char
                ))
            return entities
            
        except ImportError:
            return []
    
    def process(self, text: str) -> PreprocessResult:
        """
        Main preprocessing pipeline
        
        Steps:
        1. Advanced cleaning (regex patterns)
        2. Normalization
        3. Lowercase conversion
        4. Punctuation removal
        5. Tokenization
        6. Stopword removal
        7. Entity extraction (optional)
        """
        original_text = text
        
        # Step 1: Advanced cleaning
        if self._advanced_patterns:
            text = self.apply_advanced_cleaning(text)
        
        # Step 2: Normalize
        text = self.normalize(text)
        
        # Step 3: Lowercase
        if self.config.to_lowercase:
            text = text.lower()
        
        # Step 4: Remove punctuation
        text = self.remove_punctuation(text)
        
        # Step 5: Tokenize
        tokens = self.tokenize(text)
        
        # Step 6: Remove stopwords
        tokens = self.remove_stopwords(tokens)
        
        # Step 7: Extract entities (from original text)
        entities = self.extract_entities(original_text) if self.config.extract_entities else None
        
        processed_text = ' '.join(tokens)
        
        return PreprocessResult(
            original_text=original_text,
            processed_text=processed_text,
            tokens=tokens,
            entities=entities,
            word_count=len(tokens)
        )


def preprocess_texts(
    texts: List[tuple],  # List of (text_id, content)
    config: PreprocessConfig
) -> List[tuple]:
    """
    Preprocess multiple texts
    
    Args:
        texts: List of (text_id, content) tuples
        config: Preprocessing configuration
    
    Returns:
        List of (text_id, PreprocessResult) tuples
    """
    preprocessor = TextPreprocessor(config)
    results = []
    
    for text_id, content in texts:
        result = preprocessor.process(content)
        results.append((text_id, result))
    
    return results


def preprocess_single(text: str, config: PreprocessConfig = None) -> PreprocessResult:
    """
    Preprocess a single text
    
    Args:
        text: Text to preprocess
        config: Optional preprocessing configuration
    
    Returns:
        PreprocessResult
    """
    if config is None:
        config = PreprocessConfig()
    
    preprocessor = TextPreprocessor(config)
    return preprocessor.process(text)


# Convenience function for quick preprocessing
def quick_preprocess(
    text: str,
    language: str = "english",
    lowercase: bool = True,
    remove_stopwords: bool = True,
    remove_punct: bool = True
) -> str:
    """
    Quick preprocessing with minimal configuration
    
    Args:
        text: Text to preprocess
        language: Stopwords language
        lowercase: Convert to lowercase
        remove_stopwords: Remove stopwords
        remove_punct: Remove punctuation
    
    Returns:
        Processed text string
    """
    config = PreprocessConfig(
        normalize_text=True,
        remove_punctuation=remove_punct,
        to_lowercase=lowercase,
        remove_stopwords=remove_stopwords,
        stopwords_language=language,
        tokenize=True,
        extract_entities=False
    )
    
    result = preprocess_single(text, config)
    return result.processed_text
