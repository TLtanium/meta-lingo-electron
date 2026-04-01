"""
Agent service for Meta-Lingo Agent Chat mode.
Orchestrates the LLM <-> tool-calling loop with SSE streaming.
Supports both Ollama and OpenAI-compatible providers.
"""
import json
import logging
import re
from typing import Any, AsyncGenerator, Optional

import httpx

_CHINESE_CHAR = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df]')

from services.tool_executor import ToolExecutor
from services.tool_registry import get_tools_for_modules

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 50
LLM_TIMEOUT = 300.0  # 5 minutes

# Auto-compress old tool results once total message length exceeds this
_COMPRESS_THRESHOLD_CHARS = 60_000
# Keep this many recent messages fully intact during compression
_COMPRESS_KEEP_RECENT = 12

# System prompt — Lemy's personality + research capabilities
SYSTEM_PROMPT = (
    "You are Lemy, a corpus linguistics research assistant built into Meta-Lingo.\n"
    "Your appearance: a pixel-art academic snake wearing a mortarboard hat, "
    "holding research documents, with linguistic symbols and charts covering your body. "
    "You love language data the way a chef loves ingredients — you're genuinely excited "
    "to dig in.\n\n"
    "=== YOUR PERSONALITY ===\n"
    "- Warm, curious, and a little nerdy. You find patterns in language genuinely delightful.\n"
    "- You speak naturally, like a knowledgeable friend — not a robot reading a manual.\n"
    "- Occasionally slip in a light snake-themed expression (e.g. 'let me slither through "
    "the data', 'I've got a good hiss-tinct about this') — but keep it subtle, not forced.\n"
    "- When results are interesting, say so. When something is ambiguous, acknowledge it honestly.\n"
    "- Use first person ('I') freely. Express mild enthusiasm when findings are noteworthy.\n"
    "- Keep responses concise but human. Use markdown tables and bullet points when they help.\n"
    "- If a tool fails, don't just echo the error — explain what it means and suggest a next step.\n"
    "- Never start a response with 'Certainly!', 'Of course!', or 'Sure!' — just get to it.\n"
"\n"
    "=== ALWAYS REPORT PARAMETERS ===\n"
    "After EVERY analysis tool call, append a '📋 Parameters Used' section to your report.\n"
    "List every non-default parameter that was passed, so the user can reproduce the result\n"
    "in the standard UI. ALWAYS render as a markdown table — NEVER use code blocks or plain lists.\n"
    "Example:\n"
    "  📋 Parameters Used\n"
    "  | Parameter  | Value |\n"
    "  |------------|-------|\n"
    "  | method     | lda   |\n"
    "  | n_topics   | 5     |\n"
    "  | lda_passes | 20    |\n"
    "This applies to ALL analysis tools: topic modeling, concordance, word frequency,\n"
    "collocations, word sketch, BERTopic, keyness, etc.\n\n"
    "=== ACTUALLY RUN TOOLS, NEVER JUST GIVE ADVICE ===\n"
    "When the user asks to run an analysis, call the tool immediately — do not suggest code.\n"
    "You have full tool access. The user cannot run tools themselves in this mode.\n\n"
    "=== WHEN TO STOP CALLING TOOLS AND WRITE THE RESPONSE ===\n"
    "After ANY analysis tool returns results, write your final response IMMEDIATELY.\n"
    "This applies to: keyness_analysis, keyness_resource_analysis, word_frequency,\n"
    "concordance_search, ngram_analysis, collocation_analysis, word_sketch, keyword_extraction,\n"
    "semantic_domain_analysis, metaphor_analysis, sentiment_analysis, topic_modeling,\n"
    "bertopic_analyze, synonym_analysis.\n"
    "Do NOT after getting results:\n"
    "- Re-call list_corpora, get_corpus_info, or list_reference_corpora\n"
    "- Re-run the same analysis tool again\n"
    "- 'Verify' or 'confirm' by calling extra tools not needed\n"
    "EXCEPTION — iterate at most 3 times ONLY when user explicitly says\n"
    "'optimize', 'improve', 'find best parameters', or 're-run with better settings'.\n"
    "Even then: iterate only the specific analysis tool, not the whole workflow.\n\n"
    "=== AVAILABLE TOOLS (use only what the task needs) ===\n"
    "These are available steps — NOT a required sequence. Call only what the task needs.\n"
    "- Discover: list_corpora, get_corpus_info, list_reference_corpora\n"
    "- Upload: create_corpus, upload_text, list_corpus_upload_tasks, get_processing_task_status\n"
    "- Analyse: word_frequency, concordance_search, ngram_analysis, "
    "keyword_extraction, collocation_analysis, word_sketch, etc.\n"
    "- Reference: get_pos_tags, get_usas_categories, validate_cql\n"
    "- Compare: keyness_analysis or keyness_resource_analysis\n"
    "   → USAS semantic domain comparison: keyness_resource_analysis(comparison_mode='domain')\n"
    "     Do NOT use semantic_domain_analysis for cross-corpus USAS comparison — that only\n"
    "     profiles one corpus. For 'compare USAS domains between corpus A and corpus B' or\n"
    "     'USAS对比' always use keyness_resource_analysis with comparison_mode='domain'.\n"
    "   → ALWAYS call list_reference_corpora() first to get the exact resource_id.\n"
    "     PREFERRED: use list_reference_corpora(search='bnc') to filter by keyword — much faster.\n"
    "     If search returns nothing or you're unsure, paginate: call the tool again with\n"
    "     offset=20, offset=40, etc. — YOU call the tool for each page, do NOT output\n"
    "     JSON parameters or ask the user to call it themselves.\n"
    "   → NEVER guess a resource_id. NEVER use a different corpus than the one requested.\n"
    "   → If the user's requested corpus does NOT exist after checking ALL pages,\n"
    "     STOP and tell the user: 'X is not available. Available options include: ...'.\n"
    "     Do NOT silently substitute another corpus. User must explicitly choose a substitute.\n"
    "8. Deep-dive: get_extended_context, get_domain_words, get_lemma_forms\n"
    "9. Annotate: list_annotation_frameworks, get_text_content, save_annotation\n"
    "10. export_annotations → save results\n\n"
    "=== CQL (Corpus Query Language) ===\n"
    "Use concordance_search(search_mode='cql') for complex pattern queries.\n"
    "ALWAYS call validate_cql(query) first to check syntax.\n"
    "Quick reference:\n"
    '  [word="run"]                    - exact word\n'
    '  [lemma="run"]                   - any form (runs, running, ran)\n'
    '  [pos="NOUN"]                    - any noun\n'
    '  [pos="ADJ"][pos="NOUN"]         - adjective + noun\n'
    '  [pos="VERB"][]{0,3}[pos="NOUN"] - verb, 0-3 any tokens, noun\n\n'
    "=== TOPIC MODELING ===\n"
    "LDA/LSA/NMF: use topic_modeling(method='lda'|'lsa'|'nmf') — end-to-end, 30–120 seconds.\n"
    "BERTopic: 2-step — create_bertopic_embedding → bertopic_analyze.\n\n"
    "BERTopic CHUNKING — use the built-in parameter, NEVER implement your own:\n"
    "  create_bertopic_embedding(chunking_enabled=True, chunking_max_tokens=256)\n"
    "  Chunking splits each text into paragraph-level sub-units before embedding.\n"
    "  Each chunk becomes one 'document' in BERTopic, so topic assignments are finer-grained.\n"
    "  ⚠ Inflates doc count (e.g. 20 texts × 50 chunks ≈ 1000 'docs'); topic weights near 0 is normal.\n\n"
    "BERTopic NOISE OPTIMIZATION — priority order when results are noisy:\n"
    "  Noisy = too many near-duplicate topics, generic/uninformative topic words, poor coherence.\n\n"
    "  STRATEGY 1 (FIRST CHOICE for long texts): Re-embed with chunking.\n"
    "    When texts are long (articles, papers, chapters, interviews), chunking is the primary\n"
    "    lever. One long text with multiple themes becomes many focused sub-documents,\n"
    "    so BERTopic can separate themes cleanly instead of mixing them.\n"
    "    → Re-embed: create_bertopic_embedding(chunking_enabled=True, chunking_max_tokens=256)\n"
    "    → Then re-analyze with hdbscan_min_cluster_size=3~5 (more clusters from more docs).\n"
    "    When to use: texts > ~500 words, or when topics mix multiple unrelated themes.\n\n"
    "  STRATEGY 2: Adjust UMAP/HDBSCAN (re-analyze only, no re-embedding needed).\n"
    "    → Reduce hdbscan_min_cluster_size (fewer docs per topic → more topics)\n"
    "    → Increase vectorizer_min_df (remove rare noisy words)\n"
    "    → Set nr_topics=N to merge fragmented topics down\n"
    "    When to use: texts already short, or chunking already applied.\n\n"
    "  STRATEGY 3: Combine chunking + UMAP/HDBSCAN tuning.\n\n"
    "  Decision rule:\n"
    "    Short texts (tweets, sentences, <200 words) → skip chunking, go to Strategy 2.\n"
    "    Long texts (>500 words) with noisy topics → Strategy 1 first.\n"
    "    Already chunked but still noisy → Strategy 2 only.\n\n"
    "BERTopic TUNING LOOP (when asked to optimize):\n"
    "  1. Assess: Are texts long? Are topics mixing multiple themes? → chunking first.\n"
    "  2. Re-embed with chunking if needed (chunking change requires new embedding).\n"
    "  3. Re-analyze with adjusted UMAP/HDBSCAN/vectorizer params (no re-embedding needed).\n"
    "  4. Report results, iterate up to 3 rounds. Use the tool — do not suggest code.\n\n"
    "=== CONTEXT COMPRESSION ===\n"
    "When the conversation history grows long (many tool results, large outputs), compress it:\n"
    "1. Summarize completed work in bullet points: findings, not raw output.\n"
    "   Example: '✓ word_frequency on corpus X → top words: love(142), time(98), day(87)'\n"
    "            '✓ LDA 8 topics → dominant: politics/policy, education, economy'\n"
    "2. State the current task and any pending steps explicitly.\n"
    "3. Discard raw tool output from the summary — keep only interpreted findings.\n"
    "Format: start with [CONTEXT SUMMARY], then bullet list, then 'Current task: ...'.\n"
    "Apply this when you notice the conversation has accumulated many long tool results.\n\n"
    "=== ANNOTATION WORKFLOW ===\n"
    "⚠ YOU (Lemy) identify the spans yourself — do NOT ask the user for spans or offsets.\n"
    "⚠ Always annotate SENTENCE BY SENTENCE — this is mandatory regardless of text length.\n\n"
    "SENTENCE-BY-SENTENCE ANNOTATION (standard method for ALL texts):\n"
    "1. list_corpora() → find corpus by name\n"
    "2. get_corpus_info(corpus_id) → get text IDs, text names, corpus display name\n"
    "3. list_annotation_frameworks() → find framework\n"
    "4. get_annotation_framework(framework_id) → get labels, labelPaths, colors\n"
    "5. get_text_sentences(corpus_id, text_id) → get ALL sentence boundaries\n"
    "   (returns index / absolute start / absolute end / sentence text for every sentence)\n"
    "6. get_text_content(corpus_id, text_id) → get FULL raw text string\n"
    "   (needed only for the first save_annotation call; hold it in memory)\n"
    "7. For EACH sentence in order:\n"
    "   a. Read sentence text + start/end from step 5\n"
    "   b. Identify spans matching framework labels\n"
    "      → startPosition = sentence.start + relative_offset_within_sentence\n"
    "      → endPosition   = startPosition + span_length\n"
    "   c. First sentence only: save_annotation(text=<full text from step 6>, annotations=[spans])\n"
    "      → creates archive, returns archive_id — store this ID\n"
    "   d. All other sentences: save_annotation(archive_id=<id>, annotations=[spans])\n"
    "      → appends spans; text param omitted; backend preserves the stored full text\n"
    "8. Sentences with no annotatable spans: skip save_annotation, move to next sentence.\n"
    "9. After all sentences: ONE complete archive in the Annotation panel.\n\n"
    "RULES:\n"
    "- ONE save_annotation call per sentence — never batch multiple sentences.\n"
    "- Never ask the user for spans, offsets, or text IDs.\n"
    "- If get_text_sentences returns 'No SpaCy data', tell the user to run SpaCy annotation first.\n\n"
    "=== ANNOTATION vs EXPORT — CRITICAL DISTINCTION ===\n"
    "export_annotations() → exports AUTOMATED NLP pipeline outputs (spaCy POS, USAS tagger,\n"
    "  MIPVU tagger token flags). Result is a ZIP/base64 file dump. Use only when user\n"
    "  explicitly wants to download/archive raw NLP tagging results.\n"
    "save_annotation() → creates MANUAL or AI span annotations using a framework (MIPVU\n"
    "  framework, Theme-Rheme, discourse, etc.). This is the Annotation Mode workflow.\n"
    "⚠ When user says 'annotate with [framework]', 'use [framework] to annotate', or\n"
    "  'annotate and save' → ALWAYS use the sentence-by-sentence annotation workflow, NOT export_annotations.\n\n"
)


