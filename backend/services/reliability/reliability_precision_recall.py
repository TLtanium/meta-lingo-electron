"""
Reliability Precision/Recall
召回率和精确率计算模块

基于标准答案（黄金标准）计算各编码者的：
- 召回率 (Recall): 正确标注数 / 标准答案标注总数
- 精确率 (Precision): 正确标注数 / 编码者标注总数
- F1分数: 2 * (precision * recall) / (precision + recall)

支持按标签分类统计各项指标。
"""

from typing import Dict, List, Tuple, Optional, Any, Set
import numpy as np


def _spans_overlap_match(coder_ann: Dict, gold_ann: Dict, coverage: str = 'majority') -> bool:
    """判断两条标注是否"重叠匹配"：标签相等 且 字符 span 重叠达到阈值。

    'majority'：重叠 ≥ 50%（取较短 span 为基准）；'any'：任意重叠即可。
    与 token 主口径一致，给边界略偏的标注部分功劳。
    """
    cs, ce, cl = _ann_to_span(coder_ann)
    gs, ge, gl = _ann_to_span(gold_ann)
    if cs is None or gs is None or cl != gl or not cl:
        return False
    overlap = min(ce, ge) - max(cs, gs)
    if overlap <= 0:
        return False
    if coverage == 'any':
        return True
    shorter = min(ce - cs, ge - gs)
    if shorter <= 0:
        return False
    return overlap >= 0.5 * shorter


def _ann_to_span(ann: Dict):
    """取 (start, end, label)，兼容多种字段名。"""
    start = ann.get('position')
    if start is None:
        start = ann.get('startPosition')
    if start is None:
        start = ann.get('start_position')
    text = ann.get('text', '') or ''
    label = ann.get('label', '') or ''
    end = ann.get('end_position')
    if end is None:
        end = ann.get('endPosition')
    if end is None and start is not None:
        end = start + len(text)
    if start is None or end is None:
        return None, None, label
    return int(start), int(end), label


def _overlap_counts(coder_anns: List[Dict], gold_anns: List[Dict], coverage: str):
    """贪心 1:1 重叠匹配，返回 (tp, fp, fn, matched_coder_idx_set, matched_gold_idx_set)。"""
    valid_coder = [a for a in coder_anns if _ann_to_span(a)[2]]
    valid_gold = [a for a in gold_anns if _ann_to_span(a)[2]]
    used_gold = set()
    tp = 0
    matched_coder = set()
    for ci, ca in enumerate(valid_coder):
        for gi, ga in enumerate(valid_gold):
            if gi in used_gold:
                continue
            if _spans_overlap_match(ca, ga, coverage):
                used_gold.add(gi)
                matched_coder.add(ci)
                tp += 1
                break
    fp = len(valid_coder) - tp
    fn = len(valid_gold) - len(used_gold)
    return tp, fp, fn, valid_coder, valid_gold, matched_coder, used_gold


def _filter_annotations_by_label(annotation_data: List[Dict], included: Optional[Set[str]]) -> List[Dict]:
    """按 included 标签集过滤各编码者的标注（None=不过滤）。"""
    if not included:
        return annotation_data
    out = []
    for coder in annotation_data:
        kept = [a for a in coder.get('annotations', []) if a.get('label', '') in included]
        nc = dict(coder)
        nc['annotations'] = kept
        out.append(nc)
    return out


