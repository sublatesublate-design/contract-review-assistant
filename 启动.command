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
NODE_MAJOR=$(node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null)
if [ ! -z "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 24 ]; then
    echo -e "${YELLOW}提示: 检测到 Node.js $NODE_MAJOR。WPS 调试工具在部分机器上与 Node 24 存在兼容波动。${NC}"
fi

# 固定安装 office-addin 工具，避免 npx 临时缓存导致随机失败
RUNTIME_ROOT="$HOME/.contract-review-assistant"
OFFICE_RUNTIME_DIR="$RUNTIME_ROOT/office-addin-runtime"
OFFICE_CERTS_BIN="$OFFICE_RUNTIME_DIR/node_modules/.bin/office-addin-dev-certs"
OFFICE_SETTINGS_BIN="$OFFICE_RUNTIME_DIR/node_modules/.bin/office-addin-dev-settings"

ensure_office_addin_tools() {
    mkdir -p "$OFFICE_RUNTIME_DIR"
    if [ ! -f "$OFFICE_RUNTIME_DIR/package.json" ]; then
        printf '{\n  "name": "office-addin-runtime",\n  "private": true\n}\n' > "$OFFICE_RUNTIME_DIR/package.json"
    fi

    if [ ! -x "$OFFICE_CERTS_BIN" ] || [ ! -x "$OFFICE_SETTINGS_BIN" ]; then
        echo -e "${YELLOW}正在安装 Office 调试工具（首次约 10-30 秒）...${NC}"
        npm --prefix "$OFFICE_RUNTIME_DIR" install office-addin-dev-certs office-addin-dev-settings --no-audit --no-fund
        if [ $? -ne 0 ]; then
            echo -e "${RED}Office 调试工具安装失败，请检查网络后重试。${NC}"
            exit 1
        fi
    fi
}



# ─── npm 缓存权限检测 (防老版本遗留 EACCES) ────────────────────────
if [ -d "$HOME/.npm" ]; then
    ROOT_OWNED=$(find "$HOME/.npm" -user root -print -quit 2>/dev/null)
    if [ ! -z "$ROOT_OWNED" ]; then
        echo -e "${YELLOW}检测到 root 权限缓存，正在修复以防止 npm 安装报错...${NC}"
        sudo chown -R $(whoami) "$HOME/.npm"
    fi
fi

# ─── 安装项目依赖 ─────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}首次运行，正在下载项目依赖 (约 1-3 分钟)...${NC}"
    npm install
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
        npm run build:addin
    fi

    # 安装 HTTPS 开发证书（WPS 的 dev server 同样需要 HTTPS）
    echo -e "${YELLOW}正在检查安全证书...${NC}"
    ensure_office_addin_tools
    "$OFFICE_CERTS_BIN" install --machine 2>/dev/null
    echo -e "✅ 安全证书已配置"

    # 释放可能占用的端口
    for PORT in 3000 3001 3889; do
        PID=$(lsof -t -i:$PORT 2>/dev/null)
        if [ ! -z "$PID" ]; then
            echo -e "${YELLOW}端口 $PORT 被占用，正在释放...${NC}"
            kill -9 $PID
        fi
    done

    # 固定安装并后台启动 wpsjs debug（端口 3889），避免 npx 临时目录依赖损坏
    echo -e "${YELLOW}正在启动 WPS 插件服务（端口 3889）...${NC}"
    WPSJS_RUNTIME_DIR="$HOME/.contract-review-assistant/wpsjs-runtime"
    WPSJS_BIN="$WPSJS_RUNTIME_DIR/node_modules/.bin/wpsjs"
    WPSJS_LOG="$DIR/.wpsjs-debug.log"
    mkdir -p "$WPSJS_RUNTIME_DIR"

    if [ ! -f "$WPSJS_RUNTIME_DIR/package.json" ]; then
        printf '{\n  "name": "wpsjs-runtime",\n  "private": true\n}\n' > "$WPSJS_RUNTIME_DIR/package.json"
    fi

    if [ ! -x "$WPSJS_BIN" ]; then
        echo -e "${YELLOW}首次运行 WPS 模式，正在安装 wpsjs（约 10-30 秒）...${NC}"
        npm --prefix "$WPSJS_RUNTIME_DIR" install wpsjs@2.2.3 --no-audit --no-fund
        if [ $? -ne 0 ]; then
            echo -e "${RED}wpsjs 安装失败，请检查网络后重试。${NC}"
            exit 1
        fi
    fi

    cd "$DIR/packages/addin/wps-addin"
    "$WPSJS_BIN" debug --nolaunch > "$WPSJS_LOG" 2>&1 &
    WPSJS_PID=$!
    cd "$DIR"
    sleep 2

    if ! kill -0 "$WPSJS_PID" 2>/dev/null; then
        echo -e "${RED}WPS 插件服务启动失败。最近日志如下：${NC}"
        tail -n 20 "$WPSJS_LOG"
        echo -e "${YELLOW}可尝试：rm -rf ~/.npm/_npx ~/.contract-review-assistant/wpsjs-runtime 后重试。${NC}"
        exit 1
    fi

    echo -e "✅ WPS 插件服务已启动 (PID: $WPSJS_PID)"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "  启动成功！请勿关闭此窗口。"
    echo ""
    echo -e "  如果 WPS 首次使用未见「智能审查」选项卡："
    echo -e "  → 完全退出 WPS 再重新打开即可"
    echo ""
    echo -e "  打开 WPS → 智能审查 → 打开审查面板"
    echo -e "  支持要素式文书生成；本地直接打开失败时会自动下载 docx"
    echo -e "  首次使用请在设置中填入 API Key"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    npm run dev

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
    ensure_office_addin_tools
    "$OFFICE_CERTS_BIN" install --machine
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
    WORD_SIDELOAD_LOG="$DIR/.word-sideload.log"
    "$OFFICE_SETTINGS_BIN" sideload manifest.xml > "$WORD_SIDELOAD_LOG" 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}Word 加载项注册失败。最近日志如下：${NC}"
        tail -n 30 "$WORD_SIDELOAD_LOG"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "  启动成功！请勿关闭此窗口。"
    echo ""
    echo -e "  打开 Word → 首页 → 打开审查面板"
    echo -e "  支持要素式文书生成"
    echo -e "  首次使用请在设置中填入 API Key"
    echo ""
    echo -e "  ⚠ 若 Word 提示'证书不受信任'："
    echo -e "  在浏览器打开 https://localhost:3000"
    echo -e "  点击「高级」→「继续前往」后关闭浏览器"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    npm run dev
fi
