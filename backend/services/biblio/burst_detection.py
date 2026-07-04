"""
Burst Detection Service for Bibliographic Visualization

Implements Kleinberg's (2002) two-state HMM burst detection using
dynamic programming (Viterbi-style) to find the optimal state sequence.
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math


def kleinberg_burst(
    counts: List[Tuple[int, int]],
    n_total: List[int],
    alpha: float = 1.0,
    gamma: float = 1.0,
) -> List[Tuple[int, int, float]]:
    """
    Kleinberg (2002) two-state HMM burst detection via Viterbi DP.

    State 0 = normal (background rate), State 1 = burst (elevated rate).
    Entering burst state costs alpha * log(T); leaving burst is free.

    Args:
        counts:  [(year, term_count), ...] sorted by year
        n_total: [total_docs_in_year, ...] aligned with counts
        alpha:   transition penalty scale (higher → fewer, longer bursts)
        gamma:   burst sensitivity (higher p1 → requires stronger signal)

    Returns:
        [(start_year, end_year, strength), ...]
    """
    T = len(counts)
    if T < 2:
        return []

    total_c = sum(c for _, c in counts)
    total_n = sum(n_total)
    if total_n == 0 or total_c == 0:
        return []

    p0 = total_c / total_n                       # background rate
    p1 = min(0.99, p0 * (1.0 + gamma))           # burst rate

    def _emit(c: int, n: int, p: float) -> float:
        """Negative log-likelihood of observing c successes in n trials with prob p."""
        p = max(1e-12, min(1.0 - 1e-12, p))
        return -(c * math.log(p) + (n - c) * math.log(1.0 - p))

    # Transition cost: entering burst (0→1) costs alpha*log(T); leaving (1→0) is free
    trans_cost = alpha * math.log(max(T, 2))

    # dp[s] = min cumulative cost in state s after processing time t
    dp = [_emit(counts[0][1], n_total[0], p0),
          _emit(counts[0][1], n_total[0], p1)]
    # path[t][s] = previous state that led to min cost in state s at time t
    path: List[List[int]] = [[0, 0]]

    for t in range(1, T):
        c, n = counts[t][1], n_total[t]
        emit0 = _emit(c, n, p0)
        emit1 = _emit(c, n, p1)

        # State 0: free transition from either state
        cost00 = dp[0] + emit0
        cost10 = dp[1] + emit0
        if cost00 <= cost10:
            new0, prev0 = cost00, 0
        else:
            new0, prev0 = cost10, 1

        # State 1: entering from 0 costs trans_cost; staying in 1 is free
        cost01 = dp[0] + trans_cost + emit1
        cost11 = dp[1] + emit1
        if cost01 <= cost11:
            new1, prev1 = cost01, 0
        else:
            new1, prev1 = cost11, 1

        dp = [new0, new1]
        path.append([prev0, prev1])

    # Traceback optimal state sequence
    states = [0] * T
    states[T - 1] = 0 if dp[0] <= dp[1] else 1
    for t in range(T - 2, -1, -1):
        states[t] = path[t + 1][states[t + 1]]

    # Extract contiguous burst periods with strength = actual_rate / background_rate
    results: List[Tuple[int, int, float]] = []
    i = 0
    while i < T:
        if states[i] == 1:
            j = i
            while j < T and states[j] == 1:
                j += 1
            burst_c = sum(counts[k][1] for k in range(i, j))
            burst_n = sum(n_total[k] for k in range(i, j))
            strength = (burst_c / burst_n) / p0 if (p0 > 0 and burst_n > 0) else 0.0
            results.append((counts[i][0], counts[j - 1][0], round(strength, 3)))
            i = j
        else:
            i += 1
    return results


class BurstDetector:
    """
    Burst detection using Kleinberg (2002) two-state HMM.

    Reference: Kleinberg, J. (2003). Bursty and hierarchical structure in streams.
    Data Mining and Knowledge Discovery, 7(4), 373-397.
    """

    def __init__(self, entries: List[Dict[str, Any]]):
        self.entries = entries
        self._prepare_time_series()

    def _prepare_time_series(self):
        """Prepare time-based data structures"""
        self.years = []
        self.year_entries = defaultdict(list)

        for entry in self.entries:
            year = entry.get('year')
            if year:
                self.year_entries[year].append(entry)
                if year not in self.years:
                    self.years.append(year)

        self.years.sort()
        self.year_range = (min(self.years), max(self.years)) if self.years else (0, 0)

    def detect_keyword_bursts(
        self,
        min_frequency: int = 2,
        gamma: float = 1.0,
        alpha: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """Detect bursts in keyword frequency."""
        keyword_series = self._build_term_series('keywords')
        return self._detect_bursts(keyword_series, min_frequency, gamma, alpha)

    def detect_author_bursts(
        self,
        min_frequency: int = 2,
        gamma: float = 1.0,
        alpha: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """Detect bursts in author publication frequency."""
        author_series = self._build_term_series('authors')
        return self._detect_bursts(author_series, min_frequency, gamma, alpha)

    def _build_term_series(self, field: str) -> Dict[str, Dict[int, int]]:
        """Build time series {term: {year: count}} for a field."""
        series = defaultdict(lambda: defaultdict(int))

        for entry in self.entries:
            year = entry.get('year')
            if not year:
                continue
            try:
                year = int(year)
            except (ValueError, TypeError):
                continue

            terms = entry.get(field, [])
            if terms is None:
                terms = []
            elif isinstance(terms, str):
                if ';' in terms:
                    terms = [t.strip() for t in terms.split(';')]
                elif ',' in terms:
                    terms = [t.strip() for t in terms.split(',')]
                else:
                    terms = [terms]

            for term in terms:
                if term and isinstance(term, str) and term.strip():
                    term_clean = term.lower().strip() if field == 'keywords' else term.strip()
                    if len(term_clean) > 1:
                        series[term_clean][year] += 1

        return series

    def _detect_bursts(
        self,
        term_series: Dict[str, Dict[int, int]],
        min_frequency: int,
        gamma: float,
        alpha: float,
    ) -> List[Dict[str, Any]]:
        """Detect bursts using Kleinberg two-state HMM DP."""
        bursts = []
        if not self.years:
            return bursts

        # Per-year total document count
        year_range = range(self.year_range[0], self.year_range[1] + 1)
        year_totals: Dict[int, int] = {y: len(self.year_entries.get(y, [])) for y in year_range}

        for term, year_counts in term_series.items():
            total_freq = sum(year_counts.values())
            if total_freq < min_frequency:
                continue

            # Build aligned (counts, n_total) lists over the full year range
            counts: List[Tuple[int, int]] = []
            n_total: List[int] = []
            for y in year_range:
                counts.append((y, year_counts.get(y, 0)))
                n_total.append(max(1, year_totals.get(y, 1)))

            burst_periods = self._kleinberg_burst(counts, n_total, alpha, gamma)

            for start_year, end_year, strength in burst_periods:
                burst_weight = sum(c for y, c in counts if start_year <= y <= end_year)
                bursts.append({
                    'term': term,
                    'frequency': total_freq,
                    'first_year': min(year_counts.keys()),
                    'burst_start': start_year,
                    'burst_end': end_year,
                    'burst_strength': strength,
                    'burst_weight': burst_weight,
                })

        bursts.sort(key=lambda x: -x['burst_strength'])
        return bursts

    def _kleinberg_burst(
        self,
        counts: List[Tuple[int, int]],
        n_total: List[int],
        alpha: float,
        gamma: float,
    ) -> List[Tuple[int, int, float]]:
        """Instance wrapper around the module-level :func:`kleinberg_burst`."""
        return kleinberg_burst(counts, n_total, alpha, gamma)


def detect_bursts(
    entries: List[Dict[str, Any]],
    burst_type: str = "keyword",
    min_frequency: int = 2,
    gamma: float = 1.0,
    alpha: float = 1.0,
) -> Dict[str, Any]:
    """
    Detect bursts in bibliographic data using Kleinberg's HMM algorithm.

    Args:
        entries:       List of bibliographic entries
        burst_type:    'keyword' or 'author'
        min_frequency: Minimum total frequency to consider
        gamma:         Burst sensitivity (higher → burst rate must be more elevated)
        alpha:         Transition penalty (higher → fewer, longer bursts)
    """
    detector = BurstDetector(entries)

    if burst_type == "keyword":
        bursts = detector.detect_keyword_bursts(min_frequency, gamma, alpha)
    elif burst_type == "author":
        bursts = detector.detect_author_bursts(min_frequency, gamma, alpha)
    else:
        raise ValueError(f"Unknown burst_type: {burst_type}")

    return {
        'bursts': bursts,
        'time_range': {
            'start': detector.year_range[0],
            'end': detector.year_range[1],
        },
    }
