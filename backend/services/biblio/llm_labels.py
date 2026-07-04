"""
AI-assisted cluster labelling for bibliographic visualization.

All clusters' candidate terms are submitted to the LLM in ONE request
(context-aware joint labelling), so the model can de-duplicate across clusters —
traditional per-cluster LLR/TF-IDF labelling often names several clusters with
the same generic head word. Provider selection follows the app-wide rule:
when the OpenAI-compatible API is enabled it is tried first, otherwise (or on
failure) the local Ollama model is used.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from .entry_ai_service import _call_ollama, _call_openai

logger = logging.getLogger(__name__)


def _build_prompt(clusters: List[Dict[str, Any]], language: str) -> tuple[str, str]:
    zh = language.startswith("zh") or language == "chinese"
    if zh:
        system = (
            "你是文献计量学专家，负责为共现网络的聚类命名。"
            "根据每个聚类的候选特征词（按统计显著性排序）和代表文献标题，"
            "给每个聚类一个简短（2-5 个词）、专业、能区分于其他聚类的主题标签。"
            "所有聚类一起考虑：不同聚类的标签必须互不重复、避免过于宽泛的词。"
            "只输出 JSON 对象，键为聚类编号（字符串），值为标签，不要输出其他内容。"
        )
    else:
        system = (
            "You are a bibliometrics expert naming clusters of a co-occurrence network. "
            "Given each cluster's candidate terms (ranked by statistical significance) "
            "and representative paper titles, give each cluster a short (2-5 words), "
            "specific, discriminative topic label. Consider ALL clusters together: "
            "labels must be mutually distinct and avoid generic head words. "
            "Output ONLY a JSON object mapping cluster id (string) to label."
        )
    lines = []
    for c in clusters:
        terms = ", ".join((c.get("top_terms") or [])[:10])
        titles = "; ".join((c.get("sample_titles") or [])[:3])
        lines.append(
            f"Cluster {c.get('id')}: size={c.get('size', 0)} | terms: {terms}"
            + (f" | titles: {titles}" if titles else "")
        )
    user = "\n".join(lines)
    return system, user


def _parse_labels(text: str) -> Dict[str, str]:
    """Extract the {id: label} JSON object from the model output (robustly)."""
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
    except Exception:
        return {}
    out: Dict[str, str] = {}
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, str) and v.strip():
                out[str(k)] = v.strip()
    return out


async def generate_llm_cluster_labels(
    clusters: List[Dict[str, Any]],
    language: str = "en",
    *,
    use_openai: bool = False,
    openai_base_url: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    openai_model: Optional[str] = None,
    ollama_url: Optional[str] = None,
    ollama_model: Optional[str] = None,
) -> Dict[str, str]:
    """Joint LLM labelling for all clusters. Returns {cluster_id(str): label}.

    Provider preference mirrors entry_ai_service: API first when enabled,
    Ollama otherwise / as fallback. Raises RuntimeError when no provider works.
    """
    if not clusters:
        return {}
    system, user = _build_prompt(clusters, language)

    response_text = ""
    last_err: Optional[Exception] = None
    if use_openai and openai_base_url:
        try:
            response_text = await _call_openai(
                openai_base_url, openai_api_key or "", openai_model or "gpt-4o-mini", system, user
            )
        except Exception as e:
            last_err = e
            logger.warning(f"LLM cluster labels via API failed, falling back to Ollama: {e}")
    if not response_text and ollama_url and ollama_model:
        try:
            response_text = await _call_ollama(ollama_url, ollama_model, system, user)
        except Exception as e:
            last_err = e
    if not response_text:
        raise RuntimeError(str(last_err) if last_err else "No LLM provider configured")

    labels = _parse_labels(response_text)
    if not labels:
        raise RuntimeError("LLM returned no parsable labels")
    return labels
