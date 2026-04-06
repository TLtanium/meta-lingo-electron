"""
Meta-Lingo MCP Server setup and tool registration.
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.tools import (
    corpus,
    analysis,
    concordance,
    semantic,
    sketch,
    topic,
    export,
    reference,
    annotation,
    biblio,
)

TOOL_MODULES = [
    corpus,
    analysis,
    concordance,
    semantic,
    sketch,
    topic,
    export,
    reference,
    annotation,
    biblio,
]


def create_server(backend_url: str = "http://127.0.0.1:8000") -> FastMCP:
    """Create and configure the Meta-Lingo MCP server with all tools."""
    mcp = FastMCP(
        "meta-lingo",
        instructions=(
            "Meta-Lingo is a corpus linguistics research application. "
            "You have 53 tools for corpus management, lexical analysis, "
            "concordance/KWIC, collocations, word sketches, semantic domains "
            "(USAS), metaphor detection (MIPVU), sentiment (NRC), synonyms, "
            "topic modeling, annotation, bibliographic visualization, "
            "and export.\n\n"

            "=== LOCAL FILESYSTEM ACCESS ===\n"
            "IMPORTANT: This MCP server runs LOCALLY on the user's machine, "
            "not in the cloud. You CAN read local files directly. When the user "
            "provides a file path or directory, use upload_text(filepath=...) or "
            "upload_directory(directory=...) to read files from disk. Do NOT ask "
            "the user to copy-paste file contents or upload files to the chat.\n\n"

            "=== UPLOAD & PROCESSING ===\n"
            "- upload_text supports filepath (local file) or content (text string).\n"
            "- upload_directory batch-uploads all files in a local folder.\n"
            "- Both wait for prior annotation to finish before uploading the next file.\n"
            "- After upload, annotation runs in the background. Use "
            "list_corpus_upload_tasks / get_processing_task_status to monitor.\n"
            "- If user asked for a full pipeline from upload, stop after upload "
            "and tell them to wait until processing finishes.\n\n"

            "=== RESEARCH WORKFLOW ===\n"
            "1. list_corpora - see available corpora\n"
            "2. create_corpus + upload_text - add new data\n"
            "3. list_corpus_upload_tasks / get_processing_task_status - wait\n"
            "4. get_corpus_info - get text IDs and metadata\n"
            "5. Run analyses: word_frequency, concordance_search, ngram_analysis, "
            "keyword_extraction, collocation_analysis, word_sketch, etc.\n"
            "6. Use reference tools: get_pos_tags, get_usas_categories, "
            "validate_cql, list_reference_corpora\n"
            "7. Compare corpora: keyness_analysis (two user corpora) or "
            "keyness_resource_analysis (vs. BNC/OANC built-in reference)\n"
            "8. Deep-dive: get_extended_context (more context around a KWIC hit), "
            "get_domain_words (words in a USAS domain), get_lemma_forms\n"
            "9. Annotate: see annotation workflow below\n"
            "10. export_annotations - save results\n\n"

            "=== CQL (Corpus Query Language) ===\n"
            "Use concordance_search(search_mode='cql') for complex pattern queries.\n"
            "ALWAYS call validate_cql(query) first to check syntax.\n"
            "Quick reference:\n"
            "  [word=\"run\"]                    - exact word\n"
            "  [lemma=\"run\"]                   - any form (runs, running, ran)\n"
            "  [pos=\"NOUN\"]                    - any noun\n"
            "  [pos=\"ADJ\"][pos=\"NOUN\"]         - adjective + noun\n"
            "  [word=\"the\" & pos=\"DET\"]        - AND condition\n"
            "  [pos=\"NOUN\" | pos=\"VERB\"]       - OR condition\n"
            "  [!pos=\"PUNCT\"]                  - NOT condition\n"
            "  [pos=\"VERB\"][]{0,3}[pos=\"NOUN\"] - verb, 0-3 any tokens, noun\n"
            "  [dep=\"nsubj\"]                   - dependency relation\n"
            "  [usas=\"A1.1\"]                   - USAS semantic domain\n"
            "Attributes: word, lemma, pos, tag, dep, usas, nrc, "
            "headword, headlemma, headpos, headdep\n\n"

            "=== CONCORDANCE SORTING ===\n"
            "concordance_search supports advanced sorting:\n"
            "- sort_by: 'left_context', 'right_context', 'position', "
            "'frequency', 'random'\n"
            "- sort_levels: multi-level context keys like ['1L','2L'] "
            "(1st word left, 2nd word left) or ['1R','2R'] (right)\n"
            "- sort_descending: reverse order\n\n"

            "=== ANNOTATION WORKFLOW ===\n"
            "To annotate texts that users can find in Meta-Lingo's Annotation panel:\n"
            "1. list_annotation_frameworks() - see available frameworks\n"
            "2. get_annotation_framework(id) - see labels, colors, hierarchy\n"
            "3. get_text_content(corpus_id, text_id) - get raw text and offsets\n"
            "4. Identify spans to annotate (character offsets in the text)\n"
            "5. save_annotation(corpus_name, text_id, text_name, framework, "
            "framework_category, text, annotations=[{text, startPosition, "
            "endPosition, label, labelPath, color}], coder_name='AI')\n"
            "Users will find the archive in: Annotation Mode > Archives.\n\n"

            "=== TOPIC MODELING ===\n"
            "LDA: use topic_modeling() - end-to-end, 30-60 seconds.\n"
            "BERTopic: 2-step workflow:\n"
            "1. create_bertopic_embedding(corpus_id) → get embedding_id (1-5 min)\n"
            "2. bertopic_analyze(embedding_id) → get topics\n"
            "Use list_bertopic_embeddings() to find existing embeddings.\n\n"

            "=== BIBLIOGRAPHIC VISUALIZATION ===\n"
            "1. create_biblio_library(name, source_type='WOS'/'CNKI') → library_id\n"
            "2. upload_biblio_file(library_id, filepath) → entries imported\n"
            "3. Wait for background annotation to complete\n"
            "4. Corpus analysis: get_biblio_library_info → shadow corpus_id → "
            "word_frequency, concordance_search, etc.\n"
            "5. Network analysis: biblio_network(network_type='keyword-cooccur'/'co-author'/...)\n"
            "6. Temporal: biblio_temporal(viz_type='timeline'/'timezone'/'burst')\n"
            "7. Clustering: biblio_cluster(cluster_by='keyword'/'author'/'institution')\n"
            "8. Word frequency: biblio_wordcloud(source='abstract'/'title')\n"
            "All biblio viz tools support year/author/keyword/journal filters "
            "and optional chart_path for PNG export.\n\n"

            "=== ANNOTATION FRAMEWORK CREATION ===\n"
            "To create a custom annotation framework:\n"
            "1. Design the label tree first — decide tiers (grouping) and labels (annotatable)\n"
            "2. Every node needs a unique id, name, and type ('tier' or 'label')\n"
            "3. Labels should have a definition — explains when to apply the label\n"
            "4. Call create_annotation_framework(name, category, root=<tree dict>)\n"
            "5. Server auto-assigns colors based on label paths\n"
            "6. Use get_annotation_framework(id) to verify the created tree\n\n"

            "All results are also visible in the Meta-Lingo desktop application."
        ),
    )

    client = MetaLingoClient(backend_url)

    for module in TOOL_MODULES:
        module.register(mcp, client)

    return mcp
