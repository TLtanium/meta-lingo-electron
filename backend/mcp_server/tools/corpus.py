"""
Corpus management tools for Meta-Lingo MCP server.
Tools: list_corpora, create_corpus, upload_text, upload_directory,
       get_corpus_info, list_corpus_upload_tasks, get_processing_task_status,
       update_corpus_metadata, update_text_metadata
"""
from __future__ import annotations

from typing import Optional

from mcp.server.fastmcp import FastMCP

from mcp_server.api_client import MetaLingoClient
from mcp_server.metadata_defaults import (
    build_upload_config,
    merge_corpus_defaults,
    normalize_date,
)
from mcp_server.upload_filename_guard import mcp_upload_filename_blocked_reason
from mcp_server.task_queue import wait_until_corpus_spacy_idle


def _truncate(s: str, max_len: int = 120) -> str:
    s = (s or "").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def list_corpora() -> str:
        """Discover all corpora in the Meta-Lingo workspace.

        When to use: First step before any analysis or upload; lists corpus IDs,
        languages, text counts, tags, and a short description (content summary),
        not file paths.

        Returns: Human-readable list. Use the `id` values in other tools.
        """
        result = await client.get("/api/corpus/list")
        corpora = result.get("data", [])
        if not corpora:
            return "No corpora found. Use create_corpus to create one."
        lines = []
        for c in corpora:
            tags = ", ".join(c.get("tags", [])) if c.get("tags") else ""
            tag_str = f" [tags: {tags}]" if tags else ""
            desc = c.get("description") or ""
            desc_str = f"\n    desc: {_truncate(desc)}" if desc else ""
            lines.append(
                f"- {c['name']} (id={c['id']}, lang={c.get('language', '?')}, "
                f"texts={c.get('text_count', 0)}){tag_str}{desc_str}"
            )
        return f"Found {len(corpora)} corpus/corpora:\n" + "\n".join(lines)

    @mcp.tool()
    async def create_corpus(
        name: str,
        language: str = "english",
        description: str = "",
        author: str = "",
        source: str = "",
        text_type: str = "",
    ) -> str:
        """Create a new empty corpus in Meta-Lingo (Corpus Management).

        When to use: When no suitable corpus exists for new texts.

        Description must summarize the *subject matter* of the texts you will add,
        not a folder path or filename. If you have no text yet, leave description
        empty and set it on first upload via upload_text(corpus_description=...).

        After creating, call upload_text to add texts.

        Args:
            name: Display name (e.g. "Political speeches 2024")
            language: "english" or "chinese"
            description: Short content-focused summary (not a path)
            author: Optional corpus-level author
            source: Optional corpus-level source (default empty; upload can use "File Upload")
            text_type: Optional USAS text type code for the corpus (e.g. GEN); empty = unset
        """
        payload = {
            "name": name,
            "language": language,
            "description": description,
        }
        if author:
            payload["author"] = author
        if source:
            payload["source"] = source
        if text_type:
            payload["text_type"] = text_type

        result = await client.post("/api/corpus/create", json_data=payload)
        if result.get("success"):
            corpus = result.get("data", result)
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
        filename: str = "",
        content: str = "",
        filepath: Optional[str] = None,
        date: Optional[str] = None,
        author: Optional[str] = None,
        source: Optional[str] = None,
        text_type: Optional[str] = None,
        text_description: Optional[str] = None,
        corpus_description: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        """Queue a text file for upload and background annotation.

        When to use: Ingest plain text into a corpus.

        IMPORTANT: This MCP server runs LOCALLY on the user's machine and can read
        local files directly. Use `filepath` to upload from a local path, or `content`
        to pass text directly. You do NOT need the user to copy-paste file contents.

        Two ways to provide text:
        - filepath: Local file path (e.g. "/Users/me/docs/speech.txt"). The server
          reads the file directly. Filename is auto-derived from the path if omitted.
        - content: Raw text string (for generated or inline text).
        At least one of filepath or content must be provided.

        **MCP serial queue (per corpus):** Before saving the next file, this tool waits
        until no other ``spacy_annotation`` task for this corpus is ``pending`` or
        ``processing``.

        After this call returns, do not chain analysis tools in the same turn until
        annotation is done; use list_corpus_upload_tasks / get_processing_task_status,
        or ask the user to confirm in the app.

        macOS: Filenames starting with ``._`` (AppleDouble), ``.DS_Store``, or any
        hidden basename starting with ``.`` are rejected — do not upload them.

        Args:
            corpus_id: Target corpus ID (from list_corpora or create_corpus)
            filename: Filename (e.g. speech_01.txt); auto-derived from filepath if omitted
            content: Full text body (alternative to filepath)
            filepath: Local file path to read text from (alternative to content)
            date: Optional YYYY-MM-DD, or four-digit year, or omit for today
            author: Optional author; falls back to corpus author
            source: Optional source; falls back to corpus source or "File Upload"
            text_type: USAS text type (e.g. GEN); falls back to corpus text_type or GEN
            text_description: Optional per-text description (stored in text metadata)
            corpus_description: If set, updates the corpus `description` (must be a
                short summary of content, not a path)
            tags: Optional tags applied to this upload (same as UI)
        """
        import os

        # Read content from local file if filepath provided
        if filepath:
            filepath = os.path.expanduser(filepath)
            if not os.path.isfile(filepath):
                return f"File not found: {filepath}"
            try:
                from services.encoding_utils import read_text_file
                content, _enc = read_text_file(filepath)
            except Exception as e:
                return f"Failed to read file: {e}"
            if not filename:
                filename = os.path.basename(filepath)

        if not content:
            return "No content provided. Use filepath (local file path) or content (text string)."

        if not filename:
            return "No filename provided."

        if not filename.endswith(".txt"):
            filename += ".txt"

        blocked = mcp_upload_filename_blocked_reason(filename)
        if blocked:
            return blocked

        corp_resp = await client.get(f"/api/corpus/{corpus_id}")
        corpus_data = corp_resp.get("data") or {}
        language = corpus_data.get("language") or "english"

        try:
            await wait_until_corpus_spacy_idle(client, corpus_id)
        except TimeoutError as e:
            return str(e)

        eff_author, eff_source, eff_tt = merge_corpus_defaults(
            corpus_data,
            author=author,
            source=source,
            text_type=text_type,
        )
        date_iso = normalize_date(date)
        config = build_upload_config(
            language=language,
            tags=tags,
            date_iso=date_iso,
            author=eff_author,
            source=eff_source,
            text_type=eff_tt,
            text_description=text_description,
        )

        result = await client.upload_text_content(
            corpus_id, filename, content, config=config
        )

        if corpus_description and corpus_description.strip():
            await client.put(
                f"/api/corpus/{corpus_id}",
                json_data={"description": corpus_description.strip()},
            )

        if not result.get("success"):
            return f"Upload failed: {result.get('message', 'unknown error')}"

        rows = result.get("data") or []
        if not rows:
            return "Upload returned no file results."

        first = rows[0]
        text_id = first.get("text_id", "?")
        task_id = first.get("task_id")
        msg = first.get("message", "")

        lines = [
            f"Upload accepted for '{filename}' in corpus {corpus_id}.",
            f"  text_id: {text_id}",
        ]
        if task_id:
            lines.append(f"  task_id: {task_id} (background annotation in progress)")
        lines.extend(
            [
                f"  Server message: {msg}",
                "",
                "Annotation runs in the background. Do not run analysis on this text until",
                "processing completes. Use list_corpus_upload_tasks or get_processing_task_status",
                "with the task_id, or wait and ask the user to confirm in Meta-Lingo.",
            ]
        )
        return "\n".join(lines)

    @mcp.tool()
    async def upload_directory(
        corpus_id: str,
        directory: str,
        pattern: str = "*.txt",
        date: Optional[str] = None,
        author: Optional[str] = None,
        source: Optional[str] = None,
        text_type: Optional[str] = None,
        corpus_description: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        """Upload all text files from a local directory to a corpus.

        When to use: Batch-upload an entire folder of text files. This MCP server
        runs LOCALLY and can read files directly from the user's filesystem.

        Scans the directory for files matching the pattern (default: *.txt),
        skips macOS junk files (._*, .DS_Store), and uploads each file sequentially
        (waiting for prior annotation to finish before uploading the next).

        Args:
            corpus_id: Target corpus ID
            directory: Local directory path (e.g. "/Users/me/corpus_texts/")
            pattern: Glob pattern for files to upload (default: "*.txt")
            date: Optional date for all files (YYYY-MM-DD or YYYY)
            author: Optional author for all files
            source: Optional source for all files
            text_type: USAS text type (e.g. GEN)
            corpus_description: Update corpus description (content summary, not path)
            tags: Optional tags for all uploads
        """
        import os
        import glob as globmod

        directory = os.path.expanduser(directory)
        if not os.path.isdir(directory):
            return f"Directory not found: {directory}"

        file_pattern = os.path.join(directory, pattern)
        files = sorted(globmod.glob(file_pattern))
        if not files:
            return f"No files matching '{pattern}' in {directory}"

        # Filter out macOS junk
        valid_files = []
        for f in files:
            basename = os.path.basename(f)
            blocked = mcp_upload_filename_blocked_reason(basename)
            if not blocked:
                valid_files.append(f)

        if not valid_files:
            return f"All {len(files)} files were filtered out (macOS junk/hidden files)."

        # Get corpus info for defaults
        corp_resp = await client.get(f"/api/corpus/{corpus_id}")
        corpus_data = corp_resp.get("data") or {}
        language = corpus_data.get("language") or "english"

        # Update corpus description if provided
        if corpus_description and corpus_description.strip():
            await client.put(
                f"/api/corpus/{corpus_id}",
                json_data={"description": corpus_description.strip()},
            )

        uploaded = []
        failed = []

        for filepath in valid_files:
            basename = os.path.basename(filepath)
            try:
                from services.encoding_utils import read_text_file
                content, _enc = read_text_file(filepath)
            except Exception as e:
                failed.append(f"{basename}: read error - {e}")
                continue

            if not content.strip():
                failed.append(f"{basename}: empty file")
                continue

            fname = basename if basename.endswith(".txt") else basename + ".txt"

            try:
                await wait_until_corpus_spacy_idle(client, corpus_id)
            except TimeoutError as e:
                failed.append(f"{basename}: queue timeout - {e}")
                continue

            eff_author, eff_source, eff_tt = merge_corpus_defaults(
                corpus_data, author=author, source=source, text_type=text_type,
            )
            date_iso = normalize_date(date)
            config = build_upload_config(
                language=language, tags=tags, date_iso=date_iso,
                author=eff_author, source=eff_source, text_type=eff_tt,
            )

            try:
                result = await client.upload_text_content(
                    corpus_id, fname, content, config=config,
                )
                if result.get("success"):
                    rows = result.get("data") or []
                    text_id = rows[0].get("text_id", "?") if rows else "?"
                    uploaded.append(f"{fname} → {text_id}")
                else:
                    failed.append(f"{fname}: {result.get('message', 'unknown error')}")
            except Exception as e:
                failed.append(f"{fname}: {e}")

        lines = [
            f"Batch upload from: {directory}",
            f"Successfully uploaded: {len(uploaded)} / {len(valid_files)} files",
        ]
        if uploaded:
            lines.append("")
            for u in uploaded:
                lines.append(f"  ✓ {u}")
        if failed:
            lines.append(f"\nFailed ({len(failed)}):")
            for f_msg in failed:
                lines.append(f"  ✗ {f_msg}")
        lines.append(
            "\nAnnotation runs in the background. Wait for all tasks to complete "
            "before running analysis. Use list_corpus_upload_tasks to check progress."
        )
        return "\n".join(lines)

    @mcp.tool()
    async def list_corpus_upload_tasks(corpus_id: str) -> str:
        """List background processing tasks for a corpus (upload / SpaCy / media).

        When to use: After upload_text to see which jobs are pending, running, or done.
        Pairs with task_id returned by upload_text.

        Args:
            corpus_id: Corpus ID
        """
        result = await client.get(f"/api/corpus/{corpus_id}/tasks")
        tasks = result.get("data") or []
        if not tasks:
            return f"No tasks recorded for corpus {corpus_id}."
        lines = [f"Tasks for corpus {corpus_id} ({len(tasks)}):\n"]
        for t in tasks:
            tid = t.get("id", "?")
            st = t.get("status", "?")
            tt = t.get("task_type", "?")
            msg = t.get("message", "")
            prog = t.get("progress", "")
            lines.append(f"  - {tid}  status={st}  type={tt}  progress={prog}")
            if msg:
                lines.append(f"      {msg}")
        return "\n".join(lines)

    @mcp.tool()
    async def get_processing_task_status(task_id: str) -> str:
        """Get status and progress for a single background task.

        When to use: Poll a task_id from upload_text or list_corpus_upload_tasks until
        status is completed or failed.

        Status values typically include: pending, processing, completed, failed.

        Args:
            task_id: Task UUID from upload or task list
        """
        result = await client.get(f"/api/corpus/tasks/{task_id}")
        task = result.get("data") or {}
        if not task:
            return f"Task not found: {task_id}"
        lines = [
            f"Task {task_id}",
            f"  status: {task.get('status', '?')}",
            f"  type: {task.get('task_type', '?')}",
            f"  progress: {task.get('progress', '')}",
            f"  message: {task.get('message', '')}",
        ]
        if task.get("error"):
            lines.append(f"  error: {task['error']}")
        return "\n".join(lines)

    @mcp.tool()
    async def get_corpus_info(corpus_id: str) -> str:
        """Inspect one corpus and list all texts with IDs for downstream tools.

        When to use: Before word_frequency, KWIC, etc., to obtain text_ids; also to read
        corpus description and metadata.

        Args:
            corpus_id: Corpus ID
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

    @mcp.tool()
    async def update_corpus_metadata(
        corpus_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
        author: Optional[str] = None,
        source: Optional[str] = None,
        text_type: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        """Update metadata for an existing corpus.

        When to use: To change the name, description, default author, source, language,
        USAS text_type, or tags on a corpus that was already created.
        Only the fields you provide will be updated; omitted fields are left unchanged.

        Args:
            corpus_id: Corpus ID (from list_corpora)
            name: New display name for the corpus
            description: Short content-focused summary of the corpus
            language: Corpus language (e.g. "english", "chinese")
            author: Default author for texts in this corpus
            source: Default source/origin for texts in this corpus
            text_type: USAS text type code (e.g. "GEN"); empty string clears it
            tags: Replace the corpus tag list (empty list clears all tags)
        """
        payload: dict = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if language is not None:
            payload["language"] = language
        if author is not None:
            payload["author"] = author
        if source is not None:
            payload["source"] = source
        if text_type is not None:
            payload["text_type"] = text_type
        if tags is not None:
            payload["tags"] = tags

        if not payload:
            return "No fields to update. Provide at least one argument."

        result = await client.put(f"/api/corpus/{corpus_id}", json_data=payload)
        if result.get("success"):
            updated = result.get("data", {})
            lines = [f"Corpus {corpus_id} updated successfully."]
            if "name" in payload:
                lines.append(f"  name: {updated.get('name', payload['name'])}")
            if "description" in payload:
                lines.append(f"  description: {updated.get('description', payload['description'])}")
            if "language" in payload:
                lines.append(f"  language: {updated.get('language', payload['language'])}")
            if "author" in payload:
                lines.append(f"  author: {updated.get('author', payload['author'])}")
            if "source" in payload:
                lines.append(f"  source: {updated.get('source', payload['source'])}")
            if "text_type" in payload:
                lines.append(f"  text_type: {updated.get('text_type', payload['text_type'])}")
            if "tags" in payload:
                lines.append(f"  tags: {', '.join(payload['tags']) if payload['tags'] else '(none)'}")
            return "\n".join(lines)
        return f"Failed to update corpus: {result.get('message', result.get('detail', 'unknown error'))}"

    @mcp.tool()
    async def update_text_metadata(
        corpus_id: str,
        text_id: str,
        date: Optional[str] = None,
        author: Optional[str] = None,
        source: Optional[str] = None,
        description: Optional[str] = None,
        filename: Optional[str] = None,
        tags: Optional[list[str]] = None,
        custom_fields: Optional[dict] = None,
    ) -> str:
        """Update metadata for an individual text in a corpus.

        When to use: To fix or enrich the date, author, source, description, filename,
        tags, or custom metadata fields of a text that was already uploaded.
        Only the fields you provide will be updated; omitted fields are left unchanged.
        Custom fields are merged with existing ones (not replaced entirely).

        Args:
            corpus_id: Corpus ID containing the text
            text_id: Text ID (from get_corpus_info)
            date: Publication/collection date. Accepts YYYY-MM-DD, YYYY-MM, or YYYY.
            author: Author of the text
            source: Source/origin of the text (e.g. "BBC News", "Survey 2024")
            description: Short description or abstract for this text
            filename: Rename the text file (must end in .txt for text files)
            tags: Replace the text's tag list (empty list clears all tags)
            custom_fields: Key-value pairs merged into existing custom fields
                           (e.g. {"genre": "news", "region": "UK"})
        """
        metadata: dict = {}
        if date is not None:
            metadata["date"] = normalize_date(date) or date
        if author is not None:
            metadata["author"] = author
        if source is not None:
            metadata["source"] = source
        if description is not None:
            metadata["description"] = description
        if custom_fields is not None:
            metadata["custom_fields"] = custom_fields

        payload: dict = {}
        if metadata:
            payload["metadata"] = metadata
        if filename is not None:
            payload["filename"] = filename
        if tags is not None:
            payload["tags"] = tags

        if not payload:
            return "No fields to update. Provide at least one argument."

        result = await client.put(
            f"/api/corpus/{corpus_id}/texts/{text_id}", json_data=payload
        )
        if result.get("success"):
            lines = [f"Text {text_id} updated successfully."]
            if date is not None:
                lines.append(f"  date: {metadata.get('date', date)}")
            if author is not None:
                lines.append(f"  author: {author}")
            if source is not None:
                lines.append(f"  source: {source}")
            if description is not None:
                lines.append(f"  description: {description}")
            if filename is not None:
                lines.append(f"  filename: {filename}")
            if tags is not None:
                lines.append(f"  tags: {', '.join(tags) if tags else '(none)'}")
            if custom_fields:
                lines.append(f"  custom_fields: {custom_fields}")
            return "\n".join(lines)
        return f"Failed to update text: {result.get('message', result.get('detail', 'unknown error'))}"
