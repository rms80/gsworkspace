# gsworkspace - App Mode Launcher (Installed Version)
# Starts dev servers hidden, opens Chrome in app mode,
# and shuts everything down when the Chrome window is closed.

$ErrorActionPreference = "Stop"

# When installed, the script lives in the application root directory
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Log everything to a file so failures are diagnosable when running hidden.
$logFile = Join-Path $projectRoot "appmode-launcher.log"
"=== Launcher started at $(Get-Date) ===" | Out-File -FilePath $logFile -Encoding utf8
function Log($msg) {
    "$([DateTime]::Now.ToString('HH:mm:ss.fff')) $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}
Log "Project root: $projectRoot"

# --- Pre-flight checks ---

if (-not (Test-Path (Join-Path $projectRoot "backend\.env"))) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("backend\.env not found.`nThe installation may be corrupted.", "gsworkspace", "OK", "Error") | Out-Null
    exit 1
}

foreach ($dir in @("node_modules", "backend\node_modules", "frontend\node_modules")) {
    if (-not (Test-Path (Join-Path $projectRoot $dir))) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("$dir not found.`nThe installation may be corrupted.", "gsworkspace", "OK", "Error") | Out-Null
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
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Chrome not found.`nInstall Google Chrome for app mode.", "gsworkspace", "OK", "Error") | Out-Null
    exit 1
}

# --- Start dev servers (hidden) ---
# Start backend and frontend separately to avoid tsx watch stdin issues with hidden windows

$backendProc = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden -PassThru
Log "Backend started (PID: $($backendProc.Id))"

$frontendProc = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory (Join-Path $projectRoot "frontend") -WindowStyle Hidden -PassThru
Log "Frontend started (PID: $($frontendProc.Id))"

# --- Wait for the frontend to actually respond before launching Chrome ---
# Cold starts (antivirus scanning, slow disk) can easily exceed a fixed sleep,
# producing a white "site can't be reached" Chrome window.

$frontendUrl = "http://localhost:3030"
$timeoutSec = 60
$deadline = (Get-Date).AddSeconds($timeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if ($backendProc.HasExited) {
        Log "Backend process exited prematurely (code $($backendProc.ExitCode))"
        break
    }
    if ($frontendProc.HasExited) {
        Log "Frontend process exited prematurely (code $($frontendProc.ExitCode))"
        break
    }
    try {
        $r = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 2 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        # Not ready yet — keep polling.
    }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Log "Frontend did not respond on $frontendUrl within ${timeoutSec}s"
    & taskkill /t /f /pid $backendProc.Id 2>$null | Out-Null
    & taskkill /t /f /pid $frontendProc.Id 2>$null | Out-Null
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "The dev servers did not come up within ${timeoutSec}s.`n`nSee log:`n$logFile",
        "gsworkspace", "OK", "Error"
    ) | Out-Null
    exit 1
}

Log "Frontend is responding. Launching Chrome..."

# --- Launch Chrome in app mode ---
# --user-data-dir forces a separate Chrome process so we can detect when it exits
# --no-first-run suppresses the welcome page for the isolated profile

$chromeDataDir = Join-Path $env:TEMP "gsworkspace-chrome-profile"
$chromeProc = Start-Process -FilePath $chrome -ArgumentList `
    "--app=$frontendUrl", `
    "--user-data-dir=`"$chromeDataDir`"", `
    "--no-first-run" `
    -PassThru

Log "Chrome started (PID: $($chromeProc.Id)). Waiting for it to close..."

# --- Wait for Chrome to close, then clean up ---

$chromeProc.WaitForExit()

Log "Chrome exited. Killing servers..."

# Kill both server process trees
& taskkill /t /f /pid $backendProc.Id 2>$null | Out-Null
& taskkill /t /f /pid $frontendProc.Id 2>$null | Out-Null

Log "Done."
