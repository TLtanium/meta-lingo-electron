#!/bin/bash
# Meta-Lingo 开发调试脚本
# 在 Cursor 终端中运行此脚本，可以同时看到前后端日志

# 获取脚本所在目录作为项目路径
PROJECT_PATH="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_PATH"

echo "========================================"
echo "  Meta-Lingo Development Server"
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
echo "[INFO] 清理端口..."
lsof -ti :8000 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null
sleep 1

# 激活 conda 环境并启动后端（后台运行，日志输出到终端）
echo "[INFO] 启动后端服务..."
conda activate meta-lingo-electron
cd "$PROJECT_PATH/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "[OK] 后端 PID: $BACKEND_PID"

# 等待后端启动
sleep 2

# 启动前端（前台运行）
echo "[INFO] 启动前端服务..."
cd "$PROJECT_PATH"
npm run dev

# 当前端退出时，也关闭后端
echo "[INFO] 关闭后端..."
kill $BACKEND_PID 2>/dev/null
