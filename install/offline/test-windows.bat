@echo off
setlocal

echo ============================================
echo   gsworkspace Offline Test (Windows)
echo ============================================
echo.

:: Get the script directory
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"
set "SCRIPT_DIR=%CD%"
popd

:: Check if dist folder exists
if not exist "%SCRIPT_DIR%\dist" (
    echo ERROR: dist folder not found.
    echo Please run build-windows.bat first to build the app.
    pause
    exit /b 1
)

echo Starting preview server...
echo.
echo   The app will open at: http://localhost:3000
echo.
echo   Press Ctrl+C to stop the server.
echo.

:: Wait a moment then open browser
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start static server
cd /d "%SCRIPT_DIR%"
call npx -y serve dist -l 3000
