$certDir = Join-Path $env:APPDATA 'ContractReviewAssistant\certs'
$certPath = Join-Path $certDir 'localhost.crt'

if (Test-Path $certPath) {
    try {
        $certObj = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
        $store.Open('ReadWrite')
        $store.Remove($certObj)
        $store.Close()
        Write-Host 'Removed trusted certificate.'
    } catch {
        Write-Host "Failed to remove trusted certificate: $($_.Exception.Message)"
    }
}

if (Test-Path $certDir) {
    Remove-Item -Path $certDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed local certificate files.'
}
