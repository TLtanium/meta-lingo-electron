"""
Corpus resource CSV parsing (word / lemma frequencies).

Reference-corpus CSVs under saves/corpus/ are built from PyMUSAS **top-1** tagging:
one row per (word, lemma, pos, usas) and every token is counted exactly once, so the
`freq` column sums to the true token count. Keyness (word-form, lemma and semantic
domain) therefore uses plain counts on the reference side, the same basis as the
study corpus, which is also counted by its primary (top-1) USAS tag.

Note: user-corpus annotation (Corpus Management) still stores the top-5 candidates;
only the keyness computation reads the primary tag. Older reference CSVs were written
with top-5 "full counting" (every token once per candidate => 5x inflated); they have
been replaced and must not be put back without re-deflating.
"""

import csv
import logging
from pathlib import Path
from typing import Any, Dict, Tuple

logger = logging.getLogger(__name__)


def parse_frequency_csv(
    file_path: Path
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, int]]:
    """Parse a resource CSV into word and lemma frequencies.

    Returns:
        word_data:  surface form (original case) -> {word, lemma, pos, freq}
        lemma_freq: lemma (original case)        -> freq

    Rows are grouped by (word, lemma, pos) first, so a surface form that maps to
    several lemmas (e.g. "saw" -> see / saw) contributes to each lemma correctly.
    """
    groups: Dict[Tuple[str, str, str], int] = {}

    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Preferred: original-case word in 'Word' (normalize_corpus_word_column.py);
            # fall back to the legacy lowercase 'word' column.
            raw_word = (row.get('Word') or row.get('word') or '').strip()
            if not raw_word:
                continue
            lemma = (row.get('lemma') or raw_word).strip() or raw_word
            pos = (row.get('pos') or '').strip()
            try:
                freq = int(row.get('freq', 0))
            except (ValueError, TypeError):
                freq = 0
            key = (raw_word, lemma, pos)
            groups[key] = groups.get(key, 0) + freq

    word_data: Dict[str, Dict[str, Any]] = {}
    lemma_freq: Dict[str, int] = {}

    for (raw_word, lemma, pos), freq in groups.items():
        entry = word_data.get(raw_word)
        if entry is None:
            word_data[raw_word] = {'word': raw_word, 'lemma': lemma, 'pos': pos, 'freq': freq}
        else:
            entry['freq'] += freq
        lemma_freq[lemma] = lemma_freq.get(lemma, 0) + freq

    return word_data, lemma_freq
