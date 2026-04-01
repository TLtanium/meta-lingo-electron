"""
Bibliographic Visualization API Routes

Handles CRUD operations for bibliographic libraries and entries,
as well as visualization data generation.
"""

import uuid
from pathlib import Path
from typing import Optional, List, Literal
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from models import (
    BiblioLibraryDB,
    BiblioEntryDB,
    BiblioLibraryCreate,
    BiblioLibraryUpdate,
    BiblioLibrary,
    BiblioEntry,
    BiblioEntryUpdate,
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
from models.database import TextDB, TaskDB, BiblioEntryAbstractsDB, CorpusDB

from services.biblio import (
    parse_refworks_file,
    validate_source_type,
    generate_visualization
)
from services.biblio.wordcloud_service import build_wordcloud

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import CORPORA_DIR, DATA_DIR
from services.biblio.pdf_utils import render_first_page_thumbnail
from services.biblio.entry_ai_service import generate_sections_for_entry

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
    """Create a new bibliographic library (and its shadow corpus for abstract processing)"""
    # Check for duplicate name
    existing = BiblioLibraryDB.get_by_name(request.name)
    if existing:
        raise HTTPException(status_code=400, detail="Library with this name already exists")
    
    library_data = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "source_type": request.source_type.value,
        "description": request.description,
        "language": (request.language or "english").lower()
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

def _sanitize_biblio_filename(filename: str) -> str:
    """Sanitize filename for abstract text (avoid path traversal)"""
    safe = filename.replace(" ", "_")
    for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
        safe = safe.replace(char, '_')
    return safe or "abstract"


@router.post("/libraries/{library_id}/upload")
async def upload_refworks_file(
    library_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Upload and parse a Refworks file into the library.
    Validates format (CNKI/WOS), inserts entries, then for each entry with an abstract
    creates a text in the shadow corpus and runs the same pipeline as corpus plain text
    (SpaCy -> USAS -> MIPVU). MIPVU uses the same hybrid pipeline as corpus management
    (rule + Clause model, pos_group_stats). Returns entry/task mapping for progress polling.
    """
    library = BiblioLibraryDB.get_by_id(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    corpus_id = library.get("corpus_id")
    if not corpus_id:
        raise HTTPException(status_code=500, detail="Library shadow corpus not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=500, detail="Shadow corpus not found")
    
    # Read file content
    try:
        content = await file.read()
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

    MAX_ENTRIES_PER_UPLOAD = 100
    if len(entries) > MAX_ENTRIES_PER_UPLOAD:
        raise HTTPException(
            status_code=400,
            detail=f"REFWORKS_MAX_ENTRIES_100",
        )
    
    for entry in entries:
        entry['library_id'] = library_id
    
    added_count = BiblioEntryDB.create_batch(entries)
    BiblioLibraryDB.update_entry_count(library_id)
    
    # Process abstracts: create text in shadow corpus and run SpaCy/USAS/MIPVU
    from routers.corpus import process_text_spacy_sync, create_progress_queue
    
    corpus_name = corpus['name']
    corpus_dir = CORPORA_DIR / corpus_name
    files_dir = corpus_dir / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    language = library.get('language') or 'english'
    
    entry_tasks = []
    for entry in entries:
        abstract = entry.get('abstract') if isinstance(entry.get('abstract'), str) else None
        if not (abstract and abstract.strip()):
            continue
        entry_id = entry['id']
        safe_name = _sanitize_biblio_filename(entry_id) + ".txt"
        save_path = files_dir / safe_name
        if save_path.exists():
            base = save_path.stem
            idx = 1
            while save_path.exists():
                save_path = files_dir / f"{base}_{idx}.txt"
                idx += 1
        save_path.write_text(abstract.strip(), encoding='utf-8')
        
        text_id = str(uuid.uuid4())
        text_data = {
            'id': text_id,
            'corpus_id': corpus_id,
            'filename': save_path.name,
            'original_filename': save_path.name,
            'content_path': str(save_path),
            'media_type': 'text',
            'tags': [],
            'metadata': {},
            'word_count': len(abstract.split())
        }
        TextDB.create(text_data)
        BiblioEntryAbstractsDB.create(entry_id, text_id)
        
        task_id = str(uuid.uuid4())
        TaskDB.create({
            'id': task_id,
            'corpus_id': corpus_id,
            'text_id': text_id,
            'task_type': 'spacy_annotation',
            'status': 'pending',
            'message': f"SpaCy annotation for abstract..."
        })
        create_progress_queue(task_id)
        background_tasks.add_task(
            process_text_spacy_sync,
            task_id,
            text_id,
            str(save_path),
            str(files_dir),
            language,
            None
        )
        entry_tasks.append({"entry_id": entry_id, "text_id": text_id, "task_id": task_id})
    
    return {
        "success": True,
        "entries_added": added_count,
        "entries_skipped": len(entries) - added_count,
        "errors": parse_errors[:10],
        "entry_tasks": entry_tasks
    }


# ==================== Entry Management ====================

@router.get("/libraries/{library_id}/entries")
async def list_entries(
    library_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    year_start: Optional[int] = None,
    year_end: Optional[int] = None,
    author: Optional[str] = None,
    institution: Optional[str] = None,
    keyword: Optional[str] = None,
    journal: Optional[str] = None,
    doc_type: Optional[str] = None,
    title_search: Optional[str] = None,
    order_by: Optional[str] = Query(None, description="Sort column: title, year, journal, citation_count, relevance"),
    order_dir: Optional[str] = Query(None, description="Sort direction: asc, desc"),
    include_status: bool = Query(True, description="Include text_id and task status per entry")
):
    """Get entries in a library with optional filters. When include_status=True, each entry includes text_id, task_id, task_status, progress for abstract processing."""
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
    if title_search:
        filters['title_search'] = title_search
    
    result = BiblioEntryDB.list_by_library(
        library_id,
        filters=filters if filters else None,
        page=page,
        page_size=page_size,
        order_by=order_by,
        order_dir=order_dir
    )
    
    if include_status and result['entries']:
        entry_ids = [e['id'] for e in result['entries']]
        from models.database import get_db_readonly
        text_ids = {}
        with get_db_readonly() as conn:
            cursor = conn.cursor()
            for eid in entry_ids:
                cursor.execute("SELECT text_id FROM biblio_entry_abstracts WHERE entry_id = ?", (eid,))
                row = cursor.fetchone()
                if row:
                    text_ids[eid] = row[0]
        text_id_list = list(text_ids.values())
        tasks_by_text = {}
        if text_id_list:
            with get_db_readonly() as conn:
                cursor = conn.cursor()
                for tid in text_id_list:
                    cursor.execute(
                        """SELECT id, status, progress, message FROM processing_tasks 
                           WHERE text_id = ? ORDER BY created_at DESC LIMIT 1""",
                        (tid,)
                    )
                    row = cursor.fetchone()
                    if row:
                        tasks_by_text[tid] = {"task_id": row[0], "status": row[1], "progress": row[2] or 0, "message": row[3]}
        for entry in result['entries']:
            entry['text_id'] = text_ids.get(entry['id'])
            if entry.get('text_id'):
                t = tasks_by_text.get(entry['text_id'], {})
                entry['task_id'] = t.get('task_id')
                entry['task_status'] = t.get('status')
                entry['task_progress'] = t.get('progress', 0)
                entry['task_message'] = t.get('message')
            else:
                entry['task_id'] = None
                entry['task_status'] = None
                entry['task_progress'] = None
                entry['task_message'] = None
    
    if include_status:
        # Total count of entries (with same filters) still being processed (SpaCy/USAS/MIPVU)
        result['processing_count'] = BiblioEntryDB.count_processing_entries(
            library_id, filters if filters else None
        )
    
    return result


@router.get("/entries/{entry_id}", response_model=BiblioEntry)
async def get_entry(entry_id: str):
    """Get a single entry by ID"""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


def _biblio_pdf_dirs(library_id: str, entry_id: str):
    """Return (pdf_dir, thumb_dir, pdf_path, thumb_path) under DATA_DIR/biblio/{library_id}/."""
    base = DATA_DIR / "biblio" / library_id
    pdf_dir = base / "pdfs"
    thumb_dir = base / "thumbnails"
    pdf_path = pdf_dir / f"{entry_id}.pdf"
    thumb_path = thumb_dir / f"{entry_id}.png"
    return pdf_dir, thumb_dir, pdf_path, thumb_path


@router.post("/entries/{entry_id}/upload-pdf")
async def upload_entry_pdf(entry_id: str, file: UploadFile = File(...)):
    """Upload a PDF for a bibliographic entry. Saves file and generates first-page thumbnail."""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    library_id = entry["library_id"]
    pdf_dir, thumb_dir, pdf_path, thumb_path = _biblio_pdf_dirs(library_id, entry_id)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    try:
        pdf_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save PDF: {e}")
    thumb_ok = render_first_page_thumbnail(pdf_path, thumb_path)
    # Store paths relative to DATA_DIR so they work when DATA_DIR changes (e.g. packaged)
    rel_pdf = str(Path("biblio") / library_id / "pdfs" / f"{entry_id}.pdf")
    rel_thumb = str(Path("biblio") / library_id / "thumbnails" / f"{entry_id}.png") if thumb_ok else None
    BiblioEntryDB.update(entry_id, {"pdf_path": rel_pdf, "pdf_thumbnail_path": rel_thumb})
    return {"success": True, "pdf_path": rel_pdf, "thumbnail_path": rel_thumb}


@router.get("/entries/{entry_id}/thumbnail")
async def get_entry_thumbnail(entry_id: str):
    """Return the first-page thumbnail image for an entry's PDF. Generates on-the-fly if missing."""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    pdf_rel = entry.get("pdf_path")
    thumb_rel = entry.get("pdf_thumbnail_path")
    library_id = entry.get("library_id")
    if not library_id or not pdf_rel:
        raise HTTPException(status_code=404, detail="No PDF for this entry")
    _, _, pdf_path, thumb_path = _biblio_pdf_dirs(library_id, entry_id)
    pdf_exists = pdf_path.exists()
    thumb_exists = thumb_path.exists()
    if not pdf_exists:
        raise HTTPException(status_code=404, detail="PDF file not found")
    # If thumbnail missing or file gone, generate from PDF and persist
    if not thumb_rel or not thumb_exists:
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        gen_ok = render_first_page_thumbnail(pdf_path, thumb_path)
        if gen_ok:
            rel_thumb = str(Path("biblio") / library_id / "thumbnails" / f"{entry_id}.png")
            BiblioEntryDB.update(entry_id, {"pdf_thumbnail_path": rel_thumb})
        else:
            raise HTTPException(status_code=503, detail="Thumbnail generation failed")
    return FileResponse(thumb_path, media_type="image/png")


def _delete_entry_pdf_files(library_id: str, entry_id: str) -> None:
    """Remove PDF and thumbnail files for an entry if they exist (best-effort)."""
    _, _, pdf_path, thumb_path = _biblio_pdf_dirs(library_id, entry_id)
    for p in (pdf_path, thumb_path):
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass  # Non-fatal; file may already be removed or inaccessible


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str):
    """Delete a single entry and its associated PDF / thumbnail files."""
    entry = BiblioEntryDB.get_by_id(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    library_id = entry['library_id']
    # Remove PDF and thumbnail before deleting the DB record
    _delete_entry_pdf_files(library_id, entry_id)
    success = BiblioEntryDB.delete(entry_id)

    # Update library entry count
    if success:
        BiblioLibraryDB.update_entry_count(library_id)

    return {"success": success}


class BatchDeleteRequest(BaseModel):
    """Request body for batch delete"""
    entry_ids: List[str]


class AiGenerateRequest(BaseModel):
    """Request body for AI-generated entry sections"""
    entry_ids: List[str]
    language: str  # "zh" | "en"
    ollama_url: Optional[str] = None
    ollama_model: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    use_openai_first: bool = True  # If True and OpenAI config present, use API first; else Ollama


@router.post("/entries/ai-generate")
async def ai_generate_entries(request: AiGenerateRequest):
    """Generate the 11 AI sections for each entry. Uses OpenAI-compatible API if configured and use_openai_first, else Ollama."""
    use_openai = request.use_openai_first and bool(
        (request.openai_base_url or "").strip() and ((request.openai_api_key or "").strip() or (request.openai_base_url or "").strip())
    )
    results = []
    for entry_id in request.entry_ids:
        try:
            ai_sections = await generate_sections_for_entry(
                entry_id,
                request.language,
                data_dir=DATA_DIR,
                use_openai=use_openai,
                openai_base_url=(request.openai_base_url or "").strip() or None,
                openai_api_key=(request.openai_api_key or "").strip() or None,
                openai_model=(request.openai_model or "").strip() or None,
                ollama_url=(request.ollama_url or "").strip() or None,
                ollama_model=(request.ollama_model or "").strip() or None,
                get_entry_fn=BiblioEntryDB.get_by_id,
                update_entry_fn=lambda eid, data: BiblioEntryDB.update(eid, data),
            )
            results.append({"entry_id": entry_id, "success": True, "ai_sections": ai_sections})
        except Exception as e:
            results.append({"entry_id": entry_id, "success": False, "error": str(e)})
    return {"results": results}


class EntriesByIdsRequest(BaseModel):
    """Request body for fetching entries by IDs"""
    entry_ids: List[str]


@router.post("/entries/by-ids")
async def get_entries_by_ids(request: EntriesByIdsRequest):
    """Get full entry data for a list of entry IDs. Returns entries in the same order as requested."""
    if not request.entry_ids:
        return {"entries": []}
    entries = BiblioEntryDB.get_by_ids(request.entry_ids)
    return {"entries": entries}


@router.patch("/entries/{entry_id}", response_model=BiblioEntry)
async def update_entry(entry_id: str, request: BiblioEntryUpdate):
    """Update relevance, tags, and/or notes for an entry"""
    existing = BiblioEntryDB.get_by_id(entry_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    payload = request.model_dump(exclude_unset=True)
    updated = BiblioEntryDB.update(entry_id, payload)
    return updated


@router.post("/entries/batch-delete")
async def batch_delete_entries(request: BatchDeleteRequest):
    """Delete multiple entries by ID (with PDF / thumbnail cleanup). Returns number deleted."""
    if not request.entry_ids:
        return {"deleted": 0}
    # Collect library_ids and clean up PDF files before deleting DB records
    library_ids = set()
    for eid in request.entry_ids:
        entry = BiblioEntryDB.get_by_id(eid)
        if entry:
            library_ids.add(entry['library_id'])
            _delete_entry_pdf_files(entry['library_id'], eid)
    deleted = BiblioEntryDB.delete_batch(request.entry_ids)
    for library_id in library_ids:
        BiblioLibraryDB.update_entry_count(library_id)
    return {"deleted": deleted}


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


class WordCloudRequest(VisualizationBaseRequest):
    source: Literal["title", "abstract"] = "abstract"
    max_words: int = 100


class HeatmapRequest(VisualizationBaseRequest):
    bandwidth: Optional[float] = None
    grid_size: int = 50


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


@router.post("/visualization/wordcloud")
async def get_wordcloud_visualization(request: WordCloudRequest):
    """Get word cloud (word frequency) data from title or abstract of filtered entries"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"words": []}
    words = build_wordcloud(
        entries,
        source=request.source,
        max_words=request.max_words,
    )
    return {"words": words}


@router.post("/visualization/heatmap")
async def get_heatmap_view(request: HeatmapRequest):
    """Get heatmap (2D density) visualization data"""
    entries = _get_filtered_entries(request.library_id, request.filters)
    if not entries:
        return {"points": [], "clusters": [], "time_range": {"start": 0, "end": 0}, "density_grid": {"x": [], "y": [], "z": []}}

    return generate_visualization(
        entries, 'heatmap',
        bandwidth=request.bandwidth,
        grid_size=request.grid_size
    )