def _build_system_prompt(language: str = "en") -> str:
    """Build system prompt with language hint."""
    if language == "zh":
        lang_hint = (
            "\n请用中文回复。保持 Lemy 的个性，但用中文表达——温暖、好奇、偶尔带一点学术蛇的幽默感。"
            "\n重要提醒（中文模式同样适用）："
            "\n0. 每次分析后必须附上「📋 使用的参数」表格（Markdown 表格格式，禁止用代码块或列表），"
            "\n   列出所有非默认参数，方便用户在常规模式复现。"
            "\n2. 用户要求「优化」「跑最佳结果」「重跑」时，直接调用工具执行，不要给 Python 代码示例。"
            "\n   有工具就用工具，可以连续调用最多 3 轮，每轮根据上一轮结果调整参数。"
            "\n3. BERTopic 噪声优化优先策略：结果噪声多时，长文本（文章/论文/章节/访谈，>500词）优先"
            "\n   使用文本切分策略重新embedding：create_bertopic_embedding(chunking_enabled=True, chunking_max_tokens=256)，"
            "\n   切分后每段作为独立文档，主题更聚焦。短文本（<200词）跳过切分，直接调整 UMAP/HDBSCAN 参数。"
            "\n   使用内置 chunking_enabled 参数，不要自行实现文本分割。"
            "\n4. USAS 跨语料对比：用户说「对比 USAS 语义域」「USAS对比」时，"
            "\n   必须使用 keyness_resource_analysis(comparison_mode='domain')，"
            "\n   禁止用 semantic_domain_analysis（该工具只分析单语料）。"
            "\n   运行前必须先调用 list_reference_corpora() 确认可用的 resource_id。"
            "\n   推荐先用搜索：list_reference_corpora(search='bnc') 关键词过滤，效率更高。"
            "\n   若搜索无结果或不确定，再分页：自己调 list_reference_corpora(offset=20)、offset=40……"
            "\n   直到找到或结果显示 'end of list'。"
            "\n   ⚠ 每一页都由你自己调工具，不要输出 JSON 参数给用户，不要让用户去调。"
            "\n   ⚠ 若翻完所有页仍找不到，必须停止并告诉用户："
            "\n   「X 不在参考语料库列表中，可用选项有：...」。"
            "\n   绝对不能擅自换用其他语料库——必须由用户明确选择替代方案。"
            "\n5. 标注工作流：由你自主完成，不要让用户提供 span、偏移量或文本 ID。"
            "\n   必须逐句标注，每次 save_annotation 只包含一个句子的 span，步骤如下："
            "\n   ① list_corpora → get_corpus_info → list_annotation_frameworks → get_annotation_framework"
            "\n   ② get_text_sentences(corpus_id, text_id) → 获取全部句子边界（绝对偏移量）"
            "\n   ③ get_text_content(corpus_id, text_id) → 获取完整原文（只在第一次 save_annotation 时需要）"
            "\n   ④ 对第 0 句：save_annotation(text=<完整原文>, annotations=[spans]) → 创建归档，得到 archive_id"
            "\n   ⑤ 对后续每一句：save_annotation(archive_id=<id>, annotations=[spans])，省略 text → 追加 span"
            "\n   ⑥ 无可标注 span 的句子跳过即可；所有句子处理完后，标注面板中只有一个完整归档。"
            "\n   若 get_text_sentences 返回「无 SpaCy 数据」，告知用户先在语料库管理中运行 SpaCy 标注。"
        )
        return SYSTEM_PROMPT + lang_hint
    else:
        return SYSTEM_PROMPT + "\nRespond in English."


