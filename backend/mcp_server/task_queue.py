"""
MCP-only: serialize SpaCy annotation per corpus so uploads behave like
one-file-at-a-time manual use (no parallel spacy_annotation storms).
"""
from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mcp_server.api_client import MetaLingoClient

_ACTIVE_SPA_STATUSES = frozenset({"pending", "processing"})


async def wait_until_corpus_spacy_idle(
    client: "MetaLingoClient",
    corpus_id: str,
    *,
    poll_interval: float = 1.5,
    timeout: float = 3600.0,
) -> None:
    """
    Block until this corpus has no spacy_annotation task in pending/processing.

    Only used by MCP upload_text so multiple rapid MCP uploads do not match
    multiple concurrent background jobs (which make UI progress look synced).
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = await client.get(f"/api/corpus/{corpus_id}/tasks")
        tasks = result.get("data") or []
        active = [
            t
            for t in tasks
            if t.get("task_type") == "spacy_annotation"
            and t.get("status") in _ACTIVE_SPA_STATUSES
        ]
        if not active:
            return
        await asyncio.sleep(poll_interval)
    raise TimeoutError(
        f"Timed out after {timeout:.0f}s waiting for prior SpaCy tasks on corpus {corpus_id}"
    )
