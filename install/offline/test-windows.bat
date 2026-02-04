@echo off
setlocal

echo ============================================
echo   gsworkspace Offline Test (Windows)
echo ============================================
echo.

:: Get the script directory and project root
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\..\"
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

:: Check if dist folder exists
if not exist "%PROJECT_ROOT%\frontend\dist" (
    echo ERROR: frontend\dist not found.
    echo Please run build-windows.bat first to build the app.
    pause
    exit /b 1
)

echo Starting preview server...
echo.
echo   The app will open at: http://localhost:4173
echo.
echo   Press Ctrl+C to stop the server.
echo.

:: Wait a moment then open browser
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:4173"

:: Start Vite preview server
cd /d "%PROJECT_ROOT%\frontend"
call npm run preview
