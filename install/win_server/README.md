# Windows Background Server (system tray)

Runs the Gsworkspace backend (`:4040`) and frontend (`:3030`) Node servers
**hidden in the background**, with **no visible windows**, controlled entirely
from a **system-tray icon**.

There are two ways to use it:

- **Installed (recommended)** — a real `GsworkspaceServer.exe` installed to
  `%LocalAppData%\gsworkspace` that **starts automatically at login**. No .NET
  runtime needed to run (the exe is self-contained).
- **Dev** — run the single `.cs` file directly via `dotnet run` (no build step),
  handy while iterating. Requires the .NET 10 SDK.

The app itself is a .NET *file-based app* — one `.cs` file, no `.csproj`.

---

## Installed mode (start at login)

### Prerequisites
- **Node.js 18+** — `winget install OpenJS.NodeJS.LTS`
- **.NET 10 SDK** — `winget install Microsoft.DotNet.SDK.10` *(needed to build
  the exe during install; not needed afterward to run it)*

### Install
1. Double-click **`install-win-server.bat`**.
   It copies the app to `%LocalAppData%\gsworkspace`, installs npm dependencies,
   builds a self-contained `GsworkspaceServer.exe`, and adds a shortcut to your
   Windows **Startup** folder so it launches at every login.
2. Choose *Y* at the end to start it immediately, or just log out and back in.

The server then runs in the background on every login — control it from the
**tray icon** (near the clock; you may need the `^` overflow arrow).

### Uninstall
Double-click **`uninstall-win-server.bat`**. It removes the autostart shortcut
and the install directory. (Exit the tray app first so the Node servers stop
cleanly.) Your data in `~/.gsworkspace` is left alone.

---

## Dev mode (no build)

1. One-time config: run `install\local\configure-windows.bat` (installs deps,
   creates `backend\.env`).
2. Double-click **`Start Gsworkspace Server.vbs`** — a hidden launcher that runs
   `dotnet run` with no console window. First launch is slower (it compiles the
   app once); later launches reuse the cached build.

---

## Tray menu

| Item | Action |
|------|--------|
| Open Gsworkspace | Opens http://localhost:3030 |
| Restart servers  | Stops and restarts both Node servers |
| Show status      | Reports whether backend/frontend are up |
| View log         | Opens `win_server.log` |
| Exit             | Stops both servers and removes the tray icon |

Double-click the tray icon to open the app. **Exit** kills the full `npm`/`node`
process trees, so nothing is left running.

## Files

| File | Purpose |
|------|---------|
| `GsworkspaceServer.cs` | The whole app (single-file C# tray program) |
| `install-win-server.bat` | Installs the exe + enables start-at-login |
| `uninstall-win-server.bat` | Removes the install and autostart |
| `Start Gsworkspace Server.vbs` | Dev launcher — `dotnet run`, no console window |
| `README.md` | This file |

## Logs

Written to the project root (`%LocalAppData%\gsworkspace` when installed):

- `win_server.log` — the tray app's own log
- `win_server.bootstrap.log` — `dotnet run` build/startup output (dev mode)
- `backend.log` / `frontend.log` — the Node servers' output

## Remote access (Tailscale / LAN)

By default the frontend listens on `localhost` only. To reach it from another
device (e.g. over Tailscale at `http://<machine>:3030`), set in
`frontend\.env.local`:

```
VITE_EXPOSE=true
```

That binds the frontend to all interfaces. Only the **frontend** needs exposing —
it proxies `/api` to the backend on `localhost:4040`, so the backend stays local
and a remote browser only talks to `:3030`.

Vite blocks requests whose `Host` header isn't `localhost`. This machine's own
hostname (`os.hostname()`) is allowed automatically; list anything else in
`VITE_ALLOWED_HOSTS` (comma-separated). A **leading dot matches subdomains**, so
for Tailscale set:

```
VITE_ALLOWED_HOSTS=.ts.net
```

which allows any MagicDNS name like `basement.<tailnet>.ts.net`. Use
`VITE_ALLOWED_HOSTS=*` to allow any host. Setting `VITE_ALLOWED_HOSTS` **implies
exposure**, so either variable alone is enough — you don't need `VITE_EXPOSE` too.
(The fresh-install `.env.local` already sets `VITE_ALLOWED_HOSTS=.ts.net`.)

> The fresh-install `.env.local` written by `install-win-server.bat` already sets
> `VITE_EXPOSE=true`. If you're upgrading an existing install, your `.env.local`
> is preserved — add the line yourself and **Restart servers** from the tray.

### HTTPS (remove the "Not secure" warning)

Accessing over plain HTTP, the browser shows **"Not secure"** and — more
importantly — disables *secure-context* features, so **copy/paste of canvas items
won't work** on the remote machine (the app uses the async Clipboard API, which
requires HTTPS or localhost). Your traffic is still encrypted by Tailscale's
WireGuard tunnel; the warning is about the lack of HTTPS at the page level.

**Tailscale Serve** gives you a real, trusted certificate with no app changes:

1. One-time: in the Tailscale admin console, enable **MagicDNS** and
   **HTTPS Certificates** for your tailnet.
2. Tray icon → **Enable remote HTTPS (Tailscale)**. This runs
   `tailscale serve --bg --https=3033 3030`, which proxies
   `https://<machine>.<tailnet>.ts.net:3033` → `http://localhost:3030` with a
   Let's Encrypt cert. The resulting URL is shown in the confirmation dialog.
3. From the remote machine, open that **full** `https://…ts.net:3033` URL — use
   the full machine name (the cert is issued for it) **and** include the `:3033`
   port. (`https://…ts.net` with no port hits Tailscale's default 443, which
   isn't configured; `https://…ts.net:3030` fails because 3030 is plain HTTP.)

`*.ts.net` is already in the allowed-hosts list, so no extra config is needed.
The setting persists across reboots; remove it any time with **Disable remote
HTTPS (Tailscale)**.

Equivalent commands if you prefer the CLI:

```powershell
tailscale serve --bg --https=3033 3030   # enable
tailscale serve status                   # show the https URL
tailscale serve --https=3033 off         # disable
```

## Notes

- Ports **3030** (frontend) / **4040** (backend) are injected as environment
  variables into the spawned processes, leaving `backend\.env` /
  `frontend\.env.local` untouched. To change them, edit the
  `BackendPort`/`FrontendPort` constants near the top of `GsworkspaceServer.cs`
  (and rebuild for installed mode).
- Only one instance runs at a time (named mutex) — launching again is a no-op.
- The installed exe finds the app via its own folder, so no launcher argument is
  needed; the dev `.vbs` passes the repo root explicitly.

## Building the exe by hand

The installer does this for you, but to produce the exe manually:

```powershell
cd install\win_server
dotnet publish GsworkspaceServer.cs -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish
```

`PublishAot=false` / `PublishTrimmed=false` are already set in the `.cs` via
`#:property` directives (file-based publish otherwise defaults to native AOT,
which Windows Forms doesn't support). The result is `publish\GsworkspaceServer.exe`.
