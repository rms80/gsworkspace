@echo off
setlocal

echo ============================================
echo   gsworkspace - Starting Local Server
echo ============================================
echo.

:: Get the script directory and project root
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\..\"
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

:: Check if backend .env exists
if not exist "%PROJECT_ROOT%\backend\.env" (
    echo ERROR: backend\.env not found.
    echo Please run configure-windows.bat first.
    pause
    exit /b 1
)

:: Check if node_modules exist
if not exist "%PROJECT_ROOT%\node_modules" (
    echo ERROR: Root dependencies not installed.
    echo Please run configure-windows.bat first.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\backend\node_modules" (
    echo ERROR: Backend dependencies not installed.
    echo Please run configure-windows.bat first.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\frontend\node_modules" (
    echo ERROR: Frontend dependencies not installed.
    echo Please run configure-windows.bat first.
    pause
    exit /b 1
)

echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:4000
echo.
echo   Press Ctrl+C to stop both servers.
echo.
echo   Opening browser in 3 seconds...
timeout /t 3 /nobreak >nul

:: Open browser
start http://localhost:3000

:: Start both servers in this terminal
cd /d "%PROJECT_ROOT%"
npm run dev
