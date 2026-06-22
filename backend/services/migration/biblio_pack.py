"""
Pack / unpack a single bibliographic library into a bundle.

A library carries: its DB rows (library, entries, abstract links), its PDF/thumbnail files,
and its shadow corpus (abstracts + their SpaCy/USAS/MIPVU/NRC annotations), which is packed
via corpus_pack so the abstract annotation pipeline state survives the round-trip.
"""

import logging
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from config import DATA_DIR
from models.database import get_db_connection, get_db_readonly

from . import corpus_pack
from .pack_common import (
    add_dir_to_zip,
    extract_prefix_from_zip,
    write_json_to_zip,
    unique_name,
    insert_row,
)

logger = logging.getLogger(__name__)

_LIBRARY_COLS = ["id", "name", "source_type", "description", "language",
                 "created_at", "updated_at"]


def _biblio_dir(library_id: str) -> Path:
    return DATA_DIR / "biblio" / library_id


def read_library_bundle_meta(library_id: str) -> Optional[Dict[str, Any]]:
    with get_db_readonly() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM biblio_libraries WHERE id = ?", (library_id,))
        lrow = cur.fetchone()
        if not lrow:
            return None
        library = dict(lrow)

        cur.execute("SELECT corpus_id FROM biblio_library_corpus WHERE library_id = ?", (library_id,))
        crow = cur.fetchone()
        shadow_corpus_id = crow[0] if crow else None

        cur.execute("SELECT * FROM biblio_entries WHERE library_id = ?", (library_id,))
        entries = [dict(r) for r in cur.fetchall()]

        entry_ids = [e["id"] for e in entries]
        abstracts: List[Dict[str, str]] = []
        if entry_ids:
            placeholders = ",".join(["?"] * len(entry_ids))
            cur.execute(
                f"SELECT entry_id, text_id FROM biblio_entry_abstracts WHERE entry_id IN ({placeholders})",
                entry_ids,
            )
            abstracts = [{"entry_id": r[0], "text_id": r[1]} for r in cur.fetchall()]

    return {
        "library": library,
        "shadow_corpus_id": shadow_corpus_id,
        "entries": entries,
        "abstracts": abstracts,
    }


def pack_library(zf: zipfile.ZipFile, library_id: str, arc_prefix: str) -> Optional[Dict[str, Any]]:
    meta = read_library_bundle_meta(library_id)
    if not meta:
        return None
    write_json_to_zip(zf, f"{arc_prefix}/meta.json", meta)

    n_files = add_dir_to_zip(zf, _biblio_dir(library_id), f"{arc_prefix}/biblio_files")

    shadow_id = meta.get("shadow_corpus_id")
    shadow_info = None
    if shadow_id:
        shadow_info = corpus_pack.pack_corpus(zf, shadow_id, f"{arc_prefix}/shadow_corpus")

    return {
        "id": library_id,
        "name": meta["library"]["name"],
        "source_type": meta["library"].get("source_type"),
        "entry_count": len(meta["entries"]),
        "pdf_file_count": n_files,
        "shadow_text_count": (shadow_info or {}).get("text_count", 0),
    }


def unpack_library(
    zf: zipfile.ZipFile,
    arc_prefix: str,
    meta: Dict[str, Any],
    existing_library_names: Set[str],
    existing_corpus_names: Set[str],
) -> Dict[str, Any]:
    """Recreate a library (and its shadow corpus) from a bundle with fresh ids/names."""
    src_lib = meta["library"]
    new_library_id = str(uuid.uuid4())
    new_name = unique_name(src_lib["name"], existing_library_names)
    existing_library_names.add(new_name)

    # 1) Restore the shadow corpus (abstracts + annotations) with a matching [Biblio] name
    shadow_prefix = f"{arc_prefix}/shadow_corpus"
    shadow_corpus_meta = _read_shadow_meta(zf, shadow_prefix)
    text_id_map: Dict[str, str] = {}
    new_shadow_corpus_id: Optional[str] = None
    if shadow_corpus_meta:
        res = corpus_pack.unpack_corpus(
            zf, shadow_prefix, shadow_corpus_meta, existing_corpus_names,
            force_base_name=f"[Biblio] {new_name}",
        )
        new_shadow_corpus_id = res["new_corpus_id"]
        text_id_map = res["text_id_map"]

    # 2) Restore PDF / thumbnail files under the new library id, renamed per new entry id
    entry_id_map: Dict[str, str] = {e["id"]: str(uuid.uuid4()) for e in meta["entries"]}
    new_biblio_dir = _biblio_dir(new_library_id)
    extract_prefix_from_zip(zf, f"{arc_prefix}/biblio_files", new_biblio_dir)
    _rename_biblio_files(new_biblio_dir, entry_id_map)

    # 3) Insert library, mapping, entries, abstract links
    with get_db_connection() as conn:
        cur = conn.cursor()

        lib_row = dict(src_lib)
        lib_row["id"] = new_library_id
        lib_row["name"] = new_name
        insert_row(cur, "biblio_libraries", lib_row, _LIBRARY_COLS)

        if new_shadow_corpus_id:
            cur.execute(
                "INSERT INTO biblio_library_corpus (library_id, corpus_id) VALUES (?, ?)",
                (new_library_id, new_shadow_corpus_id),
            )

        for entry in meta["entries"]:
            row = dict(entry)
            new_entry_id = entry_id_map[entry["id"]]
            row["id"] = new_entry_id
            row["library_id"] = new_library_id
            if row.get("pdf_path"):
                row["pdf_path"] = f"biblio/{new_library_id}/pdfs/{new_entry_id}.pdf"
            if row.get("pdf_thumbnail_path"):
                row["pdf_thumbnail_path"] = f"biblio/{new_library_id}/thumbnails/{new_entry_id}.png"
            insert_row(cur, "biblio_entries", row, list(row.keys()))

        for ab in meta.get("abstracts", []):
            new_eid = entry_id_map.get(ab["entry_id"])
            new_tid = text_id_map.get(ab["text_id"])
            if new_eid and new_tid:
                cur.execute(
                    "INSERT OR REPLACE INTO biblio_entry_abstracts (entry_id, text_id) VALUES (?, ?)",
                    (new_eid, new_tid),
                )

        conn.commit()

    return {"new_library_id": new_library_id, "name": new_name, "entry_count": len(meta["entries"])}


def _read_shadow_meta(zf: zipfile.ZipFile, shadow_prefix: str) -> Optional[Dict[str, Any]]:
    from .pack_common import read_json_from_zip
    return read_json_from_zip(zf, f"{shadow_prefix}/meta.json")


def _rename_biblio_files(biblio_dir: Path, entry_id_map: Dict[str, str]) -> None:
    """Rename pdfs/<old>.pdf and thumbnails/<old>.png to their new entry ids."""
    for sub, ext in (("pdfs", ".pdf"), ("thumbnails", ".png")):
        d = biblio_dir / sub
        if not d.exists():
            continue
        for old_id, new_id in entry_id_map.items():
            old_f = d / f"{old_id}{ext}"
            if old_f.exists():
                try:
                    old_f.rename(d / f"{new_id}{ext}")
                except Exception as e:
                    logger.warning("Could not rename biblio file %s: %s", old_f, e)
