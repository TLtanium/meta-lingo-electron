"""
Entry point for the Meta-Lingo MCP server.

Usage:
    python -m mcp_server                          # stdio (for Claude Desktop)
    python -m mcp_server --transport http          # Streamable HTTP (for Claude.ai)
    python -m mcp_server --backend-url http://127.0.0.1:8000
"""
import sys
import os
import argparse

# Ensure backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp_server.server import create_server


def main():
    parser = argparse.ArgumentParser(description="Meta-Lingo MCP Server")
    parser.add_argument(
        "--backend-url",
        default=os.environ.get("METALINGO_BACKEND_URL", "http://127.0.0.1:8000"),
        help="URL of the Meta-Lingo FastAPI backend (default: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default=os.environ.get("METALINGO_MCP_TRANSPORT", "stdio"),
        help="Transport mode: stdio (Claude Desktop) or http (Claude.ai web) (default: stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("METALINGO_MCP_PORT", "8001")),
        help="Port for HTTP transport (default: 8001)",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("METALINGO_MCP_HOST", "127.0.0.1"),
        help="Host for HTTP transport (default: 127.0.0.1)",
    )
    args = parser.parse_args()

    server = create_server(args.backend_url)

    if args.transport == "http":
        server.run(transport="streamable-http", host=args.host, port=args.port)
    else:
        server.run(transport="stdio")


if __name__ == "__main__":
    main()
