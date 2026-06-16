"""
OpenAI-compatible API check router.
Allows verifying connection to any service that exposes OpenAI-style /v1/models.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class OpenAICheckRequest(BaseModel):
    base_url: str
    api_key: str = ""


class OpenAICheckResponse(BaseModel):
    connected: bool
    models: List[str] = []
    error: Optional[str] = None


@router.post("/check", response_model=OpenAICheckResponse)
async def check_openai_api(request: OpenAICheckRequest):
    """
    Check connection to an OpenAI-compatible API (GET /v1/models).
    Works with OpenAI, Azure OpenAI, local proxies, etc.
    """
    base_url = request.base_url.rstrip("/")
    api_key = (request.api_key or "").strip()

    try:
        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            url = f"{base_url}/models"
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            response = await client.get(url, headers=headers or None)

            if response.status_code == 200:
                data = response.json()
                # OpenAI returns { "data": [ { "id": "gpt-4", ... }, ... ] }
                items = data.get("data", [])
                models = []
                for item in items if isinstance(items, list) else []:
                    if isinstance(item, dict) and "id" in item:
                        models.append(item["id"])
                    elif isinstance(item, str):
                        models.append(item)
                return OpenAICheckResponse(connected=True, models=models)
            else:
                error_msg = f"API returned status {response.status_code}"
                try:
                    err_body = response.json()
                    if isinstance(err_body, dict) and "error" in err_body:
                        err_info = err_body["error"]
                        if isinstance(err_info, dict) and "message" in err_info:
                            error_msg = err_info["message"]
                        elif isinstance(err_info, str):
                            error_msg = err_info
                except Exception:
                    pass
                return OpenAICheckResponse(connected=False, models=[], error=error_msg)

    except httpx.ConnectError as e:
        logger.error(f"OpenAI API connection error: {e}")
        return OpenAICheckResponse(
            connected=False, models=[],
            error="Cannot connect to the API. Check base URL and network."
        )
    except httpx.TimeoutException as e:
        logger.error(f"OpenAI API timeout: {e}")
        return OpenAICheckResponse(connected=False, models=[], error="Connection timed out.")
    except Exception as e:
        logger.error(f"OpenAI API check error: {e}", exc_info=True)
        return OpenAICheckResponse(connected=False, models=[], error=str(e))
