Set WshShell = CreateObject("WScript.Shell")
nodeExe = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\..\..\..\..\..\AppData\Local\Temp\node\node-v20.11.1-win-x64\node.exe"
backendDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\backend"
envString = "Path=" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\..\..\..\..\..\AppData\Local\Temp\node\node-v20.11.1-win-x64;" & WshShell.ExpandEnvironmentStrings("%Path%")
WshShell.CurrentDirectory = backendDir
WshShell.Run nodeExe & " " & backendDir & "\dist\app.js", 0, False
