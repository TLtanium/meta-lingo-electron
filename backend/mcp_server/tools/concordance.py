"""
Concordance and collocation tools for Meta-Lingo MCP server.
Tools: concordance_search, collocation_analysis, word_sketch
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def concordance_search(
        corpus_id: str,
        query: str,
        text_ids: list[str] | None = None,
        search_mode: str = "exact",
        search_target: str = "word",
        ignore_case: bool = True,
        context_chars: int = 80,
        limit: int = 30,
    ) -> str:
        """Search for words/phrases in context (KWIC - Key Word In Context).

        Shows each occurrence with surrounding context, essential for
        understanding how words are used in actual texts.

        Search modes:
        - "exact": exact word match
        - "contains": word contains the query
        - "starts": word starts with query
        - "ends": word ends with query
        - "phrase": exact phrase match
        - "cql": Corpus Query Language for complex queries
          Examples: [pos="NOUN"], [lemma="run"], [word="the" & pos="DET"]

        Args:
            corpus_id: Corpus ID to search
            query: Search query (word, phrase, or CQL expression)
            text_ids: Specific text IDs (None = all)
            search_mode: Search mode (see above)
            search_target: What to match: "word" or "lemma"
            ignore_case: Case-insensitive matching (default: true)
            context_chars: Characters of context on each side (default: 80)
            limit: Max results to return (default: 30)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "query": query,
            "search_mode": search_mode,
            "search_target": search_target,
            "ignore_case": ignore_case,
            "context_chars": context_chars,
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post("/api/collocation/search", json_data=body)
        data = result.get("data", {})
        results = data.get("results", [])
        total_hits = data.get("total_hits", len(results))

        if not results:
            return f'No matches found for "{query}".'

        lines = [
            f'KWIC Results for "{query}" (mode={search_mode})',
            f"Total hits: {total_hits}\n",
        ]
        for i, r in enumerate(results[:limit], 1):
            left = r.get("left_context", "").strip()
            kw = r.get("keyword", r.get("match", "?"))
            right = r.get("right_context", "").strip()
            source = r.get("text_name", r.get("filename", ""))
            lines.append(f"{i:>3}. ...{left[-60:]:>60}  [{kw}]  {right[:60]}...")
            if source:
                lines[-1] += f"  <{source}>"

        if total_hits > limit:
            lines.append(f"\n... showing {limit} of {total_hits} hits")
        return "\n".join(lines)

    @mcp.tool()
    async def collocation_analysis(
        corpus_id: str,
        node_word: str,
        text_ids: list[str] | None = None,
        window_size: int = 5,
        min_freq: int = 3,
        statistic: str = "logdice",
        limit: int = 30,
    ) -> str:
        """Analyze collocations (statistically significant word co-occurrences).

        Finds words that appear together with the node word more often than
        expected by chance. Useful for understanding word associations,
        phraseology, and semantic prosody.

        Args:
            corpus_id: Corpus ID to analyze
            node_word: The central word to find collocates for
            text_ids: Specific text IDs (None = all)
            window_size: Context window in words on each side (default: 5)
            min_freq: Minimum co-occurrence frequency (default: 3)
            statistic: Statistical measure: "logdice" (recommended), "mi" (MI),
                       "mi3", "t_score", "z_score", "log_likelihood", "dice"
            limit: Max collocates to return (default: 30)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "node_word": node_word,
            "window_size": window_size,
            "min_freq": min_freq,
            "statistic": statistic,
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post("/api/collocation-analysis/analyze", json_data=body)
        data = result.get("data", {})
        collocates = data.get("collocates", data.get("results", []))

        if not collocates:
            return f'No significant collocates found for "{node_word}".'

        lines = [
            f'Collocation Analysis for "{node_word}" ({statistic}, window={window_size})\n',
            f"{'Rank':<6}{'Collocate':<25}{'Score':<12}{'CoFreq':<10}{'Freq':<10}",
            "-" * 63,
        ]
        for i, c in enumerate(collocates[:limit], 1):
            word = c.get("collocate", c.get("word", "?"))
            score = c.get("score", c.get("statistic_value", 0))
            co_freq = c.get("co_frequency", c.get("joint_freq", 0))
            freq = c.get("frequency", c.get("collocate_freq", 0))
            lines.append(f"{i:<6}{word:<25}{score:<12.4f}{co_freq:<10}{freq:<10}")
        return "\n".join(lines)

    @mcp.tool()
    async def word_sketch(
        corpus_id: str,
        word: str,
        text_ids: list[str] | None = None,
        pos: str = "",
        min_frequency: int = 2,
        max_results: int = 20,
    ) -> str:
        """Generate a word sketch showing grammatical relations and collocates.

        A word sketch summarizes how a word behaves grammatically:
        its typical subjects, objects, modifiers, etc. Based on dependency parsing.

        Args:
            corpus_id: Corpus ID to analyze
            word: The word to sketch
            text_ids: Specific text IDs (None = all)
            pos: POS filter: "NOUN", "VERB", "ADJ", "ADV" (empty = auto-detect)
            min_frequency: Minimum collocate frequency (default: 2)
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
        data = result.get("data", {})
        relations = data.get("relations", data.get("sketch", {}))

        if not relations:
            return f'No word sketch data found for "{word}".'

        lines = [f'Word Sketch for "{word}"\n']

        if isinstance(relations, dict):
            for rel_name, collocates in relations.items():
                if not collocates:
                    continue
                lines.append(f"  [{rel_name}]")
                for c in collocates[:max_results]:
                    w = c.get("word", c.get("collocate", "?"))
                    score = c.get("score", c.get("logdice", 0))
                    freq = c.get("frequency", c.get("freq", 0))
                    lines.append(f"    {w:<20} score={score:.2f}  freq={freq}")
                lines.append("")
        elif isinstance(relations, list):
            for group in relations:
                rel_name = group.get("relation", group.get("name", "?"))
                collocates = group.get("collocates", group.get("items", []))
                if not collocates:
                    continue
                lines.append(f"  [{rel_name}]")
                for c in collocates[:max_results]:
                    w = c.get("word", c.get("collocate", "?"))
                    score = c.get("score", c.get("logdice", 0))
                    freq = c.get("frequency", c.get("freq", 0))
                    lines.append(f"    {w:<20} score={score:.2f}  freq={freq}")
                lines.append("")

        return "\n".join(lines)
