' Gsworkspace Server - hidden launcher
'
' Double-click this file to start the Gsworkspace servers in the background.
' It runs `dotnet run` on the file-based C# tray app with NO visible window.
' The app then shows a system-tray icon; everything is controlled from there.
'
' Requires the .NET 10 SDK (https://dotnet.microsoft.com/download) and Node.js.

Option Explicit

Dim fso, shell, scriptDir, csFile, projectRoot, bootstrapLog, cmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
csFile = fso.BuildPath(scriptDir, "GsworkspaceServer.cs")
projectRoot = fso.GetAbsolutePathName(fso.BuildPath(scriptDir, "..\.."))
bootstrapLog = fso.BuildPath(projectRoot, "win_server.bootstrap.log")

' Run from the script folder so `dotnet run` finds the file-based app.
shell.CurrentDirectory = scriptDir

' Wrap in cmd /c so we can capture dotnet's build/run output for diagnosing
' startup failures. Window style 0 = hidden, False = don't wait for it to exit.
cmd = "cmd /c dotnet run """ & csFile & """ -- """ & projectRoot & """ >> """ & bootstrapLog & """ 2>&1"

shell.Run cmd, 0, False
