; 合同审查助手 Inno Setup 安装器脚本
; 编译方法：用 Inno Setup Compiler 打开此文件并点击编译
; 下载 Inno Setup: https://jrsoftware.org/isdl.php

#define MyAppName "合同审查助手"
#define MyAppNameEn "ContractReviewAssistant"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Contract Review Assistant"
#define MyAppExeName "ContractReviewAssistant.exe"
#define MyAppId "{{5E6F7A8B-9C0D-1E2F-3A4B-5C6D7E8F9A0B}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppNameEn}
DefaultGroupName={#MyAppName}
OutputDir=out
OutputBaseFilename=合同审查助手_Setup_v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; 需要管理员权限以安装证书和写入注册表
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; 中文界面
ShowLanguageDialog=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加操作:"; Flags: checked
Name: "autostart"; Description: "开机自动启动（推荐）"; GroupDescription: "附加操作:"

[Files]
; 主程序
Source: "out\ContractReviewAssistant.exe"; DestDir: "{app}"; Flags: ignoreversion
; manifest.xml（安装到应用目录，注册表引用此路径）
Source: "..\..\..\manifest.xml"; DestDir: "{app}"; Flags: ignoreversion
; 证书生成脚本（用 Node.js 生成，但我们在安装时用 PowerShell + certutil）
Source: "scripts\generate-cert.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
; node-forge 依赖（打包时需要把 generate-cert 需要的依赖一起带上）
; 注意：实际使用时改为在安装后通过 PowerShell 生成自签名证书

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"; Tasks: desktopicon

[Registry]
; 开机自启动
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppNameEn}"; ValueData: """{app}\{#MyAppExeName}"" --desktop"; Flags: uninsdeletevalue; Tasks: autostart

; Word Add-in 共享文件夹目录注册
; 注意：每次安装生成唯一的 Catalog ID 需要在 [Code] 段处理
Root: HKCU; Subkey: "Software\Microsoft\Office\16.0\WEF\Developer"; ValueType: string; ValueName: ""; ValueData: ""; Flags: uninsdeletekey

[Run]
; 安装后生成证书并信任
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-cert.ps1"""; StatusMsg: "正在安装 HTTPS 证书..."; Flags: runhidden waituntilterminated
; 注册 manifest 到 Word
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-addin.ps1"""; StatusMsg: "正在注册 Word 插件..."; Flags: runhidden waituntilterminated
; 安装完成后启动
Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"; Description: "立即启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; 卸载时清理证书
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-cert.ps1"""; Flags: runhidden waituntilterminated
; 卸载时清理注册表
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""Remove-Item -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path '$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*' -Recurse -Force -ErrorAction SilentlyContinue"""; Flags: runhidden waituntilterminated

[UninstallDelete]
; 清理 AppData 中的配置和证书
Type: filesandordirs; Name: "{userappdata}\{#MyAppNameEn}"

[Code]
// 自定义安装代码：设置环境变量让 exe 以桌面模式运行
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // 设置 DESKTOP_MODE 环境变量（用户级）
    RegWriteStringValue(HKEY_CURRENT_USER,
      'Environment', 'DESKTOP_MODE', '1');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // 卸载时清理环境变量
    RegDeleteValue(HKEY_CURRENT_USER, 'Environment', 'DESKTOP_MODE');
  end;
end;
