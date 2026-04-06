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

# Remove macOS AppleDouble resource-fork files (._*) from the PyInstaller bundle
# BEFORE any matplotlib import, which crashes on these binary files when scanning stylelib.
if getattr(sys, 'frozen', False):
    _internal = os.path.join(os.path.dirname(sys.executable), '_internal')
    if os.path.isdir(_internal):
        for _root, _dirs, _files in os.walk(_internal):
            for _f in _files:
                if _f.startswith('._'):
                    try:
                        os.remove(os.path.join(_root, _f))
                    except OSError:
                        pass

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
    try:
        main()
    except (ValueError, OSError):
        # Suppress "I/O operation on closed file" on shutdown
        pass
