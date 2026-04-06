"""
Resolve filesystem paths stored in the texts table for the active DATA_DIR.

Packaged Electron sets ``METALINGO_DATA_PATH``; the backend ``cwd`` is under
``resources/backend``, so **relative** paths in SQLite would otherwise fail
``Path.exists()`` even though uploads wrote files under ``userData/data/...``.
Also normalizes ``file://`` URLs and remaps ``.../corpora/...`` when the DB
still holds an old absolute prefix.

NOTE: We intentionally use ``os.path.abspath()`` rather than ``Path.resolve()``
to avoid following symlinks.  On macOS, ``Path.resolve()`` would canonicalize
``/var/…`` → ``/private/var/…``, creating a mismatch between the path used
when annotation sidecar files are **written** (raw stored path) and the path
used when they are **read** here.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)


def resolve_stored_path(stored: Optional[str]) -> Optional[Path]:
    """
    Return an absolute Path if the file or directory exists, else None.

    Tries in order:
    1. Parse ``file://`` URL (with unquoting; Windows drive letter handled).
    2. ``expanduser`` + absolute path that exists.
    3. Relative path joined with ``DATA_DIR``.
    4. If the stored string contains a ``corpora`` segment, retry under current
       ``DATA_DIR`` using the subpath from ``corpora`` onward (cross-machine / prefix change).
    """
    if not stored or not str(stored).strip():
        return None

    raw = str(stored).strip()
    if raw.lower().startswith("file:"):
        parsed = urlparse(raw if "://" in raw else "file://" + raw.replace("file:", "", 1))
        path_str = unquote(parsed.path or "")
        if sys.platform == "win32" and len(path_str) >= 3 and path_str[0] == "/" and path_str[2] == ":":
            path_str = path_str[1:]
        p = Path(os.path.expanduser(path_str))
    else:
        p = Path(os.path.expanduser(raw))

    def _ok(path: Path) -> Optional[Path]:
        # Use abspath (not resolve) to avoid following symlinks.
        # resolve() on macOS would expand /var → /private/var, causing a
        # mismatch with paths written by annotation code (which use the raw path).
        try:
            if path.is_file() or path.is_dir():
                return Path(os.path.abspath(path))
        except OSError:
            pass
        try:
            if path.exists():
                return Path(os.path.abspath(path))
        except OSError:
            pass
        return None

    hit = _ok(p)
    if hit is not None:
        return hit

    from config import DATA_DIR

    if not p.is_absolute():
        cand = Path(os.path.abspath(DATA_DIR / p))
        hit = _ok(cand)
        if hit is not None:
            logger.debug("resolve_stored_path: relative via DATA_DIR %s -> %s", p, hit)
            return hit

    parts = p.parts
    if "corpora" in parts:
        idx = parts.index("corpora")
        tail = Path(*parts[idx:])
        cand = Path(os.path.abspath(DATA_DIR / tail))
        hit = _ok(cand)
        if hit is not None:
            logger.debug("resolve_stored_path: corpora tail remap %s -> %s", p, hit)
            return hit

    logger.debug("resolve_stored_path: not found: %s (DATA_DIR=%s)", stored, DATA_DIR)
    return None


def find_usas_sidecar_path(content_path: Path) -> Optional[Path]:
    """
    Locate a USAS JSON sidecar next to a corpus text file.

    Tries, in order:
    1. ``{stem}.usas.json`` (canonical; matches writers using Path.stem)
    2. ``{full_filename}.usas.json`` e.g. ``doc.txt.usas.json`` (legacy / alternate tools)
    3. ``Path.with_suffix('.usas.json')`` (single-suffix replacement)
    4. If multiple ``{stem}*.usas.json`` exist, prefer (1) if present else the shortest name.

    Returns the first path that exists as a file, or None.
    """
    try:
        parent = content_path.parent
        stem = content_path.stem
        name = content_path.name
        candidates: list[Path] = [
            parent / f"{stem}.usas.json",
            parent / f"{name}.usas.json",
            content_path.with_suffix(".usas.json"),
        ]
        seen: set[str] = set()
        ordered: list[Path] = []
        for c in candidates:
            key = str(c)
            if key not in seen:
                seen.add(key)
                ordered.append(c)
        for c in ordered:
            try:
                if c.is_file():
                    return Path(os.path.abspath(c))
            except OSError:
                continue
        # Controlled glob: same stem prefix (avoids picking unrelated *.usas.json in folder)
        try:
            matches = sorted(parent.glob(f"{stem}*.usas.json"))
            if len(matches) == 1:
                return Path(os.path.abspath(matches[0]))
            if len(matches) > 1:
                canon = parent / f"{stem}.usas.json"
                if canon in matches:
                    return Path(os.path.abspath(canon))
                return Path(os.path.abspath(matches[0]))
        except OSError:
            pass
    except OSError:
        pass
    return None
