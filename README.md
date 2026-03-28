# ⚖️ AI 法律写作审校助手

一款装在 Word / WPS 里的 AI 助手，帮你审查合同、检查诉讼文书、自动生成法律文书。打开文档，点一下按钮，AI 就能帮你逐条找出问题并给出修改建议。


## 🆕 v3.0 更新内容

- **要素式起诉状生成** -- AI 自动从你的文稿中提取当事人、诉讼请求、事实与理由等要素，套用官方模板一键生成标准格式的民事起诉状
- **法律意见书审查** -- 以前只支持合同审查，现在新增了法律意见书这一文稿类型。AI 会针对法律意见书的特点进行专项检查：结论是否措辞严谨、引用的法律法规是否准确适用、前提假设是否明确列出、免责声明是否完整合规，审查维度和提示词都做了针对性适配

---

## ✨ 它能做什么

**📋 审查你的文稿** -- 打开合同或法律文书，点击「开始审校」，AI 会逐条分析并标记问题：

- 合同里的风险条款、遗漏条款、合规隐患
- 诉讼文书的格式、事实陈述、请求事项、证据链
- 法律意见书的结论措辞、法律适用、免责声明

每个问题都附带修改建议和法律依据，你可以一键定位到原文、插入批注、或直接采纳修改。

**📝 自动生成法律文书** -- 已有一份材料但需要生成正式文书？AI 会从你的文稿中自动提取当事人、事实、请求等关键要素，套用官方模板生成标准格式的 Word 文档。内置民事起诉状、答辩状等常用模板。

**💬 智能问答** -- 对文稿内容有疑问？切换到「AI 对话」标签页，直接用中文提问，AI 会基于你当前打开的文档来回答。


---

## 🚀 安装与使用

### 第一步：安装 Node.js

本工具运行需要 Node.js（一个免费的运行环境）。如果你的电脑上还没有，请先安装：

1. 打开 https://nodejs.org
2. 下载 **LTS（长期支持版）** -- 页面上最显眼的那个绿色按钮
3. 双击下载的安装包，一路点「下一步」即可

安装完成后可以验证一下：按 `Win + R`，输入 `cmd` 回车，在黑色窗口里输入 `node -v`，如果显示版本号（比如 `v18.x.x` 或更高）就说明装好了。

### 第二步：下载本项目

**方式一：直接下载**（推荐新手）

点击本页面绿色的 **Code** 按钮 → **Download ZIP** → 解压到你喜欢的位置。

**方式二：Git 克隆**

```bash
git clone https://github.com/sublatesublate-design/contract-review-assistant.git
```

### 第三步：启动

- **Windows 用户**：双击文件夹里的 `启动.bat`
- **macOS 用户**：双击文件夹里的 `启动.command`

启动后会出现一个命令行窗口，按提示选择你用的是 **Word** 还是 **WPS**，然后等它自动完成配置。

> **注意**：这个窗口要一直开着，关掉它助手就停止工作了。

首次启动会自动安装依赖、配置证书，可能需要等待几分钟。后续启动会快很多。

### 第四步：打开审校面板

- **Word**：点击顶部菜单栏「首页」→ 「打开审校面板」
- **WPS**：点击顶部菜单栏「智能审查」→ 「打开审校面板」

右侧会弹出审校助手的侧边栏。

### 第五步：配置 AI（必须）

首次使用需要告诉助手用哪个 AI 模型。点击侧边栏的「设置」标签页：

1. **选择 AI 提供商**（选一个你有的就行）
2. **填入 API Key**（相当于 AI 服务的密码，各平台注册后都能免费获取）
3. 选择模型

各提供商的获取方式：

| 我想用 | 去哪里获取 API Key | 填什么模型 |
|--------|-------------------|------------|
| Claude | https://console.anthropic.com | `claude-sonnet-4-6` |
| DeepSeek | https://platform.deepseek.com | `deepseek-chat` |
| OpenAI | https://platform.openai.com | `gpt-5.2` |
| 通义千问 | 阿里云百炼平台 | `qwen3.5-max` |
| Kimi | https://platform.moonshot.cn | `kimi-k2.5` |
| GLM（智谱） | https://open.bigmodel.cn | `glm-5-plus` |
| Ollama（本地，免费） | https://ollama.com | `qwen2.5:32b` |

