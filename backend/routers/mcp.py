"""
MCP (Model Context Protocol) Server settings router.
Provides endpoints for managing MCP server configuration.
"""
import json
import sys
import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()


def _get_settings_path() -> Path:
    if getattr(sys, 'frozen', False):
        data_path = os.environ.get('METALINGO_DATA_PATH', '')
        if data_path:
            return Path(data_path) / "settings" / "mcp_settings.json"
    return Path(__file__).parent.parent.parent / "data" / "settings" / "mcp_settings.json"


def _load_settings() -> dict:
    path = _get_settings_path()
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    # Default: keep MCP disabled unless user explicitly enables it.
    return {"enabled": False}


def _save_settings(settings: dict):
    path = _get_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=4, ensure_ascii=False)


def _get_packaged_mcp_path() -> str:
    """Get the MCP server path relative to app resources (packaged mode)."""
    if sys.platform == "darwin":
        return "/Applications/Meta-Lingo.app/Contents/Resources/mcp-server/meta-lingo-mcp"
    elif sys.platform == "win32":
        return "C:\\Program Files\\Meta-Lingo\\resources\\mcp-server\\meta-lingo-mcp.exe"
    else:
        return "/opt/Meta-Lingo/resources/mcp-server/meta-lingo-mcp"


@router.get("/settings")
async def get_mcp_settings():
    """Get current MCP server settings."""
    settings = _load_settings()
    return {"success": True, "data": settings}


@router.put("/settings")
async def update_mcp_settings(request: dict):
    """Update MCP server settings."""
    settings = _load_settings()
    if "enabled" in request:
        settings["enabled"] = bool(request["enabled"])
    _save_settings(settings)
    return {"success": True, "data": settings}


@router.get("/config-info")
async def get_mcp_config_info():
    """Get MCP server configuration information for AI assistants.

    Returns config snippets for both connection methods:
    - stdio_snippet: for Claude Desktop (claude_desktop_config.json)
    - http_url: for Claude.ai web connectors (Streamable HTTP)
    """
    settings = _load_settings()
    is_packaged = getattr(sys, 'frozen', False)
    port = int(os.environ.get('METALINGO_PORT', 8000))
    backend_url = f"http://127.0.0.1:{port}"
    mcp_port = int(os.environ.get('METALINGO_MCP_PORT', 8001))
    mcp_http_url = f"http://127.0.0.1:{mcp_port}/mcp"

    if is_packaged:
        base = Path(sys.executable).parent.parent
        mcp_path = str(base / "mcp-server" / "meta-lingo-mcp")
    else:
        mcp_path = _get_packaged_mcp_path()

    stdio_snippet = {
        "mcpServers": {
            "meta-lingo": {
                "command": mcp_path,
                "args": ["--backend-url", backend_url],
            }
        }
    }

    # Check if .dxt file is available
    dxt_path = _get_dxt_path()
    has_dxt = dxt_path is not None and dxt_path.exists()

    return {
        "success": True,
        "data": {
            "enabled": settings.get("enabled", False),
            "is_packaged": is_packaged,
            "backend_url": backend_url,
            "stdio_snippet": stdio_snippet,
            "http_url": mcp_http_url,
            "tool_count": 18,
            "has_dxt": has_dxt,
        },
    }


def _get_dxt_path() -> Path | None:
    """Find the .dxt extension file."""
    is_packaged = getattr(sys, 'frozen', False)
    if is_packaged:
        # Packaged: resources/mcp-extension/meta-lingo-mcp.dxt
        base = Path(sys.executable).parent.parent
        p = base / "mcp-extension" / "meta-lingo-mcp.dxt"
        if p.exists():
            return p
    else:
        # Dev mode: dist/meta-lingo-mcp.dxt
        project_root = Path(__file__).parent.parent.parent
        p = project_root / "dist" / "meta-lingo-mcp.dxt"
        if p.exists():
            return p
    return None


@router.get("/download-extension")
async def download_extension():
    """Download the .dxt extension file for Claude Desktop."""
    dxt_path = _get_dxt_path()
    if dxt_path is None or not dxt_path.exists():
        return {"success": False, "message": "Extension file not found. Please build it first."}

    return FileResponse(
        path=str(dxt_path),
        filename="meta-lingo-mcp.dxt",
        media_type="application/octet-stream",
    )
