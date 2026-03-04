# register-addin.ps1
# 注册 Word Add-in manifest 到 Office 共享文件夹目录

$installDir = Split-Path -Parent $PSScriptRoot  # 回到安装目录（{app}）
$manifestPath = Join-Path $installDir "manifest.xml"

# 使用 UNC 路径格式（Office 要求）
$uncPath = "\\localhost\c$" + $installDir.Substring(2).Replace("/", "\")

# 生成唯一 Catalog ID
$catalogId = [guid]::NewGuid().ToString()
$registryPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$catalogId"

# 写入注册表
New-Item -Path $registryPath -Force | Out-Null
Set-ItemProperty -Path $registryPath -Name "Id" -Value $catalogId
Set-ItemProperty -Path $registryPath -Name "Url" -Value $uncPath
Set-ItemProperty -Path $registryPath -Name "Flags" -Value 1

# 清理旧的开发者缓存
Remove-Item "HKCU:\Software\Microsoft\Office\16.0\WEF\Developer" -Recurse -Force -ErrorAction SilentlyContinue

# 清理 WEF 缓存
Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Word Add-in 注册完成"
Write-Host "Catalog ID: $catalogId"
Write-Host "Manifest 路径: $uncPath"
