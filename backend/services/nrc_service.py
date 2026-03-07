"""
NRC Emotion Lexicon service for sentiment annotation.
Loads NRC-EmoLex dictionaries from saves/nrc and annotates token lists with emotion scores.
"""

import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import get_saves_dir

logger = logging.getLogger(__name__)

# Emotion dimension keys in lexicon order (columns 1-10 in TSV)
NRC_EMOTIONS = [
    "anger", "anticipation", "disgust", "fear", "joy",
    "negative", "positive", "sadness", "surprise", "trust"
]

# Language -> (filename, key_column_index). English: first column; Chinese: last column
NRC_FILES = {
    "english": ("English-NRC-EmoLex.txt", 0),
    "en": ("English-NRC-EmoLex.txt", 0),
    "chinese": ("Chinese-Simplified-NRC-EmoLex.txt", 11),
    "zh": ("Chinese-Simplified-NRC-EmoLex.txt", 11),
    "中文": ("Chinese-Simplified-NRC-EmoLex.txt", 11),
    "英文": ("English-NRC-EmoLex.txt", 0),
}


def _normalize_language(lang: str) -> str:
    if not lang:
        return "english"
    return lang.lower().strip()


def _empty_scores() -> Dict[str, int]:
    return {e: 0 for e in NRC_EMOTIONS}


def load_lexicon(language: str) -> Optional[Dict[str, Dict[str, int]]]:
    """
    Load NRC lexicon for the given language. Cached per language.
    English: key = first column (English Word).
    Chinese: key = last column (Chinese-Simplified Word).
    Returns dict: word -> { emotion -> 0|1 }.
    """
    lang = _normalize_language(language)
    entry = NRC_FILES.get(lang)
    if not entry:
        logger.warning(f"NRC lexicon not configured for language: {lang}, using English")
        entry = NRC_FILES["english"]

    filename, key_col = entry
    nrc_dir = get_saves_dir() / "nrc"
    path = nrc_dir / filename
    if not path.exists():
        logger.warning(f"NRC lexicon not found: {path}")
        return None

    lexicon = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if not lines:
            return None
        # Skip header
        for line in lines[1:]:
            parts = line.strip().split("\t")
            if len(parts) <= max(key_col, 10):
                continue
            key = parts[key_col].strip()
            if not key:
                continue
            scores = _empty_scores()
            for i, emo in enumerate(NRC_EMOTIONS):
                if i + 1 < len(parts):
                    try:
                        scores[emo] = int(parts[i + 1])
                    except ValueError:
                        scores[emo] = 0
            lexicon[key] = scores
        logger.info(f"Loaded NRC lexicon: {path.name}, {len(lexicon)} entries")
        return lexicon
    except Exception as e:
        logger.error(f"Failed to load NRC lexicon {path}: {e}")
        return None


class NRCService:
    """Service for NRC emotion lexicon lookup and token annotation."""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Dict[str, int]]] = {}

    def _get_lexicon(self, language: str) -> Optional[Dict[str, Dict[str, int]]]:
        lang = _normalize_language(language)
        if lang not in self._cache:
            self._cache[lang] = load_lexicon(language)
        return self._cache[lang]

    def is_available(self, language: str) -> bool:
        return self._get_lexicon(language) is not None

    def annotate_tokens(
        self,
        tokens: List[Dict[str, Any]],
        language: str,
        search_target: str = "word",
    ) -> List[Dict[str, int]]:
        """
        For each token, look up NRC scores. Tokens are dicts with 'text' and optionally 'lemma'.
        search_target: 'word' -> use token['text'], 'lemma' -> use token.get('lemma', token['text']).
        Returns list of score dicts (same length as tokens); missing words get all zeros.
        """
        lexicon = self._get_lexicon(language)
        if not lexicon:
            return [_empty_scores() for _ in tokens]

        result = []
        for t in tokens:
            if search_target == "lemma":
                key = (t.get("lemma") or t.get("text") or "").strip()
            else:
                key = (t.get("text") or "").strip()
            scores = lexicon.get(key, _empty_scores())
            result.append(dict(scores))
        return result


_nrc_service: Optional[NRCService] = None


def get_nrc_service() -> NRCService:
    global _nrc_service
    if _nrc_service is None:
        _nrc_service = NRCService()
    return _nrc_service
