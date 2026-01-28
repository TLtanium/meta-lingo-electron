"""
Annotation Management API Router
Handles annotation save/load operations
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json
import uuid
import logging

from config import ANNOTATIONS_DIR
from services.theme_analysis_service import get_theme_analysis_service

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Ensure annotations directory exists
ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)


# ==================== Pydantic Models ====================

class AnnotationItem(BaseModel):
    id: str
    text: str
    startPosition: int
    endPosition: int
    label: str
    labelPath: str
    color: str
    remark: Optional[str] = None
    type: Optional[str] = "text"  # text or video
    bbox: Optional[List[float]] = None
    timestamp: Optional[float] = None
    frameNumber: Optional[int] = None
    frameCount: Optional[int] = None
    pos: Optional[str] = None
    entity: Optional[str] = None


class TranscriptSegment(BaseModel):
    id: str
    start: float
    end: float
    text: str


class YoloDetection(BaseModel):
    trackId: int
    classId: int
    className: str
    confidence: float
    bbox: List[float]
    frameNumber: int
    timestamp: float


class YoloTrack(BaseModel):
    trackId: int
    className: str
    startFrame: int
    endFrame: int
    startTime: float
    endTime: float
    color: str
    detections: List[YoloDetection]


class VideoKeyframe(BaseModel):
    frameNumber: int
    bbox: List[float]
    time: float
    label: str
    color: Optional[str] = None


class VideoFrame(BaseModel):
    frameNumber: int
    bbox: List[float]
    time: float
    label: str


class VideoBox(BaseModel):
    id: int
    label: str
    color: str
    startFrame: int
    endFrame: int
    frameCount: int
    startTime: float
    endTime: float
    keyframes: List[VideoKeyframe]
    frames: List[VideoFrame]


# ==================== CLIP Models ====================

class ClipFrameResult(BaseModel):
    """CLIP classification result for a single frame"""
    frame_number: int
    timestamp_seconds: float
    classifications: Dict[str, float]  # label -> confidence score
    top_label: str
    confidence: float


class ClipAnnotationData(BaseModel):
    """Complete CLIP annotation data for a video"""
    video_path: Optional[str] = None
    video_name: Optional[str] = None
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    frame_interval: Optional[int] = None
    labels: List[str] = []
    frame_results: List[ClipFrameResult] = []


# ==================== SpaCy Models ====================

class SpacyToken(BaseModel):
    """SpaCy token information"""
    text: str
    start: int
    end: int
    pos: str
    tag: str
    lemma: str
    dep: str
    morph: str = ""


class SpacyEntity(BaseModel):
    """SpaCy named entity"""
    text: str
    start: int
    end: int
    label: str
    description: str = ""


class SpacySentence(BaseModel):
    """SpaCy sentence boundary"""
    text: str
    start: int
    end: int


class SpacyAnnotationData(BaseModel):
    """Complete SpaCy annotation data for restoring POS/NER/Syntax"""
    success: bool = True
    tokens: List[SpacyToken] = []
    entities: List[SpacyEntity] = []
    sentences: List[SpacySentence] = []
    error: Optional[str] = None


class SaveAnnotationRequest(BaseModel):
    corpusName: str
    textId: Optional[str] = None  # 文本ID，用于精确关联文本
    textName: Optional[str] = None
    resourceName: Optional[str] = None
    framework: str
    frameworkCategory: str
    type: str  # text or multimodal
    text: str
    annotations: List[AnnotationItem]
    mediaType: Optional[str] = None
    mediaPath: Optional[str] = None
    yoloAnnotations: Optional[List[YoloTrack]] = None
    transcriptSegments: Optional[List[TranscriptSegment]] = None
    manualTracks: Optional[List[VideoBox]] = None
    clipAnnotations: Optional[ClipAnnotationData] = None  # CLIP语义分类数据
    spacyAnnotation: Optional[SpacyAnnotationData] = None  # SpaCy标注数据 (用于恢复)
    archiveId: Optional[str] = None
    coderName: Optional[str] = None  # 编码者名称


class AnnotationArchiveListItem(BaseModel):
    id: str
    filename: str
    type: str
    framework: str
    textId: Optional[str] = None  # 文本ID
    textName: Optional[str] = None
    resourceName: Optional[str] = None
    annotationCount: int
    timestamp: str
    coderName: Optional[str] = None  # 编码者名称


# ==================== Utility Functions ====================

def get_corpus_dir(corpus_name: str) -> Path:
    """Get the directory for a corpus's annotations"""
    corpus_dir = ANNOTATIONS_DIR / corpus_name
    corpus_dir.mkdir(parents=True, exist_ok=True)
    return corpus_dir


