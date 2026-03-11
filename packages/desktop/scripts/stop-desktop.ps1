$appDir = Split-Path -Parent $PSScriptRoot
$exeCandidates = @(
    (Join-Path $appDir 'ContractReviewAssistant.exe'),
    (Join-Path $appDir 'out\ContractReviewAssistant.exe')
)
$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stateDir = Join-Path $env:APPDATA 'ContractReviewAssistant'
$lockPath = Join-Path $stateDir 'desktop-launcher.lock'
$legacyLockPath = Join-Path $stateDir 'desktop-manager.lock'

$processes = Get-CimInstance Win32_Process -Filter "Name = 'ContractReviewAssistant.exe'" -ErrorAction SilentlyContinue

if ($exePath) {
    $processes = $processes | Where-Object { $_.ExecutablePath -eq $exePath }
}

foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
Remove-Item $legacyLockPath -Force -ErrorAction SilentlyContinue

Write-Host 'Stopped desktop background processes.'
