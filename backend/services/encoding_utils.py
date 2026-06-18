"""
Encoding detection and conversion utilities for text file uploads.

Handles ANSI (Windows-1252), GBK, GB2312, Latin-1, and other non-UTF-8
encodings by detecting with charset_normalizer and converting to UTF-8.
"""

import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Single-byte Windows code pages in the cp12xx/cp13xx/ISO-8859 family.
# charset_normalizer often can't distinguish these precisely; we unify them
# to windows-1252 (the most common "ANSI" encoding on Windows).
_LATIN_CP_ALIASES = {
    "cp1250", "cp1251", "cp1253", "cp1254", "cp1255", "cp1256",
    "cp1257", "cp1258", "iso-8859-1", "iso-8859-2", "iso-8859-3",
    "iso-8859-4", "iso-8859-5", "iso-8859-6", "iso-8859-7",
    "iso-8859-8", "iso-8859-9", "iso-8859-10", "iso-8859-13",
    "iso-8859-14", "iso-8859-15", "latin-1",
}

# CJK encodings that charset_normalizer may confuse with each other.
# When these are detected, we try gb18030 first since this is a Chinese
# corpus linguistics application.
_CJK_ALIASES = {"cp949", "euc-kr", "cp932", "shift_jis", "euc-jp",
                "big5", "cp950"}


def detect_and_decode(raw_bytes: bytes, hint_encoding: Optional[str] = None) -> Tuple[str, str]:
    """Decode bytes to a Python str, auto-detecting the source encoding.

    Returns:
        (text, detected_encoding) – text is always a valid Python unicode str.

    Strategy:
      1. Strip BOM – handles UTF-8/16/32 BOM files immediately.
      2. Try hint encoding if provided.
      3. Try plain UTF-8 (fast path for modern files).
      4. Use charset_normalizer statistical detection.
         - CJK codepage aliases → try gb18030 first, fall back to detected.
         - Latin codepage aliases → normalise to windows-1252.
      5. Explicit fallback list for when detection fails.
      6. Last resort: latin-1 (never raises).
    """
    if not raw_bytes:
        return ("", "utf-8")

    # 1. BOM detection
    if raw_bytes.startswith(b"\xef\xbb\xbf"):                          # UTF-8 BOM
        try:
            return (raw_bytes[3:].decode("utf-8"), "utf-8-bom")
        except UnicodeDecodeError:
            pass
    elif raw_bytes.startswith((b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):  # UTF-32
        try:
            return (raw_bytes.decode("utf-32"), "utf-32")
        except UnicodeDecodeError:
            pass
    elif raw_bytes.startswith((b"\xff\xfe", b"\xfe\xff")):              # UTF-16
        try:
            return (raw_bytes.decode("utf-16"), "utf-16")
        except UnicodeDecodeError:
            pass

    # 2. Caller hint
    if hint_encoding:
        try:
            return (raw_bytes.decode(hint_encoding), hint_encoding)
        except (UnicodeDecodeError, LookupError):
            pass

    # 3. Plain UTF-8 fast path
    try:
        return (raw_bytes.decode("utf-8"), "utf-8")
    except UnicodeDecodeError:
        pass

    # 4. charset_normalizer statistical detection
    detected_enc: Optional[str] = None
    try:
        from charset_normalizer import from_bytes as cn_from_bytes
        results = cn_from_bytes(raw_bytes)
        best = results.best()
        if best is not None:
            detected_enc = best.encoding
            logger.info(
                f"[encoding_utils] charset_normalizer: {detected_enc} "
                f"(chaos={best.percent_chaos:.1f}%, coherence={best.percent_coherence:.1f}%)"
            )
    except Exception as exc:
        logger.debug(f"[encoding_utils] charset_normalizer error: {exc}")

    if detected_enc:
        # CJK alias: try gb18030 (Chinese superset) first
        if detected_enc.lower() in _CJK_ALIASES:
            try:
                text = raw_bytes.decode("gb18030")
                logger.info("[encoding_utils] CJK alias → using gb18030")
                return (text, "gb18030")
            except (UnicodeDecodeError, LookupError):
                pass

        # Latin alias: normalise to windows-1252
        if detected_enc.lower() in _LATIN_CP_ALIASES:
            try:
                text = raw_bytes.decode("windows-1252")
                logger.info(f"[encoding_utils] Latin alias ({detected_enc}) → using windows-1252")
                return (text, "windows-1252")
            except (UnicodeDecodeError, LookupError):
                pass

        # Use detection result as-is
        try:
            text = raw_bytes.decode(detected_enc)
            return (text, detected_enc)
        except (UnicodeDecodeError, LookupError):
            pass

    # 5. Explicit fallback list
    for enc in ("gb18030", "gbk", "big5", "windows-1252", "latin-1"):
        try:
            text = raw_bytes.decode(enc)
            logger.info(f"[encoding_utils] Fallback encoding: {enc}")
            return (text, enc)
        except (UnicodeDecodeError, LookupError):
            continue

    # 6. latin-1 never raises
    text = raw_bytes.decode("latin-1")
    logger.warning("[encoding_utils] Last-resort latin-1 encoding")
    return (text, "latin-1")


def read_text_file(filepath: str, hint_encoding: Optional[str] = None) -> Tuple[str, str]:
    """Read a text file from disk, auto-detecting its encoding.

    Returns:
        (text, detected_encoding)
    """
    with open(filepath, "rb") as fh:
        raw_bytes = fh.read()
    return detect_and_decode(raw_bytes, hint_encoding=hint_encoding)
