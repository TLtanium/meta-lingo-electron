#!/bin/bash
# Meta-Lingo MCP Extension (.mcpb) Build Script
# Usage: ./build-extension.sh
#
# Reads the release version, syncs to manifest.json,
# builds MCP binary if needed, and packages the .mcpb file using the
# official @anthropic-ai/mcpb CLI (npx, no global install needed).
# ".mcpb" is Claude Desktop's current extension format (renamed from ".dxt";
# same zip-based layout, manifest.json schema unchanged).

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "========================================"
echo "  Meta-Lingo MCP Extension Builder"
echo "========================================"
echo ""

# ========================================
# Step 1: Synchronize the manifest from local notes or public package metadata.
# ========================================
python3 scripts/sync_mcpb_manifest_version.py
VERSION=$(python3 scripts/sync_mcpb_manifest_version.py --print-version)
log_info "App version: v${VERSION}"

# ========================================
# Step 2: Build MCP binary (always full clean rebuild)
# ========================================
MCP_DIST="$PROJECT_ROOT/dist/meta-lingo-mcp"
MCP_WORKPATH="$PROJECT_ROOT/build/mcp_server"

# Clean Python bytecode cache — stale .pyc files cause PyInstaller to silently
# compile old source into the binary even when the .py has been updated.
log_info "Cleaning Python bytecode cache (backend)..."
find "$PROJECT_ROOT/backend" -name "*.pyc" -delete 2>/dev/null
find "$PROJECT_ROOT/backend" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# Clean PyInstaller artefacts to guarantee a fresh compile from source.
log_info "Cleaning PyInstaller workdir and dist..."
rm -rf "$MCP_WORKPATH" "$MCP_DIST"

log_info "Building MCP server binary with PyInstaller..."

# Initialize conda
CONDA_PATHS=(
    "/opt/anaconda3/etc/profile.d/conda.sh"
    "$HOME/anaconda3/etc/profile.d/conda.sh"
    "$HOME/miniconda3/etc/profile.d/conda.sh"
    "/usr/local/anaconda3/etc/profile.d/conda.sh"
    "/opt/miniconda3/etc/profile.d/conda.sh"
)
for conda_path in "${CONDA_PATHS[@]}"; do
    if [ -f "$conda_path" ]; then
        source "$conda_path"
        break
    fi
done

conda activate meta-lingo-electron 2>/dev/null || {
    log_error "Failed to activate conda environment 'meta-lingo-electron'"
    exit 1
}

cd backend
pyinstaller --noconfirm mcp_server.spec \
    --distpath "$PROJECT_ROOT/dist" \
    --workpath "$PROJECT_ROOT/build/mcp_server"
cd "$PROJECT_ROOT"

log_info "MCP binary built successfully"

# ========================================
# Step 3: Package .mcpb
# ========================================
log_info "Packaging .mcpb extension..."

BUILD_DIR="$PROJECT_ROOT/build/mcpb-staging"
OUTPUT_FILE="$PROJECT_ROOT/dist/meta-lingo-mcp.mcpb"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/server"

# Copy manifest
cp "$MANIFEST_PATH" "$BUILD_DIR/"

# Copy icon
if [ -f "$PROJECT_ROOT/mcp-extension/icon.png" ]; then
    # Prefer the repo's MCP icon (bat uses the same source + overwrite behavior)
    cp "$PROJECT_ROOT/mcp-extension/icon.png" "$BUILD_DIR/"
    log_info "Icon copied from mcp-extension/icon.png"
elif [ -f "$PROJECT_ROOT/assets/icons/icon.ico" ]; then
    # Fallback: copy ICO into the package as icon.png (same filename as manifest expects)
    # Even though it's an .ico container, the MCP loader in this project already treats it as icon.png.
    cp "$PROJECT_ROOT/assets/icons/icon.ico" "$BUILD_DIR/icon.png"
    log_warn "mcp-extension/icon.png not found, fallback copied assets/icons/icon.ico as icon.png"
fi

# Strip macOS resource forks from the PyInstaller dist output first
find "$MCP_DIST" -name "._*" -type f -delete 2>/dev/null
find "$MCP_DIST" -name ".DS_Store" -delete 2>/dev/null
# Remove extended attributes from all files in dist
xattr -cr "$MCP_DIST" 2>/dev/null

# Copy MCP binary (stripping resource forks and extended attributes)
ditto --noextattr --norsrc "$MCP_DIST" "$BUILD_DIR/server"

# Final sweep: remove any ._* / .DS_Store that ditto or the OS re-created in staging
find "$BUILD_DIR" -name "._*" -type f -delete 2>/dev/null
find "$BUILD_DIR" -name ".DS_Store" -delete 2>/dev/null
xattr -cr "$BUILD_DIR" 2>/dev/null

# Remove existing .mcpb so we create a fresh archive (not update an old one with stale entries)
rm -f "$OUTPUT_FILE"

# Package using the official @anthropic-ai/mcpb CLI (npx, no global install needed) —
# schema-validates manifest.json and packs a standards-compliant archive, rather than
# hand-rolling a zip. Runs against the already-cleaned staging dir from above.
npx --yes @anthropic-ai/mcpb pack "$BUILD_DIR" "$OUTPUT_FILE"

# Clean up
rm -rf "$BUILD_DIR"

echo ""
echo "========================================"
echo -e "  ${GREEN}[OK] Extension built successfully!${NC}"
echo "========================================"
echo ""
log_info "Output: dist/meta-lingo-mcp.mcpb"
log_info "Size:   $(du -h "$OUTPUT_FILE" | cut -f1)"
log_info "Version: v${VERSION}"
echo ""
