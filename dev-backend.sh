#!/bin/bash
# Meta-Lingo 后端启动脚本
# 在 Cursor 终端中运行

PROJECT_PATH="/Users/tommyleo/Downloads/Meta-Lingo-Electron"

echo "========================================"
echo "  Meta-Lingo Backend Server"
echo "  API: http://localhost:8000"
echo "  Docs: http://localhost:8000/docs"
echo "========================================"
echo ""

# 初始化 conda
if [ -f "/opt/anaconda3/etc/profile.d/conda.sh" ]; then
    source /opt/anaconda3/etc/profile.d/conda.sh
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    source $HOME/anaconda3/etc/profile.d/conda.sh
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source $HOME/miniconda3/etc/profile.d/conda.sh
fi

# 清理端口
lsof -ti :8000 | xargs kill -9 2>/dev/null

# 激活环境并启动
conda activate meta-lingo-electron
cd "$PROJECT_PATH/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
