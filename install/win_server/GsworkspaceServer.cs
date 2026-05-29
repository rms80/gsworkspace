#:property OutputType=WinExe
#:property TargetFramework=net10.0-windows
#:property UseWindowsForms=true
#:property Nullable=enable
// File-based apps default to native AOT / trimming, which Windows Forms doesn't
// support (NETSDK1175). Disable both so `dotnet run` and `dotnet publish` build.
#:property PublishAot=false
#:property PublishTrimmed=false
// Embed the app icon into the exe (Explorer/shortcut/extracted-tray fallback).
#:property ApplicationIcon=../local/gsworkspace.ico

// Gsworkspace Server — Windows system-tray daemon.
//
// Runs the backend (:4000) and frontend (:3000) Node dev servers hidden in the
// background, with no visible windows, and exposes control via a tray icon.
//
// This is a .NET "file-based app": no .csproj and no explicit build step.
// `dotnet run GsworkspaceServer.cs` compiles it on first run (cached afterwards)
// and launches it. Requires the .NET 10 SDK. The .vbs launcher in this folder
// starts it fully hidden. See README.md.

using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;

// Resolve the project root (the repo dir containing backend/ and frontend/):
//   1. An explicit launcher argument wins (the .vbs passes it).
//   2. A published .exe lives IN the install dir, so its own directory is the
//      root (single-file exe -> AppContext.BaseDirectory is the exe folder).
//   3. Dev `dotnet run` builds to a temp dir, so fall back to cwd\..\.. (the
//      .vbs sets cwd to install\win_server).
string projectRoot;
if (args.Length > 0 && Directory.Exists(args[0]))
    projectRoot = Path.GetFullPath(args[0]);
else if (File.Exists(Path.Combine(AppContext.BaseDirectory, "backend", "package.json")))
    projectRoot = Path.GetFullPath(AppContext.BaseDirectory);
else
    projectRoot = Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, "..", ".."));

// Only allow a single instance; a second launch just exits quietly.
using var mutex = new Mutex(true, "Gsworkspace_WinServer_SingleInstance", out bool isNew);
if (!isNew)
    return;

// WinForms / NotifyIcon require an STA thread. Spin one up explicitly so we
// don't depend on an [STAThread] entry-point attribute (unavailable with
// top-level statements).
var uiThread = new Thread(() =>
{
    Application.SetHighDpiMode(HighDpiMode.SystemAware);
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new TrayApp(projectRoot));
});
uiThread.SetApartmentState(ApartmentState.STA);
uiThread.Start();
uiThread.Join();

GC.KeepAlive(mutex);


/// <summary>Tray-icon application context that owns the two server processes.</summary>
class TrayApp : ApplicationContext
{
    // Ports for this background daemon. We inject these into the spawned
    // processes as env vars rather than editing backend\.env / frontend\.env.local,
    // so the other launchers keep using the default 3000/4000.
    const string BackendPort = "4040";
    const string FrontendPort = "3030";
    const string FrontendUrl = "http://localhost:" + FrontendPort;
    const string BackendUrl = "http://localhost:" + BackendPort;

    // Tailscale Serve exposes the frontend over HTTPS on this port (proxying to
    // the local frontend), e.g. https://<machine>.<tailnet>.ts.net:3033.
    const string HttpsPort = "3033";

    readonly string _projectRoot;
    readonly string _logFile;
    readonly NotifyIcon _tray;

    Process? _backend;
    Process? _frontend;
    bool _exiting;

    public TrayApp(string projectRoot)
    {
        _projectRoot = projectRoot;
        _logFile = Path.Combine(_projectRoot, "win_server.log");

        File.WriteAllText(_logFile, $"=== Gsworkspace server launcher started {DateTime.Now} ==={Environment.NewLine}");
        Log($"Project root: {_projectRoot}");

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Gsworkspace", null, (_, _) => OpenBrowser());
        menu.Items.Add("Restart servers", null, (_, _) => RestartServers());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add($"Enable remote HTTPS on port {HttpsPort} via Tailscale", null, (_, _) => EnableTailscaleHttps());
        menu.Items.Add($"Disable remote HTTPS via Tailscale", null, (_, _) => DisableTailscaleHttps());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Show status", null, (_, _) => ShowStatus());
        menu.Items.Add("View log", null, (_, _) => OpenLog());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitApp());

