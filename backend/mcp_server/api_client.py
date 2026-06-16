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
                timeout=httpx.Timeout(600.0, connect=10.0),
                trust_env=False,  # never route localhost through system proxy (e.g. Privoxy)
            )
        return self._client

    def _raise_with_detail(self, r: httpx.Response) -> None:
        """Raise HTTPStatusError with backend error detail included."""
        if r.is_error:
            try:
                body = r.json()
                detail = body.get("detail", body.get("message", r.text))
            except Exception:
                detail = r.text or r.reason_phrase
            raise httpx.HTTPStatusError(
                f"HTTP {r.status_code} error calling {r.url.path}: {detail}",
                request=r.request,
                response=r,
            )

    async def get(self, path: str, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.get(path, **kwargs)
        self._raise_with_detail(r)
        return r.json()

    async def post(self, path: str, json_data: Any = None, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.post(path, json=json_data, **kwargs)
        self._raise_with_detail(r)
        return r.json()

    async def put(self, path: str, json_data: Any = None, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.put(path, json=json_data, **kwargs)
        self._raise_with_detail(r)
        return r.json()

    async def post_file_download(self, path: str, json_data: Any = None) -> bytes:
        """POST request that returns binary content (e.g. ZIP export)."""
        c = await self._get_client()
        r = await c.post(path, json=json_data)
        self._raise_with_detail(r)
        return r.content

    async def upload_text_content(
        self,
        corpus_id: str,
        filename: str,
        content: str,
        config: Optional[dict] = None,
    ) -> dict:
        """Upload text content as a file to a corpus via multipart form.

        Sends the same `config` JSON field as the Meta-Lingo UI (metadata, tags, language).
        """
        c = await self._get_client()
        files = {"files": (filename, io.BytesIO(content.encode("utf-8")), "text/plain")}
        data = {"config": json.dumps(config or {})}
        r = await c.post(
            f"/api/corpus/{corpus_id}/upload",
            files=files,
            data=data,
            timeout=httpx.Timeout(300.0, connect=10.0),
        )
        r.raise_for_status()
        return r.json()

    async def upload_file(
        self,
        path: str,
        filepath: str,
        filename: str | None = None,
    ) -> dict:
        """Upload a file via multipart form (generic, for biblio uploads etc.)."""
        import pathlib
        c = await self._get_client()
        p = pathlib.Path(filepath)
        fname = filename or p.name
        with open(filepath, "rb") as fh:
            files = {"file": (fname, fh, "application/octet-stream")}
            r = await c.post(path, files=files, timeout=httpx.Timeout(300.0, connect=10.0))
        r.raise_for_status()
        return r.json()

    async def delete(self, path: str, **kwargs) -> dict:
        c = await self._get_client()
        r = await c.delete(path, **kwargs)
        self._raise_with_detail(r)
        return r.json()

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
