@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace - Background Server Installer
echo ============================================
echo.
echo Installs the headless tray server to %%LocalAppData%%\gsworkspace,
echo builds a standalone GsworkspaceServer.exe, and sets it to start
echo automatically when you log in to Windows.
echo.

:: ---- Configuration ----
set "INSTALL_DIR=%LocalAppData%\gsworkspace"
set "SCRIPT_DIR=%~dp0"
set "SOURCE_ROOT=%SCRIPT_DIR%..\..\"
pushd "%SOURCE_ROOT%"
set "SOURCE_ROOT=%CD%"
popd
set "STARTUP_DIR=%AppData%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_DIR=%AppData%\Microsoft\Windows\Start Menu\Programs"
set "ICON_SRC=%SCRIPT_DIR%..\local\gsworkspace.ico"
set "PUBDIR=%TEMP%\gsws-server-publish"

echo Source:  %SOURCE_ROOT%
echo Target:  %INSTALL_DIR%
echo.

:: ---- Check for Node.js ----
echo Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo   winget install OpenJS.NodeJS.LTS
    echo   or download from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    pause
    exit /b 1
)

:: ---- Check for the .NET 10 SDK (needed to build the exe) ----
echo Checking for the .NET 10 SDK...
where dotnet >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: The .NET SDK is not installed or not in PATH.
    echo   winget install Microsoft.DotNet.SDK.10
    pause
    exit /b 1
)
dotnet --list-sdks | findstr /b /c:"10." >nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: .NET 10 SDK not found ^(only older SDKs are installed^).
    echo   winget install Microsoft.DotNet.SDK.10
    pause
    exit /b 1
)
echo Found .NET 10 SDK.
echo.

:: ---- Confirm ----
echo This will install to %INSTALL_DIR% and enable start-at-login.
set /p "CONFIRM=Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Installation cancelled.
    pause
    exit /b 0
)
echo.

:: ---- If a previous server is running, the exe can't be overwritten ----
tasklist /fi "imagename eq GsworkspaceServer.exe" 2>nul | findstr /i "GsworkspaceServer.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo A previous GsworkspaceServer.exe is running.
    echo Please right-click the tray icon and choose "Exit", then press any key.
    pause >nul
)
echo.

:: ---- Copy the app (merge; preserves existing .env and node_modules) ----
echo ============================================
echo Copying application files...
echo ============================================
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

copy /y "%SOURCE_ROOT%\package.json" "%INSTALL_DIR%\package.json" >nul
copy /y "%SOURCE_ROOT%\package-lock.json" "%INSTALL_DIR%\package-lock.json" >nul
copy /y "%SOURCE_ROOT%\tsconfig.json" "%INSTALL_DIR%\tsconfig.json" >nul

echo Copying backend...
robocopy "%SOURCE_ROOT%\backend" "%INSTALL_DIR%\backend" /E /XD node_modules dist /XF .env >nul
if %ERRORLEVEL% gtr 7 (
    echo ERROR: Failed to copy backend files.
    pause
    exit /b 1
)

echo Copying frontend...
robocopy "%SOURCE_ROOT%\frontend" "%INSTALL_DIR%\frontend" /E /XD node_modules dist /XF .env.local >nul
if %ERRORLEVEL% gtr 7 (
    echo ERROR: Failed to copy frontend files.
    pause
    exit /b 1
)
echo Files copied.
echo.

:: ---- Install npm dependencies ----
echo ============================================
echo Installing npm dependencies (this may take a few minutes)...
echo ============================================
cd /d "%INSTALL_DIR%"
call npm run install:all
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)
echo Dependencies installed.
echo.

