"""
Reliability Utils
信度计算辅助函数

提供文本处理、相似度计算、矩阵转换等辅助功能。
新增：基于字符索引-标签矩阵的信度计算工具函数
"""

import re
import numpy as np
from typing import Dict, List, Tuple, Optional, Set, Any
from collections import Counter, defaultdict
from itertools import combinations


def normalize_text(text: str) -> str:
    """
    标准化文本以便比较
    
    Args:
        text: 原始文本
        
    Returns:
        标准化后的文本
    """
    if not text:
        return ""
    # 移除多余空白和换行，统一为单空格
    return re.sub(r'\s+', ' ', text.strip())


def levenshtein_distance(s1: str, s2: str) -> int:
    """
    计算两个字符串的编辑距离 (Levenshtein Distance)
    
    Args:
        s1: 字符串1
        s2: 字符串2
        
    Returns:
        编辑距离
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    
    if len(s2) == 0:
        return len(s1)
    
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    计算两个文本的相似度 (基于编辑距离)
    
    Args:
        text1: 文本1
        text2: 文本2
        
    Returns:
        相似度 (0.0-1.0)
    """
    if not text1 or not text2:
        return 0.0
    
    edit_distance = levenshtein_distance(text1.lower(), text2.lower())
    max_len = max(len(text1), len(text2))
    
    if max_len == 0:
        return 1.0
    
    return 1 - (edit_distance / max_len)


def find_fuzzy_matches(
    target_text: str, 
    full_text: str, 
    original_pos: int, 
    tolerance: float
) -> List[Tuple[int, int]]:
    """
    基于文本相似度的模糊匹配
    
    Args:
        target_text: 目标文本
        full_text: 完整文本
        original_pos: 原始位置
        tolerance: 相似度阈值
        
    Returns:
        匹配位置列表 [(start, end), ...]
    """
    matches = []
    target_len = len(target_text)
    
    if target_len == 0:
        return matches
    
    # 设置搜索窗口
    search_radius = int(target_len * 0.5)
    search_start = max(0, original_pos - search_radius)
    search_end = min(len(full_text), original_pos + target_len + search_radius)
    
    # 在搜索窗口内寻找相似文本
    for start in range(search_start, search_end - target_len + 1):
        candidate = full_text[start:start + target_len]
        similarity = calculate_text_similarity(target_text, candidate)
        
        if similarity >= tolerance:
            matches.append((start, start + target_len))
    
    # 如果没有找到匹配，尝试不同长度的候选文本
    if not matches:
        matches.extend(find_variable_length_matches(
            target_text, full_text, original_pos, tolerance
        ))
    
    return matches


