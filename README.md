# AI 法律写作审校助手

在 Microsoft Word 和 WPS Office 中直接运行的 AI 法律文稿审校工具。支持合同审查、诉讼文书审查、法律意见书审查、智能问答，以及要素式诉讼文书自动生成。

![审校结果展示](image/README/1772976139769.png)

## 功能概览

**文稿审校**

- 合同审查 -- 识别风险条款、缺失条款、合规隐患，给出逐条修改建议与法律依据
- 诉讼文书审查 -- 检查格式规范、事实陈述、诉讼请求、证据关联与抗辩逻辑
- 法律意见书审查 -- 审查结论措辞、法律适用、前提假设与免责声明
- 审查深度可调 -- 快速、标准、深度三档，适应不同场景

**文书生成**

- 要素式文书生成 -- 从当前文稿中提取当事人、请求、事实等要素，套用官方模板自动输出 `.docx`
- 内置模板库 -- 包含民事起诉状、答辩状等常用诉讼文书模板
- 纯本地链路 -- Word 直接打开新文档，WPS 自动保存并打开

**智能交互**

- 结构化摘要 -- 一键生成文稿摘要与关键问题列表
- AI 对话 -- 基于当前文稿内容进行追问、解释、分析
- 批注与定位 -- 审校问题一键定位原文、插入批注、应用修改
- 修订模式 -- 支持 Word 修订追踪，修改痕迹清晰可查

**平台与模型**

- 双平台支持 -- 统一适配层，同时兼容 Microsoft Word 和 WPS Office
- 多模型接入 -- Claude、OpenAI 兼容接口（DeepSeek / 通义 / Kimi / GLM 等）、Ollama 本地模型
- MCP 扩展 -- 通过 Model Context Protocol 接入知识库或企业内部系统
- 完全本地可用 -- 搭配 Ollama 可实现全离线运行，无需暴露任何端口

## 快速开始

### 前置要求

- **Node.js** >= 18
- **Microsoft Word** 或 **WPS Office**

### 一键启动

1. 下载或克隆本仓库
2. Windows 双击 `启动.bat`，macOS 双击 `启动.command`
3. 按提示选择 **Word** 或 **WPS** 模式
4. 保持终端窗口运行

启动脚本会自动完成依赖安装、HTTPS 证书初始化、前后端服务启动、加载项注册。

### 打开审校面板

- **Word**：首页功能区 → 打开审校面板
- **WPS**：智能审查 → 打开审校面板

> 首次启动如遇面板白屏，请先在浏览器访问 https://localhost:3000 完成一次证书信任。

### 配置 AI 模型

在侧边栏「设置」页中选择 AI 提供商并填入 API Key：

| 提供商 | 配置 | 示例模型 |
|--------|------|----------|
| Anthropic | API Key | `claude-sonnet-4-6` |
| OpenAI | API Key + Base URL | `gpt-5.2` |
| DeepSeek | API Key + Base URL `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问 | API Key + 兼容接口地址 | `qwen3.5-max` |
| Kimi | API Key + 兼容接口地址 | `kimi-k2.5` |
| GLM | API Key + 兼容接口地址 | `glm-5-plus` |
| Ollama | 默认 `http://localhost:11434` | `qwen2.5:32b` |

## 项目架构

```
contract-review-assistant/
├── manifest.xml                  # Office Add-in 清单文件
├── 启动.bat / 启动.command        # 一键启动脚本
├── .env.example                  # 环境变量模板
├── packages/
│   ├── addin/                    # 前端 — 审校面板 UI
│   ├── server/                   # 后端 — API 与文书生成
│   └── desktop/                  # 桌面打包与安装器
└── .github/workflows/ci.yml     # CI 流水线
```

### 前端 `packages/addin`

React 18 + TypeScript + Tailwind CSS 构建的任务面板，通过统一平台适配层同时支持 Word Office.js API 和 WPS JSAPI。

核心模块：

| 目录 | 职责 |
|------|------|
| `platform/word/` | Word Office.js 适配器 — 文档读取、批注、导航、修订 |
| `platform/wps/` | WPS JSAPI 适配器 — 相同接口的 WPS 实现 |
| `platform/detect.ts` | 运行时平台检测，自动选择适配器 |
| `taskpane/components/` | UI 组件 — 审校结果、设置面板、AI 对话 |
| `store/` | Zustand 状态管理 — 审校结果、设置、对话、条款库 |
| `services/` | 后端 API 调用封装 |

