$env:Path = "$env:TEMP\node\node-v20.11.1-win-x64;" + [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$nodeExe = "$env:TEMP\node\node-v20.11.1-win-x64\node.exe"
$backendDir = "C:\Users\Cloud\Desktop\B78B~1\backend"
$logFile = "$env:TEMP\backend.log"

"Starting backend at $(Get-Date)" | Out-File -FilePath $logFile -Encoding utf8
& $nodeExe "$backendDir/node_modules/ts-node-dev/lib/bin.js" --respawn "$backendDir/src/app.ts" *>> $logFile
