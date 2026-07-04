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
    dmip,
    mda,
    task,
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
    dmip,
    mda,
    task,
]


def create_server(backend_url: str = "http://127.0.0.1:8000") -> FastMCP:
    """Create and configure the Meta-Lingo MCP server with all tools."""
    mcp = FastMCP(
        "meta-lingo",
        instructions=(
            "Meta-Lingo is a corpus linguistics research application. "
            "You have 63 tools for corpus management, lexical analysis, "
            "concordance/KWIC, collocations, word sketches, semantic domains "
            "(USAS), metaphor detection (MIPVU), deliberate metaphor analysis "
            "(DMIP), multidimensional register analysis (Biber 1988 MDA), "
            "sentiment (NRC), synonyms, topic modeling, annotation, "
            "bibliographic visualization, export, and multi-text task management.\n\n"

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
            "keyword_extraction, collocation_analysis, word_sketch, "
            "mda_analysis (Biber 1988 register/genre profiling, English only), etc.\n"
            "6. Use reference tools: get_pos_tags, get_usas_categories, "
            "validate_cql, list_reference_corpora\n"
            "7. Compare corpora: keyness_analysis (two user corpora) or "
            "keyness_resource_analysis (vs. BNC/OANC built-in reference)\n"
            "8. Deep-dive: get_extended_context (more context around a KWIC hit), "
            "get_domain_words (words in a USAS domain), get_lemma_forms\n"
            "9. Annotate: see annotation workflow below\n"
            "10. export_annotations - save results\n\n"

            "=== RIGOR RULES (corpus-assisted discourse analysis, Baker 2023) ===\n"
            "1. ABSENCE CLAIMS: NEVER conclude 'X does not appear' from a top-N list.\n"
            "   Run a targeted search first: word_frequency(search_word='X',\n"
            "   search_type='exact') — zero rows is the only valid evidence of absence.\n"
            "   For concepts (not single words) also check the lemma, plausible synonyms\n"
            "   and rewordings before reporting absence, and phrase it as 'absent from\n"
            "   this corpus', not 'does not exist'.\n"
            "2. VERIFY WITH CONCORDANCE: before claiming stance, framing or discourse\n"
            "   prosody for a word, read its concordance lines (concordance_search).\n"
            "   Frequency tables show WHAT occurs, not HOW it is used; a form does not\n"
            "   always have the same function, and quoted uses may be criticised rather\n"
            "   than endorsed by the author.\n"
            "3. SAMPLE PROPERLY: with many hits, analyse a random sample\n"
            "   (sort_by='random'), not the first page; state how many lines you read.\n"
            "   Quantify any pattern you claim ('N of M sampled lines'), and report the\n"
            "   dominant pattern, not just vivid rare examples (saliency ≠ frequency).\n"
            "4. CHECK DISPERSION: high total frequency may come from one text — check\n"
            "   the spread across files before generalising to 'the corpus'.\n"
            "5. REPRESENTATION ≠ REALITY: findings describe how texts represent things,\n"
            "   not facts about the world; consider genre and period context.\n\n"

            "=== MULTIDIMENSIONAL ANALYSIS (MDA, Biber 1988) ===\n"
            "mda_analysis(corpus_id) — register/genre profiling for ENGLISH corpora:\n"
            "67 features per 100 tokens from stored SpaCy annotations, z-scored against\n"
            "Biber's norms, aggregated into six dimension scores + closest text type.\n"
            "Interpretation: dimension scores are continuous positions (closest genre is\n"
            "a nearest match, not a category); always name the specific features driving\n"
            "a dimension (see the most-deviant-features table) before explaining it;\n"
            "flag extreme z on near-zero-SD rare features as artefacts; note instability\n"
            "for texts under ~400 tokens.\n\n"

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

            "All results are also visible in the Meta-Lingo desktop application.\n\n"

            "=== DELIBERATE METAPHOR ANALYSIS (DMIP) ===\n"
            "When asked to identify DELIBERATE metaphors or apply DMIP/DMT analysis:\n"
            "1. ALWAYS start with dmip_analysis(corpus_id, text_id) — do NOT just\n"
            "   call metaphor_analysis() which only gives frequency counts.\n"
            "2. dmip_analysis checks annotation history for saved Metaphor (MIPVU)\n"
            "   archives for the text (matching both the new framework name 'Metaphor'\n"
            "   and the legacy 'MIPVU'; with coder names). TWO data sources are available:\n"
            "     A) Annotation archive (human or auto) — use annotation_archive_id=<real_id>.\n"
            "        Only MIPVU labels (indirect/direct/mflag/implicit) are read.\n"
            "     B) Corpus MIPVU metadata (existing sidecar) — use annotation_archive_id='auto'.\n"
            "        (The literal string 'auto' tells the tool the user confirmed option B.)\n"
            "   If archive(s) EXIST, the tool returns the archive list and STOPS. You MUST\n"
            "   show the list to the user and wait for their reply. If NO archive exists,\n"
            "   the tool proceeds directly with the automatic corpus metadata (no prompt).\n"
            "   Do NOT set use_automatic_mipvu=True to bypass — it does NOT count as\n"
            "   confirmation; ONLY annotation_archive_id='auto' or a real archive ID does.\n"
            "3. The tool returns annotated text with inline markers:\n"
            "   [MET:word/phrase] / [DIR:word/phrase] / [MFLAG:word] / [IMPL:word]\n"
            "4. CODE every MRW on four binary dimensions [L±/C±/R±/D±] and assign one\n"
            "   of the FIVE valid configurations (full table in the tool result):\n"
            "     ① L+C+R+D+  ② L+C−R+D+  ③ L−C−R+D+  ④ L−C+R+D+  ⑤ L−C−R−D− (only NDM).\n"
            "5. Apply the DECISION SHORTCUT from the four corollaries (R⟺D biconditional):\n"
            "   (a) L+ genuine metaphor signal?      → R+ → D+  (config ① or ②). Done.\n"
            "   (b) C+ dictionary-confirmed novel?    → R+ → D+  (config ④, or ① if L+). Done.\n"
            "   (c) else (L− and C−): structurally ambiguous → run the REFERENTIAL TEST;\n"
            "       reawakened by a discourse cue → R+/D+ (config ③); else R−/D− (config ⑤).\n"
            "   Do NOT require 'DR plus an extra signal' — the signal/novelty/cue IS the\n"
            "   evidence that establishes R+; once R+ holds, D+ follows automatically.\n"
            "6. [MET:] indirect metaphors CAN be deliberately used (config ③). Do NOT\n"
            "   batch-dismiss; for EACH MRW check main-predicate position and cluster\n"
            "   membership before applying the conventional/unsignaled default (⑤).\n"
            "7. [DIR:] direct metaphor: once confirmed genuinely direct → R+ → D+, ALWAYS\n"
            "   deliberate — UNCONDITIONAL on signal/novelty. An unsignaled, conventional\n"
            "   direct metaphor is config ③ [L−C−R+D+], NEVER ⑤; absence of a flag word\n"
            "   does NOT make it non-deliberate. [DIR:] words can only be ①②③④, never ⑤.\n"
            "   [IMPL:] inherits its antecedent's coding.\n"
            "   ⚠ [MFLAG:] is NOT an MRW — only [MET:]/[DIR:]/[IMPL:] words get a four-\n"
            "   dimension row. An MFLAG (like/as/'metaphor') merely sets the ADJACENT MRW to\n"
            "   L+; never code it or count the flag word itself as a deliberate metaphor.\n"
            "8. Extended metaphors require ALL FIVE criteria (a–e in the procedure) and may\n"
            "   span adjacent paragraphs. Genre-default domains (JOURNEY/CONSTRUCTION/\n"
            "   SPATIAL/ORGANISM/WAR) do NOT qualify unless all five hold.\n"
            "9. CONFIG VALIDATION: the final [L C R D] codes MUST match one of ①–⑤. An\n"
            "   impossible combo (L+ with R−, C+ with R−, R+ with D−, R− with D+) means a\n"
            "   missed signal/novelty or mislabeled R — re-judge.\n"
            "10. Process texts one at a time; use get_corpus_info() to list text IDs.\n"
            "11. Conceptual dimension (C±) is judged with YOUR OWN knowledge, FROM THE\n"
            "    PRODUCER'S PERSPECTIVE. Build a producer context model from the text +\n"
            "    filename + title + metadata (genre, register, audience, ERA), then decide:\n"
            "    is the mapping a ready-made conventional/lexicalized expression for THAT\n"
            "    producer & audience (C−), or a fresh coinage they construct for the occasion\n"
            "    (C+)? Novelty is historically relative. dictionary_lookup() is an OPTIONAL\n"
            "    supporting check — no longer mandatory and does not override your judgment.\n\n"

            "DMIP KEY RULE — R ⟺ D (BICONDITIONAL, Corollary 1):\n"
            "  R+ (Direct Reference) = source-domain entity IS in the reader's situation\n"
            "    model → necessarily D+ POTENTIALLY DELIBERATE.\n"
            "  R− (Indirect Reference) = source domain dissolves into lexical meaning →\n"
            "    necessarily D− NON-DELIBERATE.\n"
            "  Counterfactual test (decisive only for the ambiguous L−C− case):\n"
            "  'Can a non-specialist fully understand this word WITHOUT invoking the\n"
            "  source domain?' YES → R−/D−; NO → R+/D+; UNCERTAIN → WIDLII (provisional D+).\n\n"

            "=== MULTI-TEXT TASK MANAGEMENT ===\n"
            "When analyzing a corpus with MORE THAN 3 TEXTS in a per-text workflow\n"
            "(DMIP, per-text metaphor, per-text concordance, etc.):\n"
            "1. start_analysis_task(corpus_id, task_type, total_texts) → task_id\n"
            "2. get_corpus_info(corpus_id) → retrieve text list\n"
            "3. For EACH text: [run analysis tool] → "
            "save_text_result(task_id, text_id, text_label, content)\n"
            "   After saving, only acknowledge '✓ [k/N] label — saved'. "
            "Do NOT include the full analysis in your reply.\n"
            "4. After ALL texts: get_task_status(task_id) → verify, "
            "then read_task_results(task_id) → write cross-text summary.\n"
            "WHY: Results are stored to disk, keeping them out of context. "
            "This allows complete analysis of 20-50+ text corpora without overflow."
        ),
    )

    client = MetaLingoClient(backend_url)

    for module in TOOL_MODULES:
        module.register(mcp, client)

    return mcp
