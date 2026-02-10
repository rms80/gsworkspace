@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace - Windows Installer
echo ============================================
echo.

:: ---- Configuration ----
set "INSTALL_DIR=%LocalAppData%\gsworkspace"
set "SCRIPT_DIR=%~dp0"
set "SOURCE_ROOT=%SCRIPT_DIR%..\..\"
pushd "%SOURCE_ROOT%"
set "SOURCE_ROOT=%CD%"
popd
set "SHORTCUT_DIR=%AppData%\Microsoft\Windows\Start Menu\Programs"

echo Source:  %SOURCE_ROOT%
echo Target:  %INSTALL_DIR%
echo.

:: ---- Check for Node.js ----
echo Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo.
    echo Install using winget:
    echo   winget install OpenJS.NodeJS.LTS
    echo.
    echo Or download from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%

:: ---- Check for npm ----
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo Found npm %NPM_VERSION%
echo.

:: ---- Confirm installation ----
echo This will install gsworkspace to:
echo   %INSTALL_DIR%
echo.
set /p "CONFIRM=Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Installation cancelled.
    pause
    exit /b 0
)
echo.

:: ---- Create install directory ----
echo ============================================
echo Creating installation directory...
echo ============================================

if exist "%INSTALL_DIR%" (
    echo Removing previous installation...
    rmdir /s /q "%INSTALL_DIR%"
)
mkdir "%INSTALL_DIR%"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to create %INSTALL_DIR%
    pause
    exit /b 1
)

:: ---- Copy root files ----
echo.
echo Copying root project files...
copy "%SOURCE_ROOT%\package.json" "%INSTALL_DIR%\package.json" >nul
copy "%SOURCE_ROOT%\package-lock.json" "%INSTALL_DIR%\package-lock.json" >nul
copy "%SOURCE_ROOT%\tsconfig.json" "%INSTALL_DIR%\tsconfig.json" >nul

:: ---- Copy backend ----
echo Copying backend...
robocopy "%SOURCE_ROOT%\backend" "%INSTALL_DIR%\backend" /E /XD node_modules dist /XF .env >nul
if %ERRORLEVEL% gtr 7 (
    echo ERROR: Failed to copy backend files.
    pause
    exit /b 1
)

:: ---- Copy frontend ----
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
echo Installing npm dependencies...
echo ============================================
echo This may take a few minutes...
echo.

cd /d "%INSTALL_DIR%"
call npm run install:all
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)
echo.
echo Dependencies installed.
echo.

:: ---- Create backend .env ----
echo ============================================
echo Configuring environment...
echo ============================================

if not exist "%INSTALL_DIR%\backend\.env" (
    (
        echo # Backend Configuration
        echo PORT=4000
        echo.
        echo # Storage mode: 'local' for local disk storage
        echo STORAGE_MODE=local
        echo.
        echo # Local storage path ^(defaults to ~/.gsworkspace if empty^)
        echo LOCAL_STORAGE_PATH=
        echo.
        echo # AI API Keys ^(optional - leave empty to disable AI features^)
        echo ANTHROPIC_API_KEY=
        echo GEMINI_API_KEY=
    ) > "%INSTALL_DIR%\backend\.env"
    echo Created backend\.env
)

:: ---- Create frontend .env.local ----
if not exist "%INSTALL_DIR%\frontend\.env.local" (
    (
        echo VITE_OFFLINE_MODE=false
        echo.
        echo # Use production favicon instead of dev favicon
        echo VITE_PROD_FAVICON=true
        echo.
        echo # Frontend server port
        echo VITE_PORT=3000
        echo.
        echo # Backend API port
        echo VITE_API_PORT=4000
    ) > "%INSTALL_DIR%\frontend\.env.local"
    echo Created frontend\.env.local
)
echo.

:: ---- Create launcher scripts ----
echo ============================================
echo Creating launcher scripts...
echo ============================================

:: Copy pre-made launcher templates (avoids fragile batch-echo escaping)
copy "%SCRIPT_DIR%installed-launcher.ps1" "%INSTALL_DIR%\gsworkspace.ps1" >nul
echo Created gsworkspace.ps1

copy "%SCRIPT_DIR%installed-launcher.bat" "%INSTALL_DIR%\gsworkspace.bat" >nul
echo Created gsworkspace.bat

:: Copy app icon
copy "%SCRIPT_DIR%gsworkspace.ico" "%INSTALL_DIR%\gsworkspace.ico" >nul
echo Created gsworkspace.ico
echo.

:: ---- Create Start Menu shortcut ----
echo ============================================
echo Creating Start Menu shortcut...
echo ============================================

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $shortcut = $ws.CreateShortcut('%SHORTCUT_DIR%\gsworkspace.lnk'); $shortcut.TargetPath = '%INSTALL_DIR%\gsworkspace.bat'; $shortcut.WorkingDirectory = '%INSTALL_DIR%'; $shortcut.IconLocation = '%INSTALL_DIR%\gsworkspace.ico,0'; $shortcut.Description = 'gsworkspace'; $shortcut.Save()"

if %ERRORLEVEL% neq 0 (
    echo WARNING: Failed to create Start Menu shortcut.
    echo You can manually create a shortcut to: %INSTALL_DIR%\gsworkspace.bat
) else (
    echo Start Menu shortcut created.
)
echo.

:: ---- Done ----
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Installed to: %INSTALL_DIR%
echo.
echo To launch: Search for "gsworkspace" in the Start Menu
echo            or run: %INSTALL_DIR%\gsworkspace.bat
echo.
echo Optional: Add your API keys to:
echo   %INSTALL_DIR%\backend\.env
echo     - ANTHROPIC_API_KEY for Claude AI features
echo     - GEMINI_API_KEY for Gemini/Imagen features
echo.
pause
