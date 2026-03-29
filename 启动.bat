@echo off
chcp 65001 >nul 2>&1
if "%~1"=="--internal-run" goto :INTERNAL_START
cmd /k ""%~f0" --internal-run"
exit /b

:INTERNAL_START
cd /d "%~dp0"
title 合同审查助手

echo.
echo   ======================================
echo          合同审查助手 - 启动中...
echo   ======================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
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

:: 同步依赖
echo.
echo   [提示] 正在检查依赖更新（首次约需 1-3 分钟，后续几秒内完成）...
call npm install
if errorlevel 1 (
    echo   [错误] 依赖安装失败，请检查网络（或切换 npm 镜像）。
    pause
    exit /b 1
)
echo   [OK] 依赖已是最新

:: 询问目标软件
echo.
echo   ======================================
echo   请选择您要使用的文字处理软件：
echo.
echo   [W]  Microsoft Word（默认）
echo   [P]  WPS Office
echo   ======================================
echo.
set CHOICE=
set /p CHOICE=  请输入 W 或 P 后按回车（直接回车默认 Word）：

if "%CHOICE%"=="" set CHOICE=W
if /i "%CHOICE%"=="P" goto :START_WPS

:: ====== Word 模式 ======
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
if errorlevel 1 (
    powershell -ExecutionPolicy Bypass -Command "$p='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'; New-Item -Path $p -Force | Out-Null; $m=(Get-Location).Path + '\manifest.xml'; Set-ItemProperty -Path $p -Name $m -Value $m"
)
echo   [OK] 插件已注册

echo.
echo   ========================================
echo     启动成功！请勿关闭此窗口。
echo.
echo     打开 Word -^> 开始 -^> 打开审校面板
echo     支持要素式文书生成
echo     首次使用请在设置中填入 API Key
echo   ========================================
echo.
call npm run dev
if errorlevel 1 (
    echo [系统提示] npm run dev 进程意外退出，请查看上方错误信息。
)
pause
exit /b 0

:: ====== WPS 模式 ======
:START_WPS
echo.
echo   [模式] WPS Office
echo.

:: 注册 WPS 插件（端口 3889）
echo   [提示] 正在注册 WPS 插件服务（端口 3889）...
start "WPS-Plugin" /min cmd /c "chcp 65001 >nul 2>&1 && cd /d "%~dp0packages\addin\wps-addin" && node wps-register.mjs"
timeout /t 3 >nul
echo   [OK] WPS 插件服务已启动

echo.
echo   ========================================
echo     启动成功！请勿关闭任何窗口。
echo.
echo     如果 WPS 首次使用未见「智能审校」选项卡：
echo     -^> 完全退出 WPS 后重新打开即可
echo.
echo     打开 WPS -^> 智能审校 -^> 打开审校面板
echo     支持要素式文书生成；本地直接打开失败时会自动下载 docx
echo     首次使用请在设置中填入 API Key
echo   ========================================
echo.
call npm run dev
if errorlevel 1 (
    echo [系统提示] npm run dev 进程意外退出，请查看上方错误信息。
)
pause
exit /b 0
