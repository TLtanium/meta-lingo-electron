"""
Collocation Analysis Statistical Measures
Implements 12 association measures for collocation analysis.

All functions expect:
  f_xy: co-occurrence frequency (node + collocate in window)
  f_x:  node word frequency
  f_y:  collocate word frequency
  N:    total corpus size (tokens)
"""

import math
from typing import Dict, List, Optional


def logdice(f_xy: int, f_x: int, f_y: int, N: int = 0) -> float:
    """
    LogDice coefficient.
    Formula: 14 + log2(2 * f_xy / (f_x + f_y))
    Range: roughly 0 to 14, unaffected by corpus size.
    Reference: Rychlý (2008)
    """
    denom = f_x + f_y
    if denom == 0 or f_xy == 0:
        return 0.0
    val = 14 + math.log2(2 * f_xy / denom)
    return max(0.0, val)


def mi(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Mutual Information (pointwise).
    Formula: log2(N * f_xy / (f_x * f_y))
    Favors low-frequency collocates.
    Reference: Church & Hanks (1990)
    """
    denom = f_x * f_y
    if denom == 0 or f_xy == 0 or N == 0:
        return 0.0
    return math.log2(N * f_xy / denom)


def ll(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Log-Likelihood (G² statistic).
    Uses 2x2 contingency table.
    6.63 ≈ p<0.01, 3.84 ≈ p<0.05
    Reference: Dunning (1993)
    """
    if N == 0 or f_xy == 0:
        return 0.0

    # Contingency table cells
    a = f_xy                    # node & collocate
    b = f_x - f_xy              # node & not-collocate
    c = f_y - f_xy              # not-node & collocate
    d = N - f_x - f_y + f_xy   # not-node & not-collocate

    # Ensure non-negative values
    b = max(0, b)
    c = max(0, c)
    d = max(0, d)

    def _ll_component(observed: int, expected: float) -> float:
        if observed == 0 or expected <= 0:
            return 0.0
        return observed * math.log(observed / expected)

    # Expected values
    row1 = a + b  # f_x
    row2 = c + d
    col1 = a + c  # f_y
    col2 = b + d

    if row1 == 0 or row2 == 0 or col1 == 0 or col2 == 0:
        return 0.0

    e_a = row1 * col1 / N
    e_b = row1 * col2 / N
    e_c = row2 * col1 / N
    e_d = row2 * col2 / N

    g2 = 2 * (
        _ll_component(a, e_a) +
        _ll_component(b, e_b) +
        _ll_component(c, e_c) +
        _ll_component(d, e_d)
    )

    return g2


def zscore(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Z-score.
    Formula: (f_xy - E_xy) / sqrt(E_xy)
    where E_xy = f_x * f_y / N
    1.96 ≈ p<0.05
    Reference: Berry-Rogghe (1973)
    """
    if N == 0 or f_x == 0 or f_y == 0:
        return 0.0
    e_xy = f_x * f_y / N
    if e_xy == 0:
        return 0.0
    return (f_xy - e_xy) / math.sqrt(e_xy)


def tscore(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    T-score.
    Formula: (f_xy - E_xy) / sqrt(f_xy)
    where E_xy = f_x * f_y / N
    Favors high-frequency collocates.
    1.96 ≈ p<0.05
    Reference: Church et al. (1991)
    """
    if N == 0 or f_xy == 0 or f_x == 0 or f_y == 0:
        return 0.0
    e_xy = f_x * f_y / N
    return (f_xy - e_xy) / math.sqrt(f_xy)


def logratio(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Log Ratio.
    Formula: log2(p1 / p2)
    p1 = f_xy / f_x (proportion of collocate with node)
    p2 = (f_y - f_xy) / (N - f_x) (proportion of collocate without node)
    With Laplace smoothing to avoid division by zero.
    Reference: Hardie (2012)
    """
    if f_x == 0 or N == 0:
        return 0.0

    p1 = f_xy / f_x

    rest_total = N - f_x
    rest_collocate = f_y - f_xy

    if rest_total <= 0:
        return 0.0

    p2 = max(rest_collocate, 0) / rest_total

    # Laplace smoothing
    p1_smooth = (f_xy + 0.5) / (f_x + 1)
    p2_smooth = (max(rest_collocate, 0) + 0.5) / (rest_total + 1)

    if p2_smooth == 0:
        return 0.0

    return math.log2(p1_smooth / p2_smooth)


def mi2(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    MI² (Mutual Information squared variant).
    Formula: log2(N² * f_xy² / (f_x² * f_y²)) = 2 * MI
    Actually MI² uses: log2(f_xy² * N / (f_x * f_y))
    Less biased toward low-frequency items than MI.
    Reference: Kilgarriff (2006)
    """
    denom = f_x * f_y
    if denom == 0 or f_xy == 0 or N == 0:
        return 0.0
    return math.log2((f_xy ** 2) * N / denom)


def mi3(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    MI³ (Mutual Information cubed variant).
    Formula: log2(f_xy³ * N² / (f_x² * f_y²))
    Further reduces low-frequency bias, favors mid-frequency collocates.
    Reference: Oakes (1998)
    """
    denom = (f_x ** 2) * (f_y ** 2)
    if denom == 0 or f_xy == 0 or N == 0:
        return 0.0
    return math.log2((f_xy ** 3) * (N ** 2) / denom)


def dice_coeff(f_xy: int, f_x: int, f_y: int, N: int = 0) -> float:
    """
    Dice coefficient.
    Formula: 2 * f_xy / (f_x + f_y)
    Range: 0 to 1.
    Reference: Smadja et al. (1996)
    """
    denom = f_x + f_y
    if denom == 0:
        return 0.0
    return 2 * f_xy / denom


def delta_p1(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Delta P1 (Cue = node, Target = collocate).
    Formula: P(collocate|node) - P(collocate|¬node)
    Directional: measures attraction from node to collocate.
    Range: -1 to 1. Negative values indicate repulsion (collocate appears less with node than without).
    Reference: Gries (2013)
    """
    if f_x == 0 or N == 0:
        return 0.0

    p_y_given_x = f_xy / f_x

    not_x_total = N - f_x
    if not_x_total <= 0:
        return p_y_given_x

    p_y_given_not_x = max(0, f_y - f_xy) / not_x_total

    return p_y_given_x - p_y_given_not_x


def delta_p2(f_xy: int, f_x: int, f_y: int, N: int) -> float:
    """
    Delta P2 (Cue = collocate, Target = node).
    Formula: P(node|collocate) - P(node|¬collocate)
    Directional: measures attraction from collocate to node.
    Range: -1 to 1. Negative values indicate repulsion.
    Reference: Gries (2013)
    """
    if f_y == 0 or N == 0:
        return 0.0

    p_x_given_y = f_xy / f_y

    not_y_total = N - f_y
    if not_y_total <= 0:
        return p_x_given_y

    p_x_given_not_y = max(0, f_x - f_xy) / not_y_total

    return p_x_given_y - p_x_given_not_y


def min_sensitivity(f_xy: int, f_x: int, f_y: int, N: int = 0) -> float:
    """
    Minimum Sensitivity.
    Formula: min(Delta P1, Delta P2)
    Conservative bidirectional association measure; always equals one of Delta P1 or Delta P2.
    Range: -1 to 1.
    Reference: Gries (2013), association measure based on directional Delta P.
    """
    dp1 = delta_p1(f_xy, f_x, f_y, N)
    dp2 = delta_p2(f_xy, f_x, f_y, N)
    return min(dp1, dp2)


# ==================== Dispatcher ====================

_MEASURE_FUNCTIONS = {
    'logdice': logdice,
    'mi': mi,
    'll': ll,
    'zscore': zscore,
    'tscore': tscore,
    'logratio': logratio,
    'mi2': mi2,
    'mi3': mi3,
    'dice': dice_coeff,
    'deltap1': delta_p1,
    'deltap2': delta_p2,
    'minsens': min_sensitivity,
}


def compute_statistics(
    f_xy: int,
    f_x: int,
    f_y: int,
    N: int,
    methods: List[str]
) -> Dict[str, float]:
    """
    Compute multiple statistical measures for a collocate pair.

    Args:
        f_xy: Co-occurrence frequency
        f_x: Node word frequency
        f_y: Collocate word frequency
        N: Total corpus size (tokens)
        methods: List of measure IDs to compute

    Returns:
        Dict mapping measure ID to computed score
    """
    results = {}
    for method in methods:
        func = _MEASURE_FUNCTIONS.get(method)
        if func:
            try:
                results[method] = round(func(f_xy, f_x, f_y, N), 4)
            except (ValueError, ZeroDivisionError, OverflowError):
                results[method] = 0.0
    return results
