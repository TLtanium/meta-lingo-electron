#!/bin/bash
# Meta-Lingo macOS 一键打包脚本
# 包含后端 PyInstaller 打包 + 前端 Electron 打包
# 使用方法: chmod +x build.sh && ./build.sh

set -e

# 获取脚本所在目录作为项目路径
PROJECT_PATH="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_PATH"

echo ""
echo "========================================"
echo "  Meta-Lingo Build Script (macOS)"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ========================================
# 第一步: 检查依赖
# ========================================
echo ""
log_info "Step 1: Checking dependencies..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js first."
    exit 1
fi
log_info "Node.js version: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    log_error "npm not found."
    exit 1
fi
log_info "npm version: $(npm -v)"

# 检查 conda
if ! command -v conda &> /dev/null; then
    log_error "Conda not found. Please install Anaconda/Miniconda first."
    exit 1
fi

# 初始化 conda (支持多种安装路径)
CONDA_PATHS=(
    "/opt/anaconda3/etc/profile.d/conda.sh"
    "$HOME/anaconda3/etc/profile.d/conda.sh"
    "$HOME/miniconda3/etc/profile.d/conda.sh"
    "/usr/local/anaconda3/etc/profile.d/conda.sh"
    "/opt/miniconda3/etc/profile.d/conda.sh"
)

CONDA_INITIALIZED=false
for conda_path in "${CONDA_PATHS[@]}"; do
    if [ -f "$conda_path" ]; then
        source "$conda_path"
        CONDA_INITIALIZED=true
        break
    fi
done

if [ "$CONDA_INITIALIZED" = false ]; then
    log_error "Could not find conda.sh. Please check your conda installation."
    exit 1
fi

# 检查 conda 环境是否存在
log_info "Checking conda environment: meta-lingo-electron"
if ! conda env list | grep -q "meta-lingo-electron"; then
    log_warn "Conda environment 'meta-lingo-electron' not found. Creating..."
    log_info "This may take several minutes, please wait..."

    # 创建 conda 环境
    conda create -n meta-lingo-electron python=3.12 -y || {
        log_error "Failed to create conda environment."
        exit 1
    }
    log_info "Conda environment created successfully."

    # 激活新创建的环境
    conda activate meta-lingo-electron || {
        log_error "Failed to activate conda environment."
        exit 1
    }

    # 安装依赖
    log_info "Installing Python dependencies from requirements.txt..."
    log_info "This may take a long time, please be patient..."

    # 从 requirements.txt 安装所有依赖
    pip install -r requirements.txt || {
        log_error "Failed to install dependencies from requirements.txt"
        exit 1
    }

    # 安装本地 SpaCy 模型（中英 web_sm）
    if [ -f "models/en_core_web_sm-3.8.0-py3-none-any.whl" ]; then
        log_info "Installing SpaCy English model..."
        pip install models/en_core_web_sm-3.8.0-py3-none-any.whl
    fi
    if [ -f "models/zh_core_web_sm-3.8.0-py3-none-any.whl" ]; then
        log_info "Installing SpaCy Chinese model..."
        pip install models/zh_core_web_sm-3.8.0-py3-none-any.whl
    fi

    # 安装本地 PyMUSAS 模型
    if [ -f "en_dual_none_contextual-0.3.3-py3-none-any.whl" ]; then
        log_info "Installing PyMUSAS English model..."
        pip install en_dual_none_contextual-0.3.3-py3-none-any.whl
    fi
    if [ -f "cmn_dual_upos2usas_contextual-0.3.3-py3-none-any.whl" ]; then
        log_info "Installing PyMUSAS Chinese model..."
        pip install cmn_dual_upos2usas_contextual-0.3.3-py3-none-any.whl
    fi

    # 下载 NLTK 数据
    log_info "Downloading NLTK data..."
    python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('averaged_perceptron_tagger'); nltk.download('averaged_perceptron_tagger_eng'); nltk.download('wordnet'); nltk.download('stopwords')"

    # 下载 benepar 模型
    log_info "Downloading benepar model..."
    python -c "import benepar; benepar.download('benepar_en3')"

    log_info "All dependencies installed successfully."
else
    log_info "Conda environment 'meta-lingo-electron' found."
    conda activate meta-lingo-electron || {
        log_error "Failed to activate conda environment."
        exit 1
    }
fi

