"""
Corpus Resource API Router
Provides endpoints for accessing pre-built corpus frequency CSV files
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from services.corpus_resource_service import get_corpus_resource_service


router = APIRouter()


# ============== Response Models ==============

class CorpusResourceInfo(BaseModel):
    """Corpus resource information"""
    id: str
    name_en: str
    name_zh: str
    prefix: str
    category: str
    tags_en: List[str]
    tags_zh: List[str]
    file_size: int
    word_count: int
    description_en: str
    description_zh: str


class CorpusResourceListResponse(BaseModel):
    """Corpus resource list response"""
    success: bool
    data: List[CorpusResourceInfo]
    total: int


class CorpusResourceDetailResponse(BaseModel):
    """Single corpus resource detail response"""
    success: bool
    data: Optional[CorpusResourceInfo]


class TagsListResponse(BaseModel):
    """Tags list response"""
    success: bool
    tags_en: List[str]
    tags_zh: List[str]


class SearchRequest(BaseModel):
    """Search request model"""
    query: str = ''
    tags: Optional[List[str]] = None
    lang: str = 'en'


class FrequencyDataResponse(BaseModel):
    """Frequency data response"""
    success: bool
    resource_id: str
    total_words: int
    total_frequency: int
    sample: Optional[List[dict]] = None


# ============== API Endpoints ==============

@router.get("/list", response_model=CorpusResourceListResponse)
async def list_corpus_resources(
    lang: str = Query('en', description="Language for display names (en or zh)")
):
    """
    Get list of all available corpus resources
    
    - **lang**: Language for display names ('en' or 'zh')
    """
    try:
        service = get_corpus_resource_service()
        resources = service.list_resources(lang)
        
        return {
            "success": True,
            "data": resources,
            "total": len(resources)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags", response_model=TagsListResponse)
async def get_all_tags():
    """
    Get all unique tags across all corpus resources (both English and Chinese)
    """
    try:
        service = get_corpus_resource_service()
        tags_en = service.get_all_tags('en')
        tags_zh = service.get_all_tags('zh')
        
        return {
            "success": True,
            "tags_en": tags_en,
            "tags_zh": tags_zh
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{resource_id}", response_model=CorpusResourceDetailResponse)
async def get_corpus_resource(
    resource_id: str,
    lang: str = Query('en', description="Language for display names")
):
    """
    Get details of a specific corpus resource
    
    - **resource_id**: Resource ID (e.g., 'bnc_commerce_finance', 'oanc_total')
    - **lang**: Language for display names
    """
    try:
        service = get_corpus_resource_service()
        resource = service.get_resource(resource_id, lang)
        
        if resource is None:
            return {
                "success": False,
                "data": None
            }
        
        return {
            "success": True,
            "data": resource
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{resource_id}/frequency", response_model=FrequencyDataResponse)
async def get_frequency_data(
    resource_id: str,
    sample_size: int = Query(100, description="Number of sample words to return")
):
    """
    Get frequency data for a corpus resource
    
    - **resource_id**: Resource ID
    - **sample_size**: Number of top words to return as sample
    """
    try:
        service = get_corpus_resource_service()
        
        # Load frequency data
        freq_data = service.load_frequency_data(resource_id)
        
        if not freq_data:
            raise HTTPException(status_code=404, detail=f"Resource not found: {resource_id}")
        
        # Get total frequency
        total_freq = sum(d['freq'] for d in freq_data.values())
        
        # Get sample (top N by frequency)
        sorted_words = sorted(freq_data.values(), key=lambda x: x['freq'], reverse=True)
        sample = sorted_words[:sample_size]
        
        return {
            "success": True,
            "resource_id": resource_id,
            "total_words": len(freq_data),
            "total_frequency": total_freq,
            "sample": sample
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=CorpusResourceListResponse)
async def search_corpus_resources(request: SearchRequest):
    """
    Search corpus resources by name or tags
    
    - **query**: Search query (searches name and ID)
    - **tags**: List of tags to filter by (must match ALL tags)
    - **lang**: Language for display names and tags
    """
    try:
        service = get_corpus_resource_service()
        results = service.search_resources(
            query=request.query,
            tags=request.tags,
            lang=request.lang
        )
        
        return {
            "success": True,
            "data": results,
            "total": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{resource_id}/frequency-table")
async def get_frequency_table(
    resource_id: str,
    lowercase: bool = Query(True, description="Convert words to lowercase")
):
    """
    Get simple word -> frequency table for keyness analysis
    
    - **resource_id**: Resource ID
    - **lowercase**: Whether to convert to lowercase
    """
    try:
        service = get_corpus_resource_service()
        freq_table = service.build_frequency_table(resource_id, lowercase)
        
        if not freq_table:
            raise HTTPException(status_code=404, detail=f"Resource not found: {resource_id}")
        
        total_freq = sum(freq_table.values())
        
        return {
            "success": True,
            "resource_id": resource_id,
            "total_words": len(freq_table),
            "total_frequency": total_freq,
            "data": freq_table
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-cache")
async def clear_cache(resource_id: Optional[str] = None):
    """
    Clear frequency data cache
    
    - **resource_id**: Specific resource to clear (or None for all)
    """
    try:
        service = get_corpus_resource_service()
        service.clear_cache(resource_id)
        
        return {
            "success": True,
            "message": f"Cache cleared: {resource_id or 'all'}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
