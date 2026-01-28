"""
Reliability Service
信度分析主服务类

协调文件验证、信度计算和报告生成的完整流程。
"""

import json
import re
import numpy as np
from typing import Dict, List, Any, Optional

from .reliability_models import (
    AnnotationData,
    CoderAnnotation,
    AnnotationItem,
    ReliabilityParams,
    ReliabilityResult,
    CoefficientResult,
    ValidationResult,
    KWICItem,
    AnnotationDetail,
    PositionDetails
)
from .reliability_utils import (
    normalize_text,
    find_fuzzy_matches,
    get_sample_positions,
    get_label_at_position,
    build_label_mapping,
    collect_unique_annotation_units,
    extract_context
)
from .reliability_coefficients import ReliabilityCoefficients
from .reliability_report import generate_detailed_report, generate_csv_report
from .reliability_precision_recall import calculate_precision_recall


class ReliabilityService:
    """编码者间信度分析服务"""
    
    def __init__(self):
        self.coefficients_calculator = ReliabilityCoefficients()
        self.loaded_data: Optional[Dict] = None
        self.label_mapping: Dict[str, int] = {}
    
    def validate_and_load_files(self, files_data: List[Dict]) -> ValidationResult:
        """
        验证并加载标注文件
        
        Args:
            files_data: 文件数据列表，每个包含 name 和 content
            
        Returns:
            ValidationResult
        """
        try:
            # 验证文件数量
            if len(files_data) < 2:
                return ValidationResult(
                    success=False,
                    error='至少需要2个标注文件'
                )
            
            annotation_data = []
            common_text = None
            framework_name = None
            
            for i, file_data in enumerate(files_data):
                try:
                    # 解析 JSON 内容
                    if isinstance(file_data.get('content'), str):
                        file_content = json.loads(file_data['content'])
                    else:
                        file_content = file_data['content']
                    
                    # 确保数据兼容性
                    file_content = self._ensure_data_compatibility(file_content)
                    
                    # 验证必要字段
                    required_fields = ['framework', 'text', 'annotations']
                    for field in required_fields:
                        if field not in file_content:
                            return ValidationResult(
                                success=False,
                                error=f'文件 {file_data.get("name", i)} 缺少必要字段: {field}'
                            )
                    
                    # 验证框架一致性
                    if framework_name is None:
                        framework_name = file_content['framework']
                    elif framework_name != file_content['framework']:
                        return ValidationResult(
                            success=False,
                            error=f'文件 {file_data.get("name", i)} 的标注框架与其他文件不一致'
                        )
                    
                    # 验证文本一致性
                    current_text = normalize_text(file_content['text'])
                    if common_text is None:
                        common_text = current_text
                    elif common_text != current_text:
                        return ValidationResult(
                            success=False,
                            error=f'文件 {file_data.get("name", i)} 的文本内容与其他文件不一致'
                        )
                    
                    # 转换标注项
                    annotations = []
                    for ann in file_content.get('annotations', []):
                        annotations.append(AnnotationItem(
                            text=ann.get('text', ''),
                            label=ann.get('label', ''),
                            position=ann.get('position', ann.get('startPosition', 0)),
                            end_position=ann.get('end_position', ann.get('endPosition')),
                            path=ann.get('path', ann.get('labelPath', '')),
                            full_path=ann.get('full_path', ann.get('labelPath', '')),
                            color=ann.get('color'),
                            remark=ann.get('remark'),
                            nesting_level=ann.get('nesting_level', 1)
                        ))
                    
                    # 获取编码者名称：优先使用存档中的 coderName，否则使用文件名
                    coder_name = file_content.get('coderName') or file_data.get('name', f'file_{i}')
                    # 如果 coder_name 是 .json 文件名，提取不含扩展名的部分
                    if coder_name and coder_name.endswith('.json'):
                        coder_name = coder_name[:-5]
                    
                    # 存储标注数据
                    annotation_data.append(CoderAnnotation(
                        coder_id=coder_name or f'Coder_{i+1}',
                        filename=file_data.get('name', f'file_{i}'),
                        annotations=annotations,
                        timestamp=file_content.get('timestamp', '')
                    ))
                    
                except json.JSONDecodeError:
                    return ValidationResult(
                        success=False,
                        error=f'文件 {file_data.get("name", i)} 不是有效的JSON格式'
                    )
                except Exception as e:
                    return ValidationResult(
                        success=False,
                        error=f'处理文件 {file_data.get("name", i)} 时出错: {str(e)}'
                    )
            
            # 构建数据摘要
            total_annotations = sum(len(data.annotations) for data in annotation_data)
            
            summary = {
                'coder_count': len(annotation_data),
                'common_text_count': 1,
                'total_annotations': total_annotations,
                'framework': framework_name,
                'text_length': len(common_text) if common_text else 0
            }
            
            # 构建 AnnotationData
            result_data = AnnotationData(
                annotation_data=[
                    {
                        'coder_id': coder.coder_id,
                        'filename': coder.filename,
                        'annotations': [ann.model_dump() for ann in coder.annotations],
                        'timestamp': coder.timestamp
                    }
                    for coder in annotation_data
                ],
                common_text=common_text or '',
                framework=framework_name or '',
                text_length=len(common_text) if common_text else 0
            )
            
            # 存储到实例变量
            self.loaded_data = {
                'annotation_data': result_data.annotation_data,
                'common_text': result_data.common_text,
                'framework': result_data.framework
            }
            
            return ValidationResult(
                success=True,
                data=result_data,
                summary=summary
            )
            
        except Exception as e:
            return ValidationResult(
                success=False,
                error=f'验证文件时发生未知错误: {str(e)}'
            )
    
    def _ensure_data_compatibility(self, annotation_data: Dict) -> Dict:
        """确保加载的标注数据与新旧版本兼容"""
        # 检查并转换字段名
        if 'annotations' in annotation_data:
            new_annotations = []
            for ann in annotation_data['annotations']:
                new_ann = dict(ann)
                
                # 统一字段名 - 位置字段
                if 'startPosition' in new_ann:
                    new_ann['position'] = new_ann['startPosition']
                if 'endPosition' in new_ann:
                    new_ann['end_position'] = new_ann['endPosition']
                    
                # 统一字段名 - 路径字段
                if 'labelPath' in new_ann:
                    new_ann['path'] = new_ann['labelPath']
                    new_ann['full_path'] = new_ann['labelPath']
                
                # 确保 end_position 存在
                if 'end_position' not in new_ann and 'position' in new_ann and 'text' in new_ann:
                    new_ann['end_position'] = new_ann['position'] + len(new_ann.get('text', ''))
                
                new_annotations.append(new_ann)
            
            annotation_data['annotations'] = new_annotations
        
        return annotation_data
    
    def calculate_reliability(
        self,
        data: Dict[str, Any],
        params: ReliabilityParams
    ) -> ReliabilityResult:
        """
        计算可靠性系数（基于字符索引-标签矩阵）
        
        Args:
            data: 验证后的标注数据
            params: 计算参数
            
        Returns:
            ReliabilityResult
        """
        try:
            annotation_data = data.get('annotation_data', [])
            num_coders = len(annotation_data)
            
            # 设置数据到计算器（会自动构建矩阵）
            self.coefficients_calculator.set_data(data)
            
            # 获取数据摘要
            data_summary = self.coefficients_calculator.get_data_summary()
            
            # 计算各种系数
            results: Dict[str, Any] = {}
            coefficients = params.coefficients
            
            # Average Pairwise Percent Agreement
            if coefficients.percent_agreement:
                result = self.coefficients_calculator.calculate_percent_agreement()
                results['percent_agreement'] = result
            
            # Scott's Pi 已被替代，跳过
            if coefficients.scotts_pi:
                results['scotts_pi'] = {
                    'calculated': False,
                    'display_name': "Scott's Pi",
                    'error': "Scott's Pi 已被 Average Pairwise Percent Agreement 替代"
                }
            
            # Average Pairwise Cohen's Kappa (现在适用于任意编码者数量)
            if coefficients.cohens_kappa:
                result = self.coefficients_calculator.calculate_cohens_kappa()
                results['cohens_kappa'] = result
            
            # Fleiss' Kappa
            if coefficients.fleiss_kappa:
                result = self.coefficients_calculator.calculate_fleiss_kappa()
                results['fleiss_kappa'] = result
            
            # Krippendorff's Alpha
            if coefficients.krippendorff_alpha:
                result = self.coefficients_calculator.calculate_krippendorff_alpha(
                    level_of_measurement=params.level_of_measurement
                )
                results['krippendorff_alpha'] = result
            
            # 如果指定了标准答案，计算召回率和精确率
            if params.gold_standard_index is not None:
                text_length = len(data.get('common_text', ''))
                precision_recall_result = calculate_precision_recall(
                    annotation_data,
                    params.gold_standard_index,
                    text_length
                )
                results['precision_recall'] = precision_recall_result
            
            return ReliabilityResult(
                success=True,
                data=results,
                summary=data_summary  # 使用 summary 字段传递数据摘要
            )
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return ReliabilityResult(
                success=False,
                error=f'计算可靠性系数时出错: {str(e)}'
            )
    
    def _build_agreement_matrix(
        self,
        annotation_data: List[Dict],
        text: str,
        method: str,
        tolerance: float
    ) -> np.ndarray:
        """
        构建一致性矩阵
        使用与 get_label_at_position 一致的逻辑（选择最具体的标注）
        
        Args:
            annotation_data: 标注数据列表
            text: 共同文本
            method: 计算方法
            tolerance: 容错阈值
            
        Returns:
            一致性矩阵
        """
        text_length = len(text)
        
        # 构建标签映射
        self.label_mapping, no_annotation_idx = build_label_mapping(annotation_data)
        num_labels = len(self.label_mapping)
        
        # 创建标注矩阵：[编码者数量, 文本位置数量]
        num_coders = len(annotation_data)
        
        # 为每个位置存储 (label_idx, span_size)，以便选择最具体的标注
        annotation_info = [[None for _ in range(text_length)] for _ in range(num_coders)]
        
        # 填充标注信息
        for coder_idx, data in enumerate(annotation_data):
            for ann in data.get('annotations', []):
                start_pos = ann.get('position', 0)
                ann_text = ann.get('text', '')
                end_pos = ann.get('end_position', start_pos + len(ann_text))
                label = ann.get('label', '')
                
                if label not in self.label_mapping:
                    continue
                
                label_idx = self.label_mapping[label]
                span_size = end_pos - start_pos
                
                positions_to_mark = []
                
                if method == "完全匹配":
                    positions_to_mark = list(range(start_pos, min(end_pos, text_length)))
                        
                elif method == "位置容错":
                    tolerance_range = int(len(ann_text) * (1 - tolerance))
                    adj_start = max(0, start_pos - tolerance_range)
                    adj_end = min(text_length, end_pos + tolerance_range)
                    positions_to_mark = list(range(adj_start, adj_end))
                        
                elif method == "模糊匹配":
                    fuzzy_matches = find_fuzzy_matches(
                        ann_text, text, start_pos, tolerance
                    )
                    for match_start, match_end in fuzzy_matches:
                        positions_to_mark.extend(range(match_start, min(match_end, text_length)))
                
                # 标记位置，优先保留更具体（范围更小）的标注
                for pos in positions_to_mark:
                    current = annotation_info[coder_idx][pos]
                    if current is None or span_size < current[1]:
                        annotation_info[coder_idx][pos] = (label_idx, span_size)
        
        # 构建最终的标注矩阵
        annotation_matrix = np.full((num_coders, text_length), no_annotation_idx, dtype=int)
        for coder_idx in range(num_coders):
            for pos in range(text_length):
                if annotation_info[coder_idx][pos] is not None:
                    annotation_matrix[coder_idx, pos] = annotation_info[coder_idx][pos][0]
        
        # 只收集有至少一个编码者标注的位置（排除所有人都是NO_ANNOTATION的位置）
        annotated_positions = []
        for pos in range(text_length):
            labels_at_pos = annotation_matrix[:, pos]
            # 如果至少有一个编码者在该位置有标注
            if any(label != no_annotation_idx for label in labels_at_pos):
                annotated_positions.append(pos)
        
        # 转换为一致性矩阵（混淆矩阵）
        agreement_matrix = np.zeros((num_labels, num_labels))
        
        # 只在有标注的位置计算成对一致性
        for pos in annotated_positions:
            labels_at_pos = annotation_matrix[:, pos]
            for i in range(num_coders):
                for j in range(i + 1, num_coders):
                    label_i, label_j = labels_at_pos[i], labels_at_pos[j]
                    agreement_matrix[label_i, label_j] += 1
                    agreement_matrix[label_j, label_i] += 1
        
        return agreement_matrix
    
    def generate_report(
        self,
        results: Dict[str, Any],
        data_summary: Optional[Dict[str, Any]] = None,
        format: str = 'html'
    ) -> str:
        """
        生成报告
        
        Args:
            results: 计算结果
            data_summary: 数据摘要
            format: 报告格式 (html/csv)
            
        Returns:
            报告字符串
        """
        if format == 'csv':
            return generate_csv_report(results)
        else:
            return generate_detailed_report(results, data_summary)
    
    def generate_kwic_index(
        self,
        files_data: List[Dict],
        context_length: int = 30
    ) -> List[KWICItem]:
        """
        生成 KWIC 索引
        
        Args:
            files_data: 文件数据列表
            context_length: 上下文长度
            
        Returns:
            KWICItem 列表
        """
        # 解析文件数据
        parsed_files = []
        for file_data in files_data:
            if isinstance(file_data.get('content'), str):
                content = json.loads(file_data['content'])
            else:
                content = file_data.get('content', {})
            
            parsed_files.append({
                'filename': file_data.get('name', ''),
                'text': content.get('text', ''),
                'annotations': content.get('annotations', [])
            })
        
        # 收集唯一标注单元
        unique_units = collect_unique_annotation_units(parsed_files, context_length)
        
        total_coders = len(parsed_files)
        
        # 转换为 KWICItem，并计算标注率和标签一致性
        kwic_items = []
        for idx, unit in enumerate(unique_units):
            start_pos = unit['start_position']
            end_pos = unit['end_position']
            
            # 收集每个编码者在该位置的标注
            all_labels = []
            for file_data in parsed_files:
                annotations = file_data.get('annotations', [])
                found_label = None
                for ann in annotations:
                    ann_start = ann.get('startPosition', ann.get('position', ann.get('start_position', 0)))
                    ann_text = ann.get('text', '')
                    ann_end = ann.get('endPosition', ann.get('end_position', ann_start + len(ann_text)))
                    
                    if ann_start == start_pos and ann_end == end_pos:
                        found_label = ann.get('label', '')
                        break
                
                all_labels.append(found_label if found_label else '')
            
            # 计算标注率
            annotated_count = sum(1 for label in all_labels if label)
            annotation_rate = annotated_count / total_coders if total_coders > 0 else 0
            
            # 计算标签一致性
            non_empty_labels = [label for label in all_labels if label]
            label_agreement = len(set(non_empty_labels)) <= 1 if non_empty_labels else False
            
            kwic_items.append(KWICItem(
                row_number=idx + 1,
                label=unit['label'],
                left_context=unit['left_context'],
                annotation_unit=unit['annotation_unit'],
                right_context=unit['right_context'],
                start_position=start_pos,
                end_position=end_pos,
                color=unit.get('color', '#FFD700'),
                annotation_rate=annotation_rate,
                label_agreement=label_agreement,
                all_labels=all_labels
            ))
        
        return kwic_items
    
    def get_position_details(
        self,
        files_data: List[Dict],
        start_position: int,
        end_position: int
    ) -> PositionDetails:
        """
        获取特定位置的所有编码者标注详情
        
        Args:
            files_data: 文件数据列表
            start_position: 起始位置
            end_position: 结束位置
            
        Returns:
            PositionDetails
        """
        details = []
        annotation_unit = ''
        left_context = ''
        right_context = ''
        
        for file_idx, file_data in enumerate(files_data):
            if isinstance(file_data.get('content'), str):
                content = json.loads(file_data['content'])
            else:
                content = file_data.get('content', {})
            
            text = content.get('text', '')
            annotations = content.get('annotations', [])
            filename = file_data.get('name', f'file_{file_idx}')
            
            # 获取编码者名称，如果没有则使用默认名称
            coder_name = content.get('coderName') or f'anon coder {file_idx + 1}'
            
            # 提取上下文（使用第一个文件）
            if file_idx == 0 and text:
                annotation_unit = text[start_position:end_position]
                left_context, right_context = extract_context(
                    text, start_position, end_position, 30
                )
            
            # 查找该位置的标注
            found = False
            for ann in annotations:
                # 兼容多种字段名
                ann_start = ann.get('startPosition', ann.get('position', ann.get('start_position', 0)))
                ann_text = ann.get('text', '')
                ann_end = ann.get('endPosition', ann.get('end_position', ann_start + len(ann_text)))
                
                if ann_start == start_position and ann_end == end_position:
                    details.append(AnnotationDetail(
                        filename=filename,
                        coder_id=coder_name,
                        annotated=True,
                        label=ann.get('label'),
                        annotation_text=ann_text,
                        label_path=ann.get('full_path', ann.get('path', ann.get('labelPath', ''))),
                        remark=ann.get('remark')
                    ))
                    found = True
                    break
            
            if not found:
                details.append(AnnotationDetail(
                    filename=filename,
                    coder_id=coder_name,
                    annotated=False
                ))
        
        # 计算一致性
        annotated_count = sum(1 for d in details if d.annotated)
        total_count = len(details)
        agreement_rate = annotated_count / total_count if total_count > 0 else 0
        
        labels = [d.label for d in details if d.annotated and d.label]
        label_agreement = len(set(labels)) == 1 if labels else False
        
        return PositionDetails(
            position_key=f'{start_position}_{end_position}',
            annotation_unit=annotation_unit,
            start_position=start_position,
            end_position=end_position,
            left_context=left_context,
            right_context=right_context,
            details=details,
            agreement_rate=agreement_rate,
            label_agreement=label_agreement
        )

