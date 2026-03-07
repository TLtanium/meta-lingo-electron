"""
PDF utilities for bibliographic entries: extract text and render first-page thumbnail.
Uses PyMuPDF (fitz) when available; on macOS falls back to qlmanage when fitz is not installed.
"""

import logging
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: Path, max_pages: Optional[int] = None) -> str:
    """
    Extract text from a PDF file.
    :param pdf_path: Path to the PDF file.
    :param max_pages: If set, only extract up to this many pages (for very long docs).
    :return: Concatenated text from all pages.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; PDF text extraction unavailable")
        return ""
    text_parts = []
    try:
        doc = fitz.open(pdf_path)
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
    return "\n\n".join(text_parts)


def _render_thumbnail_qlmanage(pdf_path: Path, output_path: Path, width: int = 200) -> bool:
    """Use macOS qlmanage to generate a PDF thumbnail when PyMuPDF is not available."""
    if sys.platform != "darwin":
        return False
    pdf_path = pdf_path.resolve()
    if not pdf_path.exists():
        return False
    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["qlmanage", "-t", "-s", str(width), "-o", str(out_dir), str(pdf_path)],
            check=True,
            capture_output=True,
            timeout=15,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.warning("qlmanage thumbnail failed for %s: %s", pdf_path, e)
        return False
    # qlmanage writes <basename>.pdf.png when input is <basename>.pdf
    ql_out = out_dir / f"{pdf_path.name}.png"
    if ql_out.exists():
        shutil.move(str(ql_out), str(output_path.resolve()))
        return True
    return False


def render_first_page_thumbnail(pdf_path: Path, output_path: Path, width: int = 200) -> bool:
    """
    Render the first page of the PDF as an image and save to output_path.
    Uses PyMuPDF (fitz) when available; on macOS falls back to qlmanage if fitz is missing.
    :param pdf_path: Path to the PDF file.
    :param output_path: Path to save the image (e.g. .png).
    :param width: Target width in pixels; height is computed to preserve aspect ratio.
    :return: True if successful.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; trying fallback for thumbnail")
        return _render_thumbnail_qlmanage(pdf_path, output_path, width)
    try:
        pdf_str = str(pdf_path.resolve())
        doc = fitz.open(pdf_str)
        try:
            if len(doc) == 0:
                logger.warning("PDF has no pages: %s", pdf_path)
                return False
            page = doc.load_page(0)
            rect = page.rect
            if rect.width <= 0 or rect.height <= 0:
                logger.warning("PDF first page has zero size: %s", pdf_path)
                return False
            zoom = width / rect.width
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            out_str = str(output_path.resolve())
            pix.save(out_str)
        finally:
            doc.close()
        return True
    except Exception as e:
        logger.exception("Failed to render thumbnail for %s: %s", pdf_path, e)
        if sys.platform == "darwin":
            return _render_thumbnail_qlmanage(pdf_path, output_path, width)
        return False
