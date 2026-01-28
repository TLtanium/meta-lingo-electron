"""
Bibliographic Visualization API Routes

Handles CRUD operations for bibliographic libraries and entries,
as well as visualization data generation.
"""

import uuid
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from models import (
    BiblioLibraryDB,
    BiblioEntryDB,
    BiblioLibraryCreate,
    BiblioLibraryUpdate,
    BiblioLibrary,
    BiblioEntry,
    BiblioFilter,
    BiblioListRequest,
    NetworkVisualizationRequest,
    TimeVisualizationRequest,
    ClusterVisualizationRequest,
    BurstDetectionRequest,
    BiblioLibraryListResponse,
    BiblioEntryListResponse,
    BiblioStatistics,
    FilterOptions
)

from services.biblio import (
    parse_refworks_file,
    validate_source_type,
    generate_visualization
)

router = APIRouter(prefix="/api/biblio", tags=["Bibliographic"])


# ==================== Library CRUD ====================

@router.get("/libraries", response_model=BiblioLibraryListResponse)
async def list_libraries():
    """Get all bibliographic libraries"""
    libraries = BiblioLibraryDB.list_all()
    return {
        "libraries": libraries,
        "total": len(libraries)
    }


@router.post("/libraries", response_model=BiblioLibrary)
async def create_library(request: BiblioLibraryCreate):
    """Create a new bibliographic library"""
    # Check for duplicate name
    existing = BiblioLibraryDB.get_by_name(request.name)
    if existing:
        raise HTTPException(status_code=400, detail="Library with this name already exists")
    
    library_data = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "source_type": request.source_type.value,
        "description": request.description
    }
    
    library = BiblioLibraryDB.create(library_data)
    return library


@router.get("/libraries/{library_id}", response_model=BiblioLibrary)
async def get_library(library_id: str):
    """Get a bibliographic library by ID"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    return library


@router.put("/libraries/{library_id}", response_model=BiblioLibrary)
async def update_library(library_id: str, request: BiblioLibraryUpdate):
    """Update a bibliographic library"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        return library
    
    updated = BiblioLibraryDB.update(library_id, update_data)
    return updated


@router.delete("/libraries/{library_id}")
async def delete_library(library_id: str):
    """Delete a bibliographic library and all its entries"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    success = BiblioLibraryDB.delete(library_id)
    return {"success": success}


# ==================== File Upload ====================

@router.post("/libraries/{library_id}/upload")
async def upload_refworks_file(
    library_id: str,
    file: UploadFile = File(...)
):
    """
    Upload and parse a Refworks file into the library
    
    Validates that file format matches library source type (WOS/CNKI)
    """
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    # Read file content
    try:
        content = await file.read()
        # Try different encodings
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin-1']:
            try:
                text_content = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(status_code=400, detail="Cannot decode file. Please ensure it's a text file.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Validate source type
    is_valid, error_msg = validate_source_type(text_content, library['source_type'])
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Parse file
    try:
        entries, parse_errors = parse_refworks_file(text_content, library['source_type'])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    if not entries:
        raise HTTPException(
            status_code=400, 
            detail=f"No valid entries found in file. Errors: {'; '.join(parse_errors[:5])}"
        )
    
    # Add library_id to entries
    for entry in entries:
        entry['library_id'] = library_id
    
    # Insert entries
    added_count = BiblioEntryDB.create_batch(entries)
    
    # Update library entry count
    BiblioLibraryDB.update_entry_count(library_id)
    
    return {
        "success": True,
        "entries_added": added_count,
        "entries_skipped": len(entries) - added_count,
        "errors": parse_errors[:10]  # Return first 10 errors
    }


# ==================== Entry Management ====================

@router.get("/libraries/{library_id}/entries", response_model=BiblioEntryListResponse)
async def list_entries(
    library_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    year_start: Optional[int] = None,
    year_end: Optional[int] = None,
    author: Optional[str] = None,
    institution: Optional[str] = None,
    keyword: Optional[str] = None,
    journal: Optional[str] = None,
    doc_type: Optional[str] = None
):
    """Get entries in a library with optional filters"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    filters = {}
    if year_start:
        filters['year_start'] = year_start
    if year_end:
        filters['year_end'] = year_end
    if author:
        filters['author'] = author
    if institution:
        filters['institution'] = institution
    if keyword:
        filters['keyword'] = keyword
    if journal:
        filters['journal'] = journal
    if doc_type:
        filters['doc_type'] = doc_type
    
    result = BiblioEntryDB.list_by_library(
        library_id,
        filters=filters if filters else None,
        page=page,
        page_size=page_size
    )
    
    return result


@router.get("/entries/{entry_id}", response_model=BiblioEntry)
async def get_entry(entry_id: str):
    """Get a single entry by ID"""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str):
    """Delete a single entry"""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    library_id = entry['library_id']
    success = BiblioEntryDB.delete(entry_id)
    
    # Update library entry count
    if success:
        BiblioLibraryDB.update_entry_count(library_id)
    
    return {"success": success}


# ==================== Statistics & Filter Options ====================

