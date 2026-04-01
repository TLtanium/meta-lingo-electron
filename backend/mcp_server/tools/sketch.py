"""
Synonym and sketch comparison tools for Meta-Lingo MCP server.
Tools: synonym_analysis, sketch_difference, get_lemma_forms
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import save_network_chart


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def synonym_analysis(
        corpus_id: str,
        word: str,
        text_ids: list[str] | None = None,
        pos: str = "",
        save_path: str | None = None,
        chart_type: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Find synonyms for a word that actually appear in the corpus.

        When to use: Lexical variation / near-synonyms attested in your data (WordNet +
        corpus filter), not dictionary-only synonyms.

        Uses WordNet to find synonyms, then filters to those present in the corpus.

        Args:
            corpus_id: Corpus ID to search
            word: The word to find synonyms for
            text_ids: Specific text IDs (None = all)
            pos: POS filter: "NOUN", "VERB", "ADJ", "ADV" (empty = all)
            save_path: Save results as CSV. Path, directory, or empty string for ~/Downloads. None = don't save.
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
        data = result.get("data", result)
        results = data.get("results", data.get("synsets", []))

        if not results:
            return f'No synonyms found for "{word}" in the corpus.'

        lines = [f'Synonym Analysis for "{word}"\n']

        for item in results[:20]:
            if "synsets" in item:
                w = item.get("word", "?")
                freq = item.get("frequency", 0)
                pos_tags = item.get("pos_tags", [])
                lines.append(f"  {w} (freq={freq}, POS={','.join(pos_tags)})")
                for s in item.get("synsets", [])[:3]:
                    name = s.get("name", "")
                    definition = s.get("definition", "")
                    lines.append(f"    - {name}: {definition[:80]}")
                lines.append("")
            else:
                name = item.get("name", item.get("synset", ""))
                definition = item.get("definition", "")
                synonyms = item.get("corpus_synonyms", item.get("synonyms", []))
                lines.append(f"  Synset: {name}")
                if definition:
                    lines.append(f"  Definition: {definition}")
                if synonyms:
                    syn_list = synonyms if isinstance(synonyms, list) else [synonyms]
                    lines.append(f"  Synonyms in corpus: {', '.join(str(s) for s in syn_list)}")
                lines.append("")

        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for item in results:
                if "synsets" in item:
                    w = item.get("word", "")
                    freq = item.get("frequency", 0)
                    pos_tags = item.get("pos_tags", [])
                    synsets = item.get("synsets", [])
                    synonyms_list = []
                    for s in synsets:
                        synonyms_list.extend(s.get("synonyms", []))
                    csv_rows.append({
                        "Word": w,
                        "Frequency": freq,
                        "POS Tags": "; ".join(pos_tags),
                        "Synonym Count": len(synonyms_list),
                        "Synonyms": "; ".join(str(s) for s in synonyms_list),
                    })
                else:
                    name = item.get("name", item.get("synset", ""))
                    synonyms = item.get("corpus_synonyms", item.get("synonyms", []))
                    syn_list = synonyms if isinstance(synonyms, list) else [synonyms]
                    csv_rows.append({
                        "Word": name,
                        "Frequency": "",
                        "POS Tags": "",
                        "Synonym Count": len(syn_list),
                        "Synonyms": "; ".join(str(s) for s in syn_list),
                    })
            saved = save_csv(csv_rows, save_path, f"synonym_analysis_{today()}.csv",
                             ["Word", "Frequency", "POS Tags", "Synonym Count", "Synonyms"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_type in ("network", "tree") and results:
            chart_path = chart_path if chart_path is not None else ""
            # Build flat list of synonym words with their corpus frequency
            network_items = []
            for item in results:
                if "synsets" in item:
                    w = item.get("word", "")
                    freq = item.get("frequency", 1)
                    network_items.append({"word": w, "frequency": freq})
                else:
                    syns = item.get("corpus_synonyms", item.get("synonyms", []))
                    for s in (syns if isinstance(syns, list) else [syns]):
                        network_items.append({"word": str(s), "frequency": 1})
            if network_items:
                saved_chart = save_network_chart(
                    word, network_items, "word", "frequency",
                    f'Synonym Network: "{word}"', chart_path,
                    default_filename=f"synonym_network_{today()}.png",
                )
                if saved_chart:
                    output += f"\n\nChart saved: {saved_chart}"

        return output

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

        When to use: Contrast two lemmas (near-synonyms, opposites) by collocational
        behavior in the same corpus.

        Shows which collocates are shared vs. unique to each word.
        Note: No CSV export for sketch difference (view-only, matching UI behavior).

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
        data = result.get("data", result)
        relations = data.get("relations", data.get("differences", []))

        if not relations:
            return f'No sketch difference data for "{word1}" vs "{word2}".'

        lines = [f'Sketch Difference: "{word1}" vs "{word2}"\n']

        items = relations.items() if isinstance(relations, dict) else (
            (r.get("relation", "?"), r) for r in relations
        )
        for rel_name, rel_data in items:
            if isinstance(rel_data, dict):
                display = rel_data.get("display_en", rel_data.get("name", rel_name))
                sections = [
                    ("Shared", rel_data.get("shared", [])),
                    (f"{word1} only", rel_data.get("word1_only", [])),
                    (f"{word2} only", rel_data.get("word2_only", [])),
                ]
                has_any = any(items for _, items in sections)
                if not has_any:
                    continue
                lines.append(f"  [{display}]")
                for section_label, collocates in sections:
                    if not collocates:
                        continue
                    lines.append(f"    {section_label}:")
                    for c in collocates[:10]:
                        w = c.get("lemma", "") or c.get("word", "?")
                        freq = c.get("frequency", c.get("freq", 0))
                        score = c.get("score", c.get("logdice", 0))
                        lines.append(f"      {w:<20} score={score:.2f}  freq={freq}")
                lines.append("")
            elif isinstance(rel_data, list):
                if not rel_data:
                    continue
                lines.append(f"  [{rel_name}]")
                for c in rel_data[:15]:
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

    @mcp.tool()
    async def get_lemma_forms(
        corpus_id: str,
        lemma: str,
        text_ids: list[str] | None = None,
    ) -> str:
        """Get all word forms of a lemma found in the corpus.

        When to use: Before word_sketch or sketch_difference, to see which
        inflected forms (e.g., "run" -> runs, running, ran) actually appear
        in the corpus. Also useful for understanding morphological variation.

        Args:
            corpus_id: Corpus ID to search
            lemma: The lemma to find forms for (e.g., "run", "be", "good")
            text_ids: Specific text IDs (None = all)
        """
        body: dict = {
            "corpus_id": corpus_id,
            "lemma": lemma,
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post("/api/sketch/lemma-forms", json_data=body)
        data = result.get("data", result)
        forms = data.get("forms", data.get("results", []))

        if not forms:
            return f'No forms found for lemma "{lemma}" in the corpus.'

        lines = [f'Word forms for lemma "{lemma}"\n']
        lines.append(f"{'Form':<25}{'Frequency':<12}{'POS':<8}")
        lines.append("-" * 45)
        for f in forms:
            if isinstance(f, dict):
                word = f.get("word", f.get("form", "?"))
                freq = f.get("frequency", f.get("freq", 0))
                pos = f.get("pos", "-")
                lines.append(f"{word:<25}{freq:<12}{pos:<8}")
            else:
                lines.append(str(f))
        return "\n".join(lines)
