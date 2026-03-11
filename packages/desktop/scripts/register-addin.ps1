$addinId = '5E6F7A8B-9C0D-1E2F-3A4B-5C6D7E8F9A0B'
$installDir = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $installDir 'manifest.xml'
$developerKey = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'
$catalogPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$addinId"

if (-not (Test-Path $manifestPath)) {
    throw "Word manifest not found: $manifestPath"
}

New-Item -Path $developerKey -Force | Out-Null
Remove-Item -Path $catalogPath -Recurse -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $developerKey -Name $addinId -Value $manifestPath
Set-ItemProperty -Path $developerKey -Name 'RefreshAddins' -Value 1 -Type DWord

Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Registered Word add-in manifest: $manifestPath"
