param(
  [string]$certPath = (Join-Path $PSScriptRoot "certs\cert.pem"),
  [string]$keyPath = (Join-Path $PSScriptRoot "certs\key.pem")
)

$certDir = Split-Path $certPath -Parent
if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

Write-Host "Generating self-signed SSL certificate using PowerShell..." -ForegroundColor Cyan

try {
  $cert = New-SelfSignedCertificate `
    -DnsName "localhost" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -NotAfter (Get-Date).AddYears(10) `
    -FriendlyName "Accounting System Dev Cert" `
    -TextExtension @("2.5.29.19={text}CA=TRUE", "2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1")

  $certThumbprint = $cert.Thumbprint

  $certPem = @()
  $certPem += "-----BEGIN CERTIFICATE-----"
  $certBytes = $cert.RawData
  $b64 = [Convert]::ToBase64String($certBytes)
  for ($i = 0; $i -lt $b64.Length; $i += 64) {
    $certPem += $b64.Substring($i, [Math]::Min(64, $b64.Length - $i))
  }
  $certPem += "-----END CERTIFICATE-----"
  [System.IO.File]::WriteAllLines($certPath, $certPem, [System.Text.UTF8Encoding]::new($false))

  $rsaKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  $keyBytes = $rsaKey.ExportPkcs8PrivateKey()
  $keyPem = @()
  $keyPem += "-----BEGIN PRIVATE KEY-----"
  $keyB64 = [Convert]::ToBase64String($keyBytes)
  for ($i = 0; $i -lt $keyB64.Length; $i += 64) {
    $keyPem += $keyB64.Substring($i, [Math]::Min(64, $keyB64.Length - $i))
  }
  $keyPem += "-----END PRIVATE KEY-----"
  [System.IO.File]::WriteAllLines($keyPath, $keyPem, [System.Text.UTF8Encoding]::new($false))

  Remove-Item "Cert:\CurrentUser\My\$certThumbprint" -Force

  Write-Host "SSL certificate generated successfully!" -ForegroundColor Green
  Write-Host "  Certificate: $certPath" -ForegroundColor Green
  Write-Host "  Private Key: $keyPath" -ForegroundColor Green
  Write-Host ""
  Write-Host "The server will automatically use these files when present." -ForegroundColor Yellow
} catch {
  Write-Host "Failed to generate certificate: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Falling back to Node.js built-in certificate generation..." -ForegroundColor Yellow
  Write-Host "Run 'npm run dev' or 'npm start' and the server will generate a self-signed cert automatically." -ForegroundColor Yellow
  exit 1
}
