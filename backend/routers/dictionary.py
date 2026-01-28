"""
词典 API 路由
提供词典列表、单词查询、输入建议等接口
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from services.dictionary_service import dictionary_service


router = APIRouter()


# ============== 响应模型 ==============

class DictionaryInfo(BaseModel):
    """词典信息"""
    name: str
    count: int
    filename: str


class DictionaryListResponse(BaseModel):
    """词典列表响应"""
    success: bool
    data: List[DictionaryInfo]


class LookupResult(BaseModel):
    """单个词典的查询结果"""
    found: bool
    word: Optional[str] = None
    content: Optional[str] = None
    fuzzy: Optional[bool] = None
    matched_key: Optional[str] = None
    error: Optional[str] = None


class LookupResponse(BaseModel):
    """查询响应"""
    success: bool
    query: str
    results: dict  # Dict[str, LookupResult]


class SuggestionsResponse(BaseModel):
    """输入建议响应"""
    success: bool
    suggestions: List[str]


# ============== API 端点 ==============

@router.get("/list", response_model=DictionaryListResponse)
async def list_dictionaries():
    """
    获取可用词典列表
    """
    try:
        dictionaries = dictionary_service.list_dictionaries()
        return {
            "success": True,
            "data": dictionaries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lookup", response_model=LookupResponse)
async def lookup_word(
    word: str = Query(..., description="要查询的单词"),
    dictionaries: str = Query(..., description="词典名称，多个用逗号分隔")
):
    """
    在指定词典中查询单词
    
    - **word**: 要查询的单词
    - **dictionaries**: 词典名称，多个用逗号分隔
    """
    if not word.strip():
        raise HTTPException(status_code=400, detail="查询词不能为空")
    
    # 解析词典列表
    dict_names = [d.strip() for d in dictionaries.split(",") if d.strip()]
    
    if not dict_names:
        raise HTTPException(status_code=400, detail="请至少选择一个词典")
    
    try:
        result = dictionary_service.lookup(word, dict_names)
        return {
            "success": True,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(
    prefix: str = Query(..., description="输入前缀"),
    dictionaries: str = Query(..., description="词典名称，多个用逗号分隔"),
    limit: int = Query(10, ge=1, le=50, description="返回数量限制")
):
    """
    获取输入建议
    
    - **prefix**: 输入前缀
    - **dictionaries**: 词典名称，多个用逗号分隔
    - **limit**: 返回数量限制 (1-50)
    """
    if not prefix.strip():
        return {"success": True, "suggestions": []}
    
    # 解析词典列表
    dict_names = [d.strip() for d in dictionaries.split(",") if d.strip()]
    
    if not dict_names:
        return {"success": True, "suggestions": []}
    
    try:
        suggestions = dictionary_service.get_suggestions(prefix, dict_names, limit)
        return {
            "success": True,
            "suggestions": suggestions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unload/{dict_name}")
async def unload_dictionary(dict_name: str):
    """
    从缓存中卸载词典以释放内存
    """
    try:
        success = dictionary_service.unload_dictionary(dict_name)
        return {
            "success": success,
            "message": f"词典 '{dict_name}' 已卸载" if success else f"词典 '{dict_name}' 未加载"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-cache")
async def clear_cache():
    """
    清除所有词典缓存
    """
    try:
        dictionary_service.clear_cache()
        return {
            "success": True,
            "message": "缓存已清除"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