:: ---- Create .env files if missing (ports 3030 / 4040) ----
if not exist "%INSTALL_DIR%\backend\.env" (
    (
        echo # Backend Configuration
        echo PORT=4040
        echo.
        echo # Storage mode: 'local' for local disk storage
        echo STORAGE_MODE=local
        echo.
        echo # Local storage path ^(defaults to ~/.gsworkspace if empty^)
        echo LOCAL_STORAGE_PATH=
        echo.
        echo # AI API Keys ^(optional - leave empty to disable AI features^)
        echo GSWS_API_KEY_ANTHROPIC=
        echo GSWS_API_KEY_GEMINI=
    ) > "%INSTALL_DIR%\backend\.env"
    echo Created backend\.env
)
if not exist "%INSTALL_DIR%\frontend\.env.local" (
    (
        echo VITE_OFFLINE_MODE=false
        echo VITE_PROD_FAVICON=true
        echo VITE_PORT=3030
        echo VITE_API_PORT=4040
        echo.
        echo # Remote access ^(e.g. over Tailscale^): expose the frontend beyond
        echo # localhost. The machine's own hostname is allowed automatically;
        echo # list extra hostnames in VITE_ALLOWED_HOSTS ^(comma-separated, or
        echo # "*" for any^). A leading dot matches subdomains - ".ts.net" allows
        echo # any Tailscale MagicDNS name.
        echo VITE_EXPOSE=true
        echo VITE_ALLOWED_HOSTS=.ts.net
    ) > "%INSTALL_DIR%\frontend\.env.local"
    echo Created frontend\.env.local
)
echo.

:: ---- Copy the app icon ----
copy /y "%ICON_SRC%" "%INSTALL_DIR%\gsworkspace.ico" >nul

:: ---- Build the standalone tray exe ----
echo ============================================
echo Building GsworkspaceServer.exe (self-contained)...
echo ============================================
if exist "%PUBDIR%" rmdir /s /q "%PUBDIR%"
dotnet publish "%SCRIPT_DIR%GsworkspaceServer.cs" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "%PUBDIR%"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to build GsworkspaceServer.exe.
    pause
    exit /b 1
)
copy /y "%PUBDIR%\GsworkspaceServer.exe" "%INSTALL_DIR%\GsworkspaceServer.exe" >nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Could not write GsworkspaceServer.exe ^(is it still running?^).
    echo Exit the tray app and re-run this installer.
    pause
    exit /b 1
)
rmdir /s /q "%PUBDIR%"
echo Built %INSTALL_DIR%\GsworkspaceServer.exe
echo.

:: ---- Register autostart (Startup-folder shortcut) ----
echo ============================================
echo Registering start-at-login...
echo ============================================
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%STARTUP_DIR%\gsworkspace-server.lnk'); $s.TargetPath='%INSTALL_DIR%\GsworkspaceServer.exe'; $s.WorkingDirectory='%INSTALL_DIR%'; $s.IconLocation='%INSTALL_DIR%\gsworkspace.ico,0'; $s.Description='gsworkspace background server'; $s.Save()"
if %ERRORLEVEL% neq 0 (
    echo WARNING: Failed to create the Startup shortcut.
) else (
    echo Start-at-login enabled.
)

:: ---- Also add a Start Menu shortcut for manual launch ----
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%SHORTCUT_DIR%\gsworkspace-server.lnk'); $s.TargetPath='%INSTALL_DIR%\GsworkspaceServer.exe'; $s.WorkingDirectory='%INSTALL_DIR%'; $s.IconLocation='%INSTALL_DIR%\gsworkspace.ico,0'; $s.Description='gsworkspace background server'; $s.Save()"
echo.

:: ---- Done ----
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Installed to: %INSTALL_DIR%
echo Autostart:    %STARTUP_DIR%\gsworkspace-server.lnk
echo.
echo The server will start automatically each time you log in.
echo Control it from the system-tray icon (near the clock).
echo.
echo Optional: add your API keys to %INSTALL_DIR%\backend\.env
echo.
set /p "LAUNCH=Start the server now? (Y/N): "
if /i "%LAUNCH%"=="Y" (
    start "" "%INSTALL_DIR%\GsworkspaceServer.exe"
    echo Started. Look for the tray icon.
)
echo.
pause
