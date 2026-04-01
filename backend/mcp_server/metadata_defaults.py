"""
Default metadata and upload config helpers for MCP corpus uploads.
Aligns with manual upload (UploadPanel) behavior: text type, source, date rules.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional

# Match manual UI defaults (UploadPanel initial selectedSource / selectedTextType)
DEFAULT_SOURCE = "File Upload"
DEFAULT_TEXT_TYPE = "GEN"

_DATE_FULL = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_YEAR_ONLY = re.compile(r"^\d{4}$")


def normalize_date(user_date: Optional[str]) -> str:
    """
    Resolve date string for text metadata.

    - None or empty/whitespace: today's date (local server).
    - Four-digit year only: YYYY-01-01.
    - YYYY-MM-DD: returned as-is if valid.
    """
    if user_date is None:
        return date.today().isoformat()
    s = user_date.strip()
    if not s:
        return date.today().isoformat()
    if _YEAR_ONLY.match(s):
        return f"{s}-01-01"
    if _DATE_FULL.match(s):
        y, m, d = int(s[:4]), int(s[5:7]), int(s[8:10])
        date(y, m, d)  # validate
        return s
    # Fallback: treat as unspecified
    return date.today().isoformat()


def merge_corpus_defaults(
    corpus: Optional[Dict[str, Any]],
    *,
    author: Optional[str],
    source: Optional[str],
    text_type: Optional[str],
) -> tuple[Optional[str], str, str]:
    """
    Merge MCP parameters with existing corpus metadata (same idea as uploading
    into an existing corpus in the UI).

    Returns (author, source, text_type) for upload metadata.
    """
    c = corpus or {}
    eff_author = author if author is not None else (c.get("author") or None)
    eff_source = source if source is not None else (c.get("source") or DEFAULT_SOURCE)
    if not eff_source:
        eff_source = DEFAULT_SOURCE
    eff_tt = text_type if text_type is not None else (c.get("text_type") or DEFAULT_TEXT_TYPE)
    if not eff_tt:
        eff_tt = DEFAULT_TEXT_TYPE
    return eff_author, eff_source, eff_tt


def build_upload_config(
    *,
    language: str,
    tags: Optional[List[str]],
    date_iso: str,
    author: Optional[str],
    source: str,
    text_type: str,
    text_description: Optional[str],
) -> Dict[str, Any]:
    """Build the JSON `config` object for POST /api/corpus/{id}/upload (Form field)."""
    metadata: Dict[str, Any] = {
        "date": date_iso,
        "customFields": {"textType": text_type},
    }
    if author:
        metadata["author"] = author
    if source:
        metadata["source"] = source
    if text_description:
        metadata["description"] = text_description

    return {
        "transcribe": True,
        "yolo_annotation": False,
        "clip_annotation": False,
        "clip_labels": [],
        "clip_frame_interval": 30,
        "language": language,
        "gender": "male",
        "tags": list(tags) if tags else [],
        "metadata": metadata,
    }
