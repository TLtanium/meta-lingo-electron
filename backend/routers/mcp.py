"""
MCP (Model Context Protocol) Server settings router.
Provides endpoints for managing MCP server configuration.
"""
import json
import sys
import os
from pathlib import Path

from services.tool_registry import TOOL_DEFINITIONS

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from urllib.parse import urlparse

from services.openai_plugin_service import get_development_plugin_info, prepare_development_plugin

router = APIRouter()


def _require_local_plugin_request(request: Request):
    # This endpoint prepares local executable configuration. Only the local UI
    # or local Electron process may request it, even when the backend binds LAN.
    loopback = {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}
    origin = request.headers.get("origin")
    if not request.client or request.client.host not in loopback:
        raise HTTPException(status_code=403, detail="Local requests only")
    if origin and urlparse(origin).hostname not in loopback:
        raise HTTPException(status_code=403, detail="Local origins only")


@router.get("/openai-plugin/info")
def get_openai_development_plugin_info(request: Request):
    _require_local_plugin_request(request)
    return {"success": True, "data": get_development_plugin_info()}


@router.post("/openai-plugin/prepare")
def prepare_openai_development_plugin(request: Request):
    _require_local_plugin_request(request)
    info = get_development_plugin_info()
    if not info["ready"]:
        return {"success": False, "errorCode": info["reason"]}
    if not _load_settings().get("enabled", False):
        return {"success": False, "errorCode": "notEnabled"}
    port = request.url.port or int(os.environ.get("METALINGO_PORT", 8000))
    try:
        link = prepare_development_plugin(f"http://127.0.0.1:{port}")
        return {"success": True, "link": link}
    except OSError:
        return {"success": False, "errorCode": "prepareFailed"}


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

    # Check if the packaged Claude Desktop extension (.mcpb) is available
    extension_path = _get_extension_path()
    has_extension = extension_path is not None and extension_path.exists()

    return {
        "success": True,
        "data": {
            "enabled": settings.get("enabled", False),
            "is_packaged": is_packaged,
            "backend_url": backend_url,
            "stdio_snippet": stdio_snippet,
            "http_url": mcp_http_url,
            "tool_count": len(TOOL_DEFINITIONS),
            "has_extension": has_extension,
        },
    }


def _get_extension_path() -> Path | None:
    """Find the packaged Claude Desktop extension file (.mcpb).

    Anthropic renamed the "Desktop Extension" format from .dxt to .mcpb and
    moved packaging to the official @anthropic-ai/mcpb CLI (v4.9.38+) — see
    build.sh / build.bat Step 5-B. Path candidates mirror
    electron/main.ts::getMcpExtensionPath() so both sides agree on where the
    file lives in dev vs packaged mode.
    """
    is_packaged = getattr(sys, 'frozen', False)
    if is_packaged:
        # Packaged: resources/mcp-extension/meta-lingo-mcp.mcpb
        base = Path(sys.executable).parent.parent
        p = base / "mcp-extension" / "meta-lingo-mcp.mcpb"
        if p.exists():
            return p
    else:
        # Dev mode: check backend-dist/ first (full app build), then dist/ as
        # fallback (build-extension.bat / build-extension.sh standalone builds)
        project_root = Path(__file__).parent.parent.parent
        for candidate in [
            project_root / "backend-dist" / "meta-lingo-mcp.mcpb",
            project_root / "dist" / "meta-lingo-mcp.mcpb",
        ]:
            if candidate.exists():
                return candidate
    return None


@router.get("/download-extension")
async def download_extension():
    """Download the .mcpb extension file for Claude Desktop.

    Fallback for opening the backend URL directly in a real browser tab; the
    packaged app's Settings page uses the Electron shell.openPath IPC instead
    (native-window <a download> triggers get silently blocked/dropped).
    """
    extension_path = _get_extension_path()
    if extension_path is None or not extension_path.exists():
        return {"success": False, "message": "Extension file not found. Please build it first."}

    return FileResponse(
        path=str(extension_path),
        filename="meta-lingo-mcp.mcpb",
        media_type="application/octet-stream",
    )
