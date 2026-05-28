"""
Collocation Analysis Service
Performs window-based collocation analysis with multiple statistical measures.
Uses SpaCy annotation data from TextDB.
"""

import os
import json
import logging
import sys
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import Counter, defaultdict
from pathlib import Path

from models.database import TextDB, CorpusDB

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import MODELS_DIR

from .statistics import compute_statistics
from utils.exclusion_utils import compile_exclusion_patterns, matches_exclusion, normalize_exclusion_words

logger = logging.getLogger(__name__)

# NLTK stopwords directory
NLTK_STOPWORDS_DIR = MODELS_DIR / "nltk" / "corpora" / "stopwords"

# Language name mapping (reuse from word_frequency_service)
LANGUAGE_MAPPING = {
    'chinese': 'chinese', 'zh': 'chinese', '中文': 'chinese',
    'english': 'english', 'en': 'english', '英文': 'english',
    'german': 'german', 'de': 'german',
    'french': 'french', 'fr': 'french',
    'spanish': 'spanish', 'es': 'spanish',
    'italian': 'italian', 'it': 'italian',
    'portuguese': 'portuguese', 'pt': 'portuguese',
    'russian': 'russian', 'ru': 'russian',
    'japanese': 'japanese', 'ja': 'japanese',
    'korean': 'korean', 'ko': 'korean',
    'arabic': 'arabic', 'ar': 'arabic',
    'dutch': 'dutch', 'nl': 'dutch',
    'swedish': 'swedish', 'sv': 'swedish',
    'norwegian': 'norwegian', 'no': 'norwegian',
    'danish': 'danish', 'da': 'danish',
    'finnish': 'finnish', 'fi': 'finnish',
    'greek': 'greek', 'el': 'greek',
    'turkish': 'turkish', 'tr': 'turkish',
    'polish': 'polish', 'pl': 'polish',
    'czech': 'czech', 'cs': 'czech',
    'hungarian': 'hungarian', 'hu': 'hungarian',
    'romanian': 'romanian', 'ro': 'romanian',
    'indonesian': 'indonesian', 'id': 'indonesian',
}


