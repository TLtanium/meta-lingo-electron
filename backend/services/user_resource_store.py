"""User-supplied resources, separate from application and bundled assets.

Imports are staged and atomically committed; incomplete imports never appear in lists.
No resource in the legacy saves directory is loaded automatically.
"""
import json
import re
import shutil
import uuid
import time
from pathlib import Path
from contextlib import contextmanager
from config import get_data_dir

KINDS = {"nrc", "dictionary", "reference"}


def _remove_tree(path: Path):
    """Ignore descendants removed with their AppleDouble companion, not real errors."""
    def onerror(function, filename, error):
        if not isinstance(error[1], FileNotFoundError):
            raise error[1]
    if path.exists():
        shutil.rmtree(path, onerror=onerror)


def clear_resource_caches():
    # Do not initialize heavy services solely to invalidate an unused cache.
    import sys
    nrc = sys.modules.get('services.nrc_service')
    if nrc and nrc._nrc_service is not None:
        nrc._nrc_service.clear_cache()
    reference = sys.modules.get('services.corpus_resource_service')
    if reference and reference._corpus_resource_service is not None:
        reference._corpus_resource_service.clear_cache()


def remove_all_resources():
    """Delete imported copies only; never touch their original source files."""
    _remove_tree(get_data_dir() / 'user_resources')
    clear_resource_caches()


def resource_root(kind: str) -> Path:
    if kind not in KINDS:
        raise ValueError("Unknown resource type")
    path = get_data_dir() / "user_resources" / kind
    path.mkdir(parents=True, exist_ok=True)
    return path


def resource_path(kind: str, resource_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{32}", resource_id):
        raise ValueError("Invalid resource ID")
    return resource_root(kind) / resource_id


def list_resources(kind: str) -> list[dict]:
    result = []
    for path in sorted(resource_root(kind).glob("*/meta.json")):
        if path.parent.name.startswith("."):
            continue
        try:
            meta = json.loads(path.read_text(encoding="utf-8"))
            if meta.get("id") == path.parent.name:
                if kind == "reference":
                    from services.reference_metadata import present_reference
                    meta = present_reference(meta)
                result.append(meta)
        except (ValueError, OSError):
            continue
    return sorted(result, key=lambda m: m.get("created_at_ns", 0))


@contextmanager
def staged_import(kind: str):
    resource_id = uuid.uuid4().hex
    stage = resource_root(kind) / (".import-" + resource_id)
    stage.mkdir()
    meta = {"id": resource_id, "created_at_ns": time.time_ns()}
    try:
        yield stage, meta
        (stage / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        stage.rename(resource_path(kind, resource_id))
    finally:
        if stage.exists():
            _remove_tree(stage)


def remove_resource(kind: str, resource_id: str):
    path = resource_path(kind, resource_id)
    # Also complete previously interrupted deletions; a valid absent ID is idempotent.
    _remove_tree(path)
    clear_resource_caches()
