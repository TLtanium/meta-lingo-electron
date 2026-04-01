"""
Block macOS junk / hidden filenames from MCP uploads so agents do not ingest
AppleDouble (._*), .DS_Store, or dotfiles.
"""
from __future__ import annotations

from pathlib import PurePath


def mcp_upload_filename_blocked_reason(filename: str) -> str | None:
    """
    If the basename should not be uploaded via MCP, return a short reason (English).
    Otherwise return None.
    """
    name = PurePath(filename.replace("\\", "/")).name
    if not name:
        return "Refusing upload: empty filename."
    if name.startswith("._"):
        return (
            "Refusing upload: macOS AppleDouble / resource-fork file (basename starts with "
            "'._'). Skip these when batch-reading a folder."
        )
    if name.lower() == ".ds_store":
        return "Refusing upload: .DS_Store is not corpus text."
    if name.startswith("."):
        return (
            "Refusing upload: hidden/dotfile basename (starts with '.'). "
            "Do not upload macOS metadata or other dotfiles as texts."
        )
    return None
