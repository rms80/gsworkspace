import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var backendProcess: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let bundle = Bundle.main
        let appRoot = bundle.bundlePath + "/Contents/Resources/app"

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
                self?.openBrowser()
            }
        }
    }

    func openBrowser() {
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
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
