#!/usr/bin/env python3
"""
Synchronize release metadata from local project notes or public package.json.
"""

import re
import json
from copy import deepcopy
import sys
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 文件路径
PROJECT_MD_PATH = PROJECT_ROOT / "PROJECT.md"
STARTUP_SCREEN_PATH = PROJECT_ROOT / "src" / "components" / "StartupScreen.tsx"
MCP_MANIFEST_PATH = PROJECT_ROOT / "mcp-extension" / "manifest.json"
OPENAI_MANIFEST_PATH = PROJECT_ROOT / "openai-plugin" / ".codex-plugin" / "plugin.json"
LICENSE_VIEWER_PATH = PROJECT_ROOT / "src" / "pages" / "Settings" / "LicenseViewer.tsx"


def write_existing_text(path: Path, content: str) -> None:
    """Preserve file attributes; Windows rejects mode 'w' for hidden files."""
    with path.open("r+", encoding="utf-8") as stream:
        stream.seek(0)
        stream.write(content)
        stream.truncate()


def sync_json_version(path: Path, project_version: str, *, optional=False) -> bool:
    """Skip unchanged metadata; only publication metadata is best-effort."""
    if not path.exists():
        return True
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        original = deepcopy(payload)
        version = project_version.lstrip("v")
        payload["version"] = version
        if path.name == "package-lock.json":
            payload.get("packages", {}).get("", {})["version"] = version
        if path.name == ".zenodo.json" and "description" in payload:
            payload["description"] = re.sub(
                r"Meta-Lingo v\d+\.\d+\.\d+", f"Meta-Lingo {project_version}", payload["description"]
            )
        if payload == original:
            print(f"[OK] {path.name} already matches {version}.")
        else:
            write_existing_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
            print(f"[OK] {path.name} updated to {version}.")
        return True
    except (OSError, ValueError, TypeError) as error:
        level = "WARN" if optional else "ERROR"
        print(f"[{level}] Could not sync {path}: {error}", file=sys.stderr)
        if optional:
            print("[WARN] Zenodo publication metadata was not updated; application packaging can continue.", file=sys.stderr)
        return optional


def extract_release_version() -> str | None:
    """Use local project notes when present; public clones use package.json."""
    try:
        if not PROJECT_MD_PATH.exists():
            payload = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8-sig"))
            version = payload.get("version", "")
            return "v" + version if re.fullmatch(r"\d+\.\d+\.\d+", version) else None
        with open(PROJECT_MD_PATH, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        
        # 匹配 **版本**: v3.8.67 格式
        pattern = r'\*\*版本\*\*:\s*(v\d+\.\d+\.\d+)'
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        # 如果没有找到，尝试其他格式
        pattern2 = r'版本[：:]\s*(v\d+\.\d+\.\d+)'
        match2 = re.search(pattern2, content)
        if match2:
            return match2.group(1)
        
        return None
    except Exception as e:
        print(f"[ERROR] Could not read release version: {e}", file=sys.stderr)
        return None


def extract_version_from_startup() -> str | None:
    """从启动页中提取版本号"""
    try:
        with open(STARTUP_SCREEN_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        metadata = re.search(r"export const STARTUP_VERSION = '(v\d+\.\d+\.\d+)'", content)
        if metadata:
            return metadata.group(1)
        # Legacy visible version in Typography.
        pattern = r'>\s*(v\d+\.\d+\.\d+)\s*<'
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        return None
    except Exception as e:
        print(f"[ERROR] Could not read StartupScreen.tsx: {e}", file=sys.stderr)
        return None


def update_startup_version(new_version: str) -> bool:
    """更新启动页的版本号"""
    try:
        with open(STARTUP_SCREEN_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换版本号
        pattern = (r"(export const STARTUP_VERSION = ')(v\d+\.\d+\.\d+)(')"
                   if "export const STARTUP_VERSION" in content
                   else r'(>\s*)(v\d+\.\d+\.\d+)(\s*<)')
        new_content = re.sub(pattern, rf'\1{new_version}\3', content)
        
        if new_content == content:
            print(f"[ERROR] No startup version was replaced.", file=sys.stderr)
            return False
        
        write_existing_text(STARTUP_SCREEN_PATH, new_content)
        
        return True
    except Exception as e:
        print(f"[ERROR] Could not update startup version: {e}", file=sys.stderr)
        return False


def main():
    """主函数"""
    # Windows consoles and redirected build logs may use GBK/cp1252. Keep
    # status text ASCII and escape unencodable paths/errors instead of failing
    # an otherwise valid synchronization while printing its result.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")
    print("=" * 50)
    print("  Version synchronization")
    print("=" * 50)
    print()
    
    # 检查文件是否存在
    version_source = PROJECT_MD_PATH if PROJECT_MD_PATH.exists() else PROJECT_ROOT / "package.json"
    
    if not STARTUP_SCREEN_PATH.exists():
        print(f"[ERROR] Startup file not found: {STARTUP_SCREEN_PATH}", file=sys.stderr)
        sys.exit(1)
    
    # 提取版本号
    project_version = extract_release_version()
    startup_version = extract_version_from_startup()
    
    if not project_version:
        print(f"[ERROR] No valid version found in {version_source.name}.", file=sys.stderr)
        sys.exit(1)
    
    if not startup_version:
        print("[ERROR] No valid version found in StartupScreen.tsx.", file=sys.stderr)
        sys.exit(1)
    
    print(f"[INFO] {version_source.name} version: {project_version}")
    print(f"[INFO] Startup version: {startup_version}")
    print()
    
    # 比较版本号
    if project_version == startup_version:
        print(f"[OK] Startup version already matches {version_source.name}.")
    else:
        print(f"[INFO] Startup version differs from {version_source.name}.")
        print(f"[INFO] Updating startup version to {project_version}.")
        print()

        if update_startup_version(project_version):
            print(f"[OK] Startup version updated to {project_version}.")
        else:
            print("[ERROR] Startup version update failed.", file=sys.stderr)
            return 1

    # App/plugin metadata must be correct for packaging. Zenodo is publication-only.
    for path in (PROJECT_ROOT / "package.json", PROJECT_ROOT / "package-lock.json",
                 MCP_MANIFEST_PATH, OPENAI_MANIFEST_PATH):
        if not sync_json_version(path, project_version):
            return 1
    sync_json_version(PROJECT_ROOT / ".zenodo.json", project_version, optional=True)

    # 同步"应用设置"页 Zenodo 引用文本里的版本号（CITATION_VERSION = 'vX.Y.Z'）
    if LICENSE_VIEWER_PATH.exists():
        try:
            with open(LICENSE_VIEWER_PATH, 'r', encoding='utf-8') as f:
                license_content = f.read()

            citation_pattern = r"(const CITATION_VERSION = ')v\d+\.\d+\.\d+(')"
            citation_match = re.search(citation_pattern, license_content)
            if citation_match:
                current_citation_version = citation_match.group(0).split("'")[1]
                if current_citation_version != project_version:
                    new_license_content = re.sub(citation_pattern, rf'\g<1>{project_version}\g<2>', license_content)
                    write_existing_text(LICENSE_VIEWER_PATH, new_license_content)
                    print(f"[OK] Citation version updated to {project_version}.")
                else:
                    print(f"[OK] Citation version already matches {project_version}.")
            else:
                print("[WARN] CITATION_VERSION not found in LicenseViewer.tsx.", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Could not sync citation version: {e}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

