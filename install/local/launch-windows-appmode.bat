@echo off
:: gsworkspace - App Mode Launcher
:: Launches the PowerShell script that starts servers hidden
:: and opens Chrome in app mode.
start /b powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launch-windows-appmode.ps1"
exit
