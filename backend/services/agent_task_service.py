"""
Agent Task Service — manages long-running multi-text analysis tasks.

Per-text results are stored to temporary files (data/agent_tasks/<task_id>/)
so they never accumulate in the LLM context window, enabling complete
analysis of large corpora (20-50+ texts) without context overflow.

v2 additions:
  - plan: structured JSON task plan (texts, dimensions, execution_order)
  - status per text: "success" | "failed" | "skipped" + error_message
  - read_results(index_only=True): two-tier compression — returns only
    task_id+status index rows for context-efficient mid-task progress checks
"""
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

TASK_DIR = Path(__file__).parent.parent / "data" / "agent_tasks"

# Status constants
STATUS_SUCCESS = "success"
STATUS_FAILED  = "failed"
STATUS_SKIPPED = "skipped"

_STATUS_ICON = {STATUS_SUCCESS: "✓", STATUS_FAILED: "✗", STATUS_SKIPPED: "–"}


class AgentTaskService:
    """
    Manages persistent task state with temporary file storage.

    Directory layout:
        data/agent_tasks/<task_id>/
            manifest.json      — task metadata + completed text index
            plan.json          — structured analysis plan (if provided)
            <safe_text_id>.md  — per-text analysis result (one file per text)
    """

    def __init__(self):
        TASK_DIR.mkdir(parents=True, exist_ok=True)

    # ── Create ────────────────────────────────────────────────────────────────

    def create_task(
        self,
        task_type: str,
        corpus_id: str,
        total_texts: int,
        session_hint: str = "",
        plan: Optional[dict] = None,
    ) -> str:
        """Create a new task and return its task_id.

        Args:
            task_type: e.g. "dmip", "metaphor", "multi-dimension"
            corpus_id: Corpus being analyzed
            total_texts: How many texts will be processed
            session_hint: Optional human-readable label
            plan: Structured task plan dict (from plan_analysis_task tool).
                  Saved to plan.json alongside the manifest.
        """
        task_id = str(uuid.uuid4())[:8]
        task_dir = TASK_DIR / task_id
        task_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            "task_id": task_id,
            "task_type": task_type,
            "corpus_id": corpus_id,
            "total_texts": total_texts,
            "session_hint": session_hint,
            "created_at": datetime.now().isoformat(),
            "texts": {},          # text_id → {label, file, saved_at, status, error_message}
            "failed_count": 0,
            "skipped_count": 0,
            "has_plan": plan is not None,
        }
        (task_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        if plan:
            (task_dir / "plan.json").write_text(
                json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8"
            )

        logger.info(
            "Created task %s (%s, %d texts, plan=%s)",
            task_id, task_type, total_texts, plan is not None,
        )
        return task_id

    # ── Save one text result ──────────────────────────────────────────────────

    def save_result(
        self,
        task_id: str,
        text_id: str,
        text_label: str,
        content: str,
        status: str = STATUS_SUCCESS,
        error_message: str = "",
    ) -> tuple[int, int]:
        """
        Save the analysis result for one text.

        Args:
            task_id: From create_task / plan_analysis_task
            text_id: The text's ID in the corpus
            text_label: Human-readable filename / label
            content: Complete analysis result (markdown or structured text).
                     For failed/skipped texts, pass error detail or empty string.
            status: "success" | "failed" | "skipped"
            error_message: Human-readable error description (for failed texts)

        Returns:
            (completed_count, total_texts) — all statuses count as "completed"
        Raises:
            ValueError: if task_id not found
        """
        valid_statuses = {STATUS_SUCCESS, STATUS_FAILED, STATUS_SKIPPED}
        if status not in valid_statuses:
            status = STATUS_SUCCESS

        task_dir = TASK_DIR / task_id
        if not task_dir.exists():
            raise ValueError(f"Task '{task_id}' not found")

        # Build a filesystem-safe filename
        safe = "".join(c if c.isalnum() or c in "._- " else "_" for c in text_id)[:60]
        filename = f"{safe}.md"

        # Always write the file (even for failed: may contain error trace or empty)
        (task_dir / filename).write_text(content or "", encoding="utf-8")

        # Update manifest
        manifest_path = task_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        manifest["texts"][text_id] = {
            "label": text_label,
            "file": filename,
            "saved_at": datetime.now().isoformat(),
            "status": status,
            "error_message": error_message if error_message else None,
        }

        # Maintain counters
        if status == STATUS_FAILED:
            manifest["failed_count"] = manifest.get("failed_count", 0) + 1
        elif status == STATUS_SKIPPED:
            manifest["skipped_count"] = manifest.get("skipped_count", 0) + 1

        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        completed = len(manifest["texts"])
        total = manifest["total_texts"]
        logger.info(
            "Task %s: saved '%s' (%d/%d) status=%s",
            task_id, text_label, completed, total, status,
        )
        return completed, total

    # ── Read results ──────────────────────────────────────────────────────────

    def read_results(self, task_id: str, index_only: bool = False) -> str:
        """
        Read saved per-text results and return as a formatted string.

        Args:
            task_id: The task to read
            index_only: When True, return only the status index (task_id + status + label
                        per text) — suitable for mid-task progress checks without loading
                        full analysis content into the context window.
                        When False (default), return full content for final aggregation.

        Returns:
            Formatted string ready for LLM consumption.
        """
        task_dir = TASK_DIR / task_id
        if not task_dir.exists():
            return f"Task '{task_id}' not found."

        manifest = json.loads((task_dir / "manifest.json").read_text(encoding="utf-8"))
        texts = manifest.get("texts", {})
        total = manifest["total_texts"]
        completed = len(texts)
        task_type = manifest.get("task_type", "?")
        corpus_id = manifest.get("corpus_id", "?")
        failed_count = manifest.get("failed_count", 0)
        skipped_count = manifest.get("skipped_count", 0)
        success_count = completed - failed_count - skipped_count

        if not texts:
            return f"Task {task_id}: no results saved yet (0/{total})."

        # ── Index-only mode (二级压缩 — context-efficient progress view) ──────
        if index_only:
            lines = [
                f"=== Task {task_id} — Index ({completed}/{total}) ===",
                f"Type: {task_type} | Corpus: {corpus_id}",
                f"✓ Success: {success_count}  ✗ Failed: {failed_count}  – Skipped: {skipped_count}",
                "",
            ]
            for text_id, info in texts.items():
                icon = _STATUS_ICON.get(info.get("status", STATUS_SUCCESS), "?")
                label = info.get("label", text_id)
                status_str = info.get("status", STATUS_SUCCESS)
                err = info.get("error_message") or ""
                suffix = f" — ERROR: {err}" if err else ""
                lines.append(f"  {icon} [{text_id}] {label}  ({status_str}){suffix}")

            remaining = total - completed
            if remaining > 0:
                lines.append("")
                lines.append(f"  … {remaining} text(s) not yet processed")

            return "\n".join(lines)

        # ── Full mode (final aggregation) ─────────────────────────────────────
        parts = [
            f"=== Task {task_id} — All Saved Results ===",
            f"Type: {task_type} | Corpus: {corpus_id}",
            f"Total: {completed}/{total} | ✓ {success_count} success  ✗ {failed_count} failed  – {skipped_count} skipped",
            "",
        ]

        # Successful results first
        for text_id, info in texts.items():
            if info.get("status") in (STATUS_FAILED, STATUS_SKIPPED):
                continue
            label = info.get("label", text_id)
            file_path = task_dir / info.get("file", "")
            parts.append("=" * 60)
            parts.append(f"TEXT: {label}  (id: {text_id})")
            parts.append("=" * 60)
            if file_path.exists():
                parts.append(file_path.read_text(encoding="utf-8").strip())
            else:
                parts.append("(result file missing)")
            parts.append("")

        # Failed / skipped section
        failed_entries = {
            tid: info for tid, info in texts.items()
            if info.get("status") in (STATUS_FAILED, STATUS_SKIPPED)
        }
        if failed_entries:
            parts.append("=" * 60)
            parts.append("FAILED / SKIPPED TEXTS — require follow-up")
            parts.append("=" * 60)
            for text_id, info in failed_entries.items():
                status_str = info.get("status", STATUS_FAILED)
                icon = _STATUS_ICON.get(status_str, "?")
                label = info.get("label", text_id)
                err = info.get("error_message") or "(no error message)"
                parts.append(f"{icon} [{text_id}] {label}")
                parts.append(f"   Status: {status_str}")
                parts.append(f"   Error:  {err}")
                parts.append("")

        return "\n".join(parts)

    # ── Status ────────────────────────────────────────────────────────────────

    def get_status(self, task_id: str) -> Optional[dict]:
        """Return task status dict, or None if task_id not found."""
        manifest_path = TASK_DIR / task_id / "manifest.json"
        if not manifest_path.exists():
            return None

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        texts = manifest.get("texts", {})
        completed = len(texts)
        total = manifest["total_texts"]
        failed_count = manifest.get("failed_count", 0)
        skipped_count = manifest.get("skipped_count", 0)
        labels = [info.get("label", tid) for tid, info in texts.items()]

        return {
            "task_id": task_id,
            "task_type": manifest.get("task_type", "?"),
            "corpus_id": manifest.get("corpus_id", "?"),
            "completed": completed,
            "total": total,
            "pct": round(completed / total * 100, 1) if total > 0 else 0.0,
            "failed_count": failed_count,
            "skipped_count": skipped_count,
            "success_count": completed - failed_count - skipped_count,
            "completed_labels": labels,
            "has_plan": manifest.get("has_plan", False),
        }

    # ── Get plan ──────────────────────────────────────────────────────────────

    def get_plan(self, task_id: str) -> Optional[dict]:
        """Return the structured plan for this task, or None if not found."""
        plan_path = TASK_DIR / task_id / "plan.json"
        if not plan_path.exists():
            return None
        try:
            return json.loads(plan_path.read_text(encoding="utf-8"))
        except Exception:
            return None

    # ── Cleanup ───────────────────────────────────────────────────────────────

    def cleanup_tasks(self, task_ids: list[str]) -> int:
        """Delete task directories for the given task_ids. Returns count removed."""
        removed = 0
        for tid in task_ids:
            # Sanitise: only accept short hex-like IDs to prevent path traversal
            if not tid or not all(c in "abcdef0123456789-" for c in tid.lower()):
                continue
            task_dir = TASK_DIR / tid
            if task_dir.is_dir():
                try:
                    import shutil
                    shutil.rmtree(task_dir)
                    removed += 1
                    logger.info("Cleaned up task directory: %s", tid)
                except Exception as e:
                    logger.warning("Failed to remove task dir %s: %s", tid, e)
        return removed

    # ── List ──────────────────────────────────────────────────────────────────

    def list_tasks(self) -> list[dict]:
        """Return summary of all task directories."""
        result = []
        for d in sorted(TASK_DIR.iterdir()):
            if not d.is_dir():
                continue
            mp = d / "manifest.json"
            if not mp.exists():
                continue
            try:
                m = json.loads(mp.read_text(encoding="utf-8"))
                completed = len(m.get("texts", {}))
                result.append({
                    "task_id": m.get("task_id", d.name),
                    "task_type": m.get("task_type", "?"),
                    "corpus_id": m.get("corpus_id", "?"),
                    "completed": completed,
                    "total": m.get("total_texts", 0),
                    "failed_count": m.get("failed_count", 0),
                    "has_plan": m.get("has_plan", False),
                    "created_at": m.get("created_at", ""),
                })
            except Exception:
                pass
        return result


# ── Singleton ─────────────────────────────────────────────────────────────────

_instance: Optional[AgentTaskService] = None


def get_task_service() -> AgentTaskService:
    global _instance
    if _instance is None:
        _instance = AgentTaskService()
    return _instance
