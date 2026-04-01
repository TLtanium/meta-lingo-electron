"""CSV export utility for MCP analysis tools.

Saves analysis results as CSV files matching the Meta-Lingo UI export format.
Each tool passes its raw API response data; this module handles file writing.
"""
import csv
import os
from datetime import date


DEFAULT_DIR = os.path.expanduser("~/Downloads")


def _resolve_path(save_path: str, default_filename: str) -> str:
    """Resolve save_path to an absolute file path.

    - Empty string or None → ~/Downloads/<default_filename>
    - Directory path → <dir>/<default_filename>
    - File path → use as-is
    """
    if not save_path:
        save_path = DEFAULT_DIR
    if os.path.isdir(save_path) or save_path.endswith(("/", "\\")):
        os.makedirs(save_path, exist_ok=True)
        return os.path.join(save_path, default_filename)
    parent = os.path.dirname(save_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    return save_path


def save_csv(
    rows: list[dict],
    save_path: str,
    default_filename: str,
    columns: list[str] | None = None,
) -> str:
    """Write rows as CSV file. Returns saved filepath.

    Args:
        rows: List of dicts, each representing a CSV row.
        save_path: File path, directory, or empty string for default location.
        default_filename: Fallback filename if save_path is a directory.
        columns: Explicit column order. If None, auto-detect from data
                 and filter out columns where all values are empty/None.
    """
    if not rows:
        return ""

    filepath = _resolve_path(save_path, default_filename)

    if columns is None:
        seen: dict[str, bool] = {}
        for row in rows:
            for k in row:
                if k not in seen:
                    seen[k] = True
        all_cols = list(seen.keys())
        columns = [
            c for c in all_cols
            if any(row.get(c) not in (None, "", [], {}) for row in rows)
        ]

    with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    return filepath


def today() -> str:
    return date.today().isoformat()