        _tray = new NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "Gsworkspace Server (starting…)",
            Visible = true,
            ContextMenuStrip = menu,
        };
        _tray.DoubleClick += (_, _) => OpenBrowser();

        // Make sure servers are torn down even on an abrupt process/session end.
        Application.ApplicationExit += (_, _) => StopServers();
        AppDomain.CurrentDomain.ProcessExit += (_, _) => StopServers();

        if (!PreflightOk())
        {
            ExitApp();
            return;
        }

        StartServers();
        _ = WaitForReadyAsync();
    }

    // --- Pre-flight ---------------------------------------------------------

    bool PreflightOk()
    {
        if (!IsOnPath("node") || !IsOnPath("npm"))
        {
            Fail("Node.js was not found on your PATH.\n\n" +
                 "Install it from https://nodejs.org/ (or: winget install OpenJS.NodeJS.LTS) and try again.");
            return false;
        }

        if (!File.Exists(Path.Combine(_projectRoot, "backend", ".env")))
        {
            Fail("backend\\.env was not found.\n\nRun install\\local\\configure-windows.bat first.");
            return false;
        }

        foreach (var dir in new[] { "node_modules", "backend\\node_modules", "frontend\\node_modules" })
        {
            if (!Directory.Exists(Path.Combine(_projectRoot, dir)))
            {
                Fail($"{dir} was not found.\n\nRun install\\local\\configure-windows.bat first.");
                return false;
            }
        }

        return true;
    }

    static bool IsOnPath(string exe)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = "where",
                Arguments = exe,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            p!.WaitForExit(5000);
            return p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    // --- Server lifecycle ---------------------------------------------------

    void StartServers()
    {
        // Start backend and frontend as separate hidden cmd processes (rather
        // than the root `npm run dev` concurrently script) so each can be
        // tracked and torn down by PID, mirroring the app-mode launcher.
        // Ports are injected as env vars: the backend reads process.env.PORT
        // (dotenv won't override it) and Vite's loadEnv lets process.env
        // VITE_PORT / VITE_API_PORT override .env.local.
        _backend = StartServer("backend", Path.Combine(_projectRoot, "backend.log"),
            new[] { ("PORT", BackendPort) });
        _frontend = StartServer("frontend", Path.Combine(_projectRoot, "frontend.log"),
            new[] { ("VITE_PORT", FrontendPort), ("VITE_API_PORT", BackendPort) });
        Log($"Backend PID {_backend?.Id.ToString() ?? "?"} (:{BackendPort}), Frontend PID {_frontend?.Id.ToString() ?? "?"} (:{FrontendPort})");
    }

    Process? StartServer(string subdir, string serverLog, (string Key, string Value)[] env)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                // cmd handles the redirection so the C# side stays simple.
                Arguments = $"/c npm run dev >> \"{serverLog}\" 2>&1",
                WorkingDirectory = Path.Combine(_projectRoot, subdir),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            foreach (var (key, value) in env)
                psi.Environment[key] = value;
            return Process.Start(psi);
        }
        catch (Exception ex)
        {
            Log($"Failed to start {subdir}: {ex.Message}");
            return null;
        }
    }

    void StopServers()
    {
        KillTree(_backend);
        KillTree(_frontend);
        _backend = null;
        _frontend = null;
    }

    static void KillTree(Process? p)
    {
        if (p == null)
            return;
        try
        {
            if (!p.HasExited)
            {
                // taskkill /T tears down the npm + node child processes too.
                using var kill = Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill",
                    Arguments = $"/T /F /PID {p.Id}",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                });
                kill?.WaitForExit(5000);
            }
        }
        catch { /* best effort */ }
    }

    void RestartServers()
    {
        Log("Restarting servers…");
        _tray.Text = "Gsworkspace Server (restarting…)";
        StopServers();
        Thread.Sleep(1000);
        StartServers();
        _ = WaitForReadyAsync();
    }

    async Task WaitForReadyAsync()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var deadline = DateTime.Now.AddSeconds(90);
        while (DateTime.Now < deadline && !_exiting)
        {
            if ((_backend?.HasExited ?? true) || (_frontend?.HasExited ?? true))
            {
                Log("A server process exited before becoming ready.");
                Notify("Gsworkspace failed to start", "A server process exited early. See win_server.log / backend.log / frontend.log.", ToolTipIcon.Error);
                _tray.Text = "Gsworkspace Server (error)";
                return;
            }
            try
            {
                var r = await http.GetAsync(FrontendUrl);
                if (r.IsSuccessStatusCode)
                {
                    Log("Frontend is responding.");
                    _tray.Text = "Gsworkspace Server (running)";
                    Notify("Gsworkspace is running", $"Open {FrontendUrl} — double-click the tray icon.", ToolTipIcon.Info);
                    return;
                }
            }
            catch { /* not up yet */ }
            await Task.Delay(500);
        }
        if (!_exiting)
        {
            Log("Frontend did not respond within the timeout.");
            Notify("Gsworkspace is slow to start", "The frontend hasn't responded yet. Check the logs from the tray menu.", ToolTipIcon.Warning);
            _tray.Text = "Gsworkspace Server (no response)";
        }
    }

    // --- Tray actions -------------------------------------------------------

    void OpenBrowser()
    {
        try { Process.Start(new ProcessStartInfo(FrontendUrl) { UseShellExecute = true }); }
        catch (Exception ex) { Log($"Open browser failed: {ex.Message}"); }
    }

    void OpenLog()
    {
        try { Process.Start(new ProcessStartInfo(_logFile) { UseShellExecute = true }); }
        catch (Exception ex) { Log($"Open log failed: {ex.Message}"); }
    }

    void ShowStatus()
    {
        bool backend = !(_backend?.HasExited ?? true);
        bool frontend = !(_frontend?.HasExited ?? true);
        MessageBox.Show(
            $"Backend  ({BackendUrl}): {(backend ? "running" : "stopped")}\n" +
            $"Frontend ({FrontendUrl}): {(frontend ? "running" : "stopped")}\n\n" +
            $"Project root:\n{_projectRoot}",
            "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void ExitApp()
    {
        if (_exiting)
            return;
        _exiting = true;
        Log("Shutting down…");
        StopServers();
        _tray.Visible = false;
        _tray.Dispose();
        ExitThread();
    }

    // --- Remote HTTPS via Tailscale Serve -----------------------------------

    void EnableTailscaleHttps()
    {
        Log("Enabling Tailscale Serve…");
        // Proxies https://<machine>.<tailnet>.ts.net:<HttpsPort> ->
        // http://localhost:<frontend> with a real Let's Encrypt cert, so the
        // browser stops warning and secure-context features (e.g. the clipboard
        // API) work. --bg persists it across reboots.
        var (output, code, started) = RunTailscale($"serve --bg --https={HttpsPort} {FrontendPort}");
        if (!started)
        {
            MessageBox.Show(
                "Could not run tailscale.\n\n" +
                "Is Tailscale installed? https://tailscale.com/download\n\n" + output,
                "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        if (code != 0)
        {
            MessageBox.Show(
                "tailscale serve reported an error:\n\n" + output + "\n\n" +
                "Enable MagicDNS and HTTPS Certificates for your tailnet in the\n" +
                "Tailscale admin console, then try again.",
                "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var (status, _, _) = RunTailscale("serve status");
        MessageBox.Show(
            $"Remote HTTPS is enabled on port {HttpsPort} (proxying to the frontend).\n\n" +
            $"From another Tailscale device, open the full https://...ts.net:{HttpsPort}\n" +
            "address shown below (use the full machine name, and include the port):\n\n" +
            status,
            "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void DisableTailscaleHttps()
    {
        Log("Disabling Tailscale Serve…");
        // Remove just our mapping (leaves any other serve config intact).
        var (output, code, started) = RunTailscale($"serve --https={HttpsPort} off");
        if (!started)
        {
            MessageBox.Show("Could not run tailscale.\n\n" + output,
                "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        MessageBox.Show(
            code == 0 ? "Remote HTTPS (Tailscale Serve) has been disabled." : ("tailscale serve reset:\n\n" + output),
            "Gsworkspace Server", MessageBoxButtons.OK,
            code == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
    }

    static string FindTailscale()
    {
        string[] candidates =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Tailscale", "tailscale.exe"),
            @"C:\Program Files\Tailscale\tailscale.exe",
        };
        foreach (var c in candidates)
            if (File.Exists(c))
                return c;
        return "tailscale"; // fall back to PATH
    }

    (string output, int code, bool started) RunTailscale(string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = FindTailscale(),
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var p = Process.Start(psi);
            if (p == null)
                return ("", -1, false);
            string stdout = p.StandardOutput.ReadToEnd();
            string stderr = p.StandardError.ReadToEnd();
            p.WaitForExit(20000);
            return ((stdout + stderr).Trim(), p.ExitCode, true);
        }
        catch (Exception ex)
        {
            Log($"tailscale {arguments} failed: {ex.Message}");
            return (ex.Message, -1, false);
        }
    }

    // --- Helpers ------------------------------------------------------------

    Icon LoadIcon()
    {
        // The installed layout copies the icon to the root; the dev repo keeps it
        // under install\local. Try both, then fall back to the icon embedded in
        // the exe (ApplicationIcon), then the system default.
        string[] candidates =
        {
            Path.Combine(_projectRoot, "gsworkspace.ico"),
            Path.Combine(_projectRoot, "install", "local", "gsworkspace.ico"),
        };
        foreach (var p in candidates)
        {
            try
            {
                if (File.Exists(p))
                    return new Icon(p);
            }
            catch (Exception ex) { Log($"Icon load failed for {p}: {ex.Message}"); }
        }
        try
        {
            var exe = Environment.ProcessPath;
            if (exe != null)
            {
                var embedded = Icon.ExtractAssociatedIcon(exe);
                if (embedded != null)
                    return embedded;
            }
        }
        catch (Exception ex) { Log($"Icon extract failed: {ex.Message}"); }
        return SystemIcons.Application;
    }

    void Notify(string title, string text, ToolTipIcon icon)
    {
        _tray.BalloonTipTitle = title;
        _tray.BalloonTipText = text;
        _tray.BalloonTipIcon = icon;
        _tray.ShowBalloonTip(5000);
    }

    void Fail(string message)
    {
        Log("Pre-flight failed: " + message.Replace("\n", " "));
        MessageBox.Show(message, "Gsworkspace Server", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    void Log(string msg)
    {
        try { File.AppendAllText(_logFile, $"{DateTime.Now:HH:mm:ss.fff} {msg}{Environment.NewLine}"); }
        catch { /* logging must never throw */ }
    }
}
