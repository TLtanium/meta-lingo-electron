"""Run with conda meta-lingo-electron. No models, user catalogs or corpora are changed."""
import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from functools import partial
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from services import openai_plugin_service as service

spec = importlib.util.spec_from_file_location("mcp_router_check", ROOT / "backend/routers/mcp.py")
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)


class DevelopmentPluginChecks(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="metalingo-dev-plugin-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "Meta Lingo 中文"
        shutil.copytree(ROOT / "openai-plugin", self.root / "openai-plugin")
        (self.root / "backend").mkdir()
        for name, replacement in {
            "get_development_plugin_info": partial(service.get_development_plugin_info, self.root),
            "prepare_development_plugin": lambda url: service.prepare_development_plugin(url, self.root),
            "_load_settings": lambda: {"enabled": True},
        }.items():
            self.addCleanup(patch.stopall)
            patch.object(routes, name, replacement).start()
        self.app = FastAPI()
        self.app.include_router(routes.router, prefix="/api/mcp")

    async def request(self, method, suffix, client="127.0.0.1", **kwargs):
        transport = httpx.ASGITransport(app=self.app, client=(client, 12345))
        async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8765") as caller:
            return await caller.request(method, "/api/mcp/openai-plugin/" + suffix, **kwargs)

    async def test_browser_development_routes_prepare_current_python_and_source(self):
        response = await self.request("GET", "info", headers={"origin": "http://localhost:5173"})
        self.assertEqual(response.json()["data"], {"ready": True, "development": True})
        self.assertFalse((self.root / "data").exists(), "Readiness must not install anything")
        response = await self.request("POST", "prepare", headers={"origin": "http://localhost:5173"})
        link = urlparse(response.json()["link"])
        self.assertEqual((link.scheme, link.netloc, link.path), ("codex", "plugins", "/meta-lingo"))
        marketplace = Path(parse_qs(link.query)["marketplacePath"][0])
        catalog = json.loads(marketplace.read_text())
        self.assertEqual(catalog["name"], "meta-lingo-development")
        plugin = marketplace.parents[2] / catalog["plugins"][0]["source"]["path"]
        # The client copies plugins into a cache, so absolute source/cwd must survive.
        cached = self.root / "isolated-client-cache"
        shutil.copytree(plugin, cached)
        config = json.loads((cached / ".mcp.json").read_text())["mcpServers"]["meta-lingo"]
        self.assertEqual(config["command"], sys.executable)
        self.assertEqual(config["args"], ["-m", "mcp_server", "--backend-url", "http://127.0.0.1:8765", "--transport", "stdio"])
        self.assertEqual(config["cwd"], str(self.root / "backend"))
        self.assertTrue((cached / "skills/meta-lingo/SKILL.md").exists())
        again = await self.request("POST", "prepare")
        self.assertEqual(again.json()["link"], response.json()["link"])

    async def test_disabled_mcp_and_remote_origins_cannot_prepare(self):
        for client, origin in [("192.168.1.10", "http://localhost:5173"), ("127.0.0.1", "https://example.com")]:
            response = await self.request("POST", "prepare", client=client, headers={"origin": origin})
            self.assertEqual(response.status_code, 403)
        with patch.object(routes, "_load_settings", return_value={"enabled": False}):
            response = await self.request("POST", "prepare")
            self.assertEqual(response.json(), {"success": False, "errorCode": "notEnabled"})
        self.assertFalse((self.root / "data").exists())

    async def test_packaged_backend_does_not_offer_source_python(self):
        with patch.object(sys, "frozen", True, create=True):
            response = await self.request("GET", "info")
            self.assertEqual(response.json()["data"], {"ready": False, "reason": "desktopRequired"})
            response = await self.request("POST", "prepare")
            self.assertEqual(response.json(), {"success": False, "errorCode": "desktopRequired"})

    async def test_missing_templates_do_not_offer_a_broken_install(self):
        (self.root / "openai-plugin/skills/meta-lingo/SKILL.md").unlink()
        response = await self.request("GET", "info")
        self.assertEqual(response.json()["data"], {"ready": False, "reason": "missingTemplate"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
