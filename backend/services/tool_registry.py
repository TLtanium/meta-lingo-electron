"""
Tool registry for Agent Chat mode.
Defines all 56 MCP tools in OpenAI function-calling format,
grouped by module for the frontend module selector.
NOTE: keep in sync with backend/mcp_server/tools/* and backend/routers/mcp.py tool_count.
"""

from typing import Any

# ── Module metadata (for frontend ModuleSelector) ────────────────────────────

TOOL_MODULES_META: list[dict[str, Any]] = [
    {
        "name": "corpus",
        "display_en": "Corpus Management",
        "display_zh": "语料库管理",
        "tools": [
            "list_corpora", "create_corpus", "upload_text", "upload_directory",
            "list_corpus_upload_tasks", "get_processing_task_status", "get_corpus_info",
            "update_corpus_metadata", "update_text_metadata",
        ],
    },
    {
        "name": "analysis",
        "display_en": "Lexical Analysis",
        "display_zh": "词汇分析",
        "tools": [
            "word_frequency", "keyword_extraction", "keyness_analysis",
            "keyness_resource_analysis", "ngram_analysis",
        ],
    },
    {
        "name": "concordance",
        "display_en": "Concordance & KWIC",
        "display_zh": "索引与KWIC",
        "tools": [
            "concordance_search", "get_extended_context",
            "collocation_analysis", "get_lemma_forms",
        ],
    },
    {
        "name": "semantic",
        "display_en": "Semantic Analysis",
        "display_zh": "语义分析",
        "tools": [
            "semantic_domain_analysis", "get_domain_words",
            "metaphor_analysis", "sentiment_analysis",
        ],
    },
    {
        "name": "sketch",
        "display_en": "Word Sketches",
        "display_zh": "词语素描",
        "tools": ["word_sketch", "sketch_difference", "synonym_analysis"],
    },
    {
        "name": "topic",
        "display_en": "Topic Modeling",
        "display_zh": "主题建模",
        "tools": [
            "topic_modeling", "get_bertopic_preprocess_settings",
            "create_bertopic_embedding", "list_bertopic_embeddings", "bertopic_analyze",
        ],
    },
    {
        "name": "export",
        "display_en": "Export",
        "display_zh": "导出",
        "tools": ["export_annotations"],
    },
    {
        "name": "reference",
        "display_en": "Reference Data",
        "display_zh": "参考数据",
        "tools": [
            "get_pos_tags", "get_usas_categories", "get_metaphor_sources",
            "dictionary_lookup",
            "list_reference_corpora", "validate_cql",
            "list_annotation_frameworks", "get_annotation_framework",
            "create_annotation_framework",
        ],
    },
    {
        "name": "annotation",
        "display_en": "Annotation",
        "display_zh": "标注",
        "tools": [
            "get_text_content", "get_text_sentences", "get_text_segment",
            "save_annotation", "load_annotation",
            "list_annotations", "list_all_annotations", "delete_annotation",
        ],
    },
    {
        "name": "biblio",
        "display_en": "Bibliography",
        "display_zh": "文献可视化",
        "tools": [
            "list_biblio_libraries", "create_biblio_library",
            "upload_biblio_file", "get_biblio_library_info",
            "biblio_network", "biblio_temporal", "biblio_cluster", "biblio_wordcloud",
        ],
    },
    {
        "name": "dmip",
        "display_en": "Deliberate Metaphor (DMIP)",
        "display_zh": "刻意隐喻分析（DMIP）",
        "tools": ["dmip_analysis"],
    },
    {
        "name": "mda",
        "display_en": "Multidimensional Analysis (MDA)",
        "display_zh": "多维分析（MDA）",
        "tools": ["mda_analysis"],
    },
    {
        "name": "task",
        "display_en": "Task Management",
        "display_zh": "任务管理",
        "tools": [
            "plan_analysis_task", "start_analysis_task",
            "save_text_result", "read_task_results", "get_task_status",
        ],
    },
]


def _str(desc: str = "", **kw) -> dict:
    d: dict[str, Any] = {"type": "string"}
    if desc:
        d["description"] = desc
    # JSON Schema puts `required` on the object, not per-property; Ollama rejects bool here.
    kw.pop("required", None)
    d.update(kw)
    return d


def _int(desc: str = "", **kw) -> dict:
    d: dict[str, Any] = {"type": "integer"}
    if desc:
        d["description"] = desc
    kw.pop("required", None)
    d.update(kw)
    return d


def _bool(desc: str = "", **kw) -> dict:
    d: dict[str, Any] = {"type": "boolean"}
    if desc:
        d["description"] = desc
    kw.pop("required", None)
    d.update(kw)
    return d


def _num(desc: str = "", **kw) -> dict:
    d: dict[str, Any] = {"type": "number"}
    if desc:
        d["description"] = desc
    kw.pop("required", None)
    d.update(kw)
    return d


def _arr(items: dict, desc: str = "", **kw) -> dict:
    d: dict[str, Any] = {"type": "array", "items": items}
    if desc:
        d["description"] = desc
    kw.pop("required", None)
    d.update(kw)
    return d


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


