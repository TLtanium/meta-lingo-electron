"""
Export tool for Meta-Lingo MCP server.
Tools: export_annotations
"""
import base64
import os
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def export_annotations(
        corpus_id: str,
        text_ids: list[str] | None = None,
        annotation_types: list[str] | None = None,
        format: str = "json",
    ) -> str:
        """Export NLP pipeline annotation results from a corpus for archival or external use.

        ⚠ THIS TOOL EXPORTS AUTOMATED NLP PIPELINE RESULTS, NOT FRAMEWORK ANNOTATIONS.
        - "mipvu" here = token-level is_metaphor flags from the automated MIPVU tagger.
        - "usas" here = semantic domain tags from PyMUSAS tagger.
        These are NOT the same as manual/AI span annotations made via save_annotation().

        If the user wants to ANNOTATE texts using an annotation framework (e.g. MIPVU framework,
        theme-rheme, discourse, etc.), use:
            list_annotation_frameworks() → get_annotation_framework() → save_annotation()
        Do NOT call this tool for annotation tasks.

        When to use THIS tool: The user explicitly wants to download/export the raw NLP
        tagging outputs (POS, lemma, dependency, USAS semantic tags, MIPVU metaphor flags)
        for archival, statistics scripts, or sharing outside Meta-Lingo.

        Available annotation types:
        - "universal_pos": Universal POS tags (NOUN, VERB, ADJ, etc.)
        - "penn_pos": Penn Treebank POS tags (NN, VB, JJ, etc.)
        - "lemma": Lemmatized word forms
        - "dep": Dependency relations
        - "usas": USAS semantic domain tags (PyMUSAS tagger output)
        - "mipvu": token-level metaphor flags (automated MIPVU tagger output)

        Output: single JSON for one text; ZIP archive (base64) for multiple texts.

        Args:
            corpus_id: Corpus ID to export
            text_ids: Specific text IDs (None = all texts)
            annotation_types: Which annotations to include (default: all for json/xml,
                              universal_pos for txt)
            format: Output format: "json", "xml", or "txt" (word_TAG format)
        """
        if annotation_types is None:
            if format == "txt":
                annotation_types = ["universal_pos"]
            else:
                annotation_types = [
                    "universal_pos", "lemma", "dep", "usas", "mipvu"
                ]

        # Get text list if not specified
        if text_ids is None:
            texts_result = await client.get(f"/api/corpus/{corpus_id}/texts")
            texts = texts_result.get("data", texts_result.get("texts", []))
            text_ids = [t["id"] for t in texts]

        if not text_ids:
            return "No texts found in corpus to export."

        body = {
            "text_ids": text_ids,
            "annotation_types": annotation_types,
            "format": format,
        }

        content = await client.post_file_download(
            f"/api/corpus/{corpus_id}/export-annotated", json_data=body
        )

        size_kb = len(content) / 1024
        ann_str = ", ".join(annotation_types)

        if format == "json" and len(text_ids) == 1:
            # Single JSON file — return content directly
            try:
                text = content.decode("utf-8")
                return (
                    f"Exported {len(text_ids)} text(s) as {format.upper()} "
                    f"({ann_str}, {size_kb:.1f} KB):\n\n{text[:5000]}"
                )
            except UnicodeDecodeError:
                pass

        # Multi-text or binary — save to ~/Downloads/ and return path
        downloads = Path.home() / "Downloads"
        downloads.mkdir(exist_ok=True)

        # Derive filename from corpus_id
        corpus_short = corpus_id[:8]
        ann_short = "_".join(annotation_types)[:30]
        filename = f"metalingo_{corpus_short}_{ann_short}.zip"
        save_path = downloads / filename

        # Avoid overwriting: append counter if exists
        counter = 1
        while save_path.exists():
            save_path = downloads / f"metalingo_{corpus_short}_{ann_short}_{counter}.zip"
            counter += 1

        save_path.write_bytes(content)

        return (
            f"Exported {len(text_ids)} text(s) as {format.upper()} "
            f"({ann_str}, {size_kb:.1f} KB).\n"
            f"File saved to: {save_path}"
        )