def calculate_precision_recall(
    annotation_data: List[Dict],
    gold_standard_index: int,
    text_length: int,
    pr_matching: str = 'overlap',
    coverage: str = 'majority',
    included_labels: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    计算召回率和精确率

    Args:
        annotation_data: 所有编码者的标注数据列表
        gold_standard_index: 标准答案的编码者索引
        text_length: 文本长度
        pr_matching: 'overlap'(默认，与 token 口径对齐) | 'exact'(精确 span 元组)
        coverage: overlap 匹配的覆盖阈值 'majority' | 'any'
        included_labels: 仅考虑这些标签（None=全部）

    Returns:
        包含召回率、精确率、F1分数等指标的字典
    """
    # 标签过滤（与系数计算口径一致）
    annotation_data = _filter_annotations_by_label(
        annotation_data, set(included_labels) if included_labels else None
    )
    if gold_standard_index < 0 or gold_standard_index >= len(annotation_data):
        return {
            'calculated': False,
            'display_name': '召回率/精确率 (Recall/Precision)',
            'error': '无效的标准答案索引'
        }
    
    if len(annotation_data) < 2:
        return {
            'calculated': False,
            'display_name': '召回率/精确率 (Recall/Precision)',
            'error': '需要至少2个编码者'
        }
    
    # 获取标准答案的标注
    gold_standard = annotation_data[gold_standard_index]
    gold_annotations = gold_standard.get('annotations', [])
    
    if not gold_annotations:
        return {
            'calculated': False,
            'display_name': '召回率/精确率 (Recall/Precision)',
            'error': '标准答案没有标注'
        }
    
    # 将标准答案的标注转换为集合，方便比较
    # 使用 (start, end, label) 元组作为标识
    gold_set = _annotations_to_set(gold_annotations)
    
    # 收集所有使用的标签
    all_labels: Set[str] = set()
    for ann in gold_annotations:
        all_labels.add(ann.get('label', ''))
    
    for i, coder_data in enumerate(annotation_data):
        if i == gold_standard_index:
            continue
        for ann in coder_data.get('annotations', []):
            all_labels.add(ann.get('label', ''))
    
    # 移除空标签
    all_labels.discard('')
    
    # 计算每个编码者的指标
    coder_details: Dict[str, Dict[str, float]] = {}
    by_label: Dict[str, Dict[str, Any]] = {label: {
        'true_positives': 0,
        'false_positives': 0,
        'false_negatives': 0
    } for label in all_labels}
    
    total_recall = 0.0
    total_precision = 0.0
    total_f1 = 0.0
    num_coders = 0
    
    for i, coder_data in enumerate(annotation_data):
        if i == gold_standard_index:
            continue
        
        coder_id = coder_data.get('coder_id', f'Coder_{i+1}')
        coder_annotations = coder_data.get('annotations', [])

        if pr_matching == 'exact':
            # 精确 (start,end,label) 元组匹配
            coder_set = _annotations_to_set(coder_annotations)
            true_positives = len(gold_set & coder_set)
            false_positives = len(coder_set - gold_set)
            false_negatives = len(gold_set - coder_set)
            gold_total = len(gold_set)
            coder_total = len(coder_set)
            # 按标签统计
            for ann in coder_annotations:
                label = ann.get('label', '')
                if not label or label not in by_label:
                    continue
                if _annotation_to_key(ann) in gold_set:
                    by_label[label]['true_positives'] += 1
                else:
                    by_label[label]['false_positives'] += 1
            for gold_ann in gold_annotations:
                label = gold_ann.get('label', '')
                if not label or label not in by_label:
                    continue
                if _annotation_to_key(gold_ann) not in coder_set:
                    by_label[label]['false_negatives'] += 1
        else:
            # 重叠匹配（与 token 主口径对齐）
            (true_positives, false_positives, false_negatives,
             valid_coder, valid_gold, matched_coder, used_gold) = _overlap_counts(
                coder_annotations, gold_annotations, coverage
            )
            gold_total = len(valid_gold)
            coder_total = len(valid_coder)
            for ci2, ca in enumerate(valid_coder):
                label = _ann_to_span(ca)[2]
                if label not in by_label:
                    continue
                if ci2 in matched_coder:
                    by_label[label]['true_positives'] += 1
                else:
                    by_label[label]['false_positives'] += 1
            for gi2, ga in enumerate(valid_gold):
                label = _ann_to_span(ga)[2]
                if label not in by_label:
                    continue
                if gi2 not in used_gold:
                    by_label[label]['false_negatives'] += 1

        # 计算该编码者的召回率和精确率
        recall = true_positives / gold_total if gold_total > 0 else 0.0
        precision = true_positives / coder_total if coder_total > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        coder_details[coder_id] = {
            'recall': round(recall, 4),
            'precision': round(precision, 4),
            'f1_score': round(f1, 4)
        }

        total_recall += recall
        total_precision += precision
        total_f1 += f1
        num_coders += 1
    
    # 计算每个标签的召回率和精确率
    by_label_metrics: Dict[str, Dict[str, Any]] = {}
    for label, counts in by_label.items():
        tp = counts['true_positives']
        fp = counts['false_positives']
        fn = counts['false_negatives']
        
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        by_label_metrics[label] = {
            'recall': round(recall, 4),
            'precision': round(precision, 4),
            'f1_score': round(f1, 4),
            'true_positives': tp,
            'false_positives': fp,
            'false_negatives': fn
        }
    
    # 计算平均值
    avg_recall = total_recall / num_coders if num_coders > 0 else 0.0
    avg_precision = total_precision / num_coders if num_coders > 0 else 0.0
    avg_f1 = total_f1 / num_coders if num_coders > 0 else 0.0
    
    # 生成解释
    interpretation = _interpret_precision_recall(avg_precision, avg_recall)
    
    return {
        'calculated': True,
        'display_name': '召回率/精确率 (Recall/Precision)',
        'value': round(avg_f1, 4),  # 使用 F1 作为主要值
        'interpretation': interpretation,
        'recall': round(avg_recall, 4),
        'precision': round(avg_precision, 4),
        'f1_score': round(avg_f1, 4),
        'by_label': by_label_metrics,
        'coder_details': coder_details,
        'unit': None
    }


def _annotations_to_set(annotations: List[Dict]) -> Set[Tuple[int, int, str]]:
    """将标注列表转换为集合"""
    result = set()
    for ann in annotations:
        key = _annotation_to_key(ann)
        if key:
            result.add(key)
    return result


def _annotation_to_key(ann: Dict) -> Optional[Tuple[int, int, str]]:
    """将单个标注转换为元组键"""
    # 处理 position/startPosition/start_position 字段
    # 注意：dict.get() 在键存在但值为 None 时会返回 None，而不是默认值
    start = ann.get('position')
    if start is None:
        start = ann.get('startPosition')
    if start is None:
        start = ann.get('start_position')
    
    text = ann.get('text', '')
    label = ann.get('label', '')
    
    # 处理 end_position/endPosition 字段
    end = ann.get('end_position')
    if end is None:
        end = ann.get('endPosition')
    if end is None and start is not None:
        # 如果没有结束位置，根据起始位置和文本长度计算
        end = start + len(text)
    
    if start is not None and end is not None and label:
        return (int(start), int(end), label)
    return None


def _interpret_precision_recall(precision: float, recall: float) -> str:
    """解释召回率和精确率
    
    返回翻译键，前端根据语言环境翻译
    """
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    
    if f1 >= 0.9:
        return 'interpretation_excellent'
    elif f1 >= 0.8:
        return 'interpretation_good'
    elif f1 >= 0.7:
        return 'interpretation_fair'
    elif f1 >= 0.6:
        return 'interpretation_moderate'
    elif f1 >= 0.5:
        return 'interpretation_poor'
    else:
        return 'interpretation_very_poor'

