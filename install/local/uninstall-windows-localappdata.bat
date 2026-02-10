@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace - Windows Uninstaller
echo ============================================
echo.

set "INSTALL_DIR=%LocalAppData%\gsworkspace"
set "SHORTCUT=%AppData%\Microsoft\Windows\Start Menu\Programs\gsworkspace.lnk"

if not exist "%INSTALL_DIR%" (
    echo gsworkspace is not installed at %INSTALL_DIR%.
    pause
    exit /b 0
)

echo This will remove gsworkspace from:
echo   %INSTALL_DIR%
echo.
set /p "CONFIRM=Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Uninstall cancelled.
    pause
    exit /b 0
)
echo.

:: ---- Remove Start Menu shortcut ----
echo Removing Start Menu shortcut...
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo Removed.
) else (
    echo No shortcut found.
)
echo.

:: ---- Remove installation directory ----
echo Removing installation directory...
rmdir /s /q "%INSTALL_DIR%"
if %ERRORLEVEL% neq 0 (
    echo WARNING: Could not fully remove %INSTALL_DIR%.
    echo Some files may be in use. Close gsworkspace and try again.
) else (
    echo Removed.
)
echo.

echo ============================================
echo   Uninstall Complete
echo ============================================
echo.
echo Note: User data in ~/.gsworkspace was not removed.
echo Delete it manually if you want to remove all data.
echo.
pause
