"""
Exclusion Words Utility
=======================
Shared helper for regex-aware exclusion word filtering, used across all
analysis modules (word frequency, n-gram, keyword, collocation, sketch,
semantic analysis, metaphor analysis, topic modeling, etc.).

Usage::

    from utils.exclusion_utils import compile_exclusion_patterns, matches_exclusion

    patterns = compile_exclusion_patterns(["the", "\\d+", "^un.*"])
    for word in words:
        if matches_exclusion(word, patterns):
            continue  # skip excluded word

Each entry in the exclusion list is first tried as a regular expression.
If the pattern is invalid regex, it falls back to exact case-insensitive
matching (via ``re.escape``).  This means:

- Plain words (``"the"``, ``"他"``): work exactly as before.
- Regex patterns (``"\\d+"`` to exclude all-digit tokens, ``"^un.*"`` for
  un-prefixed words, ``"\\d{4}[年月日]"`` for Chinese date tokens): work as
  full-match patterns (``re.fullmatch``).
"""

import re
import logging
from typing import List

logger = logging.getLogger(__name__)


def compile_exclusion_patterns(exclusion_words: List[str]) -> List[re.Pattern]:
    """Compile a list of exclusion word entries into regex patterns.

    Each entry is first tried as a regex; if the pattern is invalid it falls
    back to ``re.escape(entry)`` (exact-match literal).  Patterns are compiled
    with ``re.IGNORECASE`` so plain-word entries behave like the previous
    case-insensitive exact-match sets.

    Args:
        exclusion_words: List of exclusion strings (plain words or regex).

    Returns:
        List of compiled ``re.Pattern`` objects ready for ``fullmatch``.
    """
    compiled: List[re.Pattern] = []
    for entry in exclusion_words:
        entry = entry.strip()
        if not entry:
            continue
        try:
            compiled.append(re.compile(entry, re.IGNORECASE))
        except re.error:
            compiled.append(re.compile(re.escape(entry), re.IGNORECASE))
    return compiled


def matches_exclusion(word: str, patterns: List[re.Pattern]) -> bool:
    """Check whether *word* matches any of the compiled exclusion patterns.

    Uses ``re.fullmatch`` so a pattern like ``\\d+`` only matches a token that
    is *entirely* numeric, not one that merely *contains* digits.

    Args:
        word: The word/token to test.
        patterns: Compiled patterns from :func:`compile_exclusion_patterns`.

    Returns:
        ``True`` if the word should be excluded, ``False`` otherwise.
    """
    for pattern in patterns:
        if pattern.fullmatch(word):
            return True
    return False


def normalize_exclusion_words(exclusion_words) -> List[str]:
    """Normalize the exclusion_words input to a clean list of strings.

    Accepts:
    - A list of strings (the normal frontend format).
    - A newline-delimited string (legacy / MCP text format).
    - ``None`` or empty values.

    Args:
        exclusion_words: Raw exclusion words from request payload.

    Returns:
        Cleaned list of non-empty strings.
    """
    if not exclusion_words:
        return []
    if isinstance(exclusion_words, str):
        return [w.strip() for w in exclusion_words.split('\n') if w.strip()]
    return [str(w).strip() for w in exclusion_words if w and str(w).strip()]