class CollocationAnalysisService:
    """Collocation analysis service using SpaCy annotations"""

    def __init__(self):
        self._stopwords_cache: Dict[str, Set[str]] = {}

    def load_stopwords(self, language: str) -> Set[str]:
        """Load stopwords for a language from NLTK data"""
        lang_lower = language.lower().strip() if language else ''
        nltk_lang = LANGUAGE_MAPPING.get(lang_lower, lang_lower)

        if nltk_lang in self._stopwords_cache:
            return self._stopwords_cache[nltk_lang]

        stopwords = set()
        stopwords_file = NLTK_STOPWORDS_DIR / nltk_lang
        if stopwords_file.exists():
            try:
                with open(stopwords_file, 'r', encoding='utf-8') as f:
                    stopwords = set(word.strip().lower() for word in f if word.strip())
                logger.info(f"Loaded {len(stopwords)} stopwords for {nltk_lang}")
            except Exception as e:
                logger.error(f"Error loading stopwords for {nltk_lang}: {e}")

        self._stopwords_cache[nltk_lang] = stopwords
        return stopwords

    def analyze(
        self,
        corpus_id: str,
        text_ids: Any = "all",
        node_word: str = "",
        span: int = 5,
        pos_filter: Optional[Dict[str, Any]] = None,
        min_freq: int = 1,
        max_freq: Optional[int] = None,
        lowercase: bool = True,
        remove_stopwords: bool = False,
        exclude_words: Optional[List[str]] = None,
        statistics_methods: Optional[List[str]] = None,
        language: str = "english",
        match_mode: str = "lemma"
    ) -> Dict[str, Any]:
        """
        Perform collocation analysis for a node word.

        Args:
            corpus_id: Corpus ID
            text_ids: List of text IDs or "all"
            node_word: The target word to find collocates for
            span: Window size (tokens on each side of node)
            pos_filter: POS filter config {selectedPOS: [], keepMode: bool}
            min_freq: Minimum co-occurrence frequency
            max_freq: Maximum co-occurrence frequency (optional)
            lowercase: Convert to lowercase
            remove_stopwords: Remove stopwords from collocates
            exclude_words: Words to exclude from results
            statistics_methods: List of statistical measures to compute
            language: Language for stopwords
            match_mode: 'lemma' to match by lemma (default), 'word' to match by surface form

        Returns:
            Analysis results with collocates and statistical scores
        """
        if not node_word or not node_word.strip():
            return {
                "success": False,
                "error": "Node word is required",
                "results": []
            }

        if statistics_methods is None:
            statistics_methods = ["logdice", "mi", "deltap1", "deltap2"]

        # Compile exclusion patterns (supports regex)
        exclusion_patterns = compile_exclusion_patterns(normalize_exclusion_words(exclude_words))

        stopwords_set = set()
        if remove_stopwords:
            stopwords_set = self.load_stopwords(language)

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

            # Build token lists from all texts
            # Each token: (word, lemma, pos, is_punct, is_space)
            use_lemma = match_mode == 'lemma'
            all_token_lists = []
            for text in texts:
                token_list = self._get_token_list(text, lowercase)
                if token_list:
                    all_token_lists.append(token_list)

            if not all_token_lists:
                return {
                    "success": False,
                    "error": "No SpaCy annotations found. Please preprocess the corpus first.",
                    "results": []
                }

            # Normalize node word
            node_lower = node_word.strip().lower() if lowercase else node_word.strip()

            # Count frequencies and co-occurrences
            total_tokens = 0
            node_freq = 0
            collocate_freq = Counter()  # f_xy: co-occurrence count
            word_freq = Counter()        # f_y: total frequency of each word

            # POS filter config
            selected_pos = pos_filter.get("selectedPOS", []) if pos_filter else []
            keep_mode = pos_filter.get("keepMode", True) if pos_filter else True

            for token_list in all_token_lists:
                n = len(token_list)

                # Count total tokens and word frequencies (after POS filter)
                for i, tok in enumerate(token_list):
                    word, lemma, pos, is_punct, is_space = tok
                    match_key = lemma if use_lemma else word

                    if is_punct or is_space:
                        continue

                    # Apply POS filter
                    if not self._pass_pos_filter(pos, selected_pos, keep_mode):
                        continue

                    total_tokens += 1
                    word_freq[match_key] += 1

                # Find node word positions and collect collocates
                for i, tok in enumerate(token_list):
                    word, lemma, pos, is_punct, is_space = tok
                    match_key = lemma if use_lemma else word

                    if is_punct or is_space:
                        continue

                    # Check if this is the node word
                    if match_key != node_lower:
                        continue

                    # Apply POS filter to node word
                    if not self._pass_pos_filter(pos, selected_pos, keep_mode):
                        continue

                    node_freq += 1

                    # Collect collocates within window
                    start = max(0, i - span)
                    end = min(n, i + span + 1)

                    for j in range(start, end):
                        if j == i:
                            continue  # Skip the node word itself

                        coll_word, coll_lemma, coll_pos, coll_punct, coll_space = token_list[j]
                        coll_key = coll_lemma if use_lemma else coll_word

                        if coll_punct or coll_space:
                            continue

                        # Apply POS filter to collocate
                        if not self._pass_pos_filter(coll_pos, selected_pos, keep_mode):
                            continue

                        # Skip stopwords (check both word and lemma)
                        if remove_stopwords and (coll_word in stopwords_set or coll_lemma in stopwords_set):
                            continue

                        # Skip excluded words (regex-aware, check both word and lemma)
                        if exclusion_patterns and matches_exclusion(coll_key, exclusion_patterns):
                            continue

                        # Skip the node word as its own collocate
                        if coll_key == node_lower:
                            continue

                        collocate_freq[coll_key] += 1

            if node_freq == 0:
                return {
                    "success": True,
                    "node_word": node_word,
                    "total_tokens": total_tokens,
                    "unique_collocates": 0,
                    "node_frequency": 0,
                    "results": [],
                    "error": f"Node word '{node_word}' not found in corpus"
                }

            # Build results
            results = []
            for coll_key, f_xy in collocate_freq.items():
                # Apply frequency filters
                if f_xy < min_freq:
                    continue
                if max_freq is not None and f_xy > max_freq:
                    continue

                f_y = word_freq.get(coll_key, 0)

                # Compute requested statistics
                scores = compute_statistics(
                    f_xy=f_xy,
                    f_x=node_freq,
                    f_y=f_y,
                    N=total_tokens,
                    methods=statistics_methods
                )

                result_item = {
                    "collocate": coll_key,
                    "collocation_freq": f_xy,
                    "total_freq": f_y,
                }
                result_item.update(scores)
                results.append(result_item)

            # Sort by first enabled statistical method (default: logdice)
            sort_key = statistics_methods[0] if statistics_methods else "logdice"
            results.sort(key=lambda x: x.get(sort_key, 0), reverse=True)

            return {
                "success": True,
                "node_word": node_word,
                "total_tokens": total_tokens,
                "unique_collocates": len(results),
                "node_frequency": node_freq,
                "results": results
            }

        except Exception as e:
            logger.error(f"Collocation analysis error: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "results": []
            }

    def _pass_pos_filter(self, pos: str, selected_pos: List[str], keep_mode: bool) -> bool:
        """Check if a token passes the POS filter"""
        if not selected_pos:
            return True
        if keep_mode:
            return pos in selected_pos
        else:
            return pos not in selected_pos

    def _get_token_list(
        self,
        text: Dict[str, Any],
        lowercase: bool
    ) -> Optional[List[Tuple[str, str, str, bool, bool]]]:
        """
        Extract token list from a text's SpaCy annotation.

        Returns list of (word, lemma, pos, is_punct, is_space) tuples.
        """
        spacy_data = self._load_spacy_annotation(text)
        if not spacy_data:
            return None

        tokens = []

        if "tokens" in spacy_data:
            tokens = self._extract_token_tuples(spacy_data["tokens"], lowercase)
        elif "segments" in spacy_data:
            for seg_id, seg_data in spacy_data["segments"].items():
                if "tokens" in seg_data:
                    seg_tokens = self._extract_token_tuples(seg_data["tokens"], lowercase)
                    tokens.extend(seg_tokens)

        return tokens if tokens else None

    def _extract_token_tuples(
        self,
        tokens: List[Dict[str, Any]],
        lowercase: bool
    ) -> List[Tuple[str, str, str, bool, bool]]:
        """Extract (word, lemma, pos, is_punct, is_space) tuples from token data"""
        result = []
        for token in tokens:
            text = token.get("text", "")
            if not text.strip():
                continue

            lemma = token.get("lemma", text)
            if lowercase:
                text = text.lower()
                lemma = lemma.lower()

            pos = token.get("pos", "")
            is_punct = token.get("is_punct", False)
            is_space = token.get("is_space", False)

            result.append((text, lemma, pos, is_punct, is_space))

        return result

    def _load_spacy_annotation(self, text: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Load SpaCy annotation for a text (same pattern as word_frequency_service)"""
        media_type = text.get('media_type', 'text')

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


# Singleton instance
_collocation_analysis_service = None


def get_collocation_analysis_service() -> CollocationAnalysisService:
    """Get CollocationAnalysisService singleton"""
    global _collocation_analysis_service
    if _collocation_analysis_service is None:
        _collocation_analysis_service = CollocationAnalysisService()
    return _collocation_analysis_service
