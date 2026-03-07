"""
AI-generated sections for bibliographic entries.
Uses LLM (OpenAI-compatible API or Ollama) to extract 11 sections from PDF/abstract text.
"""

import re
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# 11 section keys and their Chinese/English headings for prompt and parsing
AI_SECTION_KEYS = [
    "research_objective",
    "research_question",
    "research_design",
    "research_conclusion",
    "theoretical_mechanism",
    "theoretical_contribution",
    "limitations",
    "application_value",
    "academic_dialogue",
    "future_direction",
    "literature_summary",
]

SECTION_HEADINGS_ZH = {
    "research_objective": "研究目标",
    "research_question": "研究问题",
    "research_design": "研究设计",
    "research_conclusion": "研究结论",
    "theoretical_mechanism": "理论机制",
    "theoretical_contribution": "理论贡献",
    "limitations": "局限性",
    "application_value": "应用价值",
    "academic_dialogue": "学术对话",
    "future_direction": "未来方向",
    "literature_summary": "文献总结",
}

SECTION_HEADINGS_EN = {
    "research_objective": "Research objective",
    "research_question": "Research question",
    "research_design": "Research design",
    "research_conclusion": "Research conclusion",
    "theoretical_mechanism": "Theoretical mechanism",
    "theoretical_contribution": "Theoretical contribution",
    "limitations": "Limitations",
    "application_value": "Application value",
    "academic_dialogue": "Academic dialogue",
    "future_direction": "Future direction",
    "literature_summary": "Literature summary",
}

NOT_MENTIONED_ZH = "原文未提及"
NOT_MENTIONED_EN = "Not mentioned in source"


def get_text_for_entry(entry: Dict[str, Any], data_dir: Path) -> str:
    """
    Get text for AI generation: PDF only when a PDF is uploaded, else abstract.
    When the entry has pdf_path and the file exists, use only PDF-extracted text
    (no abstract). When no PDF is uploaded, use title + abstract. Each call is
    independent; no conversation history is sent to the LLM.
    """
    from services.biblio.pdf_utils import extract_text_from_pdf
    pdf_path = entry.get("pdf_path")
    if pdf_path:
        full_path = data_dir / pdf_path
        if full_path.exists():
            text = extract_text_from_pdf(full_path, max_pages=50)
            if text and text.strip():
                return text.strip()
            raise ValueError(
                "PDF has no extractable text (e.g. image-only). Upload a text-based PDF or remove the PDF to use abstract."
            )
    abstract = entry.get("abstract") or ""
    title = entry.get("title") or ""
    return f"Title: {title}\n\nAbstract: {abstract}".strip()


def _build_prompt(language: str, text: str) -> Tuple[str, str]:
    """Build system and user prompt for the LLM. language is 'zh' or 'en'."""
    headings = SECTION_HEADINGS_ZH if language == "zh" else SECTION_HEADINGS_EN
    not_mentioned = NOT_MENTIONED_ZH if language == "zh" else NOT_MENTIONED_EN
    heading_list = "\n".join(f"- ## {h}" for h in headings.values())

    if language == "zh":
        system = (
            "你是一位学术文献分析专家。请根据用户提供的文献全文或摘要，按以下二级标题（##）逐项填写内容。"
            "每个标题下写一段简洁的概括；若原文中未提及该项，则只写「原文未提及」。"
            "输出必须使用 Markdown 格式，且只包含以下二级标题（每个标题占一行，内容在标题下方）：\n"
            + heading_list
        )
        user = f"请分析以下文献并按要求输出：\n\n{text}"
    else:
        system = (
            "You are an expert in academic literature analysis. Based on the full text or abstract provided, "
            "fill in each of the following level-2 headings (##) with a concise summary. "
            "If the source does not mention that aspect, write only \"Not mentioned in source\". "
            "Output must be in Markdown format with exactly these level-2 headings:\n"
            + heading_list
        )
        user = f"Please analyze the following document and output as requested:\n\n{text}"

    return system, user


