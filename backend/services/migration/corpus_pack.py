"""
Pack / unpack a single corpus (DB rows + on-disk files + annotation archives) into a bundle.

Reused by biblio_pack for a library's shadow corpus.
"""

import logging
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from config import CORPORA_DIR, ANNOTATIONS_DIR
from models.database import get_db_connection, get_db_readonly, TagDB

from .pack_common import (
    add_dir_to_zip,
    extract_prefix_from_zip,
    write_json_to_zip,
    unique_name,
    remap_path,
    insert_row,
)

logger = logging.getLogger(__name__)

_CORPUS_COLS = ["id", "name", "language", "author", "source", "text_type", "description",
                "created_at", "updated_at"]
_TEXT_COLS = ["id", "corpus_id", "filename", "original_filename", "content_path", "media_type",
              "transcript_path", "transcript_json_path", "has_timestamps", "yolo_annotation_path",
              "clip_annotation_path", "audio_path", "word_count", "duration", "metadata",
              "created_at", "updated_at"]
_TEXT_PATH_COLS = ["content_path", "transcript_path", "transcript_json_path",
                   "yolo_annotation_path", "clip_annotation_path", "audio_path"]


def read_corpus_bundle_meta(corpus_id: str) -> Optional[Dict[str, Any]]:
    """Collect a corpus's DB rows (corpus, texts, tags) for the bundle manifest."""
    with get_db_readonly() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM corpora WHERE id = ?", (corpus_id,))
        crow = cur.fetchone()
        if not crow:
            return None
        corpus = dict(crow)

        cur.execute("SELECT * FROM texts WHERE corpus_id = ?", (corpus_id,))
        texts = [dict(r) for r in cur.fetchall()]

        # Corpus-level tags
        cur.execute(
            """SELECT t.name FROM tags t
               JOIN corpus_tags ct ON ct.tag_id = t.id WHERE ct.corpus_id = ?""",
            (corpus_id,),
        )
        corpus_tags = [r[0] for r in cur.fetchall()]

        # Per-text tags
        text_tags: Dict[str, List[str]] = {}
        for txt in texts:
            cur.execute(
                """SELECT t.name FROM tags t
                   JOIN text_tags tt ON tt.tag_id = t.id WHERE tt.text_id = ?""",
                (txt["id"],),
            )
            names = [r[0] for r in cur.fetchall()]
            if names:
                text_tags[txt["id"]] = names

    return {
        "corpus": corpus,
        "corpus_dir": str(CORPORA_DIR / corpus["name"]),
        "texts": texts,
        "corpus_tags": corpus_tags,
        "text_tags": text_tags,
    }


def pack_corpus(zf: zipfile.ZipFile, corpus_id: str, arc_prefix: str) -> Optional[Dict[str, Any]]:
    """Write a corpus's meta + files + annotation archives into the open zip under arc_prefix."""
    meta = read_corpus_bundle_meta(corpus_id)
    if not meta:
        return None
    name = meta["corpus"]["name"]
    write_json_to_zip(zf, f"{arc_prefix}/meta.json", meta)
    n_files = add_dir_to_zip(zf, CORPORA_DIR / name, f"{arc_prefix}/corpus_files")
    n_ann = add_dir_to_zip(zf, ANNOTATIONS_DIR / name, f"{arc_prefix}/annotations")
    return {
        "id": corpus_id,
        "name": name,
        "text_count": len(meta["texts"]),
        "file_count": n_files,
        "archive_count": n_ann,
    }


def unpack_corpus(
    zf: zipfile.ZipFile,
    arc_prefix: str,
    meta: Dict[str, Any],
    existing_corpus_names: Set[str],
    *,
    force_base_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Recreate a corpus from a bundle with fresh ids and a collision-free name.
    Returns { new_corpus_id, name, text_id_map }.
    """
    src_corpus = meta["corpus"]
    base_name = force_base_name or src_corpus["name"]
    new_name = unique_name(base_name, existing_corpus_names)
    existing_corpus_names.add(new_name)

    new_corpus_id = str(uuid.uuid4())
    old_corpus_dir = meta.get("corpus_dir") or str(CORPORA_DIR / src_corpus["name"])
    new_corpus_dir = CORPORA_DIR / new_name

    # Restore on-disk files (corpus content + annotation archives)
    extract_prefix_from_zip(zf, f"{arc_prefix}/corpus_files", new_corpus_dir)
    new_ann_dir = ANNOTATIONS_DIR / new_name
    extract_prefix_from_zip(zf, f"{arc_prefix}/annotations", new_ann_dir)

    # Build text id remap
    text_id_map: Dict[str, str] = {t["id"]: str(uuid.uuid4()) for t in meta["texts"]}

    with get_db_connection() as conn:
        cur = conn.cursor()

        corpus_row = dict(src_corpus)
        corpus_row["id"] = new_corpus_id
        corpus_row["name"] = new_name
        insert_row(cur, "corpora", corpus_row, _CORPUS_COLS)

        for txt in meta["texts"]:
            row = dict(txt)
            row["id"] = text_id_map[txt["id"]]
            row["corpus_id"] = new_corpus_id
            for pcol in _TEXT_PATH_COLS:
                row[pcol] = remap_path(row.get(pcol), old_corpus_dir, str(new_corpus_dir))
            insert_row(cur, "texts", row, _TEXT_COLS)

            for tag_name in meta.get("text_tags", {}).get(txt["id"], []):
                tag_id = TagDB.get_or_create(tag_name, conn=conn)
                cur.execute(
                    "INSERT OR IGNORE INTO text_tags (text_id, tag_id) VALUES (?, ?)",
                    (row["id"], tag_id),
                )

        for tag_name in meta.get("corpus_tags", []):
            tag_id = TagDB.get_or_create(tag_name, conn=conn)
            cur.execute(
                "INSERT OR IGNORE INTO corpus_tags (corpus_id, tag_id) VALUES (?, ?)",
                (new_corpus_id, tag_id),
            )

        conn.commit()

    _rewrite_archives(new_ann_dir, new_name, text_id_map, old_corpus_dir, str(new_corpus_dir))

    return {"new_corpus_id": new_corpus_id, "name": new_name, "text_id_map": text_id_map}


def _rewrite_archives(ann_dir: Path, new_corpus_name: str, text_id_map: Dict[str, str],
                      old_corpus_dir: str, new_corpus_dir: str) -> None:
    """Remap corpusName / textId / mediaPath inside restored annotation archive JSONs."""
    if not ann_dir.exists():
        return
    import json
    for path in ann_dir.glob("*.json"):
        if path.name.startswith("._"):  # skip macOS AppleDouble siblings
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                archive = json.load(f)
        except Exception as e:
            logger.warning("Could not read archive %s during import: %s", path, e)
            continue
        archive["corpusName"] = new_corpus_name
        old_tid = archive.get("textId")
        if old_tid and old_tid in text_id_map:
            archive["textId"] = text_id_map[old_tid]
        if archive.get("mediaPath"):
            archive["mediaPath"] = remap_path(archive["mediaPath"], old_corpus_dir, new_corpus_dir)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(archive, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("Could not rewrite archive %s during import: %s", path, e)
