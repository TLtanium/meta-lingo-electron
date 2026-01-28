"""
Burst Detection Service for Bibliographic Visualization

Implements Kleinberg's burst detection algorithm to identify
sudden increases in term frequency over time.
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import math


class BurstDetector:
    """
    Burst detection using Kleinberg's algorithm (simplified version)
    
    Reference: Kleinberg, J. (2003). Bursty and hierarchical structure in streams.
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
        gamma: float = 1.0
    ) -> List[Dict[str, Any]]:
        """
        Detect bursts in keyword frequency
        
        Args:
            min_frequency: Minimum total frequency to consider
            gamma: Kleinberg parameter (higher = more sensitive)
        
        Returns:
            List of burst items
        """
        # Build keyword time series
        keyword_series = self._build_term_series('keywords')
        return self._detect_bursts(keyword_series, min_frequency, gamma)
    
    def detect_author_bursts(
        self,
        min_frequency: int = 2,
        gamma: float = 1.0
    ) -> List[Dict[str, Any]]:
        """Detect bursts in author publication frequency"""
        author_series = self._build_term_series('authors')
        return self._detect_bursts(author_series, min_frequency, gamma)
    
    def _build_term_series(self, field: str) -> Dict[str, Dict[int, int]]:
        """
        Build time series for each term
        
        Returns:
            {term: {year: count}}
        """
        series = defaultdict(lambda: defaultdict(int))
        
        for entry in self.entries:
            year = entry.get('year')
            if not year:
                continue
            
            # Ensure year is an integer
            try:
                year = int(year)
            except (ValueError, TypeError):
                continue
            
            terms = entry.get(field, [])
            
            # Handle various data formats
            if terms is None:
                terms = []
            elif isinstance(terms, str):
                # Try to split by common delimiters
                if ';' in terms:
                    terms = [t.strip() for t in terms.split(';')]
                elif ',' in terms:
                    terms = [t.strip() for t in terms.split(',')]
                else:
                    terms = [terms]
            
            for term in terms:
                if term and isinstance(term, str) and term.strip():
                    term_clean = term.lower().strip() if field == 'keywords' else term.strip()
                    if len(term_clean) > 1:  # Skip single character terms
                        series[term_clean][year] += 1
        
        return series
    
    def _detect_bursts(
        self,
        term_series: Dict[str, Dict[int, int]],
        min_frequency: int,
        gamma: float
    ) -> List[Dict[str, Any]]:
        """
        Detect bursts using simplified Kleinberg algorithm
        
        Uses a two-state automaton:
        - State 0: Normal (base rate)
        - State 1: Burst (elevated rate)
        """
        bursts = []
        
        if not self.years:
            return bursts
        
        # Calculate global base rate
        total_docs = len(self.entries)
        n_years = len(self.years)
        base_rate = total_docs / n_years if n_years > 0 else 1
        
        for term, year_counts in term_series.items():
            # Check minimum frequency
            total_freq = sum(year_counts.values())
            if total_freq < min_frequency:
                continue
            
            # Build complete time series (fill missing years with 0)
            counts = []
            for year in range(self.year_range[0], self.year_range[1] + 1):
                counts.append((year, year_counts.get(year, 0)))
            
            # Detect burst periods
            burst_periods = self._find_burst_periods(counts, base_rate, gamma)
            
            for start_year, end_year, strength in burst_periods:
                # Calculate burst weight (sum of counts during burst)
                burst_weight = sum(
                    c for y, c in counts 
                    if start_year <= y <= end_year
                )
                
                bursts.append({
                    'term': term,
                    'frequency': total_freq,
                    'burst_start': start_year,
                    'burst_end': end_year,
                    'burst_strength': strength,
                    'burst_weight': burst_weight
                })
        
        # Sort by burst strength
        bursts.sort(key=lambda x: -x['burst_strength'])
        
        return bursts
    
    def _find_burst_periods(
        self,
        counts: List[Tuple[int, int]],
        base_rate: float,
        gamma: float
    ) -> List[Tuple[int, int, float]]:
        """
        Find burst periods in a time series
        
        Returns:
            List of (start_year, end_year, burst_strength)
        """
        if not counts:
            return []
        
        n = len(counts)
        
        # Calculate expected count per year for this term
        total = sum(c for _, c in counts)
        expected = total / n if n > 0 else 0
        
        if expected < 0.5:
            return []
        
        # Two-state detection
        states = []
        burst_threshold = expected * (1 + gamma)
        
        for year, count in counts:
            if count > burst_threshold:
                states.append((year, 1, count / expected if expected > 0 else 0))
            else:
                states.append((year, 0, 0))
        
        # Find contiguous burst periods
        periods = []
        burst_start = None
        burst_strength = 0
        
        for year, state, strength in states:
            if state == 1:
                if burst_start is None:
                    burst_start = year
                burst_strength = max(burst_strength, strength)
            else:
                if burst_start is not None:
                    periods.append((burst_start, year - 1, burst_strength))
                    burst_start = None
                    burst_strength = 0
        
        # Handle burst at end
        if burst_start is not None:
            periods.append((burst_start, counts[-1][0], burst_strength))
        
        return periods


def detect_bursts(
    entries: List[Dict[str, Any]],
    burst_type: str = "keyword",
    min_frequency: int = 2,
    gamma: float = 1.0
) -> Dict[str, Any]:
    """
    Detect bursts in bibliographic data
    
    Args:
        entries: List of bibliographic entries
        burst_type: One of 'keyword', 'author'
        min_frequency: Minimum total frequency to consider
        gamma: Burst sensitivity parameter
    
    Returns:
        Burst detection results
    """
    detector = BurstDetector(entries)
    
    if burst_type == "keyword":
        bursts = detector.detect_keyword_bursts(min_frequency, gamma)
    elif burst_type == "author":
        bursts = detector.detect_author_bursts(min_frequency, gamma)
    else:
        raise ValueError(f"Unknown burst_type: {burst_type}")
    
    return {
        'bursts': bursts,
        'time_range': {
            'start': detector.year_range[0],
            'end': detector.year_range[1]
        }
    }

