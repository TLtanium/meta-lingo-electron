"""
USAS Semantic Tagging API Router
Provides endpoints for semantic domain annotation and settings

Supports three tagging modes:
- rule_based: Traditional PyMUSAS rule-based tagger with custom disambiguation
- neural: Neural network based tagger (PyMUSAS-Neural-Multilingual-Base-BEM)
- hybrid: Combines rule-based and neural (neural for unknown words)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal

from services.usas_service import get_usas_service

router = APIRouter(prefix="/api/usas", tags=["usas"])


# ==================== Request/Response Models ====================

class AnnotateRequest(BaseModel):
    text: str
    language: str = "english"
    text_type: Optional[str] = None
    mode_override: Optional[Literal['rule_based', 'neural', 'hybrid']] = None


class AnnotateSegmentsRequest(BaseModel):
    segments: List[Dict[str, Any]]
    language: str = "english"
    text_type: Optional[str] = None
    mode_override: Optional[Literal['rule_based', 'neural', 'hybrid']] = None


class PrioritySettingsRequest(BaseModel):
    priority_domains: List[str]
    default_text_type: Optional[str] = None


class TextTypeUpdateRequest(BaseModel):
    code: str
    priority_domains: List[str]


class TextTypeCreateRequest(BaseModel):
    code: str
    name: str
    name_zh: Optional[str] = None
    priority_domains: List[str] = []
    is_custom: bool = True


class TaggingModeRequest(BaseModel):
    mode: Literal['rule_based', 'neural', 'hybrid']


# ==================== Endpoints ====================

@router.get("/domains")
async def get_domains():
    """
    Get all USAS semantic domains grouped by major category
    
    Returns domains organized by the 21 major categories (A-Z),
    with each domain's code and description.
    """
    try:
        service = get_usas_service()
        domains = service.get_domains()
        
        return {
            "success": True,
            "data": domains
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/domain/{code}")
async def get_domain_info(code: str):
    """
    Get information about a specific semantic domain code
    
    Args:
        code: Domain code like 'A1.1.1' or 'I1.1'
    """
    try:
        service = get_usas_service()
        info = service.get_domain_info(code)
        
        return {
            "success": True,
            "data": info
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/annotate")
async def annotate_text(request: AnnotateRequest):
    """
    Annotate text with USAS semantic domains
    
    Supports three tagging modes:
    - rule_based: PyMUSAS rule-based tagger with custom disambiguation
    - neural: Neural network tagger (direct prediction)
    - hybrid: Rule-based first, neural for unknown (Z99) words
    
    Args:
        text: Text to annotate
        language: Language code (english or chinese)
        text_type: Optional text type for priority-based disambiguation
        mode_override: Optional mode override for this request
    """
    try:
        service = get_usas_service()
        
        # For neural mode, language check is handled differently
        mode = request.mode_override or service.get_tagging_mode()
        if mode in ('rule_based', 'hybrid'):
            if not service.is_available(request.language):
                return {
                    "success": False,
                    "error": f"USAS not available for language: {request.language}. Only English and Chinese are supported."
                }
        
        result = service.annotate_text(
            text=request.text,
            language=request.language,
            text_type=request.text_type,
            mode_override=request.mode_override
        )
        
        return {
            "success": result["success"],
            "data": result if result["success"] else None,
            "error": result.get("error")
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/annotate/segments")
async def annotate_segments(request: AnnotateSegmentsRequest):
    """
    Annotate transcript segments with USAS semantic domains
    
    Supports three tagging modes (same as /annotate endpoint)
    
    Args:
        segments: List of segment dicts with 'id', 'text', 'start', 'end'
        language: Language code (english or chinese)
        text_type: Optional text type for priority-based disambiguation
        mode_override: Optional mode override for this request
    """
    try:
        service = get_usas_service()
        
        # For neural mode, language check is handled differently
        mode = request.mode_override or service.get_tagging_mode()
        if mode in ('rule_based', 'hybrid'):
            if not service.is_available(request.language):
                return {
                    "success": False,
                    "error": f"USAS not available for language: {request.language}. Only English and Chinese are supported."
                }
        
        result = service.annotate_segments(
            segments=request.segments,
            language=request.language,
            text_type=request.text_type,
            mode_override=request.mode_override
        )
        
        return {
            "success": result["success"],
            "data": result if result["success"] else None,
            "error": result.get("error")
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/priority")
async def get_priority_settings():
    """
    Get current priority domain settings
    
    Returns the user-configured priority domains used for disambiguation.
    """
    try:
        service = get_usas_service()
        settings = service.get_priority_settings()
        
        return {
            "success": True,
            "data": settings
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.put("/priority")
async def update_priority_settings(request: PrioritySettingsRequest):
    """
    Update priority domain settings
    
    Priority domains are used for disambiguation when a word has
    multiple possible semantic tags.
    
    Args:
        priority_domains: List of domain codes to prioritize
        default_text_type: Default text type for disambiguation
    """
    try:
        service = get_usas_service()
        result = service.update_priority_settings(
            request.priority_domains,
            request.default_text_type
        )
        
        return {
            "success": result["success"],
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/status")
async def get_status():
    """
    Get USAS service status
    
    Returns availability status for English and Chinese.
    """
    try:
        service = get_usas_service()
        
        return {
            "success": True,
            "data": {
                "english_available": service.is_available("english"),
                "chinese_available": service.is_available("chinese"),
                "supported_languages": service.get_supported_languages()
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ==================== Tagging Mode Endpoints ====================

@router.get("/mode")
async def get_tagging_mode():
    """
    Get current tagging mode and availability status of all modes
    
    Returns:
        current_mode: Current active tagging mode
        modes: Dictionary with each mode's availability and description
    """
    try:
        service = get_usas_service()
        mode_status = service.get_mode_status()
        
        return {
            "success": True,
            "data": mode_status
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.put("/mode")
async def set_tagging_mode(request: TaggingModeRequest):
    """
    Set the tagging mode for USAS annotation
    
    Args:
        mode: One of 'rule_based', 'neural', or 'hybrid'
        
    Modes:
        - rule_based: PyMUSAS rule-based tagger with custom disambiguation
        - neural: Neural network tagger (direct prediction, no disambiguation)
        - hybrid: Rule-based first, neural for unknown (Z99) words
    """
    try:
        service = get_usas_service()
        
        # Check if neural mode is available when selecting neural or hybrid
        if request.mode in ('neural', 'hybrid'):
            mode_status = service.get_mode_status()
            if not mode_status['modes'][request.mode]['available']:
                return {
                    "success": False,
                    "error": f"Mode '{request.mode}' is not available. Neural model may not be installed."
                }
        
        result = service.set_tagging_mode(request.mode)
        
        return {
            "success": result["success"],
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ==================== Text Type Configuration Endpoints ====================

@router.get("/text-types")
async def get_text_types():
    """
    Get all text type configurations with their priority domains.
    Used by both settings page and upload page.
    """
    try:
        service = get_usas_service()
        text_types = service.get_text_type_configs()
        
        return {
            "success": True,
            "data": {
                "text_types": text_types
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.put("/text-types")
async def update_text_type(request: TextTypeUpdateRequest):
    """
    Update priority domains for a text type.
    """
    try:
        service = get_usas_service()
        result = service.update_text_type_domains(request.code, request.priority_domains)
        
        return {
            "success": result["success"],
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/text-types")
async def create_text_type(request: TextTypeCreateRequest):
    """
    Create a custom text type.
    """
    try:
        service = get_usas_service()
        result = service.create_custom_text_type(
            code=request.code,
            name=request.name,
            name_zh=request.name_zh or request.name,
            priority_domains=request.priority_domains
        )
        
        return {
            "success": result["success"],
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/text-types/{code}")
async def delete_text_type(code: str):
    """
    Delete a custom text type.
    """
    try:
        service = get_usas_service()
        result = service.delete_custom_text_type(code)
        
        return {
            "success": result["success"],
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
