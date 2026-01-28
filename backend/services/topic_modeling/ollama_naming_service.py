"""
Ollama Topic Naming Service
Uses Ollama LLM to generate intelligent topic names
"""

import logging
import re
import time
from typing import Dict, List, Any, Optional
import httpx

logger = logging.getLogger(__name__)

# Default prompts for topic naming - optimized for clarity and CamelCase output
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


class OllamaTopicNamingService:
    """Service for generating topic names using Ollama"""
    
    def __init__(self):
        self.default_base_url = "http://localhost:11434"
        self.timeout = 30.0
    
    async def check_connection(self, base_url: str = None) -> Dict[str, Any]:
        """
        Check if Ollama is connected and get available models
        
        Args:
            base_url: Ollama base URL
            
        Returns:
            Connection status and available models
        """
        url = (base_url or self.default_base_url).rstrip('/')
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{url}/api/tags")
                
                if response.status_code == 200:
                    data = response.json()
                    models = [model["name"] for model in data.get("models", [])]
                    return {
                        'connected': True,
                        'models': models,
                        'url': url
                    }
                else:
                    return {
                        'connected': False,
                        'models': [],
                        'error': f"HTTP {response.status_code}"
                    }
                    
        except Exception as e:
            logger.error(f"Ollama connection check failed: {e}")
            return {
                'connected': False,
                'models': [],
                'error': str(e)
            }
    
    async def generate_topic_name(
        self,
        keywords: List[str],
        base_url: str,
        model: str,
        prompt_template: str = None,
        language: str = "en",
        top_n_words: int = 10
    ) -> Optional[str]:
        """
        Generate a topic name using Ollama
        
        Args:
            keywords: List of topic keywords
            base_url: Ollama base URL
            model: Model name to use
            prompt_template: Custom prompt template (use [KEYWORDS] placeholder)
            language: Language for default prompt (en/zh)
            top_n_words: Number of keywords to use for naming
            
        Returns:
            Generated topic name or None
        """
        url = base_url.rstrip('/')
        
        # Prepare prompt
        if prompt_template:
            prompt = prompt_template
        else:
            prompt = DEFAULT_PROMPT_ZH if language == "zh" else DEFAULT_PROMPT_EN
        
        keywords_str = ", ".join(keywords[:top_n_words])  # Use top N keywords
        prompt = prompt.replace("[KEYWORDS]", keywords_str)
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,
                            "top_p": 0.9,
                            "num_predict": 50
                        }
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    raw_response = result.get('response', '').strip()
                    
                    # Clean up the response and convert to CamelCase for English
                    topic_name = self._clean_topic_name(raw_response, language)
                    return topic_name
                else:
                    logger.error(f"Ollama API error: HTTP {response.status_code}")
                    return None
                    
        except httpx.TimeoutException:
            logger.error("Ollama request timeout")
            return None
        except Exception as e:
            logger.error(f"Ollama generate error: {e}")
            return None
    
    def _clean_topic_name(self, raw_response: str, language: str = "en") -> str:
        """Clean up the generated topic name and convert to CamelCase for English"""
        if not raw_response:
            return ""
        
        # Remove common prefixes
        prefixes = [
            r'主题名称[：:]\s*',
            r'Topic name[：:]\s*',
            r'Topic[：:]\s*',
            r'Name[：:]\s*',
            r'^[\'""]',
        ]
        
        result = raw_response
        for prefix in prefixes:
            result = re.sub(prefix, '', result, flags=re.IGNORECASE)
        
        # Remove trailing quotes and punctuation
        result = re.sub(r'[\'""。，；;,.]+$', '', result)
        
        # Take only the first line
        result = result.split('\n')[0].strip()
        
        # Convert to CamelCase for English
        if language == "en":
            result = self._to_camel_case(result)
        else:
            # For Chinese, just remove spaces and underscores
            result = result.replace(' ', '').replace('_', '')
        
        # Limit length
        if len(result) > 50:
            result = result[:50]
        
        return result
    
    def _to_camel_case(self, text: str) -> str:
        """Convert text to CamelCase format"""
        if not text:
            return ""
        
        # If already CamelCase (no spaces/underscores and has mixed case), return as is
        if ' ' not in text and '_' not in text and '-' not in text:
            # Check if it looks like CamelCase already
            if any(c.isupper() for c in text[1:]):
                return text
        
        # Remove special characters except spaces, underscores, and hyphens
        cleaned = re.sub(r'[^\w\s\-]', '', text)
        
        # Split by spaces, underscores, or hyphens
        words = re.split(r'[\s_\-]+', cleaned)
        
        # Capitalize first letter of each word and join
        result = ''.join(word.capitalize() for word in words if word)
        
        return result
    
    async def generate_all_topic_names(
        self,
        topics: List[Dict[str, Any]],
        base_url: str,
        model: str,
        prompt_template: str = None,
        language: str = "en",
        delay: float = 0.5,
        top_n_words: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Generate names for all topics
        
        Args:
            topics: List of topic dictionaries with 'id' and 'words'
            base_url: Ollama base URL
            model: Model name to use
            prompt_template: Custom prompt template
            language: Language for default prompt
            delay: Delay between requests in seconds
            top_n_words: Number of keywords to use for naming
            
        Returns:
            Updated topics with custom_label field
        """
        updated_topics = []
        
        for topic in topics:
            topic_id = topic.get('id', -1)
            
            # Skip outlier topic
            if topic_id == -1:
                updated_topics.append(topic)
                continue
            
            # Get keywords
            words = topic.get('words', [])
            if not words:
                updated_topics.append(topic)
                continue
            
            keywords = [w.get('word', w) if isinstance(w, dict) else str(w) for w in words[:top_n_words]]
            
            if not keywords:
                updated_topics.append(topic)
                continue
            
            # Generate name
            try:
                topic_name = await self.generate_topic_name(
                    keywords=keywords,
                    base_url=base_url,
                    model=model,
                    prompt_template=prompt_template,
                    language=language,
                    top_n_words=top_n_words
                )
                
                if topic_name:
                    topic['custom_label'] = topic_name
                    logger.info(f"Topic {topic_id}: {', '.join(keywords[:3])}... -> {topic_name}")
                else:
                    # Use fallback name from keywords in CamelCase
                    fallback_name = self._to_camel_case(" ".join(keywords[:2])) if language == "en" else "".join(keywords[:2])
                    topic['custom_label'] = fallback_name
                    logger.info(f"Topic {topic_id}: Using fallback name: {fallback_name}")
                    
            except Exception as e:
                logger.error(f"Error naming topic {topic_id}: {e}")
                fallback_name = self._to_camel_case(" ".join(keywords[:2])) if keywords and language == "en" else "".join(keywords[:2]) if keywords else f"Topic{topic_id}"
                topic['custom_label'] = fallback_name
            
            updated_topics.append(topic)
            
            # Add delay between requests
            if delay > 0:
                time.sleep(delay)
        
        return updated_topics


# Singleton instance
_ollama_naming_service = None


def get_ollama_naming_service() -> OllamaTopicNamingService:
    """Get Ollama naming service singleton"""
    global _ollama_naming_service
    if _ollama_naming_service is None:
        _ollama_naming_service = OllamaTopicNamingService()
    return _ollama_naming_service
