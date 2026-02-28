@echo off
title 合同审查助手

echo.
echo   ╔══════════════════════════════════════╗
echo   ║       合同审查助手 - 启动中...       ║
echo   ╚══════════════════════════════════════╝
echo.

:: ─── 检测 Node.js ─────────────────────────────────────────────
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

:: ─── 检测 pnpm ────────────────────────────────────────────────
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

:: ─── 安装依赖 ────────────────────────────────────────────────
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

:: ─── 询问目标软件 ────────────────────────────────────────────
echo.
echo   ┌──────────────────────────────────────┐
echo   │   请选择您要使用的文字处理软件：     │
echo   │                                      │
echo   │   [W]  Microsoft Word（默认）        │
echo   │   [P]  WPS Office                    │
echo   │                                      │
echo   └──────────────────────────────────────┘
echo.
set /p CHOICE=  请输入 W 或 P 后按回车（直接回车默认 Word）：

:: 转为大写并去除空格
set CHOICE=%CHOICE: =%
if /i "%CHOICE%"=="P" goto :START_WPS

:: ─── Word 模式 ───────────────────────────────────────────────
:START_WORD
echo.
echo   [模式] Microsoft Word
echo.
if not exist "%USERPROFILE%\.office-addin-dev-certs\localhost.crt" (
    echo   [提示] 正在安装 HTTPS 开发证书...
    call npx office-addin-dev-certs install
    echo   [OK] 证书已安装
)

echo   [提示] 正在注册 Word 插件...
call npx office-addin-dev-settings sideload manifest.xml 2>nul
if %ERRORLEVEL% NEQ 0 (
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
goto :EOF

:: ─── WPS 模式 ────────────────────────────────────────────────
:START_WPS
echo.
echo   [模式] WPS Office
echo.

:: 安装 wpsjs 工具（若未安装）
where wpsjs >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [提示] 首次使用 WPS 模式，正在安装 wpsjs 工具（约 30 秒）...
    call npm install -g wpsjs
    if %ERRORLEVEL% NEQ 0 (
        echo   [错误] wpsjs 安装失败，请检查网络后重试
        pause
        exit /b 1
    )
    echo   [OK] wpsjs 安装完成
)

:: 在后台启动 wpsjs debug（注册 WPS 插件服务，端口 3889）
echo   [提示] 正在启动 WPS 插件服务（端口 3889）...
start "WPS插件服务" /min cmd /c "cd /d "%~dp0packages\addin\wps-addin" && wpsjs debug --nolaunch"
timeout /t 2 >nul
echo   [OK] WPS 插件服务已启动

echo.
echo   ========================================
echo     启动成功！请勿关闭任何窗口。
echo.
echo     如果 WPS 首次使用未见「智能审查」选项卡：
echo     → 完全退出 WPS 再重新打开即可
echo.
echo     打开 WPS → 智能审查 → 打开审查面板
echo     首次使用请在设置中填入 API Key
echo   ========================================
echo.
call pnpm dev
