"""
Synonym and sketch comparison tools for Meta-Lingo MCP server.
Tools: synonym_analysis, sketch_difference
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def synonym_analysis(
        corpus_id: str,
        word: str,
        text_ids: list[str] | None = None,
        pos: str = "",
    ) -> str:
        """Find synonyms for a word that actually appear in the corpus.

        Uses WordNet to find synonyms, then filters to keep only those
        present in the corpus texts. Shows synonym sets with definitions.

        Args:
            corpus_id: Corpus ID to search
            word: The word to find synonyms for
            text_ids: Specific text IDs (None = all)
            pos: POS filter: "NOUN", "VERB", "ADJ", "ADV" (empty = all)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "word": word,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos:
            body["pos"] = pos

        result = await client.post("/api/analysis/synonym", json_data=body)
        data = result.get("data", {})
        synsets = data.get("synsets", data.get("results", []))

        if not synsets:
            return f'No synonyms found for "{word}" in the corpus.'

        lines = [f'Synonym Analysis for "{word}"\n']
        for s in synsets:
            name = s.get("name", s.get("synset", ""))
            definition = s.get("definition", "")
            synonyms = s.get("synonyms", s.get("words", []))
            corpus_synonyms = s.get("corpus_synonyms", synonyms)

            lines.append(f"  Synset: {name}")
            if definition:
                lines.append(f"  Definition: {definition}")
            if corpus_synonyms:
                lines.append(f"  Synonyms in corpus: {', '.join(corpus_synonyms)}")
            lines.append("")

        return "\n".join(lines)

    @mcp.tool()
    async def sketch_difference(
        corpus_id: str,
        word1: str,
        word2: str,
        text_ids: list[str] | None = None,
        pos: str = "",
        min_frequency: int = 2,
    ) -> str:
        """Compare collocational profiles of two words (Sketch Difference).

        Shows which collocates are shared vs. unique to each word,
        useful for understanding near-synonyms or contrasting concepts.

        Args:
            corpus_id: Corpus ID to analyze
            word1: First word to compare
            word2: Second word to compare
            text_ids: Specific text IDs (None = all)
            pos: POS filter (empty = auto-detect)
            min_frequency: Minimum collocate frequency (default: 2)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "word1": word1,
            "word2": word2,
            "min_frequency": min_frequency,
        }
        if text_ids:
            body["text_ids"] = text_ids
        if pos:
            body["pos"] = pos

        result = await client.post("/api/sketch/difference", json_data=body)
        data = result.get("data", {})
        relations = data.get("relations", data.get("differences", []))

        if not relations:
            return f'No sketch difference data for "{word1}" vs "{word2}".'

        lines = [f'Sketch Difference: "{word1}" vs "{word2}"\n']

        items = relations.items() if isinstance(relations, dict) else (
            (r.get("relation", "?"), r.get("collocates", [])) for r in relations
        )
        for rel_name, collocates in items:
            if not collocates:
                continue
            lines.append(f"  [{rel_name}]")
            for c in collocates[:15]:
                w = c.get("word", c.get("collocate", "?"))
                score1 = c.get("score1", c.get(f"{word1}_score", 0))
                score2 = c.get("score2", c.get(f"{word2}_score", 0))
                diff = c.get("diff", c.get("difference", score1 - score2))
                direction = "<--" if diff > 0 else "-->" if diff < 0 else "=="
                lines.append(
                    f"    {w:<20} {word1}={score1:.2f}  {direction}  {word2}={score2:.2f}"
                )
            lines.append("")

        return "\n".join(lines)
