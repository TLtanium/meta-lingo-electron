#!/bin/bash
# Meta-Lingo 启动脚本
# 在两个终端标签页中启动前后端

PROJECT_PATH="/Users/tommyleo/Downloads/Meta-Lingo-Electron"

echo "========================================"
echo "  Meta-Lingo Startup Script"
echo "========================================"

# 检查 conda 是否可用
if command -v conda &> /dev/null; then
    echo "[OK] Conda found"
else
    echo "[ERROR] Conda not found. Please install Anaconda/Miniconda first."
    exit 1
fi

# 初始化 conda (适配不同的安装路径)
if [ -f "/opt/anaconda3/etc/profile.d/conda.sh" ]; then
    source /opt/anaconda3/etc/profile.d/conda.sh
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    source $HOME/anaconda3/etc/profile.d/conda.sh
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source $HOME/miniconda3/etc/profile.d/conda.sh
fi

# 清理占用的端口
echo "[INFO] Cleaning up ports..."
# 清理端口 8000 (后端)
lsof -ti :8000 | xargs kill -9 2>/dev/null && echo "  [OK] Port 8000 cleared" || echo "  [OK] Port 8000 is free"
# 清理端口 5173 (前端)
lsof -ti :5173 | xargs kill -9 2>/dev/null && echo "  [OK] Port 5173 cleared" || echo "  [OK] Port 5173 is free"
sleep 1

# 使用 osascript 打开两个终端窗口
osascript <<EOF
tell application "Terminal"
    activate

    -- 启动后端
    do script "source /opt/anaconda3/etc/profile.d/conda.sh && conda activate meta-lingo-electron && cd $PROJECT_PATH/backend && echo '' && echo '========================================' && echo '  Meta-Lingo Backend' && echo '  API: http://localhost:8000' && echo '  Docs: http://localhost:8000/docs' && echo '========================================' && echo '' && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
    set custom title of front window to "Meta-Lingo Backend"

    delay 1

    -- 启动前端
    do script "cd $PROJECT_PATH && echo '' && echo '========================================' && echo '  Meta-Lingo Frontend' && echo '  URL: http://localhost:5173' && echo '========================================' && echo '' && npm run dev"
    set custom title of front window to "Meta-Lingo Frontend"

end tell
EOF

echo ""
echo "[INFO] Starting services..."
echo "  Backend: http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "[INFO] Waiting for services to start..."

# 等待后端启动
sleep 5

# 打开浏览器
echo "[INFO] Opening browser..."
open "http://localhost:5173"

echo ""
echo "[OK] Meta-Lingo started successfully!"
echo "     Press Ctrl+C in each terminal to stop."
