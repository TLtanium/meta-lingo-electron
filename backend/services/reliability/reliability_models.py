"""
Reliability Models
信度计算数据模型定义

定义编码者间信度分析所需的所有 Pydantic 数据模型。
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# ==================== 输入数据模型 ====================

class AnnotationItem(BaseModel):
    """单个标注项"""
    text: str = Field(..., description="标注文本")
    label: str = Field(..., description="标签名称")
    position: int = Field(..., description="起始位置")
    end_position: Optional[int] = Field(None, description="结束位置")
    path: Optional[str] = Field(None, description="标签路径")
    full_path: Optional[str] = Field(None, description="完整标签路径")
    color: Optional[str] = Field(None, description="标签颜色")
    remark: Optional[str] = Field(None, description="备注")
    nesting_level: Optional[int] = Field(1, description="嵌套层级")


class CoderAnnotation(BaseModel):
    """单个编码者的标注数据"""
    coder_id: str = Field(..., description="编码者ID")
    filename: str = Field(..., description="文件名")
    annotations: List[AnnotationItem] = Field(default_factory=list, description="标注列表")
    timestamp: Optional[str] = Field(None, description="标注时间戳")


class AnnotationData(BaseModel):
    """验证后的标注数据集"""
    annotation_data: List[CoderAnnotation] = Field(..., description="所有编码者的标注")
    common_text: str = Field(..., description="共同标注的文本")
    framework: str = Field(..., description="使用的标注框架")
    text_length: int = Field(0, description="文本长度")


# ==================== 计算参数模型 ====================

class CoefficientOptions(BaseModel):
    """要计算的信度系数选项"""
    percent_agreement: bool = Field(True, description="计算 Percent Agreement")
    scotts_pi: bool = Field(True, description="计算 Scott's Pi")
    cohens_kappa: bool = Field(True, description="计算 Cohen's Kappa")
    fleiss_kappa: bool = Field(True, description="计算 Fleiss' Kappa")
    krippendorff_alpha: bool = Field(True, description="计算 Krippendorff's Alpha")


class ReliabilityParams(BaseModel):
    """信度计算参数"""
    method: Literal["完全匹配", "位置容错", "模糊匹配"] = Field(
        "完全匹配", 
        description="计算方法"
    )
    tolerance: float = Field(
        0.8, 
        ge=0.1, 
        le=1.0, 
        description="容错阈值 (0.1-1.0)"
    )
    coefficients: CoefficientOptions = Field(
        default_factory=CoefficientOptions,
        description="要计算的系数"
    )
    level_of_measurement: Literal["nominal", "ordinal", "interval", "ratio"] = Field(
        "nominal",
        description="Krippendorff's Alpha 测量层次"
    )
    gold_standard_index: Optional[int] = Field(
        None,
        description="标准答案的编码者索引（可选，用于计算召回率和精确率）"
    )


# ==================== 结果数据模型 ====================

class LabelMetrics(BaseModel):
    """单个标签的召回率/精确率指标"""
    recall: float = Field(..., description="召回率")
    precision: float = Field(..., description="精确率")
    f1_score: float = Field(..., description="F1分数")
    true_positives: int = Field(0, description="真阳性数")
    false_positives: int = Field(0, description="假阳性数")
    false_negatives: int = Field(0, description="假阴性数")


class CoderMetrics(BaseModel):
    """单个编码者的召回率/精确率指标"""
    recall: float = Field(..., description="召回率")
    precision: float = Field(..., description="精确率")
    f1_score: float = Field(..., description="F1分数")


class CoefficientResult(BaseModel):
    """单个信度系数的计算结果"""
    calculated: bool = Field(..., description="是否成功计算")
    value: Optional[float] = Field(None, description="系数值")
    display_name: str = Field(..., description="显示名称")
    interpretation: Optional[str] = Field(None, description="结果解释")
    error: Optional[str] = Field(None, description="错误信息")
    level_of_measurement: Optional[str] = Field(None, description="测量层次")
    num_coders: Optional[int] = Field(None, description="编码者数量")
    num_items: Optional[int] = Field(None, description="项目数量")

    # 新增字段 - 配对详情
    pairwise_details: Optional[Dict[str, float]] = Field(None, description="每对编码者的详细分数")
    unit: Optional[str] = Field(None, description="数值单位（如 %）")
    
    # Fleiss' Kappa 特有字段
    observed_agreement: Optional[float] = Field(None, description="观察一致性")
    expected_agreement: Optional[float] = Field(None, description="期望一致性")
    
    # Krippendorff's Alpha 特有字段
    n_decisions: Optional[int] = Field(None, description="决策数")
    sigma_c_o_cc: Optional[float] = Field(None, description="观察不一致度量")
    sigma_c_nc_nc_minus_1: Optional[float] = Field(None, description="期望不一致度量")
    
    # 召回率/精确率特有字段（当设置标准答案时）
    recall: Optional[float] = Field(None, description="平均召回率")
    precision: Optional[float] = Field(None, description="平均精确率")
    f1_score: Optional[float] = Field(None, description="平均F1分数")
    by_label: Optional[Dict[str, LabelMetrics]] = Field(None, description="按标签分类的指标")
    coder_details: Optional[Dict[str, CoderMetrics]] = Field(None, description="按编码者分类的指标")


class ReliabilityResult(BaseModel):
    """信度计算完整结果"""
    success: bool = Field(..., description="计算是否成功")
    data: Optional[Dict[str, CoefficientResult]] = Field(None, description="各系数结果")
    error: Optional[str] = Field(None, description="错误信息")
    summary: Optional[Dict[str, Any]] = Field(None, description="数据摘要")


# ==================== KWIC 和详情模型 ====================

class KWICItem(BaseModel):
    """KWIC (Key Word In Context) 索引项"""
    row_number: int = Field(..., description="行号")
    label: str = Field(..., description="标签")
    left_context: str = Field(..., description="左侧上下文")
    annotation_unit: str = Field(..., description="标注单元")
    right_context: str = Field(..., description="右侧上下文")
    start_position: int = Field(..., description="起始位置")
    end_position: int = Field(..., description="结束位置")
    color: Optional[str] = Field("#FFD700", description="标签颜色")
    # 新增字段
    annotation_rate: float = Field(0.0, description="标注率 (0-1)")
    label_agreement: bool = Field(False, description="标签是否一致")
    all_labels: List[str] = Field(default_factory=list, description="所有编码者的标签")


class AnnotationDetail(BaseModel):
    """单个位置的标注详情"""
    filename: str = Field(..., description="文件名")
    coder_id: str = Field(..., description="编码者ID")
    annotated: bool = Field(..., description="是否已标注")
    label: Optional[str] = Field(None, description="标签")
    annotation_text: Optional[str] = Field(None, description="标注文本")
    label_path: Optional[str] = Field(None, description="标签路径")
    remark: Optional[str] = Field(None, description="备注")


class PositionDetails(BaseModel):
    """特定位置的所有编码者标注详情"""
    position_key: str = Field(..., description="位置键 (start_end)")
    annotation_unit: str = Field(..., description="标注单元")
    start_position: int = Field(..., description="起始位置")
    end_position: int = Field(..., description="结束位置")
    left_context: str = Field(..., description="左侧上下文")
    right_context: str = Field(..., description="右侧上下文")
    details: List[AnnotationDetail] = Field(..., description="各编码者详情")
    agreement_rate: float = Field(..., description="标注率")
    label_agreement: bool = Field(..., description="标签是否一致")


# ==================== 验证和请求模型 ====================

class ValidationResult(BaseModel):
    """文件验证结果"""
    success: bool = Field(..., description="验证是否成功")
    data: Optional[AnnotationData] = Field(None, description="验证后的数据")
    summary: Optional[Dict[str, Any]] = Field(None, description="数据摘要")
    error: Optional[str] = Field(None, description="错误信息")


class ArchiveFile(BaseModel):
    """存档文件信息"""
    name: str = Field(..., description="文件名")
    content: str = Field(..., description="文件内容 (JSON 字符串)")


class ValidateRequest(BaseModel):
    """验证请求"""
    files: List[ArchiveFile] = Field(..., description="要验证的文件列表")


class CalculateRequest(BaseModel):
    """计算请求"""
    data: AnnotationData = Field(..., description="已验证的标注数据")
    params: ReliabilityParams = Field(..., description="计算参数")


class ReportRequest(BaseModel):
    """报告生成请求"""
    results: Dict[str, CoefficientResult] = Field(..., description="计算结果")
    data_summary: Optional[Dict[str, Any]] = Field(None, description="数据摘要")


class KWICRequest(BaseModel):
    """KWIC 索引请求"""
    files: List[ArchiveFile] = Field(..., description="标注文件列表")
    context_length: int = Field(30, description="上下文长度")


class DetailRequest(BaseModel):
    """详情请求"""
    files: List[ArchiveFile] = Field(..., description="标注文件列表")
    start_position: int = Field(..., description="起始位置")
    end_position: int = Field(..., description="结束位置")

