"""
Lexical analysis tools for Meta-Lingo MCP server.
Tools: word_frequency, keyword_extraction, keyness_analysis, ngram_analysis
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


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
    ) -> str:
        """Analyze word frequencies in a corpus.

        Returns a frequency table with word, frequency, percentage, and POS.
        Use this for basic vocabulary profiling and lexical analysis.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs to analyze (None = all texts)
            search_word: Filter by word pattern (empty = all words)
            search_type: How to match search_word: "exact", "contains", "starts", "ends", "regex"
            search_target: What to search: "word" (word form) or "lemma"
            pos_filter: Filter by POS tags, e.g. ["NOUN", "VERB", "ADJ"]
            min_freq: Minimum frequency threshold (default: 1)
            max_freq: Maximum frequency (0 = no limit)
            lowercase: Merge case variants (default: true)
            remove_stopwords: Remove common stopwords (default: false)
            limit: Max results to return (default: 50)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "min_freq": min_freq,
            "max_freq": max_freq,
            "lowercase": lowercase,
            "remove_stopwords": remove_stopwords,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if search_word:
            body["search_config"] = {
                "search_word": search_word,
                "search_type": search_type,
                "search_target": search_target,
            }
        if pos_filter:
            body["pos_filter"] = {"enabled": True, "mode": "keep", "tags": pos_filter}

        result = await client.post("/api/analysis/word-frequency", json_data=body)
        data = result.get("data", {})
        results = data.get("results", [])
        total_tokens = data.get("total_tokens", 0)
        total_types = data.get("total_types", 0)

        header = (
            f"Word Frequency Analysis\n"
            f"Total tokens: {total_tokens}, Total types: {total_types}\n\n"
        )
        return header + _format_freq_results(results, limit)

    @mcp.tool()
    async def keyword_extraction(
        corpus_id: str,
        text_ids: list[str] | None = None,
        algorithm: str = "tfidf",
        top_n: int = 30,
        pos_filter: list[str] | None = None,
    ) -> str:
        """Extract keywords from corpus texts using NLP algorithms.

        Identifies the most important/distinctive words in the texts.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            algorithm: Algorithm to use: "tfidf", "textrank", "yake", "rake"
            top_n: Number of keywords to extract (default: 30)
            pos_filter: Filter by POS tags, e.g. ["NOUN", "VERB"]
        """
        body: dict = {
            "corpus_id": corpus_id,
            "algorithm": algorithm,
            "top_n": top_n,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos_filter:
            body["pos_filter"] = {"enabled": True, "mode": "keep", "tags": pos_filter}

        result = await client.post("/api/analysis/keyword/single-doc", json_data=body)
        data = result.get("data", {})
        keywords = data.get("keywords", [])

        if not keywords:
            return "No keywords extracted."

        lines = [f"Keyword Extraction ({algorithm.upper()}, top {top_n})\n"]
        lines.append(f"{'Rank':<6}{'Keyword':<30}{'Score':<12}")
        lines.append("-" * 48)
        for i, kw in enumerate(keywords[:top_n], 1):
            word = kw.get("word", kw.get("keyword", "?"))
            score = kw.get("score", 0)
            lines.append(f"{i:<6}{word:<30}{score:<12.4f}")
        return "\n".join(lines)

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
    ) -> str:
        """Compare keywords between a study corpus and a reference corpus.

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
        """
        body: dict = {
            "corpus_id": corpus_id,
            "reference_corpus_id": reference_corpus_id,
            "statistic": statistic,
            "comparison_mode": comparison_mode,
            "min_freq": min_freq,
            "p_threshold": p_threshold,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if reference_text_ids:
            body["reference_text_ids"] = reference_text_ids

        result = await client.post("/api/analysis/keyword/keyness", json_data=body)
        data = result.get("data", {})
        keywords = data.get("keywords", [])

        if not keywords:
            return "No significant keywords found."

        lines = [
            f"Keyness Analysis ({statistic}, mode={comparison_mode})\n",
            f"{'Rank':<6}{'Word':<25}{'Keyness':<12}{'StudyF':<10}{'RefF':<10}{'Effect':<10}",
            "-" * 73,
        ]
        for i, kw in enumerate(keywords[:limit], 1):
            word = kw.get("word", "?")
            keyness = kw.get("keyness", kw.get("score", 0))
            study_f = kw.get("study_freq", kw.get("frequency", 0))
            ref_f = kw.get("reference_freq", 0)
            effect = kw.get("effect_size", 0)
            lines.append(
                f"{i:<6}{word:<25}{keyness:<12.2f}{study_f:<10}{ref_f:<10}{effect:<10.4f}"
            )
        total = len(keywords)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        return "\n".join(lines)

    @mcp.tool()
    async def ngram_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        n_values: list[int] | None = None,
        search_word: str = "",
        search_type: str = "contains",
        min_freq: int = 2,
        pos_filter: list[str] | None = None,
        limit: int = 50,
    ) -> str:
        """Analyze n-gram frequencies (word sequences) in a corpus.

        Finds frequently occurring word combinations (bigrams, trigrams, etc.).

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            n_values: N-gram sizes to compute, e.g. [2, 3] for bigrams+trigrams (default: [2])
            search_word: Filter n-grams containing this word
            search_type: Match type: "exact", "contains", "starts", "ends"
            min_freq: Minimum frequency threshold (default: 2)
            pos_filter: Filter by POS tags
            limit: Max results (default: 50)
        """
        if n_values is None:
            n_values = [2]

        body: dict = {
            "corpus_id": corpus_id,
            "n_values": n_values,
            "min_freq": min_freq,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if search_word:
            body["search_config"] = {
                "search_word": search_word,
                "search_type": search_type,
            }
        if pos_filter:
            body["pos_filter"] = {"enabled": True, "mode": "keep", "tags": pos_filter}

        result = await client.post("/api/analysis/ngram", json_data=body)
        data = result.get("data", {})
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
        return "\n".join(lines)
