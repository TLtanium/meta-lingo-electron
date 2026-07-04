"""
Co-occurrence network construction with CiteSpace-style node selection.

Builds a weighted ``networkx`` graph of terms. Supports:
  * **Time slicing** (From / To / years-per-slice): select the top nodes *per slice*
    then merge — CiteSpace's standard pipeline.
  * **Selection**: Top N, Top N%, or Thresholds(c, cc, ccv).
  * **Link strength**: cosine (default), dice, jaccard, or raw co-occurrence.

Edge ``weight`` is the chosen similarity in [0, 1]; ``distance`` = 1 - weight is used
by pruning / betweenness / silhouette downstream.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

import networkx as nx

from .extract import TermIndex, cooccurrence_pairs


def _slice_bounds(years: List[int], year_from: Optional[int], year_to: Optional[int],
                  years_per_slice: int) -> List[Tuple[int, int]]:
    """Partition the year range into [start, end] slices of ``years_per_slice``."""
    if not years:
        return []
    lo = year_from if year_from is not None else min(years)
    hi = year_to if year_to is not None else max(years)
    if hi < lo:
        lo, hi = hi, lo
    step = max(1, int(years_per_slice or 1))
    bounds: List[Tuple[int, int]] = []
    start = lo
    while start <= hi:
        bounds.append((start, min(start + step - 1, hi)))
        start += step
    return bounds


def _g_index_count(freqs_desc: List[int], k: int) -> int:
    """CiteSpace g-index: the largest g such that g² ≤ k·Σ_{i≤g} c_i (c sorted desc).

    Larger k admits more (and rarer) nodes. Default k=25.
    """
    cum = 0
    g = 0
    for i, c in enumerate(freqs_desc, start=1):
        cum += c
        if i * i <= k * cum:
            g = i
        else:
            break
    return max(1, g)


def _select_terms(idx: TermIndex, year_from: Optional[int], year_to: Optional[int],
                  years_per_slice: int, selection_mode: str,
                  top_n: int, top_n_percent: float,
                  threshold_c: int, g_index_k: int = 25,
                  across_slices: bool = False) -> Set[str]:
    """Pick the node set per the selection criteria, slicing by time when asked.

    When *across_slices* is True the selection ranks terms by their global
    frequency across all time, then picks top-N from that global ranking
    (CiteSpace "Across Slices" mode).  When False (default) each slice
    contributes its own top-N which are merged (Within Slices).
    """
    if across_slices:
        # Global ranking — ignore slice boundaries for node selection
        global_freq: Dict[str, int] = defaultdict(int)
        for i, terms in enumerate(idx.entry_terms):
            y = idx.entry_years[i]
            if year_from is not None and (y is None or y < year_from):
                continue
            if year_to is not None and (y is None or y > year_to):
                continue
            for t in terms:
                global_freq[t] += 1
        if not global_freq:
            return set()
        ranked = sorted(global_freq.items(), key=lambda kv: (-kv[1], kv[0]))
        if selection_mode == "g_index":
            g = _g_index_count([f for _, f in ranked], max(1, g_index_k))
            chosen = ranked[:g]
        elif selection_mode == "top_n_percent":
            k = max(1, int(round(len(ranked) * (top_n_percent / 100.0))))
            chosen = ranked[:k]
        elif selection_mode == "thresholds":
            chosen = [(t, f) for t, f in ranked if f >= max(1, threshold_c)]
        else:
            chosen = ranked[: max(1, top_n)]
        return set(t for t, _ in chosen)

    # Within Slices (default): each time slice contributes its own top-N candidates
    all_years = idx.years_present()
    bounds = _slice_bounds(all_years, year_from, year_to, years_per_slice)
    if not bounds:
        bounds = [(None, None)]  # single merged slice

    selected: Set[str] = set()
    for (s_lo, s_hi) in bounds:
        # frequency of each term within this slice
        slice_freq: Dict[str, int] = defaultdict(int)
        for i, terms in enumerate(idx.entry_terms):
            y = idx.entry_years[i]
            if s_lo is not None and (y is None or not (s_lo <= y <= s_hi)):
                continue
            for t in terms:
                slice_freq[t] += 1
        if not slice_freq:
            continue
        ranked = sorted(slice_freq.items(), key=lambda kv: (-kv[1], kv[0]))
        if selection_mode == "g_index":
            g = _g_index_count([f for _, f in ranked], max(1, g_index_k))
            chosen = ranked[:g]
        elif selection_mode == "top_n_percent":
            k = max(1, int(round(len(ranked) * (top_n_percent / 100.0))))
            chosen = ranked[:k]
        elif selection_mode == "thresholds":
            chosen = [(t, f) for t, f in ranked if f >= max(1, threshold_c)]
        else:  # top_n (default)
            chosen = ranked[: max(1, top_n)]
        selected.update(t for t, _ in chosen)
    return selected


def _strength(cooc: int, fa: int, fb: int, mode: str) -> float:
    if cooc <= 0 or fa <= 0 or fb <= 0:
        return 0.0
    if mode == "cooccurrence":
        return float(cooc)  # raw; normalised later by caller if needed
    if mode == "jaccard":
        return cooc / (fa + fb - cooc)
    if mode == "dice":
        return 2.0 * cooc / (fa + fb)
    # cosine (default)
    return cooc / math.sqrt(fa * fb)


def select_terms(idx: TermIndex, **kwargs) -> Set[str]:
    """Public wrapper over the per-slice node selection (used for hybrid
    multi-node-type networks where each type is selected independently)."""
    return _select_terms(
        idx,
        kwargs.get("year_from"), kwargs.get("year_to"),
        kwargs.get("years_per_slice", 1),
        kwargs.get("selection_mode", "top_n"),
        kwargs.get("top_n", 50), kwargs.get("top_n_percent", 10.0),
        kwargs.get("threshold_c", 1), kwargs.get("g_index_k", 25),
        across_slices=bool(kwargs.get("across_slices", False)),
    )


def build_graph(
    idx: TermIndex,
    *,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    years_per_slice: int = 1,
    selection_mode: str = "top_n",
    top_n: int = 50,
    top_n_percent: float = 10.0,
    threshold_c: int = 1,
    threshold_cc: int = 1,
    threshold_ccv: float = 0.0,
    link_strength: str = "cosine",
    max_nodes: int = 200,
    g_index_k: int = 25,
    across_slices: bool = False,
    preselected: Optional[Set[str]] = None,
) -> nx.Graph:
    """Build the merged, selected, thresholded co-occurrence graph.

    ``preselected`` (hybrid networks): skip internal selection and use the
    given term set — each node type was already selected independently.
    """
    if preselected is not None:
        selected = set(preselected)
    else:
        selected = _select_terms(
            idx, year_from, year_to, years_per_slice,
            selection_mode, top_n, top_n_percent, threshold_c, g_index_k,
            across_slices=across_slices,
        )
    if not selected:
        return nx.Graph()

    term_freq = idx.term_freq
    # Hard cap by global frequency for render performance. `selected` is a set of term
    # strings — sort the strings directly (no tuple unpacking).
    if len(selected) > max_nodes:
        selected = set(
            sorted(selected, key=lambda t: (-term_freq.get(t, 0), t))[:max_nodes]
        )

    # Co-occurrence counts among selected terms only.
    cooc: Dict[Tuple[str, str], int] = defaultdict(int)
    for i, terms in enumerate(idx.entry_terms):
        # restrict to selected terms in this entry
        local = sorted(t for t in terms if t in selected)
        for a in range(len(local)):
            for b in range(a + 1, len(local)):
                cooc[(local[a], local[b])] += 1

    g = nx.Graph()
    for t in selected:
        g.add_node(
            t,
            freq=term_freq.get(t, 0),
            first_year=idx.term_first_year.get(t),
        )

    raw_mode = link_strength == "cooccurrence"
    max_raw = max(cooc.values()) if (raw_mode and cooc) else 1
    for (a, b), c in cooc.items():
        if c < max(1, threshold_cc):
            continue
        w = _strength(c, term_freq.get(a, 0), term_freq.get(b, 0), link_strength)
        if raw_mode:
            w = w / max_raw  # normalise raw counts into [0, 1] for downstream maths
        if w < threshold_ccv:
            continue
        if w <= 0:
            continue
        g.add_edge(a, b, weight=float(w), cooc=int(c), distance=float(1.0 - min(w, 0.999)))

    # NOTE: isolated low-frequency nodes are kept (CiteSpace keeps them — the user wants
    # "小频次的点都还在"). They render without edges and can be filtered via the data table.
    return g
