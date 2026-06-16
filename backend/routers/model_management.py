"""
Model Management API Router

Allows listing/downloading/deleting user-downloaded models.

Download uses ModelScope's `snapshot_download` and integrates with the existing
SSE progress system based on `TaskDB` and `routers.corpus` queue helpers.
"""

from __future__ import annotations

import json
import multiprocessing
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from model_paths import (
    BUILTIN_MODEL_RELATIVE_PATHS,
    get_user_models_dir,
    read_builtin_models_marker,
    get_bundled_models_dir,
    resolve_model_path,
    set_download_root_override,
    write_download_root_override,
    copy_built_in_models_to_user_models,
)

from routers.model_manifest_constants import WAV2VEC2_MODELSCOPE_MODEL_ID

from models.database import TaskDB

# Reuse the existing SSE progress queue implementation.
from routers.corpus import create_progress_queue, send_progress_sync

router = APIRouter()

DOWNLOAD_COMPLETE_MARKER = ".meta-lingo-download-complete.json"

_download_lock = threading.Lock()
_active_downloads: Dict[str, Dict[str, Any]] = {}  # task_id -> {process, local_dir, model_id, err_queue?}
_download_queue: List[Dict[str, str]] = []  # [{"task_id": "...", "model_id": "..."}]
_current_download_task_id: Optional[str] = None


def _snapshot_download_worker(repo_id: str, local_dir: str, err_queue: "multiprocessing.Queue") -> None:
    try:
        from modelscope import snapshot_download
        snapshot_download(
            model_id=repo_id,
            local_dir=local_dir,
        )
    except Exception as e:
        try:
            err_queue.put({"error": repr(e)}, block=False)
        except Exception:
            pass
        raise


def _queue_position(task_id: str) -> int:
    for i, item in enumerate(_download_queue, start=1):
        if item.get("task_id") == task_id:
            return i
    return 0


def _start_next_download_locked() -> None:
    """
    Start next queued download if idle.
    Must be called with _download_lock held.
    """
    global _current_download_task_id
    if _current_download_task_id is not None:
        return
    if not _download_queue:
        return

    next_item = _download_queue.pop(0)
    task_id = next_item["task_id"]
    model_id = next_item["model_id"]
    _current_download_task_id = task_id
    model = next((m for m in MODEL_MANIFEST if m["id"] == model_id), None)
    if model:
        local_dir = get_user_models_dir() / model["storageRelativePath"]
        _active_downloads[task_id] = {
            "process": None,
            "local_dir": str(local_dir),
            "model_id": model_id,
        }

    t = threading.Thread(target=_download_model_task, args=(task_id, model_id), daemon=True)
    t.start()


