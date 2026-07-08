$env:Path = "$env:TEMP\node\node-v20.11.1-win-x64;" + [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$frontendDir = "C:\Users\Cloud\Desktop\B78B~1\frontend"
$logFile = "$env:TEMP\frontend.log"

"Starting frontend at $(Get-Date)" | Out-File -FilePath $logFile -Encoding utf8
Set-Location $frontendDir
npx.cmd vite --host 0.0.0.0 *>> $logFile
