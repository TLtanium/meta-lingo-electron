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
    def command(self, root, *args):
        return subprocess.run(args, cwd=root, capture_output=True,
                              env={**os.environ, "GIT_CONFIG_GLOBAL": os.devnull,
                                   "GIT_CONFIG_NOSYSTEM": "1", "LC_ALL": "C"})

    def fixture(self, root):
        result = self.command(root, "git", "init", "-q")
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in REQUIRED:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("source fixture\n")
        for name in (".gitignore", "scripts/repository_hygiene.py", "push.sh"):
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


if __name__ == "__main__":
    unittest.main()