# ── Tool definitions in OpenAI function-calling format ───────────────────────

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    # ─── corpus ───
    _tool("list_corpora",
          "List all corpora in the workspace. Returns IDs, names, languages, text counts, tags.",
          {}, []),
    _tool("create_corpus",
          "Create a new empty corpus.",
          {
              "name": _str("Display name, e.g. 'Political speeches 2024'"),
              "language": _str("'english' or 'chinese'", default="english"),
              "description": _str("Short content summary"),
              "author": _str("Corpus-level author"),
              "source": _str("Corpus-level source"),
              "text_type": _str("USAS text type code"),
          }, ["name"]),
    _tool("upload_text",
          "Upload a text to a corpus. Provide content (raw text) or filepath (local file path).",
          {
              "corpus_id": _str("Target corpus ID"),
              "filename": _str("Filename (auto-derived if omitted)"),
              "content": _str("Raw text body (mutually exclusive with filepath)"),
              "filepath": _str("Local file path to read from"),
              "date": _str("Date in YYYY-MM-DD or just year"),
              "author": _str("Text-level author"),
              "source": _str("Text-level source"),
              "text_type": _str("USAS text type code"),
              "text_description": _str("Per-text description"),
              "corpus_description": _str("Updates corpus description"),
              "tags": _arr({"type": "string"}, "Tags for the upload"),
          }, ["corpus_id"]),
    _tool("upload_directory",
          "Batch-upload all matching files from a local directory into a corpus.",
          {
              "corpus_id": _str("Target corpus ID"),
              "directory": _str("Local directory path"),
              "pattern": _str("Glob pattern for files", default="*.txt"),
              "date": _str("Date for all files"),
              "author": _str("Author for all files"),
              "source": _str("Source for all files"),
              "text_type": _str("USAS text type for all files"),
              "corpus_description": _str("Updates corpus description"),
              "tags": _arr({"type": "string"}, "Tags for all uploads"),
          }, ["corpus_id", "directory"]),
    _tool("list_corpus_upload_tasks",
          "List background processing tasks for a corpus (annotation, etc.).",
          {"corpus_id": _str("Corpus ID")}, ["corpus_id"]),
    _tool("get_processing_task_status",
          "Check the status of a background processing task by task ID.",
          {"task_id": _str("Task UUID")}, ["task_id"]),
    _tool("get_corpus_info",
          "Get detailed corpus information including text list with IDs, metadata, and word counts.",
          {"corpus_id": _str("Corpus ID")}, ["corpus_id"]),
    _tool("update_corpus_metadata",
          "Update corpus-level metadata: name, description, language, author, source, text_type, or tags.",
          {
              "corpus_id": _str("Corpus ID"),
              "name": _str("New display name"),
              "description": _str("Content-focused summary"),
              "language": _str("Corpus language (e.g. 'english', 'chinese')"),
              "author": _str("Default author for texts in this corpus"),
              "source": _str("Default source/origin for texts"),
              "text_type": _str("USAS text type code (e.g. 'GEN')"),
              "tags": _arr({"type": "string"}, "Replace corpus tag list"),
          }, ["corpus_id"]),
    _tool("update_text_metadata",
          "Update metadata for a specific text: date, author, source, description, filename, tags, or custom fields.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_id": _str("Text ID (from get_corpus_info)"),
              "date": _str("Publication date: YYYY-MM-DD, YYYY-MM, or YYYY"),
              "author": _str("Author of the text"),
              "source": _str("Source/origin of the text"),
              "description": _str("Short description or abstract"),
              "filename": _str("New filename (must end in .txt for text files)"),
              "tags": _arr({"type": "string"}, "Replace text tag list"),
              "custom_fields": {
                  "type": "object",
                  "description": "Key-value pairs merged into existing custom fields",
                  "additionalProperties": {"type": "string"},
              },
          }, ["corpus_id", "text_id"]),

    # ─── analysis ───
    _tool("word_frequency",
          "Analyze word frequencies in a corpus. Returns ranked word list with counts and percentages.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs (omit for all)"),
              "search_word": _str("Filter by word pattern"),
              "search_type": _str("'exact','contains','starts','ends','regex','wordlist'", default="contains"),
              "search_target": _str("'word' or 'lemma'", default="word"),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "min_freq": _int("Minimum frequency", default=1),
              "max_freq": _int("Maximum frequency (0=no limit)", default=0),
              "lowercase": _bool("Merge case variants", default=True),
              "remove_stopwords": _bool("Remove stopwords", default=False),
              "limit": _int("Max results to return", default=50),
          }, ["corpus_id"]),
    _tool("keyword_extraction",
          "Extract keywords from corpus texts using TF-IDF, TextRank, YAKE, or RAKE.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "algorithm": _str("'tfidf','textrank','yake','rake'", default="tfidf"),
              "top_n": _int("Number of keywords", default=30),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "search_word": _str("Filter results by keyword pattern (empty = no filter)"),
              "search_type": _str("'exact','contains','starts','ends','regex','wordlist'", default="contains"),
          }, ["corpus_id"]),
    _tool("keyness_analysis",
          "Compare word frequencies between two user corpora to find statistically key words.",
          {
              "corpus_id": _str("Study corpus ID"),
              "reference_corpus_id": _str("Reference corpus ID"),
              "text_ids": _arr({"type": "string"}, "Study corpus text IDs"),
              "reference_text_ids": _arr({"type": "string"}, "Reference corpus text IDs"),
              "statistic": _str("'log_likelihood','chi_squared','log_ratio','dice','mi','t_score','simple_keyness'", default="log_likelihood"),
              "comparison_mode": _str("'word','lemma','domain'", default="word"),
              "min_freq": _int("Min frequency in study corpus", default=3),
              "p_threshold": _num("Significance threshold", default=0.05),
              "limit": _int("Max results", default=50),
              "search_word": _str("Filter results by word pattern (empty = no filter)"),
              "search_type": _str("'exact','contains','starts','ends','regex','wordlist'", default="contains"),
          }, ["corpus_id", "reference_corpus_id"]),
    _tool("keyness_resource_analysis",
          "Compare word frequencies against a built-in reference corpus (BNC/OANC).",
          {
              "corpus_id": _str("Study corpus ID"),
              "resource_id": _str("Reference corpus resource ID"),
              "text_ids": _arr({"type": "string"}, "Study corpus text IDs"),
              "statistic": _str("Statistical measure", default="log_likelihood"),
              "comparison_mode": _str("'word','lemma','domain'", default="word"),
              "min_freq": _int("Min frequency", default=3),
              "p_threshold": _num("Significance threshold", default=0.05),
              "limit": _int("Max results", default=50),
              "search_word": _str("Filter results by word pattern (empty = no filter)"),
              "search_type": _str("'exact','contains','starts','ends','regex','wordlist'", default="contains"),
          }, ["corpus_id", "resource_id"]),
    _tool("ngram_analysis",
          "Extract and rank n-grams (bigrams, trigrams, etc.) from a corpus.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "n_values": _arr({"type": "integer"}, "N-gram sizes, e.g. [2,3]"),
              "search_word": _str("Filter n-grams containing this word"),
              "search_type": _str("'exact','contains','starts','ends'", default="contains"),
              "min_freq": _int("Minimum frequency", default=2),
              "min_word_length": _int("Min word length within n-gram", default=1),
              "nest": _bool("Enable nested n-gram mode", default=False),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "limit": _int("Max results", default=50),
          }, ["corpus_id"]),

    # ─── concordance ───
    _tool("concordance_search",
          "Search for words/phrases in context (KWIC). Supports exact, phrase, CQL, and more.",
          {
              "corpus_id": _str("Corpus ID"),
              "query": _str("Search query"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "search_mode": _str("'exact','contains','starts','ends','phrase','wordlist','cql'", default="exact"),
              "search_target": _str("'word' or 'lemma'", default="word"),
              "ignore_case": _bool("Case-insensitive", default=True),
              "context_size": _int("Context tokens on each side", default=5),
              "sort_by": _str("Sort criterion: 'left_context','right_context','position','frequency','random'"),
              "sort_levels": _arr({"type": "string"}, "Multi-level sort keys like ['1L','2L']"),
              "sort_descending": _bool("Descending sort", default=False),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "max_results": _int("Hard cap on results"),
              "limit": _int("Max results to display", default=30),
          }, ["corpus_id", "query"]),
    _tool("get_extended_context",
          "Get extended context around a specific concordance hit for deeper reading.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_id": _str("Text ID"),
              "position": _int("Token position in text"),
              "context_chars": _int("Characters of context to return", default=200),
              "keyword": _str("Keyword for highlighting"),
          }, ["corpus_id", "text_id", "position"]),
    _tool("collocation_analysis",
          "Find statistically significant collocates of a word.",
          {
              "corpus_id": _str("Corpus ID"),
              "node_word": _str("Central word to find collocates for"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "window_size": _int("Context window in words on each side", default=5),
              "min_freq": _int("Min co-occurrence frequency", default=3),
              "statistic": _str("'logdice','mi','mi3','t_score','z_score','log_likelihood','dice'", default="logdice"),
              "match_mode": _str("'lemma' or 'word'", default="lemma"),
              "remove_stopwords": _bool("Exclude stopwords", default=False),
              "exclude_words": _arr({"type": "string"}, "Words to exclude (plain words or regex patterns, e.g. '\\d+' to exclude all-digit tokens)"),
              "limit": _int("Max collocates", default=30),
          }, ["corpus_id", "node_word"]),
    _tool("get_lemma_forms",
          "Get all surface forms of a lemma as found in the corpus.",
          {
              "corpus_id": _str("Corpus ID"),
              "lemma": _str("Lemma to find forms for"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
          }, ["corpus_id", "lemma"]),

    # ─── semantic ───
    _tool("semantic_domain_analysis",
          "Analyze USAS semantic domain distribution in a corpus.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "result_mode": _str("'domain' or 'word'", default="domain"),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "search_word": _str("Filter by word/lemma pattern"),
              "search_type": _str("'exact','contains','starts','ends','regex'", default="contains"),
              "search_target": _str("'word' or 'lemma'", default="word"),
              "min_freq": _int("Minimum frequency"),
              "max_freq": _int("Maximum frequency (0=no limit)"),
              "limit": _int("Max results", default=50),
          }, ["corpus_id"]),
    _tool("get_domain_words",
          "Get all words assigned to a specific USAS semantic domain.",
          {
              "corpus_id": _str("Corpus ID"),
              "domain": _str("USAS domain code, e.g. 'A1.1'"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "lowercase": _bool("Merge case variants", default=True),
          }, ["corpus_id", "domain"]),
    _tool("metaphor_analysis",
          "Analyze MIPVU metaphor distribution in a corpus. Returns INDIRECT/DIRECT/MFLAG/IMPLICIT breakdown.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs (None = all)"),
              "result_mode": _str("'word' (ranked word table) or 'source' (by detection source)", default="word"),
              "pos_filter": _arr({"type": "string"}, "Universal POS tags to include, e.g. ['NOUN','VERB','ADJ']"),
              "search_word": _str("Filter by word/lemma pattern"),
              "search_type": _str("'exact','contains','starts','ends','regex'", default="contains"),
              "search_target": _str("'word' (wordform) or 'lemma'", default="word"),
              "min_freq": _int("Minimum frequency threshold"),
              "max_freq": _int("Maximum frequency (0=no limit)"),
              "include_implicit": _bool(
                  "When True, implicit metaphors are resolved to their antecedent MRW "
                  "and an implicit_ref_count (+N) is shown next to that antecedent's frequency. "
                  "Default False.",
                  default=False,
              ),
              "limit": _int("Max rows to return", default=50),
          }, ["corpus_id"]),
    _tool("sentiment_analysis",
          "Analyze NRC sentiment/emotion distribution in a corpus.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "analysis_mode": _str("'polarity' or 'dimension'", default="polarity"),
              "search_word": _str("Filter by word pattern"),
              "search_type": _str("'exact','contains','starts','ends','regex'", default="contains"),
              "search_target": _str("'word' or 'lemma'", default="word"),
              "pos_filter": _arr({"type": "string"}, "POS tags to filter"),
              "limit": _int("Max results", default=50),
          }, ["corpus_id"]),

    # ─── sketch ───
    _tool("word_sketch",
          "Generate a word sketch showing grammatical relations and collocates for a word.",
          {
              "corpus_id": _str("Corpus ID"),
              "word": _str("Word to sketch"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "pos": _str("POS filter: 'NOUN','VERB','ADJ','ADV' or empty"),
              "min_frequency": _int("Min collocate frequency", default=2),
              "max_results": _int("Max collocates per relation", default=20),
          }, ["corpus_id", "word"]),
    _tool("sketch_difference",
          "Compare word sketches of two words to find shared and unique collocates.",
          {
              "corpus_id": _str("Corpus ID"),
              "word1": _str("First word"),
              "word2": _str("Second word"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "pos": _str("POS filter or empty for auto-detect"),
              "min_frequency": _int("Min collocate frequency", default=2),
          }, ["corpus_id", "word1", "word2"]),
    _tool("synonym_analysis",
          "Find distributional synonyms of a word based on corpus co-occurrence patterns.",
          {
              "corpus_id": _str("Corpus ID"),
              "word": _str("Word to find synonyms for"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "pos": _str("POS filter: 'NOUN','VERB','ADJ','ADV' or empty"),
          }, ["corpus_id", "word"]),

    # ─── topic ───
    _tool("topic_modeling",
          "Run LDA topic modeling on a corpus. Takes 30-60 seconds.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "method": _str("'lda'", default="lda"),
              "n_topics": _int("Number of topics", default=5),
              "language": _str("'english' or 'chinese'", default="english"),
              "remove_stopwords": _bool("Remove stopwords", default=True),
              "min_word_length": _int("Min word length", default=2),
              "lowercase": _bool("Convert to lowercase", default=True),
              "lemmatize": _bool("Use lemma forms", default=True),
              "n_top_words": _int("Top words per topic", default=10),
          }, ["corpus_id"]),
    _tool("get_bertopic_preprocess_settings",
          "Read the user's saved BERTopic preprocess and chunking settings from the UI. "
          "Call this BEFORE create_bertopic_embedding to apply the user's configured chunking.",
          {}, []),
    _tool("create_bertopic_embedding",
          "Create BERTopic embeddings for a corpus (step 1 of 2). Takes 1-5 minutes. "
          "Call get_bertopic_preprocess_settings() first to apply user's chunking config.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs"),
              "language": _str("'english' or 'chinese'", default="english"),
              "chunking_enabled": _bool("Enable text chunking (from get_bertopic_preprocess_settings)", default=False),
              "chunking_min_tokens": _int("Min tokens per chunk", default=100),
              "chunking_max_tokens": _int("Max tokens per chunk (SBERT max: 512)", default=256),
              "chunking_overlap_tokens": _int("Overlap tokens between chunks", default=0),
              "remove_stopwords": _bool("Remove stopwords", default=False),
              "min_word_length": _int("Min word length", default=1),
              "lowercase": _bool("Convert to lowercase", default=False),
              "lemmatize": _bool("Use lemma forms", default=False),
          }, ["corpus_id"]),
    _tool("list_bertopic_embeddings",
          "List existing BERTopic embeddings, optionally filtered by corpus.",
          {
              "corpus_id": _str("Filter by corpus ID"),
          }, []),
    _tool("bertopic_analyze",
          "Run BERTopic analysis on pre-computed embeddings (step 2 of 2). "
          "UMAP params are auto-adjusted for small corpora to prevent errors.",
          {
              "embedding_id": _str("Embedding ID from create_bertopic_embedding"),
              "language": _str("'english' or 'chinese'", default="english"),
              "n_top_words": _int("Top words per topic", default=10),
              "nr_topics": _int(
                  "Merge down to this many topics after clustering (None = keep all auto-detected). Optional."
              ),
              "umap_n_neighbors": _int("UMAP neighbors (default 15; use 5 for small corpora)", default=15),
              "umap_n_components": _int("UMAP output dimensions (default 5; use 3 for small corpora)", default=5),
              "hdbscan_min_cluster_size": _int("Min docs per cluster (default 10; use 3-5 for small corpora)", default=10),
              "hdbscan_min_samples": _int(
                  "HDBSCAN min_samples (None=auto; set 1 for small corpora). Optional."
              ),
              "vectorizer_min_df": _int("Min doc frequency for vocabulary (default 2; use 1 for small corpora)", default=2),
              "vectorizer_ngram_range": _arr({"type": "integer"}, "N-gram range e.g. [1,2] for bigrams (default: [1,1])"),
              "vectorizer_remove_stopwords": {"type": "boolean", "description": "Remove NLTK stopwords during vectorization", "default": False},
              "vectorizer_exclusion_words": _arr({"type": "string"}, "Extra words to exclude from vocabulary"),
              "umap_random_state": _int("UMAP random seed (default 42)", default=42),
              "hdbscan_prediction_data": {"type": "boolean", "description": "Enable HDBSCAN prediction data for soft clustering", "default": True},
              "reduce_outliers": {"type": "boolean", "description": "Reassign topic -1 outliers to nearest topic", "default": False},
          }, ["embedding_id"]),

    # ─── export ───
    _tool("export_annotations",
          "Export AUTOMATED NLP pipeline results (POS/lemma/dep/USAS tagger/MIPVU tagger) for archival. "
          "NOT for annotation tasks — for framework-based span annotation use save_annotation().",
          {
              "corpus_id": _str("Corpus ID"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs (omit for all)"),
              "annotation_types": _arr({"type": "string"}, "Types: 'universal_pos','penn_pos','lemma','dep','usas','mipvu'"),
              "format": _str("'json','xml','txt'", default="json"),
          }, ["corpus_id"]),

    # ─── reference ───
    _tool("get_pos_tags",
          "Get all available POS tags (Universal Dependencies tag set).",
          {}, []),
    _tool("get_usas_categories",
          "Get all USAS semantic domain categories with descriptions.",
          {}, []),
    _tool("get_metaphor_sources",
          "Get all MIPVU metaphor source domain categories.",
          {}, []),
    _tool("dictionary_lookup",
          "Look up a word in the built-in Macmillan + Longman dictionaries: listed "
          "senses (incl. figurative/extended), POS/grammar, and typical collocations. "
          "General-purpose on-demand reference for any analysis (lexical, concordance, "
          "metaphor, annotation, usage checks). Optional supporting evidence for "
          "conventional-vs-novel judgments — not a mandatory verdict.",
          {
              "word": _str("Word or lemma to look up (case-insensitive)"),
              "dictionaries": _arr(
                  _str(),
                  "Dictionaries to query (case-insensitive): 'Macmillan' (default) "
                  "and/or 'Longman Collocations'. Default ['Macmillan'].",
                  default=["Macmillan"],
              ),
              "max_chars": _int("Max chars per entry before truncation (default 5000)", default=5000),
          }, ["word"]),
    _tool("list_reference_corpora",
          "List built-in reference corpora (BNC, OANC) available for keyness comparison. "
          "Use search= to filter by name/ID. Paginated (20 per page); use offset= for next pages.",
          {
              "search": _str("Filter by keyword in ID or name (case-insensitive)", default=""),
              "offset": _int("Skip first N matching corpora for pagination", default=0),
              "page_size": _int("Corpora per page (default 20)", default=20),
          }, []),
    _tool("validate_cql",
          "Validate a CQL (Corpus Query Language) expression before using it in concordance_search.",
          {"query": _str("CQL expression to validate")}, ["query"]),
    _tool("list_annotation_frameworks",
          "List all available annotation frameworks for manual/AI annotation. "
          "Use search= to filter by name/ID/category. Paginated (20 per page); use offset= for next pages.",
          {
              "search": _str("Filter by keyword in name, ID, or category (case-insensitive)", default=""),
              "offset": _int("Skip first N matching frameworks for pagination", default=0),
              "page_size": _int("Frameworks per page (default 20)", default=20),
          }, []),
    _tool("get_annotation_framework",
          "Get detailed annotation framework with labels, colors, and hierarchy.",
          {"framework_id": _str("Framework ID")}, ["framework_id"]),
    _tool("create_annotation_framework",
          "Create a custom annotation framework with a label hierarchy tree.",
          {
              "name": _str("Framework display name"),
              "category": _str("Category: 'Appraisal Analysis','Theme/Rheme','Error Analysis','Custom', etc."),
              "root": {"type": "object", "description": "Root node dict with id, name, type ('tier'/'label'), children[]"},
              "description": _str("Optional summary of what this framework annotates"),
          }, ["name", "category", "root"]),

    # ─── annotation ───
    _tool("get_text_content",
          "Get the raw text content and token-level annotations of a specific text in a corpus.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_id": _str("Text ID"),
          }, ["corpus_id", "text_id"]),
    _tool("get_text_sentences",
          "Get all sentence boundaries (index, start, end, text) for a text using SpaCy sentence splitting. "
          "Use this as the FIRST step before sentence-by-sentence annotation. "
          "Returns absolute char offsets matching the Annotation Mode UI.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_id": _str("Text ID"),
          }, ["corpus_id", "text_id"]),
    _tool("get_text_segment",
          "Read a character-range segment of a text for segment-by-segment annotation of long texts. "
          "Returns the text slice [char_offset : char_offset+char_length] with absolute-offset guidance. "
          "Use together with save_annotation(archive_id=...) to accumulate annotations across segments.",
          {
              "corpus_id": _str("Corpus ID"),
              "text_id": _str("Text ID"),
              "char_offset": _int("Starting character position (0-based)", default=0),
              "char_length": _int("Number of characters to read (default: 2000)", default=2000),
          }, ["corpus_id", "text_id"]),
    _tool("save_annotation",
          "Save or append to a text annotation archive. "
          "First sentence call: pass text=<full raw text>, no archive_id → creates archive, returns archive_id. "
          "All subsequent sentences: pass archive_id, omit text → appends spans to same archive.",
          {
              "corpus_name": _str("Corpus display name"),
              "text_id": _str("Text UUID"),
              "text_name": _str("Text filename"),
              "framework": _str("Framework name"),
              "framework_category": _str("Framework category"),
              "annotations": _arr({
                  "type": "object",
                  "properties": {
                      "text": {"type": "string"},
                      "startPosition": {"type": "integer"},
                      "endPosition": {"type": "integer"},
                      "label": {"type": "string"},
                      "labelPath": {"type": "string"},
                      "color": {"type": "string"},
                  },
                  "required": ["text", "startPosition", "endPosition", "label", "labelPath", "color"],
              }, "Annotation spans for this sentence"),
              "text": _str("Full raw text — required ONLY on first call (archive creation); omit on appends"),
              "coder_name": _str("Annotator name", default="AI"),
              "archive_id": _str("Omit to create new archive; pass on all subsequent sentences to append"),
          }, ["corpus_name", "text_id", "text_name", "framework", "framework_category", "annotations"]),
    _tool("load_annotation",
          "Load a saved annotation archive by its ID.",
          {
              "corpus_name": _str("Corpus display name"),
              "archive_id": _str("Archive ID"),
          }, ["corpus_name", "archive_id"]),
    _tool("list_annotations",
          "List annotation archives for a corpus, optionally filtered by text.",
          {
              "corpus_name": _str("Corpus display name"),
              "text_id": _str("Filter by text ID"),
              "annotation_type": _str("'text' or 'multimodal'", default="text"),
          }, ["corpus_name"]),
    _tool("list_all_annotations",
          "List all annotation archives across all corpora.",
          {
              "annotation_type": _str("'text' or 'multimodal'", default="text"),
          }, []),
    _tool("delete_annotation",
          "Delete an annotation archive.",
          {
              "corpus_name": _str("Corpus display name"),
              "archive_id": _str("Archive ID to delete"),
          }, ["corpus_name", "archive_id"]),

    # ─── biblio ───
    _tool("list_biblio_libraries",
          "List all bibliographic visualization libraries.",
          {}, []),
    _tool("create_biblio_library",
          "Create a new bibliographic visualization library for WOS or CNKI data.",
          {
              "name": _str("Library display name"),
              "source_type": _str("'WOS' or 'CNKI'", default="WOS"),
              "language": _str("'english' or 'chinese'", default="english"),
              "description": _str("Optional description"),
          }, ["name"]),
    _tool("upload_biblio_file",
          "Upload a bibliography file (WOS/CNKI export) to a library.",
          {
              "library_id": _str("Library ID"),
              "filepath": _str("Absolute path to bibliography file"),
          }, ["library_id", "filepath"]),
    _tool("get_biblio_library_info",
          "Get detailed information about a bibliographic library.",
          {"library_id": _str("Library ID")}, ["library_id"]),
    _tool("biblio_network",
          "Generate bibliographic co-occurrence network (co-author, keyword-cooccur, co-citation, etc.).",
          {
              "library_id": _str("Library ID"),
              "network_type": _str("'co-author','co-institution','co-country','keyword-cooccur','co-citation'", default="keyword-cooccur"),
              "min_weight": _int("Min co-occurrence weight", default=1),
              "max_nodes": _int("Max nodes in network", default=60),
              "year_start": _int("Filter start year (optional)"),
              "year_end": _int("Filter end year (optional)"),
              "author": _str("Filter by author (optional)"),
              "keyword": _str("Filter by keyword (optional)"),
              "journal": _str("Filter by journal (optional)"),
              "country": _str("Filter by country (optional)"),
          }, ["library_id"]),
    _tool("biblio_temporal",
          "Temporal trends in bibliographic data (timeline, timezone, burst detection).",
          {
              "library_id": _str("Library ID"),
              "viz_type": _str("'timeline','timezone','burst'", default="timeline"),
              "time_slice": _int("Year slice width", default=1),
              "top_n": _int("Top items per time slice", default=10),
              "burst_type": _str("For burst: 'keyword' or 'author'", default="keyword"),
              "min_frequency": _int("For burst: min frequency", default=2),
              "gamma": _num("For burst: Kleinberg gamma", default=1.0),
              "year_start": _int("Filter start year (optional)"),
              "year_end": _int("Filter end year (optional)"),
              "keyword": _str("Filter by keyword (optional)"),
          }, ["library_id"]),
    _tool("biblio_cluster",
          "Cluster bibliographic entries by keyword, author, or institution.",
          {
              "library_id": _str("Library ID"),
              "cluster_by": _str("'keyword','author','institution'", default="keyword"),
              "n_clusters": _int("Number of clusters (optional, auto-detect if omitted)"),
              "year_start": _int("Filter start year (optional)"),
              "year_end": _int("Filter end year (optional)"),
              "keyword": _str("Filter by keyword (optional)"),
          }, ["library_id"]),
    _tool("biblio_wordcloud",
          "Word frequency from bibliographic titles or abstracts.",
          {
              "library_id": _str("Library ID"),
              "source": _str("'abstract' or 'title'", default="abstract"),
              "max_words": _int("Max words to return", default=100),
              "year_start": _int("Filter start year (optional)"),
              "year_end": _int("Filter end year (optional)"),
              "author": _str("Filter by author (optional)"),
              "keyword": _str("Filter by keyword (optional)"),
              "journal": _str("Filter by journal (optional)"),
          }, ["library_id"]),

    # ─── task management ───
    _tool("plan_analysis_task",
          (
              "PREFERRED: Create a structured analysis plan and start a multi-text task. "
              "Records corpus_id, task_type, ordered text list, analysis dimensions, "
              "and execution_order in a plan.json file. "
              "Returns task_id. Use this for any analysis of more than 3 texts."
          ),
          {
              "corpus_id": _str("The corpus being analyzed"),
              "task_type": _str("e.g. 'dmip', 'metaphor', 'stance', 'multi'"),
              "texts": {
                  "type": "array",
                  "description": "Ordered list of texts from get_corpus_info. Each item: {text_id, label}",
                  "items": {"type": "object"},
              },
              "analysis_dimensions": {
                  "type": "array",
                  "description": "What to analyze per text, e.g. ['metaphor', 'stance_markers']",
                  "items": {"type": "string"},
              },
              "execution_order": _str(
                  "'sequential' (default) or 'parallel' (batch tool calls per text)",
                  default="sequential",
              ),
              "session_hint": _str("Optional label, e.g. 'Amazon Report DMIP 2026'", default=""),
          }, ["corpus_id", "task_type", "texts", "analysis_dimensions"]),

    _tool("start_analysis_task",
          (
              "Simple task start (no plan structure). "
              "Prefer plan_analysis_task() for new tasks. "
              "Returns task_id for use with save_text_result and read_task_results."
          ),
          {
              "corpus_id": _str("Corpus being analyzed"),
              "task_type": _str("Analysis type, e.g. 'dmip', 'metaphor', 'concordance'"),
              "total_texts": _int("Total number of texts that will be analyzed"),
              "session_hint": _str("Optional label, e.g. 'Amazon DMIP 2026'", default=""),
          }, ["corpus_id", "task_type", "total_texts"]),

    _tool("save_text_result",
          (
              "Save one text's analysis result to temporary file storage. "
              "Set status='success'|'failed'|'skipped' and error_message for failures. "
              "The content stays on disk only — NOT in conversation context. "
              "After calling: output ONLY '✓ [k/N] label — saved'."
          ),
          {
              "task_id": _str("Task ID from plan_analysis_task() or start_analysis_task()"),
              "text_id": _str("The text's ID in the corpus"),
              "text_label": _str("Human-readable filename/label"),
              "content": _str("Complete analysis in markdown (empty string for failed texts)"),
              "status": _str("'success' | 'failed' | 'skipped'", default="success"),
              "error_message": _str("Error description for failed texts", default=""),
          }, ["task_id", "text_id", "text_label", "content"]),

    _tool("read_task_results",
          (
              "Read saved per-text results for aggregation or progress check. "
              "index_only=false (default): full content for FINAL aggregation — call once when all texts done. "
              "index_only=true: status index only (task_id+label+status per text) — lightweight mid-task check."
          ),
          {
              "task_id": _str("Task ID from plan_analysis_task()"),
              "index_only": _bool(
                  "True = return status index only (mid-task check). "
                  "False (default) = return full content for final aggregation.",
                  default=False,
              ),
          }, ["task_id"]),

    _tool("get_task_status",
          (
              "Get quick progress of a multi-text task: completed/total counts, "
              "success/failed/skipped breakdown, and completed text labels."
          ),
          {
              "task_id": _str("Task ID from plan_analysis_task()"),
          }, ["task_id"]),

    # ─── dmip ───
    _tool("dmip_analysis",
          (
              "Prepare a DMIP (Deliberate Metaphor Identification Procedure) analysis "
              "context for a single text. FIRST checks annotation history for saved MIPVU "
              "archives (listed with coder names). Two data sources: "
              "A) annotation_archive_id=<id> — use a saved annotation archive (only "
              "indirect/direct/mflag/implicit labels are read; other labels ignored); "
              "B) use_automatic_mipvu=True — read corpus MIPVU metadata (existing sidecar, "
              "no re-annotation). If archives exist and user has not specified, ASK first. "
              "Provides annotated text with inline markers [MET:word]/[DIR:word]/[MFLAG:word]/"
              "[IMPL:word] (multi-word MRWs shown as full span) and the full DMIP procedure."
          ),
          {
              "corpus_id": _str("Corpus ID containing the text"),
              "text_id": _str("Text ID from get_corpus_info"),
              "annotation_archive_id": _str(
                  "Archive ID of a saved MIPVU annotation to use as MRW source (source A). "
                  "Only labels indirect/direct/mflag/implicit are read; others are ignored. "
                  "Obtain from the archive list returned when calling without an ID."
              ),
              "use_automatic_mipvu": _bool(
                  "Set True to read MRW data from corpus MIPVU metadata (source B — "
                  "existing sidecar annotation, no re-annotation). Use when skipping "
                  "archive check or when no archives exist.",
                  default=False,
              ),
          }, ["corpus_id", "text_id"]),

    # ─── mda ───
    _tool("mda_analysis",
          (
              "Biber (1988) multidimensional analysis (MAT algorithm) of an ENGLISH "
              "corpus. Computes 67 lexico-grammatical features per 100 tokens from "
              "stored SpaCy annotations, z-scores them against Biber's norms, and "
              "returns the six dimension scores (e.g. D1 Involved vs. Informational), "
              "closest Biber genre per dimension, closest Biber (1989) text type, "
              "over/underused features (|z|>2), and per-text dimension scores. "
              "INTERPRETATION: the closest text type is a nearest-centroid match, not "
              "a category membership — always cite the actual dimension scores and the "
              "features driving them."
          ),
          {
              "corpus_id": _str("Corpus ID to analyze"),
              "text_ids": _arr({"type": "string"}, "Specific text IDs (omit for all)"),
              "ttr_tokens": _int("Tokens used for type-token ratio (default 400, per Biber 1988)", default=400),
              "z_correction": _bool("Cap extreme feature z-scores (MAT option)", default=False),
              "excluded_features": _arr({"type": "string"}, "Feature codes to exclude, e.g. ['TTR','AWL']"),
              "top_features": _int("How many most-deviant features to list (default 15)", default=15),
              "max_texts_shown": _int("Max per-text rows in output (default 25)", default=25),
              "save_path": _str("Save MAT-style CSVs (Dimensions/Statistics/Zscores): directory path, or '' for ~/Downloads"),
              "chart_path": _str("Save dimension-score bar chart PNG: path, or '' for ~/Downloads"),
          }, ["corpus_id"]),
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_tools_for_modules(enabled_modules: list[str] | None) -> list[dict]:
    """Return tool definitions filtered by enabled module names.
    If enabled_modules is None, return all tools."""
    if enabled_modules is None:
        return TOOL_DEFINITIONS

    enabled_tool_names: set[str] = set()
    for mod in TOOL_MODULES_META:
        if mod["name"] in enabled_modules:
            enabled_tool_names.update(mod["tools"])

    return [t for t in TOOL_DEFINITIONS if t["function"]["name"] in enabled_tool_names]


def get_tool_name_set() -> set[str]:
    """Return set of all tool names."""
    return {t["function"]["name"] for t in TOOL_DEFINITIONS}
