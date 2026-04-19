@echo off
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Contract Review Assistant

echo.
echo   ======================================
echo     Contract Review Assistant Launcher
echo   ======================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js was not found.
    echo   Install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo   [OK] Node.js %NODE_VER%

echo.
echo   [INFO] Checking npm dependencies...
call npm install
if errorlevel 1 (
    echo   [ERROR] npm install failed.
    echo   Check your network or npm registry settings.
    echo.
    pause
    exit /b 1
)
echo   [OK] Dependencies are ready.

echo.
echo   [INFO] Building local runtime assets...
call npm run prepare:local-server
if errorlevel 1 (
    echo   [ERROR] Failed to prepare local runtime assets.
    echo.
    pause
    exit /b 1
)
echo   [OK] Local runtime assets prepared.

echo.
echo   ======================================
echo   Select the host application:
echo.
echo   [W] Microsoft Word (default)
echo   [P] WPS Office
echo   ======================================
echo.
set "CHOICE="
set /p "CHOICE=Enter W or P, then press Enter: "

if not defined CHOICE set "CHOICE=W"
if /i "%CHOICE%"=="P" goto START_WPS
goto START_WORD

:ENSURE_CERT
if exist "%USERPROFILE%\.office-addin-dev-certs\localhost.crt" goto :eof
echo   [INFO] Installing HTTPS dev certificate...
call npx office-addin-dev-certs install
if errorlevel 1 (
    echo   [ERROR] Failed to install the HTTPS dev certificate.
    echo.
    pause
    exit /b 1
)
echo   [OK] HTTPS dev certificate installed.
goto :eof

:START_WORD
echo.
echo   [MODE] Microsoft Word
echo.
call :ENSURE_CERT

echo   [INFO] Registering the Word add-in...
call npx office-addin-dev-settings sideload manifest.xml 2>nul
if errorlevel 1 (
    powershell -ExecutionPolicy Bypass -Command "$p='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'; New-Item -Path $p -Force | Out-Null; $m=(Get-Location).Path + '\manifest.xml'; Set-ItemProperty -Path $p -Name $m -Value $m"
    if errorlevel 1 (
        echo   [ERROR] Failed to register the Word add-in.
        echo.
        pause
        exit /b 1
    )
)
echo   [OK] Word add-in registered.
goto START_SERVER

:START_WPS
echo.
echo   [MODE] WPS Office
echo.
call :ENSURE_CERT

echo   [INFO] Registering the WPS add-in...
pushd "%~dp0packages\addin\wps-addin"
call node wps-register.mjs
set "WPS_REGISTER_EXIT=%errorlevel%"
popd
if not "%WPS_REGISTER_EXIT%"=="0" (
    echo   [ERROR] Failed to register the WPS add-in.
    echo.
    pause
    exit /b 1
)
echo   [OK] WPS add-in registered.

:START_SERVER
echo.
echo   ========================================
echo   Keep this window open while the local service is running.
if /i "%CHOICE%"=="P" (
    echo   If the WPS tab does not appear the first time,
    echo   fully exit WPS and open it again.
    echo   Open WPS ^> Smart Review ^> Open task pane
    echo   If local DOCX open fails, it will auto-download.
) else (
    echo   Open Word ^> Home ^> Open task pane
)
echo   Supports element pleading generation.
echo   Fill in your API key in Settings on first use.
echo   Service URL: https://localhost:3000
echo   ========================================
echo.
call node packages\server\dist\index.js --desktop-server
if errorlevel 1 (
    echo   [ERROR] The local desktop server exited unexpectedly.
)
pause
exit /b 0
