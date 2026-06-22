"""
Shared helpers for migration bundles: manifest constants, zip I/O, name uniqueness,
path remapping and generic row insertion.
"""

import json
import logging
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

BUNDLE_FORMAT = "metalingo-bundle"
BUNDLE_FORMAT_VERSION = 1
MANIFEST_NAME = "manifest.json"

# Kept in sync with PROJECT.md; informational only (import does not hard-require a match).
BUNDLE_APP_VERSION = "v4.8.85"


# ==================== zip I/O ====================

def _is_junk(name: str) -> bool:
    """Skip macOS AppleDouble / resource-fork / .DS_Store noise when packing."""
    base = os.path.basename(name)
    return base.startswith("._") or base == ".DS_Store"


def add_dir_to_zip(zf: zipfile.ZipFile, src_dir: Path, arc_prefix: str) -> int:
    """
    Recursively add a directory's files to the zip under `arc_prefix/...`.
    Returns the number of files written. Missing src_dir is a no-op.
    """
    if not src_dir or not src_dir.exists():
        return 0
    count = 0
    for root, _dirs, files in os.walk(src_dir):
        for fname in files:
            if _is_junk(fname):
                continue
            abs_path = Path(root) / fname
            rel = abs_path.relative_to(src_dir)
            arcname = f"{arc_prefix}/{rel.as_posix()}"
            try:
                zf.write(abs_path, arcname)
                count += 1
            except (OSError, ValueError) as e:
                logger.warning("Skipping file in bundle (%s): %s", abs_path, e)
    return count


def extract_prefix_from_zip(zf: zipfile.ZipFile, arc_prefix: str, dest_dir: Path) -> int:
    """
    Extract every member under `arc_prefix/` into dest_dir, preserving the structure below
    the prefix. Returns the number of files written. Guards against path traversal.
    """
    dest_dir = dest_dir.resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)
    prefix = arc_prefix.rstrip("/") + "/"
    count = 0
    for member in zf.namelist():
        if member.endswith("/") or not member.startswith(prefix):
            continue
        rel = member[len(prefix):]
        if not rel or _is_junk(rel):
            continue
        target = (dest_dir / rel).resolve()
        if not str(target).startswith(str(dest_dir)):
            logger.warning("Skipping unsafe bundle member: %s", member)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(target, "wb") as out:
            out.write(src.read())
        count += 1
    return count


def write_json_to_zip(zf: zipfile.ZipFile, name: str, obj: Any) -> None:
    zf.writestr(name, json.dumps(obj, ensure_ascii=False, indent=2))


def read_json_from_zip(zf: zipfile.ZipFile, name: str) -> Optional[Any]:
    try:
        with zf.open(name) as f:
            return json.loads(f.read().decode("utf-8"))
    except KeyError:
        return None


# ==================== name uniqueness ====================

def unique_name(base: str, existing: Set[str], suffix: str = " (imported)") -> str:
    """Return a name not present in `existing`, appending `suffix` (+ counter) as needed."""
    if base not in existing:
        return base
    candidate = f"{base}{suffix}"
    if candidate not in existing:
        return candidate
    i = 2
    while f"{candidate} {i}" in existing:
        i += 1
    return f"{candidate} {i}"


# ==================== path remapping ====================

def remap_path(path: Optional[str], old_prefix: str, new_prefix: str) -> Optional[str]:
    """
    Rewrite an absolute path that lived under `old_prefix` so it lives under `new_prefix`.
    Tolerates trailing-slash and separator differences. Returns the input unchanged when it
    does not start with old_prefix (best-effort; callers handle their own fallbacks).
    """
    if not path:
        return path
    op = old_prefix.rstrip("/\\")
    norm = path.replace("\\", "/")
    onorm = op.replace("\\", "/")
    if norm == onorm:
        return new_prefix
    if norm.startswith(onorm + "/"):
        return str(Path(new_prefix) / norm[len(onorm) + 1:])
    return path


# ==================== generic DB row insertion ====================

def insert_row(cursor, table: str, row: Dict[str, Any], columns: List[str]) -> None:
    """
    Insert a row using only the given `columns` (values pulled from `row`, missing → None).
    Keeps inserts robust against extra non-column keys injected by *DB.get_by_id helpers.
    """
    placeholders = ",".join(["?"] * len(columns))
    collist = ",".join(columns)
    cursor.execute(
        f"INSERT INTO {table} ({collist}) VALUES ({placeholders})",
        [row.get(c) for c in columns],
    )
