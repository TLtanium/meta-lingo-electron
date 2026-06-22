"""
Reliability Set-based Coefficients
基于"token → 标签集合"的信度系数计算

输入统一为：
- label_sets: List[per-coder] of List[per-token] frozenset（每个单位一个标签集合）
- cand:       候选单位索引列表（只在这些单位上计算）
- distance:   集合距离函数 δ(a,b) ∈ [0,1]（来自 reliability_distances）

部分功劳的归属（与 NLTK AnnotationTask 一致、可辩护）：
- Krippendorff's α：用 δ 作差异函数，渐进给部分功劳（理论支持任意 δ）
- 百分比一致：报渐进均值 mean(1-δ)；δ=nominal 时退化为集合相等百分比
- Cohen's / Fleiss' κ：保持二元一致（一致 = 集合相等），类别 = 出现过的不同标签集合
"""

from collections import Counter
from itertools import combinations
from typing import Callable, Dict, FrozenSet, List, Tuple

LabelSet = FrozenSet[str]
DistanceFn = Callable[[LabelSet, LabelSet], float]


def _restrict(label_sets: List[List[LabelSet]], cand: List[int]) -> List[List[LabelSet]]:
    """把每个编码者的全长 token 序列裁剪到候选单位。"""
    return [[coder[t] for t in cand] for coder in label_sets]


def count_non_empty_decisions(label_sets: List[List[LabelSet]], cand: List[int]) -> int:
    """候选单位上非空 (coder, token) 赋值的总数（用于摘要 n_decisions）。"""
    restricted = _restrict(label_sets, cand)
    return sum(1 for coder in restricted for s in coder if s)


# ==================== 百分比一致（渐进，成对平均） ====================

def set_percent_agreement(
    label_sets: List[List[LabelSet]],
    cand: List[int],
    distance: DistanceFn,
) -> Tuple[float, Dict[Tuple[int, int], float]]:
    """成对平均渐进一致性：每对 agree = mean_t (1 - δ(S_i, S_j))。

    Returns:
        (平均一致性 0-1, 每对一致性 {(i,j): agreement})
    """
    data = _restrict(label_sets, cand)
    n_coders = len(data)
    n_units = len(cand)
    if n_coders < 2 or n_units == 0:
        return 0.0, {}

    pairwise: Dict[Tuple[int, int], float] = {}
    total = 0.0
    for i, j in combinations(range(n_coders), 2):
        agree = sum(1.0 - distance(data[i][t], data[j][t]) for t in range(n_units)) / n_units
        pairwise[(i, j)] = agree
        total += agree
    avg = total / len(pairwise) if pairwise else 0.0
    return avg, pairwise


# ==================== Cohen's Kappa（二元集合相等，成对平均） ====================

def _pair_cohens_kappa(col_i: List[LabelSet], col_j: List[LabelSet]) -> Tuple[float, float, float]:
    n = len(col_i)
    if n == 0:
        return 0.0, 0.0, 0.0
    po = sum(1 for a, b in zip(col_i, col_j) if a == b) / n
    c_i = Counter(col_i)
    c_j = Counter(col_j)
    cats = set(c_i) | set(c_j)
    pe = sum((c_i.get(c, 0) / n) * (c_j.get(c, 0) / n) for c in cats)
    if pe >= 1.0:
        kappa = 1.0 if po >= 1.0 else 0.0
    else:
        kappa = (po - pe) / (1.0 - pe)
    return kappa, po, pe


def set_cohens_kappa(
    label_sets: List[List[LabelSet]],
    cand: List[int],
) -> Tuple[float, Dict[Tuple[int, int], Tuple[float, float, float]]]:
    """成对平均 Cohen's Kappa；类别 = 不同标签集合，一致 = 集合相等。"""
    data = _restrict(label_sets, cand)
    n_coders = len(data)
    if n_coders < 2 or len(cand) == 0:
        return 0.0, {}

    pairwise: Dict[Tuple[int, int], Tuple[float, float, float]] = {}
    total = 0.0
    for i, j in combinations(range(n_coders), 2):
        kappa, po, pe = _pair_cohens_kappa(data[i], data[j])
        pairwise[(i, j)] = (kappa, po, pe)
        total += kappa
    avg = total / len(pairwise) if pairwise else 0.0
    return avg, pairwise