def find_variable_length_matches(
    target_text: str, 
    full_text: str, 
    original_pos: int, 
    tolerance: float
) -> List[Tuple[int, int]]:
    """
    寻找不同长度的模糊匹配
    
    Args:
        target_text: 目标文本
        full_text: 完整文本
        original_pos: 原始位置
        tolerance: 相似度阈值
        
    Returns:
        匹配位置列表
    """
    matches = []
    target_len = len(target_text)
    
    if target_len == 0:
        return matches
    
    # 尝试不同的长度变化 (原长度的 -1/3 到 +1/3)
    for length_variation in range(-target_len // 3, target_len // 3 + 1):
        candidate_len = target_len + length_variation
        if candidate_len <= 0:
            continue
        
        # 在原位置附近搜索
        search_radius = target_len // 2
        search_start = max(0, original_pos - search_radius)
        search_end = min(len(full_text), original_pos + target_len + search_radius)
        
        for start in range(search_start, search_end - candidate_len + 1):
            candidate = full_text[start:start + candidate_len]
            similarity = calculate_text_similarity(target_text, candidate)
            
            if similarity >= tolerance:
                matches.append((start, start + candidate_len))
    
    return matches


def get_sample_positions(
    annotation_data: List[Dict], 
    text_length: int, 
    max_positions: int = 1000
) -> List[int]:
    """
    获取有标注的位置进行采样（只返回有至少一个编码者标注的位置）
    
    Args:
        annotation_data: 标注数据列表
        text_length: 文本长度
        max_positions: 最大采样位置数
        
    Returns:
        采样位置列表（只包含有标注的位置）
    """
    # 收集所有被标注覆盖的位置
    annotated_positions: Set[int] = set()
    
    for data in annotation_data:
        annotations = data.get('annotations', [])
        for ann in annotations:
            start_pos = ann.get('position', 0)
            ann_text = ann.get('text', '')
            end_pos = ann.get('end_position', start_pos + len(ann_text))
            
            # 添加标注覆盖的所有位置
            for pos in range(start_pos, min(end_pos, text_length)):
                annotated_positions.add(pos)
    
    # 确保位置在有效范围内
    annotated_positions = {pos for pos in annotated_positions if 0 <= pos < text_length}
    
    # 如果没有标注位置，返回空列表
    if not annotated_positions:
        return []
    
    # 限制最大位置数量
    positions = sorted(list(annotated_positions))
    if len(positions) > max_positions:
        step = len(positions) // max_positions
        positions = positions[::step][:max_positions]
    
    return positions


def get_meaningful_positions(
    annotation_data: List[Dict], 
    text_length: int, 
    max_positions: int = 2000
) -> List[int]:
    """
    获取有意义的位置进行采样（只返回有至少一个编码者标注的位置）
    
    Args:
        annotation_data: 标注数据列表
        text_length: 文本长度
        max_positions: 最大采样位置数
        
    Returns:
        采样位置列表（只包含有标注的位置）
    """
    # 收集所有被标注覆盖的位置
    annotated_positions: Set[int] = set()
    
    for data in annotation_data:
        annotations = data.get('annotations', [])
        for ann in annotations:
            start_pos = ann.get('position', 0)
            ann_text = ann.get('text', '')
            end_pos = ann.get('end_position', start_pos + len(ann_text))
            
            # 添加标注覆盖的所有位置
            for pos in range(start_pos, min(end_pos, text_length)):
                annotated_positions.add(pos)
    
    # 确保位置在有效范围内
    annotated_positions = {pos for pos in annotated_positions if 0 <= pos < text_length}
    
    # 如果没有标注位置，返回空列表
    if not annotated_positions:
        return []
    
    # 限制最大位置数量
    positions = sorted(list(annotated_positions))
    if len(positions) > max_positions:
        step = len(positions) // max_positions
        positions = positions[::step][:max_positions]
    
    return positions


def get_label_at_position(
    annotations: List[Dict], 
    position: int
) -> Optional[str]:
    """
    获取指定位置的标签 - 处理重叠标注时选择最具体（范围最小）的标签
    
    Args:
        annotations: 标注列表
        position: 文本位置
        
    Returns:
        标签名称或 None
    """
    matching_annotations = []
    
    for ann in annotations:
        start_pos = ann.get('position', 0)
        ann_text = ann.get('text', '')
        end_pos = ann.get('end_position', start_pos + len(ann_text))
        
        if start_pos <= position < end_pos:
            # 计算标注范围大小
            span_size = end_pos - start_pos
            matching_annotations.append((ann, span_size))
    
    if not matching_annotations:
        return None
    
    # 如果有多个重叠标注，优先选择：
    # 1. 范围最小的（最具体的）
    # 2. nesting_level 最高的
    if len(matching_annotations) > 1:
        matching_annotations.sort(
            key=lambda x: (x[1], -x[0].get('nesting_level', 1))
        )
    
    return matching_annotations[0][0].get('label')


def get_label_hierarchy_depth(annotations: List[Dict], label: str) -> int:
    """
    根据标注数据获取标签的层级深度
    
    Args:
        annotations: 标注列表
        label: 标签名称
        
    Returns:
        层级深度
    """
    for ann in annotations:
        if ann.get('label') == label:
            return ann.get('depth', ann.get('nesting_level', 0))
    return 0


def build_label_mapping(annotation_data: List[Dict]) -> Tuple[Dict[str, int], int]:
    """
    构建标签到索引的映射
    
    Args:
        annotation_data: 标注数据列表
        
    Returns:
        (标签映射字典, NO_ANNOTATION 的索引)
    """
    all_labels: Set[str] = set()
    
    for data in annotation_data:
        annotations = data.get('annotations', [])
        for ann in annotations:
            label = ann.get('label')
            if label:
                all_labels.add(label)
    
    # 创建标签到索引的映射
    label_mapping = {label: i for i, label in enumerate(sorted(all_labels))}
    no_annotation_idx = len(all_labels)  # 无标注类别
    label_mapping['NO_ANNOTATION'] = no_annotation_idx
    
    return label_mapping, no_annotation_idx


def interpret_coefficient(value: float, coeff_type: str) -> str:
    """
    解释信度系数值
    
    Args:
        value: 系数值
        coeff_type: 系数类型
        
    Returns:
        解释文本
    """
    if value >= 0.8:
        return "几乎完美的一致性"
    elif value >= 0.6:
        return "实质性一致"
    elif value >= 0.4:
        return "中等一致"
    elif value >= 0.2:
        return "一般一致"
    elif value >= 0.0:
        return "轻微一致"
    else:
        return "差于偶然水平"


def extract_context(
    text: str, 
    start: int, 
    end: int, 
    context_length: int = 30
) -> Tuple[str, str]:
    """
    提取标注单元的上下文
    
    Args:
        text: 完整文本
        start: 起始位置
        end: 结束位置
        context_length: 上下文长度
        
    Returns:
        (左侧上下文, 右侧上下文)
    """
    left_start = max(0, start - context_length)
    left_context = text[left_start:start]
    
    right_end = min(len(text), end + context_length)
    right_context = text[end:right_end]
    
    return left_context, right_context


def collect_unique_annotation_units(
    files_data: List[Dict],
    context_length: int = 30
) -> List[Dict]:
    """
    收集所有唯一的标注单元
    
    Args:
        files_data: 文件数据列表 (每个包含 text 和 annotations)
        context_length: 上下文长度
        
    Returns:
        唯一标注单元列表
    """
    all_units = []
    seen_positions: Set[Tuple[int, int]] = set()
    
    # 使用第一个文件的文本作为参考
    reference_text = ''
    for file_data in files_data:
        if file_data.get('text'):
            reference_text = file_data['text']
            break
    
    for file_idx, file_data in enumerate(files_data):
        text = file_data.get('text', '') or reference_text
        annotations = file_data.get('annotations', [])
        filename = file_data.get('filename', f'file_{file_idx}')
        
        for ann in annotations:
            # 兼容多种字段名
            start_pos = ann.get('startPosition', ann.get('position', ann.get('start_position', 0)))
            ann_text = ann.get('text', '')
            end_pos = ann.get('endPosition', ann.get('end_position', start_pos + len(ann_text)))
            
            position_key = (start_pos, end_pos)
            
            if position_key not in seen_positions:
                seen_positions.add(position_key)
                
                left_context, right_context = extract_context(
                    text, start_pos, end_pos, context_length
                )
                
                all_units.append({
                    'file_idx': file_idx,
                    'filename': filename,
                    'coder_id': f'Coder_{file_idx + 1}',
                    'label': ann.get('label', ''),
                    'start_position': start_pos,
                    'end_position': end_pos,
                    'left_context': left_context,
                    'annotation_unit': ann_text,
                    'right_context': right_context,
                    'remark': ann.get('remark', ''),
                    'full_path': ann.get('full_path', ann.get('path', ann.get('labelPath', ''))),
                    'color': ann.get('color', '#FFD700')
                })
    
    # 按位置排序
    all_units.sort(key=lambda x: x['start_position'])
    
    return all_units


# ==================== 索引-标签矩阵构建工具函数 ====================

def build_index_label_matrix(
    annotations: List[Dict],
    text_length: int,
    all_labels: List[str]
) -> np.ndarray:
    """
    为单个编码者构建字符索引-标签矩阵
    
    矩阵形状: (text_length, num_labels)
    每个元素为 0 或 1，表示该字符索引是否被该标签覆盖
    
    Args:
        annotations: 单个编码者的标注列表
        text_length: 文本总字符数
        all_labels: 所有可能的标签列表（用于确定列顺序）
        
    Returns:
        numpy 二值矩阵 (text_length x num_labels)
    """
    num_labels = len(all_labels)
    label_to_idx = {label: idx for idx, label in enumerate(all_labels)}
    
    # 初始化全零矩阵
    matrix = np.zeros((text_length, num_labels), dtype=np.int8)
    
    for ann in annotations:
        label = ann.get('label', '')
        if not label or label not in label_to_idx:
            continue
            
        label_idx = label_to_idx[label]
        
        # 获取标注的起止位置
        start_pos = ann.get('position', ann.get('startPosition', ann.get('start_position', 0)))
        ann_text = ann.get('text', '')
        end_pos = ann.get('end_position', ann.get('endPosition', start_pos + len(ann_text)))
        
        # 确保在有效范围内
        start_pos = max(0, start_pos)
        end_pos = min(text_length, end_pos)
        
        # 标记覆盖的所有字符索引
        if start_pos < end_pos:
            matrix[start_pos:end_pos, label_idx] = 1
    
    return matrix


def build_all_coder_matrices(
    annotation_data: List[Dict],
    text_length: int
) -> Tuple[List[np.ndarray], List[str], Dict[str, Any]]:
    """
    为所有编码者构建索引-标签矩阵
    
    Args:
        annotation_data: 所有编码者的标注数据列表
        text_length: 文本总字符数
        
    Returns:
        (matrices, all_labels, stats)
        - matrices: 每个编码者的矩阵列表
        - all_labels: 所有标签列表
        - stats: 统计信息字典
    """
    # 收集所有标签
    all_labels_set: Set[str] = set()
    for coder_data in annotation_data:
        for ann in coder_data.get('annotations', []):
            label = ann.get('label', '')
            if label:
                all_labels_set.add(label)
    
    all_labels = sorted(list(all_labels_set))
    
    # 为每个编码者构建矩阵
    matrices = []
    for coder_data in annotation_data:
        matrix = build_index_label_matrix(
            coder_data.get('annotations', []),
            text_length,
            all_labels
        )
        matrices.append(matrix)
    
    # 计算统计信息
    n_coders = len(matrices)
    n_cases = text_length  # 字符数即为案例数
    n_decisions = sum(np.sum(m) for m in matrices)  # 所有标注决策总数
    
    stats = {
        'n_coders': n_coders,
        'n_cases': n_cases,
        'n_decisions': int(n_decisions),
        'n_labels': len(all_labels),
        'labels': all_labels
    }
    
    return matrices, all_labels, stats


def get_coder_labels_at_index(
    matrices: List[np.ndarray],
    char_index: int,
    all_labels: List[str]
) -> List[Set[str]]:
    """
    获取所有编码者在指定字符索引处的标签集合
    
    Args:
        matrices: 所有编码者的矩阵
        char_index: 字符索引
        all_labels: 所有标签列表
        
    Returns:
        每个编码者在该位置的标签集合列表
    """
    result = []
    for matrix in matrices:
        labels_at_pos = set()
        for label_idx, label in enumerate(all_labels):
            if matrix[char_index, label_idx] == 1:
                labels_at_pos.add(label)
        result.append(labels_at_pos)
    return result


def calculate_pairwise_agreement_from_matrices(
    matrix1: np.ndarray,
    matrix2: np.ndarray
) -> float:
    """
    计算两个编码者矩阵之间的百分比一致性
    
    一致性定义：对于每个字符索引，如果两个编码者的标签集合完全相同则一致
    
    Args:
        matrix1: 编码者1的矩阵
        matrix2: 编码者2的矩阵
        
    Returns:
        百分比一致性 (0.0 - 1.0)
    """
    n_cases = matrix1.shape[0]
    if n_cases == 0:
        return 0.0
    
    agreements = 0
    for i in range(n_cases):
        # 检查该位置两个编码者的标签向量是否完全相同
        if np.array_equal(matrix1[i], matrix2[i]):
            agreements += 1
    
    return agreements / n_cases


def calculate_all_pairwise_agreements(
    matrices: List[np.ndarray]
) -> Tuple[float, Dict[Tuple[int, int], float]]:
    """
    计算所有编码者对的百分比一致性
    
    Args:
        matrices: 所有编码者的矩阵列表
        
    Returns:
        (平均一致性, 每对一致性字典)
    """
    n_coders = len(matrices)
    if n_coders < 2:
        return 0.0, {}
    
    pairwise_agreements = {}
    total_agreement = 0.0
    n_pairs = 0
    
    for i, j in combinations(range(n_coders), 2):
        agreement = calculate_pairwise_agreement_from_matrices(matrices[i], matrices[j])
        pairwise_agreements[(i, j)] = agreement
        total_agreement += agreement
        n_pairs += 1
    
    avg_agreement = total_agreement / n_pairs if n_pairs > 0 else 0.0
    
    return avg_agreement, pairwise_agreements


def calculate_cohens_kappa_from_matrices(
    matrix1: np.ndarray,
    matrix2: np.ndarray
) -> Tuple[float, float, float]:
    """
    计算两个编码者矩阵之间的 Cohen's Kappa
    
    Args:
        matrix1: 编码者1的矩阵
        matrix2: 编码者2的矩阵
        
    Returns:
        (kappa, observed_agreement, expected_agreement)
    """
    n_cases = matrix1.shape[0]
    n_labels = matrix1.shape[1]
    
    if n_cases == 0:
        return 0.0, 0.0, 0.0
    
    # 将每个位置的标签向量转换为单一分类
    # 使用标签向量的二进制表示作为类别ID
    def vector_to_category(row):
        # 将二进制向量转为整数作为类别
        return tuple(row.tolist())
    
    categories1 = [vector_to_category(matrix1[i]) for i in range(n_cases)]
    categories2 = [vector_to_category(matrix2[i]) for i in range(n_cases)]
    
    # 计算观察一致性 Po
    agreements = sum(1 for c1, c2 in zip(categories1, categories2) if c1 == c2)
    po = agreements / n_cases
    
    # 计算期望一致性 Pe
    all_categories = set(categories1) | set(categories2)
    counter1 = Counter(categories1)
    counter2 = Counter(categories2)
    
    pe = 0.0
    for cat in all_categories:
        p1 = counter1.get(cat, 0) / n_cases
        p2 = counter2.get(cat, 0) / n_cases
        pe += p1 * p2
    
    # 计算 Kappa
    if pe >= 1.0:
        kappa = 1.0 if po >= 1.0 else 0.0
    else:
        kappa = (po - pe) / (1 - pe)
    
    return kappa, po, pe


def calculate_all_pairwise_kappas(
    matrices: List[np.ndarray]
) -> Tuple[float, Dict[Tuple[int, int], Tuple[float, float, float]]]:
    """
    计算所有编码者对的 Cohen's Kappa
    
    Args:
        matrices: 所有编码者的矩阵列表
        
    Returns:
        (平均Kappa, 每对结果字典{(i,j): (kappa, po, pe)})
    """
    n_coders = len(matrices)
    if n_coders < 2:
        return 0.0, {}
    
    pairwise_kappas = {}
    total_kappa = 0.0
    n_pairs = 0
    
    for i, j in combinations(range(n_coders), 2):
        kappa, po, pe = calculate_cohens_kappa_from_matrices(matrices[i], matrices[j])
        pairwise_kappas[(i, j)] = (kappa, po, pe)
        total_kappa += kappa
        n_pairs += 1
    
    avg_kappa = total_kappa / n_pairs if n_pairs > 0 else 0.0
    
    return avg_kappa, pairwise_kappas


def calculate_fleiss_kappa_from_matrices(
    matrices: List[np.ndarray]
) -> Tuple[float, float, float]:
    """
    计算 Fleiss' Kappa（多编码者）
    
    Args:
        matrices: 所有编码者的矩阵列表
        
    Returns:
        (kappa, observed_agreement, expected_agreement)
    """
    n_coders = len(matrices)
    if n_coders < 2:
        return 0.0, 0.0, 0.0
    
    n_cases = matrices[0].shape[0]
    if n_cases == 0:
        return 0.0, 0.0, 0.0
    
    # 将每个位置的标签向量转换为类别
    def vector_to_category(row):
        return tuple(row.tolist())
    
    # 收集所有可能的类别
    all_categories = set()
    for matrix in matrices:
        for i in range(n_cases):
            all_categories.add(vector_to_category(matrix[i]))
    
    category_list = sorted(all_categories, key=lambda x: str(x))
    cat_to_idx = {cat: idx for idx, cat in enumerate(category_list)}
    n_categories = len(category_list)
    
    # 构建评分矩阵：每行是一个案例，每列是一个类别，值是选择该类别的编码者数量
    rating_matrix = np.zeros((n_cases, n_categories), dtype=int)
    
    for coder_idx, matrix in enumerate(matrices):
        for case_idx in range(n_cases):
            cat = vector_to_category(matrix[case_idx])
            cat_idx = cat_to_idx[cat]
            rating_matrix[case_idx, cat_idx] += 1
    
    # 计算每个案例的一致性 P_i
    P_i = np.zeros(n_cases)
    for i in range(n_cases):
        sum_squares = np.sum(rating_matrix[i] ** 2)
        P_i[i] = (sum_squares - n_coders) / (n_coders * (n_coders - 1)) if n_coders > 1 else 0
    
    # 平均观察一致性 P_bar
    P_bar = np.mean(P_i)
    
    # 计算期望一致性 P_e
    p_j = np.sum(rating_matrix, axis=0) / (n_cases * n_coders) if n_cases * n_coders > 0 else np.zeros(n_categories)
    P_e = np.sum(p_j ** 2)
    
    # 计算 Fleiss' Kappa
    if P_e >= 1.0:
        kappa = 1.0 if P_bar >= 1.0 else 0.0
    else:
        kappa = (P_bar - P_e) / (1 - P_e)
    
    return float(kappa), float(P_bar), float(P_e)


def _get_nominal_delta(c: int, k: int) -> float:
    """Nominal 差异函数：δ(c,k) = 0 如果 c=k，否则 = 1"""
    return 0.0 if c == k else 1.0


def _get_interval_delta(c: int, k: int) -> float:
    """Interval 差异函数：δ(c,k) = (c - k)²"""
    return float((c - k) ** 2)


def _get_ratio_delta(c: int, k: int) -> float:
    """Ratio 差异函数：δ(c,k) = ((c - k) / (c + k))²"""
    if c == k:
        return 0.0
    if c + k == 0:
        return 0.0
    return float(((c - k) / (c + k)) ** 2)


def _get_ordinal_delta(c: int, k: int, n_c: np.ndarray) -> float:
    """
    Ordinal 差异函数（需要边缘频率）
    
    δ_ordinal(c,k) = [Σ(g从min(c,k)到max(c,k)的 n_g) - (n_c + n_k)/2]²
    
    Args:
        c: 类别 c 的索引
        k: 类别 k 的索引
        n_c: 边缘频率数组
        
    Returns:
        差异值
    """
    if c == k:
        return 0.0
    
    low, high = min(c, k), max(c, k)
    
    # 计算从 low 到 high（包含）的所有类别频率之和
    cumsum = np.sum(n_c[low:high + 1])
    
    # 减去两端类别频率的一半
    result = cumsum - (n_c[c] + n_c[k]) / 2.0
    
    return float(result ** 2)


def calculate_krippendorff_alpha_from_matrices(
    matrices: List[np.ndarray],
    level_of_measurement: str = 'nominal'
) -> Tuple[float, int, float, float]:
    """
    计算 Krippendorff's Alpha 及其中间统计量
    
    基于 coincidence matrix 计算，支持不同测量层次：
    - nominal: 名义尺度（类别无序）
    - ordinal: 序数尺度（类别有序）
    - interval: 等距尺度（数值差异有意义）
    - ratio: 等比尺度（比例有意义）
    
    Args:
        matrices: 所有编码者的矩阵列表
        level_of_measurement: 测量层次 (nominal/ordinal/interval/ratio)
        
    Returns:
        (alpha, n_decisions, observed_disagreement, expected_disagreement)
    """
    n_coders = len(matrices)
    if n_coders < 2:
        return 0.0, 0, 0.0, 0.0
    
    n_cases = matrices[0].shape[0]
    if n_cases == 0:
        return 0.0, 0, 0.0, 0.0
    
    # 将每个位置的标签向量转换为类别ID
    def vector_to_category(row):
        return tuple(row.tolist())
    
    # 收集所有类别并建立映射
    all_categories = set()
    for matrix in matrices:
        for i in range(n_cases):
            all_categories.add(vector_to_category(matrix[i]))
    
    category_list = sorted(all_categories, key=lambda x: str(x))
    cat_to_id = {cat: idx for idx, cat in enumerate(category_list)}
    n_categories = len(category_list)
    
    # 构建每个案例的编码者评分
    # ratings[case_idx] = [coder1_category_id, coder2_category_id, ...]
    ratings = []
    for case_idx in range(n_cases):
        case_ratings = []
        for matrix in matrices:
            cat = vector_to_category(matrix[case_idx])
            case_ratings.append(cat_to_id[cat])
        ratings.append(case_ratings)
    
    # 构建 coincidence matrix（一致性矩阵）
    # 对于每个单元，将所有编码者配对的评分组合加入矩阵
    coincidence_matrix = np.zeros((n_categories, n_categories), dtype=float)
    
    for case_ratings in ratings:
        # 计算该单元的编码者数量（有评分的）
        m_u = len(case_ratings)  # 该单元的编码者数
        if m_u < 2:
            continue
        
        # 对于该单元内的每对编码者评分，贡献到 coincidence matrix
        # 权重是 1/(m_u - 1)
        weight = 1.0 / (m_u - 1)
        
        for i in range(m_u):
            for j in range(m_u):
                if i != j:
                    c_i = case_ratings[i]
                    c_j = case_ratings[j]
                    coincidence_matrix[c_i, c_j] += weight
    
    # 计算边缘频率 n_c（每个类别的总频率）
    n_c = np.sum(coincidence_matrix, axis=1)  # 每行的和
    
    # 总配对数 n = coincidence matrix 所有元素之和
    n_total = np.sum(coincidence_matrix)
    
    if n_total < 2:
        return 0.0, 0, 0.0, 0.0
    
    # 根据测量层次选择差异函数并计算 Do 和 De
    # Do = Σ(c,k) o_ck * δ(c,k) / n
    # De = Σ(c,k) n_c * n_k * δ(c,k) / (n * (n-1))
    
    Do = 0.0
    De = 0.0
    
    for c in range(n_categories):
        for k in range(n_categories):
            # 根据测量层次获取差异值
            if level_of_measurement == 'nominal':
                delta_ck = _get_nominal_delta(c, k)
            elif level_of_measurement == 'ordinal':
                delta_ck = _get_ordinal_delta(c, k, n_c)
            elif level_of_measurement == 'interval':
                delta_ck = _get_interval_delta(c, k)
            elif level_of_measurement == 'ratio':
                delta_ck = _get_ratio_delta(c, k)
            else:
                delta_ck = _get_nominal_delta(c, k)
            
            Do += coincidence_matrix[c, k] * delta_ck
            De += n_c[c] * n_c[k] * delta_ck
    
    Do = Do / n_total
    De = De / (n_total * (n_total - 1))
    
    # 计算 Alpha
    # Alpha = 1 - Do/De
    if De > 0:
        alpha = 1.0 - (Do / De)
    else:
        alpha = 1.0 if Do == 0 else 0.0
    
    # 计算 n_decisions (总标注决策数 - 矩阵中值为1的单元格总数)
    n_decisions = sum(np.sum(m) for m in matrices)
    
    # 返回 Do 和 De 作为统计量（与 ReCal 的 sigma_c_o_cc 和 sigma_c_nc_nc_minus_1 对应）
    # 注意：对于 nominal 尺度，Do * n_total = n_total - sigma_c_o_cc
    #       De * n_total * (n_total - 1) = sigma_c_nc_nc_minus_1 (对于 nominal)
    
    # 为了与 ReCal 兼容，返回原始统计量（仅对 nominal 有意义）
    if level_of_measurement == 'nominal':
        sigma_c_o_cc = np.sum(np.diag(coincidence_matrix))
        sigma_c_nc_nc_minus_1 = np.sum(n_c * (n_c - 1))
    else:
        # 对于非 nominal 尺度，返回 Do 和 De 的缩放值
        sigma_c_o_cc = Do * n_total  # 观察不一致性的总量
        sigma_c_nc_nc_minus_1 = De * n_total * (n_total - 1)  # 期望不一致性的总量
    
    return float(alpha), int(n_decisions), float(sigma_c_o_cc), float(sigma_c_nc_nc_minus_1)


def generate_coder_pair_label(i: int, j: int) -> str:
    """
    生成编码者对的标签，如 "cols 1 & 2"
    
    Args:
        i: 第一个编码者索引 (0-based)
        j: 第二个编码者索引 (0-based)
        
    Returns:
        格式化的标签字符串
    """
    return f"cols {i + 1} & {j + 1}"