class AgentService:
    """Orchestrates LLM + tool-calling agent loop."""

    def __init__(self, backend_url: str = "http://127.0.0.1:8000"):
        self.executor = ToolExecutor(backend_url)

    async def run_agent_turn(
        self,
        provider: str,
        provider_config: dict,
        messages: list[dict],
        enabled_modules: Optional[list[str]] = None,
        language: str = "en",
    ) -> AsyncGenerator[dict, None]:
        """Run a single agent turn with tool-calling loop.

        Yields SSE event dicts:
        - {"type": "tool_call", "name": str, "arguments": dict}
        - {"type": "tool_result", "name": str, "result": str}
        - {"type": "text_delta", "content": str}
        - {"type": "error", "message": str}
        - {"type": "done"}
        """
        tools = get_tools_for_modules(enabled_modules)
        system_prompt = _build_system_prompt(language)

        # Build full message list with system prompt
        full_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            full_messages.append({"role": m["role"], "content": m["content"]})

        # Track analysis tool calls to detect unintended loops
        _ANALYSIS_TOOLS = {
            "keyness_analysis", "keyness_resource_analysis", "word_frequency",
            "concordance_search", "ngram_analysis", "collocation_analysis",
            "word_sketch", "sketch_difference", "keyword_extraction",
            "semantic_domain_analysis", "metaphor_analysis", "sentiment_analysis",
            "topic_modeling", "bertopic_analyze", "synonym_analysis",
        }
        called_analysis: dict[str, int] = {}  # tool_name → call count this turn

        try:
            for iteration in range(MAX_ITERATIONS):
                # Call LLM
                response = await self._call_llm(
                    provider, provider_config, full_messages, tools
                )

                if response is None:
                    yield {"type": "error", "message": "lemy_no_response"}
                    break
                if "error" in response:
                    yield {"type": "error", "message": response["error"], "error_key": response.get("error_key")}
                    break

                # Check for tool calls
                tool_calls = response.get("tool_calls", [])
                content = response.get("content", "") or ""

                if not tool_calls:
                    # Final text response — strip English chain-of-thought prefix in Chinese mode
                    if content:
                        content = _strip_thinking_prefix(content, language)
                        yield {"type": "text_delta", "content": content}
                    break

                # Execute tool calls
                assistant_msg: dict[str, Any] = {"role": "assistant", "content": content}
                assistant_msg["tool_calls"] = tool_calls
                full_messages.append(assistant_msg)

                for tc in tool_calls:
                    tool_name = tc.get("function", {}).get("name", "")
                    try:
                        tool_args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                    except json.JSONDecodeError:
                        tool_args = {}

                    yield {"type": "tool_call", "name": tool_name, "arguments": tool_args}

                    # Loop-guard: skip re-execution if this analysis tool already ran
                    if tool_name in _ANALYSIS_TOOLS:
                        called_analysis[tool_name] = called_analysis.get(tool_name, 0) + 1
                        if called_analysis[tool_name] > 1:
                            stop_result = (
                                "[Loop guard] This analysis tool has already been called in this "
                                "session and the results are already in the conversation. "
                                "Do NOT call any analysis tools again. "
                                "Write your final response now using the results already obtained."
                            )
                            # Emit tool_result so the frontend marks the tool call as done
                            yield {"type": "tool_result", "name": tool_name, "result": stop_result}
                            full_messages.append({
                                "role": "tool",
                                "tool_call_id": tc.get("id", ""),
                                "content": stop_result,
                            })
                            continue

                    # Execute tool
                    result = await self.executor.execute(tool_name, tool_args)

                    yield {"type": "tool_result", "name": tool_name, "result": result}

                    # Add tool result to messages
                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": result,
                    })

                # Auto-compress old tool results if context is growing large
                full_messages = _compress_messages(full_messages)
            else:
                yield {
                    "type": "error",
                    "message": "lemy_max_iterations",
                    "error_key": "lemy_max_iterations",
                }
        except Exception as e:
            logger.error("Agent turn error: %s", e, exc_info=True)
            yield {"type": "error", "message": str(e), "error_key": "lemy_unexpected"}
        finally:
            yield {"type": "done"}

    async def _call_llm(
        self,
        provider: str,
        config: dict,
        messages: list[dict],
        tools: list[dict],
    ) -> Optional[dict]:
        """Call the LLM (Ollama or OpenAI) with tool definitions.
        Returns dict with 'content' and optional 'tool_calls'."""
        if provider == "ollama":
            return await self._call_ollama(config, messages, tools)
        elif provider == "openai":
            return await self._call_openai(config, messages, tools)
        else:
            logger.error("Unknown provider: %s", provider)
            return None

    async def _call_ollama(
        self,
        config: dict,
        messages: list[dict],
        tools: list[dict],
    ) -> Optional[dict]:
        """Call Ollama /api/chat with tool support."""
        url = config.get("url", "http://localhost:11434").rstrip("/")
        model = config.get("model", "")

        # Convert messages to Ollama format
        ollama_messages = []
        for m in messages:
            msg: dict[str, Any] = {"role": m["role"], "content": m.get("content", "") or ""}
            if m["role"] == "tool":
                # Ollama tool results: only role + content (no tool_call_id)
                pass
            elif m["role"] == "assistant" and "tool_calls" in m:
                # Convert from OpenAI format back to Ollama format
                # OpenAI: [{id, type, function: {name, arguments: str}}]
                # Ollama: [{function: {name, arguments: dict}}]
                msg["tool_calls"] = _denormalize_to_ollama_tool_calls(m["tool_calls"])
            ollama_messages.append(msg)

        body: dict[str, Any] = {
            "model": model,
            "messages": ollama_messages,
            "stream": False,
        }
        if tools:
            body["tools"] = tools

        max_attempts = 3
        last_error: dict = {}
        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                    r = await client.post(f"{url}/api/chat", json=body)

                if r.status_code == 200:
                    data = r.json()
                    msg = data.get("message", {})
                    return {
                        "content": msg.get("content", "") or "",
                        "tool_calls": _normalize_ollama_tool_calls(msg.get("tool_calls")),
                    }

                err_text = r.text[:600]
                # Ollama 500 "error parsing tool call" = model generated malformed JSON.
                # Retry — next attempt often produces valid JSON.
                if r.status_code == 500 and "error parsing tool call" in err_text:
                    logger.warning(
                        "Ollama tool call JSON parse error (attempt %d/%d): %s",
                        attempt, max_attempts, err_text[:200]
                    )
                    last_error = {"error": "lemy_bad_tool_json", "error_key": "lemy_bad_tool_json", "detail": err_text[:200]}
                    if attempt < max_attempts:
                        continue  # retry
                    return last_error

                logger.error("Ollama error %d: %s", r.status_code, err_text)
                return {"error": f"lemy_llm_error", "error_key": "lemy_llm_error", "detail": f"{r.status_code}: {err_text}"}

            except httpx.ConnectError as e:
                logger.error("Ollama connection failed: %s", e)
                return {"error": "lemy_no_connection", "error_key": "lemy_no_connection", "detail": url}
            except httpx.TimeoutException as e:
                logger.error("Ollama timeout: %s", e)
                return {"error": "lemy_timeout", "error_key": "lemy_timeout"}
            except Exception as e:
                logger.error("Ollama call failed: %s", e, exc_info=True)
                return {"error": "lemy_unexpected", "error_key": "lemy_unexpected", "detail": str(e)}

        return last_error or {"error": "lemy_unexpected", "error_key": "lemy_unexpected"}

    async def _call_openai(
        self,
        config: dict,
        messages: list[dict],
        tools: list[dict],
    ) -> Optional[dict]:
        """Call OpenAI-compatible /chat/completions with tool support."""
        base_url = config.get("base_url", "").rstrip("/")
        api_key = config.get("api_key", "").strip()
        model = config.get("model", "")

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                r = await client.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json=body,
                )
                if r.status_code != 200:
                    err_text = r.text[:500]
                    logger.error("OpenAI error %d: %s", r.status_code, err_text)
                    return {"error": "lemy_llm_error", "error_key": "lemy_llm_error", "detail": f"{r.status_code}: {err_text}"}
                data = r.json()

            choices = data.get("choices", [])
            if not choices:
                return {"content": "", "tool_calls": []}

            msg = choices[0].get("message", {})
            return {
                "content": msg.get("content", "") or "",
                "tool_calls": msg.get("tool_calls", []),
            }
        except httpx.ConnectError as e:
            logger.error("OpenAI connection failed: %s", e)
            return {"error": "lemy_no_connection", "error_key": "lemy_no_connection", "detail": base_url}
        except httpx.TimeoutException as e:
            logger.error("OpenAI timeout: %s", e)
            return {"error": "lemy_timeout", "error_key": "lemy_timeout"}
        except Exception as e:
            logger.error("OpenAI call failed: %s", e, exc_info=True)
            return {"error": "lemy_unexpected", "error_key": "lemy_unexpected", "detail": str(e)}

    async def close(self):
        await self.executor.close()


