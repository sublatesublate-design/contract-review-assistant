Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(scriptDir)
exePath = fso.BuildPath(appDir, "ContractReviewAssistant.exe")
legacyExePath = fso.BuildPath(appDir, "out\ContractReviewAssistant.exe")
scriptPath = fso.BuildPath(scriptDir, "run-desktop.ps1")

If fso.FileExists(exePath) Then
    command = """" & exePath & """ --desktop-server"
ElseIf fso.FileExists(legacyExePath) Then
    command = """" & legacyExePath & """ --desktop-server"
Else
    command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """"
End If

shell.Run command, 0, False
