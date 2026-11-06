"""
NRC Emotion Lexicon service for sentiment annotation.
Loads user-imported NRC-EmoLex dictionaries and annotates token lists with emotion scores.
"""

import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))


logger = logging.getLogger(__name__)

# Emotion dimension keys in lexicon order (columns 1-10 in TSV)
NRC_EMOTIONS = [
    "anger", "anticipation", "disgust", "fear", "joy",
    "negative", "positive", "sadness", "surprise", "trust"
]

# Language → (filename, key_column_index)
# Column 0 = word in that language; columns 1-10 = emotion scores
NRC_FILES = {
    # (filename, word_column_index)
    # English: column 0 (English Word); all others: column 11 (translated word)
    "english":    ("English-NRC-EmoLex.txt", 0),
    "chinese":    ("Chinese-Simplified-NRC-EmoLex.txt", 11),
    "danish":     ("Danish-NRC-EmoLex.txt", 11),
    "dutch":      ("Dutch-NRC-EmoLex.txt", 11),
    "finnish":    ("Finnish-NRC-EmoLex.txt", 11),
    "french":     ("French-NRC-EmoLex.txt", 11),
    "italian":    ("Italian-NRC-EmoLex.txt", 11),
    "portuguese": ("Portuguese-NRC-EmoLex.txt", 11),
    "russian":    ("Russian-NRC-EmoLex.txt", 11),
    "spanish":    ("Spanish-NRC-EmoLex.txt", 11),
    "swedish":    ("Swedish-NRC-EmoLex.txt", 11),
}

# ISO / variant aliases → canonical name
_NRC_LANG_ALIASES = {
    "en": "english", "zh": "chinese", "zh-cn": "chinese", "mandarin": "chinese", "cmn": "chinese",
    "中文": "chinese", "英文": "english",
    "da": "danish", "nl": "dutch", "fi": "finnish", "fr": "french",
    "it": "italian", "pt": "portuguese", "ru": "russian", "es": "spanish", "sv": "swedish",
}


def _normalize_language(lang: str) -> str:
    if not lang:
        return "english"
    normalized = lang.lower().strip()
    return _NRC_LANG_ALIASES.get(normalized, normalized)


def _empty_scores() -> Dict[str, int]:
    return {e: 0 for e in NRC_EMOTIONS}


def load_lexicon(language: str) -> Optional[Dict[str, Dict[str, int]]]:
    """Load only explicitly imported resources, without a language fallback."""
    import json
    from services.user_resource_store import list_resources, resource_path
    lang = _normalize_language(language)
    for meta in reversed(list_resources("nrc")):
        if lang in meta.get("languages", {}):
            path = resource_path("nrc", meta["id"]) / f"{lang}.json"
            return json.loads(path.read_text(encoding="utf-8"))
    return None


class NRCService:
    """Service for NRC emotion lexicon lookup and token annotation."""

    def __init__(self):
        self._cache = {}
        self._resource_signature = None

    def _get_lexicon(self, language: str) -> Optional[Dict[str, Dict[str, int]]]:
        from services.user_resource_store import list_resources
        signature = tuple(m["id"] for m in list_resources("nrc"))
        if signature != self._resource_signature:
            self._cache.clear()
            self._resource_signature = signature
        lang = _normalize_language(language)
        if lang not in self._cache:
            self._cache[lang] = load_lexicon(language)
        return self._cache[lang]

    def is_available(self, language: str) -> bool:
        return self._get_lexicon(language) is not None

    def clear_cache(self):
        self._cache.clear()
        self._resource_signature = None

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
            scores = lexicon.get(key, lexicon.get(key.lower(), _empty_scores()))
            result.append(dict(scores))
        return result


_nrc_service: Optional[NRCService] = None


def get_nrc_service() -> NRCService:
    global _nrc_service
    if _nrc_service is None:
        _nrc_service = NRCService()
    return _nrc_service
