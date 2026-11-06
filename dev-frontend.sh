#!/bin/bash
# Meta-Lingo 前端启动脚本
# 在 Cursor 终端中运行

PROJECT_PATH="/Users/tommyleo/Downloads/Meta-Lingo-Electron"

echo "========================================"
echo "  Meta-Lingo Frontend Server"
echo "  URL: http://localhost:5173"
echo "========================================"
echo ""

# 清理端口
lsof -ti :5173 | xargs kill -9 2>/dev/null

cd "$PROJECT_PATH"
npm run dev
