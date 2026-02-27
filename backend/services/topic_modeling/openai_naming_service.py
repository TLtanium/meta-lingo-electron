"""
OpenAI-compatible API topic naming service.
Uses OpenAI-style chat completions to generate topic names (same prompts as Ollama naming).
"""

import logging
import re
from typing import Dict, List, Any, Optional
import httpx

logger = logging.getLogger(__name__)

DEFAULT_PROMPT_ZH = """
你是一个专业的主题命名专家。请根据以下关键词，生成一个精准、具体的主题名称。

关键词: [KEYWORDS]

命名要求：
1. 名称必须使用中文
2. 长度为3-8个汉字
3. 名称要具体明确，能准确反映关键词的核心含义
4. 避免使用"相关"、"问题"、"方面"等模糊词汇
5. 使用名词短语形式，如"智能教育系统"、"气候变化影响"
6. 只输出主题名称本身，不要任何标点、引号或解释

示例：
- 关键词: 学生, 教师, 课程, 学习, 成绩 -> 学业表现评估
- 关键词: 污染, 排放, 碳, 能源, 环境 -> 碳排放治理
- 关键词: 价格, 市场, 交易, 股票, 投资 -> 股票市场投资

主题名称:"""

DEFAULT_PROMPT_EN = """
You are a professional topic naming expert. Generate a precise and specific topic name based on the following keywords.

Keywords: [KEYWORDS]

Naming requirements:
1. Use English only
2. Use CamelCase format (e.g., ClimateChangePolicy, MachineLearningSystems)
3. Length: 2-5 words combined into CamelCase
4. Be specific and descriptive, accurately reflecting the core meaning
5. Avoid vague words like "Related", "Issues", "Aspects", "Topics"
6. Output ONLY the CamelCase topic name, no spaces, punctuation, quotes, or explanations

Examples:
- Keywords: student, teacher, course, learning, grades -> AcademicPerformanceEvaluation
- Keywords: pollution, emission, carbon, energy, environment -> CarbonEmissionControl
- Keywords: price, market, trading, stock, investment -> StockMarketInvestment
- Keywords: neural, network, deep, learning, model -> DeepLearningModels

Topic name:"""


def _clean_topic_name(raw_response: str, language: str = "en") -> str:
    if not raw_response:
        return ""
    prefixes = [
        r"主题名称[：:]\s*",
        r"Topic name[：:]\s*",
        r"Topic[：:]\s*",
        r"Name[：:]\s*",
        r'^[\'"]',
    ]
    result = raw_response
    for prefix in prefixes:
        result = re.sub(prefix, "", result, flags=re.IGNORECASE)
    result = re.sub(r"[\'\"。，；;,.]+$", "", result)
    result = result.split("\n")[0].strip()
    if language == "en":
        result = _to_camel_case(result)
    else:
        result = result.replace(" ", "").replace("_", "")
    if len(result) > 50:
        result = result[:50]
    return result


def _to_camel_case(text: str) -> str:
    if not text:
        return ""
    if " " not in text and "_" not in text and "-" not in text:
        if any(c.isupper() for c in text[1:]):
            return text
    cleaned = re.sub(r"[^\w\s\-]", "", text)
    words = re.split(r"[\s_\-]+", cleaned)
    return "".join(word.capitalize() for word in words if word)


class OpenAITopicNamingService:
    """Generate topic names using OpenAI-compatible chat API."""

    def __init__(self):
        self.timeout = 60.0

    async def generate_topic_name(
        self,
        keywords: List[str],
        base_url: str,
        api_key: str,
        model: str,
        prompt_template: Optional[str] = None,
        language: str = "en",
        top_n_words: int = 10,
    ) -> Optional[str]:
        base_url = base_url.rstrip("/")
        prompt = prompt_template or (DEFAULT_PROMPT_ZH if language == "zh" else DEFAULT_PROMPT_EN)
        keywords_str = ", ".join(keywords[:top_n_words])
        prompt = prompt.replace("[KEYWORDS]", keywords_str)

        headers = {"Content-Type": "application/json"}
        if (api_key or "").strip():
            headers["Authorization"] = f"Bearer {(api_key or '').strip()}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": model or "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "You output only the requested topic name, nothing else."},
                            {"role": "user", "content": prompt},
                        ],
                        "max_tokens": 80,
                        "temperature": 0.3,
                    },
                )
                if r.status_code != 200:
                    logger.error(f"OpenAI naming API error: HTTP {r.status_code}")
                    return None
                data = r.json()
                choices = data.get("choices") or []
                if not choices:
                    return None
                raw = (choices[0].get("message") or {}).get("content", "").strip()
                return _clean_topic_name(raw, language)
        except Exception as e:
            logger.error(f"OpenAI naming error: {e}")
            return None

    async def generate_all_topic_names(
        self,
        topics: List[Dict[str, Any]],
        base_url: str,
        api_key: str,
        model: str,
        prompt_template: Optional[str] = None,
        language: str = "en",
        top_n_words: int = 10,
    ) -> List[Dict[str, Any]]:
        updated = []
        for topic in topics:
            topic_id = topic.get("id", -1)
            if topic_id == -1:
                updated.append(topic)
                continue
            words = topic.get("words", [])
            if not words:
                updated.append(topic)
                continue
            keywords = [
                w.get("word", w) if isinstance(w, dict) else str(w)
                for w in words[:top_n_words]
            ]
            if not keywords:
                updated.append(topic)
                continue
            try:
                name = await self.generate_topic_name(
                    keywords=keywords,
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    prompt_template=prompt_template,
                    language=language,
                    top_n_words=top_n_words,
                )
                if name:
                    topic["custom_label"] = name
                else:
                    topic["custom_label"] = (
                        _to_camel_case(" ".join(keywords[:2]))
                        if language == "en"
                        else "".join(keywords[:2])
                    )
            except Exception as e:
                logger.error(f"Error naming topic {topic_id}: {e}")
                topic["custom_label"] = (
                    _to_camel_case(" ".join(keywords[:2]))
                    if language == "en" and keywords
                    else ("".join(keywords[:2]) if keywords else f"Topic{topic_id}")
                )
            updated.append(topic)
        return updated


_openai_naming_service = None


def get_openai_naming_service() -> OpenAITopicNamingService:
    global _openai_naming_service
    if _openai_naming_service is None:
        _openai_naming_service = OpenAITopicNamingService()
    return _openai_naming_service
