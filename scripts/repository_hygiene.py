"""Keep the public source index free of local data and generated material.

--clean-index removes ignored tracked files from Git only, preserving local files.
The default checks the complete index, including already tracked ignored files.
"""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "LICENSE", "LICENSING.md", "README.md", "SOURCE.md", "THIRD_PARTY_NOTICES.md",
    "package.json", "package-lock.json", "requirements.txt", "electron-builder.json",
    "index.html", "pet.html", "vite.config.ts", "tsconfig.json", "tsconfig.node.json",
    "build.sh", "build.bat", "build-extension.sh", "build-extension.bat",
    "dev.sh", "dev-backend.sh", "dev-frontend.sh", "start.sh",
    "backend/backend.spec", "backend/mcp_server.spec", "usas_semantic_domains.txt",
    "scripts/sync_version.py", "scripts/sync_mcpb_manifest_version.py",
    "scripts/repository_hygiene.py", "scripts/check_electron_bundle.cjs",
    "help/zh.md", "help/en.md", "mcp-extension/manifest.json",
    "mcp-extension/PROMPTS.md", "openai-plugin/.codex-plugin/plugin.json",
    "openai-plugin/skills/meta-lingo/SKILL.md", "third-party-licenses/LICENSES.txt",
)
ROOT_FILES = set(REQUIRED) | {".gitignore", ".zenodo.json", "CITATION"}
SOURCE_DIRS = {"assets", "backend", "electron", "help", "mcp-extension", "models",
               "openai-plugin", "public", "saves", "scripts", "shared", "src",
               "third-party-licenses", ".github"}


def git(*args, input=None):
    return subprocess.run(["git", *args], cwd=ROOT, input=input, capture_output=True, check=True).stdout


def indexed_paths():
    return [p.decode("utf-8") for p in git("ls-files", "-z").split(b"\0") if p]


def check_index():
    paths = indexed_paths()
    ignored = [p.decode("utf-8") for p in git("ls-files", "-ci", "--exclude-standard", "-z").split(b"\0") if p]
    unexpected = [p for p in paths if ("/" not in p and p not in ROOT_FILES) or
                  ("/" in p and p.split("/", 1)[0] not in SOURCE_DIRS)]
    missing = sorted(set(REQUIRED) - set(paths))
    for label, items in (("Ignored/local files still indexed", sorted(set(ignored))),
                         ("Unclassified files", sorted(set(unexpected))),
                         ("Required source/build inputs missing", missing)):
        if items:
            print(f"[ERROR] {label}:", file=sys.stderr)
            for item in items:
                print(f"  {item}", file=sys.stderr)
    if ignored or unexpected or missing:
        return 1
    print(f"[OK] Public source index: {len(paths)} files, no ignored/local residue, required build inputs present.")
    return 0


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean-index", action="store_true")
    args = parser.parse_args()
    if args.clean_index:
        ignored = git("ls-files", "-ci", "--exclude-standard", "-z")
        if ignored:
            paths = [p for p in ignored.split(b"\0") if p]
            git("update-index", "--force-remove", "-z", "--stdin", input=ignored)
            print(f"[OK] Removed {len(paths)} local/generated files from the index; working files are preserved.")
        return 0
    return check_index()


if __name__ == "__main__":
    raise SystemExit(main())
