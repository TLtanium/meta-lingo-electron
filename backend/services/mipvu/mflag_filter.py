"""
MFlag (Metaphor Flag) Lexicon Filter

Provides sentence-level pre-filtering for direct metaphor detection.
Sentences containing at least one mflag candidate word are passed to the
direct metaphor model; others are skipped.

Lexicon source: MIPVU §2.6 (Steen et al. 2010).
"""

import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Set, Tuple

logger = logging.getLogger(__name__)

# Single-word mflag candidates (lowercase).
# NOTE: 'of' and 'with' were in the original Steen et al. list (F_other_attested)
# but require specific syntactic context (appositive / cross-domain accompaniment
# structures) that cannot be checked by simple word-form matching.  Including them
# as plain single-word triggers would cause nearly every English sentence to pass
# the pre-filter, eliminating the performance benefit of sentence-level gating.
# They are therefore excluded here; the direct-metaphor model handles them when the
# sentence is already triggered by another MFlag indicator.
_MFLAG_SINGLE_WORDS: Set[str] = {
    'like', 'as', 'more', 'less', 'compare', 'comparison', 'comparative',
    'same', 'similar', 'analogy', 'analogue', 'resemble', 'resemblance',
    'remind', 'reminiscent', 'imagine', 'imagined', 'think', 'talk',
    'seem', 'seemed', 'seemingly', 'appear', 'appeared', 'apparent',
    'apparently', 'appearance', 'metaphorical', 'metaphorically',
    'figurative', 'so-called', 'constitute', 'term', 'mistake',
    'shape', 'taste',
}

# Categories whose items require specific syntactic/semantic context beyond
# simple word-form matching and should NOT be used as plain single-word triggers.
_CONTEXT_REQUIRED_CATEGORIES: frozenset = frozenset({'F_other_attested'})

# Multi-word mflag candidates (lowercase)
_MFLAG_MULTI_WORDS: Tuple[str, ...] = (
    'as if', 'as though', 'regard as', 'conceive of', 'see as', 'behave as if',
)

# Suffix-based mflag markers
_MFLAG_SUFFIXES: Tuple[str, ...] = ('-like', '-shaped')


def _load_lexicon_words() -> Tuple[Set[str], Tuple[str, ...], Tuple[str, ...]]:
    """Load word sets from lexicon JSON if available; fall back to hard-coded set."""
    lexicon_path = Path(__file__).parent.parent.parent.parent / 'saves' / 'mipvu' / 'mflag_lexicon.json'
    if not lexicon_path.exists():
        logger.debug(f"mflag lexicon not found at {lexicon_path}, using built-in set")
        return _MFLAG_SINGLE_WORDS, _MFLAG_MULTI_WORDS, _MFLAG_SUFFIXES

    try:
        with open(lexicon_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        single: Set[str] = set()
        multi: List[str] = []
        suffixes: List[str] = []

        for cat_name, cat in data.get('categories', {}).items():
            # Skip categories whose items need syntactic context for valid MFlag
            # detection — simple word-form matching produces too many false positives.
            skip_single = cat_name in _CONTEXT_REQUIRED_CATEGORIES
            for item in cat.get('items', []) + cat.get('multi_word_items', []):
                w = item.get('form', '').strip().lower()
                if not w:
                    continue
                if any(c in w for c in ('...', '[', '/')):
                    continue  # skip pattern placeholders
                if w.startswith('-'):
                    suffixes.append(w)
                elif ' ' in w:
                    multi.append(w)
                elif not skip_single:
                    single.add(w)

        logger.debug(f"Loaded mflag lexicon: {len(single)} single, {len(multi)} multi-word, {len(suffixes)} suffixes")
        return single or _MFLAG_SINGLE_WORDS, tuple(multi) or _MFLAG_MULTI_WORDS, tuple(suffixes) or _MFLAG_SUFFIXES

    except Exception as e:
        logger.warning(f"Failed to load mflag lexicon: {e}; using built-in set")
        return _MFLAG_SINGLE_WORDS, _MFLAG_MULTI_WORDS, _MFLAG_SUFFIXES


# Module-level cache
_SINGLE_WORDS: Set[str] | None = None
_MULTI_WORDS: Tuple[str, ...] | None = None
_SUFFIXES: Tuple[str, ...] | None = None


def _ensure_loaded() -> Tuple[Set[str], Tuple[str, ...], Tuple[str, ...]]:
    global _SINGLE_WORDS, _MULTI_WORDS, _SUFFIXES
    if _SINGLE_WORDS is None:
        _SINGLE_WORDS, _MULTI_WORDS, _SUFFIXES = _load_lexicon_words()
    return _SINGLE_WORDS, _MULTI_WORDS, _SUFFIXES


def sentence_has_mflag(tokens: List[Dict[str, Any]]) -> bool:
    """
    Return True if the sentence contains at least one mflag candidate.

    Checks both word form and lemma so that inflected forms (e.g. "thinking"
    → lemma "think", "resembles" → lemma "resemble") are correctly matched.

    Args:
        tokens: List of token dicts from SpaCy (must have 'word' key;
                'lemma' key is used when available for inflection robustness).
    """
    single, multi, suffixes = _ensure_loaded()

    words_lower = [t.get('word', '').lower() for t in tokens]
    # Also collect lemmas for inflection-robust matching
    lemmas_lower = [t.get('lemma', '').lower() for t in tokens]
    sent_text = ' '.join(words_lower)

    # Single-word check — match against either word form OR lemma
    for i, w in enumerate(words_lower):
        lem = lemmas_lower[i]
        if w in single or (lem and lem in single):
            return True
        for suf in suffixes:
            if w.endswith(suf):
                return True

    # Multi-word phrase check (uses word-form sentence text)
    for phrase in multi:
        if phrase in sent_text:
            return True

    return False


def get_mflag_token_indices(tokens: List[Dict[str, Any]]) -> List[int]:
    """
    Return indices of tokens in the sentence that are mflag candidates.

    This is used for soft highlighting; the model decides the final labeling.
    Checks both word form and lemma for inflection robustness.
    """
    single, multi, suffixes = _ensure_loaded()
    indices: Set[int] = set()

    words_lower = [t.get('word', '').lower() for t in tokens]
    lemmas_lower = [t.get('lemma', '').lower() for t in tokens]
    sent_text = ' '.join(words_lower)

    for i, w in enumerate(words_lower):
        lem = lemmas_lower[i]
        if w in single or (lem and lem in single):
            indices.add(i)
        for suf in suffixes:
            if w.endswith(suf):
                indices.add(i)

    # Multi-word: mark all constituent token positions
    for phrase in multi:
        parts = phrase.split()
        n = len(parts)
        for start in range(len(words_lower) - n + 1):
            if words_lower[start:start + n] == parts:
                for j in range(start, start + n):
                    indices.add(j)

    return sorted(indices)
