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
    collect_unique_annotation_units,
    extract_context
)
from .reliability_tokenization import acquire_tokens
from .reliability_distances import resolve_distance_name
from .reliability_coefficients import ReliabilityCoefficients
from .reliability_report import generate_detailed_report, generate_csv_report
from .reliability_precision_recall import calculate_precision_recall


def _ann_bounds(ann: Dict) -> tuple:
    """从一条标注取 (start, end)，兼容多种字段名。"""
    start = ann.get('startPosition', ann.get('position', ann.get('start_position', 0)))
    text = ann.get('text', '') or ''
    end = ann.get('endPosition', ann.get('end_position', start + len(text)))
    return int(start), int(end)


def _spans_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """两个字符区间是否有任意重叠。"""
    return a_start < b_end and b_start < a_end


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
            common_text = None        # 原始文本（offset 基准）
            common_text_norm = None   # 归一化文本（仅用于跨文件相等性校验）
            framework_name = None
            parsed_contents = []      # 各编码者完整 archive 内容（供 token 获取）
            archive_language = None

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
                    
                    # 验证文本一致性（用归一化文本比较，但存储原始文本作为 offset 基准）
                    raw_text = (file_content['text'] or '').replace('\r\n', '\n').replace('\r', '\n')
                    current_norm = normalize_text(raw_text)
                    if common_text_norm is None:
                        common_text_norm = current_norm
                        common_text = raw_text  # 第一个文件的原始文本作为基准
                    elif common_text_norm != current_norm:
                        return ValidationResult(
                            success=False,
                            error=f'文件 {file_data.get("name", i)} 的文本内容与其他文件不一致'
                        )
                    parsed_contents.append(file_content)
                    if archive_language is None:
                        archive_language = file_content.get('language') or file_content.get('corpusLanguage')
                    
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
            
            # 获取共享 token 链（原始文本 offset 空间）
            raw_common = common_text or ''
            tokens, token_source = acquire_tokens(parsed_contents, raw_common, archive_language)

            # 构建数据摘要
            total_annotations = sum(len(data.annotations) for data in annotation_data)

            # 检测所有被标注过的标签（供前端"选择标签"弹窗）
            detected_labels = set()
            for coder in annotation_data:
                for ann in coder.annotations:
                    if ann.label:
                        detected_labels.add(ann.label)

            summary = {
                'coder_count': len(annotation_data),
                'common_text_count': 1,
                'total_annotations': total_annotations,
                'framework': framework_name,
                'text_length': len(raw_common),
                'token_count': len(tokens),
                'token_source': token_source,
                'labels': sorted(detected_labels)
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
                common_text=raw_common,
                framework=framework_name or '',
                text_length=len(raw_common),
                tokens=tokens,
                token_source=token_source
            )

            # 存储到实例变量
            self.loaded_data = {
                'annotation_data': result_data.annotation_data,
                'common_text': result_data.common_text,
                'framework': result_data.framework,
                'tokens': tokens,
                'token_source': token_source
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

            # 解析集合距离（兼容旧 level_of_measurement）
            distance_name = resolve_distance_name(
                getattr(params, 'distance', None),
                getattr(params, 'level_of_measurement', None)
            )

            # 获取 token：优先用验证阶段存好的；缺失则即时兜底
            tokens = data.get('tokens') or []
            token_source = data.get('token_source', '')
            unit = getattr(params, 'unit', 'token')
            if unit == 'token' and not tokens:
                tokens, token_source = acquire_tokens([], data.get('common_text', ''))

            # 标签过滤（None/空 = 全部考虑）
            included_labels = getattr(params, 'included_labels', None) or None

            # 设置数据到计算器（构建"单位 → 标签集合"）
            self.coefficients_calculator.set_data(
                data,
                unit=unit,
                distance=distance_name,
                coverage=getattr(params, 'coverage', 'majority'),
                include_empty=getattr(params, 'include_empty', False),
                tokens=tokens,
                token_source=token_source,
                included_labels=included_labels,
            )

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
                    text_length,
                    pr_matching=getattr(params, 'pr_matching', 'overlap'),
                    coverage=getattr(params, 'coverage', 'majority'),
                    included_labels=included_labels
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
        context_length: int = 30,
        included_labels: Optional[List[str]] = None
    ) -> List[KWICItem]:
        """
        生成 KWIC 索引

        Args:
            files_data: 文件数据列表
            context_length: 上下文长度
            included_labels: 仅展示这些标签（None=全部），与计算口径保持一致

        Returns:
            KWICItem 列表
        """
        inc_set = set(included_labels) if included_labels else None

        # 解析文件数据（按标签筛选）
        parsed_files = []
        for file_data in files_data:
            if isinstance(file_data.get('content'), str):
                content = json.loads(file_data['content'])
            else:
                content = file_data.get('content', {})

            anns = content.get('annotations', [])
            if inc_set is not None:
                anns = [a for a in anns if a.get('label', '') in inc_set]

            parsed_files.append({
                'filename': file_data.get('name', ''),
                'text': content.get('text', ''),
                'annotations': anns
            })
        
        # 收集唯一标注单元
        unique_units = collect_unique_annotation_units(parsed_files, context_length)
        
        total_coders = len(parsed_files)
        
        # 转换为 KWICItem，并计算标注率和标签一致性
        kwic_items = []
        for idx, unit in enumerate(unique_units):
            start_pos = unit['start_position']
            end_pos = unit['end_position']
            
            # 收集每个编码者在该单元的【全部】重叠标注（不再精确匹配 + break）
            all_label_sets = []  # 每个编码者一份标签列表（保留多标签）
            for file_data in parsed_files:
                coder_labels = []
                for ann in file_data.get('annotations', []):
                    a_s, a_e = _ann_bounds(ann)
                    if _spans_overlap(a_s, a_e, start_pos, end_pos):
                        lab = ann.get('label', '')
                        if lab and lab not in coder_labels:
                            coder_labels.append(lab)
                all_label_sets.append(coder_labels)

            # 扁平去重（兼容旧 all_labels 字段）
            all_labels = []
            for labs in all_label_sets:
                for lab in labs:
                    if lab and lab not in all_labels:
                        all_labels.append(lab)

            # 标注率：有≥1标签的编码者占比
            annotated_count = sum(1 for labs in all_label_sets if labs)
            annotation_rate = annotated_count / total_coders if total_coders > 0 else 0

            # 标签一致性：所有标注了的编码者拥有相同的标签【集合】
            annotated_sets = [frozenset(labs) for labs in all_label_sets if labs]
            label_agreement = len(set(annotated_sets)) <= 1 if annotated_sets else False

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
                all_labels=all_labels,
                all_label_sets=all_label_sets
            ))
        
        return kwic_items
    
    def get_position_details(
        self,
        files_data: List[Dict],
        start_position: int,
        end_position: int,
        included_labels: Optional[List[str]] = None
    ) -> PositionDetails:
        """
        获取特定位置的所有编码者标注详情

        Args:
            files_data: 文件数据列表
            start_position: 起始位置
            end_position: 结束位置
            included_labels: 仅展示这些标签（None=全部）

        Returns:
            PositionDetails
        """
        inc_set = set(included_labels) if included_labels else None
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
            if inc_set is not None:
                annotations = [a for a in annotations if a.get('label', '') in inc_set]
            filename = file_data.get('name', f'file_{file_idx}')
            
            # 获取编码者名称，如果没有则使用默认名称
            coder_name = content.get('coderName') or f'anon coder {file_idx + 1}'
            
            # 提取上下文（使用第一个文件）
            if file_idx == 0 and text:
                annotation_unit = text[start_position:end_position]
                left_context, right_context = extract_context(
                    text, start_position, end_position, 30
                )
            
            # 收集该编码者【全部】与目标单元重叠的标注（多标签全部保留）
            c_labels = []
            c_paths = []
            c_texts = []
            c_remarks = []
            for ann in annotations:
                a_s, a_e = _ann_bounds(ann)
                if _spans_overlap(a_s, a_e, start_position, end_position):
                    lab = ann.get('label', '')
                    if not lab:
                        continue
                    c_labels.append(lab)
                    c_paths.append(ann.get('full_path', ann.get('path', ann.get('labelPath', ''))) or '')
                    c_texts.append(ann.get('text', '') or '')
                    if ann.get('remark'):
                        c_remarks.append(ann.get('remark'))

            if c_labels:
                details.append(AnnotationDetail(
                    filename=filename,
                    coder_id=coder_name,
                    annotated=True,
                    label=c_labels[0],
                    annotation_text=c_texts[0] if c_texts else None,
                    label_path=c_paths[0] if c_paths else '',
                    remark='; '.join(c_remarks) if c_remarks else None,
                    labels=c_labels,
                    label_paths=c_paths
                ))
            else:
                details.append(AnnotationDetail(
                    filename=filename,
                    coder_id=coder_name,
                    annotated=False
                ))

        # 计算一致性
        annotated_count = sum(1 for d in details if d.annotated)
        total_count = len(details)
        agreement_rate = annotated_count / total_count if total_count > 0 else 0

        # 标签一致性：所有标注了的编码者拥有相同标签【集合】
        annotated_sets = [frozenset(d.labels) for d in details if d.annotated and d.labels]
        label_agreement = len(set(annotated_sets)) == 1 if annotated_sets else False
        
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

