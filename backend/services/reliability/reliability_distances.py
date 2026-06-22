"""
Reliability Distances
集合距离函数（用于多标签 / 集合值标注的信度计算）

每个单位（token 或字符）上，一个编码者的标注是一个**标签集合**。
两个集合之间的差异由下列距离函数度量，取值范围 [0, 1]：
- nominal：集合相等 → 0，否则 → 1（不给部分功劳）
- jaccard：1 - |A∩B| / |A∪B|（按重叠比例给部分功劳）
- masi：Passonneau (2006) MASI 距离，在 Jaccard 基础上叠加单调性因子 M
        （区分"子集 / 部分重叠 / 不相交"），是多标签标注信度的常用 δ

语义与 nltk.metrics.distance 对齐，便于交叉验证；为对齐 Passonneau 原始定义，
MASI 单调性因子使用精确分数 1, 2/3, 1/3, 0（验证时把本模块函数直接注入
nltk AnnotationTask，因此常数取值不影响交叉校验）。
"""

from typing import Callable, FrozenSet, Dict, Any

# 一个"标签集合"用 frozenset 表示；空集 = 该单位无标注（O 类别）
LabelSet = FrozenSet[str]


def nominal_set_distance(a: LabelSet, b: LabelSet) -> float:
    """名义集合距离：完全相等为 0，否则为 1。

    distance='nominal' 时，所有系数退化为经典的"集合相等"一致性，
    不给任何部分功劳（{A,B} vs {A} 视为完全不一致）。
    """
    return 0.0 if a == b else 1.0


def jaccard_distance(a: LabelSet, b: LabelSet) -> float:
    """Jaccard 距离：1 - |A∩B| / |A∪B|。

    两个空集视为完全一致（距离 0）。按标签集合重叠比例给部分功劳。
    """
    if a == b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    inter = a & b
    return 1.0 - (len(inter) / len(union))


def masi_distance(a: LabelSet, b: LabelSet) -> float:
    """MASI 距离 (Measuring Agreement on Set-valued Items, Passonneau 2006)。

    masi = 1 - J * M
      J = |A∩B| / |A∪B|（Jaccard 相似度）
      M = 单调性因子：
          1     若 A == B
          2/3   若一个是另一个的真子集（intersection == 较小集合）
          1/3   若交集非空但互不为子集
          0     若不相交
    返回距离 = 1 - J*M，取值 [0, 1]。两个空集视为完全一致。

    相比 Jaccard，MASI 额外奖励"子集"关系（{A} ⊂ {A,B} 比同样 Jaccard 的
    部分重叠更接近一致），更贴合"一个编码者标得更细"的真实场景。
    """
    if a == b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    inter = a & b
    len_inter = len(inter)

    if len_inter == 0:
        m = 0.0
    elif len_inter == min(len(a), len(b)):
        # 交集等于较小集合 → 一个是另一个的（真）子集
        m = 2.0 / 3.0
    else:
        # 交集非空但互不为子集
        m = 1.0 / 3.0

    jaccard_sim = len_inter / len(union)
    return 1.0 - (jaccard_sim * m)


# 距离名 → 函数 映射
DISTANCES: Dict[str, Callable[[LabelSet, LabelSet], float]] = {
    "nominal": nominal_set_distance,
    "jaccard": jaccard_distance,
    "masi": masi_distance,
}

# 旧的 level_of_measurement 取值 → 集合距离 的向后兼容映射
# nominal 保持 nominal；ordinal/interval/ratio 在集合值场景下无意义，统一映射到 masi
_LEGACY_LEVEL_ALIASES: Dict[str, str] = {
    "nominal": "nominal",
    "ordinal": "masi",
    "interval": "masi",
    "ratio": "masi",
}


def resolve_distance_name(distance: str = None, level_of_measurement: str = None) -> str:
    """解析最终使用的距离名。

    优先使用显式 distance；否则把 legacy level_of_measurement 映射过来；
    都没有时默认 'masi'。返回的名字保证在 DISTANCES 中。
    """
    if distance and distance in DISTANCES:
        return distance
    if level_of_measurement:
        mapped = _LEGACY_LEVEL_ALIASES.get(level_of_measurement)
        if mapped:
            return mapped
    return "masi"


def get_distance(name: str = "masi") -> Callable[[LabelSet, LabelSet], float]:
    """按名字取距离函数，未知名字回退到 masi。"""
    return DISTANCES.get(name, masi_distance)