# ==================== Fleiss' Kappa（二元集合相等，多编码者） ====================

def set_fleiss_kappa(
    label_sets: List[List[LabelSet]],
    cand: List[int],
) -> Tuple[float, float, float]:
    """Fleiss' Kappa；类别 = 不同标签集合，一致 = 集合相等。

    Returns:
        (kappa, P_bar 观察一致, P_e 期望一致)
    """
    data = _restrict(label_sets, cand)
    n_coders = len(data)
    n_units = len(cand)
    if n_coders < 2 or n_units == 0:
        return 0.0, 0.0, 0.0

    # 每个单位每个类别被多少编码者选中
    categories = set()
    for coder in data:
        categories.update(coder)
    cat_list = sorted(categories, key=lambda s: tuple(sorted(s)))
    cat_idx = {c: k for k, c in enumerate(cat_list)}
    n_cat = len(cat_list)

    import numpy as np
    rating = np.zeros((n_units, n_cat), dtype=int)
    for ci in range(n_coders):
        for u in range(n_units):
            rating[u, cat_idx[data[ci][u]]] += 1

    # 每单位一致性 P_u
    P_u = (np.sum(rating ** 2, axis=1) - n_coders) / (n_coders * (n_coders - 1))
    P_bar = float(np.mean(P_u))

    p_c = np.sum(rating, axis=0) / (n_units * n_coders)
    P_e = float(np.sum(p_c ** 2))

    if P_e >= 1.0:
        kappa = 1.0 if P_bar >= 1.0 else 0.0
    else:
        kappa = (P_bar - P_e) / (1.0 - P_e)
    return float(kappa), P_bar, P_e


# ==================== Krippendorff's Alpha（渐进，集合距离 δ） ====================

def set_krippendorff_alpha(
    label_sets: List[List[LabelSet]],
    cand: List[int],
    distance: DistanceFn,
) -> Tuple[float, int, float, float]:
    """Krippendorff's Alpha，δ 直接作用于标签集合。

    完全交叉设计（每个候选单位都被所有编码者评定，未覆盖处为空集），
    coincidence 权重 1/(m_u-1)，与 NLTK AnnotationTask.alpha 一致。

    Returns:
        (alpha, n_decisions, Do_scaled, De_scaled)
        其中 Do_scaled = Do * n_total，De_scaled = De * n_total*(n_total-1)
        （供报告展示观察/期望不一致量）
    """
    data = _restrict(label_sets, cand)
    n_coders = len(data)
    n_units = len(cand)
    if n_coders < 2 or n_units == 0:
        return 0.0, 0, 0.0, 0.0

    # 类别 = 出现过的不同标签集合（含空集）
    categories = set()
    for coder in data:
        categories.update(coder)
    cat_list = sorted(categories, key=lambda s: tuple(sorted(s)))
    n_cat = len(cat_list)
    cat_idx = {c: k for k, c in enumerate(cat_list)}

    # 预算类别间 δ
    import numpy as np
    delta = np.zeros((n_cat, n_cat), dtype=float)
    for a in range(n_cat):
        for b in range(n_cat):
            delta[a, b] = distance(cat_list[a], cat_list[b])

    # coincidence matrix
    coincidence = np.zeros((n_cat, n_cat), dtype=float)
    m_u = n_coders  # 完全交叉
    if m_u < 2:
        return 0.0, 0, 0.0, 0.0
    weight = 1.0 / (m_u - 1)
    for u in range(n_units):
        ratings = [cat_idx[data[ci][u]] for ci in range(n_coders)]
        for a in range(m_u):
            for b in range(m_u):
                if a != b:
                    coincidence[ratings[a], ratings[b]] += weight

    n_c = np.sum(coincidence, axis=1)
    n_total = float(np.sum(coincidence))
    if n_total < 2:
        return 0.0, 0, 0.0, 0.0

    Do = float(np.sum(coincidence * delta)) / n_total
    De = float(np.sum(np.outer(n_c, n_c) * delta)) / (n_total * (n_total - 1.0))

    if De > 0:
        alpha = 1.0 - (Do / De)
    else:
        alpha = 1.0 if Do == 0 else 0.0

    n_decisions = n_coders * n_units
    return float(alpha), int(n_decisions), Do * n_total, De * n_total * (n_total - 1.0)
