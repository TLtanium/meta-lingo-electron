"""
Pydantic Models for Corpus Management API
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class MediaType(str, Enum):
    TEXT = "text"
    AUDIO = "audio"
    VIDEO = "video"


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskType(str, Enum):
    UPLOAD = "upload"
    TRANSCRIBE = "transcribe"
    YOLO = "yolo"
    PREPROCESS = "preprocess"


# ==================== Corpus Models ====================

class CorpusMetadata(BaseModel):
    """Corpus metadata for creation/update"""
    name: str
    language: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None
    text_type: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []


class CorpusCreate(CorpusMetadata):
    """Create corpus request"""
    pass


class CorpusUpdate(BaseModel):
    """Update corpus request"""
    name: Optional[str] = None
    language: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None
    text_type: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class Corpus(CorpusMetadata):
    """Full corpus model"""
    id: str
    text_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Text Models ====================

class TextMetadata(BaseModel):
    """Text-level metadata"""
    author: Optional[str] = None
    date: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    custom_fields: Optional[Dict[str, str]] = None
    customFields: Optional[Dict[str, str]] = None  # Accept camelCase from frontend
    
    class Config:
        # Allow extra fields
        extra = "allow"


class TextCreate(BaseModel):
    """Create text entry request"""
    filename: str
    media_type: MediaType
    content_path: Optional[str] = None
    metadata: Optional[TextMetadata] = None
    tags: List[str] = []


class TextUpdate(BaseModel):
    """Update text entry request"""
    filename: Optional[str] = None
    content_path: Optional[str] = None
    transcript_path: Optional[str] = None
    has_timestamps: Optional[bool] = None
    yolo_annotation_path: Optional[str] = None
    word_count: Optional[int] = None
    metadata: Optional[TextMetadata] = None
    tags: Optional[List[str]] = None


class CorpusText(BaseModel):
    """Full text model"""
    id: str
    corpus_id: str
    filename: str
    original_filename: Optional[str] = None
    content_path: Optional[str] = None
    media_type: MediaType
    transcript_path: Optional[str] = None
    transcript_json_path: Optional[str] = None
    has_timestamps: bool = False
    yolo_annotation_path: Optional[str] = None
    audio_path: Optional[str] = None
    word_count: int = 0
    duration: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    tags: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Transcript Models ====================

class TranscriptWord(BaseModel):
    """Word-level timestamp"""
    word: str
    start: float
    end: float
    probability: Optional[float] = None


class TranscriptSegment(BaseModel):
    """Sentence/segment-level transcript"""
    id: int
    start: float
    end: float
    text: str
    words: Optional[List[TranscriptWord]] = None


class TranscriptData(BaseModel):
    """Full transcript data"""
    audio_path: Optional[str] = None
    audio_name: Optional[str] = None
    language: Optional[str] = None
    full_text: str
    total_duration: Optional[float] = None
    total_segments: int = 0
    total_words: int = 0
    segments: List[TranscriptSegment] = []
    words: Optional[List[TranscriptWord]] = None
    word_level_timestamps: bool = False


# ==================== YOLO Models ====================

class YoloDetection(BaseModel):
    """Single YOLO detection"""
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    frame_number: int
    timestamp_seconds: float


class YoloTrackSegment(BaseModel):
    """YOLO tracking segment"""
    track_id: int
    class_name: str
    start_frame: int
    end_frame: int
    start_time: float
    end_time: float
    color: str
    detections: List[YoloDetection] = []


class YoloResult(BaseModel):
    """Full YOLO analysis result"""
    video_path: str
    video_name: str
    fps: float
    total_frames: int
    width: int
    height: int
    duration: float
    conf_threshold: float
    total_detections: int
    total_tracks: int
    track_segments: List[YoloTrackSegment] = []
    frames_dir: Optional[str] = None


# ==================== Processing Task Models ====================

class ProcessingTask(BaseModel):
    """Processing task status"""
    id: str
    corpus_id: Optional[str] = None
    text_id: Optional[str] = None
    task_type: TaskType
    status: TaskStatus = TaskStatus.PENDING
    progress: int = 0
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None


# ==================== Upload Models ====================

class UploadConfig(BaseModel):
    """Upload configuration"""
    corpus_id: str
    transcribe: bool = True
    yolo_annotation: bool = False
    language: Optional[str] = None  # For transcription language hint
    metadata: Optional[TextMetadata] = None
    tags: List[str] = []


class UploadResult(BaseModel):
    """Upload result"""
    success: bool
    text_id: Optional[str] = None
    task_id: Optional[str] = None
    filename: str
    media_type: MediaType
    message: Optional[str] = None


# ==================== Preprocess Models ====================

class PreprocessConfig(BaseModel):
    """Preprocessing configuration"""
    normalize_text: bool = True
    remove_punctuation: bool = True
    to_lowercase: bool = True
    remove_stopwords: bool = True
    stopwords_language: str = "english"
    tokenize: bool = True
    extract_entities: bool = False
    custom_stopwords: Optional[List[str]] = None
    advanced_patterns: Optional[List[str]] = None  # Regex patterns


class PreprocessResult(BaseModel):
    """Preprocessing result"""
    original_text: str
    processed_text: str
    tokens: Optional[List[str]] = None
    entities: Optional[List[Dict[str, Any]]] = None
    word_count: int = 0
    save_path: Optional[str] = None


# ==================== API Response Models ====================

class CorpusListResponse(BaseModel):
    """Corpus list response"""
    success: bool = True
    data: List[Corpus]
    message: Optional[str] = None


class CorpusDetailResponse(BaseModel):
    """Corpus detail response"""
    success: bool = True
    data: Corpus
    message: Optional[str] = None


class TextListResponse(BaseModel):
    """Text list response"""
    success: bool = True
    data: List[CorpusText]
    message: Optional[str] = None


class TextDetailResponse(BaseModel):
    """Text detail response with content"""
    success: bool = True
    data: CorpusText
    content: Optional[str] = None
    transcript: Optional[TranscriptData] = None
    message: Optional[str] = None


class UploadResponse(BaseModel):
    """Upload response"""
    success: bool = True
    data: List[UploadResult]
    message: Optional[str] = None


class TaskResponse(BaseModel):
    """Task status response"""
    success: bool = True
    data: ProcessingTask
    message: Optional[str] = None


class TagListResponse(BaseModel):
    """Tag list response"""
    success: bool = True
    data: List[str]
    message: Optional[str] = None