> 💡 **想完全免费？** 安装 [Ollama](https://ollama.com)，下载一个模型（比如 `ollama pull qwen2.5:32b`），选择 Ollama 提供商即可。全程不需要网络，数据不出本机。

### 第六步：开始审校

1. 在 Word / WPS 中打开你要审查的文档
2. 在侧边栏选择审查深度（快速 / 标准 / 深度）
3. 点击「开始审校」
4. 等待 AI 分析完成，审校结果会逐条显示在侧边栏中

对于每条审校结果，你可以：

- 📍 **定位** -- 跳转到文档中对应的位置
- 💭 **批注** -- 将问题作为批注插入文档
- ✅ **采纳** -- 直接用 AI 的建议替换原文
- ⏭️ **忽略** -- 跳过这条建议

---

## ❓ 常见问题

### 面板打开后是白屏？

这是因为本地安全证书还没被信任。解决方法：

1. 确保启动窗口还在运行
2. 打开浏览器（Chrome / Edge 都行），访问 https://localhost:3000
3. 浏览器会提示「不安全」，点击「高级」→「继续访问」
4. 回到 Word / WPS，关闭面板重新打开即可

### WPS 加载不出来？

- 关闭 WPS，重新双击启动脚本试试
- 如果还不行，检查电脑上 3889 端口是否被其他程序占用

### 必须联网吗？

看你用哪个 AI：

- 用 **Ollama**（本地模型）→ **不需要联网**，完全离线可用
- 用 **Claude / OpenAI / DeepSeek** 等云端模型 → 需要联网调用 AI 接口

无论哪种方式，你的文档内容都不会被上传到任何地方（除了发给你选择的 AI 模型进行分析）。

### Windows 安装包

如果你不想每次都通过启动脚本运行，可以使用预编译的 Windows 安装包（`ContractReviewAssistant_Setup_v3.0.0.exe`），安装后可直接使用。macOS 暂不支持安装包，请使用启动脚本。

---

## 📄 进阶：要素式文书生成

除了审查已有文稿，助手还能帮你生成新的法律文书：

1. 在 Word / WPS 中打开一份包含案情信息的文档（比如案件材料、会议记录等）
2. 在侧边栏找到「文书生成」功能
3. 选择要生成的文书类型（如民事起诉状）
4. AI 会自动从文档中提取当事人、事实、请求等要素
5. 套用官方模板生成标准格式的 `.docx` 文件并自动打开

---

## 🛠️ 给开发者

如果你想参与开发或自行修改，以下是技术细节。

### 技术栈

- **前端**（`packages/addin`）：React 18 + TypeScript + Tailwind CSS + Zustand，通过平台适配层同时支持 Word Office.js 和 WPS JSAPI
- **后端**（`packages/server`）：Node.js + Express + TypeScript，对接 Anthropic / OpenAI / Ollama，支持 MCP 协议扩展
- **桌面打包**（`packages/desktop`）：@yao-pkg/pkg 打包为独立 .exe，NSIS 生成安装器

### 项目结构

```
contract-review-assistant/
├── manifest.xml                  # Office Add-in 清单
├── 启动.bat / 启动.command        # 一键启动脚本
├── .env.example                  # 环境变量模板
├── packages/
│   ├── addin/                    # 前端 — Word/WPS 审校面板
│   │   ├── src/platform/         #   平台适配层（Word / WPS 双端）
│   │   ├── src/taskpane/         #   UI 组件
│   │   └── src/store/            #   状态管理
│   ├── server/                   # 后端 — AI 调用与文书生成
│   │   ├── src/routes/           #   API 路由
│   │   ├── src/services/ai/      #   AI 提供商适配
│   │   ├── src/services/litigation/  # 文书生成逻辑
│   │   └── assets/templates/     #   诉讼文书模板
│   └── desktop/                  # 桌面打包脚本
└── .github/workflows/ci.yml     # CI 流水线
```

### 开发命令

```bash
npm install               # 安装依赖
npm run dev               # 启动开发服务器（前端 :3000 + 后端 :3001，支持热重载）
npm run build             # 构建生产版本
npm run build:desktop     # 打包 Windows 安装器
npm run typecheck         # TypeScript 类型检查
npm run lint              # 代码风格检查
```

### 环境变量

复制 `.env.example` 为 `.env`，按需修改：

```env
PORT=3001                 # 后端端口
ADDIN_PORT=3000           # 前端端口
ANTHROPIC_API_KEY=        # Anthropic API Key
OPENAI_API_KEY=           # OpenAI API Key
OPENAI_BASE_URL=https://api.openai.com/v1
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_PROVIDER=claude   # 默认 AI 提供商
MAX_INPUT_TOKENS=100000   # 最大输入 Token 数
```

### 模板维护

诉讼文书模板在 `packages/server/assets/templates/`，新增或修改模板后需同步更新 `catalog.json`、对应 `manifests/*.json` 和测试。

---

## 🙏 致谢

作者：[sublatesublate-design](https://github.com/sublatesublate-design)

AI 辅助开发：Claude (Anthropic) · Gemini (Google DeepMind) · Codex (OpenAI)
