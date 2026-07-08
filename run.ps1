$env:Path = "$env:TEMP\node\node-v20.11.1-win-x64;" + $env:Path
$nodeExe = "$env:TEMP\node\node-v20.11.1-win-x64\node.exe"

# Backend
$backendDir = "C:\Users\Cloud\Desktop\B78B~1\backend"
$logB = "$env:TEMP\backend.log"
Start-Process -NoNewWindow -FilePath $nodeExe -ArgumentList "$backendDir\dist\app.js" -WorkingDirectory $backendDir -RedirectStandardOutput $logB -RedirectStandardError $logB

# Frontend
$frontendDir = "C:\Users\Cloud\Desktop\B78B~1\frontend"
$logF = "$env:TEMP\frontend.log"
Start-Process -NoNewWindow -FilePath cmd.exe -ArgumentList "/c cd `"$frontendDir`" && npx vite --host 0.0.0.0" -RedirectStandardOutput $logF -RedirectStandardError $logF

Write-Output "Servers starting..."

# Wait for backend
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 2
        Write-Output "Backend started!"
        break
    } catch { }
}

# Wait for frontend
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest "http://localhost:5173" -UseBasicParsing -TimeoutSec 2
        Write-Output "Frontend started!"
        break
    } catch { }
}

Write-Output "==========================================="
Write-Output "  النظام المحاسبي المتكامل"
Write-Output "  Backend: http://localhost:3000"
Write-Output "  Frontend: http://localhost:5173"
Write-Output "  Login: admin / admin123"
Write-Output "==========================================="

# Keep running
while ($true) {
    Start-Sleep -Seconds 60
    # Check if processes are alive
    $b = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID }
    if (-not $b) {
        Write-Output "WARNING: No node processes running"
    }
}
