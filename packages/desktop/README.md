# 合同审查助手 — 桌面端打包

## 环境准备

1. **Node.js** ≥ 18
2. **pnpm** ≥ 8
3. **Inno Setup** — [下载](https://jrsoftware.org/isdl.php)（仅构建安装器需要）

## 构建 EXE

```bash
cd packages/desktop
pnpm install
node scripts/build.mjs
```

构建完成后，`out/ContractReviewAssistant.exe` 即为独立可执行文件。

## 构建安装器

1. 先完成上述 EXE 构建
2. 用 Inno Setup Compiler 打开 `installer.iss`
3. 点击"编译"
4. 输出文件在 `out/合同审查助手_Setup_v1.0.exe`

## 目录结构

```
packages/desktop/
├── package.json           # 打包依赖
├── installer.iss          # Inno Setup 安装器脚本
├── scripts/
│   ├── build.mjs          # 自动化构建（前端+后端+pkg）
│   ├── generate-cert.mjs  # SSL 证书生成（node-forge）
│   ├── install-cert.ps1   # 安装时：生成+信任证书
│   ├── register-addin.ps1 # 安装时：注册 Word 插件
│   └── uninstall-cert.ps1 # 卸载时：清理证书
└── out/                   # 构建产物
    └── ContractReviewAssistant.exe
```

## 开发模式

桌面打包不影响开发模式。继续使用 `pnpm dev` 正常开发。
