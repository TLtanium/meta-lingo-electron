"""
Co-occurrence Analysis API Router
Provides endpoints for KWIC search, CQL queries, and POS filtering
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from services.collocation import (
    get_kwic_service,
    get_pos_tags_info,
    POSFilter
)
from services.collocation.pos_filter import (
    get_penn_treebank_tags_info,
    get_dep_tags_info
)

router = APIRouter()


# Request/Response Models

class POSFilterConfig(BaseModel):
    """POS filter configuration"""
    selectedPOS: List[str] = []
    keepMode: bool = True


class KWICSearchRequest(BaseModel):
    """KWIC search request"""
    corpus_id: str
    text_ids: List[str] | str = "all"
    search_mode: str  # exact, starts, ends, contains, wordlist, phrase, cql
    search_value: str
    context_size: int = 5
    lowercase: bool = False
    pos_filter: Optional[POSFilterConfig] = None
    sort_by: Optional[str] = None  # left_context, right_context, position, frequency, random
    sort_levels: Optional[List[str]] = None  # ["1L", "2L", "3L"] etc
    sort_descending: bool = False
    max_results: Optional[int] = None


class KWICResult(BaseModel):
    """Single KWIC result"""
    position: int
    keyword: str
    left_context: List[str]
    right_context: List[str]
    text_id: str
    filename: str
    corpus_id: str
    pos: Optional[str] = None


class KWICSearchResponse(BaseModel):
    """KWIC search response"""
    success: bool
    results: List[Dict[str, Any]] = []
    total_count: int = 0
    displayed_count: int = 0
    error: Optional[str] = None


class ExtendedContextRequest(BaseModel):
    """Extended context request"""
    corpus_id: str
    text_id: str
    position: int
    context_chars: int = 200


class ExtendedContextResponse(BaseModel):
    """Extended context response"""
    success: bool
    text: Optional[str] = None
    keyword: Optional[str] = None
    highlight_start: Optional[int] = None
    highlight_end: Optional[int] = None
    text_id: Optional[str] = None
    filename: Optional[str] = None
    error: Optional[str] = None


class CQLParseRequest(BaseModel):
    """CQL parse request"""
    query: str


class CQLParseResponse(BaseModel):
    """CQL parse response"""
    valid: bool
    error: Optional[str] = None


class POSTagInfo(BaseModel):
    """POS tag information"""
    tag: str
    description_en: str
    description_zh: str


# API Endpoints

@router.post("/search", response_model=KWICSearchResponse)
async def kwic_search(request: KWICSearchRequest):
    """
    Perform KWIC (Key Word In Context) search
    
    Supports multiple search modes:
    - exact: Exact word match
    - starts: Starts with
    - ends: Ends with
    - contains: Contains substring
    - wordlist: Match words from a list (one per line)
    - phrase: Match phrase sequence
    - cql: Custom CQL query
    """
    service = get_kwic_service()
    
    pos_filter = request.pos_filter.model_dump() if request.pos_filter else None
    
    result = service.search(
        corpus_id=request.corpus_id,
        text_ids=request.text_ids,
        search_mode=request.search_mode,
        search_value=request.search_value,
        context_size=request.context_size,
        lowercase=request.lowercase,
        pos_filter=pos_filter,
        sort_by=request.sort_by,
        sort_levels=request.sort_levels,
        sort_descending=request.sort_descending,
        max_results=request.max_results
    )
    
    return KWICSearchResponse(**result)


@router.post("/extended-context", response_model=ExtendedContextResponse)
async def get_extended_context(request: ExtendedContextRequest):
    """
    Get extended context for a KWIC result
    
    Returns the surrounding text with more context for detailed viewing.
    """
    service = get_kwic_service()
    
    result = service.get_extended_context(
        corpus_id=request.corpus_id,
        text_id=request.text_id,
        position=request.position,
        context_chars=request.context_chars
    )
    
    return ExtendedContextResponse(**result)


@router.post("/parse-cql", response_model=CQLParseResponse)
async def parse_cql(request: CQLParseRequest):
    """
    Parse and validate a CQL query
    
    Returns whether the query is valid and any error message.
    """
    service = get_kwic_service()
    
    result = service.parse_cql(request.query)
    
    return CQLParseResponse(**result)


@router.get("/pos-tags", response_model=List[POSTagInfo])
async def get_pos_tags():
    """
    Get available SpaCy Universal POS tags with descriptions
    
    Returns POS tags with English and Chinese descriptions.
    """
    return get_pos_tags_info()


@router.get("/penn-tags", response_model=List[POSTagInfo])
async def get_penn_tags():
    """
    Get Penn Treebank POS tags with descriptions
    
    Returns fine-grained POS tags used by SpaCy's tag_ attribute.
    """
    return get_penn_treebank_tags_info()


@router.get("/dep-tags", response_model=List[POSTagInfo])
async def get_dep_tags():
    """
    Get dependency relation tags with descriptions
    
    Returns dependency tags used by SpaCy's dep_ attribute.
    """
    return get_dep_tags_info()
