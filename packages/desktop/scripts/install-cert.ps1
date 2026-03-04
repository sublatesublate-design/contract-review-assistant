# install-cert.ps1
# 在安装时生成自签名 SSL 证书并添加到 Windows 受信任根证书颁发机构

$appData = $env:APPDATA
$certDir = Join-Path $appData "ContractReviewAssistant\certs"

# 创建证书目录
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

$certPath = Join-Path $certDir "localhost.crt"
$keyPath = Join-Path $certDir "localhost.key"

# 如果证书已存在，跳过生成
if ((Test-Path $certPath) -and (Test-Path $keyPath)) {
    Write-Host "证书已存在，跳过生成"
}
else {
    Write-Host "正在生成自签名 SSL 证书..."
    
    # 使用 PowerShell 内置的 New-SelfSignedCertificate 生成证书
    $cert = New-SelfSignedCertificate `
        -Subject "CN=localhost" `
        -DnsName "localhost" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(10) `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -FriendlyName "Contract Review Assistant HTTPS"
    
    # 导出 .cer 文件（公钥）
    Export-Certificate -Cert $cert -FilePath $certPath -Force | Out-Null
    
    # 导出 .pfx 文件（包含私钥），供 Node.js 使用
    $pfxPath = Join-Path $certDir "localhost.pfx"
    $password = ConvertTo-SecureString -String "contract-review" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password -Force | Out-Null
    
    # 将 PFX 转换为 PEM 格式（key + cert）供 Node.js https 模块使用
    # 使用 certutil 导出
    $pemCertPath = Join-Path $certDir "localhost.pem"
    certutil -encode $certPath $pemCertPath 2>$null
    
    # 复制 PEM 为 .crt（Node.js 可以直接读取 DER 或 PEM）
    # 实际上 Node.js 需要 PEM 格式，我们在 index.ts 中已经改为从 APPDATA 读取
    
    Write-Host "证书生成完毕: $certDir"
}

# 将证书添加到受信任根证书颁发机构
Write-Host "正在安装证书到受信任根证书颁发机构..."
$certObj = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($certObj)
$store.Close()

Write-Host "证书安装完成"
