# AI 合同审查助手 v3.0.0

面向法律、法务与商业团队的 AI 文稿审查工具，支持在 Microsoft Word 与 WPS Office 中直接完成文档审查、摘要问答、批注定位，以及诉讼文书要素式生成。

## 核心能力

- 合同审查：识别风险条款、缺失条款、合规问题，并生成修改建议。
- 诉讼文书审查：检查格式、事实陈述、请求事项、证据关联与抗辩逻辑。
- 法律意见书审查：检查结论措辞、法律适用、前提假设与免责声明。
- 摘要与对话：支持结构化摘要、问题列表、追问和解释。
- 要素式文书生成：从当前文稿抽取主体、请求、事实等要素，套用官方模板生成新的 `docx`。
- Word / WPS 双平台：统一平台适配层，支持 Windows 与 macOS 的本地开发运行。
- MCP 扩展：后端可接入 MCP Server，扩展检索、知识库或企业内部系统能力。

## v3.0.0 当前状态

- 已内置诉讼文书要素式文书生成能力。
- 生成文书链路已收口为纯本地模式：
  - Word：直接在宿主中打开新文档。
  - WPS：优先本地直接打开，宿主不支持时自动下载 `docx`。
- 已移除 WebOffice 相关公网链路，不需要把本地端口暴露到互联网。
- 服务端已挂载 `summary` 路由，摘要能力可正常调用。

## 项目结构

```text
.
├── manifest.xml                     # Office Add-in 清单
├── 启动.bat                          # Windows 启动脚本
├── 启动.command                      # macOS 启动脚本
├── packages/
│   ├── addin/                       # Word / WPS 前端与任务面板
│   ├── server/                      # 后端 API、模板资产、生成逻辑
│   └── desktop/                     # 桌面打包脚本与安装包相关文件
└── .env.example                     # 环境变量模板
```

## 快速开始

### 前置要求

- Node.js `>= 18`
- Microsoft Word 或 WPS Office

### 面向普通用户

1. 下载或克隆仓库。
2. Windows 双击 `启动.bat`，macOS 双击 `启动.command`。
3. 按提示选择 `Word` 或 `WPS`。
4. 保持启动窗口运行，不要关闭。
5. 在侧边栏“设置”中配置 AI 提供商与 API Key。

启动脚本会自动完成：

- 检查 Node.js
- 安装项目依赖
- 初始化本地 HTTPS 证书
- 启动前端 `https://localhost:3000`
- 启动后端 `http://localhost:3001`
- Word 模式下 sideload 加载项
- WPS 模式下启动 `wpsjs debug` 服务（端口 `3889`）

### 打开加载项

- Word：`首页 -> 打开审查面板`
- WPS：`智能审查 -> 打开审查面板`

首次启动如果遇到证书信任提示，请先在浏览器访问 [https://localhost:3000](https://localhost:3000) 完成一次信任。

## 要素式文书生成

要素式文书生成会读取当前文稿内容，调用 LLM 提取字段，再套用官方模板输出新的 `docx`。

- 模板目录位于 `packages/server/assets/templates`
- 模板目录清单位于 `packages/server/assets/templates/catalog.json`
- 每个模板的字段清单位于 `packages/server/assets/templates/manifests`

当前行为：

- Word：直接创建并打开新文档。
- WPS：先保存临时文件再尝试本地打开，失败时自动下载。
- macOS + WPS：如果宿主没有自动打开生成结果，通常手动打开下载的 `docx` 即可。

## 纯本地链路说明

本项目当前不依赖 WebOffice，不需要对外暴露本地端口。

- 文档打开链路是本地完成的，不走公网文档托管。
- 如果使用 `Anthropic` 或 `OpenAI` 兼容接口，联网仅用于调用对应模型 API。
- 如果使用 `Ollama`，可以做到模型调用也在本地完成。

## AI 提供商配置

在加载项设置页中可配置以下模式：

### Anthropic

- Provider：`Anthropic`
- 填入 `Anthropic API Key`
- 选择 Claude 模型

### OpenAI 兼容接口

- Provider：`OpenAI`
- 填入 `OpenAI API Key`
- 配置 `API Base URL`
- 配置模型名

常见示例：

| 服务商 | Base URL | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.2` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问 | 兼容接口地址 | `qwen3.5-max` |
| Kimi | 兼容接口地址 | `kimi-k2.5` |
| GLM | 兼容接口地址 | `glm-5-plus` |

### Ollama

- Provider：`Ollama`
- 默认地址：`http://localhost:11434`
- 配置本地模型名，例如 `qwen2.5:32b`

## 面向开发者

### 常用命令

```bash
npm install
npm run dev
npm run build
npm run build:addin
npm run build:server
npm run build:desktop
npm run typecheck
npm run lint
```

补充命令：

```bash
npm run test -w server
npm run generate:templates -w server
npm run normalize:templates -w server
```

默认端口约定：

- Add-in 前端：`3000`
- Server：`3001`
- WPS 调试服务：`3889`

### 环境变量

参考 `.env.example`：

```env
PORT=3001
ADDIN_PORT=3000

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OLLAMA_BASE_URL=http://localhost:11434

DEFAULT_PROVIDER=claude
MAX_INPUT_TOKENS=100000
```

## 模板资产维护

诉讼文书模板与清单已经纳入仓库，维护入口包括：

- `packages/server/scripts/generate_official_template_assets.py`
- `packages/server/scripts/normalize-template-assets.mjs`
- `packages/server/scripts/unpack-template.mjs`

如果你新增或替换模板，至少要同步更新：

- 模板文件
- `catalog.json`
- 对应 `manifest`
- 相关测试

## 常见问题

### Word / WPS 面板白屏

通常是本地 HTTPS 证书尚未被系统或浏览器信任。

处理方式：

1. 保持启动脚本和本地服务运行。
2. 在浏览器访问 [https://localhost:3000](https://localhost:3000)。
3. 如浏览器提示不安全，手动继续访问一次。
4. 回到 Word 或 WPS 重新打开面板。

### WPS 首次启动没有加载成功

优先检查：

- `3889` 端口是否被占用
- `packages/addin/dist` 是否已生成
- `wpsjs debug` 是否正常启动
- 关闭并重启 WPS 后是否恢复

### 是否必须联网

不是。

- 文档生成与打开链路不需要公网暴露。
- 使用 `Ollama` 时，模型调用也可以完全本地化。
- 只有使用外部模型提供商时，才需要访问对应模型 API。

### 桌面安装包支持哪些平台

当前桌面打包脚本主要面向 Windows。  
macOS 用户目前建议使用 `启动.command` 运行本地开发模式。

## 技术架构

- `packages/addin`
  React + TypeScript，负责 Word/WPS 双端适配、任务面板 UI、批注/导航/文书打开逻辑。
- `packages/server`
  Node.js + Express，负责审查、摘要、聊天、文件临时存储、诉讼文书模板读取与生成。
- `packages/desktop`
  负责桌面打包与安装器脚本。

## 致谢

- [sublatesublate-design](https://github.com/sublatesublate-design)
- Claude
- Gemini
- Codex
