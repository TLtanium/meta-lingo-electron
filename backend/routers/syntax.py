"""
Syntax Analysis Router
API endpoints for constituency and dependency parsing
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.syntax_service import get_syntax_service

router = APIRouter(prefix="/api/syntax", tags=["syntax"])


class SyntaxRequest(BaseModel):
    """Request model for syntax analysis"""
    sentence: str
    language: str = "english"


class DependencyRequest(BaseModel):
    """Request model for dependency parsing with options"""
    sentence: str
    language: str = "english"
    compact: bool = False
    collapse_punct: bool = True
    collapse_phrases: bool = False


class ConstituencyResponse(BaseModel):
    """Response model for constituency parsing"""
    success: bool
    tree_string: str = ""
    tree_data: Optional[Dict[str, Any]] = None
    sentence: str = ""
    error: Optional[str] = None


class DependencyResponse(BaseModel):
    """Response model for dependency parsing"""
    success: bool
    svg_html: str = ""
    tokens: List[Dict[str, Any]] = []
    arcs: List[Dict[str, Any]] = []
    sentence: str = ""
    error: Optional[str] = None


class StatusResponse(BaseModel):
    """Response model for service status"""
    constituency_available: bool
    dependency_available: bool
    dependency_languages: List[str]


class LabelsResponse(BaseModel):
    """Response model for label descriptions"""
    labels: Dict[str, str]


@router.post("/constituency", response_model=ConstituencyResponse)
async def analyze_constituency(request: SyntaxRequest):
    """
    Perform constituency parsing on a sentence
    
    Returns parse tree in both string and hierarchical data format
    """
    service = get_syntax_service()
    
    if not request.sentence.strip():
        raise HTTPException(status_code=400, detail="Sentence cannot be empty")
    
    result = service.analyze_constituency(
        sentence=request.sentence.strip(),
        language=request.language
    )
    
    return ConstituencyResponse(**result)


@router.post("/dependency", response_model=DependencyResponse)
async def analyze_dependency(request: DependencyRequest):
    """
    Perform dependency parsing on a sentence
    
    Returns SVG visualization and token/arc information
    Options:
    - compact: Use straight lines instead of arcs
    - collapse_punct: Collapse punctuation
    - collapse_phrases: Collapse phrases
    """
    service = get_syntax_service()
    
    if not request.sentence.strip():
        raise HTTPException(status_code=400, detail="Sentence cannot be empty")
    
    result = service.analyze_dependency(
        sentence=request.sentence.strip(),
        language=request.language,
        compact=request.compact,
        collapse_punct=request.collapse_punct,
        collapse_phrases=request.collapse_phrases
    )
    
    return DependencyResponse(**result)


@router.get("/status", response_model=StatusResponse)
async def get_status():
    """
    Get syntax analysis service status
    
    Returns availability of constituency and dependency parsing
    """
    service = get_syntax_service()
    
    return StatusResponse(
        constituency_available=service.is_constituency_available(),
        dependency_available=service.is_dependency_available("english"),
        dependency_languages=["english", "chinese"]
    )


@router.get("/labels/dependency", response_model=LabelsResponse)
async def get_dependency_labels():
    """
    Get dependency relation label descriptions
    """
    service = get_syntax_service()
    return LabelsResponse(labels=service.get_dependency_labels())


@router.get("/labels/constituency", response_model=LabelsResponse)
async def get_constituency_labels():
    """
    Get constituency phrase label descriptions
    """
    service = get_syntax_service()
    return LabelsResponse(labels=service.get_constituency_labels())