@router.get("/libraries/{library_id}/statistics", response_model=BiblioStatistics)
async def get_statistics(library_id: str):
    """Get statistics for a library"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    stats = BiblioEntryDB.get_statistics(library_id)
    return stats


@router.get("/libraries/{library_id}/filter-options", response_model=FilterOptions)
async def get_filter_options(library_id: str):
    """Get available filter options for a library"""
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    return {
        "years": BiblioEntryDB.get_unique_values(library_id, "year"),
        "authors": BiblioEntryDB.get_unique_values(library_id, "authors")[:100],
        "institutions": BiblioEntryDB.get_unique_values(library_id, "institutions")[:100],
        "keywords": BiblioEntryDB.get_unique_values(library_id, "keywords")[:200],
        "journals": BiblioEntryDB.get_unique_values(library_id, "journal")[:100],
        "doc_types": BiblioEntryDB.get_unique_values(library_id, "doc_type"),
        "countries": BiblioEntryDB.get_unique_values(library_id, "countries")[:50]
    }


# ==================== Visualization Endpoints ====================

class VisualizationBaseRequest(BaseModel):
    library_id: str
    filters: Optional[BiblioFilter] = None


class NetworkRequest(VisualizationBaseRequest):
    min_weight: int = 1
    max_nodes: int = 100


class ClusterRequest(VisualizationBaseRequest):
    cluster_by: str = "keyword"
    n_clusters: Optional[int] = None


class TimeRequest(VisualizationBaseRequest):
    time_slice: int = 1
    top_n: int = 10


class BurstRequest(VisualizationBaseRequest):
    burst_type: str = "keyword"
    min_frequency: int = 2
    gamma: float = 1.0


def _get_filtered_entries(library_id: str, filters: Optional[BiblioFilter] = None):
    """Helper to get filtered entries for visualization"""
    filter_dict = None
    if filters:
        filter_dict = filters.model_dump(exclude_none=True)
    
    return BiblioEntryDB.get_all_by_library(library_id, filter_dict)


@router.post("/visualization/co-author")
async def get_co_author_network(request: NetworkRequest):
    """Get co-authorship network data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "statistics": {}}
    
    return generate_visualization(
        entries, 'co-author',
        min_weight=request.min_weight,
        max_nodes=request.max_nodes
    )


@router.post("/visualization/co-institution")
async def get_co_institution_network(request: NetworkRequest):
    """Get institutional collaboration network data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "statistics": {}}
    
    return generate_visualization(
        entries, 'co-institution',
        min_weight=request.min_weight,
        max_nodes=request.max_nodes
    )


@router.post("/visualization/co-country")
async def get_co_country_network(request: NetworkRequest):
    """Get international collaboration network data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "statistics": {}}
    
    return generate_visualization(
        entries, 'co-country',
        min_weight=request.min_weight,
        max_nodes=request.max_nodes
    )


@router.post("/visualization/keyword-cooccur")
async def get_keyword_cooccurrence_network(request: NetworkRequest):
    """Get keyword co-occurrence network data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "statistics": {}}
    
    return generate_visualization(
        entries, 'keyword-cooccur',
        min_weight=request.min_weight,
        max_nodes=request.max_nodes
    )


@router.post("/visualization/co-citation")
async def get_co_citation_network(request: NetworkRequest):
    """Get co-citation network data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "statistics": {}}
    
    return generate_visualization(
        entries, 'co-citation',
        min_weight=request.min_weight,
        max_nodes=request.max_nodes
    )


@router.post("/visualization/cluster")
async def get_cluster_view(request: ClusterRequest):
    """Get cluster visualization data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"nodes": [], "edges": [], "clusters": [], "modularity": 0, "silhouette": 0}
    
    return generate_visualization(
        entries, 'cluster',
        cluster_by=request.cluster_by,
        n_clusters=request.n_clusters
    )


@router.post("/visualization/timeline")
async def get_timeline_view(request: TimeRequest):
    """Get timeline visualization data"""
    try:
        entries = _get_filtered_entries(request.library_id, request.filters)
        if not entries:
            return {"nodes": [], "edges": [], "clusters": [], "time_range": {"start": 0, "end": 0}}
        
        result = generate_visualization(
            entries, 'timeline',
            time_slice=request.time_slice,
            top_n=request.top_n
        )
        return result
    except Exception as e:
        print(f"Timeline visualization error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Timeline generation error: {str(e)}")


@router.post("/visualization/timezone")
async def get_timezone_view(request: TimeRequest):
    """Get timezone visualization data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"slices": [], "edges": [], "time_range": {}}
    
    return generate_visualization(
        entries, 'timezone',
        time_slice=request.time_slice
    )


@router.post("/visualization/burst")
async def get_burst_detection(request: BurstRequest):
    """Get burst detection data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"bursts": [], "time_range": {}}
    
    return generate_visualization(
        entries, 'burst',
        burst_type=request.burst_type,
        min_frequency=request.min_frequency,
        gamma=request.gamma
    )


@router.post("/visualization/landscape")
async def get_landscape_view(request: VisualizationBaseRequest):
    """Get landscape (3D terrain) visualization data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"points": [], "clusters": []}
    
    return generate_visualization(entries, 'landscape')


@router.post("/visualization/dual-map")
async def get_dual_map_overlay(request: VisualizationBaseRequest):
    """Get dual-map overlay visualization data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"citing_nodes": [], "cited_nodes": [], "links": []}
    
    return generate_visualization(entries, 'dual-map')

