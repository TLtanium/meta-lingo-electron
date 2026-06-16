"""
Unified LLM chat router.
Supports Ollama and OpenAI-compatible APIs for analysis-module AI assistant.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal, Optional
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class OllamaConfig(BaseModel):
    url: str
    model: str


class OpenAIConfig(BaseModel):
    base_url: str
    api_key: str
    model: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class LLMChatRequest(BaseModel):
    provider: Literal["ollama", "openai"]
    ollama: Optional[OllamaConfig] = None
    openai: Optional[OpenAIConfig] = None
    context: str
    messages: List[ChatMessage]


class LLMChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=LLMChatResponse)
async def llm_chat(request: LLMChatRequest):
    """
    Send chat with system context and message history to Ollama or OpenAI-compatible API.
    """
    full_messages = [{"role": "system", "content": request.context}]
    for m in request.messages:
        full_messages.append({"role": m.role, "content": m.content})

    if request.provider == "ollama":
        if not request.ollama:
            raise HTTPException(status_code=400, detail="ollama config required when provider is ollama")
        url = request.ollama.url.rstrip("/")
        model = request.ollama.model
        try:
            async with httpx.AsyncClient(timeout=180.0, trust_env=False) as client:
                r = await client.post(
                    f"{url}/api/chat",
                    json={"model": model, "messages": full_messages, "stream": False},
                )
                if r.status_code != 200:
                    err = r.text
                    try:
                        data = r.json()
                        if isinstance(data.get("error"), str):
                            err = data["error"]
                    except Exception:
                        pass
                    raise HTTPException(status_code=502, detail=err or "Ollama request failed")
                data = r.json()
                msg = data.get("message") or {}
                content = msg.get("content", "")
                return LLMChatResponse(response=content or "")
        except httpx.ConnectError as e:
            logger.error(f"Ollama connection error: {e}")
            raise HTTPException(status_code=503, detail="Cannot connect to Ollama. Make sure it is running.")
        except httpx.TimeoutException:
            raise HTTPException(status_code=408, detail="Ollama request timeout")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Ollama chat error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    if request.provider == "openai":
        if not request.openai:
            raise HTTPException(status_code=400, detail="openai config required when provider is openai")
        base = request.openai.base_url.rstrip("/")
        api_key = (request.openai.api_key or "").strip()
        model = request.openai.model or "gpt-4o-mini"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        try:
            async with httpx.AsyncClient(timeout=180.0, trust_env=False) as client:
                r = await client.post(
                    f"{base}/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "messages": full_messages,
                        "max_tokens": 4096,
                    },
                )
                if r.status_code != 200:
                    err = r.text
                    try:
                        data = r.json()
                        if "error" in data and isinstance(data["error"], dict) and "message" in data["error"]:
                            err = data["error"]["message"]
                        elif "error" in data and isinstance(data["error"], str):
                            err = data["error"]
                    except Exception:
                        pass
                    raise HTTPException(status_code=502, detail=err or "OpenAI API request failed")
                data = r.json()
                choices = data.get("choices") or []
                if not choices:
                    return LLMChatResponse(response="")
                content = (choices[0].get("message") or {}).get("content", "")
                return LLMChatResponse(response=content or "")
        except httpx.ConnectError as e:
            logger.error(f"OpenAI connection error: {e}")
            raise HTTPException(status_code=503, detail="Cannot connect to OpenAI-compatible API.")
        except httpx.TimeoutException:
            raise HTTPException(status_code=408, detail="OpenAI API request timeout")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"OpenAI chat error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=400, detail="Invalid provider")