MODEL_MANIFEST: List[Dict[str, Any]] = [
    # Speech-to-text
    {
        "id": "whisper-large-v3-turbo",
        "moduleLabel": "Speech-to-text",
        "displayName": "Whisper (large-v3-turbo)",
        "modelScopeRepoId": "openai-mirror/whisper-large-v3-turbo",
        "storageRelativePath": "multimodal_analyzer/whisper-large-v3-turbo",
        "protected": "multimodal_analyzer/whisper-large-v3-turbo" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
    # Video object detection
    {
        "id": "yolov8-weights",
        "moduleLabel": "Video object detection",
        "displayName": "YOLOv8 (weights)",
        "modelScopeRepoId": "yolo_master/yolov8-weights",
        "storageRelativePath": "multimodal_analyzer/yolov8",
        "protected": "multimodal_analyzer/yolov8" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": ["yolov8x.pt"],
    },
    # CLIP semantic
    {
        "id": "clip-vit-large-patch14",
        "moduleLabel": "Semantic embeddings",
        "displayName": "CLIP (ViT-L/14)",
        "modelScopeRepoId": "AI-ModelScope/clip-vit-large-patch14",
        "storageRelativePath": "multimodal_analyzer/clip-vit-large-patch14",
        "protected": "multimodal_analyzer/clip-vit-large-patch14" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
    # Alignment — weights from ModelScope (facebook/wav2vec2-base-960h)
    {
        "id": "wav2vec2-base-960h",
        "moduleLabel": "Alignment",
        "displayName": "Wav2Vec2 (base-960h)",
        "modelScopeRepoId": WAV2VEC2_MODELSCOPE_MODEL_ID,
        "storageRelativePath": "multimodal_analyzer/wav2vec2-base-960h",
        "protected": "multimodal_analyzer/wav2vec2-base-960h" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
    # Sentence embeddings (SBERT)
    {
        "id": "sbert-paraphrase-multilingual-minilm-l12-v2",
        "moduleLabel": "Semantic embeddings",
        "displayName": "SBERT (paraphrase-multilingual-MiniLM-L12-v2)",
        "modelScopeRepoId": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        "storageRelativePath": "sentence_embeddings/paraphrase-multilingual-MiniLM-L12-v2",
        "protected": "sentence_embeddings/paraphrase-multilingual-MiniLM-L12-v2" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
    # PyMUSAS Neural
    {
        "id": "pymusas-neural-multilingual-base-bem",
        "moduleLabel": "USAS (semantic tagging)",
        "displayName": "PyMUSAS Neural (Multilingual Base BEM)",
        "modelScopeRepoId": "TommyLeo/ucrelnlp-PyMUSAS-Neural-Multilingual-Base-BEM",
        "storageRelativePath": "pymusas/PyMUSAS-Neural-Multilingual-Base-BEM",
        "protected": "pymusas/PyMUSAS-Neural-Multilingual-Base-BEM" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": ["config.json"],
    },
    # MIPVU DeBERTa (metalingo-indirect-metaphor) — indirect metaphor
    {
        "id": "metalingo-indirect-metaphor",
        "moduleLabel": "MIPVU (metaphor detection)",
        "displayName": "MIPVU DeBERTa (metalingo-indirect-metaphor)",
        "modelScopeRepoId": "TommyLeo/metalingo-indirect-metaphor",
        "storageRelativePath": "metaphor_identification/metalingo-indirect-metaphor",
        "protected": "metaphor_identification/metalingo-indirect-metaphor" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
    # DeBERTa direct metaphor (metalingo-direct-metaphor)
    {
        "id": "metalingo-direct-metaphor",
        "moduleLabel": "MIPVU (direct metaphor detection)",
        "displayName": "MIPVU DeBERTa (metalingo-direct-metaphor)",
        "modelScopeRepoId": "TommyLeo/metalingo-direct-metaphor",
        "storageRelativePath": "metaphor_identification/metalingo-direct-metaphor",
        "protected": "metaphor_identification/metalingo-direct-metaphor" in BUILTIN_MODEL_RELATIVE_PATHS,
        "expectedRelativeFiles": [],
    },
]


@router.get("/download-path")
async def get_download_path() -> Dict[str, Any]:
    """
    Get current models download root (absolute directory).

    In packaged mode: usually userData/models.
    In dev mode: defaults to ./saves/models unless the user overrides it.
    """
    root = get_user_models_dir()
    return {"success": True, "data": {"downloadRoot": str(root)}}


@router.put("/download-path")
async def set_download_path(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Set a new models download root directory.
    Creates the directory (and required built-in model subfolders) automatically.
    """
    root = data.get("root")
    if not isinstance(root, str) or not root.strip():
        raise HTTPException(status_code=400, detail="Missing 'root' string")

    try:
        new_root = set_download_root_override(root)
        # Ensure built-in models exist under the new root.
        copy_built_in_models_to_user_models()
        return {"success": True, "data": {"downloadRoot": str(new_root)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set download path: {e}")


@router.delete("/download-path")
async def clear_download_path_override() -> Dict[str, Any]:
    """
    Clear user override so defaults apply again.
    """
    try:
        write_download_root_override(None)
        copy_built_in_models_to_user_models()
        root = get_user_models_dir()
        return {"success": True, "data": {"downloadRoot": str(root)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear download path override: {e}")


def _expected_files_exist(model_dir: Path, expected_relative_files: List[str]) -> bool:
    for rel in expected_relative_files:
        if not (model_dir / rel).exists():
            return False
    return True


def _is_installed(storage_relative_path: str, expected_relative_files: List[str]) -> bool:
    resolved = resolve_model_path(storage_relative_path)
    if not resolved or not resolved.exists():
        return False

    # If the resolved path is under the user download root, require a completion marker
    # to avoid treating partially-downloaded folders as "installed" (common during concurrent downloads).
    try:
        user_root = get_user_models_dir().resolve()
        resolved_abs = resolved.resolve()
        is_user_download = user_root == resolved_abs or user_root in resolved_abs.parents
    except Exception:
        is_user_download = False

    if is_user_download:
        marker = resolved / DOWNLOAD_COMPLETE_MARKER
        return marker.exists()

    # Bundled fallback: accept expected files (or dir existence when list is empty).
    return _expected_files_exist(resolved, expected_relative_files)

def _get_install_source(storage_relative_path: str, expected_relative_files: List[str]) -> str:
    """
    installed_source:
    - downloaded: exists under current download root (get_user_models_dir)
    - bundled:    exists only in bundled fallback (dev: repo ./models; packaged: bundled resources)
    - missing:    not installed anywhere
    """
    user_candidate = get_user_models_dir() / storage_relative_path
    if user_candidate.exists():
        marker = user_candidate / DOWNLOAD_COMPLETE_MARKER
        if marker.exists():
            return "downloaded"

    bundled_candidate = get_bundled_models_dir() / storage_relative_path
    if bundled_candidate.exists() and _expected_files_exist(bundled_candidate, expected_relative_files):
        return "bundled"

    return "missing"


@router.get("/models")
async def list_models() -> Dict[str, Any]:
    built_in_rels = read_builtin_models_marker()
    user_models_dir = get_user_models_dir()
    bundled_models_dir = get_bundled_models_dir()
    with _download_lock:
        active_by_model: Dict[str, str] = {
            v.get("model_id"): k
            for k, v in _active_downloads.items()
            if isinstance(v, dict) and isinstance(v.get("model_id"), str)
        }
        queued_by_model: Dict[str, Dict[str, Any]] = {}
        for idx, item in enumerate(_download_queue, start=1):
            mid = item.get("model_id")
            tid = item.get("task_id")
            if isinstance(mid, str) and isinstance(tid, str):
                queued_by_model[mid] = {"taskId": tid, "position": idx}

    models_out: List[Dict[str, Any]] = []
    for m in MODEL_MANIFEST:
        rel = m["storageRelativePath"]
        resolved = resolve_model_path(rel)
        installed = _is_installed(rel, m.get("expectedRelativeFiles", []))
        installed_source = _get_install_source(rel, m.get("expectedRelativeFiles", []))
        active_task_id = active_by_model.get(m["id"])
        queued_info = queued_by_model.get(m["id"])

        models_out.append(
            {
                "id": m["id"],
                "moduleLabel": m["moduleLabel"],
                "displayName": m["displayName"],
                "modelScopeRepoId": m["modelScopeRepoId"],
                "storageRelativePath": m["storageRelativePath"],
                "installed": installed,
                "installedSource": installed_source,
                "downloading": bool(active_task_id),
                "activeTaskId": active_task_id,
                "queued": bool(queued_info),
                "queuePosition": queued_info.get("position") if queued_info else None,
                "queuedTaskId": queued_info.get("taskId") if queued_info else None,
                "protected": rel in built_in_rels or m.get("protected", False),
                # Prefer showing the effective resolved path; otherwise show the default download target.
                "modelPath": str(resolved or (user_models_dir / rel)),
                "downloadPath": str(user_models_dir / rel),
                "bundledPath": str(bundled_models_dir / rel),
            }
        )
    return {"success": True, "data": models_out}


def _download_model_task(task_id: str, model_id: str) -> None:
    """Runs after HTTP response; see download_model for pre-registration in _active_downloads."""
    global _current_download_task_id

    def _pop_active() -> None:
        global _current_download_task_id
        with _download_lock:
            _active_downloads.pop(task_id, None)
            if _current_download_task_id == task_id:
                _current_download_task_id = None
                _start_next_download_locked()

    model = next((m for m in MODEL_MANIFEST if m["id"] == model_id), None)
    if not model:
        send_progress_sync(task_id, "error", 0, f"Unknown model id: {model_id}", status="failed")
        _pop_active()
        return

    storage_rel = model["storageRelativePath"]
    protected = storage_rel in read_builtin_models_marker() or model.get("protected", False)
    if protected:
        send_progress_sync(task_id, "error", 0, "This model is built-in and cannot be downloaded.", status="failed")
        _pop_active()
        return

    local_dir = get_user_models_dir() / storage_rel
    repo_id = model["modelScopeRepoId"]

    # User may cancel before this background task starts (pre-registered row, process still None).
    with _download_lock:
        _pre_cancelled = bool(_active_downloads.get(task_id, {}).get("cancelled"))
    if _pre_cancelled:
        try:
            shutil.rmtree(local_dir, ignore_errors=True)
        except Exception:
            pass
        send_progress_sync(task_id, "cancelled", 0, "Download cancelled", status="cancelled")
        _pop_active()
        return

    # Best-effort UI progress: bump progress periodically while snapshot_download runs.
    stop_evt = threading.Event()

    def progress_loop() -> None:
        progress_values = [10, 20, 35, 50, 65, 75, 85, 92]
        i = 0
        while not stop_evt.is_set():
            p = progress_values[min(i, len(progress_values) - 1)]
            send_progress_sync(task_id, "download", p, "Downloading model...", status="processing")
            i += 1
            time.sleep(2.0)

    thread = threading.Thread(target=progress_loop, daemon=True)
    thread.start()

    def _flatten_single_nested_dir(target: Path) -> None:
        """
        Some download tools may place files under an extra nested directory.
        If `target/` contains exactly one directory and no files, move the nested
        directory contents up to `target/`.
        """
        try:
            if not target.exists() or not target.is_dir():
                return
            children = [p for p in target.iterdir() if p.name not in (".DS_Store",)]
            if not children:
                return
            dirs = [p for p in children if p.is_dir()]
            files = [p for p in children if p.is_file()]
            if files:
                return
            if len(dirs) != 1:
                return
            nested = dirs[0]
            for item in nested.iterdir():
                shutil.move(str(item), str(target / item.name))
            shutil.rmtree(nested, ignore_errors=True)
        except Exception:
            # Best-effort; never fail the overall download because of flatten.
            return

    try:
        local_dir.parent.mkdir(parents=True, exist_ok=True)
        send_progress_sync(task_id, "initializing", 5, "Preparing download...", status="processing")

        send_progress_sync(task_id, "download", 15, "Starting snapshot download...", status="processing")

        err_queue: "multiprocessing.Queue" = multiprocessing.Queue()
        proc = multiprocessing.Process(
            target=_snapshot_download_worker,
            args=(repo_id, str(local_dir), err_queue),
            daemon=True,
        )
        with _download_lock:
            prior = _active_downloads.get(task_id, {})
            _active_downloads[task_id] = {
                "process": proc,
                "local_dir": str(local_dir),
                "model_id": model_id,
                "err_queue": err_queue,
                "cancelled": bool(prior.get("cancelled")),
            }
        proc.start()

        # Wait loop so we can support cancellation.
        while proc.is_alive():
            with _download_lock:
                cancelled = _active_downloads.get(task_id, {}).get("cancelled", False)
            if cancelled:
                try:
                    proc.terminate()
                except Exception:
                    pass
                proc.join(timeout=5)
                stop_evt.set()
                # Remove partial downloads
                try:
                    shutil.rmtree(local_dir, ignore_errors=True)
                    marker = local_dir / DOWNLOAD_COMPLETE_MARKER
                    if marker.exists():
                        marker.unlink()
                except Exception:
                    pass
                send_progress_sync(task_id, "cancelled", 0, "Download cancelled", status="cancelled")
                with _download_lock:
                    _active_downloads.pop(task_id, None)
                    if _current_download_task_id == task_id:
                        _current_download_task_id = None
                        _start_next_download_locked()
                return
            time.sleep(0.5)

        proc.join(timeout=1)
        err_msg = None
        try:
            while True:
                item = err_queue.get_nowait()
                if isinstance(item, dict) and item.get("error"):
                    err_msg = str(item.get("error"))
                    break
        except Exception:
            pass

        if proc.exitcode != 0:
            with _download_lock:
                _active_downloads.pop(task_id, None)
                if _current_download_task_id == task_id:
                    _current_download_task_id = None
                    _start_next_download_locked()
            stop_evt.set()
            send_progress_sync(
                task_id,
                "error",
                0,
                f"Download failed: {err_msg}" if err_msg else f"Download failed (exit code {proc.exitcode})",
                status="failed",
            )
            return

        stop_evt.set()
        send_progress_sync(task_id, "verifying", 98, "Verifying files...", status="processing")

        _flatten_single_nested_dir(local_dir)

        # Final sanity check: ensure the directory is non-empty.
        try:
            has_any = local_dir.exists() and any(local_dir.iterdir())
        except Exception:
            has_any = False

        if not has_any:
            with _download_lock:
                _active_downloads.pop(task_id, None)
                if _current_download_task_id == task_id:
                    _current_download_task_id = None
                    _start_next_download_locked()
            send_progress_sync(task_id, "error", 0, "Download finished but files were not found in target folder.", status="failed")
            return

        # Write a completion marker so the UI doesn't treat partial folders as installed.
        try:
            (local_dir / DOWNLOAD_COMPLETE_MARKER).write_text(
                json.dumps(
                    {
                        "modelId": model_id,
                        "repoId": repo_id,
                        "storageRelativePath": storage_rel,
                        "completedAt": time.time(),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass

        send_progress_sync(task_id, "completed", 100, "Download completed", status="completed", result={"installed": True})
        with _download_lock:
            _active_downloads.pop(task_id, None)
            if _current_download_task_id == task_id:
                _current_download_task_id = None
                _start_next_download_locked()
    except Exception as e:
        stop_evt.set()
        send_progress_sync(task_id, "error", 0, f"Download failed: {e}", status="failed")
        _pop_active()


@router.post("/downloads/{task_id}/cancel")
async def cancel_download(task_id: str) -> Dict[str, Any]:
    """
    Cancel an in-flight model download task.
    Best-effort: terminates the download process and deletes partial files.
    """
    queued_updates: List[Dict[str, Any]] = []
    cancelled_queued = False
    with _download_lock:
        # Cancel queued task before it starts.
        for i, item in enumerate(_download_queue):
            if item.get("task_id") == task_id:
                _download_queue.pop(i)
                send_progress_sync(task_id, "cancelled", 0, "Download cancelled", status="cancelled")
                for idx, q in enumerate(_download_queue, start=1):
                    q_tid = q.get("task_id")
                    if isinstance(q_tid, str):
                        queued_updates.append({"task_id": q_tid, "position": idx})
                cancelled_queued = True
                break

        if not cancelled_queued:
            entry = _active_downloads.get(task_id)
            if not entry:
                raise HTTPException(status_code=404, detail="Download task not found or already finished")
            entry["cancelled"] = True
    for item in queued_updates:
        send_progress_sync(
            item["task_id"],
            "queued",
            0,
            f"Queued (position {item['position']})",
            status="pending",
        )
    return {"success": True, "data": {"task_id": task_id, "cancelled": True}}


@router.post("/models/{model_id}/download")
async def download_model(model_id: str) -> Dict[str, Any]:
    model = next((m for m in MODEL_MANIFEST if m["id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    storage_rel = model["storageRelativePath"]
    protected = storage_rel in read_builtin_models_marker() or model.get("protected", False)
    if protected:
        raise HTTPException(status_code=409, detail="This model is built-in and cannot be downloaded")

    task_id = str(uuid.uuid4())

    TaskDB.create(
        {
            "id": task_id,
            "task_type": "model_download",
            "status": "pending",
            "message": f"Starting download: {model['displayName']}",
        }
    )

    create_progress_queue(task_id)

    local_dir = get_user_models_dir() / storage_rel
    with _download_lock:
        _download_queue.append({"task_id": task_id, "model_id": model_id})
        pos = _queue_position(task_id)
        _start_next_download_locked()
        started_now = _current_download_task_id == task_id

    if started_now:
        send_progress_sync(task_id, "queued", 0, "Download started", status="processing")
    else:
        send_progress_sync(task_id, "queued", 0, f"Queued (position {pos})", status="pending")

    return {"success": True, "data": {"task_id": task_id, "queued": (not started_now), "queue_position": pos}}

@router.get("/downloads/active")
async def list_active_downloads() -> Dict[str, Any]:
    """
    Return active download tasks keyed by model_id.
    Useful for UI to recover state if SSE disconnects.
    """
    with _download_lock:
        active = {}
        for task_id, entry in _active_downloads.items():
            if not isinstance(entry, dict):
                continue
            mid = entry.get("model_id")
            if isinstance(mid, str):
                active[mid] = {"task_id": task_id, "status": "processing"}
        for idx, item in enumerate(_download_queue, start=1):
            mid = item.get("model_id")
            tid = item.get("task_id")
            if isinstance(mid, str) and isinstance(tid, str) and mid not in active:
                active[mid] = {"task_id": tid, "status": "pending", "queue_position": idx}
    return {"success": True, "data": active}


@router.delete("/models/{model_id}")
async def delete_model(model_id: str) -> Dict[str, Any]:
    model = next((m for m in MODEL_MANIFEST if m["id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    storage_rel = model["storageRelativePath"]
    protected = storage_rel in read_builtin_models_marker() or model.get("protected", False)
    if protected:
        raise HTTPException(status_code=409, detail="This model is built-in and cannot be deleted")

    target_dir = get_user_models_dir() / storage_rel
    # Safety: never delete bundled fallback. If only bundled exists, disallow delete.
    bundled_dir = get_bundled_models_dir() / storage_rel
    if (not target_dir.exists()) and bundled_dir.exists():
        raise HTTPException(status_code=409, detail="Bundled fallback model cannot be deleted in development mode")

    try:
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {e}")

    return {"success": True, "data": {"deleted": True, "model_id": model_id}}

