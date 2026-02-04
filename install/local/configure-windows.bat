@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace Local Configuration (Windows)
echo ============================================
echo.

:: Get the script directory and project root
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\..\"
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

echo Project root: %PROJECT_ROOT%
echo.

:: Check for Node.js
echo Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo.
    echo Install using winget:
    echo   winget install OpenJS.NodeJS.LTS
    echo.
    echo Or download from https://nodejs.org/
    echo Recommended version: 18 or higher
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%
echo.

:: Check for npm
echo Checking for npm...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    echo npm is included with Node.js. Install Node.js:
    echo   winget install OpenJS.NodeJS.LTS
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo Found npm %NPM_VERSION%
echo.

:: Install all dependencies (root, backend, frontend)
echo ============================================
echo Installing dependencies...
echo ============================================
cd /d "%PROJECT_ROOT%"
call npm run install:all
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)
echo All dependencies installed successfully.
echo.

:: Configure backend .env
echo ============================================
echo Configuring backend environment...
echo ============================================
cd /d "%PROJECT_ROOT%\backend"

if exist ".env" (
    echo Backend .env already exists, skipping...
) else (
    echo Creating backend .env for local storage mode...
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
    ) > .env
    echo Backend .env created.
)
echo.

:: Configure frontend .env.local
echo ============================================
echo Configuring frontend environment...
echo ============================================
cd /d "%PROJECT_ROOT%\frontend"

if exist ".env.local" (
    echo Frontend .env.local already exists, skipping...
) else (
    echo Creating frontend .env.local...
    (
        echo VITE_OFFLINE_MODE=false
        echo.
        echo # Frontend server port ^(default: 3000^)
        echo VITE_PORT=3000
        echo.
        echo # Backend API port - must match PORT in backend/.env ^(default: 4000^)
        echo VITE_API_PORT=4000
    ) > .env.local
    echo Frontend .env.local created.
)
echo.

:: Done
echo ============================================
echo   Configuration Complete!
echo ============================================
echo.
echo To start the app, run: launch-windows.bat
echo.
echo Optional: Add your API keys to backend\.env
echo   - ANTHROPIC_API_KEY for Claude AI features
echo   - GEMINI_API_KEY for Gemini/Imagen features
echo.
pause
