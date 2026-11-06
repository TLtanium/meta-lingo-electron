"""Run version synchronization in isolated projects and Windows log encodings."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("sync_version.py")
VERSION = "9.8.7"


class VersionSyncTests(unittest.TestCase):
    def fixture(self, root, startup_version="4.0.0", legacy=False):
        (root / "scripts").mkdir()
        shutil.copyfile(SCRIPT, root / "scripts/sync_version.py")
        shutil.copyfile(SCRIPT.with_name("sync_mcpb_manifest_version.py"), root / "scripts/sync_mcpb_manifest_version.py")
        (root / "PROJECT.md").write_text(f"**版本**: v{VERSION}\n", encoding="utf-8")
        startup = root / "src/components/StartupScreen.tsx"
        startup.parent.mkdir(parents=True)
        startup.write_text(
            f"<Typography>v{startup_version}</Typography>" if legacy else
            f"export const STARTUP_VERSION = 'v{startup_version}'\n",
            encoding="utf-8",
        )
        files = {
            "package.json": {"version": "4.0.0"},
            "package-lock.json": {"version": "4.0.0", "packages": {"": {"version": "4.0.0"}}},
            ".zenodo.json": {"version": "4.0.0", "description": "Meta-Lingo v4.0.0"},
            "mcp-extension/manifest.json": {"version": "4.0.0"},
            "openai-plugin/.codex-plugin/plugin.json": {"version": "4.0.0"},
        }
        for name, payload in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload), encoding="utf-8")
        citation = root / "src/pages/Settings/LicenseViewer.tsx"
        citation.parent.mkdir(parents=True)
        citation.write_text("const CITATION_VERSION = 'v4.0.0'", encoding="utf-8")
        return startup, files, citation

    def run_sync(self, root, encoding, blocked=None, hidden_only=False):
        command = [sys.executable, str(root / "scripts/sync_version.py")]
        if blocked is not None:
            # Simulate Windows denial deterministically on every host. In hidden
            # mode only 'w' is rejected; true read-only/ACL denial rejects r+ too.
            wrapper = '''
from pathlib import Path
import runpy, sys
script = Path(sys.argv[1])
blocked = script.parent.parent / sys.argv[2]
hidden_only = sys.argv[3] == "hidden"
original_open = Path.open
def guarded_open(self, mode="r", *args, **kwargs):
    if self == blocked and ("w" in mode if hidden_only else any(c in mode for c in "wa+")):
        raise PermissionError(13, "Permission denied", str(self))
    return original_open(self, mode, *args, **kwargs)
Path.open = guarded_open
runpy.run_path(str(script), run_name="__main__")
'''
            command = [sys.executable, "-c", wrapper, str(root / "scripts/sync_version.py"),
                       blocked, "hidden" if hidden_only else "readonly"]
        return subprocess.run(
            command,
            cwd=root.parent,  # Must resolve the project from the script, not CWD.
            env={**os.environ, "PYTHONIOENCODING": encoding + ":strict"},
            capture_output=True,
        )

    def test_unchanged_readonly_metadata_is_not_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, files, _ = self.fixture(root)
            self.assertEqual(self.run_sync(root, "ascii").returncode, 0)
            for name in files:
                with self.subTest(name=name):
                    path = root / name
                    # Even alternate whitespace must remain unchanged.
                    path.write_text(json.dumps(json.loads(path.read_text())), encoding="utf-8")
                    before = path.read_bytes(), path.stat().st_mtime_ns
                    result = self.run_sync(root, "cp936", blocked=name)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertNotIn(b"[WARN]", result.stderr)
                    self.assertEqual(before, (path.read_bytes(), path.stat().st_mtime_ns))

    def test_unwritable_zenodo_does_not_block_app_and_plugins(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, files, _ = self.fixture(root)
            before = (root / ".zenodo.json").read_bytes()
            result = self.run_sync(root, "cp936", blocked=".zenodo.json")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(b"Zenodo publication metadata was not updated", result.stderr)
            self.assertNotIn(b"Traceback", result.stderr)
            self.assertEqual(before, (root / ".zenodo.json").read_bytes())
            for name in files:
                if name != ".zenodo.json":
                    self.assertEqual(json.loads((root / name).read_text())["version"], VERSION)

    def test_unwritable_app_and_plugin_metadata_stops_build(self):
        for name in ("package.json", "package-lock.json", "mcp-extension/manifest.json",
                     "openai-plugin/.codex-plugin/plugin.json"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                self.fixture(root)
                before = (root / name).read_bytes()
                result = self.run_sync(root, "ascii", blocked=name)
                self.assertEqual(result.returncode, 1)
                self.assertIn(b"[ERROR] Could not sync", result.stderr)
                self.assertNotIn(b"Traceback", result.stderr)
                self.assertEqual(before, (root / name).read_bytes())

    def test_hidden_attribute_write_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            result = self.run_sync(root, "ascii", blocked=".zenodo.json", hidden_only=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(b"[WARN]", result.stderr)
            self.assertEqual(json.loads((root / ".zenodo.json").read_text())["version"], VERSION)

    @unittest.skipUnless(os.name == "nt", "requires native Windows file attributes")
    def test_native_windows_hidden_zenodo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            path = root / ".zenodo.json"
            subprocess.run(["attrib", "+H", str(path)], check=True, capture_output=True)
            try:
                result = self.run_sync(root, "cp936")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn(b"[WARN]", result.stderr)
                self.assertEqual(json.loads(path.read_text())["version"], VERSION)
                self.assertTrue(path.stat().st_file_attributes & 2)
            finally:
                subprocess.run(["attrib", "-H", str(path)], check=True, capture_output=True)

    def test_sync_and_repeat_across_console_encodings(self):
        for encoding in ("utf-8", "cp936", "cp1252", "ascii"):
            for legacy in (False, True):
                with self.subTest(encoding=encoding, legacy=legacy), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp) / "项目 含空格"
                    root.mkdir()
                    startup, files, citation = self.fixture(root, legacy=legacy)
                    result = self.run_sync(root, encoding)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn(f"v{VERSION}", startup.read_text(encoding="utf-8"))
                    for name in files:
                        payload = json.loads((root / name).read_text(encoding="utf-8"))
                        self.assertEqual(payload["version"], VERSION)
                        if name == "package-lock.json":
                            self.assertEqual(payload["packages"][""]["version"], VERSION)
                    self.assertIn(f"v{VERSION}", citation.read_text(encoding="utf-8"))
                    snapshot = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
                    result = self.run_sync(root, encoding)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn(b"already matches PROJECT.md", result.stdout)
                    self.assertEqual(snapshot, {p: p.read_bytes() for p in snapshot})

    def test_public_clone_uses_package_version_without_private_project_notes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "项目"
            root.mkdir()
            startup, _, _ = self.fixture(root)
            (root / "PROJECT.md").unlink()
            (root / "package.json").write_text(json.dumps({"version": VERSION}))
            result = self.run_sync(root, "ascii")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(b"package.json version", result.stdout)
            self.assertIn(f"v{VERSION}", startup.read_text())
            self.assertFalse((root / "PROJECT.md").exists())
            (root / "mcp-extension/manifest.json").write_text('{"version":"1.0.0"}')
            result = subprocess.run([sys.executable, str(root / "scripts/sync_mcpb_manifest_version.py")],
                                    cwd=root.parent, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((root / "mcp-extension/manifest.json").read_text())["version"], VERSION)

    def test_missing_version_source_reports_real_error_with_unicode_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "项目"
            root.mkdir()
            self.fixture(root)
            (root / "PROJECT.md").unlink()
            (root / "package.json").unlink()
            result = self.run_sync(root, "ascii")
            self.assertEqual(result.returncode, 1)
            self.assertIn(b"Could not read release version", result.stderr)
            self.assertNotIn(b"UnicodeEncodeError", result.stderr)

    def test_invalid_version_stops_before_changes(self):
        for name in ("PROJECT.md", "src/components/StartupScreen.tsx"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                self.fixture(root)
                (root / name).write_text("invalid version", encoding="utf-8")
                result = self.run_sync(root, "cp936")
                self.assertEqual(result.returncode, 1)
                self.assertIn(b"No valid version found", result.stderr)
                self.assertEqual(json.loads((root / "package.json").read_text())["version"], "4.0.0")


if __name__ == "__main__":
    unittest.main()
