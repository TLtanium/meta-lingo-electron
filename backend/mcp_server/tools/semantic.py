"""
Semantic analysis tools for Meta-Lingo MCP server.
Tools: semantic_domain_analysis, get_domain_words, metaphor_analysis, sentiment_analysis
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import save_bar_chart, save_pie_chart, save_wordcloud


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def semantic_domain_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        result_mode: str = "domain",
        pos_filter: list[str] | None = None,
        search_word: str = "",
        search_type: str = "contains",
        search_target: str = "word",
        min_freq: int = 0,
        max_freq: int = 0,
        limit: int = 50,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze semantic domain distribution using UCREL USAS taxonomy.

        When to use: Semantic field / domain profiling (USAS tags). Requires USAS
        annotation on texts; ensure upload processing has finished.

        USAS classifies words into semantic domains (e.g., A1.1=General actions,
        S1.1=Social relations, E2=Emotion). This reveals the semantic composition
        of texts.

        Use get_usas_categories() to see all major domain categories.
        Use get_domain_words() to drill into a specific domain.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            result_mode: "domain" for domain-level stats, "word" for word-level
            pos_filter: Filter by POS tags, e.g. ["NOUN", "VERB"]
            search_word: Filter by word/lemma pattern (e.g. "love", "^dis.*")
            search_type: Match type: "exact", "contains", "starts", "ends", "regex"
            search_target: Search in: "word" (surface form) or "lemma"
            min_freq: Minimum frequency threshold (default: 0)
            max_freq: Maximum frequency (0 = no limit)
            limit: Max results (default: 50)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "result_mode": result_mode,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}
        if search_word:
            body["search_config"] = {
                "searchValue": search_word,
                "searchType": search_type,
                "searchTarget": search_target,
            }
        if min_freq > 0:
            body["min_freq"] = min_freq
        if max_freq > 0:
            body["max_freq"] = max_freq

        result = await client.post("/api/analysis/semantic-domains", json_data=body)
        data = result.get("data", result)
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
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            if result_mode == "domain":
                for i, r in enumerate(results, 1):
                    csv_rows.append({
                        "Rank": i,
                        "Domain": r.get("domain", r.get("code", "")),
                        "Domain Name": r.get("domain_name", r.get("name", "")),
                        "Category": r.get("category", ""),
                        "Frequency": r.get("frequency", r.get("count", 0)),
                        "Percentage": f"{r.get('percentage', 0):.4f}",
                    })
                cols = ["Rank", "Domain", "Domain Name", "Category", "Frequency", "Percentage"]
            else:
                for i, r in enumerate(results, 1):
                    csv_rows.append({
                        "Rank": i,
                        "Word": r.get("word", ""),
                        "Domain": r.get("usas_tag", r.get("tag", "")),
                        "Domain Name": r.get("domain_name", ""),
                        "POS": r.get("pos", ""),
                        "Frequency": r.get("frequency", r.get("count", 0)),
                        "Percentage": f"{r.get('percentage', 0):.4f}",
                    })
                cols = ["Rank", "Word", "Domain", "Domain Name", "POS", "Frequency", "Percentage"]
            saved = save_csv(csv_rows, save_path,
                             f"semantic_analysis_{result_mode}_{today()}.csv", cols)
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and results and result_mode == "domain":
            chart_items = [
                {"domain": f"{r.get('domain', r.get('code', ''))} {r.get('domain_name', r.get('name', ''))}",
                 "frequency": r.get("frequency", r.get("count", 0))}
                for r in results[:50]
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = "USAS Semantic Domain Distribution"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "domain", "frequency", chart_title, chart_path,
                    default_filename=f"semantic_domain_bar_{today()}.png", xlabel="Frequency")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "domain", "frequency", chart_title, chart_path,
                    default_filename=f"semantic_domain_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "domain", "frequency", chart_path,
                    default_filename=f"semantic_domain_wordcloud_{today()}.png",
                    title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def get_domain_words(
        corpus_id: str,
        domain: str,
        text_ids: list[str] | None = None,
        lowercase: bool = True,
    ) -> str:
        """Get all words tagged with a specific USAS semantic domain code.

        When to use: After semantic_domain_analysis(), to drill into which specific
        words belong to a domain (e.g., all words tagged as "E2" Emotion,
        or "A1.1.1" General actions).

        Use get_usas_categories() to see available domain codes.

        Args:
            corpus_id: Corpus ID to analyze
            domain: USAS domain code (e.g., "A1.1", "E2", "S1.1.1")
            text_ids: Specific text IDs (None = all)
            lowercase: Merge case variants (default: true)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "domain": domain,
            "lowercase": lowercase,
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post(
            "/api/analysis/semantic-domains/words", json_data=body
        )
        data = result.get("data", result)
        words = data.get("words", data.get("results", []))

        if not words:
            return f'No words found for domain "{domain}".'

        domain_name = data.get("domain_name", domain)
        lines = [
            f'Words in USAS domain "{domain}" ({domain_name})\n',
            f"{'Rank':<6}{'Word':<25}{'Freq':<10}{'POS':<8}",
            "-" * 49,
        ]
        for i, w in enumerate(words, 1):
            if isinstance(w, dict):
                word = w.get("word", "?")
                freq = w.get("frequency", w.get("count", 0))
                pos = w.get("pos", "-")
                lines.append(f"{i:<6}{word:<25}{freq:<10}{pos:<8}")
            else:
                lines.append(f"{i:<6}{w}")
        return "\n".join(lines)

    @mcp.tool()
    async def metaphor_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        result_mode: str = "word",
        pos_filter: list[str] | None = None,
        search_word: str = "",
        search_type: str = "contains",
        search_target: str = "word",
        min_freq: int = 0,
        max_freq: int = 0,
        include_implicit: bool = False,
        limit: int = 50,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze metaphor usage in the corpus using MIPVU methodology.

        When to use: Metaphor density and distribution of metaphor-related words (MRWs)
        via the MIPVU pipeline. English-focused; ensure MIPVU annotation has completed.

        MIPVU classifies each word token into one of these types:
          INDIRECT  — word used metaphorically (contextual ≠ basic meaning); majority of MRWs
          DIRECT    — word used literally but introduces an incongruous source domain (simile target)
          MFLAG     — explicit metaphor signal (like / as / as if / imagine / resembles / etc.)
          IMPLICIT  — no source-domain word; references a prior MRW via cohesion (substitution/ellipsis)
          literal   — non-metaphorical (is_metaphor=False); included so word frequency is visible

        Source types in results:
          filter    = excluded by word-form filter (NOT metaphorical)
          rule      = MIPVU SpaCy rule-based detection
          clause    = metalingo-indirect-metaphor, content word (VERB/NOUN/ADJ/…) — green in UI
          finetuned = metalingo-indirect-metaphor, function word (IN/DT/RB/RP) — orange in UI
          direct    = metalingo-direct-metaphor model output
          mflag     = MFlag metaphor signal word
          (hitz     = legacy label in old annotations, treated same as clause)

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all texts in corpus)
            result_mode: "word" (default) for word-level ranked table; "source" for by-source summary
            pos_filter: Filter by Universal POS, e.g. ["NOUN", "VERB", "ADJ", "ADV", "ADP", "DET"]
            search_word: Filter by word/lemma pattern
            search_type: Match type: "exact" | "contains" | "starts" | "ends" | "regex"
            search_target: Search in: "word" (wordform) or "lemma"
            min_freq: Minimum frequency (default 0 = no minimum)
            max_freq: Maximum frequency (0 = no limit)
            include_implicit: When True, implicit metaphors are resolved to their antecedent MRW,
                              and an implicit_ref_count (+N) is added to that antecedent's frequency
                              display. Default False (implicit metaphors shown as separate rows).
            limit: Max rows to return (default 50)
            save_path: Save results as CSV. Path, directory, or "" for ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "result_mode": result_mode,
            "include_implicit": include_implicit,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}
        if search_word:
            body["search_config"] = {
                "searchValue": search_word,
                "searchType": search_type,
                "searchTarget": search_target,
            }
        if min_freq > 0:
            body["min_freq"] = min_freq
        if max_freq > 0:
            body["max_freq"] = max_freq

        result = await client.post("/api/analysis/metaphor-analysis", json_data=body)
        data = result.get("data", result)
        results = data.get("results", [])
        stats = data.get("statistics", {})

        # ── statistics ───────────────────────────────────────────────────────────
        total_tokens   = stats.get("total_tokens", 0)
        metaphor_count = stats.get("metaphor_tokens", 0)
        literal_count  = stats.get("literal_tokens", 0)
        metaphor_rate  = stats.get("metaphor_rate", 0.0)
        indirect_count = stats.get("indirect_metaphor_tokens", 0)
        direct_count   = stats.get("direct_metaphor_tokens", 0)
        mflag_count    = stats.get("mflag_tokens", 0)
        implicit_count = stats.get("implicit_metaphor_tokens", 0)

        # Fallback from result rows if statistics field empty
        if total_tokens == 0 and results:
            total_tokens   = sum(r.get("frequency", 0) for r in results)
            metaphor_count = sum(r.get("frequency", 0) for r in results if r.get("is_metaphor"))
            literal_count  = total_tokens - metaphor_count
            metaphor_rate  = metaphor_count / total_tokens if total_tokens else 0.0

        rate_pct = metaphor_rate * 100 if metaphor_rate <= 1.0 else metaphor_rate

        # ── header ───────────────────────────────────────────────────────────────
        lines = [
            "=== MIPVU Metaphor Analysis ===\n",
            f"Total tokens : {total_tokens:,}",
            f"All MRWs     : {metaphor_count:,}  ({rate_pct:.1f}%)",
            f"  INDIRECT   : {indirect_count:,}  — word used metaphorically (contextual ≠ basic meaning)",
            f"  DIRECT     : {direct_count:,}  — word used literally; introduces source domain",
            f"  MFLAG      : {mflag_count:,}  — explicit comparison signal (like/as/as if/…)",
            f"  IMPLICIT   : {implicit_count:,}  — cohesive back-reference to a prior MRW",
            f"Literal      : {literal_count:,}  — non-metaphorical tokens",
        ]
        if include_implicit:
            lines.append("  (implicit resolution ON — antecedent +N counts shown in Freq column)")
        lines.append("")

        # ── source legend ────────────────────────────────────────────────────────
        lines.append(
            "Sources (all from metalingo-indirect-metaphor): "
            "filter=excluded (non-metaphorical) | rule=MIPVU rule-based | "
            "finetuned=DeBERTa function word (IN/DT/RB/RP) | "
            "clause=DeBERTa content word (VERB/NOUN/ADJ/…)"
        )
        lines.append("")

        # ── result table ─────────────────────────────────────────────────────────
        if results:
            if result_mode == "word":
                # Type label helper
                def _mtype(r: dict) -> str:
                    if r.get("is_mflag"):
                        return "MFLAG"
                    if r.get("is_direct_metaphor"):
                        return "DIRECT"
                    if r.get("is_implicit_metaphor"):
                        return "IMPLICIT"
                    if r.get("is_metaphor"):
                        return "INDIRECT"
                    return "literal"

                hdr = f"{'#':<5}{'Word':<22}{'POS':<7}{'Type':<10}{'Freq':<12}{'Source':<12}{'%'}"
                lines.append(hdr)
                lines.append("-" * 72)
                for i, r in enumerate(results[:limit], 1):
                    word   = r.get("word", "?")
                    pos    = r.get("pos", "-")
                    freq   = r.get("frequency", 0)
                    source = r.get("source", "-")
                    pct    = r.get("percentage", 0.0)
                    mtype  = _mtype(r)
                    ref    = r.get("implicit_ref_count", 0)
                    # Show implicit back-ref count next to frequency
                    freq_str = f"{freq}" + (f" (+{ref})" if ref > 0 else "")
                    lines.append(
                        f"{i:<5}{word:<22}{pos:<7}{mtype:<10}{freq_str:<12}{source:<12}{pct:.2f}%"
                    )
            else:
                # source-grouping mode
                lines.append(f"{'Source':<12}{'Name':<35}{'Count':<10}{'%'}")
                lines.append("-" * 60)
                for r in results:
                    src   = r.get("source", "?")
                    name  = r.get("name", src)
                    count = r.get("count", 0)
                    pct   = r.get("percentage", 0.0)
                    lines.append(f"{src:<12}{name:<35}{count:<10}{pct:.1f}%")

        total_rows = len(results)
        if total_rows > limit:
            lines.append(f"\n… showing top {limit} of {total_rows} rows")

        output = "\n".join(lines)

        # ── CSV export ────────────────────────────────────────────────────────────
        if save_path is not None and results:
            csv_rows = []
            for r in results:
                is_m    = r.get("is_metaphor", False)
                is_dir  = r.get("is_direct_metaphor", False)
                is_flag = r.get("is_mflag", False)
                is_impl = r.get("is_implicit_metaphor", False)
                if is_flag:
                    mtype = "MFLAG"
                elif is_dir:
                    mtype = "DIRECT"
                elif is_impl:
                    mtype = "IMPLICIT"
                elif is_m:
                    mtype = "INDIRECT"
                else:
                    mtype = "literal"
                csv_rows.append({
                    "Word": r.get("word", ""),
                    "Lemma": r.get("lemma", ""),
                    "POS": r.get("pos", ""),
                    "Type": mtype,
                    "Frequency": r.get("frequency", 0),
                    "Implicit_Ref_Count": r.get("implicit_ref_count", 0),
                    "Percentage": f"{r.get('percentage', 0):.4f}",
                    "Source": r.get("source", ""),
                })
            saved = save_csv(
                csv_rows, save_path, f"metaphor_analysis_{today()}.csv",
                ["Word", "Lemma", "POS", "Type", "Frequency",
                 "Implicit_Ref_Count", "Percentage", "Source"],
            )
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        # ── chart export ──────────────────────────────────────────────────────────
        if chart_type and results and result_mode == "word":
            chart_items = [
                {"word": r.get("word", ""),
                 "frequency": r.get("frequency", 0)}
                for r in results[:50]
                if r.get("is_metaphor") or r.get("is_direct_metaphor")
                or r.get("is_mflag") or r.get("is_implicit_metaphor")
            ]
            chart_path = chart_path if chart_path is not None else ""
            chart_title = "MIPVU MRW Frequency"
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "word", "frequency", chart_title, chart_path,
                    default_filename=f"metaphor_bar_{today()}.png", xlabel="Frequency")
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "word", "frequency", chart_title, chart_path,
                    default_filename=f"metaphor_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "word", "frequency", chart_path,
                    default_filename=f"metaphor_wordcloud_{today()}.png", title=chart_title)
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def sentiment_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        analysis_mode: str = "polarity",
        search_word: str = "",
        search_type: str = "contains",
        search_target: str = "word",
        pos_filter: list[str] | None = None,
        limit: int = 50,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze sentiment/emotion in corpus texts using the NRC Emotion Lexicon.

        When to use: Emotion/polarity lexicon-based profiling (NRC) over annotated tokens.

        Two modes:
        - "polarity": Classifies words as positive, negative, or neutral
        - "dimension": Classifies words into 8 emotion dimensions
          (anger, anticipation, disgust, fear, joy, sadness, surprise, trust)

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            analysis_mode: "polarity" or "dimension"
            search_word: Filter by word pattern
            search_type: Match type: "exact", "contains", "starts", "ends", "regex"
            search_target: "word" or "lemma"
            pos_filter: Filter by POS tags
            limit: Max results (default: 50)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "analysis_mode": analysis_mode,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if search_word:
            body["search_config"] = {
                "searchValue": search_word,
                "searchType": search_type,
                "searchTarget": search_target,
            }
        if pos_filter:
            body["pos_filter"] = {"selectedPOS": pos_filter, "keepMode": True}

        result = await client.post("/api/analysis/sentiment", json_data=body)
        data = result.get("data", result)
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
        output = "\n".join(lines)

        if save_path is not None and results:
            csv_rows = []
            if analysis_mode == "polarity":
                for r in results:
                    csv_rows.append({
                        "Word": r.get("word", ""),
                        "Total": r.get("total", r.get("frequency", r.get("count", 0))),
                        "Percentage": f"{r.get('percentage', 0):.4f}",
                        "Positive": r.get("positive", 0),
                        "Negative": r.get("negative", 0),
                        "Neutral": r.get("neutral", 0),
                    })
            else:
                for r in results:
                    row = {
                        "Word": r.get("word", ""),
                        "Total": r.get("total", r.get("frequency", r.get("count", 0))),
                        "Percentage": f"{r.get('percentage', 0):.4f}",
                    }
                    for dim in ["anger", "anticipation", "disgust", "fear",
                                "joy", "sadness", "surprise", "trust"]:
                        row[dim.capitalize()] = r.get(dim, 0)
                    csv_rows.append(row)
            mode_suffix = f"_{analysis_mode}"
            saved = save_csv(csv_rows, save_path, f"sentiment{mode_suffix}_{today()}.csv")
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and results:
            chart_path = chart_path if chart_path is not None else ""
            if analysis_mode == "polarity":
                # Summarize by polarity category
                summary_map: dict = {}
                for r in results:
                    pol = r.get("polarity", r.get("sentiment", "neutral"))
                    summary_map[pol] = summary_map.get(pol, 0) + r.get("frequency", r.get("count", 0))
                chart_items = [{"polarity": k, "count": v} for k, v in sorted(summary_map.items(), key=lambda x: -x[1])]
                chart_title = "NRC Sentiment Polarity Distribution"
                if chart_type in ("bar", "pie"):
                    if chart_type == "bar":
                        saved_chart = save_bar_chart(
                            chart_items, "polarity", "count", chart_title, chart_path,
                            default_filename=f"sentiment_bar_{today()}.png", xlabel="Word Count")
                    else:
                        saved_chart = save_pie_chart(
                            chart_items, "polarity", "count", chart_title, chart_path,
                            default_filename=f"sentiment_pie_{today()}.png")
                elif chart_type == "wordcloud":
                    wc_items = [{"word": r.get("word", ""), "freq": r.get("frequency", r.get("count", 0))} for r in results[:200]]
                    saved_chart = save_wordcloud(
                        wc_items, "word", "freq", chart_path,
                        default_filename=f"sentiment_wordcloud_{today()}.png", title=chart_title)
                else:
                    saved_chart = ""
            else:
                # dimension mode: summarize by emotion
                emo_map: dict = {}
                for r in results:
                    for dim in ["anger", "anticipation", "disgust", "fear", "joy", "sadness", "surprise", "trust"]:
                        emo_map[dim] = emo_map.get(dim, 0) + r.get(dim, 0)
                chart_items = [{"emotion": k, "count": v} for k, v in sorted(emo_map.items(), key=lambda x: -x[1])]
                chart_title = "NRC Emotion Dimension Distribution"
                if chart_type == "bar":
                    saved_chart = save_bar_chart(
                        chart_items, "emotion", "count", chart_title, chart_path,
                        default_filename=f"sentiment_dim_bar_{today()}.png", xlabel="Count")
                elif chart_type == "pie":
                    saved_chart = save_pie_chart(
                        chart_items, "emotion", "count", chart_title, chart_path,
                        default_filename=f"sentiment_dim_pie_{today()}.png")
                elif chart_type == "wordcloud":
                    wc_items = [{"word": r.get("word", ""), "freq": r.get("frequency", r.get("count", 0))} for r in results[:200]]
                    saved_chart = save_wordcloud(
                        wc_items, "word", "freq", chart_path,
                        default_filename=f"sentiment_dim_wordcloud_{today()}.png", title=chart_title)
                else:
                    saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output
