"""
Pydantic Models for Bibliographic Visualization API
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class SourceType(str, Enum):
    """Bibliographic data source type"""
    WOS = "WOS"
    CNKI = "CNKI"


class DocType(str, Enum):
    """Document type"""
    JOURNAL_ARTICLE = "Journal Article"
    DISSERTATION = "Dissertation/Thesis"
    CONFERENCE_PAPER = "Conference Paper"
    BOOK = "Book"
    BOOK_CHAPTER = "Book Chapter"
    REVIEW = "Review"
    OTHER = "Other"


# ==================== Library Models ====================

class BiblioLibraryCreate(BaseModel):
    """Create bibliographic library request"""
    name: str
    source_type: SourceType
    description: Optional[str] = None


class BiblioLibraryUpdate(BaseModel):
    """Update bibliographic library request"""
    name: Optional[str] = None
    description: Optional[str] = None


class BiblioLibrary(BaseModel):
    """Full bibliographic library model"""
    id: str
    name: str
    source_type: SourceType
    description: Optional[str] = None
    entry_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Entry Models ====================

class BiblioEntryBase(BaseModel):
    """Base bibliographic entry model"""
    title: str
    authors: List[str] = []
    institutions: List[str] = []
    countries: List[str] = []
    journal: Optional[str] = None
    year: Optional[int] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    keywords: List[str] = []
    abstract: Optional[str] = None
    doc_type: Optional[str] = None
    language: Optional[str] = None
    citation_count: int = 0
    source_url: Optional[str] = None
    unique_id: Optional[str] = None


class BiblioEntry(BiblioEntryBase):
    """Full bibliographic entry model"""
    id: str
    library_id: str
    raw_data: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Filter Models ====================

class BiblioFilter(BaseModel):
    """Filter criteria for bibliographic entries"""
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    author: Optional[str] = None
    institution: Optional[str] = None
    keyword: Optional[str] = None
    journal: Optional[str] = None
    doc_type: Optional[str] = None
    country: Optional[str] = None


class BiblioListRequest(BaseModel):
    """Request for listing entries with filters and pagination"""
    library_id: str
    filters: Optional[BiblioFilter] = None
    page: int = 1
    page_size: int = 50


# ==================== Visualization Request Models ====================

class VisualizationRequest(BaseModel):
    """Base request for visualization data"""
    library_id: str
    filters: Optional[BiblioFilter] = None


class NetworkVisualizationRequest(VisualizationRequest):
    """Request for network visualization"""
    min_weight: int = 1  # Minimum edge weight to include
    max_nodes: int = 100  # Maximum number of nodes
    node_type: Optional[str] = None  # For filtering specific node types


class TimeVisualizationRequest(VisualizationRequest):
    """Request for time-based visualization"""
    time_slice: int = 1  # Years per time slice
    top_n: int = 10  # Top N items per time slice


class ClusterVisualizationRequest(VisualizationRequest):
    """Request for cluster visualization"""
    n_clusters: Optional[int] = None  # Number of clusters (auto if None)
    cluster_by: str = "keyword"  # keyword, author, institution


class BurstDetectionRequest(VisualizationRequest):
    """Request for burst detection"""
    burst_type: str = "keyword"  # keyword, author, reference
    min_frequency: int = 2  # Minimum frequency to consider
    gamma: float = 1.0  # Kleinberg parameter


# ==================== Visualization Response Models ====================

class NetworkNode(BaseModel):
    """Node in a network visualization"""
    id: str
    label: str
    weight: int = 1
    frequency: int = 0
    centrality: float = 0.0
    cluster: Optional[int] = None
    year: Optional[int] = None
    attributes: Optional[Dict[str, Any]] = None


class NetworkEdge(BaseModel):
    """Edge in a network visualization"""
    source: str
    target: str
    weight: int = 1


class NetworkVisualizationResponse(BaseModel):
    """Response for network visualization"""
    nodes: List[NetworkNode]
    edges: List[NetworkEdge]
    statistics: Optional[Dict[str, Any]] = None


class TimelineNode(BaseModel):
    """Node in a timeline visualization"""
    id: str
    label: str
    year: int
    cluster: int
    weight: int = 1
    is_burst: bool = False


class TimelineCluster(BaseModel):
    """Cluster in a timeline visualization"""
    id: int
    label: str
    size: int
    year_start: int
    year_end: int


class TimelineVisualizationResponse(BaseModel):
    """Response for timeline visualization"""
    nodes: List[TimelineNode]
    edges: List[NetworkEdge]
    clusters: List[TimelineCluster]
    time_range: Dict[str, int]


class TimezoneSlice(BaseModel):
    """Time slice in timezone visualization"""
    year: int
    entries: List[Dict[str, Any]]
    count: int


class TimezoneVisualizationResponse(BaseModel):
    """Response for timezone visualization"""
    slices: List[TimezoneSlice]
    edges: List[NetworkEdge]
    time_range: Dict[str, int]


class BurstItem(BaseModel):
    """Item with burst detection"""
    term: str
    frequency: int
    burst_start: int
    burst_end: int
    burst_strength: float
    burst_weight: float


class BurstDetectionResponse(BaseModel):
    """Response for burst detection"""
    bursts: List[BurstItem]
    time_range: Dict[str, int]


class ClusterInfo(BaseModel):
    """Information about a cluster"""
    id: int
    label: str
    size: int
    silhouette: float
    top_terms: List[str]


class ClusterVisualizationResponse(BaseModel):
    """Response for cluster visualization"""
    nodes: List[NetworkNode]
    edges: List[NetworkEdge]
    clusters: List[ClusterInfo]
    modularity: float
    silhouette: float


class LandscapePoint(BaseModel):
    """Point in landscape visualization"""
    x: float
    y: float
    z: float  # Height (centrality/citations)
    id: str
    label: str
    cluster: int


class LandscapeVisualizationResponse(BaseModel):
    """Response for landscape visualization"""
    points: List[LandscapePoint]
    clusters: List[ClusterInfo]


class DualMapNode(BaseModel):
    """Node in dual-map overlay"""
    id: str
    label: str
    x: float
    y: float
    weight: int
    side: str  # "citing" or "cited"


class DualMapLink(BaseModel):
    """Link in dual-map overlay"""
    source: str
    target: str
    weight: int
    color: Optional[str] = None


class DualMapVisualizationResponse(BaseModel):
    """Response for dual-map overlay"""
    citing_nodes: List[DualMapNode]
    cited_nodes: List[DualMapNode]
    links: List[DualMapLink]


# ==================== API Response Models ====================

class BiblioLibraryListResponse(BaseModel):
    """Response for library list"""
    libraries: List[BiblioLibrary]
    total: int


class BiblioEntryListResponse(BaseModel):
    """Response for entry list with pagination"""
    entries: List[BiblioEntry]
    total: int
    page: int
    page_size: int
    total_pages: int


class BiblioStatistics(BaseModel):
    """Statistics for a bibliographic library"""
    total: int
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    year_distribution: Dict[int, int] = {}
    doc_types: Dict[str, int] = {}


class UploadResult(BaseModel):
    """Result of file upload and parsing"""
    success: bool
    entries_added: int
    entries_skipped: int
    errors: List[str] = []


class FilterOptions(BaseModel):
    """Available filter options for a library"""
    years: List[int] = []
    authors: List[str] = []
    institutions: List[str] = []
    keywords: List[str] = []
    journals: List[str] = []
    doc_types: List[str] = []
    countries: List[str] = []

