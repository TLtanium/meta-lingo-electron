"""
Cooperative cancellation for long-running annotation tasks.

Annotation runs inside FastAPI BackgroundTasks (threadpool threads) which cannot be
killed at the OS level. Instead we use *cooperative* cancellation: the annotation
pipeline checks ``should_abort()`` at stage boundaries (SpaCy -> USAS -> MIPVU -> NRC)
and bails out early when its task was cancelled, or when the owning text / corpus was
deleted out from under it.

Used by both corpus management (plain-text upload) and bibliographic visualization
(abstract shadow-corpus annotation). When a library / corpus / text is deleted while
annotation is in flight, the delete endpoint calls one of the ``cancel_*`` helpers,
which (a) marks the in-memory flag so the next checkpoint aborts within seconds, and
(b) flips the persisted TaskDB status to ``cancelled``.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Iterable, List, Optional

# In-memory set of task ids that have been asked to stop. Threads read this at
# checkpoints; the set is the source of truth for an *in-flight* abort decision.
_cancelled_tasks: set[str] = set()
_lock = threading.Lock()

# Sidecar suffixes produced by the annotation pipeline; cleaned up on abort so a
# half-written annotation never lingers next to a deleted text.
_SIDECAR_SUFFIXES = (".spacy.json", ".usas.json", ".mipvu.json", ".nrc.json")


def request_cancel(task_ids: Iterable[str]) -> List[str]:
    """Flag the given task ids for cancellation and persist status=cancelled.

    Returns the list of ids that were actually flagged (de-duplicated, non-empty).
    """
    ids = [t for t in {tid for tid in task_ids if tid}]
    if not ids:
        return []
    with _lock:
        _cancelled_tasks.update(ids)

    # Persist so the UI stops polling and a restart won't resurrect the task.
    try:
        from models.database import TaskDB
        for tid in ids:
            try:
                TaskDB.update(tid, {
                    "status": "cancelled",
                    "message": "Cancelled: owning library/corpus/text was deleted",
                })
            except Exception:
                pass
    except Exception:
        pass
    return ids


def is_cancelled(task_id: str) -> bool:
    """True if this task was explicitly asked to stop."""
    if not task_id:
        return False
    with _lock:
        return task_id in _cancelled_tasks


def clear(task_id: str) -> None:
    """Forget a task id (call when a task finishes, to bound the set's growth)."""
    if not task_id:
        return
    with _lock:
        _cancelled_tasks.discard(task_id)


def _text_exists(text_id: Optional[str]) -> bool:
    if not text_id:
        return True  # unknown -> don't treat as deleted
    try:
        from models.database import TextDB
        return TextDB.get_by_id(text_id) is not None
    except Exception:
        return True


def _corpus_exists(corpus_id: Optional[str]) -> bool:
    if not corpus_id:
        return True
    try:
        from models.database import CorpusDB
        return CorpusDB.get_by_id(corpus_id) is not None
    except Exception:
        return True


def should_abort(task_id: str, text_id: Optional[str] = None,
                 corpus_id: Optional[str] = None) -> bool:
    """Combined checkpoint test used inside the annotation pipeline.

    Aborts when the task was cancelled, or when the owning text / corpus has since
    been deleted (covers deletes that bypass the explicit cancel path).
    """
    if is_cancelled(task_id):
        return True
    if not _text_exists(text_id):
        return True
    if not _corpus_exists(corpus_id):
        return True
    return False


def cleanup_partial_sidecars(save_dir: str, base_name: str) -> None:
    """Remove any half-written annotation sidecars for an aborted text."""
    try:
        d = Path(save_dir)
        for suffix in _SIDECAR_SUFFIXES:
            p = d / f"{base_name}{suffix}"
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass
    except Exception:
        pass


def cancel_tasks_for_corpus(corpus_id: str) -> List[str]:
    """Cancel all active (pending/processing) annotation tasks for a corpus."""
    if not corpus_id:
        return []
    try:
        from models.database import TaskDB
        ids = TaskDB.list_active_ids_by_corpus(corpus_id)
    except Exception:
        ids = []
    return request_cancel(ids)


def cancel_tasks_for_text(text_id: str) -> List[str]:
    """Cancel all active annotation tasks tied to a single text."""
    if not text_id:
        return []
    try:
        from models.database import TaskDB
        ids = TaskDB.list_active_ids_by_text(text_id)
    except Exception:
        ids = []
    return request_cancel(ids)


def cancel_tasks_for_texts(text_ids: Iterable[str]) -> List[str]:
    """Cancel active annotation tasks for a batch of texts (e.g. on library delete)."""
    flagged: List[str] = []
    for tid in {t for t in text_ids if t}:
        flagged.extend(cancel_tasks_for_text(tid))
    return flagged
