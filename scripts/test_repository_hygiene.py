"""Exercise source-only push staging in temporary repositories, never a remote."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from repository_hygiene import REQUIRED

ROOT = Path(__file__).resolve().parents[1]


class RepositoryHygieneTests(unittest.TestCase):
    def command(self, root, *args, input=None):
        return subprocess.run(args, cwd=root, capture_output=True,
                              input=input,
                              env={**os.environ, "GIT_CONFIG_GLOBAL": os.devnull,
                                   "GIT_CONFIG_NOSYSTEM": "1", "LC_ALL": "C"})

    def fixture(self, root):
        result = self.command(root, "git", "init", "-q")
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in REQUIRED:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("source fixture\n")
        for name in (".gitignore", "scripts/repository_hygiene.py", "scripts/git-hooks/pre-push", "push.sh"):
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, root / name)
        paths = ["Citespace技术文档.md", "backend/data/agent_tasks/sample/plan.json",
                 "data/settings/local.json", "build/mcp_server/cache.pkg", "memory/MEMORY.md",
                 "docs/local-report.md", "saves/.cache/local.json"]
        for name in paths:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("private local fixture\n")
        self.command(root, "git", "add", "--all")
        result = self.command(root, "git", "add", "-f", "--", *paths)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                              "commit", "-qm", "initial fixture")
        self.assertEqual(result.returncode, 0, result.stderr)
        return paths

    def test_push_check_removes_old_and_future_residue_without_deleting_local_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = self.fixture(root)
            before = self.command(root, "git", "rev-parse", "HEAD").stdout
            result = self.command(root, "bash", "push.sh", "--check")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(b"No commit or push was performed", result.stdout)
            self.assertEqual(self.command(root, "git", "rev-parse", "HEAD").stdout, before)
            self.assertEqual(self.command(root, "git", "remote").stdout, b"")
            indexed = self.command(root, "git", "ls-files", "-z").stdout.split(b"\0")
            for name in paths:
                self.assertNotIn(name.encode(), indexed)
                self.assertTrue((root / name).is_file())
            for name in REQUIRED:
                self.assertIn(name.encode(), indexed)
            future = root / "docs/future-report.md"
            future.write_text("future local note")
            self.command(root, "git", "add", "-f", "--", "docs/future-report.md")
            result = self.command(root, sys.executable, "scripts/repository_hygiene.py")
            self.assertEqual(result.returncode, 1)
            result = self.command(root, "bash", "push.sh", "--check")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(future.exists())

    def test_guard_rejects_missing_build_input_and_unclassified_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            self.command(root, "bash", "push.sh", "--check")
            self.command(root, "git", "update-index", "--force-remove", "build.sh")
            (root / "private-notes.csv").write_text("private")
            self.command(root, "git", "add", "private-notes.csv")
            result = self.command(root, sys.executable, "scripts/repository_hygiene.py")
            self.assertEqual(result.returncode, 1)
            self.assertIn(b"Required source/build inputs missing", result.stderr)
            self.assertIn(b"Unclassified files", result.stderr)

    def test_legacy_hook_migration_and_real_push_to_local_bare_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            self.fixture(root)
            hook = root / ".git/hooks/pre-push"
            legacy = b"#!/bin/sh\n# Block push if any root-level script\nexit 1\n"
            hook.write_bytes(legacy)
            hook.chmod(0o755)
            result = self.command(root, "bash", "push.sh", "--check")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(hook.with_name("pre-push.before-source-hygiene").read_bytes(), legacy)
            self.assertIn(b"Meta-Lingo source hygiene hook", hook.read_bytes())
            result = self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                                  "commit", "-qm", "source cleanup")
            self.assertEqual(result.returncode, 0, result.stderr)
            remote = Path(tmp) / "remote.git"
            self.command(root, "git", "init", "--bare", "-q", str(remote))
            result = self.command(root, "git", "push", str(remote), "HEAD:refs/heads/main")
            self.assertEqual(result.returncode, 0, result.stderr)
            remote_before = self.command(root, "git", "--git-dir=" + str(remote), "rev-parse", "refs/heads/main").stdout
            for name in ("private-export.sh", "data/private.json"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("local-only fixture")
                self.command(root, "git", "add", "-f", "--", name)
                self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                             "commit", "-qm", "rejected fixture")
                result = self.command(root, "git", "push", str(remote), "HEAD:refs/heads/main")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"Push rejected", result.stderr)
                self.assertEqual(self.command(root, "git", "--git-dir=" + str(remote), "rev-parse", "refs/heads/main").stdout,
                                 remote_before)
                self.command(root, "git", "rm", "--", name)
                self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                             "commit", "-qm", "remove local-only fixture")

    def test_pushed_ref_is_checked_instead_of_clean_head_and_deletion_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            self.command(root, "bash", "push.sh", "--check")
            self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                         "commit", "-qm", "clean tree")
            clean = self.command(root, "git", "rev-parse", "HEAD").stdout.strip()
            (root / "private.ps1").write_text("private fixture")
            self.command(root, "git", "add", "-f", "private.ps1")
            self.command(root, "git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                         "commit", "-qm", "bad tree")
            bad = self.command(root, "git", "rev-parse", "HEAD").stdout.strip()
            self.command(root, "git", "checkout", "--detach", clean.decode())
            zero = b"0" * len(clean)
            line = b"refs/heads/other " + bad + b" refs/heads/other " + zero + b"\n"
            result = self.command(root, "sh", ".git/hooks/pre-push", input=line)
            self.assertEqual(result.returncode, 1)
            line = b"(delete) " + zero + b" refs/heads/other " + bad + b"\n"
            result = self.command(root, "sh", ".git/hooks/pre-push", input=line)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_custom_hook_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            hook = root / ".git/hooks/pre-push"
            hook.write_bytes(b"#!/bin/sh\n# Custom repository checks\nexit 0\n")
            before = hook.read_bytes()
            result = self.command(root, sys.executable, "scripts/repository_hygiene.py", "--install-push-hook")
            self.assertEqual(result.returncode, 1)
            self.assertEqual(hook.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
