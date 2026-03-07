"""
Word cloud (word frequency) service for bibliographic visualization.
Aggregates title or abstract text from filtered entries, tokenizes with regex,
and returns top words with frequency, percentage, and rank.
Uses only standard library: re, collections.Counter.
"""

import re
from collections import Counter
from typing import List, Dict, Any, Literal

# Minimal stopwords to reduce noise (English + common Chinese)
STOPWORDS = frozenset({
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
    '的', '是', '在', '和', '与', '及', '或', '等', '之', '了', '着', '过',
    '这', '那', '其', '中', '有', '为', '被', '把', '让', '给', '对', '向',
})


def tokenize(text: str) -> List[str]:
    """
    Extract tokens: alphanumeric words and CJK characters.
    English tokens are lowercased; tokens with length < 2 are dropped.
    """
    if not text or not isinstance(text, str):
        return []
    # Match word characters (letters, digits) and CJK range
    raw = re.findall(r'[\w\u4e00-\u9fff]+', text)
    result = []
    for t in raw:
        # Lowercase if purely ASCII letters
        if t.isascii() and t.isalpha():
            t = t.lower()
        if len(t) >= 2 and t not in STOPWORDS:
            result.append(t)
    return result


def build_wordcloud(
    entries: List[Dict[str, Any]],
    source: Literal['title', 'abstract'] = 'abstract',
    max_words: int = 100,
) -> List[Dict[str, Any]]:
    """
    Build word frequency list from entries.
    :param entries: List of entry dicts with 'title' and/or 'abstract'.
    :param source: 'title' or 'abstract'.
    :param max_words: Maximum number of words to return (default 100).
    :return: List of dicts: word, frequency, percentage, rank (1-based).
    """
    key = 'title' if source == 'title' else 'abstract'
    parts = []
    for entry in entries:
        val = entry.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(val.strip())
    if not parts:
        return []

    full_text = ' '.join(parts)
    tokens = tokenize(full_text)
    if not tokens:
        return []

    counter = Counter(tokens)
    total = sum(counter.values())
    sorted_items = counter.most_common(max_words)

    result = []
    for rank, (word, freq) in enumerate(sorted_items, start=1):
        pct = (freq / total * 100) if total else 0
        result.append({
            'word': word,
            'frequency': freq,
            'percentage': round(pct, 2),
            'rank': rank,
        })
    return result
