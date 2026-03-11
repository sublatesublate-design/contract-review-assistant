$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $PSScriptRoot
$exeCandidates = @(
    (Join-Path $appDir 'ContractReviewAssistant.exe'),
    (Join-Path $appDir 'out\ContractReviewAssistant.exe')
)
$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$stateDir = Join-Path $env:APPDATA 'ContractReviewAssistant'
$logDir = Join-Path $stateDir 'logs'
$logPath = Join-Path $logDir 'launcher.log'
$lockPath = Join-Path $stateDir 'desktop-launcher.lock'
$legacyLockPath = Join-Path $stateDir 'desktop-manager.lock'
$healthUrl = 'https://localhost:3000/health'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
    param([string]$Message)

    $timestamp = Get-Date -Format o
    Add-Content -Path $logPath -Value "[$timestamp] [pid:$PID] $Message"
}

function Test-ProcessAlive {
    param([int]$ProcessId)

    try {
        Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-ServerHealthy {
    $previousCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
    try {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    } finally {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCallback
    }
}

function Acquire-Lock {
    if (Test-Path $legacyLockPath) {
        Remove-Item $legacyLockPath -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $lockPath) {
        try {
            $existingPid = [int](Get-Content $lockPath -ErrorAction Stop | Select-Object -First 1)
            if ($existingPid -gt 0 -and (Test-ProcessAlive -ProcessId $existingPid)) {
                Write-Log "Launcher already running under pid $existingPid"
                return $false
            }
        } catch {
            Write-Log 'Removing stale launcher lock'
        }

        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    }

    Set-Content -Path $lockPath -Value $PID -NoNewline
    return $true
}

if (-not $exePath) {
    Write-Log "Desktop executable not found in: $($exeCandidates -join ', ')"
    exit 1
}

if (-not (Acquire-Lock)) {
    exit 0
}

Write-Log 'Desktop launcher started'

while ($true) {
    if (Test-ServerHealthy) {
        Start-Sleep -Seconds 10
        continue
    }

    Write-Log 'Starting desktop server process'
    $process = Start-Process -FilePath $exePath -ArgumentList '--desktop-server' -PassThru -WindowStyle Hidden
    Wait-Process -Id $process.Id

    try {
        $process.Refresh()
        Write-Log "Desktop server exited with code $($process.ExitCode)"
    } catch {
        Write-Log 'Desktop server exited'
    }

    Start-Sleep -Seconds 3
}
