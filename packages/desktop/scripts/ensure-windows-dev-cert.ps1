param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$managedCertDir = Join-Path $env:APPDATA "ContractReviewAssistant\certs"
$devCertDir = Join-Path $env:USERPROFILE ".office-addin-dev-certs"

$managedCertPath = Join-Path $managedCertDir "localhost.crt"
$managedKeyPath = Join-Path $managedCertDir "localhost.key"
$devCertPath = Join-Path $devCertDir "localhost.crt"
$devKeyPath = Join-Path $devCertDir "localhost.key"

function Get-CertState {
    param(
        [string]$Label,
        [string]$CertPath,
        [string]$KeyPath
    )

    if (-not (Test-Path $CertPath) -or -not (Test-Path $KeyPath)) {
        return [PSCustomObject]@{
            Label = $Label
            State = "missing"
            Cert = $null
            Reason = "certificate or key file is missing"
        }
    }

    try {
        $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
        $now = Get-Date

        if ($now -lt $cert.NotBefore) {
            return [PSCustomObject]@{
                Label = $Label
                State = "invalid"
                Cert = $cert
                Reason = "certificate is not valid yet"
            }
        }

        if ($now -ge $cert.NotAfter) {
            return [PSCustomObject]@{
                Label = $Label
                State = "invalid"
                Cert = $cert
                Reason = "certificate has expired"
            }
        }

        if ($cert.NotAfter -lt $now.AddDays(7)) {
            return [PSCustomObject]@{
                Label = $Label
                State = "invalid"
                Cert = $cert
                Reason = "certificate expires within 7 days"
            }
        }

        return [PSCustomObject]@{
            Label = $Label
            State = "valid"
            Cert = $cert
            Reason = "certificate date is valid"
        }
    }
    catch {
        return [PSCustomObject]@{
            Label = $Label
            State = "invalid"
            Cert = $null
            Reason = "certificate file cannot be read: $($_.Exception.Message)"
        }
    }
}

function Write-CertState {
    param($State)

    if ($null -eq $State.Cert) {
        Write-Host "  [CERT] $($State.Label): $($State.State) - $($State.Reason)"
        return
    }

    Write-Host "  [CERT] $($State.Label): $($State.State) - $($State.Reason)"
    Write-Host "         valid from $($State.Cert.NotBefore) to $($State.Cert.NotAfter)"
}

function Remove-CertFromCurrentUserRoot {
    param([string]$CertPath)

    if (-not (Test-Path $CertPath)) {
        return
    }

    try {
        $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
        $store = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "CurrentUser")
        $store.Open("ReadWrite")
        $store.Remove($cert)
        $store.Close()
    }
    catch {
        Write-Host "  [WARN] Could not remove old root certificate: $($_.Exception.Message)"
    }
}

function Test-OfficeDevCertTrust {
    Push-Location $projectRoot
    try {
        & npx office-addin-dev-certs verify *> $null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Install-OfficeDevCert {
    Push-Location $projectRoot
    try {
        Write-Host "  [INFO] Reinstalling trusted localhost HTTPS certificate..."
        & npx office-addin-dev-certs uninstall
        if (Test-Path $devCertDir) {
            Remove-Item -LiteralPath $devCertDir -Recurse -Force -ErrorAction SilentlyContinue
        }

        & npx office-addin-dev-certs install --days 3650
        if ($LASTEXITCODE -ne 0) {
            throw "office-addin-dev-certs install failed with exit code $LASTEXITCODE"
        }

        if (-not (Test-OfficeDevCertTrust)) {
            throw "office-addin-dev-certs verify failed after install"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "  [INFO] Checking HTTPS certificates for WPS localhost add-in..."

$managedState = Get-CertState "managed desktop cert" $managedCertPath $managedKeyPath
$devState = Get-CertState "Office add-in dev cert" $devCertPath $devKeyPath

Write-CertState $managedState
Write-CertState $devState

if ($managedState.State -eq "invalid") {
    Write-Host "  [INFO] Removing invalid managed desktop certificate so the server will use the Office dev certificate."
    Remove-CertFromCurrentUserRoot $managedCertPath
    if (Test-Path $managedCertDir) {
        Remove-Item -LiteralPath $managedCertDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$trustOk = Test-OfficeDevCertTrust
if (-not $trustOk) {
    Write-Host "  [CERT] Office add-in dev CA is not trusted yet."
}

if ($Force -or $devState.State -ne "valid" -or -not $trustOk) {
    Install-OfficeDevCert
    $devState = Get-CertState "Office add-in dev cert" $devCertPath $devKeyPath
    Write-CertState $devState
}

if ($devState.State -ne "valid") {
    throw "No valid Office add-in dev certificate is available."
}

Write-Host "  [OK] HTTPS certificate is ready for https://localhost:3000"
