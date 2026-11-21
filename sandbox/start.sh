#!/bin/bash
# =====================================================
# ASM Sandbox 启动脚本 — 本地直接执行模式
# 自动检查并安装依赖，启动 Flask API
# =====================================================

set -e

echo "========================================"
echo "  ASM Sandbox — 本地直接执行模式"
echo "========================================"
echo ""

# ---- 1. 检查并安装系统依赖 ----
echo "[1/3] 检查系统依赖..."

MISSING=""
command -v nasm >/dev/null 2>&1 || MISSING="$MISSING nasm"
command -v gcc  >/dev/null 2>&1 || MISSING="$MISSING gcc"
command -v gdb  >/dev/null 2>&1 || MISSING="$MISSING gdb"

if [ -n "$MISSING" ]; then
    echo "  ⚠️  缺少依赖:$MISSING"
    echo "  正在尝试安装..."
    
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq
        sudo apt-get install -y -qq $MISSING
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y $MISSING
    elif command -v apk >/dev/null 2>&1; then
        sudo apk add $MISSING
    else
        echo "  ❌ 无法自动安装。请手动安装: $MISSING"
        exit 1
    fi
    
    echo "  ✅ 依赖安装完成"
else
    echo "  ✅ nasm: $(which nasm)"
    echo "  ✅ gcc:  $(which gcc)"
    echo "  ✅ gdb:  $(which gdb)"
fi

# ---- 2. 安装 Python 依赖 ----
echo ""
echo "[2/3] 安装 Python 依赖..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  ✅ 创建虚拟环境"
fi

source venv/bin/activate
pip install -q -r requirements.txt
echo "  ✅ Python 依赖已安装"

# ---- 3. 运行自测 ----
echo ""
echo "[3/3] 运行自测..."
python3 assembler_runner.py

# ---- 4. 启动 API 服务 ----
echo ""
echo "========================================"
echo "  启动 API 服务"
echo "========================================"
export SANDBOX_PORT=${SANDBOX_PORT:-5000}
export SANDBOX_TIMEOUT=${SANDBOX_TIMEOUT:-5}

python3 api_endpoint.py