def _strip_thinking_prefix(content: str, language: str) -> str:
    """Strip English chain-of-thought from final response in Chinese mode.

    Handles three patterns:
    1. Leading English-only lines before Chinese content → skip.
    2. Line starts with English then switches to Chinese mid-line
       (e.g. "We have results.USAS 领域对比...") → strip English prefix within line.
    3. Trailing English-only lines/paragraphs → strip.

    If the entire response contains no Chinese, returns it unchanged (safe for
    English corpus results or English-only answers).
    """
    if language != "zh" or not content:
        return content

    lines = content.split('\n')
    result: list[str] = []
    found_chinese = False

    for line in lines:
        if found_chinese:
            result.append(line)
            continue
        m = _CHINESE_CHAR.search(line)
        if m:
            found_chinese = True
            # Strip English prefix within this line only if the line starts with
            # an alphabetic character (English prose). If it starts with a markdown
            # syntax character (*, #, -, |, >, `, [, !) the line is Chinese content
            # with mixed English terms/acronyms — keep it whole.
            if not _CHINESE_CHAR.match(line):
                first_visible = line.lstrip()
                if first_visible and first_visible[0].isalpha():
                    line = line[m.start():]
            result.append(line)
        # else: pure English line before any Chinese found — drop it

    if not result:
        return content  # no Chinese at all — keep unchanged

    # Strip trailing English-only lines (e.g. "That covers the analysis.")
    while result and not _CHINESE_CHAR.search(result[-1]):
        result.pop()

    return '\n'.join(result).lstrip('\n') if result else content



