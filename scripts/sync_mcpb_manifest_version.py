"""Sync mcp-extension/manifest.json's version field from PROJECT.md.

Extracted from build.bat's inline `python -c "..."` one-liner (Step 5-B) so
the logic lives in a real, readable file instead of a long semicolon-joined
one-liner — see scripts/ensure_nltk_resources.py's docstring for why complex
inline `python -c` calls in batch scripts are risky on Windows, and
PROJECT.md v4.9.48 changelog for this specific cleanup.

Usage: python scripts/sync_mcpb_manifest_version.py [manifest_path]
(defaults to mcp-extension/manifest.json, resolved relative to CWD — run
from the project root, same as build.bat/build.sh do.)
"""
import json
import re
import sys

MANIFEST_PATH_DEFAULT = 'mcp-extension/manifest.json'


def main() -> int:
    manifest_path = sys.argv[1] if len(sys.argv) > 1 else MANIFEST_PATH_DEFAULT

    with open('PROJECT.md', encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'v(\d+\.\d+\.\d+)', text)
    if not m:
        print('[ERROR] version not found in PROJECT.md')
        return 1
    version = m.group(1)

    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)
    manifest['version'] = version
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f'[INFO] MCP manifest version synced to v{version}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
