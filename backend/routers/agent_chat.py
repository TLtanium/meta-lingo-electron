"""
Agent Chat router for Meta-Lingo.
Provides SSE streaming endpoint + task management endpoints for Agent Chat mode.
"""
import json
import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.tool_registry import TOOL_MODULES_META
from services.agent_service import AgentService
from services.agent_task_service import get_task_service

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
    hidden: bool = False  # compact summary messages are hidden in UI but sent to model


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

    messages = [{"role": m.role, "content": m.content, "hidden": m.hidden} for m in request.messages]
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


# ── Task management endpoints ─────────────────────────────────────────────────

class StartTaskRequest(BaseModel):
    corpus_id: str
    task_type: str
    total_texts: int
    session_hint: str = ""
    plan: Optional[Dict[str, Any]] = None   # structured task plan (from plan_analysis_task)


class SaveResultRequest(BaseModel):
    text_id: str
    text_label: str
    content: str
    status: str = "success"          # "success" | "failed" | "skipped"
    error_message: str = ""          # human-readable error for failed texts


@router.post("/tasks/start")
async def start_task(req: StartTaskRequest):
    """Create a new analysis task with optional structured plan."""
    svc = get_task_service()
    task_id = svc.create_task(
        task_type=req.task_type,
        corpus_id=req.corpus_id,
        total_texts=req.total_texts,
        session_hint=req.session_hint,
        plan=req.plan,
    )
    return {"success": True, "data": {"task_id": task_id}}


@router.post("/tasks/{task_id}/save")
async def save_task_result(task_id: str, req: SaveResultRequest):
    """Save one text's analysis result (success / failed / skipped)."""
    svc = get_task_service()
    try:
        completed, total = svc.save_result(
            task_id=task_id,
            text_id=req.text_id,
            text_label=req.text_label,
            content=req.content,
            status=req.status,
            error_message=req.error_message,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"success": True, "data": {"completed": completed, "total": total}}


@router.get("/tasks/{task_id}/results")
async def get_task_results(
    task_id: str,
    index_only: bool = Query(
        False,
        description=(
            "When true, return only the status index (task_id+status+label per text) "
            "for context-efficient mid-task progress checks. "
            "When false (default), return full content for final aggregation."
        ),
    ),
):
    """Read saved results for a task.

    Use index_only=true for a mid-task progress check that won't flood the
    context window.  Use the default (index_only=false) once all texts are
    done for the full aggregation payload.
    """
    svc = get_task_service()
    content = svc.read_results(task_id, index_only=index_only)
    return {"success": True, "data": {"content": content}}


@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """Get task progress status."""
    svc = get_task_service()
    status = svc.get_status(task_id)
    if status is None:
        raise HTTPException(404, f"Task '{task_id}' not found")
    return {"success": True, "data": status}


@router.get("/tasks")
async def list_tasks():
    """List all task directories."""
    svc = get_task_service()
    return {"success": True, "data": svc.list_tasks()}


class CleanupTasksRequest(BaseModel):
    task_ids: List[str]


@router.post("/tasks/cleanup")
async def cleanup_tasks(req: CleanupTasksRequest):
    """Delete task directories for the given task IDs (called on conversation delete)."""
    svc = get_task_service()
    removed = svc.cleanup_tasks(req.task_ids)
    return {"success": True, "data": {"removed": removed}}
