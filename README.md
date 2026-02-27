# 🔍 AI 合同审查助手

> 基于人工智能的合同智能审查工具，以 Word 插件形式运行，支持批注、修订标记与上下文对话。

![Word Add-in](https://img.shields.io/badge/Word-Add--in-blue?logo=microsoftword)
![Node.js](https://img.shields.io/badge/Node.js-≥18-green?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ 功能特性

- 🤖 **AI 智能审查** — 自动识别合同类型，从法律合规、风险防控、条款完善、利益保护四个维度审查
- 📝 **Word 深度集成** — 直接在 Word 中显示审查结果，一键插入批注或修订标记
- 💬 **上下文对话** — 针对合同内容与 AI 进行追问对话
- 🔧 **MCP 工具扩展** — 可挂接外部法律数据库等 MCP 服务器，让 AI 在审查时援引法条
- 📋 **自定义模板** — 内置多种合同类型模板，也可自建专属审查规则
- 🔒 **数据安全** — 支持 Ollama 本地模型，完全离线审查

## 📋 支持的 AI 提供商

| 提供商 | 说明 | 是否需要联网 |
|--------|------|:---:|
| **Anthropic** | Claude 系列模型 | ✅ |
| **OpenAI** | GPT 系列，也兼容 DeepSeek 等 API | ✅ |
| **Ollama** | 本地部署，完全离线 | ❌ |

---

## 🚀 快速开始（5 分钟上手）

### 第 1 步：安装 Node.js

1. 打开 [Node.js 官网](https://nodejs.org/)
2. 下载 **LTS（长期支持版）**
3. 安装时**一路点"下一步"**即可，不需要改任何设置
4. 安装完成后，按 `Win + R`，输入 `cmd` 回车，输入 `node -v`，如果显示版本号（如 `v20.x.x`）就说明安装成功

### 第 2 步：下载本项目

**方法 A：Git 克隆（推荐）**

```bash
git clone https://github.com/sublatesublate-design/contract-review-assistant.git
cd contract-review-assistant
```

**方法 B：直接下载 ZIP**

1. 点击本页面右上方绿色的 **Code** 按钮
2. 选择 **Download ZIP**
3. 解压到任意目录

### 第 3 步：启动

**双击项目根目录下的 `启动.bat`**，它会自动完成以下操作：

- ✅ 检测 Node.js 环境
- ✅ 安装 pnpm 包管理器（首次）
- ✅ 安装项目依赖（首次，约 1-3 分钟）
- ✅ 安装 HTTPS 开发证书（首次）
- ✅ 注册 Word 插件
- ✅ 启动前端 + 后端服务

> ⚠️ **启动后请勿关闭命令行窗口**，关闭窗口 = 关闭服务 = 插件无法使用。

### 第 4 步：在 Word 中使用

1. **打开 Word**（任意文档）
2. 点击菜单栏 **首页** 选项卡，找到「合同审查助手」按钮
3. 如果首页没有，点 **插入** → **加载项** → **我的加载项** → 双击「AI 合同审查助手」
4. 打开侧边栏后，去 **设置** 选项卡填入你的 API Key（见下方教程）
5. 回到 **审查结果** 选项卡，点击「开始审查」

---

## 🔑 如何获取 API Key

本工具支持任何 OpenAI 兼容接口。以下是主流 AI 平台的配置方式：

### Anthropic

1. 打开 [Anthropic Console](https://console.anthropic.com/)
2. 注册账号并登录
3. 点击左侧 **API Keys** → **Create Key**
4. 复制密钥（以 `sk-ant-` 开头）
5. 在插件设置中选择 **Anthropic**，粘贴到 API Key 栏

### OpenAI

1. 打开 [OpenAI Platform](https://platform.openai.com/)
2. 注册账号并登录
3. 点击右上角头像 → **View API Keys** → **Create new secret key**
4. 复制密钥（以 `sk-` 开头）
5. 在插件设置中选择 **OpenAI**，粘贴到 API Key 栏

### 🇨🇳 国产大模型（推荐，性价比高）

以下平台均兼容 OpenAI 接口协议，在插件中选择 **OpenAI** 提供商，然后填写对应的 Base URL 和模型名即可。

| 平台 | 注册地址 | API Base URL | 模型名示例 |
|------|---------|-------------|-----------|
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | `https://api.deepseek.com` | `deepseek-chat`、`deepseek-reasoner` |
| **通义千问 (Qwen)** | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max`、`qwen-plus` |
| **Kimi (月之暗面)** | [platform.moonshot.cn](https://platform.moonshot.cn/) | `https://api.moonshot.cn/v1` | `moonshot-v1-128k` |
| **智谱 GLM** | [open.bigmodel.cn](https://open.bigmodel.cn/) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus`、`glm-4-flash` |
| **MiniMax** | [platform.minimaxi.com](https://platform.minimaxi.com/) | `https://api.minimax.chat/v1` | `MiniMax-Text-01` |

配置步骤（以 DeepSeek 为例）：

1. 去对应平台注册账号，获取 API Key
2. 在插件设置中选择 **OpenAI**
3. **API Base URL** 填写上表中的地址
4. **API Key** 填写平台提供的密钥
5. **模型** 填写上表中的模型名

### Ollama（完全免费 + 离线）

适合对数据安全要求高、不希望合同内容上传到云端的用户：

1. 打开 [Ollama 官网](https://ollama.com)，下载安装
2. 打开命令行，运行 `ollama pull qwen3:32b`（需耐心等待）
3. 在插件设置中选择 **Ollama（本地）**，无需 API Key

---

## 🛠️ 项目结构

```
合同审查助手/
├── 启动.bat                    ← 双击启动
├── manifest.xml               ← Word 插件清单
├── packages/
│   ├── addin/                 ← 前端（React + TypeScript）
│   │   └── src/
│   │       ├── taskpane/      ← UI 面板（审查/设置/对话）
│   │       ├── store/         ← 状态管理（Zustand）
│   │       ├── services/      ← API 调用封装
│   │       └── office/        ← Word API 集成
│   └── server/                ← 后端（Express + TypeScript）
│       └── src/
│           ├── routes/        ← REST API 路由
│           ├── services/
│           │   ├── ai/        ← AI 提供商（Claude/OpenAI/Ollama）
│           │   ├── mcp/       ← MCP 工具扩展
│           │   └── review/    ← 审查逻辑（提示词/解析器）
│           └── index.ts       ← 服务入口
└── package.json
```

---

## ❓ 常见问题

### Q: 双击启动.bat 闪退

**A:** 右键 `启动.bat` → 选择「以管理员身份运行」。或者检查是否已安装 Node.js（在命令行输入 `node -v` 看是否有输出）。

### Q: Word 中看不到插件按钮

**A:** 确保 `启动.bat` 窗口**没有关闭**（服务在运行），然后：

- 点击 Word **插入** → **加载项** → **我的加载项** → 找到并双击「AI 合同审查助手」

### Q: 插件显示空白 / 无法加载

**A:** 这通常是 HTTPS 证书问题。在浏览器中打开 `https://localhost:3000`，如果弹出不安全警告，点击「高级」→「继续前往」。然后回到 Word 重新打开插件。

### Q: API 调用报错 "401 Unauthorized"

**A:** API Key 填写错误或已过期。请重新去对应平台生成新的 Key。

### Q: 如何切换审查视角（甲方/乙方/中立）？

**A:** 在插件的「设置」选项卡中，找到「审查立场」部分选择即可。

---

## 🔌 MCP 工具扩展（高级功能）

MCP（Model Context Protocol）允许 AI 在审查时调用外部工具，例如查询法律数据库。

在插件「设置」页面底部的「MCP 工具扩展」区域可以管理 MCP 服务器。添加后，AI 审查时会自动调用可用的工具来增强分析。

---

## 📄 开源协议

MIT License
