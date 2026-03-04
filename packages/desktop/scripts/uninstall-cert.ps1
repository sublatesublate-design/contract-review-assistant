# uninstall-cert.ps1
# 卸载时清理 SSL 证书

$appData = $env:APPDATA
$certDir = Join-Path $appData "ContractReviewAssistant\certs"
$certPath = Join-Path $certDir "localhost.crt"

# 从受信任根证书颁发机构移除证书
if (Test-Path $certPath) {
    try {
        $certObj = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
        $store.Open("ReadWrite")
        $store.Remove($certObj)
        $store.Close()
        Write-Host "已从受信任根证书颁发机构移除证书"
    }
    catch {
        Write-Host "移除证书时出错: $_"
    }
}

# 删除证书文件
if (Test-Path $certDir) {
    Remove-Item -Path $certDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "已删除证书文件"
}

# 清理 WEF 注册表和缓存
Remove-Item "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "卸载清理完成"
