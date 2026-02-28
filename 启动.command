#!/bin/bash

# ==========================================
# AI 合同审查助手 - Mac 启动脚本
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}      启动 AI 合同审查助手 (Mac 版)     ${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

# 获取脚本所在目录并切换过去
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. 检测 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未检测到 Node.js 环境！${NC}"
    echo -e "${YELLOW}请先安装 Node.js：${NC}"
    echo "打开浏览器访问: https://nodejs.org/"
    echo "下载 LTS 版本并安装。安装完成后重新运行此脚本。"
    echo ""
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

NODE_VER=$(node -v)
echo -e "✅ Node.js 已安装: ${NODE_VER}"

# 2. 检测 pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}正在自动安装核心依赖管理器 (pnpm)...${NC}"
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo -e "${RED}pnpm 安装失败！可能是权限问题，请尝试在终端执行: sudo npm install -g pnpm${NC}"
        read -n 1 -s -r -p "按任意键退出..."
        exit 1
    fi
fi

echo -e "✅ 取包管理工具准备就绪"

# 3. 安装项目依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}首次运行，正在下载项目依赖 (大约需要 1-3 分钟)...${NC}"
    pnpm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}依赖安装失败！请检查网络连接后重试。${NC}"
        read -n 1 -s -r -p "按任意键退出..."
        exit 1
    fi
    echo -e "✅ 依赖下载完成"
else
    echo -e "✅ 依赖已就绪"
fi

# 4. 安装本地开发证书
echo -e "${YELLOW}正在检查安全证书...${NC}"
# Mac 会弹窗要求输入密码来安装证书
npx office-addin-dev-certs install --machine
echo -e "✅ 安全证书已配置"

# 5. 清理可能占用的端口 (Mac 特有处理)
PORT_3000=$(lsof -t -i:3000)
if [ ! -z "$PORT_3000" ]; then
    echo -e "${YELLOW}端口 3000 被占用，正在释放...${NC}"
    kill -9 $PORT_3000
fi
PORT_3001=$(lsof -t -i:3001)
if [ ! -z "$PORT_3001" ]; then
    echo -e "${YELLOW}端口 3001 被占用，正在释放...${NC}"
    kill -9 $PORT_3001
fi

# 6. 加载 Word 插件
echo -e "${YELLOW}正在唤起 Word 并加载插件...${NC}"
# 注意：这会尝试打开 Mac 上的 Word
npx office-addin-dev-settings sideload manifest.xml &
SIDELOAD_PID=$!

# 7. 启动本地服务
echo -e "${GREEN}启动本地服务器...${NC}"
echo -e "----------------------------------------"
echo -e "${YELLOW}⚠️  重要提示：${NC}"
echo -e "1. ${GREEN}请不要关闭此终端窗口！${NC} 关掉终端插件就会失效。"
echo -e "2. 如果 Word 提示'证书不受信任'或'不安全'，请在浏览器中"
echo -e "   尝试打开 https://localhost:3000 并选择'继续前往'。"
echo -e "----------------------------------------"

# 运行前后端服务
pnpm dev
