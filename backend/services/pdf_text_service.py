"""
General-purpose PDF text extraction service.

Used by corpus management (PDF → text conversion before the normal SpaCy/USAS/MIPVU
pipeline) and by bibliographic paper-PDF import. Uses PyMuPDF (fitz), which is already
a packaged dependency. Falls back gracefully (returns "") when fitz is unavailable.
"""

import logging
from pathlib import Path
from typing import Optional, Union

logger = logging.getLogger(__name__)


def _normalize_extracted_text(text: str) -> str:
    """Light cleanup of raw PDF text: trim trailing spaces, collapse excess blank lines."""
    if not text:
        return ""
    lines = [ln.rstrip() for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cleaned: list[str] = []
    blank_run = 0
    for ln in lines:
        if ln.strip():
            cleaned.append(ln)
            blank_run = 0
        else:
            blank_run += 1
            if blank_run <= 1:  # keep at most one blank line between blocks
                cleaned.append("")
    return "\n".join(cleaned).strip()


def extract_text_from_pdf_bytes(content: bytes, max_pages: Optional[int] = None) -> str:
    """
    Extract text from PDF bytes (e.g. an uploaded file's content).

    :param content: Raw PDF file bytes.
    :param max_pages: If set, only extract up to this many pages.
    :return: Concatenated, lightly-cleaned text. Empty string on failure.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; PDF text extraction unavailable")
        return ""
    text_parts: list[str] = []
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        try:
            n = len(doc)
            if max_pages is not None:
                n = min(n, max_pages)
            for i in range(n):
                page = doc.load_page(i)
                text_parts.append(page.get_text())
        finally:
            doc.close()
    except Exception as e:
        logger.exception("Failed to extract text from PDF bytes: %s", e)
        return ""
    return _normalize_extracted_text("\n\n".join(text_parts))


def extract_text_from_pdf_path(pdf_path: Union[str, Path], max_pages: Optional[int] = None) -> str:
    """
    Extract text from a PDF file on disk.

    :param pdf_path: Path to the PDF file.
    :param max_pages: If set, only extract up to this many pages.
    :return: Concatenated, lightly-cleaned text. Empty string on failure.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; PDF text extraction unavailable")
        return ""
    text_parts: list[str] = []
    try:
        doc = fitz.open(str(pdf_path))
        try:
            n = len(doc)
            if max_pages is not None:
                n = min(n, max_pages)
            for i in range(n):
                page = doc.load_page(i)
                text_parts.append(page.get_text())
        finally:
            doc.close()
    except Exception as e:
        logger.exception("Failed to extract text from PDF %s: %s", pdf_path, e)
        return ""
    return _normalize_extracted_text("\n\n".join(text_parts))


def is_pdf_filename(filename: Optional[str]) -> bool:
    """Return True if the filename has a .pdf extension (case-insensitive)."""
    return bool(filename) and filename.lower().endswith(".pdf")
