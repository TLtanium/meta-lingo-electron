"""
Agent Chat router for Meta-Lingo.
Provides SSE streaming endpoint for the Agent Chat mode.
"""
import json
import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.tool_registry import TOOL_MODULES_META
from services.agent_service import AgentService

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton agent service (lazily initialized)
_agent_service: Optional[AgentService] = None


def _get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service


# ── Request / Response schemas ───────────────────────────────────────────────

class OllamaConfig(BaseModel):
    url: str
    model: str


class OpenAIConfig(BaseModel):
    base_url: str
    api_key: str
    model: str


class AgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    provider: Literal["ollama", "openai"]
    ollama: Optional[OllamaConfig] = None
    openai: Optional[OpenAIConfig] = None
    messages: List[AgentMessage]
    enabled_modules: Optional[List[str]] = None
    language: str = "en"


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/chat/stream")
async def agent_chat_stream(request: AgentChatRequest):
    """SSE streaming endpoint for agent chat with tool calling."""
    # Validate provider config
    if request.provider == "ollama" and not request.ollama:
        raise HTTPException(400, "ollama config required when provider is 'ollama'")
    if request.provider == "openai" and not request.openai:
        raise HTTPException(400, "openai config required when provider is 'openai'")

    provider_config = {}
    if request.provider == "ollama" and request.ollama:
        provider_config = {"url": request.ollama.url, "model": request.ollama.model}
    elif request.provider == "openai" and request.openai:
        provider_config = {
            "base_url": request.openai.base_url,
            "api_key": request.openai.api_key,
            "model": request.openai.model,
        }

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    service = _get_agent_service()

    async def event_generator():
        async for event in service.run_agent_turn(
            provider=request.provider,
            provider_config=provider_config,
            messages=messages,
            enabled_modules=request.enabled_modules,
            language=request.language,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_tool_modules():
    """List available tool modules for the module selector."""
    return {"success": True, "data": TOOL_MODULES_META}
