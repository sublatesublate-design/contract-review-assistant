# AI 合同审查助手 v3.0.0

面向法律、法务与商务团队的 AI 文书审校工具，支持在 Microsoft Word 与 WPS Office 中直接完成风险识别、批注定位、修订建议与对话式问答。

## 项目概览

- 支持 Microsoft Word 与 WPS Office。
- 支持 Windows 与 macOS。
- 支持合同文书、诉讼文书、法律意见书三类法律文书。
- 支持 Anthropic、OpenAI 兼容接口、Ollama 本地模型。
- 支持审校深度、审校立场、内置模板与自定义模板。
- 支持 MCP 扩展，可接入外部专业工具或法律知识服务。

## v3.0.0 更新重点

- 新增法律文书类型切换：
  - 合同文书
  - 诉讼文书
  - 法律意见书
- 新增针对不同文书类型的审校维度与问题分类。
- 设置面板重构，模型、密钥、模板与 MCP 配置集中管理。
- 版本号、安装器元数据与前端展示统一升级到 `3.0.0`。

## 主要能力

### 1. 文书审校

- 合同文书：风险条款、缺失条款、合规问题、条款分析。
- 诉讼文书：格式规范、事实陈述、法律适用、请求事项、证据关联、对抗分析。
- 法律意见书：结论措辞、法律适用、假设前提、免责声明、结构完整性、格式规范。

### 2. 可调审校策略

- 审校深度：`quick`、`standard`、`deep`
- 审校立场：`neutral`、`party_a`、`party_b`
- 全局提示词：适合固化团队内部口径
- 自定义模板：支持为特定文书或场景绑定专用提示词

### 3. 文档内协作

- 在文档中定位原文片段
- 生成批注与修订建议
- 在侧边栏查看问题列表、摘要和历史记录
- 结合聊天面板做针对性解释与追问

### 4. 模型接入方式

- `Anthropic`：适合直接使用 Claude 系列模型
- `OpenAI`：既可直连 OpenAI，也可接入 DeepSeek、通义千问、Kimi、GLM 等兼容接口
- `Ollama`：适合完全本地离线部署

### 5. MCP 扩展

- 后端支持 MCP Server 连接
- 可把外部工具能力接入到审校流程中
- 适合扩展法律检索、知识库、企业内部系统等能力

## 目录结构

```text
.
├─ manifest.xml                # Office Add-in 清单
├─ 启动.bat                     # Windows 启动脚本
├─ 启动.command                 # macOS 启动脚本
├─ packages/
│  ├─ addin/                   # Word / WPS 前端与任务面板
│  ├─ server/                  # 审校后端服务
│  └─ desktop/                 # 桌面打包与安装器相关文件
└─ .env.example                # 环境变量模板
```

## 面向普通用户的快速开始

### 前置要求

- Node.js `>= 18`
- 已安装 Microsoft Word 或 WPS Office

### 第一步：获取项目

1. 下载仓库代码或使用已经打包好的分发包。
2. 解压后进入项目根目录。

### 第二步：运行启动脚本

- Windows：双击 `启动.bat`
- macOS：双击 `启动.command`

脚本会自动完成以下动作：

- 检查 Node.js 环境
- 安装项目依赖
- 询问使用 Word 还是 WPS
- 初始化证书与开发运行环境
- 启动前端与后端服务

首次启动时请保持终端窗口不要关闭。

### 第三步：在 Word 或 WPS 中打开助手

- 选择 Word 模式后，会尝试自动注册 Office Add-in。
- 选择 WPS 模式后，会启动 WPS 调试服务并加载插件面板。

如果是首次使用，证书信任与浏览器安全确认可能需要手动完成一次。

### 第四步：配置 AI

打开侧边栏的“设置”页，完成以下配置：

#### Anthropic

- Provider 选择 `Anthropic`
- 填入 `Anthropic API Key`
- 选择模型，例如：
  - `claude-3-7-sonnet-20250219`
  - `claude-3-5-sonnet-20241022`

#### OpenAI 兼容接口

- Provider 选择 `OpenAI`
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

#### Ollama 本地模型

- Provider 选择 `Ollama（本地）`
- 地址默认可用：`http://localhost:11434`
- 填入本地模型名称，例如：`qwen2.5:32b`

## 面向开发者的启动方式

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

默认约定：

- Add-in 前端端口：`3000`
- Server 后端端口：`3001`
- WPS 调试服务端口：`3889`

### 3. 常用脚本

```bash
npm run dev
npm run build
npm run build:addin
npm run build:server
npm run build:desktop
npm run lint
npm run typecheck
```

## 环境变量

参考根目录 `.env.example`：

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

说明：

- `PORT`：后端服务端口
- `ADDIN_PORT`：前端开发服务器端口
- `OPENAI_BASE_URL`：OpenAI 兼容接口地址
- `OLLAMA_BASE_URL`：本地 Ollama 服务地址
- `DEFAULT_PROVIDER`：默认提供商

## 推荐使用方式

### 法务 / 律师团队

- 使用 `standard` 或 `deep` 审校深度
- 配置全局提示词，统一审校口径
- 按文书类型维护模板
- 对接 MCP 工具，补充法规、案例或内部知识库能力

### 商务 / 非技术用户

- 直接运行 `启动.bat` 或 `启动.command`
- 使用 OpenAI 兼容接口接入 DeepSeek 等服务
- 先从合同文书开始使用默认模板

### 高保密场景

- 使用 `Ollama`
- 在本地部署模型
- 避免将敏感文书内容发送到外部 API

## 常见问题

### 1. Word 或 WPS 中面板白屏

通常是本地 HTTPS 证书尚未被系统或浏览器信任。

可尝试：

1. 保持启动脚本与本地服务运行中。
2. 用浏览器访问 `https://localhost:3000`。
3. 如果浏览器提示不安全，手动继续访问一次。
4. 返回 Word 或 WPS 重新打开面板。

### 2. WPS 首次启动没有加载成功

可检查：

- `packages/addin/dist` 是否已经生成
- `3889` 端口是否被占用
- WPS 是否已经完全退出后重新打开

### 3. 审校时报 401 或鉴权失败

通常是以下原因之一：

- API Key 填写错误
- 服务商账户余额不足
- Base URL 与模型名不匹配

### 4. 想完全离线使用

请使用 Ollama，并在本地预先拉起目标模型服务。

## 技术架构

- `packages/addin`
  - React + TypeScript
  - Word / WPS 双端适配
- `packages/server`
  - Node.js + Express
  - 审校路由、摘要路由、MCP 集成
- `packages/desktop`
  - 桌面打包与安装器构建相关配置

## 版本信息

- 当前版本：`3.0.0`
- Add-in Manifest 版本：`3.0.0.0`

## 致谢

- [sublatesublate-design](https://github.com/sublatesublate-design)
- Claude
- Gemini
- Codex
