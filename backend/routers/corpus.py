"""
Corpus Management API Router
Full multimodal corpus management with file upload, transcription, and YOLO
Supports SSE (Server-Sent Events) for real-time progress updates
"""

import os
import sys
import uuid
import json
import asyncio
import logging
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Import paths from config module
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DATA_DIR, SAVES_DIR, CORPORA_DIR, SETTINGS_DIR, TOPIC_MODELING_DIR, WORD2VEC_DIR, ANNOTATIONS_DIR

from models.database import CorpusDB, TextDB, TagDB, TaskDB
from models.corpus import (
    MediaType, TaskStatus, TaskType,
    CorpusCreate, CorpusUpdate, Corpus, CorpusMetadata,
    TextMetadata, TextUpdate, CorpusText,
    UploadConfig, UploadResult,
    TranscriptData, YoloResult,
    CorpusListResponse, CorpusDetailResponse,
    TextListResponse, TextDetailResponse,
    UploadResponse, TaskResponse, TagListResponse
)
from services.corpus_service import get_corpus_service

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== Progress Queue Management ====================

# Use queue.Queue (thread-safe) instead of asyncio.Queue
from queue import Queue, Empty
import time

# Global dict to store progress queues for each task
_progress_queues: Dict[str, Queue] = {}
_progress_lock = threading.Lock()


def create_progress_queue(task_id: str) -> Queue:
    """Create a progress queue for a task (thread-safe)"""
    with _progress_lock:
        queue = Queue()
        _progress_queues[task_id] = queue
        logger.info(f"Created progress queue for task: {task_id}")
        return queue


def get_progress_queue(task_id: str) -> Optional[Queue]:
    """Get progress queue for a task"""
    with _progress_lock:
        return _progress_queues.get(task_id)


def remove_progress_queue(task_id: str):
    """Remove progress queue after task completion"""
    with _progress_lock:
        if task_id in _progress_queues:
            del _progress_queues[task_id]
            logger.info(f"Removed progress queue for task: {task_id}")


def send_progress_sync(task_id: str, stage: str, progress: int, message: str, 
                       status: str = "processing", result: Dict = None):
    """Send progress update to queue (synchronous, thread-safe)"""
    event = {
        "task_id": task_id,
        "stage": stage,
        "progress": progress,
        "message": message,
        "status": status,
        "result": result
    }
    
    logger.info(f"Progress: {task_id} - {stage} {progress}% - {message}")
    
    # Update database first (always works - this is the primary data store)
    TaskDB.update(task_id, {
        "progress": progress,
        "message": f"{stage}: {message}",
        "status": status,
        "result": result
    })
    
    # Try to put event in queue for SSE streaming
    queue = get_progress_queue(task_id)
    if queue:
        try:
            queue.put(event, block=False)  # Non-blocking put
            logger.debug(f"Queued event for {task_id}")
        except Exception as e:
            logger.warning(f"Could not put event in queue: {e}")


async def send_progress(task_id: str, stage: str, progress: int, message: str, 
                       status: str = "processing", result: Dict = None):
    """Send progress update - just calls the sync version"""
    # Use the sync version which handles thread-safe queue
    send_progress_sync(task_id, stage, progress, message, status, result)


# ==================== Service Status (MUST BE BEFORE /{corpus_id}) ====================

@router.get("/services/status")
async def get_services_status():
    """Get status of ML services (Whisper, YOLO, CLIP)"""
    logger.info("=== GET /services/status called ===")
    
    try:
        from services.whisper_service import get_whisper_service
        from services.yolo_service import get_yolo_service
        from services.clip_service import get_clip_service
        
        whisper = get_whisper_service()
        yolo = get_yolo_service()
        clip = get_clip_service()
        
        result = {
            "success": True,
            "data": {
                "whisper": {
                    "available": whisper.is_available(),
                    "model_path": whisper.model_path
                },
                "yolo": {
                    "available": yolo.is_available(),
                    "model_path": yolo.model_path
                },
                "clip": {
                    "available": clip.is_available(),
                    "model_path": clip.model_path
                }
            }
        }
        logger.info(f"=== /services/status response: {result} ===")
        return result
    except Exception as e:
        logger.error(f"=== /services/status error: {e} ===")
        raise


