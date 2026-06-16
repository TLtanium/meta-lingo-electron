"""
Task management tools for multi-text long-running analyses.

Architecture:
  ① plan_analysis_task  — Planner: create a structured JSON plan + start the task
  ② save_text_result    — Result Callback: save per-text result (success/failed/skipped)
  ③ read_task_results   — Aggregation: full results OR index-only (2-tier compression)
  ④ get_task_status     — Lightweight progress check (no file reads)

MANDATORY WORKFLOW for N > 3 texts:
  1. get_corpus_info(corpus_id)                        → obtain text list
  2. plan_analysis_task(corpus_id, task_type, texts=[…], analysis_dimensions=[…])
                                                       → task_id + printed plan
  3. Per-text (follow plan order):
       a. Call analysis tool(s)
       b. save_text_result(task_id, text_id, text_label, content, status)
       c. Acknowledge "✓ [k/N] label — saved" — do NOT echo full analysis
  4. read_task_results(task_id)                        → final aggregation
"""
from typing import List
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    # ── ① Planner ──────────────────────────────────────────────────────────────

    @mcp.tool()
    async def plan_analysis_task(
        corpus_id: str,
        task_type: str,
        texts: List[dict],
        analysis_dimensions: List[str],
        execution_order: str = "sequential",
        session_hint: str = "",
    ) -> str:
        """Create a structured analysis plan and start a multi-text task.

        WHEN TO USE: Any time you need to analyze MORE THAN 3 TEXTS.
        Call this BEFORE beginning per-text analysis — it fixes the plan.

        WORKFLOW AFTER CALLING THIS:
          For EACH text in the plan (in order):
            1. Run analysis tool(s) for the declared dimensions
            2. save_text_result(task_id, text_id, label, content, status='success')
               → On error: status='failed', error_message='<reason>', content=''
               → On retry success: status='success', content=<full analysis>
            3. Acknowledge "✓ [k/N] label — saved" only; do NOT repeat the analysis
          After ALL texts (including failed ones):
            read_task_results(task_id)   → write cross-text aggregation

        FAULT TOLERANCE:
          - First failure: retry once with the same analysis tool call
          - Retry still fails: save_text_result(..., status='failed', error_message='…')
            and continue with the next text — do NOT abort the whole task
          - All failed/skipped texts are reported together at the end of aggregation

        EXECUTION ORDER:
          "sequential" (default): process one text at a time
          "parallel": batch multiple texts' tool calls in a single message so they
            execute concurrently. Only use when texts are independent and the
            analysis tool is lightweight (e.g., concordance, word frequency per text).

        PLAN TEXT FORMAT (texts arg):
          Each entry must be: {"text_id": "...", "label": "..."}
          Obtain from get_corpus_info(corpus_id) → texts list.

        ANALYSIS DIMENSIONS:
          Declare what you will analyze per text, e.g.:
          ["metaphor", "stance_markers", "topic_distribution"]
          These are recorded in the plan for reference; they do not restrict tool calls.

        Args:
            corpus_id: The corpus being analyzed
            task_type: Short label, e.g. "dmip", "metaphor", "stance", "multi"
            texts: Ordered list of {"text_id": "...", "label": "..."}
            analysis_dimensions: What will be analyzed per text
            execution_order: "sequential" | "parallel"
            session_hint: Optional human label, e.g. "Amazon Report DMIP 2026"
        """
        if not texts:
            return "Error: texts list is empty. Call get_corpus_info first to obtain the text list."

        plan = {
            "corpus_id": corpus_id,
            "task_type": task_type,
            "analysis_dimensions": analysis_dimensions,
            "texts": texts,
            "execution_order": execution_order,
            "total_texts": len(texts),
            "output_schema_version": "2.0",
        }

        result = await client.post("/api/agent/tasks/start", json_data={
            "corpus_id": corpus_id,
            "task_type": task_type,
            "total_texts": len(texts),
            "session_hint": session_hint,
            "plan": plan,
        })
        data = result.get("data", result)
        task_id = data.get("task_id", "unknown")

        dims_str = ", ".join(analysis_dimensions) if analysis_dimensions else "(none declared)"
        text_lines = "\n".join(
            f"  {i+1:>3}. [{t.get('text_id', '?')}] {t.get('label', '?')}"
            for i, t in enumerate(texts)
        )

        fault_note = (
            "FAULT TOLERANCE: On analysis error → retry once → if still failing,\n"
            f"  save_text_result(task_id='{task_id}', ..., status='failed', error_message='<reason>')\n"
            "  then continue to next text."
        )
        parallel_note = (
            "PARALLEL HINT: batch multiple texts' tool calls in ONE message to run them concurrently."
            if execution_order == "parallel" else ""
        )

        return "\n".join(filter(None, [
            f"✓ Task plan created — task_id: {task_id}",
            f"  Type: {task_type} | Corpus: {corpus_id} | Execution: {execution_order}",
            f"  Dimensions: {dims_str}",
            f"  Texts ({len(texts)}):",
            text_lines,
            "",
            f"NEXT STEPS:",
            f"  Process each text in order using task_id='{task_id}'",
            f"  save_text_result(task_id='{task_id}', text_id=..., text_label=...,",
            f"                   content=<full_analysis>, status='success')",
            f"  After ALL texts: read_task_results(task_id='{task_id}')",
            "",
            fault_note,
            parallel_note,
        ]))

    # ── Legacy: start_analysis_task (kept for backward compat) ────────────────

    @mcp.tool()
    async def start_analysis_task(
        corpus_id: str,
        task_type: str,
        total_texts: int,
        session_hint: str = "",
    ) -> str:
        """Start a multi-text analysis task (simple, no plan structure).

        For NEW tasks: prefer plan_analysis_task() — it records the full plan,
        text list, and analysis dimensions for better fault tolerance and aggregation.

        Use start_analysis_task only for very simple sequential tasks where you
        already know the total_texts count but don't need a formal plan.

        Args:
            corpus_id: Corpus being analyzed
            task_type: e.g. "dmip", "metaphor", "concordance"
            total_texts: How many texts will be analyzed in this task
            session_hint: Optional label, e.g. "Amazon DMIP 2026"
        """
        result = await client.post("/api/agent/tasks/start", json_data={
            "corpus_id": corpus_id,
            "task_type": task_type,
            "total_texts": total_texts,
            "session_hint": session_hint,
        })
        data = result.get("data", result)
        task_id = data.get("task_id", "unknown")
        return (
            f"✓ Task started — task_id: {task_id}\n"
            f"  Type: {task_type} | Corpus: {corpus_id} | Total texts: {total_texts}\n"
            f"  Use task_id='{task_id}' in save_text_result() and read_task_results().\n"
            f"  (Tip: use plan_analysis_task() next time for structured planning + fault tolerance)"
        )

    # ── ② Result Callback ──────────────────────────────────────────────────────

    @mcp.tool()
    async def save_text_result(
        task_id: str,
        text_id: str,
        text_label: str,
        content: str,
        status: str = "success",
        error_message: str = "",
    ) -> str:
        """Save one text's analysis result to temporary file storage.

        Call immediately after analyzing each text. The content is written to
        disk and does NOT stay in the conversation context window.

        STATUS SEMANTICS:
          "success"  — analysis completed normally; content = full markdown analysis
          "failed"   — analysis threw an error even after retry; content = "" or error trace
          "skipped"  — text intentionally skipped (e.g., too short, wrong language)

        FAULT TOLERANCE PATTERN:
          try:
            result = [call analysis tool]
            save_text_result(task_id, text_id, label, content=result, status='success')
          except:
            [retry once]
            if retry succeeds:
              save_text_result(..., status='success')
            else:
              save_text_result(..., status='failed', error_message='<reason>', content='')

        CRITICAL RULES:
          - After saving, output ONLY: "✓ [k/N] text_label — saved"
          - Do NOT repeat or summarise the analysis content in your reply
          - Immediately proceed to the next text in the plan

        Args:
            task_id: From plan_analysis_task() or start_analysis_task()
            text_id: The text's ID in the corpus (from get_corpus_info)
            text_label: Human-readable filename/label (e.g. "CEO_letter_2016.txt")
            content: Complete analysis result in markdown format (empty string for failed)
            status: "success" | "failed" | "skipped"
            error_message: What went wrong (for status="failed" only)
        """
        result = await client.post(f"/api/agent/tasks/{task_id}/save", json_data={
            "text_id": text_id,
            "text_label": text_label,
            "content": content,
            "status": status,
            "error_message": error_message,
        })
        data = result.get("data", result)
        completed = data.get("completed", "?")
        total = data.get("total", "?")

        if status == "failed":
            icon = "✗"
            suffix = f" — FAILED: {error_message}" if error_message else " — FAILED"
        elif status == "skipped":
            icon = "–"
            suffix = " — skipped"
        else:
            icon = "✓"
            suffix = " — saved"

        return f"{icon} Saved {completed}/{total}  [{text_id}] {text_label}{suffix}  (task: {task_id})"

    # ── ③ Aggregation ──────────────────────────────────────────────────────────

    @mcp.tool()
    async def read_task_results(
        task_id: str,
        index_only: bool = False,
    ) -> str:
        """Read saved results from a multi-text task.

        TWO MODES (二级压缩策略):

        index_only=False (default) — FINAL AGGREGATION:
          Returns all full per-text analyses concatenated, plus a FAILED/SKIPPED
          section at the end.  Call this ONCE after all texts are processed.
          Use the output to write the cross-text summary and final deliverable.

        index_only=True — MID-TASK PROGRESS INDEX:
          Returns only task_id + status + label per text (no analysis content).
          Use this for a lightweight context-check mid-task, e.g. after 10 of 30
          texts to verify progress without flooding the context window.
          Does NOT replace the final read_task_results() call.

        USAGE PATTERN:
          [optional mid-task] read_task_results(task_id, index_only=True)
                              → "✓ 10/30 processed so far"
          [after all texts]   read_task_results(task_id)
                              → full aggregation content

        Args:
            task_id: From plan_analysis_task() or start_analysis_task()
            index_only: True = status index only; False = full content for aggregation
        """
        params = "?index_only=true" if index_only else ""
        result = await client.get(f"/api/agent/tasks/{task_id}/results{params}")
        data = result.get("data", result)
        return data.get("content", str(result))

    # ── ④ Status ───────────────────────────────────────────────────────────────

    @mcp.tool()
    async def get_task_status(
        task_id: str,
    ) -> str:
        """Get the current progress of a multi-text analysis task.

        Returns completed/total counts and a list of completed text labels.
        Lighter-weight than read_task_results(index_only=True) — use this
        for quick progress checks during the task loop.

        Args:
            task_id: From plan_analysis_task() or start_analysis_task()
        """
        result = await client.get(f"/api/agent/tasks/{task_id}/status")
        data = result.get("data", result)
        if not data or not data.get("task_id"):
            return f"Task '{task_id}' not found."

        completed = data.get("completed", 0)
        total = data.get("total", 0)
        pct = data.get("pct", 0)
        failed = data.get("failed_count", 0)
        skipped = data.get("skipped_count", 0)
        success = data.get("success_count", completed - failed - skipped)
        has_plan = data.get("has_plan", False)
        labels = data.get("completed_labels", [])

        label_lines = "\n".join(f"  ✓ {lb}" for lb in labels) if labels else "  (none yet)"
        plan_note = "  [has structured plan]" if has_plan else ""

        return (
            f"Task {task_id} ({data.get('task_type', '?')}){plan_note}: "
            f"{completed}/{total} texts ({pct}%)\n"
            f"  ✓ {success} success  ✗ {failed} failed  – {skipped} skipped\n"
            f"Completed:\n{label_lines}"
        )
