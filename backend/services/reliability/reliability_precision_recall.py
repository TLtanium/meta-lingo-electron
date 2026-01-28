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


def calculate_precision_recall(
    annotation_data: List[Dict],
    gold_standard_index: int,
    text_length: int
) -> Dict[str, Any]:
    """
    计算召回率和精确率
    
    Args:
        annotation_data: 所有编码者的标注数据列表
        gold_standard_index: 标准答案的编码者索引
        text_length: 文本长度
        
    Returns:
        包含召回率、精确率、F1分数等指标的字典
    """
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
        coder_set = _annotations_to_set(coder_annotations)
        
        # 计算 TP, FP, FN
        true_positives = len(gold_set & coder_set)
        false_positives = len(coder_set - gold_set)
        false_negatives = len(gold_set - coder_set)
        
        # 计算该编码者的召回率和精确率
        recall = true_positives / len(gold_set) if len(gold_set) > 0 else 0.0
        precision = true_positives / len(coder_set) if len(coder_set) > 0 else 0.0
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
        
        # 按标签统计
        for ann in coder_annotations:
            label = ann.get('label', '')
            if not label or label not in by_label:
                continue
            
            ann_key = _annotation_to_key(ann)
            if ann_key in gold_set:
                by_label[label]['true_positives'] += 1
            else:
                by_label[label]['false_positives'] += 1
        
        # 统计 FN（标准答案有但编码者没有的）
        for gold_ann in gold_annotations:
            label = gold_ann.get('label', '')
            if not label or label not in by_label:
                continue
            
            gold_key = _annotation_to_key(gold_ann)
            if gold_key not in coder_set:
                by_label[label]['false_negatives'] += 1
    
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
    start = ann.get('position', ann.get('startPosition', ann.get('start_position')))
    text = ann.get('text', '')
    end = ann.get('end_position', ann.get('endPosition', start + len(text) if start is not None else None))
    label = ann.get('label', '')
    
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

