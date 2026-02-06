# gsworkspace - App Mode Launcher
# Starts dev servers hidden, opens Chrome in app mode,
# and shuts everything down when the Chrome window is closed.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..\..")

# --- Pre-flight checks ---

if (-not (Test-Path (Join-Path $projectRoot "backend\.env"))) {
    [System.Windows.MessageBox]::Show("backend\.env not found.`nPlease run configure-windows.bat first.", "gsworkspace", "OK", "Error") | Out-Null
    exit 1
}

foreach ($dir in @("node_modules", "backend\node_modules", "frontend\node_modules")) {
    if (-not (Test-Path (Join-Path $projectRoot $dir))) {
        [System.Windows.MessageBox]::Show("$dir not found.`nPlease run configure-windows.bat first.", "gsworkspace", "OK", "Error") | Out-Null
        exit 1
    }
}

# --- Find Chrome ---

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
    [System.Windows.MessageBox]::Show("Chrome not found.`nInstall Google Chrome for app mode.", "gsworkspace", "OK", "Error") | Out-Null
    exit 1
}

# --- Start dev servers (hidden) ---

$serverProc = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

# Give servers a moment to start
Start-Sleep -Seconds 4

# --- Launch Chrome in app mode ---
# --user-data-dir forces a separate Chrome process so we can detect when it exits
# --no-first-run suppresses the welcome page for the isolated profile

$chromeDataDir = Join-Path $env:TEMP "gsworkspace-chrome-profile"
$chromeProc = Start-Process -FilePath $chrome -ArgumentList `
    "--app=http://localhost:3000", `
    "--user-data-dir=`"$chromeDataDir`"", `
    "--no-first-run" `
    -PassThru

# --- Wait for Chrome to close, then clean up ---

$chromeProc.WaitForExit()

# Kill the server process tree (cmd -> concurrently -> node processes)
& taskkill /t /f /pid $serverProc.Id 2>$null | Out-Null
