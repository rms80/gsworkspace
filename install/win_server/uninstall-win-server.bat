@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   gsworkspace - Background Server Uninstaller
echo ============================================
echo.

set "INSTALL_DIR=%LocalAppData%\gsworkspace"
set "STARTUP_SHORTCUT=%AppData%\Microsoft\Windows\Start Menu\Programs\Startup\gsworkspace-server.lnk"
set "MENU_SHORTCUT=%AppData%\Microsoft\Windows\Start Menu\Programs\gsworkspace-server.lnk"

echo This removes the autostart entry and the background server.
set /p "CONFIRM=Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Uninstall cancelled.
    pause
    exit /b 0
)
echo.

:: ---- Remove shortcuts (disables autostart) ----
echo Removing autostart and Start Menu shortcuts...
if exist "%STARTUP_SHORTCUT%" del "%STARTUP_SHORTCUT%"
if exist "%MENU_SHORTCUT%" del "%MENU_SHORTCUT%"
echo Done.
echo.

:: ---- Make sure it isn't running (so node servers stop cleanly) ----
tasklist /fi "imagename eq GsworkspaceServer.exe" 2>nul | findstr /i "GsworkspaceServer.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo The server is currently running.
    echo Please right-click the tray icon and choose "Exit" so the
    echo Node servers are stopped cleanly, then press any key to continue.
    pause >nul
)
echo.

:: ---- Remove the installation directory ----
echo Removing %INSTALL_DIR% ...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
    if exist "%INSTALL_DIR%" (
        echo WARNING: Could not fully remove %INSTALL_DIR%.
        echo Some files may still be in use. Exit the tray app and re-run.
    ) else (
        echo Removed.
    )
) else (
    echo Not found - nothing to remove.
)
echo.

echo ============================================
echo   Uninstall Complete
echo ============================================
echo.
echo Note: user data in ~/.gsworkspace was not removed.
echo.
pause
