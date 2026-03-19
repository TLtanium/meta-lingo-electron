"""
HTTP client wrapper for calling the Meta-Lingo FastAPI backend.
"""
import json
import io
from typing import Any, Optional

import httpx


class MetaLingoClient:
    """Async HTTP client that proxies MCP tool calls to the FastAPI REST API."""

    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(300.0, connect=10.0),
            )
        return self._client

    async def get(self, path: str, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.get(path, **kwargs)
        r.raise_for_status()
        return r.json()

    async def post(self, path: str, json_data: Any = None, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.post(path, json=json_data, **kwargs)
        r.raise_for_status()
        return r.json()

    async def post_file_download(self, path: str, json_data: Any = None) -> bytes:
        """POST request that returns binary content (e.g. ZIP export)."""
        c = await self._get_client()
        r = await c.post(path, json=json_data)
        r.raise_for_status()
        return r.content

    async def upload_text_content(
        self,
        corpus_id: str,
        filename: str,
        content: str,
        language: str = "english",
    ) -> dict:
        """Upload text content as a file to a corpus via multipart form."""
        c = await self._get_client()
        files = {"files": (filename, io.BytesIO(content.encode("utf-8")), "text/plain")}
        r = await c.post(
            f"/api/corpus/{corpus_id}/upload",
            files=files,
            timeout=120.0,
        )
        r.raise_for_status()
        return r.json()

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
