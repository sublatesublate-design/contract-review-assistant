@echo off
chcp 65001 >nul 2>&1
title 合同审查助手

echo.
echo   ╔══════════════════════════════════════╗
echo   ║       合同审查助手 - 启动中...       ║
echo   ╚══════════════════════════════════════╝
echo.

:: 检测 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [错误] 未检测到 Node.js
    echo.
    echo   请先安装 Node.js：
    echo   下载地址: https://nodejs.org/
    echo   安装时一路点"下一步"即可
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo   [OK] Node.js %NODE_VER%

:: 检测 pnpm
where pnpm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [提示] 正在安装 pnpm 包管理器...
    call npm install -g pnpm
    if %ERRORLEVEL% NEQ 0 (
        echo   [错误] pnpm 安装失败
        pause
        exit /b 1
    )
)
echo   [OK] pnpm 已就绪

:: 安装依赖
if not exist "node_modules" (
    echo.
    echo   [提示] 首次运行，正在安装依赖（约 1-3 分钟）...
    call pnpm install
    if %ERRORLEVEL% NEQ 0 (
        echo   [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo   [OK] 依赖安装完成
)

:: 安装 HTTPS 开发证书（首次需要）
if not exist "%USERPROFILE%\.office-addin-dev-certs\localhost.crt" (
    echo.
    echo   [提示] 正在安装 HTTPS 开发证书...
    call npx office-addin-dev-certs install
    echo   [OK] 证书已安装
)

:: 注册 manifest 到 Word（使用 office-addin-dev-settings）
echo.
echo   [提示] 正在注册 Word 插件...
call npx office-addin-dev-settings sideload manifest.xml 2>nul
if %ERRORLEVEL% NEQ 0 (
    :: 备选方案：直接写注册表
    powershell -ExecutionPolicy Bypass -Command ^
        "$p='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'; " ^
        "New-Item -Path $p -Force | Out-Null; " ^
        "$m=(Get-Location).Path + '\manifest.xml'; " ^
        "Set-ItemProperty -Path $p -Name $m -Value $m"
)
echo   [OK] 插件已注册

echo.
echo   ========================================
echo     启动成功！请勿关闭此窗口。
echo.
echo     打开 Word → 首页 → 打开审查面板
echo     首次使用请在设置中填入 API Key
echo   ========================================
echo.

call pnpm dev
