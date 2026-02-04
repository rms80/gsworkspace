@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace Offline Build (Windows)
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

:: Install frontend dependencies
echo ============================================
echo Installing frontend dependencies...
echo ============================================
cd /d "%PROJECT_ROOT%\frontend"
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install frontend dependencies.
    pause
    exit /b 1
)
echo Frontend dependencies installed successfully.
echo.

:: Build the frontend
echo ============================================
echo Building frontend for offline use...
echo ============================================
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to build frontend.
    pause
    exit /b 1
)
echo.

:: Done
echo ============================================
echo   Build Complete!
echo ============================================
echo.
echo The offline build is located at:
echo   %PROJECT_ROOT%\frontend\dist\
echo.
echo To test locally, run: test-windows.bat
echo.
echo To deploy:
echo   1. Copy the contents of frontend\dist\ to your web server
echo   2. Or embed in an Astro site (see DEPLOYMENT.md)
echo.
pause
