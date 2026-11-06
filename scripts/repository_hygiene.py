"""Keep the public source index free of local data and generated material.

--clean-index removes ignored tracked files from Git only, preserving local files.
The default checks the complete index, including already tracked ignored files.
"""
import argparse
from pathlib import Path
import re
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
    "scripts/git-hooks/pre-push",
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


def validate_paths(paths, ignored, *, require_build_inputs=True):
    unexpected = [p for p in paths if ("/" not in p and p not in ROOT_FILES) or
                  ("/" in p and p.split("/", 1)[0] not in SOURCE_DIRS)]
    missing = sorted(set(REQUIRED) - set(paths)) if require_build_inputs else []
    for label, items in (("Ignored/local files still indexed", sorted(set(ignored))),
                         ("Unclassified files", sorted(set(unexpected))),
                         ("Required source/build inputs missing", missing)):
        if items:
            print(f"[ERROR] {label}:", file=sys.stderr)
            for item in items:
                print(f"  {item}", file=sys.stderr)
    if ignored or unexpected or missing:
        return 1
    print(f"[OK] Public source check: {len(paths)} files, no ignored/local residue.")
    return 0


def check_index():
    paths = indexed_paths()
    ignored = [p.decode("utf-8") for p in git("ls-files", "-ci", "--exclude-standard", "-z").split(b"\0") if p]
    return validate_paths(paths, ignored)


def check_pre_push():
    """Check each pushed tree, not HEAD/index or an ambiguous diff range."""
    checked = set()
    for line in sys.stdin:
        fields = line.split()
        if len(fields) != 4:
            print("[ERROR] Invalid pre-push reference input.", file=sys.stderr)
            return 1
        oid = fields[1]
        if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", oid):
            print("[ERROR] Invalid pre-push object ID.", file=sys.stderr)
            return 1
        if not oid.strip("0") or oid in checked:
            continue  # Ref deletion, or the same tree pushed to another ref.
        checked.add(oid)
        raw = git("ls-tree", "-r", "--name-only", "-z", oid, "--")
        paths = [p.decode("utf-8") for p in raw.split(b"\0") if p]
        result = subprocess.run(["git", "check-ignore", "--no-index", "-z", "--stdin"],
                                cwd=ROOT, input=raw, capture_output=True)
        if result.returncode not in (0, 1):
            print("[ERROR] Could not evaluate source ignore rules.", file=sys.stderr)
            return 1
        ignored = [p.decode("utf-8") for p in result.stdout.split(b"\0") if p]
        if validate_paths(paths, ignored, require_build_inputs=False):
            print("[ERROR] Push rejected: the pushed tree contains local-only files.", file=sys.stderr)
            return 1
    return 0


def install_push_hook():
    target = Path(git("rev-parse", "--git-path", "hooks/pre-push").decode().strip())
    if not target.is_absolute():
        target = ROOT / target
    template = (ROOT / "scripts/git-hooks/pre-push").read_bytes()
    if target.exists():
        current = target.read_bytes()
        if current == template:
            return 0
        legacy = b"# Block push if any root-level script" in current
        managed = b"Meta-Lingo source hygiene hook" in current
        if not (legacy or managed):
            print("[ERROR] Unrecognized pre-push hook preserved; refusing to overwrite custom checks.", file=sys.stderr)
            return 1
        backup = target.with_name("pre-push.before-source-hygiene")
        if not backup.exists():
            backup.write_bytes(current)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(template)
    target.chmod(target.stat().st_mode | 0o111)
    print("[OK] Installed source hygiene pre-push hook; required build scripts are allowed.")
    return 0


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--clean-index", action="store_true")
    modes.add_argument("--pre-push", action="store_true")
    modes.add_argument("--install-push-hook", action="store_true")
    args = parser.parse_args()
    if args.pre_push:
        return check_pre_push()
    if args.install_push_hook:
        return install_push_hook()
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
