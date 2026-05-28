"""
Lexical analysis tools for Meta-Lingo MCP server.
Tools: word_frequency, keyword_extraction, keyness_analysis,
       keyness_resource_analysis, ngram_analysis
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import (
    save_bar_chart, save_pie_chart, save_wordcloud,
)


def _match_word(word: str, search_word: str, search_type: str) -> bool:
    """Client-side word filter matching the same types as the server-side searchType."""
    import re
    if not search_word:
        return True
    w = word.lower()
    s = search_word.lower()
    if search_type == "exact":
        return w == s
    elif search_type == "starts":
        return w.startswith(s)
    elif search_type == "ends":
        return w.endswith(s)
    elif search_type == "regex":
        try:
            return bool(re.search(s, w))
        except re.error:
            return False
    elif search_type == "wordlist":
        words = {t.strip().lower() for t in re.split(r"[,\n]", s) if t.strip()}
        return w in words
    else:  # "contains" (default) or "all"
        return s in w


def _format_freq_results(results: list, limit: int = 50) -> str:
    """Format frequency results into a readable table."""
    if not results:
        return "No results found."
    lines = [f"{'Rank':<6}{'Word':<25}{'Freq':<10}{'%':<8}{'POS':<8}"]
    lines.append("-" * 57)
    for i, r in enumerate(results[:limit], 1):
        word = r.get("word", r.get("lemma", "?"))
        freq = r.get("frequency", r.get("freq", 0))
        pct = r.get("percentage", 0)
        pos = r.get("pos", "-")
        lines.append(f"{i:<6}{word:<25}{freq:<10}{pct:<8.2f}{pos:<8}")
    total = len(results)
    if total > limit:
        lines.append(f"\n... showing top {limit} of {total} results")
    return "\n".join(lines)


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def word_frequency(
        corpus_id: str,
        text_ids: list[str] | None = None,
        search_word: str = "",
        search_type: str = "contains",
        search_target: str = "word",
        pos_filter: list[str] | None = None,
        min_freq: int = 1,
        max_freq: int = 0,
        lowercase: bool = True,
        remove_stopwords: bool = False,
        limit: int = 50,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze word frequencies in a corpus.

        When to use: Lexical profiling, comparing frequent words, or filtering by POS.
        Requires annotated texts; after a recent upload_text, wait until processing
        completes (see get_processing_task_status).

        Returns a frequency table with word, frequency, percentage, and POS.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs to analyze (None = all texts)
            search_word: Filter by word pattern (empty = all words)
            search_type: How to match search_word: "exact", "contains", "starts",
                "ends", "regex" (regular expression), "wordlist" (comma/newline-separated words)
            search_target: What to search: "word" (word form) or "lemma"
            pos_filter: Filter by POS tags, e.g. ["NOUN", "VERB", "ADJ"]
            min_freq: Minimum frequency threshold (default: 1)
            max_freq: Maximum frequency (0 = no limit)
            lowercase: Merge case variants (default: true)
            remove_stopwords: Remove common stopwords (default: false)
            limit: Max results to return (default: 50)
            save_path: Save full results as CSV. Path to file, directory, or empty string for ~/Downloads. None = don't save.
            chart_type: Generate a chart: "bar", "pie", or "wordcloud". None = no chart.
            chart_path: Save chart to this path. Empty string = ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "min_freq": min_freq,
            "lowercase": lowercase,
        }
        if max_freq > 0:
            body["max_freq"] = max_freq
        if text_ids:
            body["text_ids"] = text_ids
        # Build search_config (camelCase keys match API SearchConfig model)
        search_cfg: dict = {}
        if search_word:
            search_cfg["searchValue"] = search_word
            search_cfg["searchType"] = search_type
            search_cfg["searchTarget"] = search_target
        if remove_stopwords:
            search_cfg["removeStopwords"] = True
        if search_cfg:
            body["search_config"] = search_cfg
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}

        result = await client.post("/api/analysis/word-frequency", json_data=body)
        data = result.get("data", result)
        results = data.get("results", [])
        total_tokens = data.get("total_tokens", 0)
        total_types = data.get("total_types", data.get("unique_words", 0))

        header = (
            f"Word Frequency Analysis\n"
            f"Total tokens: {total_tokens}, Total types: {total_types}\n\n"
        )
        output = header + _format_freq_results(results, limit)

        if save_path is not None:
            csv_rows = []
            for i, r in enumerate(results, 1):
                csv_rows.append({
                    "Rank": i,
                    "Word": r.get("word", r.get("lemma", "")),
                    "Frequency": r.get("frequency", r.get("freq", 0)),
                    "Percentage": f"{r.get('percentage', 0):.4f}",
                })
            saved = save_csv(csv_rows, save_path, f"word_frequency_{today()}.csv",
                             ["Rank", "Word", "Frequency", "Percentage"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and results:
            chart_items = [
                {"word": r.get("word", r.get("lemma", "")),
                 "frequency": r.get("frequency", r.get("freq", 0)),
                 "percentage": r.get("percentage", 0)}
                for r in results[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = f"Word Frequency — Top {min(50, len(chart_items))} Words"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "word", "frequency", chart_title, chart_path,
                    default_filename=f"word_frequency_bar_{today()}.png", xlabel="Frequency")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "word", "percentage", chart_title, chart_path,
                    default_filename=f"word_frequency_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "word", "frequency", chart_path,
                    default_filename=f"word_frequency_wordcloud_{today()}.png",
                    title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def keyword_extraction(
        corpus_id: str,
        text_ids: list[str] | None = None,
        algorithm: str = "tfidf",
        top_n: int = 30,
        pos_filter: list[str] | None = None,
        config: Optional[dict] = None,
        search_word: str = "",
        search_type: str = "contains",
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Extract keywords from corpus texts using NLP algorithms.

        When to use: Summarize what a text/corpus is about, or compare term salience
        within a single corpus (TF-IDF, TextRank, YAKE, RAKE).

        Algorithm-specific config options (pass as dict):
        - tfidf:    {maxFeatures: 1000, minDf: 1, maxDf: 1.0, ngramRange: [1,1]}
        - textrank: {windowSize: 5, damping: 0.85, maxIter: 100, topN: 30}
        - yake:     {maxNgramSize: 3, dedupThreshold: 0.9, windowSize: 1, topN: 30}
        - rake:     {minLength: 1, maxLength: 3, minFrequency: 1, topN: 30}

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            algorithm: Algorithm: "tfidf", "textrank", "yake", "rake"
            top_n: Number of keywords to extract (default: 30)
            pos_filter: Filter by POS tags, e.g. ["NOUN", "VERB"]
            config: Algorithm-specific parameters (see above, optional)
            search_word: Filter results by keyword pattern (empty = no filter)
            search_type: Match type: "exact", "contains" (default), "starts", "ends",
                "regex", "wordlist" (comma/newline-separated list)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
            chart_type: Generate a chart: "bar", "pie", or "wordcloud". None = no chart.
            chart_path: Save chart path. Empty string = ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "algorithm": algorithm,
            "top_n": top_n,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}
        if config:
            body["config"] = config

        result = await client.post("/api/analysis/keyword/single-doc", json_data=body)
        data = result.get("data", result)
        keywords = data.get("keywords", data.get("results", []))

        if not keywords:
            return "No keywords extracted."

        # Client-side filter by search_word/search_type
        if search_word:
            keywords = [
                kw for kw in keywords
                if _match_word(kw.get("word", kw.get("keyword", "")), search_word, search_type)
            ]
            if not keywords:
                return f'No keywords matching "{search_word}" ({search_type}).'

        filter_note = f", filter={search_word!r} ({search_type})" if search_word else ""
        lines = [f"Keyword Extraction ({algorithm.upper()}, top {top_n}{filter_note})\n"]
        lines.append(f"{'Rank':<6}{'Keyword':<30}{'Score':<12}")
        lines.append("-" * 48)
        for i, kw in enumerate(keywords[:top_n], 1):
            word = kw.get("word", kw.get("keyword", "?"))
            score = kw.get("score", 0)
            lines.append(f"{i:<6}{word:<30}{score:<12.4f}")
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for i, kw in enumerate(keywords, 1):
                csv_rows.append({
                    "Rank": i,
                    "Keyword": kw.get("word", kw.get("keyword", "")),
                    "Score": f"{kw.get('score', 0):.6f}",
                    "Frequency": kw.get("frequency", kw.get("freq", "")),
                    "Algorithm": algorithm,
                })
            saved = save_csv(csv_rows, save_path, f"keywords_{algorithm}_{today()}.csv",
                             ["Rank", "Keyword", "Score", "Frequency", "Algorithm"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and keywords:
            chart_items = [
                {"keyword": kw.get("word", kw.get("keyword", "")),
                 "score": kw.get("score", 0)}
                for kw in keywords[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = f"Keyword Extraction ({algorithm.upper()}) — Top {min(50, len(chart_items))}"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keywords_bar_{today()}.png", xlabel="Score")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keywords_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "keyword", "score", chart_path,
                    default_filename=f"keywords_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def keyness_analysis(
        corpus_id: str,
        reference_corpus_id: str,
        text_ids: list[str] | None = None,
        reference_text_ids: list[str] | None = None,
        statistic: str = "log_likelihood",
        comparison_mode: str = "word",
        min_freq: int = 3,
        p_threshold: float = 0.05,
        limit: int = 50,
        search_word: str = "",
        search_type: str = "contains",
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Compare keywords between a study corpus and a reference corpus.

        When to use: Corpus comparison (keyness / distinctiveness) - e.g. specialist
        vs. general language, register, or period. Needs two user corpus IDs.
        For comparing against built-in reference corpora (BNC, OANC, etc.),
        use keyness_resource_analysis() instead.

        Identifies words that are statistically more frequent (key) or less
        frequent (negative key) in the study corpus compared to the reference.

        Args:
            corpus_id: Study corpus ID
            reference_corpus_id: Reference corpus ID to compare against
            text_ids: Study corpus text IDs (None = all)
            reference_text_ids: Reference corpus text IDs (None = all)
            statistic: Statistical measure: "log_likelihood", "chi_squared",
                       "log_ratio", "dice", "mi", "t_score", "simple_keyness"
            comparison_mode: Compare by: "word" (word form), "lemma", or "domain" (USAS)
            min_freq: Minimum frequency in study corpus (default: 3)
            p_threshold: Significance threshold (default: 0.05)
            limit: Max results (default: 50)
            search_word: Filter results by word pattern (empty = no filter)
            search_type: Match type: "exact", "contains" (default), "starts", "ends",
                "regex", "wordlist" (comma/newline-separated list)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
            chart_type: Generate a chart: "bar", "pie", or "wordcloud". None = no chart.
            chart_path: Save chart path. Empty string = ~/Downloads. None = don't save.
        """
        body: dict = {
            "study_corpus_id": corpus_id,
            "reference_corpus_id": reference_corpus_id,
            "statistic": statistic,
            "comparison_mode": comparison_mode,
            "config": {
                "minFreqStudy": min_freq,
                "pValue": p_threshold,
            },
        }
        if text_ids:
            body["study_text_ids"] = text_ids
        if reference_text_ids:
            body["reference_text_ids"] = reference_text_ids

        result = await client.post("/api/analysis/keyword/keyness", json_data=body)
        data = result.get("data", result)
        keywords = data.get("keywords", data.get("results", []))

        if not keywords:
            return "No significant keywords found."

        # Client-side filter by search_word/search_type
        if search_word:
            keywords = [
                kw for kw in keywords
                if _match_word(kw.get("keyword", kw.get("word", "")), search_word, search_type)
            ]
            if not keywords:
                return f'No keyness results matching "{search_word}" ({search_type}).'

        filter_note = f", filter={search_word!r} ({search_type})" if search_word else ""
        lines = [
            f"Keyness Analysis ({statistic}, mode={comparison_mode}{filter_note})\n",
            f"{'Rank':<6}{'Word':<25}{'Keyness':<12}{'StudyF':<10}{'RefF':<10}{'Effect':<10}",
            "-" * 73,
        ]
        for i, kw in enumerate(keywords[:limit], 1):
            word = kw.get("keyword", kw.get("word", "?"))
            keyness = kw.get("score", kw.get("keyness", 0))
            study_f = kw.get("study_freq", kw.get("frequency", 0))
            ref_f = kw.get("ref_freq", kw.get("reference_freq", 0))
            effect = kw.get("effect_size", 0)
            lines.append(
                f"{i:<6}{word:<25}{keyness:<12.2f}{study_f:<10}{ref_f:<10}{effect:<10.4f}"
            )
        total = len(keywords)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for i, kw in enumerate(keywords, 1):
                word = kw.get("keyword", kw.get("word", ""))
                csv_rows.append({
                    "Rank": i,
                    "Keyword": word,
                    "Direction": kw.get("direction", "+" if kw.get("score", 0) > 0 else "-"),
                    "Study Freq": kw.get("study_freq", kw.get("frequency", 0)),
                    "Study Norm (per M)": kw.get("study_norm", ""),
                    "Ref Freq": kw.get("ref_freq", kw.get("reference_freq", 0)),
                    "Ref Norm (per M)": kw.get("ref_norm", ""),
                    "Score": f"{kw.get('score', kw.get('keyness', 0)):.4f}",
                    "Effect Size": f"{kw.get('effect_size', 0):.4f}",
                    "Significance": kw.get("significance", ""),
                })
            saved = save_csv(csv_rows, save_path, f"keyness_{statistic}_{today()}.csv")
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and keywords:
            chart_items = [
                {"keyword": kw.get("keyword", kw.get("word", "")),
                 "score": abs(kw.get("score", kw.get("keyness", 0)))}
                for kw in keywords[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = f"Keyness ({statistic}) — Top {min(50, len(chart_items))}"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keyness_bar_{today()}.png", xlabel="Keyness Score")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keyness_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "keyword", "score", chart_path,
                    default_filename=f"keyness_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def ngram_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        n_values: list[int] | None = None,
        search_word: str = "",
        search_type: str = "contains",
        min_freq: int = 2,
        min_word_length: int = 1,
        nest: bool = False,
        pos_filter: list[str] | None = None,
        limit: int = 50,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze n-gram frequencies (word sequences) in a corpus.

        When to use: Phraseology, multi-word expressions, fixed phrases, or collocation
        patterns beyond pairwise collocation.

        Finds frequently occurring word combinations (bigrams, trigrams, etc.).

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            n_values: N-gram sizes to compute, e.g. [2, 3] for bigrams+trigrams (default: [2])
            search_word: Filter n-grams containing this word
            search_type: Match type: "exact", "contains", "starts", "ends"
            min_freq: Minimum frequency threshold (default: 2)
            min_word_length: Minimum word length within n-gram (default: 1)
            nest: Enable nested n-gram mode - includes sub-n-grams within larger ones (default: false)
            pos_filter: Filter by POS tags
            limit: Max results (default: 50)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        if n_values is None:
            n_values = [2]

        body: dict = {
            "corpus_id": corpus_id,
            "n_values": n_values,
            "min_freq": min_freq,
            "min_word_length": min_word_length,
            "nest_ngram": nest,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if search_word:
            body["search_config"] = {
                "searchValue": search_word,
                "searchType": search_type,
            }
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}

        result = await client.post("/api/analysis/ngram", json_data=body)
        data = result.get("data", result)
        results = data.get("results", [])

        if not results:
            return "No n-grams found matching the criteria."

        n_label = "/".join(str(n) for n in n_values)
        lines = [
            f"N-gram Analysis (n={n_label}, min_freq={min_freq})\n",
            f"{'Rank':<6}{'N-gram':<40}{'Freq':<10}{'N':<4}",
            "-" * 60,
        ]
        for i, r in enumerate(results[:limit], 1):
            ngram = r.get("ngram", "?")
            freq = r.get("frequency", r.get("freq", 0))
            n = r.get("n", "?")
            lines.append(f"{i:<6}{ngram:<40}{freq:<10}{n:<4}")
        total = len(results)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            total_freq = sum(r.get("frequency", r.get("freq", 0)) for r in results)
            for r in results:
                freq = r.get("frequency", r.get("freq", 0))
                pct = (freq / total_freq * 100) if total_freq else 0
                csv_rows.append({
                    "N-gram": r.get("ngram", ""),
                    "N": r.get("n", ""),
                    "Frequency": freq,
                    "Percentage": f"{pct:.4f}%",
                })
            saved = save_csv(csv_rows, save_path, f"ngram_results_{today()}.csv",
                             ["N-gram", "N", "Frequency", "Percentage"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and results:
            chart_items = [
                {"ngram": r.get("ngram", ""), "frequency": r.get("frequency", r.get("freq", 0))}
                for r in results[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            n_label = "/".join(str(n) for n in (n_values or [2]))
            chart_title = f"N-gram Analysis (n={n_label}) — Top {min(50, len(chart_items))}"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "ngram", "frequency", chart_title, chart_path,
                    default_filename=f"ngram_bar_{today()}.png", xlabel="Frequency")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "ngram", "frequency", chart_title, chart_path,
                    default_filename=f"ngram_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "ngram", "frequency", chart_path,
                    default_filename=f"ngram_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def keyness_resource_analysis(
        corpus_id: str,
        resource_id: str,
        text_ids: list[str] | None = None,
        statistic: str = "log_likelihood",
        comparison_mode: str = "word",
        min_freq: int = 3,
        p_threshold: float = 0.05,
        limit: int = 50,
        search_word: str = "",
        search_type: str = "contains",
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Compare corpus keywords against a built-in reference corpus (BNC, OANC, etc.).

        When to use: When you want to compare your corpus against a large, standard
        reference corpus like BNC (British National Corpus) or OANC (Open American
        National Corpus) instead of another user corpus.

        Use list_reference_corpora() first to find available resource_ids.

        Common resource IDs include:
        - "bnc_spoken", "bnc_written", "bnc_total" (British National Corpus)
        - "oanc_total" (Open American National Corpus)
        - And others returned by list_reference_corpora()

        Args:
            corpus_id: Study corpus ID
            resource_id: Reference corpus resource ID (from list_reference_corpora)
            text_ids: Study corpus text IDs (None = all)
            statistic: Statistical measure: "log_likelihood" (recommended),
                       "chi_squared", "log_ratio", "dice", "mi", "t_score",
                       "simple_keyness"
            comparison_mode: Compare by: "word", "lemma", or "domain" (USAS)
            min_freq: Minimum frequency in study corpus (default: 3)
            p_threshold: Significance threshold (default: 0.05)
            limit: Max results (default: 50)
            search_word: Filter results by word pattern (empty = no filter)
            search_type: Match type: "exact", "contains" (default), "starts", "ends",
                "regex", "wordlist" (comma/newline-separated list)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        body: dict = {
            "study_corpus_id": corpus_id,
            "resource_id": resource_id,
            "statistic": statistic,
            "comparison_mode": comparison_mode,
            "config": {
                "minFreqStudy": min_freq,
                "pValue": p_threshold,
            },
        }
        if text_ids:
            body["study_text_ids"] = text_ids

        result = await client.post(
            "/api/analysis/keyword/keyness-resource", json_data=body
        )
        data = result.get("data", result)
        keywords = data.get("keywords", data.get("results", []))

        if not keywords:
            return "No significant keywords found."

        # Client-side filter by search_word/search_type
        if search_word:
            keywords = [
                kw for kw in keywords
                if _match_word(kw.get("keyword", kw.get("word", "")), search_word, search_type)
            ]
            if not keywords:
                return f'No keyness results matching "{search_word}" ({search_type}).'

        filter_note = f", filter={search_word!r} ({search_type})" if search_word else ""
        lines = [
            f"Keyness vs Reference ({statistic}, resource={resource_id}{filter_note})\n",
            f"{'Rank':<6}{'Word':<25}{'Keyness':<12}{'StudyF':<10}{'RefF':<10}{'Effect':<10}",
            "-" * 73,
        ]
        for i, kw in enumerate(keywords[:limit], 1):
            word = kw.get("keyword", kw.get("word", "?"))
            keyness = kw.get("score", kw.get("keyness", 0))
            study_f = kw.get("study_freq", kw.get("frequency", 0))
            ref_f = kw.get("ref_freq", kw.get("reference_freq", 0))
            effect = kw.get("effect_size", 0)
            lines.append(
                f"{i:<6}{word:<25}{keyness:<12.2f}{study_f:<10}{ref_f:<10}{effect:<10.4f}"
            )
        total = len(keywords)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for i, kw in enumerate(keywords, 1):
                word = kw.get("keyword", kw.get("word", ""))
                csv_rows.append({
                    "Rank": i,
                    "Keyword": word,
                    "Direction": kw.get("direction", "+" if kw.get("score", 0) > 0 else "-"),
                    "Study Freq": kw.get("study_freq", kw.get("frequency", 0)),
                    "Study Norm (per M)": kw.get("study_norm", ""),
                    "Ref Freq": kw.get("ref_freq", kw.get("reference_freq", 0)),
                    "Ref Norm (per M)": kw.get("ref_norm", ""),
                    "Score": f"{kw.get('score', kw.get('keyness', 0)):.4f}",
                    "Effect Size": f"{kw.get('effect_size', 0):.4f}",
                    "Significance": kw.get("significance", ""),
                })
            saved = save_csv(csv_rows, save_path, f"keyness_{statistic}_{today()}.csv")
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and keywords:
            chart_items = [
                {"keyword": kw.get("keyword", kw.get("word", "")),
                 "score": abs(kw.get("score", kw.get("keyness", 0)))}
                for kw in keywords[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = f"Keyness vs {resource_id} ({statistic})"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keyness_resource_bar_{today()}.png", xlabel="Keyness Score")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "keyword", "score", chart_title, chart_path,
                    default_filename=f"keyness_resource_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "keyword", "score", chart_path,
                    default_filename=f"keyness_resource_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output
