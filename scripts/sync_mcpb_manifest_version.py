"""Synchronize a Claude MCP manifest from the source release version.

Local development may use PROJECT.md; public source checkouts use package.json.
Usage: python scripts/sync_mcpb_manifest_version.py [manifest_path]
"""
from pathlib import Path
import sys
from sync_version import MCP_MANIFEST_PATH, extract_release_version, sync_json_version


def main() -> int:
    version = extract_release_version()
    if not version:
        print("[ERROR] No valid release version found.", file=sys.stderr)
        return 1
    if len(sys.argv) > 1 and sys.argv[1] == "--print-version":
        print(version.lstrip("v"))
        return 0
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else MCP_MANIFEST_PATH
    if not path.is_file():
        print(f"[ERROR] MCP manifest not found: {path}", file=sys.stderr)
        return 1
    return 0 if sync_json_version(path, version) else 1


if __name__ == "__main__":
    raise SystemExit(main())
