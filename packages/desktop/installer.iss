#define MyAppName "合同审查助手"
#define MyAppNameEn "ContractReviewAssistant"
#define MyAppVersion "2.1.0"
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
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ShowLanguageDialog=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加操作:"; Flags: checked
Name: "autostart"; Description: "开机自动启动（推荐）"; GroupDescription: "附加操作:"; Flags: checked

[Files]
Source: "out\ContractReviewAssistant.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\manifest.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\install-cert.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall-cert.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\register-addin.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\register-wps-addin.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\unregister-addins.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppNameEn}"; ValueData: """{app}\{#MyAppExeName}"" --desktop"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-cert.ps1"""; StatusMsg: "正在安装 HTTPS 证书..."; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-addin.ps1"""; StatusMsg: "正在注册 Word 插件..."; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-wps-addin.ps1"""; StatusMsg: "正在注册 WPS 插件..."; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Parameters: "--desktop"; Description: "立即启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\unregister-addins.ps1"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-cert.ps1"""; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\{#MyAppNameEn}"
