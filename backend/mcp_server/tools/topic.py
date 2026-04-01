"""
Topic modeling tools for Meta-Lingo MCP server.
Tools: topic_modeling (LDA/LSA/NMF), create_bertopic_embedding,
       list_bertopic_embeddings, bertopic_analyze
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import save_bar_chart, save_wordcloud, save_plotly_chart


def _format_topics(topics: list, n_top_words: int) -> tuple[list, str]:
    """Format topics into CSV rows and display string."""
    csv_rows = []
    lines = []
    for t in topics:
        topic_id = t.get("id", t.get("topic_id", ""))
        label = t.get("label", t.get("name", f"Topic {topic_id}"))
        words = t.get("words", t.get("keywords", t.get("top_words", [])))
        weight = t.get("weight", t.get("proportion", 0))
        doc_count = t.get("doc_count", t.get("count", 0))
        word_strs = []
        for w in words[:n_top_words]:
            if isinstance(w, dict):
                word_strs.append(f"{w.get('word', '?')}({w.get('weight', 0):.3f})")
            else:
                word_strs.append(str(w))
        lines.append(f"  {label} (docs={doc_count}, weight={weight:.3f}):")
        lines.append(f"    {', '.join(word_strs)}")
        lines.append("")
        csv_rows.append({
            "Topic ID": topic_id,
            "Topic Name": label,
            "Keywords": ", ".join(word_strs),
            "Doc Count": doc_count,
            "Weight": f"{weight:.4f}",
        })
    return csv_rows, "\n".join(lines)


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def topic_modeling(
        corpus_id: str,
        text_ids: list[str] | None = None,
        method: str = "lda",
        language: str = "english",
        n_topics: int = 10,
        n_top_words: int = 10,
        # ── Preprocessing (all methods share these) ──────────────────────
        remove_stopwords: bool = True,
        remove_punctuation: bool = False,
        lemmatize: bool = True,
        lowercase: bool = True,
        min_word_length: int = 2,
        pos_filter: list[str] | None = None,
        pos_keep_mode: bool = False,
        ngram_enabled: bool = False,
        ngram_n_values: list[int] | None = None,
        # ── LDA parameters ───────────────────────────────────────────────
        lda_passes: int = 10,
        lda_iterations: int = 50,
        lda_chunksize: int = 2000,
        lda_update_every: int = 1,
        lda_eval_every: int = 10,
        lda_minimum_probability: float = 0.01,
        lda_alpha: str = "auto",
        lda_eta: str = "auto",
        lda_min_df: int = 2,
        lda_max_df: float = 0.95,
        lda_random_state: int = 42,
        # ── LSA parameters ───────────────────────────────────────────────
        lsa_svd_algorithm: str = "randomized",
        lsa_max_features: int = 10000,
        lsa_min_df: int = 2,
        lsa_max_df: float = 0.95,
        lsa_tol: float = 0.0,
        lsa_n_iter: int = 5,
        lsa_n_oversamples: int = 10,
        lsa_power_iteration_normalizer: str = "auto",
        lsa_random_state: int = 42,
        # ── NMF parameters ───────────────────────────────────────────────
        nmf_init: str = "nndsvd",
        nmf_solver: str = "cd",
        nmf_max_iter: int = 200,
        nmf_tol: float = 1e-4,
        nmf_alpha_W: float = 0.0,
        nmf_alpha_H: float = 0.0,
        nmf_l1_ratio: float = 0.0,
        nmf_beta_loss: str = "frobenius",
        nmf_shuffle: bool = False,
        nmf_max_features: int = 10000,
        nmf_min_df: int = 2,
        nmf_max_df: float = 0.95,
        nmf_random_state: int = 42,
        # ── Output ───────────────────────────────────────────────────────
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Run topic modeling (LDA, LSA, or NMF) on a corpus.

        When to use: Unsupervised thematic structure discovery in texts.
        For BERTopic (neural/semantic), use: create_bertopic_embedding → bertopic_analyze.

        IMPORTANT: May take 30-120 seconds depending on corpus size and method.

        Methods:
        - "lda": Latent Dirichlet Allocation (Gensim, probabilistic) — best for large corpora
        - "lsa": Latent Semantic Analysis (TruncatedSVD, linear) — fast, good for medium corpora
        - "nmf": Non-negative Matrix Factorization — sparse, interpretable topics

        === DIAGNOSING BAD RESULTS AND HOW TO FIX THEM ===

        Problem: Topics look too similar / overlap heavily
        → Fix (LDA): Increase lda_passes (e.g. 20-30), set lda_alpha="asymmetric"
        → Fix (NMF): Try nmf_init="nndsvda", increase nmf_max_iter (e.g. 500)
        → Fix (all): Reduce n_topics, increase lda_min_df/lsa_min_df/nmf_min_df

        Problem: Topics dominated by generic/uninformative words
        → Fix: Ensure remove_stopwords=True, increase min_word_length (e.g. 3-4)
               Increase lda_min_df/nmf_min_df to 3-5 to remove rare noise words
               Use pos_filter=["NOUN", "VERB"] with pos_keep_mode=True for content words only

        Problem: Incoherent topics with random-looking words
        → Fix (LDA): Increase lda_passes (e.g. 15-20), increase lda_iterations (e.g. 100)
        → Fix (LDA): Try lda_alpha="asymmetric" for sparser topic distributions
        → Fix (all): Reduce n_topics (fewer but more coherent topics)

        Problem: Too many near-empty topics (very few keywords or docs)
        → Fix: Reduce n_topics, increase lda_min_df/lsa_min_df/nmf_min_df
               For LDA: increase lda_minimum_probability (e.g. 0.05)

        Problem: Small corpus (< 50 documents), unstable results
        → Fix (LDA): lda_min_df=1, lda_passes=20, n_topics=3-5, lda_alpha="asymmetric"
        → Fix (NMF): nmf_init="random", nmf_random_state=42, n_topics=3-5
        → Consider: LDA or NMF usually beats LSA on very small corpora

        === STRATEGY: AUTO-ADJUST BASED ON RESULTS ===
        After seeing results, you should:
        1. If topics overlap → rerun with fewer n_topics or higher min_df
        2. If topics are incoherent → rerun with more lda_passes or pos_filter on nouns
        3. If results vary run to run → set a fixed random_state and increase passes
        4. Always try 2-3 different n_topics values (e.g. 5, 8, 12) and compare

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            method: "lda", "lsa", or "nmf"
            language: "english" or "chinese"
            n_topics: Number of topics to discover (default: 10).
                      For small corpora (<50 docs) use 3-6.
                      For medium corpora (50-500 docs) use 6-15.
            n_top_words: Top keywords per topic to show (default: 10)

            Preprocessing:
            remove_stopwords: Remove common stopwords (default: true)
            remove_punctuation: Remove punctuation tokens (default: false)
            lemmatize: Use lemma forms (default: true)
            lowercase: Convert to lowercase (default: true)
            min_word_length: Minimum word length (default: 2)
            pos_filter: POS tags to filter (default: PUNCT/SYM/X/NUM/INTJ excluded)
            pos_keep_mode: True=keep only listed POS, False=exclude listed POS (default: false)
            ngram_enabled: Enable n-gram features (default: false)
            ngram_n_values: N-gram sizes e.g. [2, 3] (default: [2])

            LDA-specific (used when method="lda"):
            lda_passes: Training passes over corpus (default: 10)
            lda_iterations: Max iterations per document (default: 50)
            lda_chunksize: Documents per chunk (default: 2000)
            lda_update_every: Update model every N chunks (default: 1)
            lda_eval_every: Log perplexity every N updates (default: 10)
            lda_minimum_probability: Min topic probability per document (default: 0.01)
            lda_alpha: Document-topic prior: "auto", "symmetric", "asymmetric" (default: "auto")
            lda_eta: Topic-word prior: "auto", "symmetric" (default: "auto")
            lda_min_df: Min document frequency for vocabulary (default: 2)
            lda_max_df: Max document frequency fraction (default: 0.95)
            lda_random_state: Random seed (default: 42)

            LSA-specific (used when method="lsa"):
            lsa_svd_algorithm: SVD algorithm: "randomized" or "arpack" (default: "randomized")
            lsa_max_features: Max vocabulary size (default: 10000)
            lsa_min_df: Min document frequency (default: 2)
            lsa_max_df: Max document frequency fraction (default: 0.95)
            lsa_tol: Tolerance for arpack (default: 0.0)
            lsa_n_iter: Iterations for randomized SVD (default: 5)
            lsa_n_oversamples: Oversampling for randomized SVD (default: 10)
            lsa_power_iteration_normalizer: "auto", "QR", "LU", "none" (default: "auto")
            lsa_random_state: Random seed (default: 42)

            NMF-specific (used when method="nmf"):
            nmf_init: Initialization: "nndsvd", "nndsvda", "nndsvdar", "random" (default: "nndsvd")
            nmf_solver: Solver: "cd" (coordinate descent) or "mu" (multiplicative update, default: "cd")
            nmf_max_iter: Max iterations (default: 200)
            nmf_tol: Convergence tolerance (default: 1e-4)
            nmf_alpha_W: L1/L2 regularization for W (default: 0.0)
            nmf_alpha_H: L1/L2 regularization for H (default: 0.0)
            nmf_l1_ratio: L1 vs L2 ratio (default: 0.0 = pure L2)
            nmf_beta_loss: "frobenius", "kullback-leibler", "itakura-saito" (default: "frobenius")
            nmf_shuffle: Shuffle features in CD solver (default: false)
            nmf_max_features: Max vocabulary size (default: 10000)
            nmf_min_df: Min document frequency (default: 2)
            nmf_max_df: Max document frequency fraction (default: 0.95)
            nmf_random_state: Random seed (default: 42)

            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = no save.
            chart_type: Generate chart: "bar" (topic keywords), "wordcloud". None = no chart.
            chart_path: Chart save path. Empty string = ~/Downloads. None = no save.
        """
        if not text_ids:
            texts_resp = await client.get(f"/api/corpus/{corpus_id}/texts")
            text_list = texts_resp.get("data", [])
            text_ids = [t["id"] for t in text_list]

        if not text_ids:
            return "No texts found in corpus."

        preprocess_config = {
            "remove_stopwords": remove_stopwords,
            "remove_punctuation": remove_punctuation,
            "lemmatize": lemmatize,
            "lowercase": lowercase,
            "min_word_length": min_word_length,
            "pos_filter": pos_filter if pos_filter is not None else ["PUNCT", "SYM", "X", "NUM", "INTJ"],
            "pos_keep_mode": pos_keep_mode,
            "ngram_enabled": ngram_enabled,
            "ngram_n_values": ngram_n_values if ngram_n_values is not None else [2],
        }

        method = method.lower()
        if method == "lsa":
            body = {
                "corpus_id": corpus_id,
                "text_ids": text_ids,
                "language": language,
                "preprocess_config": preprocess_config,
                "lsa_config": {
                    "num_topics": n_topics,
                    "num_keywords": n_top_words,
                    "svd_algorithm": lsa_svd_algorithm,
                    "max_features": lsa_max_features,
                    "min_df": lsa_min_df,
                    "max_df": lsa_max_df,
                    "tol": lsa_tol,
                    "n_iter": lsa_n_iter,
                    "n_oversamples": lsa_n_oversamples,
                    "power_iteration_normalizer": lsa_power_iteration_normalizer,
                    "random_state": lsa_random_state,
                },
            }
            result = await client.post("/api/topic-modeling/lsa/analyze", json_data=body)
        elif method == "nmf":
            body = {
                "corpus_id": corpus_id,
                "text_ids": text_ids,
                "language": language,
                "preprocess_config": preprocess_config,
                "nmf_config": {
                    "num_topics": n_topics,
                    "num_keywords": n_top_words,
                    "init": nmf_init,
                    "solver": nmf_solver,
                    "max_iter": nmf_max_iter,
                    "tol": nmf_tol,
                    "alpha_W": nmf_alpha_W,
                    "alpha_H": nmf_alpha_H,
                    "l1_ratio": nmf_l1_ratio,
                    "beta_loss": nmf_beta_loss,
                    "shuffle": nmf_shuffle,
                    "max_features": nmf_max_features,
                    "min_df": nmf_min_df,
                    "max_df": nmf_max_df,
                    "random_state": nmf_random_state,
                },
            }
            result = await client.post("/api/topic-modeling/nmf/analyze", json_data=body)
        else:  # lda (default)
            body = {
                "corpus_id": corpus_id,
                "text_ids": text_ids,
                "language": language,
                "preprocess_config": preprocess_config,
                "lda_config": {
                    "num_topics": n_topics,
                    "passes": lda_passes,
                    "iterations": lda_iterations,
                    "chunksize": lda_chunksize,
                    "update_every": lda_update_every,
                    "eval_every": lda_eval_every,
                    "minimum_probability": lda_minimum_probability,
                    "alpha": lda_alpha,
                    "eta": lda_eta,
                    "min_df": lda_min_df,
                    "max_df": lda_max_df,
                    "top_n_keywords": n_top_words,
                    "random_state": lda_random_state,
                },
            }
            result = await client.post("/api/topic-modeling/lda/analyze", json_data=body)

        data = result.get("data", result)
        topics = data.get("topics", [])
        result_id = data.get("result_id", data.get("id", ""))

        if not topics:
            return f"Topic modeling ({method.upper()}) produced no topics. Response: {str(result)[:300]}"

        csv_rows, topic_text = _format_topics(topics, n_top_words)
        header = f"Topic Modeling ({method.upper()}, {n_topics} topics, {len(text_ids)} docs)\n"
        if result_id:
            header += f"Result ID: {result_id}\n\n"
        output = header + topic_text

        if save_path is not None:
            saved = save_csv(csv_rows, save_path, f"{method}_topics_{today()}.csv",
                             ["Topic ID", "Topic Name", "Keywords", "Doc Count", "Weight"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and topics:
            chart_path = chart_path if chart_path is not None else ""
            # Build flat keyword frequency for chart
            kw_freq: dict = {}
            for t in topics:
                words = t.get("words", t.get("keywords", t.get("top_words", [])))
                for w in words[:n_top_words]:
                    if isinstance(w, dict):
                        word = w.get("word", "")
                        weight = w.get("weight", 1)
                    else:
                        word, weight = str(w), 1
                    if word:
                        kw_freq[word] = kw_freq.get(word, 0) + weight
            kw_items = sorted([{"word": k, "weight": v} for k, v in kw_freq.items()],
                              key=lambda x: -x["weight"])
            chart_title = f"{method.upper()} Topic Keywords"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    kw_items[:30], "word", "weight", chart_title, chart_path,
                    default_filename=f"{method}_keywords_bar_{today()}.png", xlabel="Weight")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    kw_items, "word", "weight", chart_path,
                    default_filename=f"{method}_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def create_bertopic_embedding(
        corpus_id: str,
        text_ids: list[str] | None = None,
        language: str = "english",
        remove_stopwords: bool = False,
        lemmatize: bool = False,
        lowercase: bool = False,
        min_word_length: int = 1,
        # ── Chunking (for long texts) ─────────────────────────────────
        chunking_enabled: bool = False,
        chunking_min_tokens: int = 100,
        chunking_max_tokens: int = 256,
        chunking_overlap_tokens: int = 0,
    ) -> str:
        """Create sentence embeddings for BERTopic analysis (Step 1 of 2).

        When to use: Before bertopic_analyze(). Preprocessing + embedding can take
        1-5 minutes depending on corpus size. The embedding is saved and reusable.

        After this completes, call bertopic_analyze(embedding_id) to discover topics.

        BERTopic workflow:
        1. create_bertopic_embedding(corpus_id) → get embedding_id
        2. bertopic_analyze(embedding_id) → get topics

        IMPORTANT: BERTopic uses SBERT for sentence embeddings, so preprocessing
        should be minimal (keep_stopwords=True, no lemmatization) for best results.

        ⚠ CHUNKING WARNING: When chunking_enabled=True, each long text is split into
        multiple chunks, each treated as a separate "document". This INFLATES the
        document counts in bertopic_analyze results (e.g., 19 texts × ~50 chunks = ~950
        "documents"). This causes topic weights to appear near 0 because the denominator
        is the chunk count, not the text count. For small corpora (<50 texts), keep
        chunking_enabled=False unless texts are extremely long (>2000 words each).

        Args:
            corpus_id: Corpus ID to embed
            text_ids: Specific text IDs (None = all)
            language: "english" or "chinese"
            remove_stopwords: Remove stopwords before embedding (default: false — not recommended)
            lemmatize: Lemmatize tokens (default: false — not recommended for SBERT)
            lowercase: Lowercase tokens (default: false — not recommended for SBERT)
            min_word_length: Minimum token length (default: 1)

            Text chunking (for long documents):
            chunking_enabled: Split long texts into chunks before embedding (default: false)
            chunking_min_tokens: Merge paragraphs smaller than this (default: 100)
            chunking_max_tokens: Target max chunk size in tokens (default: 256, SBERT max: 512)
            chunking_overlap_tokens: Overlap between consecutive chunks (default: 0)
        """
        if not text_ids:
            texts_resp = await client.get(f"/api/corpus/{corpus_id}/texts")
            text_list = texts_resp.get("data", [])
            text_ids = [t["id"] for t in text_list]

        if not text_ids:
            return "No texts found in corpus."

        body: dict = {
            "corpus_id": corpus_id,
            "text_ids": text_ids,
            "preprocess_config": {
                "remove_stopwords": remove_stopwords,
                "remove_punctuation": False,
                "lemmatize": lemmatize,
                "lowercase": lowercase,
                "min_token_length": min_word_length,
                "pos_filter": [],
                "pos_keep_mode": False,
            },
            "batch_size": 32,
            "device": "cpu",
            "normalize": False,
            "language": language,
        }
        if chunking_enabled:
            body["chunking"] = {
                "enabled": True,
                "min_tokens": chunking_min_tokens,
                "max_tokens": chunking_max_tokens,
                "overlap_tokens": chunking_overlap_tokens,
            }

        result = await client.post("/api/topic-modeling/embedding", json_data=body)

        embedding_id = result.get("embedding_id", "")
        shape = result.get("shape", [])
        stats = result.get("preprocess_stats", result.get("stats", {}))

        if not embedding_id:
            return f"Embedding failed. Response: {str(result)[:300]}"

        lines = [
            "Embedding created successfully.",
            f"  Embedding ID: {embedding_id}",
            f"  Shape: {shape}",
            f"  Documents: {shape[0] if shape else '?'}",
        ]
        if chunking_enabled:
            lines.append(f"  Chunking: enabled (max={chunking_max_tokens} tokens)")
        if stats:
            lines.append(f"  Stats: {stats}")
        lines.append(
            f"\nNext: call bertopic_analyze(embedding_id='{embedding_id}') "
            f"to discover topics."
        )
        return "\n".join(lines)

    @mcp.tool()
    async def get_bertopic_preprocess_settings() -> str:
        """Read the user's saved BERTopic preprocess and chunking settings from the UI.

        When to use: ALWAYS call this BEFORE create_bertopic_embedding() to apply the
        user's configured chunking settings. These settings are saved whenever the user
        runs embedding from the BERTopic UI panel.

        Returns the chunking configuration (enabled, min_tokens, max_tokens, overlap_tokens)
        and preprocess config (stopwords, lemmatize, lowercase, min_token_length).
        Apply these directly as parameters to create_bertopic_embedding().
        """
        result = await client.get("/api/topic-modeling/preprocess-settings")
        data = result.get("data", result)
        chunking = data.get("chunking", {})
        preprocess = data.get("preprocess", {})

        lines = ["BERTopic Preprocess Settings (configured by user in UI):\n"]
        lines.append("Chunking:")
        lines.append(f"  enabled:        {chunking.get('enabled', False)}")
        lines.append(f"  min_tokens:     {chunking.get('min_tokens', 100)}")
        lines.append(f"  max_tokens:     {chunking.get('max_tokens', 256)}")
        lines.append(f"  overlap_tokens: {chunking.get('overlap_tokens', 0)}")
        lines.append("\nPreprocessing:")
        lines.append(f"  remove_stopwords: {preprocess.get('remove_stopwords', False)}")
        lines.append(f"  lemmatize:        {preprocess.get('lemmatize', False)}")
        lines.append(f"  lowercase:        {preprocess.get('lowercase', False)}")
        lines.append(f"  min_token_length: {preprocess.get('min_token_length', 1)}")
        lines.append(
            "\nApply these as: create_bertopic_embedding("
            f"chunking_enabled={chunking.get('enabled', False)}, "
            f"chunking_min_tokens={chunking.get('min_tokens', 100)}, "
            f"chunking_max_tokens={chunking.get('max_tokens', 256)}, "
            f"chunking_overlap_tokens={chunking.get('overlap_tokens', 0)}, "
            f"remove_stopwords={preprocess.get('remove_stopwords', False)}, "
            f"lemmatize={preprocess.get('lemmatize', False)}, "
            f"lowercase={preprocess.get('lowercase', False)}, "
            f"min_word_length={preprocess.get('min_token_length', 1)})"
        )
        return "\n".join(lines)

    @mcp.tool()
    async def list_bertopic_embeddings(
        corpus_id: Optional[str] = None,
    ) -> str:
        """List available BERTopic embeddings.

        When to use: To find existing embeddings for a corpus, so you can
        reuse them with bertopic_analyze() without re-embedding.

        Args:
            corpus_id: Filter by corpus ID (None = all)
        """
        params = {}
        if corpus_id:
            params["corpus_id"] = corpus_id

        result = await client.get("/api/topic-modeling/embedding/list", params=params)
        embeddings = result.get("embeddings", [])

        if not embeddings:
            return "No embeddings found."

        lines = [f"Found {len(embeddings)} embedding(s):\n"]
        for e in embeddings:
            eid = e.get("id", e.get("embedding_id", "?"))
            cid = e.get("corpus_id", "?")
            shape = e.get("shape", [])
            created = e.get("created_at", e.get("timestamp", ""))
            name = e.get("name", "")
            line = f"- {eid}"
            if name:
                line += f" ({name})"
            line += f"  corpus={cid}  shape={shape}"
            if created:
                line += f"  created={created}"
            lines.append(line)
        return "\n".join(lines)

    @mcp.tool()
    async def bertopic_analyze(
        embedding_id: str,
        language: str = "english",
        n_top_words: int = 10,
        # ── Topic count control ───────────────────────────────────────
        nr_topics: Optional[int] = None,
        # ── Dimensionality reduction ──────────────────────────────────
        dim_method: str = "UMAP",
        umap_n_neighbors: int = 15,
        umap_n_components: int = 5,
        umap_min_dist: float = 0.0,
        umap_metric: str = "cosine",
        umap_random_state: int = 42,
        # ── Clustering ───────────────────────────────────────────────
        cluster_method: str = "HDBSCAN",
        hdbscan_min_cluster_size: int = 10,
        hdbscan_min_samples: Optional[int] = None,
        hdbscan_metric: str = "euclidean",
        hdbscan_cluster_selection_method: str = "eom",
        hdbscan_prediction_data: bool = True,
        # ── Vectorizer ───────────────────────────────────────────────
        vectorizer_type: str = "CountVectorizer",
        vectorizer_min_df: int = 2,
        vectorizer_max_df: float = 0.95,
        vectorizer_ngram_range: list[int] | None = None,
        # ── Topic representation ──────────────────────────────────────
        representation_model: Optional[str] = None,
        # ── Outlier handling ──────────────────────────────────────────
        reduce_outliers: bool = False,
        outlier_strategy: str = "distributions",
        outlier_threshold: float = 0.0,
        # ── Other ─────────────────────────────────────────────────────
        calculate_probabilities: bool = False,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Run BERTopic analysis on an existing embedding (Step 2 of 2).

        When to use: After create_bertopic_embedding() completes. Uses the saved
        embedding to discover topics via UMAP + HDBSCAN + c-TF-IDF.

        === DIAGNOSING BAD RESULTS AND HOW TO FIX THEM ===

        Problem: Topic -1 has too many documents (outliers dominate)
        → Cause: hdbscan_min_cluster_size too large, most docs can't form clusters
        → Fix: Decrease hdbscan_min_cluster_size (e.g. 3–5 for small corpora)
               AND/OR set reduce_outliers=True, outlier_strategy="distributions"

        Problem: All topic weights are 0.000 / doc counts far exceed actual texts
        → Cause: Embedding was created with chunking_enabled=True, inflating doc count
        → Fix: Re-create embedding with chunking_enabled=False (unless texts are very long)
               Then re-run this analysis

        Problem: Too many topics (topic fragmentation), e.g. person-name clusters
        → Fix A: Increase hdbscan_min_cluster_size (e.g. 15–30)
        → Fix B: Set nr_topics=N to merge down to N meaningful topics after clustering
        → Fix C: Set vectorizer_min_df=3 or higher to suppress rare/noisy words

        Problem: Too few topics (everything lumped together)
        → Fix: Decrease hdbscan_min_cluster_size (e.g. 3–5)
               AND decrease umap_n_neighbors (e.g. 5–8) for more local structure

        Problem: Topics look incoherent / generic words dominate
        → Fix: Increase vectorizer_min_df (e.g. 3–5) and vectorizer_max_df (e.g. 0.8)
               Use representation_model="MaximalMarginalRelevance" for diverse keywords

        NOTE: umap_n_neighbors and umap_n_components are auto-adjusted on the server
        to stay below n_docs, so small corpora will not fail with "n_neighbors >= n_samples".

        === SMALL CORPUS RECIPE (< 100 texts) ===
        umap_n_neighbors=5, umap_n_components=3, hdbscan_min_cluster_size=3,
        hdbscan_min_samples=1, vectorizer_min_df=1, reduce_outliers=True

        === MEDIUM CORPUS RECIPE (100–1000 texts) ===
        umap_n_neighbors=10, umap_n_components=5, hdbscan_min_cluster_size=10,
        vectorizer_min_df=2 (defaults mostly fine)

        Args:
            embedding_id: Embedding ID from create_bertopic_embedding or list_bertopic_embeddings
            language: "english" or "chinese" (for tokenization)
            n_top_words: Top words per topic to show (default: 10)

            nr_topics: Merge/reduce topics to this many after clustering.
                       None = keep all auto-detected topics (default).
                       Set to an integer (e.g. 5) to force a specific number.
                       Use "auto" is NOT supported here; pass an integer or None.

            Dimensionality reduction (UMAP):
            dim_method: Reduction method: "UMAP" or "PCA" (default: "UMAP")
            umap_n_neighbors: Neighbors for manifold (lower=local detail, higher=global; default: 15)
                              For small corpora use 5–8. Must be < number of documents.
            umap_n_components: Output dimensions (default: 5; use 3 for very small corpora)
            umap_min_dist: Min distance between projected points (default: 0.0)
            umap_metric: Distance metric: "cosine", "euclidean" (default: "cosine")
            umap_random_state: Random seed (default: 42)

            Clustering (HDBSCAN):
            cluster_method: "HDBSCAN" or "K-Means" (default: "HDBSCAN")
            hdbscan_min_cluster_size: Min docs per topic cluster (default: 10).
                                      KEY PARAMETER — lower=more topics, higher=fewer topics.
                                      For small corpora (< 100 docs) use 3–5.
            hdbscan_min_samples: Controls noise sensitivity (None=auto; 1=least noise; default: None)
                                 Set to 1 for small corpora to minimize outliers.
            hdbscan_metric: Distance metric: "euclidean" (default)
            hdbscan_cluster_selection_method: "eom" (default) or "leaf" (more granular)
            hdbscan_prediction_data: Enable soft clustering for outlier reduction (default: true)

            Vectorizer (c-TF-IDF):
            vectorizer_type: "CountVectorizer" or "OnlineCountVectorizer" (default: "CountVectorizer")
            vectorizer_min_df: Min document frequency for vocabulary (default: 2).
                               Increase to 3–5 to suppress rare noisy words (person names, typos).
            vectorizer_max_df: Max document frequency fraction (default: 0.95).
                               Decrease to 0.7–0.8 to filter ubiquitous words.
            vectorizer_ngram_range: N-gram range e.g. [1,2] for bigrams (default: [1,1])

            representation_model: Optional model for better topic labels:
                                   None (default, c-TF-IDF only),
                                   "KeyBERTInspired" (semantic keyword extraction),
                                   "MaximalMarginalRelevance" (diverse keywords, recommended)

            Outlier handling:
            reduce_outliers: Reassign topic -1 (outlier) docs to nearest topic (default: false)
                             Recommended: set True when topic -1 is large.
            outlier_strategy: "distributions" (default, uses probabilities) or "embeddings" (uses cosine similarity)
            outlier_threshold: Min probability for reassignment (default: 0.0 = reassign all outliers)

            calculate_probabilities: Compute per-document topic probabilities (slower; default: false)
                                     Required for reduce_outliers with strategy="distributions".

            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = no save.
            chart_type: "barchart", "heatmap", "hierarchy", "wordcloud", or "bar". None = no chart.
            chart_path: Chart save path. Empty string = ~/Downloads. None = no save.
        """
        umap_params: dict = {
            "n_neighbors": umap_n_neighbors,
            "n_components": umap_n_components,
            "min_dist": umap_min_dist,
            "metric": umap_metric,
            "random_state": umap_random_state,
        }
        hdbscan_params: dict = {
            "min_cluster_size": hdbscan_min_cluster_size,
            "metric": hdbscan_metric,
            "cluster_selection_method": hdbscan_cluster_selection_method,
            "prediction_data": hdbscan_prediction_data,
        }
        if hdbscan_min_samples is not None:
            hdbscan_params["min_samples"] = hdbscan_min_samples

        vectorizer_params: dict = {
            "min_df": vectorizer_min_df,
            "max_df": vectorizer_max_df,
            "ngram_range": vectorizer_ngram_range if vectorizer_ngram_range is not None else [1, 1],
        }

        body: dict = {
            "embedding_id": embedding_id,
            "language": language,
            "nr_topics": nr_topics,
            "dim_reduction": {
                "method": dim_method,
                "params": umap_params,
            },
            "clustering": {
                "method": cluster_method,
                "params": hdbscan_params,
            },
            "vectorizer": {
                "type": vectorizer_type,
                "params": vectorizer_params,
            },
            "representation_model": {
                "type": representation_model,
                "params": {},
            },
            "reduce_outliers": {
                "enabled": reduce_outliers,
                "strategy": outlier_strategy,
                "threshold": outlier_threshold,
            },
            "calculate_probabilities": calculate_probabilities,
        }

        result = await client.post("/api/topic-modeling/analyze", json_data=body)
        data = result.get("data", result)
        topics = data.get("topics", [])
        result_id = data.get("result_id", data.get("id", ""))

        if not topics:
            return "BERTopic analysis produced no topics."

        csv_rows, topic_text = _format_topics(topics, n_top_words)
        header = f"BERTopic Analysis ({len(topics)} topics)\n"
        if result_id:
            header += f"Result ID: {result_id}\n\n"
        output = header + topic_text

        if save_path is not None:
            saved = save_csv(csv_rows, save_path, f"bertopic_topics_{today()}.csv",
                             ["Topic ID", "Topic Name", "Keywords", "Doc Count", "Weight"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and result_id:
            chart_path = chart_path if chart_path is not None else ""
            plotly_types = ("barchart", "heatmap", "hierarchy", "topics", "documents", "term_rank")
            if chart_type in plotly_types:
                viz_result = await client.post(
                    f"/api/topic-modeling/visualization/{result_id}/{chart_type}",
                    json_data={},
                )
                if isinstance(viz_result, dict) and ("data" in viz_result or "layout" in viz_result):
                    saved_chart = save_plotly_chart(
                        viz_result,
                        chart_path,
                        default_filename=f"bertopic_{chart_type}_{today()}.png",
                    )
                    if saved_chart:
                        output += f"\n\nChart saved: {saved_chart}"
            elif chart_type in ("wordcloud", "bar"):
                kw_freq: dict = {}
                for t in topics:
                    words = t.get("words", t.get("keywords", t.get("top_words", [])))
                    for w in words[:n_top_words]:
                        if isinstance(w, dict):
                            word = w.get("word", "")
                            weight = w.get("weight", 1)
                        else:
                            word, weight = str(w), 1
                        if word:
                            kw_freq[word] = kw_freq.get(word, 0) + weight
                kw_items = sorted([{"word": k, "weight": v} for k, v in kw_freq.items()],
                                  key=lambda x: -x["weight"])
                if chart_type == "wordcloud":
                    saved_chart = save_wordcloud(
                        kw_items, "word", "weight", chart_path,
                        default_filename=f"bertopic_wordcloud_{today()}.png",
                        title="BERTopic Keywords",
                    )
                else:
                    saved_chart = save_bar_chart(
                        kw_items[:30], "word", "weight", "BERTopic Top Keywords", chart_path,
                        default_filename=f"bertopic_bar_{today()}.png", xlabel="c-TF-IDF Weight",
                    )
                if saved_chart:
                    output += f"\n\nChart saved: {saved_chart}"

        return output
