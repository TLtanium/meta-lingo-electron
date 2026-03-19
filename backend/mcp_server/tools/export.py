"""
Export tool for Meta-Lingo MCP server.
Tools: export_annotations
"""
import base64
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
        """Export corpus annotations in various formats.

        Exports annotated corpus data that can be used for further analysis
        in other tools or for sharing research results.

        Available annotation types:
        - "universal_pos": Universal POS tags (NOUN, VERB, ADJ, etc.)
        - "penn_pos": Penn Treebank POS tags (NN, VB, JJ, etc.)
        - "lemma": Lemmatized word forms
        - "dep": Dependency relations
        - "usas": USAS semantic domain tags
        - "mipvu": MIPVU metaphor annotations

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
            texts = texts_result.get("data", [])
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
            # Single JSON file - return content directly
            try:
                text = content.decode("utf-8")
                return (
                    f"Exported {len(text_ids)} text(s) as {format.upper()} "
                    f"({ann_str}, {size_kb:.1f} KB):\n\n{text[:5000]}"
                )
            except UnicodeDecodeError:
                pass

        # For ZIP files or large content, return base64
        encoded = base64.b64encode(content).decode("ascii")
        return (
            f"Exported {len(text_ids)} text(s) as {format.upper()} "
            f"({ann_str}, {size_kb:.1f} KB).\n"
            f"Binary content (base64-encoded ZIP):\n{encoded[:200]}..."
        )
