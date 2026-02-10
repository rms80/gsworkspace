@echo off
:: gsworkspace - App Mode Launcher (Installed Version)
:: Launches the PowerShell script that starts servers hidden
:: and opens Chrome in app mode.
start /b powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0gsworkspace.ps1"
exit
