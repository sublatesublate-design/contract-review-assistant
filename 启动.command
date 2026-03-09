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

# 获取脚本所在目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# macOS 自愈前导块：消除隔离警告和运行权限问题
if [ "$(uname)" = "Darwin" ]; then
    xattr -rd com.apple.quarantine "$DIR" 2>/dev/null
    chmod +x "$DIR/启动.command" 2>/dev/null
fi

# 切换到脚本目录
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
    # 优先使用 npm 安装（走淘宝镜像，国内秒装）
    npm install -g pnpm --registry=https://registry.npmmirror.com 2>/dev/null
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}npm 安装失败，尝试独立安装器...${NC}"
        curl -fsSL https://get.pnpm.io/install.sh | sh -
        # macOS 独立安装器装到 ~/Library/pnpm，Linux 装到 ~/.local/share/pnpm
        if [ -d "$HOME/Library/pnpm" ]; then
            export PNPM_HOME="$HOME/Library/pnpm"
        elif [ -d "$HOME/.local/share/pnpm" ]; then
            export PNPM_HOME="$HOME/.local/share/pnpm"
        fi
        export PATH="$PNPM_HOME:$PATH"
    fi

    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}pnpm 安装失败！${NC}"
        echo -e "请手动执行：${YELLOW}npm install -g pnpm${NC}"
        exit 1
    fi
fi
echo -e "✅ 包管理工具准备就绪"

# ─── npm 缓存权限检测 (防老版本遗留 EACCES) ────────────────────────
if [ -d "$HOME/.npm" ]; then
    ROOT_OWNED=$(find "$HOME/.npm" -user root -print -quit 2>/dev/null)
    if [ ! -z "$ROOT_OWNED" ]; then
        echo -e "${YELLOW}检测到 root 权限缓存，正在修复以防止 npm/pnpm 安装报错...${NC}"
        sudo chown -R $(whoami) "$HOME/.npm"
    fi
fi

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

    # WPS 模式前置检查：确保有 dist 编译产物，防止白屏
    if [ ! -d "packages/addin/dist" ]; then
        echo -e "${YELLOW}首次运行 WPS 模式，正在自动构建前端资源...${NC}"
        pnpm run build:addin
    fi

    # 安装 HTTPS 开发证书（WPS 的 dev server 同样需要 HTTPS）
    echo -e "${YELLOW}正在检查安全证书...${NC}"
    npx office-addin-dev-certs install --machine 2>/dev/null
    echo -e "✅ 安全证书已配置"

    # 释放可能占用的端口
    for PORT in 3000 3001 3889; do
        PID=$(lsof -t -i:$PORT 2>/dev/null)
        if [ ! -z "$PID" ]; then
            echo -e "${YELLOW}端口 $PORT 被占用，正在释放...${NC}"
            kill -9 $PID
        fi
    done

    # 在后台启动 wpsjs debug（端口 3889），改用 npx 免全局安装防 EACCES
    echo -e "${YELLOW}正在启动 WPS 插件服务（端口 3889）...${NC}"
    cd "$DIR/packages/addin/wps-addin"
    npx wpsjs debug --nolaunch &
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

    # Word.app 存在性检查
    if [ ! -d "/Applications/Microsoft Word.app" ]; then
        echo -e "${RED}[运行被拦截] 我们发现您这台电脑没有安装正版 Microsoft Word！${NC}"
        echo -e "由于 Mac 机制，继续开启将会导致 WPS(或其他软件) 被强行当做 Word 打开并导致异常。"
        echo ""
        echo -e "👉 ${YELLOW}请重新运行脚本，并输入 P 选择 WPS 模式！${NC}"
        echo -e "（或者如果您知道自己在做什么，请确保 docx 文件默认程序已关联 Word）"
        exit 1
    fi

    # .docx 文件关联提醒
    if [ -d "/Applications/wpsoffice.app" ] || [ -d "/Applications/WPS Office.app" ]; then
        echo -e "⚠ ${YELLOW}检测到您同时安装了 WPS 和 Word。如果您等会弹出来的是 WPS，${NC}"
        echo -e "   ${YELLOW}请右键任意 .docx 文档 -> 显示简介 -> 打开方式 -> 选 Word -> 全部更改。${NC}"
        echo ""
    fi

    # 安装 HTTPS 开发证书
    echo -e "${YELLOW}正在检查安全证书...${NC}"
    npx office-addin-dev-certs install --machine
    if [ $? -eq 0 ]; then
        echo -e "✅ 安全证书已配置"
    else
        echo -e "${RED}⚠ 安全证书配置失败，但程序将继续。由于各种原因可能导致开发证书不受信任。${NC}"
        echo -e "   如果 Word 插件加载白屏，请在浏览器中打开 https://localhost:3000 点击信任。${NC}"
    fi

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