# 检查 Python
if ! command -v python &> /dev/null; then
    log_error "Python not found in conda environment."
    exit 1
fi
log_info "Python version: $(python --version)"

# 检查/安装 PyInstaller
if ! python -c "import PyInstaller" &> /dev/null; then
    log_warn "PyInstaller not found. Installing..."
    pip install pyinstaller
fi
log_info "PyInstaller installed"

# ========================================
# 第二步: 检查并同步版本号
# ========================================
echo ""
log_info "Step 2: Checking and syncing version numbers..."
python scripts/sync_version.py
if [ $? -ne 0 ]; then
    log_error "Version synchronization failed. See the Python error above for the cause."
    exit 1
fi

# Required by resource imports and source distributions, including existing environments.
python -m pip install mdict-utils==1.3.14 xxhash==4.0.2
python scripts/check_resource_packaging.py

# ========================================
# 第三步: 清理旧的构建文件
# ========================================
echo ""
log_info "Step 3: Cleaning old build files..."
rm -rf dist 2>/dev/null || true
rm -rf dist-electron 2>/dev/null || true

# Only clean Mac release files, preserve Windows packages
log_info "Cleaning Mac release files only (preserving Windows packages)..."
rm -rf release/mac 2>/dev/null || true
rm -rf release/mac-arm64 2>/dev/null || true
rm -rf release/mac-x64 2>/dev/null || true
rm -rf release/mac-universal 2>/dev/null || true
rm -f release/*.dmg 2>/dev/null || true
rm -f release/*.dmg.blockmap 2>/dev/null || true
rm -f release/*.pkg 2>/dev/null || true

rm -rf backend-dist 2>/dev/null || true
rm -rf backend/dist 2>/dev/null || true
rm -rf backend/build 2>/dev/null || true
rm -rf ~/Library/Caches/electron-builder 2>/dev/null || true

# ========================================
# 第四步: 保留项目运行数据，使用固定出厂模板
# ========================================
echo ""
log_info "Step 4: Using factory templates from saves/frameworks; project runtime data is excluded and preserved."

# ========================================
# 第五步: 打包 Python 后端
# ========================================
echo ""
log_info "Step 5: Building Python backend with PyInstaller..."
cd backend

# 使用 PyInstaller 打包
pyinstaller --clean --noconfirm backend.spec

# 移动打包结果到项目根目录
cd "$PROJECT_PATH"
mv backend/dist "$PROJECT_PATH/backend-dist"
log_info "Backend build completed: backend-dist/meta-lingo-backend/"

# 清理 macOS 资源叉文件（以 ._ 开头的文件）
log_info "Cleaning macOS resource fork files from backend build..."
if [ "$(uname)" = "Darwin" ]; then
    # macOS: 使用 find 删除所有 ._ 开头的文件
    resource_fork_count=$(find backend-dist/meta-lingo-backend -name "._*" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$resource_fork_count" -gt 0 ]; then
        find backend-dist/meta-lingo-backend -name "._*" -type f -delete 2>/dev/null
        log_info "Removed $resource_fork_count macOS resource fork files"
    else
        log_info "No resource fork files found (good!)"
    fi
fi

# ========================================
# 第五步-B: 打包 MCP 服务器 + .mcpb 扩展
# ========================================
echo ""
log_info "Step 5-B: Building MCP server and .mcpb extension..."

# Build MCP server binary
cd backend
pyinstaller --clean --noconfirm mcp_server.spec
cd "$PROJECT_PATH"

# Move MCP dist alongside backend dist
if [ -d "backend/dist/meta-lingo-mcp" ]; then
    mv backend/dist/meta-lingo-mcp "$PROJECT_PATH/backend-dist/meta-lingo-mcp"
    log_info "MCP server build completed: backend-dist/meta-lingo-mcp/"
fi

# Clean macOS resource fork files from MCP build
if [ "$(uname)" = "Darwin" ] && [ -d "backend-dist/meta-lingo-mcp" ]; then
    find backend-dist/meta-lingo-mcp -name "._*" -type f -delete 2>/dev/null
fi

# Sync from local project notes or package.json in a public source checkout.
python scripts/sync_mcpb_manifest_version.py

# Package .mcpb ("Desktop Extension" format, renamed by Anthropic from .dxt —
# same zip-based format, but Claude Desktop's file association and the official
# packaging CLI have moved to .mcpb; see mcp-extension/manifest.json which is
# already the mcpb-era schema). Use the official @anthropic-ai/mcpb CLI (npx,
# no global install) instead of a hand-rolled zip so the manifest gets
# schema-validated and the archive matches what Claude Desktop expects exactly
# — this is the same toolchain LEOX (sibling project) already uses.
MCPB_BUILD="$PROJECT_PATH/build/mcpb-staging"
MCPB_OUTPUT="$PROJECT_PATH/backend-dist/meta-lingo-mcp.mcpb"
rm -rf "$MCPB_BUILD"
mkdir -p "$MCPB_BUILD/server"
cp mcp-extension/manifest.json "$MCPB_BUILD/"
[ -f mcp-extension/icon.png ] && cp mcp-extension/icon.png "$MCPB_BUILD/"
cp -R backend-dist/meta-lingo-mcp/* "$MCPB_BUILD/server/"
find "$MCPB_BUILD" \( -name ".DS_Store" -o -name "._*" \) -delete 2>/dev/null
rm -f "$MCPB_OUTPUT"
npx --yes @anthropic-ai/mcpb pack "$MCPB_BUILD" "$MCPB_OUTPUT"
rm -rf "$MCPB_BUILD"
log_info "MCP extension packaged: backend-dist/meta-lingo-mcp.mcpb ($(du -h "$MCPB_OUTPUT" | cut -f1))"

# ========================================
# 第六步: 检查前端依赖
# ========================================
echo ""
log_info "Step 6: Checking npm dependencies..."
if [ ! -d "node_modules" ]; then
    log_info "node_modules not found, running npm install..."
    npm install
else
    log_info "node_modules found, skipping npm install"
fi

# ========================================
# 第七步: 构建前端和 Electron
# ========================================
echo ""
log_info "Step 7: Building frontend and electron..."
python scripts/collect_third_party_licenses.py
npm run build:frontend
node scripts/check_electron_bundle.cjs
python scripts/check_license_assets.py --built

if [ ! -d "dist" ]; then
    log_error "Frontend build failed - dist directory not found"
    exit 1
fi
if [ ! -d "dist-electron" ]; then
    log_error "Electron build failed - dist-electron directory not found"
    exit 1
fi
log_info "Frontend and Electron build completed"

# ========================================
# 第八步: 打包 Electron 应用
# ========================================
echo ""
log_info "Step 8: Packaging Electron app for macOS..."

# 获取当前架构
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    log_info "Detected Apple Silicon (arm64)"
    npx electron-builder --mac --arm64 --dir --config electron-builder.json
    APP_DIR="mac-arm64"
else
    log_info "Detected Intel (x64)"
    npx electron-builder --mac --x64 --dir --config electron-builder.json
    APP_DIR="mac"
fi

# 最终清理：删除打包后的 .app 中的所有 macOS 资源叉文件
echo ""
log_info "Final cleanup: Removing macOS resource fork files from .app bundle..."
if [ "$(uname)" = "Darwin" ] && [ -d "$PROJECT_PATH/release/$APP_DIR/Meta-Lingo.app" ]; then
    # 查找并删除所有以 ._ 或 .__ 开头的文件（包括两种模式）
    resource_fork_count=$(find "$PROJECT_PATH/release/$APP_DIR/Meta-Lingo.app" -type f \( -name "._*" -o -name ".__*" \) 2>/dev/null | wc -l | tr -d ' ')
    if [ "$resource_fork_count" -gt 0 ]; then
        find "$PROJECT_PATH/release/$APP_DIR/Meta-Lingo.app" -type f \( -name "._*" -o -name ".__*" \) -delete 2>/dev/null
        log_info "Removed $resource_fork_count macOS resource fork files from .app bundle"
    else
        log_info "No resource fork files found in .app bundle (good!)"
    fi
fi

# ========================================
# 完成
# ========================================
echo ""
echo "========================================"
echo -e "  ${GREEN}[OK] Build completed successfully!${NC}"
echo "========================================"
echo ""
log_info "Output directory: $PROJECT_PATH/release/$APP_DIR"
log_info "Application: release/$APP_DIR/Meta-Lingo.app"
echo ""
log_info "Users can copy Meta-Lingo.app to Applications folder and run directly"
echo ""

# 显示打包结果
ls -la "$PROJECT_PATH/release/$APP_DIR"

# 打开输出目录
open "$PROJECT_PATH/release/$APP_DIR"