def get_archive_path(corpus_name: str, archive_id: str) -> Path:
    """Get the file path for an annotation archive"""
    return get_corpus_dir(corpus_name) / f"{archive_id}.json"


def load_archive(corpus_name: str, archive_id: str) -> Optional[Dict]:
    """Load annotation archive from file"""
    path = get_archive_path(corpus_name, archive_id)
    if not path.exists():
        return None
    
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_archive(corpus_name: str, archive: Dict) -> str:
    """Save annotation archive to file"""
    path = get_archive_path(corpus_name, archive['id'])
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)
    return str(path)


def list_archives(corpus_name: str, archive_type: Optional[str] = None, text_id: Optional[str] = None) -> List[Dict]:
    """List all annotation archives for a corpus
    
    Args:
        corpus_name: Name of the corpus
        archive_type: Filter by type ('text' or 'multimodal')
        text_id: Filter by text ID (only show archives for this text)
    """
    corpus_dir = get_corpus_dir(corpus_name)
    archives = []
    
    for path in corpus_dir.glob("*.json"):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                archive = json.load(f)
                
                # Filter by type if specified
                if archive_type:
                    if archive_type == 'text' and archive.get('type') == 'multimodal':
                        continue
                    if archive_type == 'multimodal' and archive.get('type') != 'multimodal':
                        continue
                
                # Filter by text_id if specified
                if text_id:
                    archive_text_id = archive.get('textId')
                    if archive_text_id and archive_text_id != text_id:
                        continue
                
                # 计算CLIP帧数
                clip_frame_count = 0
                clip_data = archive.get('clipAnnotations')
                if clip_data and isinstance(clip_data, dict):
                    frame_results = clip_data.get('frame_results', [])
                    if isinstance(frame_results, list):
                        clip_frame_count = len(frame_results)
                
                # 计算YOLO轨迹数
                yolo_count = len(archive.get('yoloAnnotations', []))
                
                # 计算手动标注数
                manual_count = len(archive.get('manualTracks', []))
                
                archives.append({
                    'id': archive['id'],
                    'filename': path.name,
                    'type': archive.get('type', 'text'),
                    'textId': archive.get('textId'),  # 返回 textId
                    'corpusName': corpus_name,  # 返回语料库名称
                    'framework': archive.get('framework', 'Unknown'),
                    'textName': archive.get('textName'),
                    'resourceName': archive.get('resourceName'),
                    'annotationCount': len(archive.get('annotations', [])),
                    'clipFrameCount': clip_frame_count,
                    'yoloCount': yolo_count,
                    'manualCount': manual_count,
                    'timestamp': archive.get('timestamp', ''),
                    'coderName': archive.get('coderName')
                })
        except Exception as e:
            print(f"Error loading archive {path}: {e}")
    
    # Sort by timestamp (newest first)
    archives.sort(key=lambda x: x['timestamp'], reverse=True)
    return archives


def list_all_archives(archive_type: Optional[str] = None) -> List[Dict]:
    """List all annotation archives across all corpora
    
    Args:
        archive_type: Filter by type ('text' or 'multimodal')
    """
    all_archives = []
    
    if not ANNOTATIONS_DIR.exists():
        return all_archives
    
    for corpus_dir in ANNOTATIONS_DIR.iterdir():
        if corpus_dir.is_dir():
            corpus_name = corpus_dir.name
            archives = list_archives(corpus_name, archive_type)
            all_archives.extend(archives)
    
    # Sort by timestamp (newest first)
    all_archives.sort(key=lambda x: x['timestamp'], reverse=True)
    return all_archives


def delete_archives_by_text_id(text_id: str) -> int:
    """Delete all annotation archives associated with a specific text ID
    
    Args:
        text_id: The text ID to match
        
    Returns:
        Number of archives deleted
    """
    deleted_count = 0
    
    if not ANNOTATIONS_DIR.exists():
        return deleted_count
    
    for corpus_dir in ANNOTATIONS_DIR.iterdir():
        if corpus_dir.is_dir():
            for path in corpus_dir.glob("*.json"):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        archive = json.load(f)
                    
                    if archive.get('textId') == text_id:
                        path.unlink()
                        deleted_count += 1
                        print(f"Deleted annotation archive for text {text_id}: {path}")
                except Exception as e:
                    print(f"Error checking/deleting archive {path}: {e}")
    
    return deleted_count


# ==================== API Endpoints ====================

@router.get("/list-all")
async def list_all_annotations(type: Optional[str] = None):
    """Get all annotation archives across all corpora
    
    Query parameters:
        type: Filter by archive type ('text' or 'multimodal')
    """
    archives = list_all_archives(type)
    
    return {
        'success': True,
        'data': {
            'archives': archives
        }
    }


