"""
Reliability API Router
编码者间信度分析 API 路由

提供文件验证、信度计算、报告生成等接口。
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from typing import List, Optional
from pydantic import BaseModel, Field
from pathlib import Path
import json

from config import ANNOTATIONS_DIR
from services.reliability import ReliabilityService
from services.reliability.reliability_models import (
    ArchiveFile,
    ReliabilityParams,
    CoefficientOptions,
    KWICItem,
    PositionDetails
)

router = APIRouter()

# 创建服务实例
reliability_service = ReliabilityService()


# ==================== 请求模型 ====================

class ValidateFilesRequest(BaseModel):
    """验证文件请求"""
    files: List[ArchiveFile] = Field(..., description="要验证的文件列表")


class CalculateRequest(BaseModel):
    """计算信度请求"""
    data: dict = Field(..., description="已验证的标注数据")
    params: ReliabilityParams = Field(
        default_factory=lambda: ReliabilityParams(),
        description="计算参数"
    )


class ReportRequest(BaseModel):
    """报告生成请求"""
    results: dict = Field(..., description="计算结果")
    data_summary: Optional[dict] = Field(None, description="数据摘要")
    format: str = Field("html", description="报告格式 (html/csv)")


class KWICRequest(BaseModel):
    """KWIC 索引请求"""
    files: List[ArchiveFile] = Field(..., description="标注文件列表")
    context_length: int = Field(30, description="上下文长度")


class DetailRequest(BaseModel):
    """详情请求"""
    files: List[ArchiveFile] = Field(..., description="标注文件列表")
    start_position: int = Field(..., description="起始位置")
    end_position: int = Field(..., description="结束位置")


# ==================== API 端点 ====================

@router.post("/validate")
async def validate_files(request: ValidateFilesRequest):
    """
    验证上传的标注文件
    
    验证内容：
    - 文件数量（至少2个）
    - JSON 格式有效性
    - 必要字段（framework, text, annotations）
    - 框架一致性
    - 文本内容一致性
    """
    files_data = [
        {"name": f.name, "content": f.content}
        for f in request.files
    ]
    
    result = reliability_service.validate_and_load_files(files_data)
    
    if not result.success:
        return {
            "success": False,
            "error": result.error
        }
    
    return {
        "success": True,
        "data": result.data.model_dump() if result.data else None,
        "summary": result.summary
    }


@router.post("/calculate")
async def calculate_reliability(request: CalculateRequest):
    """
    计算编码者间信度系数
    
    支持的系数：
    - Percent Agreement
    - Scott's Pi
    - Cohen's Kappa (2个编码者)
    - Fleiss' Kappa (3+编码者)
    - Krippendorff's Alpha (多种测量层次)
    """
    result = reliability_service.calculate_reliability(
        request.data,
        request.params
    )
    
    if not result.success:
        return {
            "success": False,
            "error": result.error
        }
    
    return {
        "success": True,
        "data": result.data,
        "summary": result.summary
    }


@router.post("/report", response_class=HTMLResponse)
async def generate_report(request: ReportRequest):
    """
    生成详细报告
    
    支持格式：
    - html: HTML 格式报告
    - csv: CSV 格式数据
    """
    report = reliability_service.generate_report(
        request.results,
        request.data_summary,
        request.format
    )
    
    if request.format == "csv":
        return PlainTextResponse(
            content=report,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=reliability_report.csv"
            }
        )
    
    return HTMLResponse(content=report)


@router.post("/kwic")
async def generate_kwic_index(request: KWICRequest):
    """
    生成 KWIC (Key Word In Context) 索引
    
    展示所有标注单位的上下文信息
    """
    files_data = [
        {"name": f.name, "content": f.content}
        for f in request.files
    ]
    
    kwic_items = reliability_service.generate_kwic_index(
        files_data,
        request.context_length
    )
    
    return {
        "success": True,
        "data": [item.model_dump() for item in kwic_items],
        "count": len(kwic_items)
    }


@router.post("/detail")
async def get_position_details(request: DetailRequest):
    """
    获取特定位置的标注详情
    
    显示所有编码者在该位置的标注情况
    """
    files_data = [
        {"name": f.name, "content": f.content}
        for f in request.files
    ]
    
    details = reliability_service.get_position_details(
        files_data,
        request.start_position,
        request.end_position
    )
    
    return {
        "success": True,
        "data": details.model_dump()
    }


@router.get("/archives/{corpus_name}")
async def list_corpus_archives(corpus_name: str):
    """
    获取语料库的标注存档列表
    
    用于从语料库选取存档进行信度分析
    """
    corpus_dir = ANNOTATIONS_DIR / corpus_name
    
    if not corpus_dir.exists():
        return {
            "success": True,
            "data": {
                "archives": []
            }
        }
    
    archives = []
    for path in corpus_dir.glob("*.json"):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                archive = json.load(f)
                archives.append({
                    "id": archive.get('id', path.stem),
                    "filename": path.name,
                    "type": archive.get('type', 'text'),
                    "framework": archive.get('framework', 'Unknown'),
                    "textName": archive.get('textName'),
                    "resourceName": archive.get('resourceName'),
                    "annotationCount": len(archive.get('annotations', [])),
                    "timestamp": archive.get('timestamp', '')
                })
        except Exception as e:
            print(f"Error loading archive {path}: {e}")
    
    # 按时间戳排序
    archives.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return {
        "success": True,
        "data": {
            "archives": archives
        }
    }


@router.post("/load-archives")
async def load_archives_content(archive_ids: List[str], corpus_name: str):
    """
    加载多个存档的完整内容
    
    用于从语料库选取存档后加载内容进行信度分析
    """
    corpus_dir = ANNOTATIONS_DIR / corpus_name
    
    if not corpus_dir.exists():
        raise HTTPException(status_code=404, detail="语料库不存在")
    
    files_data = []
    
    for archive_id in archive_ids:
        archive_path = corpus_dir / f"{archive_id}.json"
        
        if not archive_path.exists():
            # 尝试其他文件名格式
            found = False
            for path in corpus_dir.glob("*.json"):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        archive = json.load(f)
                        if archive.get('id') == archive_id:
                            files_data.append({
                                "name": path.name,
                                "content": json.dumps(archive, ensure_ascii=False)
                            })
                            found = True
                            break
                except Exception:
                    continue
            
            if not found:
                raise HTTPException(
                    status_code=404,
                    detail=f"存档 {archive_id} 不存在"
                )
        else:
            try:
                with open(archive_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    files_data.append({
                        "name": archive_path.name,
                        "content": content
                    })
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"加载存档 {archive_id} 失败: {str(e)}"
                )
    
    return {
        "success": True,
        "data": {
            "files": files_data
        }
    }

