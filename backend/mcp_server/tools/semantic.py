"""
Semantic analysis tools for Meta-Lingo MCP server.
Tools: semantic_domain_analysis, metaphor_analysis, sentiment_analysis
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def semantic_domain_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        result_mode: str = "domain",
        pos_filter: list[str] | None = None,
        limit: int = 50,
    ) -> str:
        """Analyze semantic domain distribution using UCREL USAS taxonomy.

        USAS (UCREL Semantic Analysis System) classifies every word into one of
        232 semantic domains (e.g., A1.1 "General", S1.1 "Social actions",
        E2 "Liking"). This reveals the semantic composition of texts.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            result_mode: "domain" for domain-level stats, "word" for word-level
            pos_filter: Filter by POS tags
            limit: Max results (default: 50)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "result_mode": result_mode,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos_filter:
            body["pos_filter"] = {"enabled": True, "mode": "keep", "tags": pos_filter}

        result = await client.post("/api/analysis/semantic-domains", json_data=body)
        data = result.get("data", {})
        results = data.get("results", [])

        if not results:
            return "No semantic domain data found."

        if result_mode == "domain":
            lines = [
                "USAS Semantic Domain Distribution\n",
                f"{'Rank':<6}{'Domain':<10}{'Name':<35}{'Freq':<10}{'%':<8}",
                "-" * 69,
            ]
            for i, r in enumerate(results[:limit], 1):
                code = r.get("domain", r.get("code", "?"))
                name = r.get("domain_name", r.get("name", ""))
                freq = r.get("frequency", r.get("count", 0))
                pct = r.get("percentage", 0)
                lines.append(f"{i:<6}{code:<10}{name:<35}{freq:<10}{pct:<8.2f}")
        else:
            lines = [
                "USAS Semantic Tags by Word\n",
                f"{'Rank':<6}{'Word':<25}{'Tag':<10}{'Domain':<30}{'Freq':<8}",
                "-" * 79,
            ]
            for i, r in enumerate(results[:limit], 1):
                word = r.get("word", "?")
                tag = r.get("usas_tag", r.get("tag", "?"))
                domain = r.get("domain_name", "")
                freq = r.get("frequency", r.get("count", 0))
                lines.append(f"{i:<6}{word:<25}{tag:<10}{domain:<30}{freq:<8}")

        total = len(results)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        return "\n".join(lines)

    @mcp.tool()
    async def metaphor_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        result_mode: str = "word",
        limit: int = 50,
    ) -> str:
        """Analyze metaphor usage in the corpus using MIPVU methodology.

        MIPVU (Metaphor Identification Procedure VU) identifies words used
        metaphorically by comparing contextual meaning with basic meaning.
        Uses a DeBERTa model fine-tuned on VUAMC metaphor corpus.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            result_mode: "word" for word-level, "source" for by source type
            limit: Max results (default: 50)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "result_mode": result_mode,
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post("/api/analysis/metaphor-analysis", json_data=body)
        data = result.get("data", {})
        results = data.get("results", [])
        stats = data.get("statistics", {})

        total_words = stats.get("total_words", 0)
        metaphor_count = stats.get("metaphor_count", 0)
        metaphor_rate = stats.get("metaphor_rate", 0)

        lines = [
            "MIPVU Metaphor Analysis\n",
            f"Total words analyzed: {total_words}",
            f"Metaphorical words: {metaphor_count} ({metaphor_rate:.1f}%)\n",
        ]

        if results:
            if result_mode == "word":
                lines.append(f"{'Rank':<6}{'Word':<25}{'POS':<8}{'Freq':<8}{'Source':<12}")
                lines.append("-" * 59)
                for i, r in enumerate(results[:limit], 1):
                    word = r.get("word", "?")
                    pos = r.get("pos", "-")
                    freq = r.get("frequency", r.get("count", 0))
                    source = r.get("source", "-")
                    lines.append(f"{i:<6}{word:<25}{pos:<8}{freq:<8}{source:<12}")
            else:
                for r in results:
                    source = r.get("source", "?")
                    count = r.get("count", 0)
                    lines.append(f"  {source}: {count} words")

        total = len(results)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        return "\n".join(lines)

    @mcp.tool()
    async def sentiment_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        analysis_mode: str = "polarity",
        search_word: str = "",
        search_target: str = "word",
        pos_filter: list[str] | None = None,
        limit: int = 50,
    ) -> str:
        """Analyze sentiment/emotion in corpus texts using the NRC Emotion Lexicon.

        Two modes:
        - "polarity": Classifies words as positive, negative, or neutral
        - "dimension": Classifies words into 8 emotion dimensions
          (anger, anticipation, disgust, fear, joy, sadness, surprise, trust)

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            analysis_mode: "polarity" or "dimension"
            search_word: Filter by word pattern
            search_target: "word" or "lemma"
            pos_filter: Filter by POS tags
            limit: Max results (default: 50)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "analysis_mode": analysis_mode,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if search_word:
            body["search_config"] = {
                "search_word": search_word,
                "search_target": search_target,
            }
        if pos_filter:
            body["pos_filter"] = {"enabled": True, "mode": "keep", "tags": pos_filter}

        result = await client.post("/api/analysis/sentiment", json_data=body)
        data = result.get("data", {})
        results = data.get("results", [])
        summary = data.get("summary", {})

        lines = [f"NRC Sentiment Analysis (mode={analysis_mode})\n"]

        if summary:
            lines.append("Summary:")
            for label, count in summary.items():
                lines.append(f"  {label}: {count}")
            lines.append("")

        if results:
            if analysis_mode == "polarity":
                lines.append(f"{'Rank':<6}{'Word':<25}{'Polarity':<12}{'Freq':<8}")
                lines.append("-" * 51)
                for i, r in enumerate(results[:limit], 1):
                    word = r.get("word", "?")
                    pol = r.get("polarity", r.get("sentiment", "-"))
                    freq = r.get("frequency", r.get("count", 0))
                    lines.append(f"{i:<6}{word:<25}{pol:<12}{freq:<8}")
            else:
                lines.append(f"{'Rank':<6}{'Word':<25}{'Emotions':<30}{'Freq':<8}")
                lines.append("-" * 69)
                for i, r in enumerate(results[:limit], 1):
                    word = r.get("word", "?")
                    emotions = r.get("emotions", r.get("dimensions", []))
                    if isinstance(emotions, list):
                        emo_str = ", ".join(emotions[:3])
                    else:
                        emo_str = str(emotions)
                    freq = r.get("frequency", r.get("count", 0))
                    lines.append(f"{i:<6}{word:<25}{emo_str:<30}{freq:<8}")

        total = len(results)
        if total > limit:
            lines.append(f"\n... showing top {limit} of {total}")
        return "\n".join(lines)