@router.get("/list/{corpus_name}")
async def list_annotations(corpus_name: str, type: Optional[str] = None, text_id: Optional[str] = None):
    """Get all annotation archives for a corpus
    
    Query parameters:
        type: Filter by archive type ('text' or 'multimodal')
        text_id: Filter by text ID (only show archives for this specific text)
    """
    archives = list_archives(corpus_name, type, text_id)
    
    return {
        'success': True,
        'data': {
            'archives': archives
        }
    }


@router.get("/load/{corpus_name}/{archive_id}")
async def load_annotation(corpus_name: str, archive_id: str):
    """Load annotation archive by ID"""
    archive = load_archive(corpus_name, archive_id)
    if not archive:
        raise HTTPException(status_code=404, detail="Annotation archive not found")
    
    return {
        'success': True,
        'data': archive
    }


@router.post("/save")
async def save_annotation(data: SaveAnnotationRequest):
    """Save annotation archive"""
    # Use existing ID or generate new one
    archive_id = data.archiveId or str(uuid.uuid4())
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # If updating existing archive, load it to preserve original name
    existing_archive = None
    if data.archiveId:
        existing_archive = load_archive(data.corpusName, data.archiveId)
    
    # Build archive data
    archive = {
        'id': archive_id,
        'type': data.type,
        'framework': data.framework,
        'frameworkCategory': data.frameworkCategory,
        'corpusName': data.corpusName,
        'text': data.text,
        'annotations': [ann.model_dump() for ann in data.annotations],
        'timestamp': timestamp,
        'annotator': 'current_user'
    }
    
    # Add textId - preserve existing or use new value
    # textId is used to precisely link archive to a specific text even if filename changes
    if data.textId:
        archive['textId'] = data.textId
    elif existing_archive and 'textId' in existing_archive:
        archive['textId'] = existing_archive['textId']
    
    # Add coderName - preserve existing or use new value
    if data.coderName:
        archive['coderName'] = data.coderName
    elif existing_archive and 'coderName' in existing_archive:
        archive['coderName'] = existing_archive['coderName']
    
    # Add SpaCy annotation data if provided
    if data.spacyAnnotation:
        archive['spacyAnnotation'] = data.spacyAnnotation.model_dump()
    elif existing_archive and 'spacyAnnotation' in existing_archive:
        # Preserve existing SpaCy data if not provided in update
        archive['spacyAnnotation'] = existing_archive['spacyAnnotation']
    
    # Add type-specific fields
    if data.type == 'text':
        # Preserve original textName if updating existing archive
        if existing_archive and 'textName' in existing_archive:
            archive['textName'] = existing_archive['textName']
        else:
            archive['textName'] = data.textName
    elif data.type == 'multimodal':
        # Preserve original resourceName if updating existing archive
        if existing_archive and 'resourceName' in existing_archive:
            archive['resourceName'] = existing_archive['resourceName']
        else:
            archive['resourceName'] = data.resourceName
        archive['mediaType'] = data.mediaType
        archive['mediaPath'] = data.mediaPath
        
        if data.yoloAnnotations:
            archive['yoloAnnotations'] = [y.model_dump() for y in data.yoloAnnotations]
        if data.transcriptSegments:
            archive['transcriptSegments'] = [s.model_dump() for s in data.transcriptSegments]
        if data.manualTracks:
            archive['manualTracks'] = [t.model_dump() for t in data.manualTracks]
        if data.clipAnnotations:
            archive['clipAnnotations'] = data.clipAnnotations.model_dump()
    
    # Save to file
    saved_path = save_archive(data.corpusName, archive)
    
    return {
        'success': True,
        'data': {
            'id': archive_id,
            'path': saved_path
        },
        'message': f'Saved {len(data.annotations)} annotations'
    }


