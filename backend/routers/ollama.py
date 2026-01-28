"""
Ollama LLM Connection API Router
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class OllamaConnectRequest(BaseModel):
    url: str


class OllamaConnectResponse(BaseModel):
    connected: bool
    models: List[str] = []
    error: Optional[str] = None


class OllamaChatRequest(BaseModel):
    url: str
    model: str
    message: str


class OllamaChatResponse(BaseModel):
    response: str


@router.post("/connect", response_model=OllamaConnectResponse)
async def connect_ollama(request: OllamaConnectRequest):
    """Connect to Ollama and list available models"""
    logger.info(f"Attempting to connect to Ollama at: {request.url}")
    
    # Normalize URL
    url = request.url.rstrip('/')
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try to connect to Ollama API
            api_url = f"{url}/api/tags"
            logger.info(f"Calling Ollama API: {api_url}")
            
            response = await client.get(api_url)
            logger.info(f"Ollama response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Ollama response data: {data}")
                models = [model["name"] for model in data.get("models", [])]
                logger.info(f"Found {len(models)} models: {models}")
                return OllamaConnectResponse(connected=True, models=models)
            else:
                error_msg = f"Ollama API returned status {response.status_code}"
                logger.warning(error_msg)
                return OllamaConnectResponse(connected=False, models=[], error=error_msg)
    
    except httpx.ConnectError as e:
        error_msg = f"Cannot connect to Ollama at {url}. Make sure Ollama is running."
        logger.error(f"Ollama connection error: {e}")
        return OllamaConnectResponse(connected=False, models=[], error=error_msg)
    except httpx.TimeoutException as e:
        error_msg = f"Connection to Ollama timed out"
        logger.error(f"Ollama timeout: {e}")
        return OllamaConnectResponse(connected=False, models=[], error=error_msg)
    except Exception as e:
        error_msg = f"Ollama connection failed: {str(e)}"
        logger.error(f"Ollama error: {e}", exc_info=True)
        return OllamaConnectResponse(connected=False, models=[], error=error_msg)


@router.get("/models")
async def list_ollama_models(url: str):
    """List available Ollama models"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{url}/api/tags")
            
            if response.status_code == 200:
                data = response.json()
                return [model["name"] for model in data.get("models", [])]
            else:
                return []
    
    except Exception:
        return []


@router.post("/chat", response_model=OllamaChatResponse)
async def chat_with_ollama(request: OllamaChatRequest):
    """Send chat message to Ollama"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{request.url}/api/generate",
                json={
                    "model": request.model,
                    "prompt": request.message,
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return OllamaChatResponse(response=data.get("response", ""))
            else:
                raise HTTPException(status_code=500, detail="Ollama request failed")
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Request timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

