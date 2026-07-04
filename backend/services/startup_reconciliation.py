"""
Startup reconciliation: cleans up on-disk residue that a force-quit / killed
backend process can leave behind — deletes that were mid-flight when the whole
process died have no chance to run their normal cleanup code (task_cancellation
checkpoints, corpus_service.delete_corpus, biblio delete_library), so a directory
can survive even though its DB row is long gone.

Runs once at FastAPI startup, after TaskDB.cleanup_stale_tasks(). Only removes
directories that have NO corresponding DB row at all — i.e. unambiguous orphans —
never touches a directory that matches a live corpus/library id or name, so a
normal in-progress upload is never at risk.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)


def _rmtree_onexc(func, path, exc):
    # Mirrors corpus_service.delete_corpus: ignore FileNotFoundError races
    # (e.g. macOS AppleDouble ._* sidecar files vanishing mid-walk).
    if not isinstance(exc, FileNotFoundError):
        raise exc


def _remove_orphan_dirs(parent: Path, valid_names: set) -> List[str]:
    removed = []
    if not parent.exists():
        return removed
    for child in parent.iterdir():
        if not child.is_dir():
            continue
        if child.name in valid_names:
            continue
        try:
            shutil.rmtree(child, onexc=_rmtree_onexc)
            removed.append(str(child))
        except Exception as e:
            logger.warning(f"[startup_reconciliation] Failed to remove orphaned dir {child}: {e}")
    return removed


def reconcile_orphaned_data() -> None:
    """Best-effort orphan cleanup. Never raises — a failure here must not block startup."""
    try:
        from config import CORPORA_DIR, ANNOTATIONS_DIR, DATA_DIR
        from models.database import get_db_readonly

        with get_db_readonly() as conn:
            cursor = conn.cursor()
            # Raw query, not CorpusDB.list_all(): that helper excludes biblio shadow
            # corpora, but their directories are just as real and must count as "valid".
            cursor.execute("SELECT name FROM corpora")
            valid_corpus_names = {row[0] for row in cursor.fetchall()}

            cursor.execute("SELECT id FROM biblio_libraries")
            valid_library_ids = {row[0] for row in cursor.fetchall()}

        removed = []
        removed += _remove_orphan_dirs(CORPORA_DIR, valid_corpus_names)
        removed += _remove_orphan_dirs(ANNOTATIONS_DIR, valid_corpus_names)
        removed += _remove_orphan_dirs(DATA_DIR / "biblio", valid_library_ids)

        if removed:
            logger.info(f"[startup_reconciliation] Removed {len(removed)} orphaned director(y/ies): {removed}")
            print(f"[Startup] Cleaned up {len(removed)} orphaned corpus/library director(y/ies) from an incomplete delete")
    except Exception as e:
        logger.warning(f"[startup_reconciliation] Skipped (non-fatal): {e}")
