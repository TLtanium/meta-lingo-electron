"""
Reliability Coefficients
信度系数计算模块（集合-单位版）

统一以"单位 → 标签集合"为基础计算编码者间信度：
- 单位可为 token（默认，"每词一票"）或 char（IoU 风格视图）
- 每个 (编码者, 单位) 是一个标签集合（frozenset），支持多标签与重叠
- 候选口径：默认只统计"≥1 编码者非空"的单位（去掉空-空虚高）；
  include_empty=True 时保留全部单位（含 O 类别）
- 集合距离 δ（nominal/jaccard/masi）决定部分功劳

系数：Average Pairwise Percent Agreement、Average Pairwise Cohen's Kappa、
Fleiss' Kappa、Krippendorff's Alpha。
"""

from typing import Dict, List, Optional, Any, FrozenSet

from .reliability_distances import get_distance, resolve_distance_name
from .reliability_tokenization import build_token_label_sets, build_char_label_sets
from .reliability_setbased import (
    set_percent_agreement,
    set_cohens_kappa,
    set_fleiss_kappa,
    set_krippendorff_alpha,
    count_non_empty_decisions,
)
from .reliability_utils import generate_coder_pair_label, interpret_coefficient

KRIPPENDORFF_AVAILABLE = True


class ReliabilityCoefficients:
    """信度系数计算器（集合-单位版）"""

    def __init__(self):
        self.loaded_data: Optional[Dict] = None
        self.label_sets: List[List[FrozenSet[str]]] = []
        self.cand: List[int] = []
        self.all_labels: List[str] = []
        self.unit: str = "token"
        self.distance_name: str = "masi"
        self.distance_fn = get_distance("masi")
        self.stats: Dict[str, Any] = {}

    def set_data(
        self,
        data: Dict,
        unit: str = "token",
        distance: str = "masi",
        coverage: str = "majority",
        include_empty: bool = True,
        tokens: Optional[List[Dict[str, Any]]] = None,
        token_source: str = "",
        included_labels: Optional[List[str]] = None,
    ) -> None:
        """设置计算数据并构建"单位 → 标签集合"。

        Args:
            data: 含 annotation_data, common_text(原始文本)
            unit: 'token'(默认) | 'char'
            distance: 'masi'(默认) | 'jaccard' | 'nominal'
            coverage: token 覆盖规则 'majority' | 'any'
            include_empty: 是否把空-空单位也纳入候选
            tokens: unit='token' 时由服务层获取并传入的共享 token 链
            token_source: token 来源标记（embedded/sidecar/spacy/regex）
        """
        self.loaded_data = data
        self.unit = unit if unit in ("token", "char") else "token"
        self.distance_name = distance
        self.distance_fn = get_distance(distance)

        common_text = data.get("common_text", "") or ""
        annotation_data = data.get("annotation_data", [])

        # 收集所有标签（用于检测/展示）
        detected_labels = set()
        for coder in annotation_data:
            for ann in coder.get("annotations", []):
                lab = ann.get("label")
                if lab:
                    detected_labels.add(lab)

        # 标签过滤：None/空 = 全部考虑
        inc_set = set(included_labels) if included_labels else None
        # 实际参与分析的标签 = 检测到的 ∩ 选中的
        considered = detected_labels if inc_set is None else (detected_labels & inc_set)
        self.all_labels = sorted(considered)

        if not annotation_data:
            self.label_sets, self.cand = [], []
            n_units_total = 0
        elif self.unit == "token" and tokens:
            self.label_sets, self.cand = build_token_label_sets(
                tokens, annotation_data, coverage=coverage,
                include_empty=include_empty, included_labels=inc_set
            )
            n_units_total = len(tokens)
        else:
            # char 路径（或 token 获取失败时退回 char）
            if self.unit == "token":
                self.unit = "char"
            self.label_sets, self.cand = build_char_label_sets(
                annotation_data, len(common_text),
                include_empty=include_empty, included_labels=inc_set
            )
            n_units_total = len(common_text)

        n_decisions = count_non_empty_decisions(self.label_sets, self.cand) if self.cand else 0
        self.stats = {
            "n_coders": len(annotation_data),
            "n_cases": len(self.cand),          # 候选单位数（不再是全文长度）
            "n_decisions": n_decisions,
            "n_labels": len(self.all_labels),
            "labels": self.all_labels,
            "unit": self.unit,
            "distance": self.distance_name,
            "coverage": coverage,
            "include_empty": include_empty,
            "token_source": token_source,
            "n_units_total": n_units_total,
            "all_detected_labels": sorted(detected_labels),
            "included_labels": sorted(considered) if inc_set is not None else None,
        }

    def get_data_summary(self) -> Dict[str, Any]:
        return self.stats or {
            "n_coders": 0, "n_cases": 0, "n_decisions": 0,
            "n_labels": 0, "labels": [], "unit": self.unit,
        }

    def _need_coders_error(self, name: str) -> Dict[str, Any]:
        return {"calculated": False, "display_name": name, "error": "需要至少2个编码者"}

    def _has_data(self) -> bool:
        return len(self.label_sets) >= 2 and len(self.cand) > 0

    # ---------- Average Pairwise Percent Agreement ----------
    def calculate_percent_agreement(self, matrix=None) -> Dict[str, Any]:
        name = "Average Pairwise Percent Agreement"
        try:
            if not self._has_data():
                return self._need_coders_error(name)
            avg, pairwise = set_percent_agreement(self.label_sets, self.cand, self.distance_fn)
            pairwise_details = {
                generate_coder_pair_label(i, j): round(v * 100, 3)
                for (i, j), v in pairwise.items()
            }
            return {
                "calculated": True,
                "value": round(avg * 100, 3),
                "display_name": name,
                "interpretation": interpret_coefficient(avg, "percent_agreement"),
                "pairwise_details": pairwise_details,
                "unit": "%",
                "distance": self.distance_name,
                "measure_unit": self.unit,
            }
        except Exception as e:
            return {"calculated": False, "display_name": name, "error": f"计算出错: {str(e)}"}

    def calculate_scotts_pi(self, matrix=None) -> Dict[str, Any]:
        return {
            "calculated": False,
            "display_name": "Scott's Pi",
            "error": "Scott's Pi 已被 Average Pairwise Percent Agreement 替代",
        }

    # ---------- Average Pairwise Cohen's Kappa ----------
    def calculate_cohens_kappa(self, matrix=None) -> Dict[str, Any]:
        name = "Average Pairwise Cohen's Kappa"
        try:
            if not self._has_data():
                return self._need_coders_error(name)
            avg, pairwise = set_cohens_kappa(self.label_sets, self.cand)
            pairwise_details = {
                generate_coder_pair_label(i, j): round(k, 4)
                for (i, j), (k, _po, _pe) in pairwise.items()
            }
            return {
                "calculated": True,
                "value": round(avg, 4),
                "display_name": name,
                "interpretation": interpret_coefficient(avg, "cohens_kappa"),
                "pairwise_details": pairwise_details,
                "measure_unit": self.unit,
            }
        except Exception as e:
            return {"calculated": False, "display_name": name, "error": f"计算出错: {str(e)}"}

    # ---------- Fleiss' Kappa ----------
    def calculate_fleiss_kappa(self, matrix=None) -> Dict[str, Any]:
        name = "Fleiss' Kappa"
        try:
            if not self._has_data():
                return self._need_coders_error(name)
            kappa, observed, expected = set_fleiss_kappa(self.label_sets, self.cand)
            return {
                "calculated": True,
                "value": round(kappa, 4),
                "display_name": name,
                "interpretation": interpret_coefficient(kappa, "fleiss_kappa"),
                "observed_agreement": round(observed, 4),
                "expected_agreement": round(expected, 4),
                "measure_unit": self.unit,
            }
        except Exception as e:
            return {"calculated": False, "display_name": name, "error": f"计算出错: {str(e)}"}

    # ---------- Krippendorff's Alpha ----------
    def calculate_krippendorff_alpha(self, matrix=None, level_of_measurement: str = None) -> Dict[str, Any]:
        # level_of_measurement 为旧参数，映射到集合距离
        dist_name = self.distance_name
        name = f"Krippendorff's Alpha ({dist_name})"
        try:
            if not self._has_data():
                return self._need_coders_error(name)
            alpha, n_decisions, do_scaled, de_scaled = set_krippendorff_alpha(
                self.label_sets, self.cand, self.distance_fn
            )
            stats = self.get_data_summary()
            return {
                "calculated": True,
                "value": round(alpha, 4),
                "display_name": name,
                "interpretation": interpret_coefficient(alpha, "krippendorff_alpha"),
                "level_of_measurement": dist_name,
                "distance": dist_name,
                "measure_unit": self.unit,
                "n_decisions": stats.get("n_decisions", n_decisions),
                "sigma_c_o_cc": round(do_scaled, 6),
                "sigma_c_nc_nc_minus_1": round(de_scaled, 6),
            }
        except Exception as e:
            return {"calculated": False, "display_name": name, "error": f"计算出错: {str(e)}"}
