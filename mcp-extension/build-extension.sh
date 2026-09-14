#!/bin/bash
# Build Meta-Lingo MCP Desktop Extension (.mcpb — Claude Desktop's current
# extension format, renamed by Anthropic from .dxt; same zip-based layout,
# packaged with the official @anthropic-ai/mcpb CLI for schema validation).
#
# Prerequisites:
#   - PyInstaller-built meta-lingo-mcp binary in dist/meta-lingo-mcp/
#   - Node/npm available (npx pulls @anthropic-ai/mcpb on first run)
#   - Run from the project root:  bash mcp-extension/build-extension.sh
#
# Usage:
#   bash mcp-extension/build-extension.sh              # Build for current platform
#   bash mcp-extension/build-extension.sh --all         # Build with all platform binaries (cross-compile)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
DIST_DIR="$PROJECT_ROOT/dist"

VERSION=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/manifest.json'))['version'])")
OUTPUT_FILE="$DIST_DIR/meta-lingo-mcp-v${VERSION}.mcpb"

echo "=== Building Meta-Lingo MCP Extension v${VERSION} ==="

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/server"

# Copy manifest
cp "$SCRIPT_DIR/manifest.json" "$BUILD_DIR/"

# Copy icon (if exists)
if [ -f "$SCRIPT_DIR/icon.png" ]; then
    cp "$SCRIPT_DIR/icon.png" "$BUILD_DIR/"
elif [ -f "$PROJECT_ROOT/build/icon.png" ]; then
    cp "$PROJECT_ROOT/build/icon.png" "$BUILD_DIR/"
fi

# Copy the PyInstaller-built MCP server binary
MCP_DIST="$DIST_DIR/meta-lingo-mcp"
if [ ! -d "$MCP_DIST" ]; then
    echo "Error: MCP server binary not found at $MCP_DIST"
    echo "Run PyInstaller first: cd backend && pyinstaller mcp_server.spec"
    exit 1
fi

echo "Copying MCP server binary..."
cp -R "$MCP_DIST"/* "$BUILD_DIR/server/"
find "$BUILD_DIR" \( -name ".DS_Store" -o -name "._*" -o -name "__pycache__" \) -exec rm -rf {} + 2>/dev/null || true

# Create .mcpb using the official @anthropic-ai/mcpb CLI (npx, no global install
# needed) — schema-validates manifest.json and packs a standards-compliant archive.
mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_FILE"
npx --yes @anthropic-ai/mcpb pack "$BUILD_DIR" "$OUTPUT_FILE"

# Clean up
rm -rf "$BUILD_DIR"

echo ""
echo "=== Extension built successfully ==="
echo "Output: $OUTPUT_FILE"
echo "Size:   $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "Install: Double-click the .mcpb file, or drag it into Claude Desktop."
