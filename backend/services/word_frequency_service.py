"""
Word Frequency Analysis Service
Provides word frequency statistics using SpaCy annotation data
"""

import os
import re
import json
import logging
import sys
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import Counter
from pathlib import Path

from models.database import TextDB, CorpusDB

# Add parent directory to path for config
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import MODELS_DIR

logger = logging.getLogger(__name__)


# SpaCy Universal POS tags
SPACY_POS_TAGS = [
    "ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN",
    "NUM", "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "VERB", "X"
]

# NLTK stopwords directory
NLTK_STOPWORDS_DIR = MODELS_DIR / "nltk" / "corpora" / "stopwords"

# Language name mapping (corpus language -> NLTK stopwords file name)
LANGUAGE_MAPPING = {
    'chinese': 'chinese',
    'zh': 'chinese',
    '中文': 'chinese',
    'english': 'english',
    'en': 'english',
    '英文': 'english',
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
    'dutch': 'dutch',
    'nl': 'dutch',
    'swedish': 'swedish',
    'sv': 'swedish',
    'norwegian': 'norwegian',
    'no': 'norwegian',
    'danish': 'danish',
    'da': 'danish',
    'finnish': 'finnish',
    'fi': 'finnish',
    'greek': 'greek',
    'el': 'greek',
    'turkish': 'turkish',
    'tr': 'turkish',
    'polish': 'polish',
    'pl': 'polish',
    'czech': 'czech',
    'cs': 'czech',
    'hungarian': 'hungarian',
    'hu': 'hungarian',
    'romanian': 'romanian',
    'ro': 'romanian',
    'indonesian': 'indonesian',
    'id': 'indonesian',
}


