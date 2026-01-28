#!/usr/bin/env python3
"""
版本号同步脚本
检查 PROJECT.md 和启动页的版本号是否一致，不一致则更新启动页面为 PROJECT.md 的版本号
"""

import re
import os
import sys
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 文件路径
PROJECT_MD_PATH = PROJECT_ROOT / "PROJECT.md"
STARTUP_SCREEN_PATH = PROJECT_ROOT / "src" / "components" / "StartupScreen.tsx"


def extract_version_from_project_md() -> str | None:
    """从 PROJECT.md 中提取版本号"""
    try:
        with open(PROJECT_MD_PATH, 'r', encoding='utf-8') as f:
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
        print(f"❌ 读取 PROJECT.md 失败: {e}", file=sys.stderr)
        return None


def extract_version_from_startup() -> str | None:
    """从启动页中提取版本号"""
    try:
        with open(STARTUP_SCREEN_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 匹配 v3.8.62 格式（在 Typography 组件中）
        pattern = r'>\s*(v\d+\.\d+\.\d+)\s*<'
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        return None
    except Exception as e:
        print(f"❌ 读取启动页文件失败: {e}", file=sys.stderr)
        return None


def update_startup_version(new_version: str) -> bool:
    """更新启动页的版本号"""
    try:
        with open(STARTUP_SCREEN_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换版本号
        pattern = r'(>\s*)(v\d+\.\d+\.\d+)(\s*<)'
        new_content = re.sub(pattern, rf'\1{new_version}\3', content)
        
        if new_content == content:
            print(f"⚠️  未找到需要替换的版本号", file=sys.stderr)
            return False
        
        with open(STARTUP_SCREEN_PATH, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return True
    except Exception as e:
        print(f"❌ 更新启动页版本号失败: {e}", file=sys.stderr)
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("  版本号同步检查")
    print("=" * 50)
    print()
    
    # 检查文件是否存在
    if not PROJECT_MD_PATH.exists():
        print(f"❌ PROJECT.md 不存在: {PROJECT_MD_PATH}", file=sys.stderr)
        sys.exit(1)
    
    if not STARTUP_SCREEN_PATH.exists():
        print(f"❌ 启动页文件不存在: {STARTUP_SCREEN_PATH}", file=sys.stderr)
        sys.exit(1)
    
    # 提取版本号
    project_version = extract_version_from_project_md()
    startup_version = extract_version_from_startup()
    
    if not project_version:
        print("❌ 无法从 PROJECT.md 中提取版本号", file=sys.stderr)
        sys.exit(1)
    
    if not startup_version:
        print("❌ 无法从启动页中提取版本号", file=sys.stderr)
        sys.exit(1)
    
    print(f"📄 PROJECT.md 版本号: {project_version}")
    print(f"🚀 启动页版本号: {startup_version}")
    print()
    
    # 比较版本号
    if project_version == startup_version:
        print("✅ 版本号一致，无需更新")
        return 0
    else:
        print(f"⚠️  版本号不一致！")
        print(f"   将更新启动页版本号为: {project_version}")
        print()
        
        if update_startup_version(project_version):
            print(f"✅ 已更新启动页版本号为: {project_version}")
            return 0
        else:
            print("❌ 更新失败", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(main())