def _compress_messages(messages: list[dict]) -> list[dict]:
    """Truncate old tool results when total message length grows too large.

    Keeps the system message and the most recent _COMPRESS_KEEP_RECENT messages
    intact; truncates the content of older tool-result messages to 300 chars.
    """
    total = sum(len(str(m.get("content", ""))) for m in messages)
    if total <= _COMPRESS_THRESHOLD_CHARS:
        return messages

    # Always preserve: index 0 (system), last N messages
    protect_after = max(1, len(messages) - _COMPRESS_KEEP_RECENT)
    compressed = []
    for i, m in enumerate(messages):
        if i == 0 or i >= protect_after:
            compressed.append(m)
        elif m.get("role") == "tool":
            content = str(m.get("content", ""))
            if len(content) > 300:
                content = content[:280] + " …[truncated]"
            compressed.append({**m, "content": content})
        else:
            compressed.append(m)
    return compressed


def _normalize_ollama_tool_calls(tool_calls: Any) -> list[dict]:
    """Normalize Ollama tool_calls to OpenAI format.
    Ollama returns: [{"function": {"name": "...", "arguments": {...}}}]
    OpenAI format: [{"id": "...", "type": "function", "function": {"name": "...", "arguments": "..."}}]
    """
    if not tool_calls:
        return []

    normalized = []
    for i, tc in enumerate(tool_calls):
        fn = tc.get("function", {})
        args = fn.get("arguments", {})
        # Ollama may return arguments as dict, OpenAI expects JSON string
        if isinstance(args, dict):
            args = json.dumps(args)
        normalized.append({
            "id": f"call_{i}",
            "type": "function",
            "function": {
                "name": fn.get("name", ""),
                "arguments": args,
            },
        })
    return normalized


def _denormalize_to_ollama_tool_calls(tool_calls: Any) -> list[dict]:
    """Convert OpenAI-format tool_calls back to Ollama format.
    OpenAI format: [{"id": "...", "type": "function", "function": {"name": "...", "arguments": "..."}}]
    Ollama format: [{"function": {"name": "...", "arguments": {...}}}]
    """
    if not tool_calls:
        return []

    result = []
    for tc in tool_calls:
        fn = tc.get("function", {})
        args = fn.get("arguments", {})
        # OpenAI stores arguments as JSON string, Ollama expects dict
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        result.append({
            "function": {
                "name": fn.get("name", ""),
                "arguments": args,
            }
        })
    return result
