Set WshShell = CreateObject("WScript.Shell")
nodePath = "C:\Users\Cloud\AppData\Local\Temp\node20\node-v20.11.1-win-x64\node.exe"
backendDir = "C:\Users\Cloud\Desktop\تطبيق حسابات\backend"
WshShell.CurrentDirectory = backendDir
WshShell.Run nodePath & " dist/app.js", 0, False
