"""
Corpus management tools for Meta-Lingo MCP server.
Tools: list_corpora, create_corpus, upload_text, get_corpus_info
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def list_corpora() -> str:
        """List all corpora in the Meta-Lingo workspace.

        Returns a list of all corpora with their IDs, names, languages,
        and text counts. Use this first to discover available corpora
        before running any analysis.
        """
        result = await client.get("/api/corpus/list")
        corpora = result.get("data", [])
        if not corpora:
            return "No corpora found. Use create_corpus to create one."
        lines = []
        for c in corpora:
            tags = ", ".join(c.get("tags", [])) if c.get("tags") else ""
            tag_str = f" [tags: {tags}]" if tags else ""
            lines.append(
                f"- {c['name']} (id={c['id']}, lang={c.get('language', '?')}, "
                f"texts={c.get('text_count', 0)}){tag_str}"
            )
        return f"Found {len(corpora)} corpus/corpora:\n" + "\n".join(lines)

    @mcp.tool()
    async def create_corpus(
        name: str,
        language: str = "english",
        description: str = "",
    ) -> str:
        """Create a new empty corpus in Meta-Lingo.

        After creating, use upload_text to add texts to it.
        The corpus will appear in Meta-Lingo's Corpus Management page.

        Args:
            name: Name for the corpus (e.g. "Political Speeches 2024")
            language: Language code - "english" or "chinese" (default: english)
            description: Optional description of the corpus
        """
        result = await client.post("/api/corpus/create", json_data={
            "name": name,
            "language": language,
            "description": description,
        })
        if result.get("success"):
            corpus = result.get("data", {})
            return (
                f"Corpus created successfully.\n"
                f"  Name: {corpus.get('name', name)}\n"
                f"  ID: {corpus.get('id', 'unknown')}\n"
                f"  Language: {corpus.get('language', language)}\n"
                f"Use upload_text with this corpus ID to add texts."
            )
        return f"Failed to create corpus: {result.get('message', 'unknown error')}"

    @mcp.tool()
    async def upload_text(
        corpus_id: str,
        filename: str,
        content: str,
    ) -> str:
        """Upload text content to a corpus.

        The text will be automatically annotated with SpaCy (POS, lemma, dep),
        USAS semantic tags, MIPVU metaphor detection, and NRC sentiment.
        After upload, the text appears in the corpus in the Meta-Lingo app.

        Args:
            corpus_id: ID of the target corpus (from list_corpora or create_corpus)
            filename: Filename for the text (e.g. "speech_01.txt")
            content: The full text content to upload
        """
        if not filename.endswith(".txt"):
            filename += ".txt"
        result = await client.upload_text_content(corpus_id, filename, content)
        if result.get("success"):
            return (
                f"Text '{filename}' uploaded successfully to corpus {corpus_id}.\n"
                f"The text is being annotated (SpaCy, USAS, MIPVU, NRC).\n"
                f"It will be available for analysis shortly."
            )
        return f"Upload failed: {result.get('message', 'unknown error')}"

    @mcp.tool()
    async def get_corpus_info(corpus_id: str) -> str:
        """Get detailed information about a corpus, including all its texts.

        Use this to get the text IDs needed for analysis tools.

        Args:
            corpus_id: ID of the corpus to inspect
        """
        corpus = await client.get(f"/api/corpus/{corpus_id}")
        texts = await client.get(f"/api/corpus/{corpus_id}/texts")

        corpus_data = corpus.get("data", {})
        text_list = texts.get("data", [])

        lines = [
            f"Corpus: {corpus_data.get('name', '?')}",
            f"  ID: {corpus_id}",
            f"  Language: {corpus_data.get('language', '?')}",
            f"  Description: {corpus_data.get('description', '-')}",
            f"  Text count: {len(text_list)}",
            "",
            "Texts:",
        ]
        for t in text_list:
            media = t.get("media_type", "text")
            wc = t.get("word_count")
            wc_str = f", {wc} words" if wc else ""
            lines.append(
                f"  - {t.get('filename', '?')} (id={t['id']}, type={media}{wc_str})"
            )
        if not text_list:
            lines.append("  (no texts yet)")
        return "\n".join(lines)
