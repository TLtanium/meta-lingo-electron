"""
Reliability Coefficients
信度系数计算模块（重构版）

基于字符索引-标签矩阵实现各种编码者间信度系数的计算：
- Average Pairwise Percent Agreement
- Fleiss' Kappa
- Average Pairwise Cohen's Kappa  
- Krippendorff's Alpha

计算逻辑：
- 文本按字符索引排列，每个字符一行
- 每个编码者生成一个 索引 x 标签 的二值矩阵（1=该标签覆盖该索引，0=不覆盖）
- 支持重叠标注（同一索引多个标签为1）
"""

import numpy as np
from typing import Dict, List, Tuple, Optional, Any

from .reliability_utils import (
    build_all_coder_matrices,
    calculate_all_pairwise_agreements,
    calculate_all_pairwise_kappas,
    calculate_fleiss_kappa_from_matrices,
    calculate_krippendorff_alpha_from_matrices,
    generate_coder_pair_label,
    interpret_coefficient
)

# Krippendorff's Alpha 现在使用手动实现，不再依赖 krippendorff 库
KRIPPENDORFF_AVAILABLE = True


class ReliabilityCoefficients:
    """信度系数计算器（基于字符索引-标签矩阵）"""
    
    def __init__(self):
        self.loaded_data: Optional[Dict] = None
        self.matrices: Optional[List[np.ndarray]] = None
        self.all_labels: Optional[List[str]] = None
        self.stats: Optional[Dict[str, Any]] = None
        
    def set_data(self, data: Dict) -> None:
        """
        设置计算数据并构建矩阵
        
        Args:
            data: 包含 annotation_data, common_text, framework 的字典
        """
        self.loaded_data = data
        
        # 获取文本长度
        common_text = data.get('common_text', '')
        text_length = len(common_text)
        
        # 获取标注数据
        annotation_data = data.get('annotation_data', [])
        
        # 构建所有编码者的矩阵
        if text_length > 0 and annotation_data:
            self.matrices, self.all_labels, self.stats = build_all_coder_matrices(
                annotation_data, text_length
            )
        else:
            self.matrices = []
            self.all_labels = []
            self.stats = {
                'n_coders': 0,
                'n_cases': 0,
                'n_decisions': 0,
                'n_labels': 0,
                'labels': []
            }
    
    def get_data_summary(self) -> Dict[str, Any]:
        """
        获取数据摘要统计
            
        Returns:
            包含编码者数、案例数、决策数等的字典
        """
        if self.stats:
            return self.stats
            return {
            'n_coders': 0,
            'n_cases': 0,
            'n_decisions': 0,
            'n_labels': 0,
            'labels': []
        }
    
    def calculate_percent_agreement(self, matrix: np.ndarray = None) -> Dict[str, Any]:
        """
        计算 Average Pairwise Percent Agreement
            
        Returns:
            计算结果字典，包含平均值和每对明细
        """
        try:
            if not self.matrices or len(self.matrices) < 2:
                return {
                    'calculated': False,
                    'display_name': 'Average Pairwise Percent Agreement',
                    'error': '需要至少2个编码者'
                }
            
            avg_agreement, pairwise_agreements = calculate_all_pairwise_agreements(self.matrices)
            
            # 格式化配对结果
            pairwise_details = {}
            for (i, j), agreement in pairwise_agreements.items():
                label = generate_coder_pair_label(i, j)
                pairwise_details[label] = round(agreement * 100, 3)  # 转为百分比
            
            interpretation = interpret_coefficient(avg_agreement, "percent_agreement")
            
            return {
                'calculated': True,
                'value': round(avg_agreement * 100, 3),  # 转为百分比
                'display_name': 'Average Pairwise Percent Agreement',
                'interpretation': interpretation,
                'pairwise_details': pairwise_details,
                'unit': '%'
            }
        except Exception as e:
            return {
                'calculated': False,
                'display_name': 'Average Pairwise Percent Agreement',
                'error': f'计算出错: {str(e)}'
            }
    
    def calculate_scotts_pi(self, matrix: np.ndarray = None) -> Dict[str, Any]:
        """
        Scott's Pi 已被 Average Pairwise Percent Agreement 替代
        保留此方法以保持向后兼容
        """
        return {
            'calculated': False,
            'display_name': "Scott's Pi",
            'error': "Scott's Pi 已被 Average Pairwise Percent Agreement 替代"
            }
    
    def calculate_cohens_kappa(self, matrix: np.ndarray = None) -> Dict[str, Any]:
        """
        计算 Average Pairwise Cohen's Kappa
            
        Returns:
            计算结果字典，包含平均值和每对明细
        """
        try:
            if not self.matrices or len(self.matrices) < 2:
                return {
                    'calculated': False,
                    'display_name': "Average Pairwise Cohen's Kappa",
                    'error': '需要至少2个编码者'
                }
            
            avg_kappa, pairwise_kappas = calculate_all_pairwise_kappas(self.matrices)
            
            # 格式化配对结果
            pairwise_details = {}
            for (i, j), (kappa, po, pe) in pairwise_kappas.items():
                label = generate_coder_pair_label(i, j)
                pairwise_details[label] = round(kappa, 4)
            
            interpretation = interpret_coefficient(avg_kappa, "cohens_kappa")
            
            return {
                'calculated': True,
                'value': round(avg_kappa, 4),
                'display_name': "Average Pairwise Cohen's Kappa",
                'interpretation': interpretation,
                'pairwise_details': pairwise_details
            }
        except Exception as e:
            return {
                'calculated': False,
                'display_name': "Average Pairwise Cohen's Kappa",
                'error': f'计算出错: {str(e)}'
            }
    
    def calculate_fleiss_kappa(self, matrix: np.ndarray = None) -> Dict[str, Any]:
        """
        计算 Fleiss' Kappa（多编码者）
            
        Returns:
            计算结果字典，包含 Kappa、观察一致性、期望一致性
        """
        try:
            if not self.matrices or len(self.matrices) < 2:
                return {
                    'calculated': False,
                    'display_name': "Fleiss' Kappa",
                    'error': '需要至少2个编码者'
                }
            
            kappa, observed, expected = calculate_fleiss_kappa_from_matrices(self.matrices)
            
            interpretation = interpret_coefficient(kappa, "fleiss_kappa")
            
            return {
                'calculated': True,
                'value': round(kappa, 4),
                'display_name': "Fleiss' Kappa",
                'interpretation': interpretation,
                'observed_agreement': round(observed, 4),
                'expected_agreement': round(expected, 4)
            }
        except Exception as e:
            return {
                'calculated': False,
                'display_name': "Fleiss' Kappa",
                'error': f'计算出错: {str(e)}'
            }
    
    def calculate_krippendorff_alpha(
        self, 
        matrix: np.ndarray = None,
        level_of_measurement: str = 'nominal'
    ) -> Dict[str, Any]:
        """
        计算 Krippendorff's Alpha
        
        Args:
            matrix: 忽略（保持向后兼容）
            level_of_measurement: 测量层次 (nominal/ordinal/interval/ratio)
            
        Returns:
            计算结果字典
        """
        try:
            if not KRIPPENDORFF_AVAILABLE:
                return {
                    'calculated': False,
                    'display_name': f"Krippendorff's Alpha ({level_of_measurement})",
                    'error': '缺少krippendorff库，请安装: pip install krippendorff'
                }
            
            if not self.matrices or len(self.matrices) < 2:
                return {
                    'calculated': False,
                    'display_name': f"Krippendorff's Alpha ({level_of_measurement})",
                    'error': '需要至少2个编码者'
                }
            
            alpha, n_decisions, sigma_c_o_cc, sigma_c_nc_nc_minus_1 = calculate_krippendorff_alpha_from_matrices(
                self.matrices, level_of_measurement
            )
            
            interpretation = interpret_coefficient(alpha, "krippendorff_alpha")
            
            # 获取统计信息
            stats = self.get_data_summary()
            
            return {
                'calculated': True,
                'value': round(alpha, 4),
                'display_name': f"Krippendorff's Alpha ({level_of_measurement})",
                'interpretation': interpretation,
                'level_of_measurement': level_of_measurement,
                'n_decisions': stats.get('n_decisions', n_decisions),
                'sigma_c_o_cc': round(sigma_c_o_cc, 6),  # coincidence matrix 对角线和（观察一致性）
                'sigma_c_nc_nc_minus_1': round(sigma_c_nc_nc_minus_1, 6)  # 边缘频率期望值
            }
        except Exception as e:
            return {
                'calculated': False,
                'display_name': f"Krippendorff's Alpha ({level_of_measurement})",
                'error': f'计算出错: {str(e)}'
            }
    
    # 保留旧方法的兼容性（内部使用）
    def _convert_matrix_to_label_sequences(self) -> Tuple[Optional[List], Optional[List]]:
        """向后兼容：已不再使用"""
        return None, None
    
    def _convert_matrix_to_reliability_data(self) -> Optional[List[List]]:
        """向后兼容：已不再使用"""
        return None