def parse_sections_from_markdown(response: str, language: str) -> Dict[str, str]:
    """Parse LLM markdown response into a dict of section_key -> value."""
    headings = SECTION_HEADINGS_ZH if language == "zh" else SECTION_HEADINGS_EN
    not_mentioned = NOT_MENTIONED_ZH if language == "zh" else NOT_MENTIONED_EN
    # Map heading text -> key
    heading_to_key = {v: k for k, v in headings.items()}
    result = {k: not_mentioned for k in AI_SECTION_KEYS}

    if not response or not response.strip():
        return result

    # Split by ## heading lines; capture heading and content until next ##
    pattern = r"##\s*(.+?)(?=\n##|\Z)"
    matches = re.findall(pattern, response, re.DOTALL)
    for m in matches:
        line = m.strip()
        if not line:
            continue
        first_newline = line.find("\n")
        if first_newline >= 0:
            title = line[:first_newline].strip()
            content = line[first_newline + 1 :].strip()
        else:
            title = line
            content = ""
        # Normalize title (strip extra spaces)
        title_norm = re.sub(r"\s+", " ", title).strip()
        for head_text, key in heading_to_key.items():
            if head_text in title_norm or title_norm in head_text:
                result[key] = content if content else not_mentioned
                break

    return result


async def _call_ollama(url: str, model: str, system: str, user: str) -> str:
    """Call Ollama /api/chat. Single request only (no conversation history). Returns assistant content."""
    full_messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(
            f"{url.rstrip('/')}/api/chat",
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
            raise RuntimeError(err or "Ollama request failed")
        data = r.json()
        msg = data.get("message") or {}
        return (msg.get("content") or "").strip()


async def _call_openai(base_url: str, api_key: str, model: str, system: str, user: str) -> str:
    """Call OpenAI-compatible /chat/completions. Single request only (no conversation history). Returns assistant content."""
    full_messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    headers = {"Content-Type": "application/json"}
    if (api_key or "").strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json={"model": model or "gpt-4o-mini", "messages": full_messages, "max_tokens": 4096},
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
            raise RuntimeError(err or "OpenAI API request failed")
        data = r.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return ((choices[0].get("message") or {}).get("content") or "").strip()


async def generate_sections_for_entry(
    entry_id: str,
    language: str,
    *,
    data_dir: Path,
    use_openai: bool,
    openai_base_url: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    openai_model: Optional[str] = None,
    ollama_url: Optional[str] = None,
    ollama_model: Optional[str] = None,
    get_entry_fn=None,
    update_entry_fn=None,
) -> Dict[str, Dict[str, Any]]:
    """
    Generate the 11 AI sections for one entry and persist to DB.
    use_openai: if True and openai config is valid, use API; else use Ollama.
    get_entry_fn(entry_id) -> entry dict, update_entry_fn(entry_id, {"ai_sections": ...}) -> None.
    Returns the new ai_sections dict (key -> {value, hidden}).
    """
    if get_entry_fn is None or update_entry_fn is None:
        raise ValueError("get_entry_fn and update_entry_fn are required")
    entry = get_entry_fn(entry_id)
    if not entry:
        raise ValueError("Entry not found")
    text = get_text_for_entry(entry, data_dir)
    if not text or not text.strip():
        raise ValueError("No text available for this entry (no PDF and no abstract)")

    system, user = _build_prompt(language, text)
    response_text = ""

    if use_openai and openai_base_url and (openai_api_key or openai_base_url):
        try:
            response_text = await _call_openai(
                openai_base_url, openai_api_key or "", openai_model or "gpt-4o-mini", system, user
            )
        except Exception as e:
            logger.warning("OpenAI call failed, falling back to Ollama: %s", e)
            response_text = ""

    if not response_text and ollama_url and ollama_model:
        response_text = await _call_ollama(ollama_url, ollama_model, system, user)

    if not response_text:
        raise RuntimeError("No LLM response (OpenAI and Ollama both failed or not configured)")

    parsed = parse_sections_from_markdown(response_text, language)
    existing = entry.get("ai_sections") or {}
    if not isinstance(existing, dict):
        existing = {}
    # Merge: keep existing hidden flag, set value from parsed
    new_sections = {}
    for key in AI_SECTION_KEYS:
        prev = existing.get(key) if isinstance(existing.get(key), dict) else {}
        hidden = prev.get("hidden", False)
        value = parsed.get(key, prev.get("value", NOT_MENTIONED_ZH if language == "zh" else NOT_MENTIONED_EN))
        new_sections[key] = {"value": value, "hidden": hidden}
    update_entry_fn(entry_id, {"ai_sections": new_sections})
    return new_sections
