"""
Tool executor for Agent Chat mode.
Reuses MCP tool functions by creating a FastMCP server instance
and extracting the registered async functions. This avoids duplicating
the 56 tool implementations and their REST API call logic.
"""
import json
import logging
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.tools import (
    corpus, analysis, concordance, semantic,
    sketch, topic, export, reference, annotation, biblio, dmip, task,
)

logger = logging.getLogger(__name__)

_TOOL_MODULES = [
    corpus, analysis, concordance, semantic,
    sketch, topic, export, reference, annotation, biblio, dmip, task,
]

MAX_RESULT_LEN = 4000  # Default truncation limit for tool results
# Large-context tools (full text + analysis context) — no truncation
_NO_TRUNCATE_TOOLS = {
    "dmip_analysis", "get_text_content", "get_text_segment", "get_text_sentences",
    # Task tools: read_task_results can be large; others are short status strings
    "read_task_results",
}


class ToolExecutor:
    """Executes MCP tools by calling their original async functions."""

    def __init__(self, backend_url: str = "http://127.0.0.1:8000"):
        self._tools: dict[str, Any] = {}
        self._client = MetaLingoClient(backend_url)
        self._load_tools()

    def _load_tools(self):
        """Register all MCP tools and extract their async functions."""
        mcp = FastMCP("agent-executor")
        for module in _TOOL_MODULES:
            module.register(mcp, self._client)

        # Extract tool functions from FastMCP internal registry
        if hasattr(mcp, "_tool_manager") and hasattr(mcp._tool_manager, "_tools"):
            for name, tool_obj in mcp._tool_manager._tools.items():
                if hasattr(tool_obj, "fn"):
                    self._tools[name] = tool_obj.fn

        logger.info("ToolExecutor loaded %d tools", len(self._tools))

    @property
    def available_tools(self) -> list[str]:
        return list(self._tools.keys())

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Execute a tool by name with the given arguments.
        Returns the tool result as a string, truncated if too long."""
        fn = self._tools.get(tool_name)
        if fn is None:
            return f"Error: Unknown tool '{tool_name}'. Available: {', '.join(sorted(self._tools.keys()))}"

        try:
            # Remove save_path from arguments (no CSV export in agent mode)
            arguments.pop("save_path", None)
            result = await fn(**arguments)
            result_str = str(result) if result is not None else "Done (no output)."
        except Exception as e:
            logger.error("Tool %s execution error: %s", tool_name, e, exc_info=True)
            result_str = f"Error executing {tool_name}: {e}"

        # Truncate large results (skip truncation for tools that need full context)
        if tool_name not in _NO_TRUNCATE_TOOLS and len(result_str) > MAX_RESULT_LEN:
            result_str = result_str[:MAX_RESULT_LEN] + f"\n\n... [truncated, {len(result_str)} chars total]"

        return result_str

    async def close(self):
        await self._client.close()
