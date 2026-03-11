#define MyAppName "Contract Review Assistant"
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
OutputBaseFilename=ContractReviewAssistant_Setup_v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ShowLanguageDialog=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional tasks:"
Name: "autostart"; Description: "Start automatically when Windows starts (recommended)"; GroupDescription: "Additional tasks:"

[Files]
Source: "out\ContractReviewAssistant.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\manifest.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\install-cert.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\launch-desktop.vbs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall-cert.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\register-addin.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\register-wps-addin.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\run-desktop.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\stop-desktop.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\unregister-addins.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\launch-desktop.vbs"""
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\launch-desktop.vbs"""; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\launch-desktop.vbs"""; Tasks: autostart

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-cert.ps1"""; StatusMsg: "Installing HTTPS certificate..."; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-addin.ps1"""; StatusMsg: "Registering the Word add-in..."; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-wps-addin.ps1"""; StatusMsg: "Registering the WPS add-in..."; Flags: runhidden waituntilterminated
Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\launch-desktop.vbs"""; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\stop-desktop.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopDesktop"
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\unregister-addins.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UnregisterAddins"
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-cert.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallCert"

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\{#MyAppNameEn}"
