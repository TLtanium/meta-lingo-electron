"""Prepare a private source-mode plugin using the running backend's interpreter.

Packaged installs use Electron's binary-based installer instead. This module is
also usable from a browser-only Vite session; it never edits personal catalogs.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlencode

PROJECT_ROOT = Path(__file__).resolve().parents[2]
_PREPARE_LOCK = threading.Lock()


def get_development_plugin_info(project_root: Path = PROJECT_ROOT) -> dict:
    if getattr(sys, "frozen", False):
        return {"ready": False, "reason": "desktopRequired"}
    if not Path(sys.executable).is_file():
        return {"ready": False, "reason": "missingBinary"}
    template = project_root / "openai-plugin"
    for relative in (".codex-plugin/plugin.json", "skills/meta-lingo/SKILL.md"):
        if not (template / relative).is_file():
            return {"ready": False, "reason": "missingTemplate"}
    return {"ready": True, "development": True}


def _write_json(file: Path, value: dict):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_suffix(file.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, file)


def prepare_development_plugin(backend_url: str, project_root: Path = PROJECT_ROOT) -> str:
    info = get_development_plugin_info(project_root)
    if not info["ready"]:
        raise RuntimeError(info["reason"])
    root = project_root / "data" / "openai-plugin-dev"
    plugin = root / "plugins" / "meta-lingo"
    marketplace = root / ".agents" / "plugins" / "marketplace.json"
    with _PREPARE_LOCK:
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".prepare-", dir=root) as temporary:
            staging = Path(temporary)
            shutil.copytree(project_root / "openai-plugin", staging, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("._*", ".DS_Store"))
            # Use the interpreter actually running FastAPI, not a shell-dependent
            # `python` or `conda run`, and execute current source on every launch.
            _write_json(staging / ".mcp.json", {"mcpServers": {"meta-lingo": {
                "command": sys.executable,
                "args": ["-m", "mcp_server", "--backend-url", backend_url, "--transport", "stdio"],
                "cwd": str(project_root / "backend"),
                "env": {"MCP_MODEL_NAME": "OpenAI (MCP, development)"},
                "startup_timeout_sec": 60,
                "tool_timeout_sec": 900,
            }}})
            shutil.copytree(staging, plugin, dirs_exist_ok=True)
            _write_json(marketplace, {
                "name": "meta-lingo-development",
                "interface": {"displayName": "MetaLingo · Development"},
                "plugins": [{
                    "name": "meta-lingo",
                    "source": {"source": "local", "path": "./plugins/meta-lingo"},
                    "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
                    "category": "Education & Research",
                }],
            })
    return "codex://plugins/meta-lingo?" + urlencode({"marketplacePath": str(marketplace)})
