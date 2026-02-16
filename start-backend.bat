@echo off
title GSWServer
echo Killing any existing process on port 4000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting backend dev server...
cd /d "%~dp0backend"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$host.UI.RawUI.WindowTitle = 'GSWServer'; npx tsx watch src/index.ts 2>&1 | Tee-Object -FilePath '..\backend.log'"
title GSWServer
pause
