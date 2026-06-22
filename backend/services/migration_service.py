"""
Library / corpus migration service.

Top-level orchestration for exporting corpora or bibliographic libraries into a single
portable .zip bundle, and importing such a bundle to recreate the libraries on another
machine (data migration) or restore a backup.

Bundle layout:
    manifest.json
    corpora/<corpus_id>/{meta.json, corpus_files/..., annotations/...}
    libraries/<library_id>/{meta.json, biblio_files/..., shadow_corpus/...}
"""

import datetime
import io
import logging
import zipfile
from typing import Any, Dict, List, Optional, Set

from models.database import get_db_readonly

from services.migration import corpus_pack, biblio_pack
from services.migration.pack_common import (
    BUNDLE_FORMAT,
    BUNDLE_FORMAT_VERSION,
    BUNDLE_APP_VERSION,
    MANIFEST_NAME,
    read_json_from_zip,
)

logger = logging.getLogger(__name__)


# ==================== existing-name helpers ====================

def _all_corpus_names() -> Set[str]:
    with get_db_readonly() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM corpora")
        return {r[0] for r in cur.fetchall()}


def _all_library_names() -> Set[str]:
    with get_db_readonly() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM biblio_libraries")
        return {r[0] for r in cur.fetchall()}


# ==================== export ====================

def _new_zip() -> tuple:
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
    return buf, zf


def _finalize(buf: io.BytesIO, zf: zipfile.ZipFile, manifest: Dict[str, Any]) -> bytes:
    from json import dumps
    zf.writestr(MANIFEST_NAME, dumps(manifest, ensure_ascii=False, indent=2))
    zf.close()
    return buf.getvalue()


def _base_manifest(kind: str) -> Dict[str, Any]:
    return {
        "format": BUNDLE_FORMAT,
        "format_version": BUNDLE_FORMAT_VERSION,
        "app_version": BUNDLE_APP_VERSION,
        "kind": kind,
        "exported_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "corpora": [],
        "libraries": [],
    }


def export_corpora(corpus_ids: List[str]) -> bytes:
    """Build a .zip bundle containing the given corpora. Raises ValueError if none are valid."""
    buf, zf = _new_zip()
    manifest = _base_manifest("corpus")
    for cid in corpus_ids:
        info = corpus_pack.pack_corpus(zf, cid, f"corpora/{cid}")
        if info:
            manifest["corpora"].append(info)
    if not manifest["corpora"]:
        zf.close()
        raise ValueError("No valid corpora to export")
    return _finalize(buf, zf, manifest)


def export_libraries(library_ids: List[str]) -> bytes:
    """Build a .zip bundle containing the given bibliographic libraries."""
    buf, zf = _new_zip()
    manifest = _base_manifest("biblio")
    for lid in library_ids:
        info = biblio_pack.pack_library(zf, lid, f"libraries/{lid}")
        if info:
            manifest["libraries"].append(info)
    if not manifest["libraries"]:
        zf.close()
        raise ValueError("No valid libraries to export")
    return _finalize(buf, zf, manifest)


def export_filename(kind: str) -> str:
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"metalingo_{kind}_{stamp}.zip"


# ==================== inspect / import ====================

def _open_bundle(zip_bytes: bytes) -> tuple:
    buf = io.BytesIO(zip_bytes)
    zf = zipfile.ZipFile(buf, "r")
    manifest = read_json_from_zip(zf, MANIFEST_NAME)
    if not manifest or manifest.get("format") != BUNDLE_FORMAT:
        zf.close()
        raise ValueError("INVALID_BUNDLE")
    return zf, manifest


def inspect_bundle(zip_bytes: bytes) -> Dict[str, Any]:
    """Return a manifest summary without importing (for confirmation UIs)."""
    zf, manifest = _open_bundle(zip_bytes)
    try:
        return {
            "kind": manifest.get("kind"),
            "app_version": manifest.get("app_version"),
            "exported_at": manifest.get("exported_at"),
            "corpora": manifest.get("corpora", []),
            "libraries": manifest.get("libraries", []),
        }
    finally:
        zf.close()


def import_bundle(zip_bytes: bytes, expect_kind: Optional[str] = None) -> Dict[str, Any]:
    """
    Import a bundle, recreating every corpus / library it contains with fresh ids and
    collision-free names. `expect_kind` ("corpus" | "biblio") guards against importing the
    wrong bundle type in a module's importer. Returns a summary of what was created.
    """
    zf, manifest = _open_bundle(zip_bytes)
    imported_corpora: List[Dict[str, Any]] = []
    imported_libraries: List[Dict[str, Any]] = []
    try:
        kind = manifest.get("kind")
        if expect_kind and kind != expect_kind and kind != "mixed":
            raise ValueError(f"BUNDLE_KIND_MISMATCH:{kind}")

        existing_corpus_names = _all_corpus_names()
        existing_library_names = _all_library_names()

        if expect_kind in (None, "corpus", "mixed"):
            for item in manifest.get("corpora", []):
                prefix = f"corpora/{item['id']}"
                meta = read_json_from_zip(zf, f"{prefix}/meta.json")
                if not meta:
                    continue
                res = corpus_pack.unpack_corpus(zf, prefix, meta, existing_corpus_names)
                imported_corpora.append({"name": res["name"], "id": res["new_corpus_id"]})

        if expect_kind in (None, "biblio", "mixed"):
            for item in manifest.get("libraries", []):
                prefix = f"libraries/{item['id']}"
                meta = read_json_from_zip(zf, f"{prefix}/meta.json")
                if not meta:
                    continue
                res = biblio_pack.unpack_library(
                    zf, prefix, meta, existing_library_names, existing_corpus_names
                )
                imported_libraries.append({"name": res["name"], "id": res["new_library_id"]})
    finally:
        zf.close()

    return {
        "success": True,
        "imported_corpora": imported_corpora,
        "imported_libraries": imported_libraries,
    }
