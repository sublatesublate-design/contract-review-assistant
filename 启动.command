#!/bin/bash

# ==========================================
# AI 合同审查助手 - Mac 启动脚本
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}      启动 AI 合同审查助手 (Mac 版)     ${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

# 获取脚本所在目录并切换过去
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# ─── 检测 Node.js ─────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未检测到 Node.js 环境！${NC}"
    echo "请先安装 Node.js：https://nodejs.org/"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi
echo -e "✅ Node.js 已安装: $(node -v)"

# ─── 检测 pnpm ────────────────────────────────────────────────
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}正在自动安装核心依赖管理器 (pnpm)...${NC}"
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo -e "${RED}pnpm 安装失败！请尝试：sudo npm install -g pnpm${NC}"
        exit 1
    fi
fi
echo -e "✅ 包管理工具准备就绪"

# ─── 安装项目依赖 ─────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}首次运行，正在下载项目依赖 (约 1-3 分钟)...${NC}"
    pnpm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}依赖安装失败！请检查网络连接后重试。${NC}"
        exit 1
    fi
    echo -e "✅ 依赖下载完成"
else
    echo -e "✅ 依赖已就绪"
fi

# ─── 询问目标软件 ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}┌──────────────────────────────────────┐${NC}"
echo -e "${CYAN}│   请选择您要使用的文字处理软件：     │${NC}"
echo -e "${CYAN}│                                      │${NC}"
echo -e "${CYAN}│   [W]  Microsoft Word（默认）        │${NC}"
echo -e "${CYAN}│   [P]  WPS Office                    │${NC}"
echo -e "${CYAN}│                                      │${NC}"
echo -e "${CYAN}└──────────────────────────────────────┘${NC}"
echo ""
read -p "  请输入 W 或 P 后按回车（直接回车默认 Word）：" CHOICE
CHOICE=$(echo "$CHOICE" | tr '[:lower:]' '[:upper:]' | tr -d ' ')

if [ "$CHOICE" = "P" ]; then
    # ─── WPS 模式 ─────────────────────────────────────────────
    echo ""
    echo -e "${GREEN}[模式] WPS Office${NC}"
    echo ""

    # 安装 wpsjs 工具（若未安装）
    if ! command -v wpsjs &> /dev/null; then
        echo -e "${YELLOW}首次使用 WPS 模式，正在安装 wpsjs 工具（约 30 秒）...${NC}"
        npm install -g wpsjs
        if [ $? -ne 0 ]; then
            echo -e "${RED}wpsjs 安装失败，请检查网络后重试${NC}"
            exit 1
        fi
        echo -e "✅ wpsjs 安装完成"
    fi

    # 释放可能占用的端口
    for PORT in 3000 3001 3889; do
        PID=$(lsof -t -i:$PORT 2>/dev/null)
        if [ ! -z "$PID" ]; then
            echo -e "${YELLOW}端口 $PORT 被占用，正在释放...${NC}"
            kill -9 $PID
        fi
    done

    # 在后台启动 wpsjs debug（端口 3889）
    echo -e "${YELLOW}正在启动 WPS 插件服务（端口 3889）...${NC}"
    cd "$DIR/packages/addin/wps-addin"
    wpsjs debug --nolaunch &
    WPSJS_PID=$!
    cd "$DIR"
    sleep 2
    echo -e "✅ WPS 插件服务已启动 (PID: $WPSJS_PID)"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "  启动成功！请勿关闭此窗口。"
    echo ""
    echo -e "  如果 WPS 首次使用未见「智能审查」选项卡："
    echo -e "  → 完全退出 WPS 再重新打开即可"
    echo ""
    echo -e "  打开 WPS → 智能审查 → 打开审查面板"
    echo -e "  首次使用请在设置中填入 API Key"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    pnpm dev

else
    # ─── Word 模式 ────────────────────────────────────────────
    echo ""
    echo -e "${GREEN}[模式] Microsoft Word${NC}"
    echo ""

    # 安装 HTTPS 开发证书
    echo -e "${YELLOW}正在检查安全证书...${NC}"
    npx office-addin-dev-certs install --machine
    echo -e "✅ 安全证书已配置"

    # 释放可能占用的端口
    for PORT in 3000 3001; do
        PID=$(lsof -t -i:$PORT 2>/dev/null)
        if [ ! -z "$PID" ]; then
            echo -e "${YELLOW}端口 $PORT 被占用，正在释放...${NC}"
            kill -9 $PID
        fi
    done

    # 加载 Word 插件
    echo -e "${YELLOW}正在唤起 Word 并加载插件...${NC}"
    npx office-addin-dev-settings sideload manifest.xml &

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "  启动成功！请勿关闭此窗口。"
    echo ""
    echo -e "  打开 Word → 首页 → 打开审查面板"
    echo -e "  首次使用请在设置中填入 API Key"
    echo ""
    echo -e "  ⚠ 若 Word 提示'证书不受信任'："
    echo -e "  在浏览器打开 https://localhost:3000"
    echo -e "  点击「高级」→「继续前往」后关闭浏览器"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    pnpm dev
fi
