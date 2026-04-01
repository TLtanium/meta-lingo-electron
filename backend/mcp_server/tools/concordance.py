"""
Concordance and collocation tools for Meta-Lingo MCP server.
Tools: concordance_search, get_extended_context, collocation_analysis, word_sketch
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import (
    save_bar_chart, save_pie_chart, save_wordcloud,
    save_network_chart, save_dispersion_chart, save_collocation_network,
)


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def concordance_search(
        corpus_id: str,
        query: str,
        text_ids: list[str] | None = None,
        search_mode: str = "exact",
        search_target: str = "word",
        ignore_case: bool = True,
        context_size: int = 5,
        sort_by: Optional[str] = None,
        sort_levels: Optional[list[str]] = None,
        sort_descending: bool = False,
        pos_filter: Optional[list[str]] = None,
        max_results: Optional[int] = None,
        limit: int = 30,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Search for words/phrases in context (KWIC - Key Word In Context).

        When to use: Qualitative inspection of usage, concordance lines, or CQL-based
        pattern search. First-line tool for examples and discourse patterns.

        Shows each occurrence with surrounding context, essential for
        understanding how words are used in actual texts.

        Search modes:
        - "exact": exact word match
        - "contains": word contains the query
        - "starts": word starts with query
        - "ends": word ends with query
        - "phrase": exact phrase match
        - "wordlist": multiple words (one per line in query)
        - "cql": Corpus Query Language for complex pattern queries

        CQL Quick Reference (use with search_mode="cql"):
          [word="run"]                     - exact word match
          [lemma="run"]                    - any form (runs, running, ran)
          [pos="NOUN"]                     - any noun
          [pos="ADJ"][pos="NOUN"]          - adjective followed by noun
          [word="the" & pos="DET"]         - "the" as determiner (AND)
          [pos="NOUN" | pos="VERB"]        - noun or verb (OR)
          [!pos="PUNCT"]                   - not punctuation (NOT)
          [pos="VERB"][]{0,3}[pos="NOUN"]  - verb, then 0-3 any words, then noun
          []                               - any single token
          []{2,4}                           - 2 to 4 any tokens
          [dep="nsubj"]                    - subject dependency relation
          [usas="A1.1"]                    - USAS semantic domain A1.1
          [headword="make"]               - token whose head word is "make"
          [headpos="VERB"]                 - token whose head is a VERB
          <s> [pos="DET"] </s>            - within sentence boundary

          Supported attributes: word, lemma, pos (Universal), tag (Penn),
            dep, usas, nrc, headword, headlemma, headpos, headdep
          Operators: & (AND), | (OR), ! (NOT)

          TIP: Use validate_cql(query) first to check syntax before searching.

        Sorting options:
        - sort_by: primary sort criterion
          "left_context" / "right_context" - alphabetical by context
          "position" - by position in text
          "frequency" - by frequency of keyword
          "random" - random order
        - sort_levels: multi-level context sorting keys
          e.g. ["1L", "2L"] = sort by 1st word left, then 2nd word left
          Format: "{n}L" or "{n}R" where n=word position, L=left, R=right

        Args:
            corpus_id: Corpus ID to search
            query: Search query (word, phrase, or CQL expression)
            text_ids: Specific text IDs (None = all)
            search_mode: "exact", "contains", "starts", "ends", "phrase",
                         "wordlist", or "cql"
            search_target: What to match: "word" or "lemma"
            ignore_case: Case-insensitive matching (default: true)
            context_size: Number of context tokens on each side (default: 5)
            sort_by: Sort criterion (see above, default: None)
            sort_levels: Multi-level sort keys (see above, default: None)
            sort_descending: Descending sort order (default: false)
            pos_filter: Filter results by POS tags, e.g. ["NOUN", "VERB"]
            max_results: Hard cap on results from backend (default: None)
            limit: Max results to display (default: 30)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "search_value": query,
            "search_mode": search_mode,
            "context_size": context_size,
            "lowercase": not ignore_case,
            "sort_descending": sort_descending,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if sort_by:
            body["sort_by"] = sort_by
        if sort_levels:
            body["sort_levels"] = sort_levels
        if max_results is not None:
            body["max_results"] = max_results
        if pos_filter:
            body["pos_filter"] = {
                "selectedPOS": pos_filter,
                "keepMode": True,
            }

        result = await client.post("/api/collocation/search", json_data=body)
        data = result.get("data", result)
        results = data.get("results", [])
        total_hits = data.get("total_count", data.get("total_hits", len(results)))

        if not results:
            return f'No matches found for "{query}".'

        sort_info = ""
        if sort_by:
            sort_info = f", sort={sort_by}"
            if sort_levels:
                sort_info += f" [{','.join(sort_levels)}]"
            if sort_descending:
                sort_info += " desc"

        lines = [
            f'KWIC Results for "{query}" (mode={search_mode}{sort_info})',
            f"Total hits: {total_hits}\n",
        ]
        for i, r in enumerate(results[:limit], 1):
            left = r.get("left_context", "")
            kw = r.get("keyword", r.get("match", "?"))
            right = r.get("right_context", "")
            source = r.get("text_name", r.get("filename", ""))
            pos = r.get("pos", "")

            if isinstance(left, list):
                left = " ".join(
                    t.get("text", str(t)) if isinstance(t, dict) else str(t)
                    for t in left
                )
            if isinstance(right, list):
                right = " ".join(
                    t.get("text", str(t)) if isinstance(t, dict) else str(t)
                    for t in right
                )
            left = left.strip()
            right = right.strip()

            line = f"{i:>3}. ...{left[-60:]:>60}  [{kw}]  {right[:60]}..."
            if pos:
                line += f"  ({pos})"
            if source:
                line += f"  <{source}>"
            lines.append(line)

        if total_hits > limit:
            lines.append(f"\n... showing {limit} of {total_hits} hits")

        if results and results[0].get("text_id") and results[0].get("position") is not None:
            lines.append(
                "\nTIP: Use get_extended_context(corpus_id, text_id, position) "
                "to see more context. Example from first hit: "
                f"text_id='{results[0]['text_id']}', position={results[0]['position']}"
            )
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for i, r in enumerate(results, 1):
                left_ctx = r.get("left_context", "")
                kw = r.get("keyword", r.get("match", ""))
                right_ctx = r.get("right_context", "")
                if isinstance(left_ctx, list):
                    left_ctx = " ".join(
                        t.get("text", str(t)) if isinstance(t, dict) else str(t)
                        for t in left_ctx
                    )
                if isinstance(right_ctx, list):
                    right_ctx = " ".join(
                        t.get("text", str(t)) if isinstance(t, dict) else str(t)
                        for t in right_ctx
                    )
                csv_rows.append({
                    "Index": i,
                    "Source": r.get("text_name", r.get("filename", "")),
                    "Left Context": left_ctx.strip(),
                    "Keyword": kw,
                    "Right Context": right_ctx.strip(),
                    "POS": r.get("pos", ""),
                    "Position": r.get("position", ""),
                })
            saved = save_csv(csv_rows, save_path, f"kwic_results_{today()}.csv",
                             ["Index", "Source", "Left Context", "Keyword",
                              "Right Context", "POS", "Position"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type in ("dispersion", "density") and results:
            chart_path = chart_path if chart_path is not None else ""
            positions = [r.get("position", 0) for r in results if r.get("position") is not None]
            total_tokens = data.get("total_tokens", len(kwic_results) * 10)
            if positions:
                saved_chart = save_dispersion_chart(
                    positions, total_tokens, query, chart_path,
                    default_filename=f"dispersion_{today()}.png",
                )
                if saved_chart:
                    output += f"\n\nDispersion chart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def get_extended_context(
        corpus_id: str,
        text_id: str,
        position: int,
        context_chars: int = 200,
        keyword: Optional[str] = None,
    ) -> str:
        """Get extended context around a specific concordance hit.

        When to use: After concordance_search(), to see more surrounding text for
        a particular match. Use the text_id and position from concordance results.

        Args:
            corpus_id: Corpus ID
            text_id: Text ID containing the hit
            position: Token position from concordance results
            context_chars: Characters of context to show (default: 200)
            keyword: The keyword/phrase for precise highlighting (optional)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "text_id": text_id,
            "position": position,
            "context_chars": context_chars,
        }
        if keyword:
            body["keyword"] = keyword

        result = await client.post(
            "/api/collocation/extended-context", json_data=body
        )
        data = result.get("data", result)
        text = data.get("text", "")
        kw = data.get("keyword", keyword or "")
        highlight_start = data.get("highlight_start")
        highlight_end = data.get("highlight_end")

        if not text:
            return "No extended context available for this position."

        lines = [f"Extended Context (position={position})\n"]

        if highlight_start is not None and highlight_end is not None:
            before = text[:highlight_start]
            highlighted = text[highlight_start:highlight_end]
            after = text[highlight_end:]
            lines.append(f"...{before}[{highlighted}]{after}...")
        else:
            lines.append(f"...{text}...")

        if kw:
            lines.append(f"\nKeyword: {kw}")
        return "\n".join(lines)

    @mcp.tool()
    async def collocation_analysis(
        corpus_id: str,
        node_word: str,
        text_ids: list[str] | None = None,
        window_size: int = 5,
        min_freq: int = 3,
        statistic: str = "logdice",
        match_mode: str = "lemma",
        remove_stopwords: bool = False,
        exclude_words: Optional[list[str]] = None,
        limit: int = 30,
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Analyze collocations (statistically significant word co-occurrences).

        When to use: After KWIC, quantify which words co-occur with a node word within
        a window (LogDice, MI, etc.) - phraseology and semantic prosody.

        Finds words that appear together with the node word more often than
        expected by chance.

        Args:
            corpus_id: Corpus ID to analyze
            node_word: The central word to find collocates for
            text_ids: Specific text IDs (None = all)
            window_size: Context window in words on each side (default: 5)
            min_freq: Minimum co-occurrence frequency (default: 3)
            statistic: Statistical measure: "logdice" (recommended), "mi" (MI),
                       "mi3", "t_score", "z_score", "log_likelihood", "dice"
            match_mode: Match by "lemma" (default) or "word" (exact form)
            remove_stopwords: Exclude stopwords from collocates (default: false)
            exclude_words: Specific words to exclude from collocate list
            limit: Max collocates to return (default: 30)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "node_word": node_word,
            "window_size": window_size,
            "min_freq": min_freq,
            "statistic": statistic,
            "match_mode": match_mode,
            "remove_stopwords": remove_stopwords,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if exclude_words:
            body["exclude_words"] = exclude_words

        result = await client.post("/api/collocation-analysis/analyze", json_data=body)
        data = result.get("data", result)
        collocates = data.get("collocates", data.get("results", []))

        if not collocates:
            return f'No significant collocates found for "{node_word}".'

        lines = [
            f'Collocation Analysis for "{node_word}" '
            f"({statistic}, window={window_size}, mode={match_mode})\n",
            f"{'Rank':<6}{'Collocate':<25}{'Score':<12}{'CoFreq':<10}{'Freq':<10}",
            "-" * 63,
        ]
        for i, c in enumerate(collocates[:limit], 1):
            word = c.get("collocate", c.get("word", "?"))
            score = c.get("score", c.get(statistic, c.get("statistic_value", 0)))
            co_freq = c.get("co_frequency", c.get("collocation_freq", c.get("joint_freq", 0)))
            freq = c.get("frequency", c.get("total_freq", c.get("collocate_freq", 0)))
            lines.append(f"{i:<6}{word:<25}{score:<12.4f}{co_freq:<10}{freq:<10}")
        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for c in collocates:
                csv_rows.append({
                    "Collocate": c.get("collocate", c.get("word", "")),
                    "Collocation Freq": c.get("co_frequency", c.get("collocation_freq", c.get("joint_freq", 0))),
                    "Total Freq": c.get("frequency", c.get("total_freq", c.get("collocate_freq", 0))),
                    statistic: f"{c.get('score', c.get(statistic, c.get('statistic_value', 0))):.4f}",
                })
            saved = save_csv(csv_rows, save_path, f"collocation_{node_word}_{today()}.csv")
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type and collocates:
            chart_path = chart_path if chart_path is not None else ""
            chart_items = [
                {"collocate": c.get("collocate", c.get("word", "")),
                 "score": c.get("score", c.get(statistic, 0))}
                for c in collocates[:50]
            ]
            chart_title = f'Collocations of "{node_word}" ({statistic})'
            if chart_type == "bar":
                saved_chart = save_bar_chart(
                    chart_items, "collocate", "score", chart_title, chart_path,
                    default_filename=f"collocation_bar_{today()}.png", xlabel=statistic)
            elif chart_type == "pie":
                saved_chart = save_pie_chart(
                    chart_items, "collocate", "score", chart_title, chart_path,
                    default_filename=f"collocation_pie_{today()}.png")
            elif chart_type == "wordcloud":
                saved_chart = save_wordcloud(
                    chart_items, "collocate", "score", chart_path,
                    default_filename=f"collocation_wordcloud_{today()}.png", title=chart_title)
            elif chart_type == "network":
                saved_chart = save_network_chart(
                    node_word, chart_items, "collocate", "score", chart_title, chart_path,
                    default_filename=f"collocation_network_{today()}.png")
            else:
                saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def word_sketch(
        corpus_id: str,
        word: str,
        text_ids: list[str] | None = None,
        pos: str = "",
        min_frequency: int = 2,
        max_results: int = 20,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Generate a word sketch showing grammatical relations and collocates.

        When to use: One-word grammatical profile (objects, subjects, modifiers) from
        dependency parses - complements collocation_analysis.

        A word sketch summarizes how a word behaves grammatically:
        its typical subjects, objects, modifiers, etc. Based on dependency parsing.

        Chart types: "bar", "pie", "wordcloud", "network" (collocation network by relation).
        Note: No CSV export for word sketch (matching UI behavior).

        Args:
            corpus_id: Corpus ID to analyze
            word: The word to sketch
            text_ids: Specific text IDs (None = all)
            pos: POS filter: "NOUN", "VERB", "ADJ", "ADV" (empty = auto-detect)
            min_frequency: Minimum collocate frequency (default: 2)
            chart_type: Chart to generate: "bar", "pie", "wordcloud", "network". None = no chart.
            chart_path: Save chart path. Empty string = ~/Downloads. None = don't save.
            max_results: Max collocates per relation (default: 20)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "word": word,
            "min_frequency": min_frequency,
            "max_results": max_results,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos:
            body["pos"] = pos

        result = await client.post("/api/sketch/word-sketch", json_data=body)
        data = result.get("data", result)
        relations = data.get("relations", data.get("sketch", {}))

        if not relations:
            return f'No word sketch data found for "{word}".'

        lines = [f'Word Sketch for "{word}"\n']

        if isinstance(relations, dict):
            for rel_name, rel_data in relations.items():
                if isinstance(rel_data, dict):
                    display = rel_data.get("display_en", rel_data.get("name", rel_name))
                    collocates = rel_data.get("collocations", rel_data.get("collocates", []))
                elif isinstance(rel_data, list):
                    display = rel_name
                    collocates = rel_data
                else:
                    continue
                if not collocates:
                    continue
                lines.append(f"  [{display}]")
                for c in collocates[:max_results]:
                    w = c.get("lemma", "") or c.get("word", "") or c.get("collocate", "?")
                    score = c.get("score", c.get("logdice", 0))
                    freq = c.get("frequency", c.get("freq", 0))
                    lines.append(f"    {w:<20} score={score:.2f}  freq={freq}")
                lines.append("")
        elif isinstance(relations, list):
            for group in relations:
                rel_name = group.get("relation", group.get("name", "?"))
                collocates = group.get("collocations", group.get("collocates", group.get("items", [])))
                if not collocates:
                    continue
                lines.append(f"  [{rel_name}]")
                for c in collocates[:max_results]:
                    w = c.get("lemma", "") or c.get("word", "") or c.get("collocate", "?")
                    score = c.get("score", c.get("logdice", 0))
                    freq = c.get("frequency", c.get("freq", 0))
                    lines.append(f"    {w:<20} score={score:.2f}  freq={freq}")
                lines.append("")

        output = "\n".join(lines)

        if chart_type and isinstance(relations, dict):
            chart_path = chart_path if chart_path is not None else ""
            if chart_type == "network":
                saved_chart = save_collocation_network(
                    word, relations, chart_path,
                    default_filename=f"word_sketch_network_{today()}.png",
                    max_per_rel=max_results,
                )
            else:
                flat_items = []
                for rel_data in relations.values():
                    collocates = rel_data.get("collocations", []) if isinstance(rel_data, dict) else []
                    for c in collocates:
                        w = c.get("lemma", "") or c.get("word", "") or c.get("collocate", "")
                        score = c.get("score", c.get("logdice", 0))
                        if w:
                            flat_items.append({"word": w, "score": score})
                flat_items.sort(key=lambda x: -x["score"])
                chart_title = f'Word Sketch: "{word}"'
                if chart_type == "bar":
                    saved_chart = save_bar_chart(
                        flat_items[:40], "word", "score", chart_title, chart_path,
                        default_filename=f"word_sketch_bar_{today()}.png", xlabel="Score")
                elif chart_type == "pie":
                    saved_chart = save_pie_chart(
                        flat_items[:20], "word", "score", chart_title, chart_path,
                        default_filename=f"word_sketch_pie_{today()}.png")
                elif chart_type == "wordcloud":
                    saved_chart = save_wordcloud(
                        flat_items, "word", "score", chart_path,
                        default_filename=f"word_sketch_wordcloud_{today()}.png", title=chart_title)
                else:
                    saved_chart = ""
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output