@router.get("/tags/all")
async def get_all_tags():
    """Get all tags across all corpora"""
    logger.info("=== GET /tags/all called ===")
    try:
        service = get_corpus_service()
        tags = service.list_all_tags()
        logger.info(f"=== /tags/all returning {len(tags)} tags ===")
        return {
            "success": True,
            "data": tags
        }
    except Exception as e:
        logger.error(f"=== /tags/all error: {e} ===")
        raise


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get processing task status"""
    logger.info(f"=== GET /tasks/{task_id} called ===")
    task = TaskDB.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "success": True,
        "data": task
    }


# ==================== SSE Progress Streaming ====================

@router.get("/progress/{task_id}")
async def stream_progress(task_id: str):
    """
    Stream processing progress via Server-Sent Events (SSE)
    
    Client should connect with EventSource:
    const es = new EventSource('/api/corpus/progress/{task_id}')
    es.onmessage = (e) => { const data = JSON.parse(e.data); ... }
    """
    logger.info(f"=== SSE /progress/{task_id} connected ===")
    
    # Check if task exists
    task = TaskDB.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # If task already completed, return final status immediately
    if task.get('status') in ['completed', 'failed']:
        async def completed_generator():
            yield f"data: {json.dumps({'task_id': task_id, 'stage': 'done', 'progress': 100, 'message': task.get('message', 'Completed'), 'status': task.get('status'), 'result': task.get('result')})}\n\n"
        return StreamingResponse(
            completed_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    
    # Get or create queue for this task
    queue = get_progress_queue(task_id)
    if not queue:
        # Task might have completed before we connected, check status
        task = TaskDB.get_by_id(task_id)
        if task and task.get('status') in ['completed', 'failed']:
            async def late_generator():
                yield f"data: {json.dumps({'task_id': task_id, 'stage': 'done', 'progress': 100, 'message': task.get('message', 'Completed'), 'status': task.get('status'), 'result': task.get('result')})}\n\n"
            return StreamingResponse(
                late_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        # Create queue if task is still pending
        queue = create_progress_queue(task_id)
    
    async def event_generator():
        try:
            last_check = time.time()
            while True:
                try:
                    # Non-blocking get from thread-safe queue
                    event = queue.get(block=True, timeout=1.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    
                    # Stop if task completed or failed
                    if event.get("status") in ["completed", "failed"]:
                        logger.info(f"SSE: Task {task_id} {event.get('status')}")
                        break
                except Empty:
                    # Queue is empty, check if we should send heartbeat
                    current_time = time.time()
                    if current_time - last_check >= 5.0:  # Every 5 seconds
                        last_check = current_time
                        
                        # Check if task completed in database
                        task = TaskDB.get_by_id(task_id)
                        if task:
                            db_status = task.get('status')
                            if db_status in ['completed', 'failed']:
                                final_event = {
                                    'task_id': task_id,
                                    'stage': 'completed' if db_status == 'completed' else 'error',
                                    'progress': task.get('progress', 100),
                                    'message': task.get('message', 'Completed'),
                                    'status': db_status,
                                    'result': task.get('result')
                                }
                                yield f"data: {json.dumps(final_event)}\n\n"
                                logger.info(f"SSE: Task {task_id} completed from DB")
                                break
                            else:
                                # Send current progress from DB as heartbeat
                                heartbeat = {
                                    'task_id': task_id,
                                    'stage': task.get('message', 'processing').split(':')[0] if ':' in str(task.get('message', '')) else 'processing',
                                    'progress': task.get('progress', 0),
                                    'message': task.get('message', 'Processing...'),
                                    'status': 'processing'
                                }
                                yield f"data: {json.dumps(heartbeat)}\n\n"
                    
                    # Yield control to event loop
                    await asyncio.sleep(0.1)
                    
        except Exception as e:
            logger.error(f"SSE event_generator error: {e}")
        finally:
            remove_progress_queue(task_id)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ==================== SpaCy Batch Annotation ====================

@router.post("/spacy/batch/{corpus_id}")
async def batch_spacy_annotate(corpus_id: str, data: dict = None, background_tasks: BackgroundTasks = None):
    """
    Batch annotate all texts in a corpus with SpaCy (async)
    
    Args:
        corpus_id: Corpus ID
        data: Optional dict with 'force' key to re-annotate existing
    """
    from models.database import TaskDB, CorpusDB, TextDB
    
    logger.info(f"=== POST /spacy/batch/{corpus_id} called ===")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    force = (data or {}).get("force", False)
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "task_type": "spacy_batch",
        "status": "pending",
        "message": "Starting batch SpaCy annotation..."
    })
    
    create_progress_queue(task_id)
    
    # Run batch annotation in background
    def run_batch_annotation():
        try:
            send_progress_sync(task_id, "initializing", 5, "Loading SpaCy model...")
            
            service = get_corpus_service()
            texts = TextDB.list_by_corpus(corpus_id)
            
            if not texts:
                send_progress_sync(task_id, "completed", 100, "No texts to annotate", 
                                  status="completed", result={"annotated": 0, "total": 0})
                return
            
            # Filter to text-type entries only
            text_entries = [t for t in texts if t.get('media_type') == 'text']
            total = len(text_entries)
            
            if total == 0:
                send_progress_sync(task_id, "completed", 100, "No text files to annotate", 
                                  status="completed", result={"annotated": 0, "total": 0})
                return
            
            send_progress_sync(task_id, "spacy", 10, f"Processing {total} texts...")
            
            annotated = 0
            skipped = 0
            failed = 0
            
            for i, text in enumerate(text_entries):
                text_id = text.get('id')
                filename = text.get('filename', 'unknown')
                
                progress = 10 + int((i / total) * 85)
                send_progress_sync(task_id, "spacy", progress, f"Annotating {filename} ({i+1}/{total})...")
                
                result = service.annotate_single_text(corpus_id, text_id, force=force)
                
                if result.get("success"):
                    if result.get("data", {}).get("status") == "skipped":
                        skipped += 1
                    else:
                        annotated += 1
                else:
                    failed += 1
                    logger.warning(f"Failed to annotate {filename}: {result.get('error')}")
            
            send_progress_sync(task_id, "completed", 100, 
                              f"Batch annotation completed: {annotated} annotated, {skipped} skipped, {failed} failed",
                              status="completed",
                              result={"annotated": annotated, "skipped": skipped, "failed": failed, "total": total})
            
        except Exception as e:
            logger.error(f"SpaCy batch annotation error: {e}")
            import traceback
            traceback.print_exc()
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_batch_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "Batch SpaCy annotation started"
    }


@router.post("/spacy/single/{corpus_id}/{text_id}")
async def single_spacy_annotate(corpus_id: str, text_id: str, data: dict = None):
    """
    Annotate a single text with SpaCy
    
    Args:
        corpus_id: Corpus ID
        text_id: Text ID
        data: Optional dict with 'force' key to re-annotate existing
    """
    logger.info(f"=== POST /spacy/single/{corpus_id}/{text_id} called ===")
    try:
        service = get_corpus_service()
        force = (data or {}).get("force", False)
        result = service.annotate_single_text(corpus_id, text_id, force=force)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== SpaCy single annotation error: {e} ===")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{corpus_id}/texts/{text_id}/reannotate-spacy")
async def reannotate_spacy(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks,
    data: dict = None
):
    """
    Re-run SpaCy annotation on a single text (async - returns task_id)
    
    Args:
        corpus_id: Corpus ID
        text_id: Text ID
        data: Optional dict with 'force' key to re-annotate existing
    """
    from models.database import TextDB, CorpusDB, TaskDB
    
    logger.info(f"=== POST /{corpus_id}/texts/{text_id}/reannotate-spacy called ===")
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    force = (data or {}).get("force", True)
    language = corpus.get('language', 'english')
    media_type = text.get('media_type', 'text')
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "spacy_reannotate",
        "status": "pending",
        "message": f"Re-annotating with SpaCy..."
    })
    
    # Create progress queue
    create_progress_queue(task_id)
    
    # Run SpaCy annotation in background
    def run_spacy_annotation():
        try:
            send_progress_sync(task_id, "spacy", 10, "Loading SpaCy service...")
            
            from services.spacy_service import get_spacy_service
            from services.usas_service import get_usas_service
            
            spacy_svc = get_spacy_service()
            
            if not spacy_svc.is_available(language):
                send_progress_sync(task_id, "error", 0, f"SpaCy model not available for {language}", status="failed")
                return
            
            if media_type == 'text':
                # Text file - re-annotate the content
                content_path = text.get('content_path')
                if not content_path or not os.path.exists(content_path):
                    send_progress_sync(task_id, "error", 0, "Content file not found", status="failed")
                    return
                
                send_progress_sync(task_id, "spacy", 20, "Reading content...")
                
                with open(content_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                total_chars = len(content)
                
                # Process entire document (chunking disabled to avoid hanging issues)
                send_progress_sync(task_id, "spacy", 30, f"Running SpaCy annotation ({total_chars:,} chars)...")
                result = spacy_svc.annotate_text(content, language)
                
                if result.get("success"):
                    send_progress_sync(task_id, "spacy", 45, "Saving SpaCy annotation...")
                    
                    # Save SpaCy annotation
                    base_name = Path(content_path).stem
                    output_dir = Path(content_path).parent
                    spacy_path = output_dir / f"{base_name}.spacy.json"
                    
                    with open(spacy_path, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    
                    # Also run USAS annotation (50-80%)
                    send_progress_sync(task_id, "usas", 50, "Starting USAS annotation...")
                    
                    usas_svc = get_usas_service()
                    if usas_svc.is_available(language):
                        text_type = corpus.get('text_type')
                        
                        # Progress callback for USAS (50-80%)
                        def usas_progress_callback(progress, message):
                            overall_progress = 50 + int(progress * 0.30)
                            send_progress_sync(task_id, "usas", overall_progress, message)
                        
                        usas_result = usas_svc.annotate_text(content, language, text_type, usas_progress_callback)
                        
                        if usas_result.get("success"):
                            usas_path = output_dir / f"{base_name}.usas.json"
                            with open(usas_path, 'w', encoding='utf-8') as f:
                                json.dump(usas_result, f, ensure_ascii=False, indent=2)
                            send_progress_sync(task_id, "usas", 80, "USAS annotation completed")
                    else:
                        send_progress_sync(task_id, "usas", 80, "USAS not available for this language, skipping...")
                    
                    # Also run MIPVU annotation (80-100%, only for English)
                    send_progress_sync(task_id, "mipvu", 85, "Starting MIPVU annotation...")
                    
                    from services.mipvu_service import get_mipvu_service
                    mipvu_svc = get_mipvu_service()
                    
                    if mipvu_svc.is_available(language):
                        mipvu_result = mipvu_svc.annotate_text(content, language, result)
                        
                        if mipvu_result.get("success"):
                            mipvu_path = output_dir / f"{base_name}.mipvu.json"
                            with open(mipvu_path, 'w', encoding='utf-8') as f:
                                json.dump(mipvu_result, f, ensure_ascii=False, indent=2)
                            send_progress_sync(task_id, "mipvu", 95, "MIPVU annotation completed")
                        else:
                            # Log MIPVU failure details
                            mipvu_error = mipvu_result.get("error", "Unknown error")
                            logger.warning(f"MIPVU annotation failed during re-annotation: {mipvu_error}")
                            send_progress_sync(task_id, "mipvu", 95, f"MIPVU failed: {mipvu_error}")
                    else:
                        send_progress_sync(task_id, "mipvu", 95, "MIPVU not available for this language, skipping...")
                    
                    token_count = len(result.get("tokens", []))
                    entity_count = len(result.get("entities", []))
                    send_progress_sync(task_id, "completed", 100, 
                                      f"Full annotation completed: {token_count} tokens, {entity_count} entities",
                                      status="completed",
                                      result={"tokens": token_count, "entities": entity_count})
                else:
                    send_progress_sync(task_id, "error", 0, 
                                      result.get("error", "SpaCy annotation failed"), 
                                      status="failed")
            
            else:
                # Audio/Video - re-annotate the transcript with SpaCy + USAS + MIPVU
                transcript_path = text.get('transcript_json_path')
                if not transcript_path or not os.path.exists(transcript_path):
                    send_progress_sync(task_id, "error", 0, "Transcript file not found", status="failed")
                    return
                
                send_progress_sync(task_id, "spacy", 15, "Reading transcript...")
                
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcript_data = json.load(f)
                
                segments = transcript_data.get('segments', [])
                if not segments:
                    send_progress_sync(task_id, "error", 0, "No transcript segments found", status="failed")
                    return
                
                # SpaCy annotation (15-45%)
                send_progress_sync(task_id, "spacy", 20, f"Running SpaCy annotation ({len(segments)} segments)...")
                
                spacy_result = spacy_svc.annotate_segments(segments, language)
                
                if spacy_result.get("success"):
                    chunk_info = spacy_result.get("chunk_info", {})
                    if chunk_info:
                        chunk_msg = f" ({chunk_info.get('successful_chunks', 0)}/{chunk_info.get('total_chunks', 0)} chunks)"
                    else:
                        chunk_msg = ""
                    
                    send_progress_sync(task_id, "spacy", 45, f"SpaCy completed{chunk_msg}")
                    
                    # Update transcript with SpaCy annotations
                    transcript_data['spacy_annotations'] = spacy_result
                    
                    # USAS annotation (45-70%, only for Chinese and English)
                    send_progress_sync(task_id, "usas", 45, "Starting USAS annotation...")
                    
                    usas_svc = get_usas_service()
                    if usas_svc.is_available(language):
                        text_type = corpus.get('text_type') if corpus else None
                        
                        usas_result = usas_svc.annotate_segments(segments, language, text_type)
                        if usas_result.get("success"):
                            transcript_data['usas_annotations'] = usas_result
                            send_progress_sync(task_id, "usas", 70, "USAS annotation completed")
                    else:
                        send_progress_sync(task_id, "usas", 70, "USAS not available for this language, skipping...")
                    
                    # MIPVU annotation (70-95%, only for English)
                    send_progress_sync(task_id, "mipvu", 70, "Starting MIPVU annotation...")
                    
                    from services.mipvu_service import get_mipvu_service
                    mipvu_svc = get_mipvu_service()
                    
                    if mipvu_svc.is_available(language):
                        def media_mipvu_progress_callback(progress, message):
                            overall_progress = 70 + int(progress * 0.25)
                            send_progress_sync(task_id, "mipvu", overall_progress, message)
                        
                        # Merge SpaCy data into segments for MIPVU
                        spacy_segments = spacy_result.get('segments', {})
                        segments_with_spacy = []
                        for seg in segments:
                            seg_id = seg.get('id', 0)
                            seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                            # Convert SpaCy segment format to MIPVU expected format
                            spacy_data = None
                            if seg_spacy and seg_spacy.get('tokens'):
                                spacy_data = {
                                    'sentences': [{
                                        'tokens': [
                                            {
                                                'word': t.get('text', ''),
                                                'lemma': t.get('lemma', ''),
                                                'pos': t.get('pos', ''),
                                                'tag': t.get('tag', ''),
                                                'dep': t.get('dep', '')
                                            } for t in seg_spacy.get('tokens', [])
                                        ]
                                    }]
                                }
                            segments_with_spacy.append({**seg, 'spacy_data': spacy_data})
                        
                        mipvu_result = mipvu_svc.annotate_segments(segments_with_spacy, language, media_mipvu_progress_callback)
                        if mipvu_result:
                            transcript_data['mipvu_annotations'] = {"success": True, "segments": mipvu_result}
                            send_progress_sync(task_id, "mipvu", 95, "MIPVU annotation completed")
                        else:
                            logger.warning("MIPVU annotation returned empty result during re-annotation")
                            send_progress_sync(task_id, "mipvu", 95, "MIPVU returned empty result")
                    else:
                        send_progress_sync(task_id, "mipvu", 95, "MIPVU not available for this language, skipping...")
                    
                    # Save all annotations to transcript JSON
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    
                    token_count = spacy_result.get("total_tokens", 0)
                    send_progress_sync(task_id, "completed", 100, 
                                      f"Full annotation completed: {token_count} tokens",
                                      status="completed",
                                      result={"tokens": token_count, "segments": len(spacy_result.get("segments", {}))})
                else:
                    send_progress_sync(task_id, "error", 0, 
                                      spacy_result.get("error", "SpaCy annotation failed"), 
                                      status="failed")
        
        except Exception as e:
            logger.error(f"SpaCy re-annotation error: {e}")
            import traceback
            traceback.print_exc()
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_spacy_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "SpaCy re-annotation started"
    }


@router.post("/{corpus_id}/texts/{text_id}/reannotate-alignment")
async def reannotate_alignment(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks
):
    """
    Re-run Wav2Vec2 alignment and TorchCrepe pitch extraction on an English audio file.
    This is useful for audio files uploaded before the alignment feature was added.
    Note: Only available for audio files (not video) with English language.
    """
    from models.database import TextDB, CorpusDB, TaskDB
    
    logger.info(f"=== POST /{corpus_id}/texts/{text_id}/reannotate-alignment called ===")
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    media_type = text.get('media_type', 'text')
    if media_type != 'audio':
        raise HTTPException(status_code=400, detail="Alignment and pitch extraction only available for audio files (not video)")
    
    language = corpus.get('language', 'english')
    if language.lower() not in ['en', 'english']:
        raise HTTPException(status_code=400, detail="Alignment and pitch extraction only available for English audio")
    
    transcript_json_path = text.get('transcript_json_path')
    if not transcript_json_path or not os.path.exists(transcript_json_path):
        raise HTTPException(status_code=400, detail="Transcript JSON not found")
    
    # Get audio path
    media_path = text.get('media_path') or text.get('audio_path')
    if not media_path or not os.path.exists(media_path):
        raise HTTPException(status_code=400, detail="Audio file not found")
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "alignment_reannotate",
        "status": "pending",
        "message": "Re-annotating alignment and pitch..."
    })
    
    create_progress_queue(task_id)
    
    def run_alignment():
        try:
            send_progress_sync(task_id, "alignment", 5, "Loading transcript...")
            
            # Load transcript
            with open(transcript_json_path, 'r', encoding='utf-8') as f:
                transcript_data = json.load(f)
            
            full_text = transcript_data.get('full_text', '')
            if not full_text:
                send_progress_sync(task_id, "error", 0, "No transcript text found", status="failed")
                return
            
            # Run Wav2Vec2 alignment
            send_progress_sync(task_id, "alignment", 10, "Loading Wav2Vec2 model...")
            
            from services.alignment_service import get_alignment_service
            alignment_svc = get_alignment_service()
            
            send_progress_sync(task_id, "alignment", 20, "Performing forced alignment...")
            
            def alignment_progress(pct, msg):
                overall_pct = 20 + int(pct * 0.30)
                send_progress_sync(task_id, "alignment", overall_pct, msg)
            
            alignment_result = alignment_svc.align_audio(media_path, full_text, alignment_progress)
            
            alignment_success = False
            if alignment_result.get("success"):
                word_alignments = alignment_result.get("word_alignments", [])
                if word_alignments and len(word_alignments) > 0:
                    transcript_data["alignment"] = {
                        "enabled": True,
                        "word_alignments": word_alignments,
                        "char_alignments": alignment_result.get("char_alignments", [])
                    }
                    alignment_success = True
                    logger.info(f"Alignment complete: {len(word_alignments)} words")
                    send_progress_sync(task_id, "alignment", 50, f"Aligned {len(word_alignments)} words")
                else:
                    transcript_data["alignment"] = {"enabled": False, "error": "No word alignments generated"}
                    logger.warning("Alignment returned success but no word alignments")
                    send_progress_sync(task_id, "alignment", 50, "Alignment failed: no words aligned")
            else:
                transcript_data["alignment"] = {"enabled": False, "error": alignment_result.get("error")}
                logger.warning(f"Alignment failed: {alignment_result.get('error')}")
                send_progress_sync(task_id, "alignment", 50, f"Alignment failed: {alignment_result.get('error')}")
            
            # Run TorchCrepe pitch extraction
            send_progress_sync(task_id, "pitch", 55, "Loading TorchCrepe model...")
            
            from services.pitch_service import get_pitch_service
            pitch_svc = get_pitch_service()
            
            send_progress_sync(task_id, "pitch", 60, "Extracting pitch (F0)...")
            
            def pitch_progress(pct, msg):
                overall_pct = 60 + int(pct * 0.35)
                send_progress_sync(task_id, "pitch", overall_pct, msg)
            
            pitch_result = pitch_svc.extract_pitch(media_path, progress_callback=pitch_progress)
            
            if pitch_result.get("success"):
                transcript_data["pitch"] = {
                    "enabled": True,
                    "hop_length_ms": pitch_result.get("hop_length_ms", 10.0),
                    "sample_rate": pitch_result.get("sample_rate", 16000),
                    "fmin": pitch_result.get("fmin", 50.0),
                    "fmax": pitch_result.get("fmax", 550.0),
                    "f0": pitch_result.get("f0", []),
                    "periodicity": pitch_result.get("periodicity", []),
                    "times": pitch_result.get("times", [])
                }
                logger.info(f"Pitch extraction complete: {len(pitch_result.get('f0', []))} frames")
                send_progress_sync(task_id, "pitch", 95, f"Extracted {len(pitch_result.get('f0', []))} pitch frames")
            else:
                transcript_data["pitch"] = {"enabled": False, "error": pitch_result.get("error")}
                logger.warning(f"Pitch extraction failed: {pitch_result.get('error')}")
                send_progress_sync(task_id, "pitch", 95, f"Pitch extraction failed: {pitch_result.get('error')}")
            
            # Save updated transcript
            with open(transcript_json_path, 'w', encoding='utf-8') as f:
                json.dump(transcript_data, f, ensure_ascii=False, indent=2)
            
            # Only mark as completed if alignment succeeded
            if alignment_success:
                send_progress_sync(task_id, "completed", 100, "Alignment and pitch extraction completed", status="completed")
            else:
                send_progress_sync(task_id, "error", 100, "Alignment failed - check logs for details", status="failed")
            
        except Exception as e:
            logger.error(f"Alignment re-annotation error: {e}")
            import traceback
            traceback.print_exc()
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_alignment)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "Alignment re-annotation started"
    }


@router.post("/factory-reset")
async def factory_reset(data: dict):
    """
    Factory reset - delete all data and restore to factory defaults
    
    Options:
    - resetDatabase: Clear all database tables (includes bibliographic data)
    - resetCorpora: Delete all corpus files
    - resetAnnotations: Delete all annotation archives
    - resetTopicModeling: Delete topic modeling embeddings and results
    - resetWord2Vec: Delete Word2Vec models
    - resetUSAS: Reset USAS settings to defaults
    """
    logger.info(f"=== POST /factory-reset called with options: {data} ===")
    
    reset_database = data.get("resetDatabase", True)
    reset_corpora = data.get("resetCorpora", True)
    reset_annotations = data.get("resetAnnotations", True)
    reset_topic_modeling = data.get("resetTopicModeling", True)
    reset_word2vec = data.get("resetWord2Vec", True)
    reset_usas = data.get("resetUSAS", True)
    
    try:
        import shutil
        
        deleted_items = []
        
        # Reset database (includes bibliographic data)
        if reset_database:
            db_path = DATA_DIR / "database.sqlite"
            db_wal = DATA_DIR / "database.sqlite-wal"
            db_shm = DATA_DIR / "database.sqlite-shm"
            meta_lingo_db = DATA_DIR / "meta_lingo.db"
            
            for db_file in [db_path, db_wal, db_shm, meta_lingo_db]:
                if db_file.exists():
                    db_file.unlink()
                    deleted_items.append(f"Database: {db_file.name}")
            
            # Reinitialize database
            from models.database import init_database
            init_database()
            deleted_items.append("Database reinitialized")
        
        # Reset corpora
        if reset_corpora:
            if CORPORA_DIR.exists():
                # Delete all corpus folders
                for corpus_folder in CORPORA_DIR.iterdir():
                    if corpus_folder.is_dir():
                        # Use ignore_errors=True to handle external drive/filesystem issues
                        shutil.rmtree(corpus_folder, ignore_errors=True)
                        # Double-check if folder still exists and try alternative deletion
                        if corpus_folder.exists():
                            # Try deleting files one by one
                            for item in corpus_folder.rglob('*'):
                                try:
                                    if item.is_file():
                                        item.unlink()
                                except Exception:
                                    pass
                            # Try removing empty directories
                            for item in sorted(corpus_folder.rglob('*'), reverse=True):
                                try:
                                    if item.is_dir():
                                        item.rmdir()
                                except Exception:
                                    pass
                            # Final attempt to remove the main folder
                            try:
                                corpus_folder.rmdir()
                            except Exception:
                                pass
                        deleted_items.append(f"Corpus: {corpus_folder.name}")
        
        # Reset annotations (using ANNOTATIONS_DIR from config)
        if reset_annotations:
            if ANNOTATIONS_DIR.exists():
                # Delete all annotation folders
                for annotation_folder in ANNOTATIONS_DIR.iterdir():
                    if annotation_folder.is_dir():
                        shutil.rmtree(annotation_folder, ignore_errors=True)
                        deleted_items.append(f"Annotation archive: {annotation_folder.name}")
                # Also clean any files directly in annotations dir
                for annotation_file in ANNOTATIONS_DIR.glob("*.json"):
                    try:
                        annotation_file.unlink()
                        deleted_items.append(f"Annotation file: {annotation_file.name}")
                    except Exception:
                        pass
        
        # Reset topic modeling data
        if reset_topic_modeling:
            # Clean embeddings
            embeddings_dir = TOPIC_MODELING_DIR / "embeddings"
            if embeddings_dir.exists():
                for embedding_file in embeddings_dir.glob("*"):
                    try:
                        if embedding_file.is_file():
                            embedding_file.unlink()
                        elif embedding_file.is_dir():
                            shutil.rmtree(embedding_file, ignore_errors=True)
                    except Exception:
                        pass
                deleted_items.append("Topic modeling embeddings")
            
            # Clean results - use iterdir() to catch all files including ._ resource forks
            results_dir = TOPIC_MODELING_DIR / "results"
            if results_dir.exists():
                for result_file in results_dir.iterdir():
                    try:
                        if result_file.is_file():
                            result_file.unlink()
                    except Exception:
                        pass
                deleted_items.append("Topic modeling results")
        
        # Reset Word2Vec models
        if reset_word2vec:
            if WORD2VEC_DIR.exists():
                for model_file in WORD2VEC_DIR.glob("*"):
                    try:
                        if model_file.is_file():
                            model_file.unlink()
                    except Exception:
                        pass
                deleted_items.append("Word2Vec models")
        
        # Reset USAS settings to defaults
        if reset_usas:
            SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
            usas_settings_file = SETTINGS_DIR / "usas_settings.json"
            
            # Write default USAS settings
            default_usas_settings = {
                "priority_domains": [],
                "default_text_type": "GEN",
                "custom_text_types": {},
                "text_type_overrides": {}
            }
            with open(usas_settings_file, 'w', encoding='utf-8') as f:
                json.dump(default_usas_settings, f, ensure_ascii=False, indent=2)
            deleted_items.append("USAS settings reset to defaults")
        
        logger.info(f"=== Factory reset completed: {deleted_items} ===")
        
        return {
            "success": True,
            "message": f"Factory reset completed. Deleted: {len(deleted_items)} items",
            "deleted": deleted_items
        }
        
    except Exception as e:
        logger.error(f"=== Factory reset failed: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Corpus CRUD ====================

@router.get("/list")
async def list_corpora():
    """Get all corpora"""
    logger.info("=== GET /list called ===")
    try:
        service = get_corpus_service()
        corpora = service.list_corpora()
        logger.info(f"=== /list returning {len(corpora)} corpora ===")
        return {
            "success": True,
            "data": corpora
        }
    except Exception as e:
        logger.error(f"=== /list error: {e} ===")
        raise


@router.get("/{corpus_id}")
async def get_corpus(corpus_id: str):
    """Get corpus by ID"""
    service = get_corpus_service()
    corpus = service.get_corpus(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    return {
        "success": True,
        "data": corpus
    }


@router.post("/create")
async def create_corpus(data: CorpusCreate):
    """Create new corpus"""
    logger.info(f"=== POST /create called with name: {data.name} ===")
    try:
        service = get_corpus_service()
        result = service.create_corpus(data)
        if not result.get("success"):
            logger.error(f"=== /create failed: {result.get('error')} ===")
            raise HTTPException(status_code=400, detail=result.get("error"))
        logger.info(f"=== /create success: corpus_id={result.get('data', {}).get('id')} ===")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== /create exception: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{corpus_id}")
async def update_corpus(corpus_id: str, data: CorpusUpdate):
    """Update corpus metadata"""
    service = get_corpus_service()
    result = service.update_corpus(corpus_id, data)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.delete("/{corpus_id}")
async def delete_corpus(corpus_id: str):
    """Delete corpus"""
    service = get_corpus_service()
    result = service.delete_corpus(corpus_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


# ==================== Corpus Tags ====================

@router.post("/{corpus_id}/tags")
async def add_corpus_tag(corpus_id: str, data: dict):
    """Add tag to corpus"""
    service = get_corpus_service()
    corpus = service.get_corpus(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    tag = data.get("tag")
    if not tag:
        raise HTTPException(status_code=400, detail="Tag name required")
    
    service.add_corpus_tag(corpus_id, tag)
    return {"success": True, "message": f"Tag '{tag}' added"}


@router.delete("/{corpus_id}/tags/{tag}")
async def remove_corpus_tag(corpus_id: str, tag: str):
    """Remove tag from corpus"""
    service = get_corpus_service()
    service.remove_corpus_tag(corpus_id, tag)
    return {"success": True, "message": f"Tag '{tag}' removed"}


# ==================== Text CRUD ====================

@router.get("/{corpus_id}/texts")
async def list_texts(corpus_id: str, media_type: Optional[str] = None):
    """Get all texts in a corpus"""
    service = get_corpus_service()
    corpus = service.get_corpus(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    texts = service.list_texts(corpus_id)
    
    # Filter by media type if specified
    if media_type:
        texts = [t for t in texts if t.get("media_type") == media_type]
    
    return {
        "success": True,
        "data": texts
    }


@router.get("/{corpus_id}/texts/{text_id}")
async def get_text(corpus_id: str, text_id: str):
    """Get text with content"""
    service = get_corpus_service()
    result = service.get_text_content(text_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result


@router.put("/{corpus_id}/texts/{text_id}")
async def update_text(corpus_id: str, text_id: str, data: TextUpdate):
    """Update text metadata"""
    service = get_corpus_service()
    
    # Get existing text to merge metadata
    existing_text = TextDB.get_by_id(text_id)
    if not existing_text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    existing_metadata = existing_text.get('metadata') or {}
    
    # Build update data
    update_data = {}
    
    if data.metadata:
        # Merge new metadata with existing metadata
        meta_dict = dict(existing_metadata)  # Start with existing
        
        # Update with new values (only if provided)
        if data.metadata.date is not None:
            meta_dict['date'] = data.metadata.date
        if data.metadata.author is not None:
            meta_dict['author'] = data.metadata.author
        if data.metadata.source is not None:
            meta_dict['source'] = data.metadata.source
        if data.metadata.description is not None:
            meta_dict['description'] = data.metadata.description
        
        # Handle customFields/custom_fields - merge them
        existing_custom = existing_metadata.get('custom_fields') or {}
        new_custom = {}
        if data.metadata.customFields:
            new_custom.update(data.metadata.customFields)
        if data.metadata.custom_fields:
            new_custom.update(data.metadata.custom_fields)
        
        if new_custom or existing_custom:
            meta_dict['custom_fields'] = {**existing_custom, **new_custom}
        
        update_data['metadata'] = meta_dict
        logger.info(f"Merged metadata: {update_data['metadata']}")
    
    if data.filename is not None:
        update_data['filename'] = data.filename
    if data.tags is not None:
        update_data['tags'] = data.tags
    
    result = service.update_text(text_id, update_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.put("/{corpus_id}/texts/{text_id}/content")
async def update_text_content(corpus_id: str, text_id: str, data: dict):
    """Update text file content"""
    service = get_corpus_service()
    content = data.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="Content required")
    
    result = service.update_text_content(text_id, content)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.put("/{corpus_id}/texts/{text_id}/transcript")
async def update_transcript_segments(corpus_id: str, text_id: str, data: dict):
    """
    Update transcript segments for audio/video files
    Also triggers synchronous SpaCy and USAS re-annotation after save (same as text edit)
    
    Args:
        corpus_id: Corpus ID
        text_id: Text ID
        data: Dict containing 'segments' - list of {id, start, end, text}
    """
    logger.info(f"=== PUT /{corpus_id}/texts/{text_id}/transcript called ===")
    
    segments = data.get("segments")
    if not segments:
        raise HTTPException(status_code=400, detail="Segments required")
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    transcript_json_path = text.get('transcript_json_path')
    if not transcript_json_path or not os.path.exists(transcript_json_path):
        raise HTTPException(status_code=400, detail="No transcript file found")
    
    try:
        # Load existing transcript
        with open(transcript_json_path, 'r', encoding='utf-8') as f:
            transcript_data = json.load(f)
        
        # Update segments
        existing_segments = transcript_data.get('segments', [])
        segment_map = {seg.get('id'): seg for seg in segments}
        
        updated_count = 0
        for i, seg in enumerate(existing_segments):
            seg_id = seg.get('id', i)
            if seg_id in segment_map or i in segment_map:
                new_seg = segment_map.get(seg_id) or segment_map.get(i)
                if new_seg and 'text' in new_seg:
                    existing_segments[i]['text'] = new_seg['text']
                    updated_count += 1
        
        transcript_data['segments'] = existing_segments
        
        # Recalculate full text
        full_text = ' '.join(seg.get('text', '') for seg in existing_segments)
        transcript_data['full_text'] = full_text
        transcript_data['fullText'] = full_text
        
        # Recalculate word count
        total_words = sum(len(seg.get('text', '').split()) for seg in existing_segments)
        transcript_data['total_words'] = total_words
        transcript_data['totalWords'] = total_words
        
        # Save updated transcript
        with open(transcript_json_path, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f, ensure_ascii=False, indent=2)
        
        # Also update the plain text file if it exists
        txt_path = text.get('transcript_path') or text.get('content_path')
        if txt_path and os.path.exists(txt_path):
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write(full_text)
        
        # Update database word count
        TextDB.update(text_id, {'word_count': total_words})
        
        logger.info(f"=== Updated {updated_count} transcript segments ===")
        
        # Synchronously regenerate SpaCy and USAS annotations (same as text edit)
        language = corpus.get('language', 'english')
        spacy_regenerated = False
        usas_regenerated = False
        
        # Get text type from metadata for USAS
        text_metadata = text.get('metadata', {})
        if isinstance(text_metadata, str):
            try:
                text_metadata = json.loads(text_metadata)
            except:
                text_metadata = {}
        text_type = text_metadata.get('textType') if isinstance(text_metadata, dict) else None
        
        # SpaCy re-annotation (synchronous)
        try:
            from services.spacy_service import get_spacy_service
            spacy_svc = get_spacy_service()
            
            if spacy_svc.is_available(language):
                logger.info(f"Regenerating SpaCy annotations for {len(existing_segments)} segments...")
                spacy_result = spacy_svc.annotate_segments(existing_segments, language)
                
                if spacy_result.get("success"):
                    transcript_data['spacy_annotations'] = spacy_result
                    with open(transcript_json_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    spacy_regenerated = True
                    logger.info("SpaCy annotations regenerated successfully")
        except Exception as e:
            logger.warning(f"Failed to regenerate SpaCy annotations: {e}")
        
        # USAS re-annotation (synchronous)
        try:
            from services.usas_service import get_usas_service
            usas_svc = get_usas_service()
            
            if usas_svc.is_available(language):
                logger.info(f"Regenerating USAS annotations for {len(existing_segments)} segments...")
                usas_result = usas_svc.annotate_segments(existing_segments, language, text_type)
                
                if usas_result.get("success"):
                    transcript_data['usas_annotations'] = usas_result
                    with open(transcript_json_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    usas_regenerated = True
                    logger.info("USAS annotations regenerated successfully")
        except Exception as e:
            logger.warning(f"Failed to regenerate USAS annotations: {e}")
        
        # MIPVU re-annotation (synchronous, only for English)
        mipvu_regenerated = False
        try:
            from services.mipvu_service import get_mipvu_service
            mipvu_svc = get_mipvu_service()
            
            if mipvu_svc.is_available(language):
                logger.info(f"Regenerating MIPVU annotations for {len(existing_segments)} segments...")
                
                # Merge SpaCy data into segments for MIPVU
                spacy_result = transcript_data.get('spacy_annotations', {})
                spacy_segments = spacy_result.get('segments', {})
                segments_with_spacy = []
                for seg in existing_segments:
                    seg_id = seg.get('id', 0)
                    seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                    # Convert SpaCy segment format to MIPVU expected format
                    spacy_data = None
                    if seg_spacy and seg_spacy.get('tokens'):
                        spacy_data = {
                            'sentences': [{
                                'tokens': [
                                    {
                                        'word': t.get('text', ''),
                                        'lemma': t.get('lemma', ''),
                                        'pos': t.get('pos', ''),
                                        'tag': t.get('tag', ''),
                                        'dep': t.get('dep', '')
                                    } for t in seg_spacy.get('tokens', [])
                                ]
                            }]
                        }
                    segments_with_spacy.append({**seg, 'spacy_data': spacy_data})
                
                mipvu_result = mipvu_svc.annotate_segments(segments_with_spacy, language)
                
                if mipvu_result:
                    transcript_data['mipvu_annotations'] = {
                        "success": True,
                        "segments": mipvu_result
                    }
                    with open(transcript_json_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    mipvu_regenerated = True
                    logger.info("MIPVU annotations regenerated successfully")
        except Exception as e:
            logger.warning(f"Failed to regenerate MIPVU annotations: {e}")
        
        return {
            "success": True,
            "data": {
                "updated_segments": updated_count,
                "total_segments": len(existing_segments),
                "total_words": total_words,
                "spacy_regenerated": spacy_regenerated,
                "usas_regenerated": usas_regenerated,
                "mipvu_regenerated": mipvu_regenerated
            }
        }
        
    except Exception as e:
        logger.error(f"=== Failed to update transcript: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{corpus_id}/texts/{text_id}")
async def delete_text(corpus_id: str, text_id: str):
    """Delete text"""
    service = get_corpus_service()
    result = service.delete_text(text_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.get("/{corpus_id}/texts/{text_id}/media")
async def stream_media_file(corpus_id: str, text_id: str, request: Request):
    """
    Stream media file (audio/video) for playback with Range request support
    Returns the original media file with appropriate content type
    Supports HTTP Range requests for video seeking
    """
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    media_type = text.get('media_type', 'text')
    filename = text.get('filename', '')
    file_path = None
    
    # For video/audio, we need to find the original media file (not the transcript)
    # The original file is saved with the original filename in the same directory
    any_path = text.get('content_path') or text.get('transcript_path') or text.get('audio_path')
    
    if any_path:
        content_dir = Path(any_path).parent
        
        # First, try to find the original file by filename
        potential_path = content_dir / filename
        if potential_path.exists() and potential_path.suffix.lower() in ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac']:
            file_path = str(potential_path)
            logger.info(f"Found original media file: {file_path}")
        
        # For audio, also check audio_path (extracted audio from video)
        if not file_path and media_type == 'audio':
            audio_path = text.get('audio_path')
            if audio_path and os.path.exists(audio_path):
                file_path = audio_path
                logger.info(f"Using audio_path: {file_path}")
        
        # If still not found, search for media files in the directory
        if not file_path:
            media_extensions = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac']
            for ext in media_extensions:
                # Try with original filename stem
                stem = Path(filename).stem
                potential = content_dir / f"{stem}{ext}"
                if potential.exists():
                    file_path = str(potential)
                    logger.info(f"Found media file by stem search: {file_path}")
                    break
    
    if not file_path or not os.path.exists(file_path):
        logger.error(f"Media file not found for text {text_id}. filename={filename}, content_path={text.get('content_path')}, audio_path={text.get('audio_path')}")
        raise HTTPException(status_code=404, detail="Media file not found")
    
    # Determine content type
    ext = Path(file_path).suffix.lower()
    content_type_map = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv'
    }
    content_type = content_type_map.get(ext, 'application/octet-stream')
    
    file_size = os.path.getsize(file_path)
    
    # Check for Range header (required for video seeking)
    range_header = request.headers.get('range') if request else None
    
    if range_header:
        # Parse Range header: "bytes=start-end" or "bytes=start-"
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        # Ensure valid range
        start = max(0, start)
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        logger.info(f"Range request: {file_path} bytes {start}-{end}/{file_size}")
        
        def iter_file():
            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 1024 * 1024  # 1MB chunks
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        
        return StreamingResponse(
            iter_file(),
            status_code=206,  # Partial Content
            media_type=content_type,
            headers={
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(content_length),
                'Content-Disposition': f'inline; filename="{filename or "media"}"'
            }
        )
    else:
        # No Range header - return full file with Accept-Ranges header
        logger.info(f"Full file request: {file_path} ({content_type})")
        
        def iter_full_file():
            with open(file_path, 'rb') as f:
                chunk_size = 1024 * 1024  # 1MB chunks
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data
        
        return StreamingResponse(
            iter_full_file(),
            media_type=content_type,
            headers={
                'Accept-Ranges': 'bytes',
                'Content-Length': str(file_size),
                'Content-Disposition': f'inline; filename="{filename or "media"}"'
            }
        )


@router.get("/{corpus_id}/texts/{text_id}/spacy")
async def get_spacy_annotation(corpus_id: str, text_id: str):
    """Get SpaCy annotation for a text
    
    For audio/video with transcripts, converts segment-based annotations
    to the unified format expected by TextAnnotation component:
    - tokens: merged with cumulative offset
    - entities: merged with cumulative offset  
    - sentences: each segment becomes a sentence
    """
    from models.database import TextDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    media_type = text.get('media_type', 'text')
    
    # For audio/video, convert segment-based format to unified format
    if media_type in ['audio', 'video']:
        transcript_json = text.get('transcript_json_path')
        if transcript_json and os.path.exists(transcript_json):
            try:
                with open(transcript_json, 'r', encoding='utf-8') as f:
                    transcript_data = json.load(f)
                
                spacy_annotations = transcript_data.get('spacy_annotations', {})
                segments = transcript_data.get('segments', [])
                
                if spacy_annotations and spacy_annotations.get('success') and segments:
                    # Convert segment-based format to unified format
                    all_tokens = []
                    all_entities = []
                    all_sentences = []
                    
                    spacy_segments = spacy_annotations.get('segments', {})
                    current_offset = 0
                    
                    for seg in segments:
                        seg_id = seg.get('id', 0)
                        seg_text = seg.get('text', '')
                        
                        # Get SpaCy data for this segment
                        seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                        
                        # Add sentence entry
                        all_sentences.append({
                            'text': seg_text,
                            'start': current_offset,
                            'end': current_offset + len(seg_text)
                        })
                        
                        # Add tokens with offset adjustment
                        for token in seg_spacy.get('tokens', []):
                            all_tokens.append({
                                'text': token.get('text', ''),
                                'start': current_offset + token.get('start', 0),
                                'end': current_offset + token.get('end', 0),
                                'pos': token.get('pos', ''),
                                'tag': token.get('tag', ''),
                                'lemma': token.get('lemma', ''),
                                'dep': token.get('dep', ''),
                                'morph': token.get('morph', '')
                            })
                        
                        # Add entities with offset adjustment
                        for entity in seg_spacy.get('entities', []):
                            all_entities.append({
                                'text': entity.get('text', ''),
                                'start': current_offset + entity.get('start', 0),
                                'end': current_offset + entity.get('end', 0),
                                'label': entity.get('label', ''),
                                'description': entity.get('description', '')
                            })
                        
                        # Update offset for next segment (add space separator)
                        current_offset += len(seg_text) + 1  # +1 for space between segments
                    
                    return {
                        "success": True,
                        "data": {
                            "success": True,
                            "tokens": all_tokens,
                            "entities": all_entities,
                            "sentences": all_sentences
                        }
                    }
            except Exception as e:
                logger.warning(f"Failed to load transcript SpaCy: {e}")
    
    # For plain text or fallback, use .spacy.json file
    content_path = text.get('content_path')
    if not content_path:
        return {"success": False, "error": "No content path"}
    
    content_path = Path(content_path)
    spacy_path = content_path.parent / f"{content_path.stem}.spacy.json"
    
    if spacy_path.exists():
        try:
            with open(spacy_path, 'r', encoding='utf-8') as f:
                spacy_data = json.load(f)
            return {
                "success": True,
                "data": spacy_data
            }
        except Exception as e:
            logger.error(f"Failed to load SpaCy annotation: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "No SpaCy annotation found"}


@router.get("/{corpus_id}/texts/{text_id}/yolo")
async def get_yolo_annotation(corpus_id: str, text_id: str):
    """Get YOLO annotation data for a video text"""
    from models.database import TextDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    # Check if this is a video
    if text.get('media_type') != 'video':
        return {"success": False, "error": "Not a video file"}
    
    # Try to find YOLO annotation file
    yolo_path = text.get('yolo_annotation_path')
    if not yolo_path or not os.path.exists(yolo_path):
        # Try to find in the directory
        content_path = text.get('content_path') or text.get('transcript_path')
        if content_path:
            content_dir = Path(content_path).parent
            filename = text.get('filename', '')
            stem = Path(filename).stem
            
            # Look for YOLO JSON file
            potential_paths = [
                content_dir / f"{stem}_yolo.json",
                content_dir / f"{stem}_tracking.json",
                content_dir / "yolo_results.json"
            ]
            
            for p in potential_paths:
                if p.exists():
                    yolo_path = str(p)
                    break
    
    if not yolo_path or not os.path.exists(yolo_path):
        return {"success": False, "error": "No YOLO annotation found"}
    
    try:
        with open(yolo_path, 'r', encoding='utf-8') as f:
            yolo_data = json.load(f)
        
        # Transform YOLO data to frontend format
        tracks = []
        
        # Handle different YOLO output formats
        if 'track_segments' in yolo_data:
            # Our YOLO service format
            for segment in yolo_data['track_segments']:
                track = {
                    "trackId": segment.get('track_id', 0),
                    "className": segment.get('class_name', 'unknown'),
                    "startFrame": segment.get('start_frame', 0),
                    "endFrame": segment.get('end_frame', 0),
                    "startTime": segment.get('start_time', 0),
                    "endTime": segment.get('end_time', 0),
                    "color": get_yolo_track_color(segment.get('class_name', 'unknown')),
                    "detections": []
                }
                
                # Add detections if available
                if 'detections' in segment:
                    for det in segment['detections']:
                        track['detections'].append({
                            "trackId": det.get('track_id', track['trackId']),
                            "classId": det.get('class_id', 0),
                            "className": det.get('class_name', track['className']),
                            "confidence": det.get('confidence', 0),
                            "bbox": det.get('bbox', [0, 0, 0, 0]),
                            "frameNumber": det.get('frame_number', 0),
                            "timestamp": det.get('timestamp', 0)
                        })
                
                tracks.append(track)
        
        elif 'tracks' in yolo_data:
            # Direct tracks format
            tracks = yolo_data['tracks']
        
        # Get video info if available
        video_info = yolo_data.get('video_info', {})
        
        return {
            "success": True,
            "data": {
                "tracks": tracks,
                "videoInfo": {
                    "width": video_info.get('width', 0),
                    "height": video_info.get('height', 0),
                    "fps": video_info.get('fps', 25),
                    "frameCount": video_info.get('frame_count', 0),
                    "duration": video_info.get('duration', 0)
                }
            }
        }
    except Exception as e:
        logger.error(f"Failed to load YOLO annotation: {e}")
        return {"success": False, "error": str(e)}


@router.get("/{corpus_id}/texts/{text_id}/clip")
async def get_clip_annotation(corpus_id: str, text_id: str):
    """Get CLIP annotation data for a video text"""
    from models.database import TextDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    # Check if this is a video
    if text.get('media_type') != 'video':
        return {"success": False, "error": "Not a video file"}
    
    # Try to find CLIP annotation file
    clip_path = text.get('clip_annotation_path')
    if not clip_path or not os.path.exists(clip_path):
        # Try to find in the directory
        content_path = text.get('content_path') or text.get('transcript_path')
        if content_path:
            content_dir = Path(content_path).parent
            filename = text.get('filename', '')
            stem = Path(filename).stem
            
            # Look for CLIP JSON file
            potential_paths = [
                content_dir / f"{stem}_clip.json",
                content_dir / "clip_results.json"
            ]
            
            for p in potential_paths:
                if p.exists():
                    clip_path = str(p)
                    break
    
    if not clip_path or not os.path.exists(clip_path):
        return {"success": False, "error": "No CLIP annotation found"}
    
    try:
        with open(clip_path, 'r', encoding='utf-8') as f:
            clip_data = json.load(f)
        
        return {
            "success": True,
            "data": clip_data
        }
    except Exception as e:
        logger.error(f"Failed to load CLIP annotation: {e}")
        return {"success": False, "error": str(e)}


@router.get("/clip/preset-labels")
async def get_clip_preset_labels():
    """Get CLIP preset label categories"""
    from services.clip_service import get_clip_service
    
    clip = get_clip_service()
    return {
        "success": True,
        "data": {
            "preset_labels": clip.get_preset_labels(),
            "default_labels": clip.get_default_labels()
        }
    }


class ClipReannotateRequest(BaseModel):
    labels: Optional[List[str]] = None
    frame_interval: int = 30


@router.post("/{corpus_id}/texts/{text_id}/reannotate-clip")
async def reannotate_clip(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks,
    request: ClipReannotateRequest = ClipReannotateRequest()
):
    """Re-run CLIP annotation on a video text"""
    from models.database import TextDB, TaskDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    # Check if this is a video
    if text.get('media_type') != 'video':
        return {"success": False, "error": "CLIP annotation is only available for video files"}
    
    # Get original video path (not the transcript or audio file)
    filename = text.get('filename', '')
    video_path = None
    
    any_path = text.get('content_path') or text.get('transcript_path') or text.get('audio_path')
    if any_path:
        content_dir = Path(any_path).parent
        
        # First, try to find the original video file by filename
        potential_path = content_dir / filename
        if potential_path.exists() and potential_path.suffix.lower() in ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv']:
            video_path = str(potential_path)
            logger.info(f"CLIP re-annotation: Found original video: {video_path}")
        
        # If not found, search for video files in the directory
        if not video_path:
            stem = Path(filename).stem
            for ext in ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv']:
                potential = content_dir / f"{stem}{ext}"
                if potential.exists():
                    video_path = str(potential)
                    logger.info(f"CLIP re-annotation: Found video by stem: {video_path}")
                    break
    
    if not video_path or not os.path.exists(video_path):
        logger.error(f"Video file not found for CLIP re-annotation. filename={filename}, content_path={text.get('content_path')}")
        return {"success": False, "error": "Video file not found"}
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "clip_reannotate",
        "status": "pending",
        "message": f"Re-annotating with CLIP..."
    })
    
    # Create progress queue
    create_progress_queue(task_id)
    
    # Run CLIP annotation in background
    def run_clip_annotation():
        try:
            from services.clip_service import get_clip_service
            
            send_progress_sync(task_id, "clip", 5, "Loading CLIP model...")
            
            clip = get_clip_service()
            if not clip.is_available():
                send_progress_sync(task_id, "error", 0, "CLIP model not available", status="failed")
                return
            
            send_progress_sync(task_id, "clip", 10, "Initializing CLIP model...")
            
            if not clip.initialize():
                send_progress_sync(task_id, "error", 0, "CLIP model initialization failed", status="failed")
                return
            
            video_dir = Path(video_path).parent
            
            def clip_progress(current, total, msg):
                pct = 15 + int((current / max(total, 1)) * 80)
                send_progress_sync(task_id, "clip", pct, msg)
            
            result = clip.process_video(
                video_path,
                output_dir=str(video_dir),
                labels=request.labels,
                frame_interval=request.frame_interval,
                progress_callback=clip_progress
            )
            
            if result.get("success"):
                TextDB.update(text_id, {
                    'clip_annotation_path': result.get('json_path')
                })
                frame_count = len(result.get('data', {}).get('frame_results', []))
                send_progress_sync(task_id, "completed", 100, 
                                  f"CLIP annotation completed: {frame_count} frames",
                                  status="completed",
                                  result={"clip_frames": frame_count})
            else:
                send_progress_sync(task_id, "error", 0, 
                                  f"CLIP annotation failed: {result.get('error')}", 
                                  status="failed")
        except Exception as e:
            logger.error(f"CLIP re-annotation error: {e}")
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_clip_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "CLIP re-annotation started"
    }


@router.post("/{corpus_id}/texts/{text_id}/reannotate-yolo")
async def reannotate_yolo(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks
):
    """Re-run YOLO annotation on a video text"""
    from models.database import TextDB, TaskDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    # Check if this is a video
    if text.get('media_type') != 'video':
        return {"success": False, "error": "YOLO annotation is only available for video files"}
    
    # Get original video path (not the transcript or audio file)
    filename = text.get('filename', '')
    video_path = None
    
    any_path = text.get('content_path') or text.get('transcript_path') or text.get('audio_path')
    if any_path:
        content_dir = Path(any_path).parent
        
        # First, try to find the original video file by filename
        potential_path = content_dir / filename
        if potential_path.exists() and potential_path.suffix.lower() in ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv']:
            video_path = str(potential_path)
            logger.info(f"YOLO re-annotation: Found original video: {video_path}")
        
        # If not found, search for video files in the directory
        if not video_path:
            stem = Path(filename).stem
            for ext in ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv']:
                potential = content_dir / f"{stem}{ext}"
                if potential.exists():
                    video_path = str(potential)
                    logger.info(f"YOLO re-annotation: Found video by stem: {video_path}")
                    break
    
    if not video_path or not os.path.exists(video_path):
        logger.error(f"Video file not found for YOLO re-annotation. filename={filename}, content_path={text.get('content_path')}")
        return {"success": False, "error": "Video file not found"}
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "yolo_reannotate",
        "status": "pending",
        "message": f"Re-annotating with YOLO..."
    })
    
    # Create progress queue
    create_progress_queue(task_id)
    
    # Run YOLO annotation in background
    def run_yolo_annotation():
        try:
            from services.yolo_service import get_yolo_service
            
            send_progress_sync(task_id, "yolo", 5, "Loading YOLO model...")
            
            yolo = get_yolo_service()
            if not yolo.is_available():
                send_progress_sync(task_id, "error", 0, "YOLO model not available", status="failed")
                return
            
            send_progress_sync(task_id, "yolo", 10, "Initializing YOLO model...")
            
            if not yolo.initialize():
                send_progress_sync(task_id, "error", 0, "YOLO model initialization failed", status="failed")
                return
            
            video_dir = Path(video_path).parent
            
            def yolo_progress(current, total, msg):
                pct = 15 + int((current / max(total, 1)) * 80)
                send_progress_sync(task_id, "yolo", pct, msg)
            
            result = yolo.process_video(
                video_path,
                output_dir=str(video_dir),
                extract_frames=True,
                progress_callback=yolo_progress
            )
            
            if result.get("success"):
                TextDB.update(text_id, {
                    'yolo_annotation_path': result.get('json_path')
                })
                track_count = result.get('data', {}).get('total_tracks', 0)
                send_progress_sync(task_id, "completed", 100, 
                                  f"YOLO annotation completed: {track_count} tracks",
                                  status="completed",
                                  result={"yolo_tracks": track_count})
            else:
                send_progress_sync(task_id, "error", 0, 
                                  f"YOLO annotation failed: {result.get('error')}", 
                                  status="failed")
        except Exception as e:
            logger.error(f"YOLO re-annotation error: {e}")
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_yolo_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "YOLO re-annotation started"
    }


@router.post("/{corpus_id}/texts/{text_id}/reannotate-usas")
async def reannotate_usas(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks
):
    """Re-run USAS semantic annotation on a text (async)"""
    from models.database import TextDB, CorpusDB, TaskDB
    from services.usas_service import get_usas_service
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    language = corpus.get('language', 'english')
    media_type = text.get('media_type', 'text')
    
    usas_svc = get_usas_service()
    if not usas_svc.is_available(language):
        return {"success": False, "error": f"USAS not available for language: {language}"}
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "usas_reannotate",
        "status": "pending",
        "message": f"Re-annotating with USAS..."
    })
    
    # Create progress queue
    create_progress_queue(task_id)
    
    # Run USAS annotation in background
    def run_usas_annotation():
        try:
            send_progress_sync(task_id, "usas", 10, "Loading USAS service...")
            
            if media_type == 'text':
                # Text file - re-annotate the content
                content_path = text.get('content_path')
                if not content_path or not os.path.exists(content_path):
                    send_progress_sync(task_id, "error", 0, "Content file not found", status="failed")
                    return
                
                send_progress_sync(task_id, "usas", 20, "Reading content...")
                
                with open(content_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Get text type from corpus metadata
                text_type = corpus.get('text_type')
                
                send_progress_sync(task_id, "usas", 30, f"Running USAS annotation ({len(content)} chars)...")
                
                result = usas_svc.annotate_text(content, language, text_type)
                
                if result.get("success"):
                    send_progress_sync(task_id, "usas", 80, "Saving annotation...")
                    
                    # Save USAS annotation
                    base_name = Path(content_path).stem
                    output_dir = Path(content_path).parent
                    usas_path = output_dir / f"{base_name}.usas.json"
                    
                    with open(usas_path, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    
                    token_count = len(result.get("tokens", []))
                    send_progress_sync(task_id, "completed", 100, 
                                      f"USAS annotation completed: {token_count} tokens",
                                      status="completed",
                                      result={"tokens": token_count, "dominant_domain": result.get("dominant_domain")})
                else:
                    send_progress_sync(task_id, "error", 0, 
                                      result.get("error", "USAS annotation failed"), 
                                      status="failed")
            
            else:
                # Audio/Video - re-annotate the transcript
                transcript_path = text.get('transcript_json_path')
                if not transcript_path or not os.path.exists(transcript_path):
                    send_progress_sync(task_id, "error", 0, "Transcript file not found", status="failed")
                    return
                
                send_progress_sync(task_id, "usas", 20, "Reading transcript...")
                
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcript_data = json.load(f)
                
                segments = transcript_data.get('segments', [])
                if not segments:
                    send_progress_sync(task_id, "error", 0, "No transcript segments found", status="failed")
                    return
                
                send_progress_sync(task_id, "usas", 30, f"Running USAS annotation ({len(segments)} segments)...")
                
                result = usas_svc.annotate_segments(segments, language)
                
                if result.get("success"):
                    send_progress_sync(task_id, "usas", 80, "Saving annotation...")
                    
                    # Update transcript with USAS annotations
                    transcript_data['usas_annotations'] = result
                    
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    
                    token_count = result.get("total_tokens", 0)
                    send_progress_sync(task_id, "completed", 100, 
                                      f"USAS annotation completed: {token_count} tokens",
                                      status="completed",
                                      result={"tokens": token_count, "segments": len(result.get("segments", {}))})
                else:
                    send_progress_sync(task_id, "error", 0, 
                                      result.get("error", "USAS annotation failed"), 
                                      status="failed")
        
        except Exception as e:
            logger.error(f"USAS re-annotation error: {e}")
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_usas_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "USAS re-annotation started"
    }


@router.get("/{corpus_id}/texts/{text_id}/mipvu")
async def get_mipvu_annotation(corpus_id: str, text_id: str):
    """Get MIPVU metaphor annotation for a text
    
    For audio/video, converts segment-based MIPVU data to the unified format
    expected by the frontend with proper character offsets.
    """
    from models.database import TextDB
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    media_type = text.get('media_type', 'text')
    
    # For audio/video, convert segment-based format to unified format
    if media_type in ['audio', 'video']:
        transcript_json = text.get('transcript_json_path')
        if transcript_json and os.path.exists(transcript_json):
            try:
                with open(transcript_json, 'r', encoding='utf-8') as f:
                    transcript_data = json.load(f)
                
                mipvu_annotations = transcript_data.get('mipvu_annotations')
                segments = transcript_data.get('segments', [])
                
                if mipvu_annotations and mipvu_annotations.get('success') and mipvu_annotations.get('segments'):
                    # Convert segment-based MIPVU to unified format
                    all_sentences = []
                    total_stats = {'total_tokens': 0, 'metaphor_tokens': 0, 'literal_tokens': 0}
                    
                    mipvu_segments = mipvu_annotations.get('segments', [])
                    current_offset = 0
                    
                    # Calculate offset for each original segment
                    segment_offsets = {}
                    for seg in segments:
                        seg_id = seg.get('id', 0)
                        seg_text = seg.get('text', '')
                        segment_offsets[seg_id] = current_offset
                        segment_offsets[str(seg_id)] = current_offset
                        current_offset += len(seg_text) + 1  # +1 for space
                    
                    # Process MIPVU segments
                    for mipvu_seg in mipvu_segments:
                        seg_id = mipvu_seg.get('id', 0)
                        seg_mipvu = mipvu_seg.get('mipvu_data', {})
                        
                        if seg_mipvu.get('success'):
                            offset = segment_offsets.get(seg_id, segment_offsets.get(str(seg_id), 0))
                            
                            # Process sentences and adjust token positions
                            for sentence in seg_mipvu.get('sentences', []):
                                adjusted_tokens = []
                                for token in sentence.get('tokens', []):
                                    adjusted_tokens.append({
                                        **token,
                                        'start': offset + token.get('start', 0),
                                        'end': offset + token.get('end', 0)
                                    })
                                all_sentences.append({
                                    'text': sentence.get('text', ''),
                                    'tokens': adjusted_tokens
                                })
                            
                            # Aggregate statistics
                            seg_stats = seg_mipvu.get('statistics', {})
                            total_stats['total_tokens'] += seg_stats.get('total_tokens', 0)
                            total_stats['metaphor_tokens'] += seg_stats.get('metaphor_tokens', 0)
                            total_stats['literal_tokens'] += seg_stats.get('literal_tokens', 0)
                    
                    # Calculate metaphor rate
                    if total_stats['total_tokens'] > 0:
                        total_stats['metaphor_rate'] = total_stats['metaphor_tokens'] / total_stats['total_tokens']
                    else:
                        total_stats['metaphor_rate'] = 0.0
                    
                    return {
                        "success": True,
                        "data": {
                            "success": True,
                            "sentences": all_sentences,
                            "statistics": total_stats
                        }
                    }
            except Exception as e:
                logger.warning(f"Failed to load transcript MIPVU: {e}")
    
    # For text files, check for .mipvu.json file
    content_path = text.get('content_path')
    if content_path:
        mipvu_path = Path(content_path).with_suffix('').with_suffix('.mipvu.json')
        if mipvu_path.exists():
            try:
                with open(mipvu_path, 'r', encoding='utf-8') as f:
                    return {
                        "success": True,
                        "data": json.load(f)
                    }
            except Exception as e:
                logger.warning(f"Failed to load MIPVU annotation: {e}")
    
    return {
        "success": False,
        "error": "MIPVU annotation not found"
    }


@router.post("/{corpus_id}/texts/{text_id}/reannotate-mipvu")
async def reannotate_mipvu(
    corpus_id: str,
    text_id: str,
    background_tasks: BackgroundTasks
):
    """Re-run MIPVU metaphor annotation on a text (async)
    
    Requires SpaCy annotation to be present.
    Only supports English texts.
    """
    from models.database import TextDB, CorpusDB, TaskDB
    from services.mipvu_service import get_mipvu_service
    
    text = TextDB.get_by_id(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    corpus = CorpusDB.get_by_id(corpus_id)
    if not corpus:
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    language = corpus.get('language', 'english')
    media_type = text.get('media_type', 'text')
    
    mipvu_svc = get_mipvu_service()
    if not mipvu_svc.is_available(language):
        return {"success": False, "error": f"MIPVU not available for language: {language} (only English supported)"}
    
    # Create task for tracking
    task_id = str(uuid.uuid4())
    
    TaskDB.create({
        "id": task_id,
        "corpus_id": corpus_id,
        "text_id": text_id,
        "task_type": "mipvu_reannotate",
        "status": "pending",
        "message": f"Re-annotating with MIPVU..."
    })
    
    # Create progress queue
    create_progress_queue(task_id)
    
    # Run MIPVU annotation in background
    def run_mipvu_annotation():
        try:
            send_progress_sync(task_id, "mipvu", 5, "Loading MIPVU service...")
            
            if media_type == 'text':
                # Text file - need SpaCy data first
                content_path = text.get('content_path')
                if not content_path or not os.path.exists(content_path):
                    send_progress_sync(task_id, "error", 0, "Content file not found", status="failed")
                    return
                
                # Load SpaCy annotation
                spacy_path = Path(content_path).with_suffix('').with_suffix('.spacy.json')
                if not spacy_path.exists():
                    send_progress_sync(task_id, "error", 0, "SpaCy annotation not found. Please run SpaCy annotation first.", status="failed")
                    return
                
                send_progress_sync(task_id, "mipvu", 10, "Loading SpaCy annotation...")
                
                with open(spacy_path, 'r', encoding='utf-8') as f:
                    spacy_data = json.load(f)
                
                with open(content_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                send_progress_sync(task_id, "mipvu", 15, f"Running MIPVU annotation ({len(content)} chars)...")
                
                # Progress callback for MIPVU
                def mipvu_progress_callback(progress, message):
                    overall_progress = 15 + int(progress * 0.75)
                    send_progress_sync(task_id, "mipvu", overall_progress, message)
                
                result = mipvu_svc.annotate_text(content, language, spacy_data, mipvu_progress_callback)
                
                if result.get("success"):
                    send_progress_sync(task_id, "mipvu", 92, "Saving annotation...")
                    
                    # Save MIPVU annotation
                    base_name = Path(content_path).stem
                    output_dir = Path(content_path).parent
                    mipvu_path = output_dir / f"{base_name}.mipvu.json"
                    
                    with open(mipvu_path, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    
                    stats = result.get("statistics", {})
                    metaphor_count = stats.get("metaphor_tokens", 0)
                    total_count = stats.get("total_tokens", 0)
                    metaphor_rate = stats.get("metaphor_rate", 0) * 100
                    
                    send_progress_sync(task_id, "completed", 100, 
                                      f"MIPVU annotation completed: {metaphor_count}/{total_count} metaphors ({metaphor_rate:.1f}%)",
                                      status="completed",
                                      result={"metaphor_tokens": metaphor_count, "total_tokens": total_count, "metaphor_rate": metaphor_rate})
                else:
                    send_progress_sync(task_id, "error", 0, 
                                      result.get("error", "MIPVU annotation failed"), 
                                      status="failed")
            
            else:
                # Audio/Video - check for transcript with SpaCy annotations
                transcript_path = text.get('transcript_json_path')
                if not transcript_path or not os.path.exists(transcript_path):
                    send_progress_sync(task_id, "error", 0, "Transcript file not found", status="failed")
                    return
                
                send_progress_sync(task_id, "mipvu", 10, "Reading transcript...")
                
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcript_data = json.load(f)
                
                # Check for SpaCy annotations
                if 'spacy_annotations' not in transcript_data:
                    send_progress_sync(task_id, "error", 0, "SpaCy annotations not found in transcript. Please run SpaCy annotation first.", status="failed")
                    return
                
                segments = transcript_data.get('segments', [])
                if not segments:
                    send_progress_sync(task_id, "error", 0, "No transcript segments found", status="failed")
                    return
                
                send_progress_sync(task_id, "mipvu", 15, f"Running MIPVU annotation ({len(segments)} segments)...")
                
                # Progress callback for MIPVU
                def mipvu_progress_callback(progress, message):
                    overall_progress = 15 + int(progress * 0.75)
                    send_progress_sync(task_id, "mipvu", overall_progress, message)
                
                # Merge SpaCy data into segments for MIPVU
                spacy_result = transcript_data.get('spacy_annotations', {})
                spacy_segments = spacy_result.get('segments', {})
                segments_with_spacy = []
                for seg in segments:
                    seg_id = seg.get('id', 0)
                    seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                    # Convert SpaCy segment format to MIPVU expected format
                    spacy_data = None
                    if seg_spacy and seg_spacy.get('tokens'):
                        spacy_data = {
                            'sentences': [{
                                'tokens': [
                                    {
                                        'word': t.get('text', ''),
                                        'lemma': t.get('lemma', ''),
                                        'pos': t.get('pos', ''),
                                        'tag': t.get('tag', ''),
                                        'dep': t.get('dep', '')
                                    } for t in seg_spacy.get('tokens', [])
                                ]
                            }]
                        }
                    segments_with_spacy.append({**seg, 'spacy_data': spacy_data})
                
                result = mipvu_svc.annotate_segments(segments_with_spacy, language, mipvu_progress_callback)
                
                if result:
                    send_progress_sync(task_id, "mipvu", 92, "Saving annotation...")
                    
                    # Update transcript with MIPVU annotations
                    transcript_data['mipvu_annotations'] = {
                        "success": True,
                        "segments": result
                    }
                    
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                    
                    send_progress_sync(task_id, "completed", 100, 
                                      f"MIPVU annotation completed: {len(result)} segments",
                                      status="completed",
                                      result={"segments": len(result)})
                else:
                    send_progress_sync(task_id, "error", 0, "MIPVU annotation failed", status="failed")
        
        except Exception as e:
            logger.error(f"MIPVU re-annotation error: {e}")
            import traceback
            traceback.print_exc()
            send_progress_sync(task_id, "error", 0, f"Error: {str(e)}", status="failed")
    
    background_tasks.add_task(run_mipvu_annotation)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": "MIPVU re-annotation started"
    }


def get_yolo_track_color(class_name: str) -> str:
    """Get a color for a YOLO track based on class name (COCO 80 classes)"""
    colors = {
        # People & Animals
        'person': '#4CAF50',
        'bicycle': '#E91E63',
        'car': '#2196F3',
        'motorcycle': '#FF5722',
        'airplane': '#9C27B0',
        'bus': '#3F51B5',
        'train': '#00BCD4',
        'truck': '#607D8B',
        'boat': '#009688',
        'traffic light': '#FFEB3B',
        'fire hydrant': '#F44336',
        'stop sign': '#E53935',
        'parking meter': '#795548',
        'bench': '#8D6E63',
        'bird': '#00BCD4',
        'cat': '#9C27B0',
        'dog': '#FF9800',
        'horse': '#8BC34A',
        'sheep': '#CDDC39',
        'cow': '#795548',
        'elephant': '#607D8B',
        'bear': '#5D4037',
        'zebra': '#212121',
        'giraffe': '#FFC107',
        # Accessories
        'backpack': '#673AB7',
        'umbrella': '#3F51B5',
        'handbag': '#E91E63',
        'tie': '#1A237E',
        'suitcase': '#4E342E',
        # Sports
        'frisbee': '#FF5722',
        'skis': '#03A9F4',
        'snowboard': '#00BCD4',
        'sports ball': '#FF9800',
        'kite': '#E91E63',
        'baseball bat': '#795548',
        'baseball glove': '#8D6E63',
        'skateboard': '#9E9E9E',
        'surfboard': '#00ACC1',
        'tennis racket': '#7CB342',
        # Kitchen
        'bottle': '#26A69A',
        'wine glass': '#7B1FA2',
        'cup': '#5C6BC0',
        'fork': '#78909C',
        'knife': '#546E7A',
        'spoon': '#455A64',
        'bowl': '#8D6E63',
        # Food
        'banana': '#FFEB3B',
        'apple': '#F44336',
        'sandwich': '#FF8F00',
        'orange': '#FF9800',
        'broccoli': '#4CAF50',
        'carrot': '#FF5722',
        'hot dog': '#D84315',
        'pizza': '#FF7043',
        'donut': '#F48FB1',
        'cake': '#F06292',
        # Furniture
        'chair': '#8D6E63',
        'couch': '#A1887F',
        'potted plant': '#66BB6A',
        'bed': '#7986CB',
        'dining table': '#8D6E63',
        'toilet': '#90A4AE',
        # Electronics
        'tv': '#37474F',
        'laptop': '#546E7A',
        'mouse': '#78909C',
        'remote': '#90A4AE',
        'keyboard': '#607D8B',
        'cell phone': '#455A64',
        # Appliances
        'microwave': '#78909C',
        'oven': '#8D6E63',
        'toaster': '#A1887F',
        'sink': '#90A4AE',
        'refrigerator': '#78909C',
        # Other
        'book': '#5D4037',
        'clock': '#FFC107',
        'vase': '#AB47BC',
        'scissors': '#F44336',
        'teddy bear': '#FFAB91',
        'hair drier': '#B0BEC5',
        'toothbrush': '#4DD0E1'
    }
    return colors.get(class_name.lower(), '#757575')


# ==================== Text Tags ====================

@router.post("/{corpus_id}/texts/{text_id}/tags")
async def add_text_tag(corpus_id: str, text_id: str, data: dict):
    """Add tag to text"""
    service = get_corpus_service()
    tag = data.get("tag")
    if not tag:
        raise HTTPException(status_code=400, detail="Tag name required")
    
    service.add_text_tag(text_id, tag)
    return {"success": True, "message": f"Tag '{tag}' added"}


@router.delete("/{corpus_id}/texts/{text_id}/tags/{tag}")
async def remove_text_tag(corpus_id: str, text_id: str, tag: str):
    """Remove tag from text"""
    service = get_corpus_service()
    service.remove_text_tag(text_id, tag)
    return {"success": True, "message": f"Tag '{tag}' removed"}


# ==================== File Upload ====================

def get_media_type(filename: str, content_type: str) -> MediaType:
    """Determine media type from filename and content type"""
    ext = Path(filename).suffix.lower()
    
    audio_exts = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'}
    video_exts = {'.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv'}
    
    if ext in audio_exts or content_type.startswith('audio/'):
        return MediaType.AUDIO
    elif ext in video_exts or content_type.startswith('video/'):
        return MediaType.VIDEO
    else:
        return MediaType.TEXT


def process_text_spacy_sync(
    task_id: str,
    text_id: str,
    save_path: str,
    save_dir: str,
    language: str,
    text_type: str = None
):
    """
    Background task to process text files with SpaCy and USAS annotation (for large texts)
    
    Args:
        task_id: Task ID for progress tracking
        text_id: Text entry ID in database
        save_path: Path to the saved text file
        save_dir: Directory containing the file
        language: Language for annotation
        text_type: Optional text type for USAS priority
    """
    logger.info(f"=== Starting SpaCy background processing for task {task_id} ===")
    
    try:
        send_progress_sync(task_id, "initializing", 5, "Loading SpaCy model...")
        
        from services.spacy_service import get_spacy_service
        from services.usas_service import get_usas_service
        
        spacy_svc = get_spacy_service()
        
        if not spacy_svc.is_available(language):
            send_progress_sync(task_id, "error", 0, f"SpaCy model not available for {language}", 
                              status="failed")
            return
        
        send_progress_sync(task_id, "spacy", 10, "Reading text content...")
        
        # Read text content
        with open(save_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        base_name = Path(save_path).stem
        output_dir = Path(save_dir)
        
        # Estimate processing time (roughly 10000 chars/second for en_core_web_lg)
        total_chars = len(content)
        estimated_seconds = max(10, total_chars // 10000)
        estimated_minutes = estimated_seconds // 60
        
        if estimated_minutes > 0:
            time_msg = f"~{estimated_minutes}+ minutes"
        else:
            time_msg = f"~{estimated_seconds} seconds"
        
        # Process entire document (chunking disabled to avoid hanging issues)
        send_progress_sync(task_id, "spacy", 20, 
                          f"Running SpaCy annotation ({total_chars:,} chars, {time_msg})...")
        
        # For long processing, we still need periodic progress updates
        # Create a progress callback that sends updates every 8 seconds (less than 30s timeout)
        import time as time_local  # Rename to avoid conflicts with agent logs
        progress_stop_event = threading.Event()
        start_time = time_local.time()
        
        def periodic_progress():
            """Send periodic progress updates to prevent timeout"""
            update_count = 0
            while not progress_stop_event.is_set():
                time_local.sleep(8)  # Update every 8 seconds (less than 30s timeout)
                if not progress_stop_event.is_set():
                    update_count += 1
                    elapsed = time_local.time() - start_time
                    # Estimate progress based on time (rough estimate, cap at 95%)
                    estimated_progress = min(95, 20 + int((elapsed / max(estimated_seconds, 1)) * 75))
                    send_progress_sync(task_id, "spacy", estimated_progress, 
                                      f"Processing... ({elapsed:.0f}s elapsed, estimated {estimated_seconds}s total)")
        
        progress_thread = threading.Thread(target=periodic_progress, daemon=True)
        progress_thread.start()
        
        try:
            # Process entire document (chunking disabled)
            result = spacy_svc.annotate_text(content, language)
        finally:
            # Stop periodic updates
            progress_stop_event.set()
            progress_thread.join(timeout=1)
        
        if result.get("success"):
            chunk_info = result.get("chunk_info", {})
            if chunk_info:
                chunk_msg = f" ({chunk_info.get('successful_chunks', 0)}/{chunk_info.get('total_chunks', 0)} chunks)"
            else:
                chunk_msg = ""
            
            send_progress_sync(task_id, "spacy", 70, f"Saving SpaCy annotation{chunk_msg}...")
            
            # Save annotation to JSON file
            spacy_path = output_dir / f"{base_name}.spacy.json"
            with open(spacy_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Saved SpaCy annotation: {spacy_path}")
            
            spacy_info = {
                "path": str(spacy_path),
                "tokens": len(result.get("tokens", [])),
                "entities": len(result.get("entities", [])),
                "sentences": len(result.get("sentences", []))
            }
            
            send_progress_sync(task_id, "usas", 80, "Running USAS annotation...")
            
            # Perform USAS annotation
            usas_svc = get_usas_service()
            usas_info = None
            
            if usas_svc.is_available(language):
                # Progress callback for USAS annotation
                def usas_progress_callback(progress, message):
                    # Map USAS progress (0-100) to overall progress (80-95)
                    overall_progress = 80 + int(progress * 0.15)
                    send_progress_sync(task_id, "usas", overall_progress, message)
                
                usas_result = usas_svc.annotate_text(content, language, text_type, usas_progress_callback)
                
                if usas_result.get("success"):
                    usas_path = output_dir / f"{base_name}.usas.json"
                    with open(usas_path, 'w', encoding='utf-8') as f:
                        json.dump(usas_result, f, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Saved USAS annotation: {usas_path}")
                    usas_info = {
                        "path": str(usas_path),
                        "tokens": len(usas_result.get("tokens", [])),
                        "dominant_domain": usas_result.get("dominant_domain")
                    }
            
            # Perform MIPVU annotation (only for English)
            send_progress_sync(task_id, "mipvu", 95, "Running MIPVU annotation...")
            
            from services.mipvu_service import get_mipvu_service
            mipvu_svc = get_mipvu_service()
            mipvu_info = None
            
            if mipvu_svc.is_available(language):
                # Progress callback for MIPVU annotation
                def mipvu_progress_callback(progress, message):
                    # Map MIPVU progress (0-100) to overall progress (95-99)
                    overall_progress = 95 + int(progress * 0.04)
                    send_progress_sync(task_id, "mipvu", overall_progress, message)
                
                mipvu_result = mipvu_svc.annotate_text(content, language, result, mipvu_progress_callback)
                
                if mipvu_result.get("success"):
                    mipvu_path = output_dir / f"{base_name}.mipvu.json"
                    with open(mipvu_path, 'w', encoding='utf-8') as f:
                        json.dump(mipvu_result, f, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Saved MIPVU annotation: {mipvu_path}")
                    stats = mipvu_result.get("statistics", {})
                    mipvu_info = {
                        "path": str(mipvu_path),
                        "metaphor_tokens": stats.get("metaphor_tokens", 0),
                        "total_tokens": stats.get("total_tokens", 0),
                        "metaphor_rate": stats.get("metaphor_rate", 0)
                    }
                else:
                    # Log MIPVU failure details
                    mipvu_error = mipvu_result.get("error", "Unknown error")
                    logger.warning(f"MIPVU annotation failed: {mipvu_error}")
                    logger.warning(f"MIPVU result: {mipvu_result}")
            
            send_progress_sync(task_id, "completed", 100, 
                              f"SpaCy annotation complete ({spacy_info['tokens']} tokens, {spacy_info['entities']} entities)",
                              status="completed",
                              result={
                                  "spacy": spacy_info,
                                  "usas": usas_info,
                                  "mipvu": mipvu_info
                              })
        else:
            error_msg = result.get('error', 'Unknown error')
            send_progress_sync(task_id, "error", 0, 
                              f"SpaCy annotation failed: {error_msg}", 
                              status="failed")
            
    except Exception as e:
        logger.error(f"=== SpaCy background processing error: {e} ===")
        import traceback
        traceback.print_exc()
        send_progress_sync(task_id, "error", 0, f"Processing error: {str(e)}", 
                          status="failed")


def process_media_file_sync(
    task_id: str,
    text_id: str,
    save_path: str,
    media_type: MediaType,
    transcribe: bool,
    yolo_annotation: bool,
    clip_annotation: bool,
    clip_labels: list,
    clip_frame_interval: int,
    language: str
):
    """
    Background task to process audio/video files with progress updates (synchronous)
    
    Args:
        task_id: Task ID for progress tracking
        text_id: Text entry ID in database
        save_path: Path to the saved media file
        media_type: MediaType (audio/video)
        transcribe: Whether to transcribe audio
        yolo_annotation: Whether to run YOLO detection
        clip_annotation: Whether to run CLIP classification
        clip_labels: Labels for CLIP classification
        clip_frame_interval: Frame interval for CLIP (default 30)
        language: Language for transcription
    """
    logger.info(f"=== Starting background processing for task {task_id} ===")
    service = get_corpus_service()
    
    # Get corpus info for text_type (used by USAS)
    from models.database import TextDB, CorpusDB
    text = TextDB.get_by_id(text_id)
    corpus = None
    if text:
        corpus_id = text.get('corpus_id')
        if corpus_id:
            corpus = CorpusDB.get_by_id(corpus_id)
    
    try:
        if media_type == MediaType.AUDIO:
            # Process audio with progress
            send_progress_sync(task_id, "initializing", 5, "Loading Whisper model...")
            
            from services.whisper_service import get_whisper_service
            whisper = get_whisper_service()
            
            if not whisper.is_available():
                send_progress_sync(task_id, "error", 0, "Whisper model not available", 
                                  status="failed")
                return
            
            send_progress_sync(task_id, "transcribing", 10, "Starting transcription...")
            
            # Define progress callback (transcription: 10-50%)
            def audio_progress_callback(current, total, msg):
                pct = 10 + int((current / max(total, 1)) * 40)
                send_progress_sync(task_id, "transcribing", pct, msg)
            
            # Transcribe
            result = whisper.transcribe_and_save(
                save_path,
                language=language,
                progress_callback=audio_progress_callback
            )
            
            if not result.get("success"):
                send_progress_sync(task_id, "error", 0, 
                                  f"Transcription failed: {result.get('error')}", 
                                  status="failed")
                return
            
            send_progress_sync(task_id, "spacy", 50, "Running SpaCy annotation...")
            
            # SpaCy annotation (50-60%)
            from services.spacy_service import get_spacy_service
            spacy_svc = get_spacy_service()
            
            spacy_result = None
            json_path = result.get('json_path')
            transcript_data = None
            segments = []
            
            if spacy_svc.is_available(language):
                if json_path and os.path.exists(json_path):
                    with open(json_path, 'r', encoding='utf-8') as f:
                        transcript_data = json.load(f)
                    
                    segments = transcript_data.get('segments', [])
                    if segments:
                        spacy_result = spacy_svc.annotate_segments(segments, language)
                        if spacy_result.get("success"):
                            transcript_data['spacy_annotations'] = spacy_result
                            send_progress_sync(task_id, "spacy", 60, "SpaCy annotation completed")
            
            # USAS annotation (60-80%, only for Chinese and English)
            send_progress_sync(task_id, "usas", 60, "Starting USAS annotation...")
            
            from services.usas_service import get_usas_service
            usas_svc = get_usas_service()
            
            if usas_svc.is_available(language) and transcript_data and segments:
                text_type = corpus.get('text_type') if corpus else None
                
                usas_result = usas_svc.annotate_segments(segments, language, text_type)
                if usas_result.get("success"):
                    transcript_data['usas_annotations'] = usas_result
                    send_progress_sync(task_id, "usas", 80, "USAS annotation completed")
            else:
                send_progress_sync(task_id, "usas", 80, "USAS not available for this language, skipping...")
            
            # MIPVU annotation (80-95%, only for English)
            send_progress_sync(task_id, "mipvu", 80, "Starting MIPVU annotation...")
            
            from services.mipvu_service import get_mipvu_service
            mipvu_svc = get_mipvu_service()
            
            if mipvu_svc.is_available(language) and transcript_data and segments and spacy_result:
                def mipvu_progress_callback(progress, message):
                    overall_progress = 80 + int(progress * 0.15)
                    send_progress_sync(task_id, "mipvu", overall_progress, message)
                
                # Merge SpaCy data into segments for MIPVU
                spacy_segments = spacy_result.get('segments', {})
                segments_with_spacy = []
                for seg in segments:
                    seg_id = seg.get('id', 0)
                    seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                    # Convert SpaCy segment format to MIPVU expected format
                    spacy_data = None
                    if seg_spacy and seg_spacy.get('tokens'):
                        spacy_data = {
                            'sentences': [{
                                'tokens': [
                                    {
                                        'word': t.get('text', ''),
                                        'lemma': t.get('lemma', ''),
                                        'pos': t.get('pos', ''),
                                        'tag': t.get('tag', ''),
                                        'dep': t.get('dep', '')
                                    } for t in seg_spacy.get('tokens', [])
                                ]
                            }]
                        }
                    segments_with_spacy.append({**seg, 'spacy_data': spacy_data})
                
                mipvu_result = mipvu_svc.annotate_segments(segments_with_spacy, language, mipvu_progress_callback)
                if mipvu_result:
                    transcript_data['mipvu_annotations'] = {"success": True, "segments": mipvu_result}
                    send_progress_sync(task_id, "mipvu", 95, "MIPVU annotation completed")
            else:
                send_progress_sync(task_id, "mipvu", 95, "MIPVU not available for this language, skipping...")
            
            # Save all annotations to transcript JSON
            if transcript_data and json_path:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(transcript_data, f, ensure_ascii=False, indent=2)
            
            send_progress_sync(task_id, "database", 95, "Updating database...")
            
            # Update database
            update_data = {
                'content_path': result.get('txt_path'),
                'transcript_path': result.get('txt_path'),
                'transcript_json_path': result.get('json_path'),
                'has_timestamps': True,
                'word_count': result['data'].get('total_words', 0),
                'duration': result['data'].get('total_duration')
            }
            TextDB.update(text_id, update_data)
            
            send_progress_sync(task_id, "completed", 100, "Audio processing completed",
                              status="completed", result={
                                  "word_count": result['data'].get('total_words', 0),
                                  "duration": result['data'].get('total_duration', 0),
                                  "segments": len(result['data'].get('segments', []))
                              })
            
        elif media_type == MediaType.VIDEO:
            # Process video with progress
            send_progress_sync(task_id, "initializing", 2, "Preparing video processing...")
            logger.info(f"=== Video processing: transcribe={transcribe}, yolo_annotation={yolo_annotation}, clip_annotation={clip_annotation} ===")
            
            from services.yolo_service import get_yolo_service
            from services.whisper_service import get_whisper_service
            from services.spacy_service import get_spacy_service
            
            video_path = Path(save_path)
            output_dir = video_path.parent
            video_name = video_path.stem
            
            results = {"transcript": None, "yolo": None, "clip": None, "spacy": None}
            
            # Calculate progress ranges based on what we're doing
            # Tasks: transcribe, yolo, clip
            # Base ranges: transcribe 5-55%, yolo 55-75%, clip 75-95%
            active_tasks = []
            if transcribe:
                active_tasks.append("transcribe")
            if yolo_annotation:
                active_tasks.append("yolo")
            if clip_annotation:
                active_tasks.append("clip")
            
            # Calculate progress ranges for each task
            if len(active_tasks) == 0:
                transcribe_end = 5
                yolo_start = 5
                yolo_end = 5
                clip_start = 5
            elif len(active_tasks) == 1:
                transcribe_end = 95
                yolo_start = 5
                yolo_end = 95
                clip_start = 5
            elif len(active_tasks) == 2:
                transcribe_end = 50
                yolo_start = 50
                yolo_end = 95
                clip_start = 50
            else:  # 3 tasks
                transcribe_end = 45
                yolo_start = 45
                yolo_end = 70
                clip_start = 70
            
            # Extract and transcribe audio
            if transcribe:
                send_progress_sync(task_id, "extract_audio", 5, "Extracting audio from video...")
                
                yolo_svc = get_yolo_service()
                audio_path = output_dir / f"{video_name}_audio.wav"
                extracted = yolo_svc.extract_audio(str(video_path), str(audio_path))
                
                if extracted:
                    send_progress_sync(task_id, "transcribing", 10, "Loading Whisper model...")
                    
                    whisper = get_whisper_service()
                    if whisper.is_available():
                        send_progress_sync(task_id, "transcribing", 15, "Transcribing video audio...")
                        
                        # Calculate transcribe progress range (15% to transcribe_end-10%)
                        transcribe_progress_start = 15
                        transcribe_progress_end = transcribe_end - 10
                        
                        def video_transcribe_callback(current, total, msg):
                            pct = transcribe_progress_start + int((current / max(total, 1)) * (transcribe_progress_end - transcribe_progress_start))
                            send_progress_sync(task_id, "transcribing", pct, msg)
                        
                        transcript_result = whisper.transcribe_and_save(
                            extracted,
                            output_dir=str(output_dir),
                            language=language,
                            progress_callback=video_transcribe_callback,
                            skip_alignment_pitch=True  # Video files skip Wav2Vec2 alignment and pitch extraction
                        )
                        results["transcript"] = transcript_result
                        
                        if transcript_result.get("success"):
                            # Calculate progress ranges for annotation stages
                            # If YOLO/CLIP selected, annotations get smaller ranges
                            has_additional_tasks = yolo_annotation or clip_annotation
                            if has_additional_tasks:
                                spacy_start = transcribe_end - 15
                                usas_start = transcribe_end - 10
                                mipvu_start = transcribe_end - 5
                                annotation_end = transcribe_end
                            else:
                                spacy_start = transcribe_end - 30
                                usas_start = transcribe_end - 20
                                mipvu_start = transcribe_end - 10
                                annotation_end = transcribe_end
                            
                            send_progress_sync(task_id, "spacy", spacy_start, "Running SpaCy annotation on transcript...")
                            
                            # SpaCy annotation
                            spacy_svc = get_spacy_service()
                            spacy_result = None
                            json_path = transcript_result.get('json_path')
                            transcript_data = None
                            segments = []
                            
                            if spacy_svc.is_available(language):
                                if json_path and os.path.exists(json_path):
                                    with open(json_path, 'r', encoding='utf-8') as f:
                                        transcript_data = json.load(f)
                                    
                                    segments = transcript_data.get('segments', [])
                                    if segments:
                                        spacy_result = spacy_svc.annotate_segments(segments, language)
                                        results["spacy"] = spacy_result
                                        
                                        if spacy_result.get("success"):
                                            transcript_data['spacy_annotations'] = spacy_result
                            
                            # USAS annotation (only for Chinese and English)
                            send_progress_sync(task_id, "usas", usas_start, "Running USAS annotation...")
                            
                            from services.usas_service import get_usas_service
                            usas_svc = get_usas_service()
                            
                            if usas_svc.is_available(language) and transcript_data and segments:
                                text_type = corpus.get('text_type') if corpus else None
                                
                                usas_result = usas_svc.annotate_segments(segments, language, text_type)
                                if usas_result.get("success"):
                                    transcript_data['usas_annotations'] = usas_result
                                    results["usas"] = usas_result
                            
                            # MIPVU annotation (only for English)
                            send_progress_sync(task_id, "mipvu", mipvu_start, "Running MIPVU annotation...")
                            
                            from services.mipvu_service import get_mipvu_service
                            mipvu_svc = get_mipvu_service()
                            
                            if mipvu_svc.is_available(language) and transcript_data and segments and spacy_result:
                                def video_mipvu_callback(progress, message):
                                    pct = mipvu_start + int(progress * (annotation_end - mipvu_start) / 100)
                                    send_progress_sync(task_id, "mipvu", pct, message)
                                
                                # Merge SpaCy data into segments for MIPVU
                                spacy_segments = spacy_result.get('segments', {})
                                segments_with_spacy = []
                                for seg in segments:
                                    seg_id = seg.get('id', 0)
                                    seg_spacy = spacy_segments.get(seg_id, spacy_segments.get(str(seg_id), {}))
                                    # Convert SpaCy segment format to MIPVU expected format
                                    spacy_data = None
                                    if seg_spacy and seg_spacy.get('tokens'):
                                        spacy_data = {
                                            'sentences': [{
                                                'tokens': [
                                                    {
                                                        'word': t.get('text', ''),
                                                        'lemma': t.get('lemma', ''),
                                                        'pos': t.get('pos', ''),
                                                        'tag': t.get('tag', ''),
                                                        'dep': t.get('dep', '')
                                                    } for t in seg_spacy.get('tokens', [])
                                                ]
                                            }]
                                        }
                                    segments_with_spacy.append({**seg, 'spacy_data': spacy_data})
                                
                                mipvu_result = mipvu_svc.annotate_segments(segments_with_spacy, language, video_mipvu_callback)
                                if mipvu_result:
                                    mipvu_annotations = {"success": True, "segments": mipvu_result}
                                    transcript_data['mipvu_annotations'] = mipvu_annotations
                                    results["mipvu"] = mipvu_annotations
                            
                            # Save all annotations to transcript JSON
                            if transcript_data and json_path:
                                with open(json_path, 'w', encoding='utf-8') as f:
                                    json.dump(transcript_data, f, ensure_ascii=False, indent=2)
                            
                            # Update database with transcript info (don't send database stage yet if YOLO is pending)
                            update_data = {
                                'audio_path': extracted,
                                'content_path': transcript_result.get('txt_path'),
                                'transcript_path': transcript_result.get('txt_path'),
                                'transcript_json_path': transcript_result.get('json_path'),
                                'has_timestamps': True,
                                'word_count': transcript_result['data'].get('total_words', 0),
                                'duration': transcript_result['data'].get('total_duration')
                            }
                            TextDB.update(text_id, update_data)
                            
                            # If no YOLO, send database stage here
                            if not yolo_annotation:
                                send_progress_sync(task_id, "database", 95, "Saving to database...")
                        else:
                            logger.error(f"Transcription failed: {transcript_result.get('error')}")
                            send_progress_sync(task_id, "warning", 60, f"Transcription failed: {transcript_result.get('error')}")
                    else:
                        send_progress_sync(task_id, "warning", 60, "Whisper model not available")
                else:
                    send_progress_sync(task_id, "warning", 60, "Failed to extract audio from video")
            
            # YOLO detection
            if yolo_annotation:
                logger.info(f"=== YOLO annotation requested for task {task_id} ===")
                send_progress_sync(task_id, "yolo", yolo_start, "Loading YOLO model...")
                
                yolo = get_yolo_service()
                logger.info(f"YOLO service available: {yolo.is_available()}, model_path: {yolo.model_path}")
                
                if yolo.is_available():
                    send_progress_sync(task_id, "yolo", yolo_start + 3, "Initializing YOLO model...")
                    
                    # Try to initialize
                    init_success = yolo.initialize()
                    logger.info(f"YOLO initialization result: {init_success}")
                    
                    if init_success:
                        yolo_process_start = yolo_start + 5
                        send_progress_sync(task_id, "yolo", yolo_process_start, "Running YOLO object detection...")
                        
                        def yolo_progress_callback(current, total, msg):
                            # Progress from yolo_process_start to yolo_end
                            pct = yolo_process_start + int((current / max(total, 1)) * (yolo_end - yolo_process_start))
                            send_progress_sync(task_id, "yolo", pct, msg)
                        
                        yolo_result = yolo.process_video(
                            str(video_path),
                            output_dir=str(output_dir),
                            extract_frames=True,
                            progress_callback=yolo_progress_callback
                        )
                        results["yolo"] = yolo_result
                        logger.info(f"YOLO processing result: success={yolo_result.get('success')}, tracks={yolo_result.get('data', {}).get('total_tracks', 0)}")
                        
                        if yolo_result.get("success"):
                            TextDB.update(text_id, {
                                'yolo_annotation_path': yolo_result.get('json_path')
                            })
                            send_progress_sync(task_id, "yolo", yolo_end - 2, f"YOLO completed: {yolo_result.get('data', {}).get('total_tracks', 0)} tracks detected")
                        else:
                            logger.error(f"YOLO processing failed: {yolo_result.get('error')}")
                            send_progress_sync(task_id, "yolo", yolo_end - 2, f"YOLO failed: {yolo_result.get('error', 'Unknown error')}")
                    else:
                        logger.error("YOLO model initialization failed")
                        send_progress_sync(task_id, "yolo", yolo_end - 2, "YOLO model initialization failed")
                else:
                    logger.warning(f"YOLO model not available at: {yolo.model_path}")
                    send_progress_sync(task_id, "yolo", yolo_end - 2, f"YOLO model not available")
            else:
                logger.info(f"YOLO annotation not requested for task {task_id}")
            
            # CLIP classification
            if clip_annotation:
                logger.info(f"=== CLIP annotation requested for task {task_id} ===")
                send_progress_sync(task_id, "clip", clip_start, "Loading CLIP model...")
                
                from services.clip_service import get_clip_service
                
                clip = get_clip_service()
                logger.info(f"CLIP service available: {clip.is_available()}, model_path: {clip.model_path}")
                
                if clip.is_available():
                    send_progress_sync(task_id, "clip", clip_start + 3, "Initializing CLIP model...")
                    
                    # Try to initialize
                    init_success = clip.initialize()
                    logger.info(f"CLIP initialization result: {init_success}")
                    
                    if init_success:
                        clip_process_start = clip_start + 5
                        send_progress_sync(task_id, "clip", clip_process_start, "Running CLIP classification...")
                        
                        def clip_progress_callback(current, total, msg):
                            # Progress from clip_process_start to 92
                            pct = clip_process_start + int((current / max(total, 1)) * (92 - clip_process_start))
                            send_progress_sync(task_id, "clip", pct, msg)
                        
                        clip_result = clip.process_video(
                            str(video_path),
                            output_dir=str(output_dir),
                            labels=clip_labels if clip_labels else None,
                            frame_interval=clip_frame_interval,
                            progress_callback=clip_progress_callback
                        )
                        results["clip"] = clip_result
                        logger.info(f"CLIP processing result: success={clip_result.get('success')}, frames={len(clip_result.get('data', {}).get('frame_results', []))}")
                        
                        if clip_result.get("success"):
                            TextDB.update(text_id, {
                                'clip_annotation_path': clip_result.get('json_path')
                            })
                            frame_count = len(clip_result.get('data', {}).get('frame_results', []))
                            send_progress_sync(task_id, "clip", 93, f"CLIP completed: {frame_count} frames classified")
                        else:
                            logger.error(f"CLIP processing failed: {clip_result.get('error')}")
                            send_progress_sync(task_id, "clip", 93, f"CLIP failed: {clip_result.get('error', 'Unknown error')}")
                    else:
                        logger.error("CLIP model initialization failed")
                        send_progress_sync(task_id, "clip", 93, "CLIP model initialization failed")
                else:
                    logger.warning(f"CLIP model not available at: {clip.model_path}")
                    send_progress_sync(task_id, "clip", 93, f"CLIP model not available")
            else:
                logger.info(f"CLIP annotation not requested for task {task_id}")
            
            # Send database stage
            if yolo_annotation or clip_annotation:
                send_progress_sync(task_id, "database", 95, "Saving to database...")
            
            # Build final result
            final_result = {
                "word_count": 0,
                "duration": 0,
                "segments": 0,
                "yolo_tracks": 0,
                "clip_frames": 0
            }
            
            if results["transcript"] and results["transcript"].get("success"):
                final_result["word_count"] = results["transcript"]['data'].get('total_words', 0)
                final_result["duration"] = results["transcript"]['data'].get('total_duration', 0)
                final_result["segments"] = len(results["transcript"]['data'].get('segments', []))
            
            if results["yolo"] and results["yolo"].get("success"):
                final_result["yolo_tracks"] = results["yolo"]['data'].get('total_tracks', 0)
            
            if results["clip"] and results["clip"].get("success"):
                final_result["clip_frames"] = len(results["clip"].get('data', {}).get('frame_results', []))
            
            send_progress_sync(task_id, "completed", 100, "Video processing completed",
                              status="completed", result=final_result)
            
            logger.info(f"=== Background processing completed for task {task_id} ===")
            
    except Exception as e:
        logger.error(f"Background processing error for task {task_id}: {e}")
        import traceback
        traceback.print_exc()
        send_progress_sync(task_id, "error", 0, f"Processing failed: {str(e)}", 
                          status="failed")


@router.post("/{corpus_id}/upload")
async def upload_files(
    corpus_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    config: str = Form("{}")
):
    """
    Upload files to corpus - ASYNC processing for audio/video
    Text files are processed synchronously, audio/video are processed in background
    Returns task_id for tracking progress via SSE
    
    Config JSON format:
    {
        "transcribe": true,
        "yolo_annotation": false,
        "clip_annotation": false,
        "clip_labels": ["person", "indoor", "action"],
        "language": "en",
        "tags": ["tag1", "tag2"],
        "metadata": {"author": "...", "source": "..."}
    }
    """
    logger.info(f"=== POST /{corpus_id}/upload called with {len(files)} files ===")
    logger.info(f"=== Config: {config} ===")
    
    service = get_corpus_service()
    corpus = service.get_corpus(corpus_id)
    if not corpus:
        logger.error(f"=== Corpus {corpus_id} not found ===")
        raise HTTPException(status_code=404, detail="Corpus not found")
    
    # Parse config
    try:
        config_data = json.loads(config)
        logger.info(f"=== Parsed config: {config_data} ===")
    except Exception as e:
        logger.warning(f"=== Failed to parse config: {e}, using defaults ===")
        config_data = {}
    
    transcribe = config_data.get("transcribe", True)
    yolo_annotation = config_data.get("yolo_annotation", False)
    clip_annotation = config_data.get("clip_annotation", False)
    clip_labels = config_data.get("clip_labels", [])
    clip_frame_interval = config_data.get("clip_frame_interval", 30)
    language = config_data.get("language") or corpus.get('language', 'english')
    tags = config_data.get("tags", [])
    metadata_dict = config_data.get("metadata", {})
    
    logger.info(f"=== Upload config: transcribe={transcribe}, yolo_annotation={yolo_annotation}, clip_annotation={clip_annotation}, clip_frame_interval={clip_frame_interval}, language={language} ===")
    
    # Build upload config
    metadata = TextMetadata(**metadata_dict) if metadata_dict else None
    upload_config = UploadConfig(
        corpus_id=corpus_id,
        transcribe=transcribe,
        yolo_annotation=yolo_annotation,
        language=language,
        metadata=metadata,
        tags=tags
    )
    
    results = []
    
    for file in files:
        try:
            logger.info(f"=== Processing file: {file.filename} ===")
            
            # Read file content
            content = await file.read()
            
            # Determine media type
            media_type = get_media_type(file.filename, file.content_type)
            
            # Save file (includes SpaCy annotation for text files)
            save_result = service.save_uploaded_file(
                corpus_id,
                content,
                file.filename,
                media_type,
                upload_config
            )
            
            if not save_result.get("success"):
                results.append(UploadResult(
                    success=False,
                    filename=file.filename,
                    media_type=media_type,
                    message=save_result.get("error")
                ))
                continue
            
            text_id = save_result["data"]["text_id"]
            save_path = save_result["data"]["save_path"]
            
            # ASYNC processing for audio/video
            if media_type in [MediaType.AUDIO, MediaType.VIDEO] and (transcribe or yolo_annotation or clip_annotation):
                # Create task for tracking
                task_id = str(uuid.uuid4())
                task_type = "transcribe" if media_type == MediaType.AUDIO else "video_process"
                
                TaskDB.create({
                    "id": task_id,
                    "corpus_id": corpus_id,
                    "text_id": text_id,
                    "task_type": task_type,
                    "status": "pending",
                    "message": f"Processing {file.filename}..."
                })
                
                # Create progress queue for SSE
                create_progress_queue(task_id)
                
                # Add background task (synchronous function)
                background_tasks.add_task(
                    process_media_file_sync,
                    task_id,
                    text_id,
                    save_path,
                    media_type,
                    transcribe,
                    yolo_annotation,
                    clip_annotation,
                    clip_labels,
                    clip_frame_interval,
                    language
                )
                
                logger.info(f"=== Created background task {task_id} for {file.filename} ===")
                
                results.append(UploadResult(
                    success=True,
                    text_id=text_id,
                    task_id=task_id,
                    filename=file.filename,
                    media_type=media_type,
                    message=f"File saved, processing started (task: {task_id})"
                ))
            
            # Text file handling
            elif media_type == MediaType.TEXT:
                needs_async_spacy = save_result["data"].get("needs_async_spacy", False)
                logger.info(f"=== Text file {file.filename}: needs_async_spacy={needs_async_spacy} ===")
                
                if needs_async_spacy:
                    # Large text - create background task for SpaCy
                    task_id = str(uuid.uuid4())
                    
                    TaskDB.create({
                        "id": task_id,
                        "corpus_id": corpus_id,
                        "text_id": text_id,
                        "task_type": "spacy_annotation",
                        "status": "pending",
                        "message": f"SpaCy annotation for {file.filename}..."
                    })
                    
                    create_progress_queue(task_id)
                    
                    # Get text_type from metadata if available
                    text_type = None
                    if upload_config.metadata and upload_config.metadata.customFields:
                        text_type = upload_config.metadata.customFields.get("textType")
                    
                    # Add background task
                    background_tasks.add_task(
                        process_text_spacy_sync,
                        task_id,
                        text_id,
                        save_path,
                        save_result["data"].get("save_dir"),
                        save_result["data"].get("corpus_language", "english"),
                        text_type
                    )
                    
                    logger.info(f"=== Created SpaCy background task {task_id} for large text {file.filename} ===")
                    
                    results.append(UploadResult(
                        success=True,
                        text_id=text_id,
                        task_id=task_id,
                        filename=file.filename,
                        media_type=media_type,
                        message=f"File saved, SpaCy annotation in progress (task: {task_id})"
                    ))
                else:
                    # Small text - already processed with SpaCy in save_uploaded_file
                    spacy_info = save_result["data"].get("spacy_annotation")
                    if spacy_info:
                        results.append(UploadResult(
                            success=True,
                            text_id=text_id,
                            filename=file.filename,
                            media_type=media_type,
                            message=f"Uploaded with SpaCy annotation ({spacy_info.get('tokens', 0)} tokens, {spacy_info.get('entities', 0)} entities)"
                        ))
                    else:
                        results.append(UploadResult(
                            success=True,
                            text_id=text_id,
                            filename=file.filename,
                            media_type=media_type,
                            message="Uploaded successfully"
                        ))
            
            else:
                # Other file types
                results.append(UploadResult(
                    success=True,
                    text_id=text_id,
                    filename=file.filename,
                    media_type=media_type,
                    message="Uploaded successfully"
                ))
                
        except Exception as e:
            logger.error(f"=== Error processing file {file.filename}: {e} ===")
            import traceback
            traceback.print_exc()
            results.append(UploadResult(
                success=False,
                filename=file.filename,
                media_type=MediaType.TEXT,
                message=str(e)
            ))
    
    logger.info(f"=== Upload complete: {len([r for r in results if r.success])}/{len(files)} successful ===")
    return {
        "success": True,
        "data": [r.dict() for r in results],
        "message": f"Uploaded {len([r for r in results if r.success])} of {len(files)} files"
    }


# ==================== Task Status ====================

@router.get("/{corpus_id}/tasks")
async def list_corpus_tasks(corpus_id: str):
    """List all tasks for a corpus"""
    tasks = TaskDB.list_by_corpus(corpus_id)
    return {
        "success": True,
        "data": tasks
    }


