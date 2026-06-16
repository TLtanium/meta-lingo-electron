"""
Annotation tools for Meta-Lingo MCP server.
Tools: get_text_content, save_annotation, load_annotation,
       list_annotations, list_all_annotations, delete_annotation
"""
import os
import uuid
from datetime import datetime
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def _get_mcp_model_name() -> str:
    """Get the model/client name for annotation stamps.

    Checks MCP_MODEL_NAME env var, falls back to 'AI (MCP)'.
    This is auto-stamped on annotations so users know which model
    created them, without relying on model output.
    """
    return os.environ.get("MCP_MODEL_NAME", "AI (MCP)")


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def get_text_content(
        corpus_id: str,
        text_id: str,
    ) -> str:
        """Get the full raw text content of a specific text in a corpus.

        When to use: Before creating annotations with save_annotation(). You need
        the exact text content to compute character offsets (startPosition,
        endPosition) for each annotation span.

        Returns the COMPLETE text content (not truncated) and character count.
        Use character positions in the returned text when constructing annotations.

        Workflow:
        1. get_corpus_info(corpus_id) -> get text_id and text_name
        2. get_text_content(corpus_id, text_id) -> get raw text (FULL content)
        3. Identify spans in the text to annotate
        4. save_annotation(..., annotations=[{text, startPosition, endPosition, ...}])

        Args:
            corpus_id: Corpus ID containing the text
            text_id: Text ID from get_corpus_info()
        """
        result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}")
        content = result.get("content", "")
        data = result.get("data", result)

        if not content:
            return f"No text content found for text_id={text_id}"

        filename = data.get("filename", data.get("name", "unknown"))
        word_count = data.get("word_count", 0)
        media_type = data.get("media_type", "text")
        char_count = len(content)

        lines = [
            f"Text: {filename}",
            f"Type: {media_type}, Words: {word_count}, Characters: {char_count}",
            "",
            "--- TEXT CONTENT (FULL) ---",
            content,
            "--- END ---",
            "",
            f"Character offsets: 0 to {char_count - 1}",
            "Use these offsets for startPosition/endPosition in save_annotation().",
        ]
        return "\n".join(lines)

    @mcp.tool()
    async def save_annotation(
        corpus_name: str,
        text_id: str,
        text_name: str,
        framework: str,
        framework_category: str,
        annotations: list[dict],
        text: str = "",
        coder_name: str = "",
        archive_id: Optional[str] = None,
    ) -> str:
        """Save (or append to) a text annotation archive visible in the Annotation panel.

        SENTENCE-BY-SENTENCE WORKFLOW:
        - First sentence (no archive_id): pass text=<full raw text> to store the
          document. Returns archive_id — keep it for all subsequent calls.
        - All later sentences: pass archive_id=<id>, omit text (or leave empty).
          The backend appends spans to the existing archive and preserves the
          stored full text automatically.

        Each annotation item must include:
        - text: the annotated span string (substring from the full text)
        - startPosition: absolute char offset where span starts (0-based)
        - endPosition: absolute char offset where span ends (exclusive)
        - label: label name from the framework (e.g. "Theme", "indirect")
        - labelPath: full path in framework (e.g. "Halliday-Theme > Theme")
        - color: hex color from framework definition

        Optional per-annotation fields:
        - remark: note (model stamp auto-appended)
        - id: auto-generated if omitted

        Args:
            corpus_name: Corpus display name (from get_corpus_info)
            text_id: Text UUID (from get_corpus_info)
            text_name: Text filename (from get_corpus_info)
            framework: Framework name (from list_annotation_frameworks)
            framework_category: Framework category
            annotations: Annotation spans for this sentence
            text: Full raw text — required only on the FIRST call (archive creation).
                  Omit or pass empty string on subsequent append calls.
            coder_name: Annotator name (auto-filled with model name if empty)
            archive_id: Omit to create new archive; pass on all subsequent sentences
        """
        # Auto-detect model name for coder identification
        model_name = _get_mcp_model_name()
        if not coder_name:
            coder_name = model_name

        # Ensure every annotation has an id and auto-stamp model info in remark
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        auto_note = f"[MCP: {model_name} @ {timestamp_str}]"

        for ann in annotations:
            if "id" not in ann:
                ann["id"] = str(uuid.uuid4())
            # Auto-append model stamp to remark
            existing_remark = ann.get("remark", "")
            if existing_remark:
                ann["remark"] = f"{existing_remark} {auto_note}"
            else:
                ann["remark"] = auto_note

        body: dict = {
            "corpusName": corpus_name,
            "textId": text_id,
            "textName": text_name,
            "framework": framework,
            "frameworkCategory": framework_category,
            "type": "text",
            "text": text,
            "annotations": annotations,
            "coderName": coder_name,
        }
        if archive_id:
            body["archiveId"] = archive_id
            body["appendMode"] = True  # MCP incremental: append to existing archive

        result = await client.post("/api/annotation/save", json_data=body)
        data = result.get("data", result)

        saved_id = data.get("id", data.get("archive_id", "?"))
        timestamp = data.get("timestamp", "")

        return (
            f"Annotation saved successfully.\n"
            f"Archive ID: {saved_id}\n"
            f"Framework: {framework}\n"
            f"Corpus: {corpus_name}\n"
            f"Text: {text_name}\n"
            f"Annotations: {len(annotations)} spans\n"
            f"Coder: {coder_name}\n"
            f"Model stamp: {auto_note}\n"
            f"Timestamp: {timestamp}\n\n"
            f"Users can find this archive in Meta-Lingo > Annotation Mode > Archives."
        )

    @mcp.tool()
    async def get_text_sentences(
        corpus_id: str,
        text_id: str,
    ) -> str:
        """Get all sentence boundaries for a text, using SpaCy sentence splitting.

        When to use: FIRST step before sentence-by-sentence annotation. Returns
        every sentence with its index and ABSOLUTE character offsets so you can
        annotate one sentence at a time without re-fetching the full text.

        Sentence boundaries are identical to what the Annotation Mode UI shows.
        The returned offsets are absolute positions in the full text — use them
        directly as startPosition/endPosition offsets when calling save_annotation().

        Workflow:
        1. get_text_sentences(corpus_id, text_id) → get all sentences + offsets
        2. get_annotation_framework(framework_id) → get labels + colors
        3. For each sentence (loop):
           a. Read the sentence text from this result
           b. Identify spans matching framework labels
           c. save_annotation(..., annotations=[spans], archive_id=<prev id>)
              → First call: omit archive_id (creates new archive)
              → All subsequent calls: pass archive_id= to append to same archive
        4. After all sentences: archive is complete in the Annotation panel.

        Args:
            corpus_id: Corpus ID containing the text
            text_id: Text ID from get_corpus_info()
        """
        # Fetch SpaCy annotation for sentence boundaries
        # Response shape: { "success": true, "data": { "sentences": [...], ... } }
        spacy_result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}/spacy")
        spacy_data = spacy_result.get("data", spacy_result)
        sentences = spacy_data.get("sentences", [])

        # Fallback: if SpaCy not run yet, fetch raw text and use line breaks / periods as fallback
        if not sentences:
            text_result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}")
            content = text_result.get("content", "")
            if not content:
                return f"No text content found for text_id={text_id}. Run SpaCy annotation first."
            return (
                f"No SpaCy sentence data found for text_id={text_id}.\n"
                f"Please run SpaCy annotation on this text first (in the Corpus Management panel).\n"
                f"Total characters: {len(content)}"
            )

        # Fetch text content too (for metadata)
        text_result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}")
        data = text_result.get("data", text_result)
        filename = data.get("filename", data.get("name", "unknown"))
        content = text_result.get("content", "")

        lines = [
            f"Text: {filename}",
            f"Total sentences: {len(sentences)} | Total chars: {len(content)}",
            "",
            f"{'#':<6}{'Start':<8}{'End':<8}{'Sentence'}",
            "-" * 80,
        ]
        for i, sent in enumerate(sentences):
            start = sent.get("start", 0)
            end = sent.get("end", 0)
            text_snippet = sent.get("text", content[start:end])
            # Show first 60 chars if long
            display = text_snippet if len(text_snippet) <= 60 else text_snippet[:57] + "..."
            lines.append(f"{i:<6}{start:<8}{end:<8}{display}")

        lines.append("")
        lines.append(
            "NEXT STEPS — annotate sentence by sentence:\n"
            "  1. Call get_text_content(corpus_id, text_id) to get the FULL raw text string.\n"
            "     You need it only for the FIRST save_annotation call (to store in the archive).\n"
            "  2. For sentence 0: identify spans → save_annotation(text=<full text>, annotations=[...])\n"
            "     → returns archive_id. Keep this ID.\n"
            "  3. For sentences 1, 2, …: identify spans → save_annotation(archive_id=<id>, annotations=[...])\n"
            "     → text param can be omitted; backend appends to the existing archive automatically.\n"
            "  4. Sentences with no annotatable spans: skip save_annotation for that sentence.\n"
            "  Span offsets: startPosition/endPosition are ABSOLUTE — use Start/End columns above directly."
        )
        return "\n".join(lines)

    @mcp.tool()
    async def get_text_segment(
        corpus_id: str,
        text_id: str,
        char_offset: int = 0,
        char_length: int = 2000,
    ) -> str:
        """Read a character-range segment of a text for segment-by-segment annotation.

        When to use: For long texts (>3000 characters) that exceed what can be annotated
        in a single context window. Read the text in segments, annotate each segment,
        and accumulate annotations using save_annotation(archive_id=...) to update the
        same archive.

        Workflow for long-text annotation:
        1. get_text_content(corpus_id, text_id) → get total char_count
        2. get_text_segment(corpus_id, text_id, char_offset=0, char_length=2000) → first segment
        3. Annotate spans in this segment — startPosition/endPosition are ABSOLUTE offsets in the full text
        4. save_annotation(..., annotations=[...]) → get archive_id
        5. Repeat: get_text_segment(..., char_offset=2000, char_length=2000) → next segment
        6. save_annotation(..., archive_id=<from step 4>, annotations=[...]) → appends to same archive
        7. Continue until char_offset >= char_count

        IMPORTANT: char_offset and char_length are for navigating the text. The startPosition
        and endPosition in your annotations must always be absolute character offsets in the
        full text, NOT relative to the segment.

        Args:
            corpus_id: Corpus ID containing the text
            text_id: Text ID from get_corpus_info()
            char_offset: Starting character position (0-based, default: 0)
            char_length: Number of characters to return (default: 2000)
        """
        result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}")
        content = result.get("content", "")
        data = result.get("data", result)

        if not content:
            return f"No text content found for text_id={text_id}"

        total_chars = len(content)
        segment = content[char_offset: char_offset + char_length]
        segment_end = char_offset + len(segment)
        has_more = segment_end < total_chars

        filename = data.get("filename", data.get("name", "unknown"))

        lines = [
            f"Text: {filename}",
            f"Total: {total_chars} chars | Segment: {char_offset}–{segment_end}"
            + (" [more follows]" if has_more else " [end of text]"),
            "",
            f"--- SEGMENT [{char_offset}:{segment_end}] ---",
            segment,
            "--- END SEGMENT ---",
            "",
            f"Annotation offset guide:",
            f"  This segment starts at absolute position {char_offset}.",
            f"  Add {char_offset} to any relative position within this segment to get the absolute offset.",
            f"  Use absolute offsets for startPosition/endPosition in save_annotation().",
        ]
        if has_more:
            next_offset = segment_end
            lines.append(
                f"\nNext segment: get_text_segment(corpus_id='{corpus_id}', text_id='{text_id}', "
                f"char_offset={next_offset}, char_length={char_length})"
            )
        return "\n".join(lines)

    @mcp.tool()
    async def load_annotation(
        corpus_name: str,
        archive_id: str,
    ) -> str:
        """Load a specific annotation archive by ID.

        When to use: To review or update an existing annotation archive.
        Returns the full archive data including all annotation spans.

        Args:
            corpus_name: Corpus display name
            archive_id: Archive ID from list_annotations()
        """
        result = await client.get(
            f"/api/annotation/load/{corpus_name}/{archive_id}"
        )
        data = result.get("data", result)

        if not data:
            return f"Archive not found: {archive_id}"

        framework = data.get("framework", "?")
        category = data.get("frameworkCategory", "")
        text_name = data.get("textName", "")
        coder = data.get("annotator", data.get("coderName", ""))
        timestamp = data.get("timestamp", "")
        text = data.get("text", "")
        annotations = data.get("annotations", [])

        lines = [
            f"Archive: {archive_id}",
            f"Framework: {framework} ({category})",
            f"Text: {text_name}",
            f"Coder: {coder}",
            f"Timestamp: {timestamp}",
            f"Annotations: {len(annotations)} spans",
            "",
        ]

        if annotations:
            lines.append(
                f"{'#':<4}{'Label':<25}{'Start':<8}{'End':<8}{'Text':<40}"
            )
            lines.append("-" * 85)
            for i, ann in enumerate(annotations, 1):
                label = ann.get("label", "?")
                start = ann.get("startPosition", "?")
                end = ann.get("endPosition", "?")
                span_text = ann.get("text", "")[:37]
                remark = ann.get("remark", "")
                line = f"{i:<4}{label:<25}{start:<8}{end:<8}{span_text:<40}"
                if remark:
                    line += f"  [{remark}]"
                lines.append(line)

        if text:
            lines.append(f"\n--- TEXT ({len(text)} chars) ---")
            lines.append(text[:2000])
            if len(text) > 2000:
                lines.append(f"... ({len(text) - 2000} more characters)")

        return "\n".join(lines)

    @mcp.tool()
    async def list_annotations(
        corpus_name: str,
        text_id: Optional[str] = None,
        annotation_type: str = "text",
    ) -> str:
        """List annotation archives for a specific corpus.

        When to use: To find existing annotations for a corpus, check what has
        been annotated, or find archive_ids for load_annotation().

        Args:
            corpus_name: Corpus display name
            text_id: Filter by specific text ID (None = all texts)
            annotation_type: "text" or "multimodal" (default: "text")
        """
        params = {"type": annotation_type}
        if text_id:
            params["text_id"] = text_id

        result = await client.get(
            f"/api/annotation/list/{corpus_name}", params=params
        )
        raw_data = result.get("data", result) if isinstance(result, dict) else result
        if isinstance(raw_data, dict):
            data = raw_data.get("archives", [])
        elif isinstance(raw_data, list):
            data = raw_data
        else:
            data = []

        if data:
            lines = [
                f"Annotation Archives for '{corpus_name}'"
                + (f" (text_id={text_id})" if text_id else ""),
                "",
                f"{'ID':<40}{'Framework':<25}{'Text':<25}{'Coder':<12}{'Date':<20}",
                "-" * 122,
            ]
            for arch in data:
                aid = arch.get("id", "?")
                fw = arch.get("framework", "")
                tname = arch.get("textName", arch.get("text_name", ""))[:22]
                coder = arch.get("annotator", "")[:10]
                ts = arch.get("timestamp", "")[:18]
                lines.append(f"{aid:<40}{fw:<25}{tname:<25}{coder:<12}{ts:<20}")
            return "\n".join(lines)

        return f"No annotation archives found for corpus '{corpus_name}'."

    @mcp.tool()
    async def list_all_annotations(
        annotation_type: str = "text",
    ) -> str:
        """List all annotation archives across all corpora.

        When to use: To get an overview of all existing annotations in the system.

        Args:
            annotation_type: "text" or "multimodal" (default: "text")
        """
        result = await client.get(
            "/api/annotation/list-all", params={"type": annotation_type}
        )
        raw_data = result.get("data", result) if isinstance(result, dict) else result
        if isinstance(raw_data, dict):
            data = raw_data.get("archives", [])
        elif isinstance(raw_data, list):
            data = raw_data
        else:
            data = []

        if data:
            lines = [
                "All Annotation Archives\n",
                f"{'ID':<40}{'Corpus':<20}{'Framework':<25}{'Text':<20}{'Coder':<10}",
                "-" * 115,
            ]
            for arch in data:
                aid = arch.get("id", "?")
                corpus = arch.get("corpusName", "")[:18]
                fw = arch.get("framework", "")[:23]
                tname = arch.get("textName", "")[:18]
                coder = arch.get("annotator", "")[:8]
                lines.append(
                    f"{aid:<40}{corpus:<20}{fw:<25}{tname:<20}{coder:<10}"
                )
            lines.append(f"\nTotal: {len(data)} archives")
            return "\n".join(lines)

        return "No annotation archives found."

    @mcp.tool()
    async def delete_annotation(
        corpus_name: str,
        archive_id: str,
    ) -> str:
        """Delete an annotation archive.

        When to use: To remove an annotation archive that is no longer needed.
        This action is irreversible.

        Args:
            corpus_name: Corpus display name
            archive_id: Archive ID to delete
        """
        result = await client.delete(
            f"/api/annotation/{corpus_name}/{archive_id}"
        )

        if result.get("success", False):
            return f"Archive {archive_id} deleted successfully."
        else:
            error = result.get("error", result.get("message", "Unknown error"))
            return f"Failed to delete archive: {error}"