### 后端 `packages/server`

Node.js + Express + TypeScript 构建的 API 服务，负责 AI 调用、流式响应、文书模板渲染。

API 端点：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/review` | POST | 文稿审校（SSE 流式返回问题与摘要） |
| `/api/chat` | POST | AI 对话（SSE 流式返回） |
| `/api/summary` | POST | 文稿摘要生成 |
| `/api/models` | GET | 可用模型列表 |
| `/api/litigation/element-pleading-templates` | GET | 文书模板目录 |
| `/api/litigation/element-pleading-docx` | POST | 要素式文书生成（返回 base64 编码 docx） |
| `/api/litigation/element-complaint` | POST | 诉状要素提取 |
| `/api/mcp/*` | - | MCP 工具调用 |
| `/health` | GET | 健康检查 |

AI 提供商通过统一接口 `AIProvider` 抽象，支持 Claude / OpenAI / Ollama 三种后端，均支持流式输出与工具调用。

### 桌面打包 `packages/desktop`

使用 `@yao-pkg/pkg` 将 Node.js 服务打包为独立 `.exe`，配合 NSIS 脚本生成 Windows 安装器。打包产物包含前端资源、后端代码、模板文件和 Node.js 运行时。

## 开发指南

### 常用命令

```bash
npm install               # 安装依赖
npm run dev               # 启动前后端开发服务器（热重载）
npm run build             # 构建前后端
npm run build:desktop     # 构建桌面安装包
npm run typecheck         # TypeScript 类型检查
npm run lint              # ESLint 代码检查
```

### 默认端口

| 服务 | 端口 |
|------|------|
| 前端（Add-in） | 3000 |
| 后端（Server） | 3001 |
| WPS 调试服务 | 3889 |

### 环境变量

复制 `.env.example` 为 `.env`，按需填入：

```env
PORT=3001                           # 后端端口
ADDIN_PORT=3000                     # 前端端口
ANTHROPIC_API_KEY=                  # Anthropic API Key
OPENAI_API_KEY=                     # OpenAI API Key
OPENAI_BASE_URL=https://api.openai.com/v1
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_PROVIDER=claude             # 默认提供商：claude / openai / ollama
MAX_INPUT_TOKENS=100000             # 最大输入 Token 数
```

### 模板维护

诉讼文书模板位于 `packages/server/assets/templates/`：

- `catalog.json` — 模板分类与目录
- `manifests/*.json` — 各模板的字段定义
- `*.docx` — 模板文件

新增或替换模板后，需同步更新目录、字段清单与相关测试。维护脚本：

```bash
python packages/server/scripts/generate_official_template_assets.py
node packages/server/scripts/normalize-template-assets.mjs
```

## 常见问题

**面板白屏**

本地 HTTPS 证书未被信任。在浏览器访问 https://localhost:3000 手动信任证书后重新打开面板。

**WPS 加载失败**

检查端口 3889 是否被占用、`packages/addin/dist` 是否已生成、`wpsjs debug` 是否正常启动。重启 WPS 通常可以解决。

**是否必须联网**

不是。文档生成与打开均为本地操作。使用 Ollama 时模型推理也在本地完成，可实现完全离线运行。仅在调用云端模型 API 时需要网络。

**桌面安装包支持哪些平台**

当前仅支持 Windows。macOS 用户请使用 `启动.command` 运行开发模式。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript, Tailwind CSS, Zustand, Webpack 5 |
| Office 集成 | @microsoft/office-js, WPS JSAPI |
| 后端 | Node.js, Express, TypeScript, Zod |
| AI | @anthropic-ai/sdk, openai, MCP SDK |
| 文档处理 | pizzip (docx 操作) |
| 桌面打包 | @yao-pkg/pkg, NSIS |
| CI/CD | GitHub Actions (macOS, pnpm, Node 18) |

## 许可与致谢

作者：[sublatesublate-design](https://github.com/sublatesublate-design)

AI 辅助开发：Claude (Anthropic) · Gemini (Google DeepMind) · Codex (OpenAI)
