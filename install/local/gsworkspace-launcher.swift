import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var backendProcess: Process?
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set up menu bar icon
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            if let icon = Bundle.main.image(forResource: "menubar-icon") {
                icon.isTemplate = true
                button.image = icon
            } else {
                button.title = "GS"
            }
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Open gsworkspace", action: #selector(openBrowser), keyEquivalent: "o"))

        let statusMenuItem = NSMenuItem(title: "Starting server...", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        statusMenuItem.tag = 1
        menu.addItem(statusMenuItem)

        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit gsworkspace", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu

        let appRoot = Bundle.main.bundlePath + "/Contents/Resources/app"

        // Find node
        let nodePaths = ["/usr/local/bin/node", "/opt/homebrew/bin/node"]
        guard let nodePath = nodePaths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            showAlert("Node.js not found",
                      "gsworkspace requires Node.js.\nInstall from https://nodejs.org/")
            NSApp.terminate(nil)
            return
        }

        // Start backend
        let backend = Process()
        backend.executableURL = URL(fileURLWithPath: nodePath)
        backend.arguments = ["dist/index.js"]
        backend.currentDirectoryURL = URL(fileURLWithPath: appRoot + "/backend")
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:" + (env["PATH"] ?? "")
        env["FRONTEND_STATIC_DIR"] = appRoot + "/frontend/dist"
        env["NODE_ENV"] = "production"
        env["PORT"] = "4040"
        backend.environment = env
        backend.standardOutput = FileHandle.nullDevice
        backend.standardError = FileHandle.nullDevice

        do {
            try backend.run()
        } catch {
            showAlert("Failed to start backend", error.localizedDescription)
            NSApp.terminate(nil)
            return
        }
        backendProcess = backend

        // Wait for backend ready, then open browser
        DispatchQueue.global().async { [weak self] in
            for _ in 0..<30 {
                guard let backend = self?.backendProcess, backend.isRunning else {
                    DispatchQueue.main.async {
                        self?.showAlert("gsworkspace failed to start",
                                        "The backend server exited unexpectedly.")
                        NSApp.terminate(nil)
                    }
                    return
                }
                if let url = URL(string: "http://localhost:4040/api/health"),
                   let _ = try? Data(contentsOf: url) {
                    break
                }
                Thread.sleep(forTimeInterval: 0.5)
            }
            DispatchQueue.main.async {
                // Update status menu item
                if let menu = self?.statusItem.menu,
                   let item = menu.item(withTag: 1) {
                    item.title = "Server running on port 4040"
                }
                self?.openBrowser()
            }
        }
    }

    // Called when user tries to launch the app again while it's already running
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openBrowser()
        // Re-hide from Dock (macOS makes accessory apps visible on reopen)
        sender.setActivationPolicy(.accessory)
        return false
    }

    @objc func openBrowser() {
        let chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if FileManager.default.isExecutableFile(atPath: chromePath) {
            let chrome = Process()
            chrome.executableURL = URL(fileURLWithPath: chromePath)
            chrome.arguments = ["--app=http://localhost:4040"]
            try? chrome.run()
        } else {
            NSWorkspace.shared.open(URL(string: "http://localhost:4040")!)
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        backendProcess?.terminate()
        backendProcess?.waitUntilExit()
        return .terminateNow
    }

    func showAlert(_ message: String, _ info: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = info
        alert.alertStyle = .critical
        alert.runModal()
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
