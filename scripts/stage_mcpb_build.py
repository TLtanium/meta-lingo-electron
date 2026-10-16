"""Stage the .mcpb build directory: manifest + icon + PyInstaller server tree.

Extracted from build.bat's inline `python -c "..."` one-liner (Step 5-B),
which packed a nested tuple-expression list comprehension (used only for its
side effects) plus an inline conditional expression into one line — hard to
read/maintain and, more importantly, exactly the kind of complex
parens-inside-quotes one-liner that has already broken a batch `if (...)`
block elsewhere in this script on Windows (see
scripts/ensure_nltk_resources.py and PROJECT.md v4.9.48 changelog). Moved
here proactively so the same bug class can't resurface in this step too.

Usage: python scripts/stage_mcpb_build.py <build_dir> <server_src_dir>
Copies mcp-extension/manifest.json (+ icon.png if present) into <build_dir>,
and the PyInstaller server tree from <server_src_dir> into <build_dir>/server
(skipping macOS resource-fork artifacts: "._*" files and ".DS_Store").
"""
import os
import shutil
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print('[ERROR] usage: stage_mcpb_build.py <build_dir> <server_src_dir>')
        return 1

    build_dir, src_dir = sys.argv[1], sys.argv[2]

    shutil.rmtree(build_dir, ignore_errors=True)
    server_dir = os.path.join(build_dir, 'server')
    os.makedirs(server_dir, exist_ok=True)

    shutil.copy2('mcp-extension/manifest.json', build_dir)

    icon_path = 'mcp-extension/icon.png'
    if os.path.exists(icon_path):
        shutil.copy2(icon_path, build_dir)

    for root, _dirs, files in os.walk(src_dir):
        for fname in files:
            if fname.startswith('._') or fname == '.DS_Store':
                continue
            src_file = os.path.join(root, fname)
            rel_path = os.path.relpath(src_file, src_dir)
            dst_file = os.path.join(server_dir, rel_path)
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            shutil.copy2(src_file, dst_file)

    print(f'[INFO] Staged mcpb build dir: {build_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