class WordFrequencyService:
    """Word frequency analysis service using SpaCy annotations"""
    
    def __init__(self):
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
    
    def analyze(
        self,
        corpus_id: str,
        text_ids: List[str] | str = "all",
        pos_filter: Optional[Dict[str, Any]] = None,
        search_config: Optional[Dict[str, Any]] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        lowercase: bool = True,
        search_target: str = "word",
        language: str = "english"
    ) -> Dict[str, Any]:
        """
        Perform word frequency analysis
        
        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all" for all texts
            pos_filter: POS filter config {selectedPOS: [], keepMode: bool}
            search_config: Search config {searchType, searchValue, excludeWords, searchTarget, removeStopwords}
            min_freq: Minimum frequency threshold
            max_freq: Maximum frequency threshold (optional)
            lowercase: Convert all to lowercase
            search_target: "word" for word form, "lemma" for lemma form (uses SpaCy annotation)
            language: Language for stopwords (e.g., 'english', 'chinese')
            
        Returns:
            Analysis results with word frequencies
        """
        try:
            # Get texts from corpus
            if text_ids == "all":
                texts = TextDB.list_by_corpus(corpus_id)
            else:
                texts = [TextDB.get_by_id(tid) for tid in text_ids if TextDB.get_by_id(tid)]
            
            if not texts:
                return {
                    "success": False,
                    "error": "No texts found in corpus",
                    "results": []
                }
            
            # Get search target from search_config or use parameter
            target = search_target
            if search_config and "searchTarget" in search_config:
                target = search_config.get("searchTarget", "word")
            
            # Collect all tokens from SpaCy annotations
            all_tokens = []
            
            for text in texts:
                tokens = self._get_tokens_from_text(text, pos_filter, lowercase, target)
                all_tokens.extend(tokens)
            
            if not all_tokens:
                return {
                    "success": True,
                    "results": [],
                    "total_tokens": 0,
                    "unique_words": 0
                }
            
            # Count word frequencies
            word_counts = Counter(all_tokens)
            
            # Apply frequency filters
            filtered_counts = self._apply_frequency_filters(
                word_counts, min_freq, max_freq
            )
            
            # Apply search filters (including stopwords removal)
            if search_config:
                filtered_counts = self._apply_search_filters(
                    filtered_counts, search_config, language
                )
            
            # Calculate results
            total_filtered = sum(filtered_counts.values())
            results = []
            
            for rank, (word, count) in enumerate(
                sorted(filtered_counts.items(), key=lambda x: x[1], reverse=True), 
                start=1
            ):
                percentage = (count / total_filtered * 100) if total_filtered > 0 else 0
                results.append({
                    "word": word,
                    "frequency": count,
                    "percentage": round(percentage, 4),
                    "rank": rank
                })
            
            return {
                "success": True,
                "results": results,
                "total_tokens": len(all_tokens),
                "unique_words": len(filtered_counts)
            }
            
        except Exception as e:
            logger.error(f"Word frequency analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }
    
    def _get_tokens_from_text(
        self,
        text: Dict[str, Any],
        pos_filter: Optional[Dict[str, Any]],
        lowercase: bool,
        search_target: str = "word"
    ) -> List[str]:
        """
        Extract tokens from a text's SpaCy annotation
        
        Args:
            text: Text database entry
            pos_filter: POS filter config
            lowercase: Whether to lowercase tokens
            search_target: "word" for word form, "lemma" for lemma form
            
        Returns:
            List of tokens
        """
        tokens = []
        
        # Get SpaCy annotation data
        spacy_data = self._load_spacy_annotation(text)
        if not spacy_data:
            return tokens
        
        # Handle different annotation formats
        if "tokens" in spacy_data:
            # Standard text annotation format
            tokens = self._extract_from_tokens(
                spacy_data["tokens"], pos_filter, lowercase, search_target
            )
        elif "segments" in spacy_data:
            # Segment-based annotation format (for audio/video)
            for seg_id, seg_data in spacy_data["segments"].items():
                if "tokens" in seg_data:
                    seg_tokens = self._extract_from_tokens(
                        seg_data["tokens"], pos_filter, lowercase, search_target
                    )
                    tokens.extend(seg_tokens)
        
        return tokens
    
    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Load SpaCy annotation for a text
        
        Args:
            text: Text database entry
            
        Returns:
            SpaCy annotation data or None
        """
        media_type = text.get('media_type', 'text')
        
        # For audio/video, check transcript JSON first
        if media_type in ['audio', 'video']:
            transcript_json = text.get('transcript_json_path')
            if transcript_json and os.path.exists(transcript_json):
                try:
                    with open(transcript_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if 'spacy_annotations' in data:
                        return data['spacy_annotations']
                except Exception as e:
                    logger.warning(f"Failed to load transcript SpaCy: {e}")
        
        # For plain text, use .spacy.json file
        content_path = text.get('content_path')
        if not content_path:
            return None
        
        content_path = Path(content_path)
        spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
        
        if spacy_path.exists():
            try:
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load SpaCy annotation: {e}")
        
        return None
    
    def _extract_from_tokens(
        self,
        tokens: List[Dict[str, Any]],
        pos_filter: Optional[Dict[str, Any]],
        lowercase: bool,
        search_target: str = "word"
    ) -> List[str]:
        """
        Extract word strings from token data
        
        Args:
            tokens: List of token dictionaries from SpaCy
            pos_filter: POS filter config
            lowercase: Whether to lowercase
            search_target: "word" for word form, "lemma" for lemma form
            
        Returns:
            List of word strings
        """
        result = []
        
        selected_pos = pos_filter.get("selectedPOS", []) if pos_filter else []
        keep_mode = pos_filter.get("keepMode", True) if pos_filter else True
        
        for token in tokens:
            # Skip punctuation, spaces, and stop words by default
            if token.get("is_punct") or token.get("is_space"):
                continue
            
            # Get text based on search target
            if search_target == "lemma":
                # Use lemma from SpaCy annotation
                text = token.get("lemma", token.get("text", ""))
            else:
                # Use word form (default)
                text = token.get("text", "")
            
            pos = token.get("pos", "")
            
            # Skip empty tokens
            if not text.strip():
                continue
            
            # Apply POS filter if configured
            # Note: In keep mode with empty selection, no words will pass
            if selected_pos:
                if keep_mode:
                    # Keep only selected POS
                    if pos not in selected_pos:
                        continue
                else:
                    # Filter out selected POS
                    if pos in selected_pos:
                        continue
            elif keep_mode:
                # Keep mode with no selection - skip all (user should be warned)
                # Allow all tokens if no POS filter is set
                pass
            
            # Apply lowercase if requested
            if lowercase:
                text = text.lower()
            
            result.append(text)
        
        return result
    
    def _apply_frequency_filters(
        self,
        word_counts: Counter,
        min_freq: int,
        max_freq: Optional[int]
    ) -> Dict[str, int]:
        """
        Apply frequency filters to word counts
        
        Args:
            word_counts: Word frequency counter
            min_freq: Minimum frequency
            max_freq: Maximum frequency (optional)
            
        Returns:
            Filtered word counts
        """
        filtered = {}
        
        for word, count in word_counts.items():
            if count < min_freq:
                continue
            if max_freq is not None and count > max_freq:
                continue
            filtered[word] = count
        
        return filtered
    
    def _apply_search_filters(
        self,
        word_counts: Dict[str, int],
        search_config: Dict[str, Any],
        language: str = "english"
    ) -> Dict[str, int]:
        """
        Apply search filters to word counts
        
        Args:
            word_counts: Word frequency dictionary
            search_config: Search configuration
            language: Language for stopwords
            
        Returns:
            Filtered word counts
        """
        search_type = search_config.get("searchType", "all")
        search_value = search_config.get("searchValue", "").strip()
        exclude_words = search_config.get("excludeWords", [])
        remove_stopwords = search_config.get("removeStopwords", False)
        
        # Convert exclude list to set for faster lookup
        if isinstance(exclude_words, str):
            exclude_set = set(w.strip().lower() for w in exclude_words.split('\n') if w.strip())
        else:
            exclude_set = set(w.lower() for w in exclude_words)
        
        # Load stopwords if removal is enabled
        stopwords_set = set()
        if remove_stopwords:
            stopwords_set = self.load_stopwords(language)
            logger.info(f"Using {len(stopwords_set)} stopwords for language: {language}")
        
        filtered = {}
        
        for word, count in word_counts.items():
            word_lower = word.lower()
            
            # Apply stopwords filter
            if remove_stopwords and word_lower in stopwords_set:
                continue
            
            # Apply exclusion filter
            if word_lower in exclude_set:
                continue
            
            # Apply search filter
            if search_type == "all" or not search_value:
                filtered[word] = count
            elif search_type == "starts":
                if word_lower.startswith(search_value.lower()):
                    filtered[word] = count
            elif search_type == "ends":
                if word_lower.endswith(search_value.lower()):
                    filtered[word] = count
            elif search_type == "contains":
                if search_value.lower() in word_lower:
                    filtered[word] = count
            elif search_type == "regex":
                try:
                    if re.search(search_value, word, re.IGNORECASE):
                        filtered[word] = count
                except re.error:
                    # Invalid regex, skip this word
                    pass
            elif search_type == "wordlist":
                # Word list mode: one word per line
                wordlist = set(w.strip().lower() for w in search_value.split('\n') if w.strip())
                if word_lower in wordlist:
                    filtered[word] = count
        
        return filtered
    
    def get_available_pos_tags(self) -> List[Dict[str, str]]:
        """
        Get available SpaCy POS tags with descriptions
        
        Returns:
            List of POS tag info dictionaries
        """
        pos_descriptions = {
            "ADJ": {"en": "Adjective", "zh": "形容词"},
            "ADP": {"en": "Adposition", "zh": "介词"},
            "ADV": {"en": "Adverb", "zh": "副词"},
            "AUX": {"en": "Auxiliary verb", "zh": "助动词"},
            "CCONJ": {"en": "Coordinating conjunction", "zh": "并列连词"},
            "DET": {"en": "Determiner", "zh": "限定词"},
            "INTJ": {"en": "Interjection", "zh": "感叹词"},
            "NOUN": {"en": "Noun", "zh": "名词"},
            "NUM": {"en": "Numeral", "zh": "数词"},
            "PART": {"en": "Particle", "zh": "助词"},
            "PRON": {"en": "Pronoun", "zh": "代词"},
            "PROPN": {"en": "Proper noun", "zh": "专有名词"},
            "PUNCT": {"en": "Punctuation", "zh": "标点"},
            "SCONJ": {"en": "Subordinating conjunction", "zh": "从属连词"},
            "SYM": {"en": "Symbol", "zh": "符号"},
            "VERB": {"en": "Verb", "zh": "动词"},
            "X": {"en": "Other", "zh": "其他"}
        }
        
        return [
            {
                "tag": tag,
                "description_en": pos_descriptions.get(tag, {}).get("en", tag),
                "description_zh": pos_descriptions.get(tag, {}).get("zh", tag)
            }
            for tag in SPACY_POS_TAGS
        ]


# Singleton instance
_word_frequency_service = None


def get_word_frequency_service() -> WordFrequencyService:
    """Get WordFrequencyService singleton"""
    global _word_frequency_service
    if _word_frequency_service is None:
        _word_frequency_service = WordFrequencyService()
    return _word_frequency_service