@router.delete("/{corpus_name}/{archive_id}")
async def delete_annotation(corpus_name: str, archive_id: str):
    """Delete annotation archive"""
    path = get_archive_path(corpus_name, archive_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Annotation archive not found")
    
    path.unlink()
    
    return {
        'success': True,
        'message': 'Annotation archive deleted successfully'
    }


@router.put("/{corpus_name}/{archive_id}/rename")
async def rename_annotation(corpus_name: str, archive_id: str, new_name: dict):
    """Rename annotation archive"""
    archive = load_archive(corpus_name, archive_id)
    if not archive:
        raise HTTPException(status_code=404, detail="Annotation archive not found")
    
    # Update name fields
    if archive.get('type') == 'multimodal':
        archive['resourceName'] = new_name.get('name', archive.get('resourceName'))
    else:
        archive['textName'] = new_name.get('name', archive.get('textName'))
    
    archive['updatedAt'] = datetime.now().isoformat()
    save_archive(corpus_name, archive)
    
    return {
        'success': True,
        'message': 'Archive renamed successfully'
    }


@router.get("/corpora")
async def list_annotated_corpora():
    """List all corpora that have annotations"""
    corpora = []
    
    for corpus_dir in ANNOTATIONS_DIR.iterdir():
        if corpus_dir.is_dir():
            # Count archives
            archive_count = len(list(corpus_dir.glob("*.json")))
            if archive_count > 0:
                corpora.append({
                    'name': corpus_dir.name,
                    'archiveCount': archive_count
                })
    
    corpora.sort(key=lambda x: x['name'])
    
    return {
        'success': True,
        'data': {
            'corpora': corpora
        }
    }


# ==================== Auto-Annotation Models ====================

class ThemeRhemeRequest(BaseModel):
    """Request model for theme/rheme analysis"""
    corpus_id: str
    text_id: str


class ThemeRhemeResult(BaseModel):
    """Result model for a single sentence's theme/rheme analysis"""
    sentence_index: int
    sentence_text: str
    theme_start: int
    theme_end: int
    rheme_start: int
    rheme_end: int
    theme_text: str
    rheme_text: str


# ==================== Auto-Annotation Endpoints ====================

@router.post("/auto-annotate/theme-rheme")
async def auto_annotate_theme_rheme(request: ThemeRhemeRequest):
    """
    Automatically identify theme and rheme boundaries for a text.
    
    Uses SpaCy dependency parsing to identify:
    - Theme: the starting point of each clause (textual + interpersonal + topical theme)
    - Rheme: everything after the theme
    
    This endpoint requires the text to have SpaCy annotations already.
    """
    from models.database import TextDB
    
    try:
        # Get text from database to find the actual file path
        text = TextDB.get_by_id(request.text_id)
        if not text:
            raise HTTPException(
                status_code=404,
                detail=f"Text not found: {request.text_id}"
            )
        
        # Get content path
        content_path = text.get('content_path')
        if not content_path:
            raise HTTPException(
                status_code=400,
                detail="Text has no content path"
            )
        
        # For plain text, use .spacy.json file
        content_path = Path(content_path)
        spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
        
        if not spacy_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"SpaCy annotation file not found. Please run SpaCy annotation first."
            )
        
        # Load SpaCy data
        with open(spacy_path, 'r', encoding='utf-8') as f:
            spacy_data = json.load(f)
        
        if not spacy_data.get('success', False):
            raise HTTPException(
                status_code=400,
                detail="SpaCy annotation data is not valid"
            )
        
        # Get theme analysis service
        service = get_theme_analysis_service()
        
        # Analyze theme/rheme
        results = service.analyze_text(spacy_data)
        
        return {
            'success': True,
            'data': {
                'results': results,
                'sentence_count': len(results)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in theme/rheme analysis: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze theme/rheme: {str(e)}"
        )


@router.get("/auto-annotate/supported-frameworks")
async def get_supported_frameworks():
    """
    Get list of frameworks that support auto-annotation.
    
    Returns:
        List of framework IDs and their auto-annotation capabilities
    """
    return {
        'success': True,
        'data': {
            'frameworks': [
                {
                    'id': 'MIPVU',
                    'name': 'MIPVU',
                    'auto_annotation_type': 'mipvu',
                    'description': 'Auto-annotate metaphor-related words using MIPVU data',
                    'target_label': 'indirect',
                    'target_label_id': '79ee0895-6eaf-4f39-adad-d0ba5c0c068b'
                },
                {
                    'id': 'Halliday-Theme',
                    'name': 'Halliday-Theme',
                    'auto_annotation_type': 'theme-rheme',
                    'description': 'Auto-annotate theme and rheme based on SFL theory',
                    'target_labels': {
                        'theme': '641ca3de-75d0-4e7e-ac4f-00aaeedbb2e2',
                        'rheme': '89ab545d-db8b-4a3a-bcf0-bdd6ce304be8'
                    }
                },
                {
                    'id': 'Berry-Theme',
                    'name': 'Berry-Theme',
                    'auto_annotation_type': 'theme-rheme',
                    'description': 'Auto-annotate theme and rheme based on Berry theme system',
                    'target_labels': {
                        'theme': '0eda69bb-212b-4fa6-943d-15adfe64cfe8',
                        'rheme': '65c7bcd4-389a-479e-85e0-3c2f570221a5'
                    }
                }
            ]
        }
    }
