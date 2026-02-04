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

echo Starting backend server...
start "gsworkspace Backend" cmd /k "cd /d "%PROJECT_ROOT%\backend" && npm run dev"

:: Wait a moment for backend to start
timeout /t 2 /nobreak >nul

echo Starting frontend server...
start "gsworkspace Frontend" cmd /k "cd /d "%PROJECT_ROOT%\frontend" && npm run dev"

:: Wait for frontend to be ready
timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   Servers are starting...
echo ============================================
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:4000
echo.
echo   Two new terminal windows have opened.
echo   Close them to stop the servers.
echo.
echo   Opening browser in 3 seconds...
timeout /t 3 /nobreak >nul

:: Open browser
start http://localhost:3000

echo.
echo You can close this window.
