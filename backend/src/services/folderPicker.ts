import { execFile, spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { resolve } from 'path'

/**
 * Folders on the server's desktop: opening the operating system's folder dialog to choose one, and
 * showing one in the file manager.
 *
 * Browsers never tell a page the absolute path of a folder the user picks, so when the browser and
 * the server are on the same machine, the server shows the dialog instead. This only works when the
 * server runs in a desktop session (npm run dev, the tray app), not as a service or on a remote host.
 */

/** No folder dialog can be shown on this server */
export class FolderPickerUnavailableError extends Error {}

/** A dialog is already open */
export class FolderPickerBusyError extends Error {}

// The dialog waits for the user, but not forever
const PICKER_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Windows: the Explorer-style folder dialog (IFileOpenDialog with FOS_PICKFOLDERS), owned by an
 * invisible topmost window so it opens in front of the browser. The starting folder comes in
 * through GSWS_PICKER_START to avoid quoting it into the script.
 */
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GswsFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  class FileOpenDialog {}

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }

  // IFileDialog, up to GetResult (vtable order matters)
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

  const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
  const uint SIGDN_FILESYSPATH = 0x80058000;
  const int ERROR_CANCELLED = unchecked((int)0x800704C7);

  // The chosen folder, or null if cancelled
  public static string Pick(IntPtr owner, string title, string start) {
    var dialog = (IFileDialog)new FileOpenDialog();
    try {
      dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
      dialog.SetTitle(title);
      if (!string.IsNullOrEmpty(start)) {
        try {
          Guid iid = typeof(IShellItem).GUID;
          IShellItem folder;
          SHCreateItemFromParsingName(start, IntPtr.Zero, ref iid, out folder);
          dialog.SetFolder(folder);
        } catch { }
      }
      int hr = dialog.Show(owner);
      if (hr == ERROR_CANCELLED) return null;
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      IShellItem result;
      dialog.GetResult(out result);
      string path;
      result.GetDisplayName(SIGDN_FILESYSPATH, out path);
      return path;
    } finally {
      Marshal.ReleaseComObject(dialog);
    }
  }
}
'@

$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'None'
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()
try {
  $path = [GswsFolderPicker]::Pick($owner.Handle, 'Choose a folder for the agent', $env:GSWS_PICKER_START)
} finally {
  $owner.Close()
}
if ($path) { [Console]::Out.Write($path) }
`

interface PickerCommand {
  command: string
  args: string[]
  env?: Record<string, string>
  /** Exit codes that mean the user cancelled */
  cancelCodes: number[]
}

function pickerCommands(start: string | null): PickerCommand[] {
  if (process.platform === 'win32') {
    return [{
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')],
      env: { GSWS_PICKER_START: start ?? '' },
      cancelCodes: [],
    }]
  }
  if (process.platform === 'darwin') {
    const location = start ? ` default location (POSIX file ${JSON.stringify(start)})` : ''
    return [{
      command: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt "Choose a folder for the agent"${location})`],
      cancelCodes: [1],
    }]
  }
  // Linux and others: whichever dialog tool is installed
  return [
    {
      command: 'zenity',
      args: ['--file-selection', '--directory', '--title=Choose a folder for the agent', ...(start ? [`--filename=${start}/`] : [])],
      cancelCodes: [1],
    },
    {
      command: 'kdialog',
      args: ['--getexistingdirectory', start ?? '.', '--title', 'Choose a folder for the agent'],
      cancelCodes: [1],
    },
  ]
}

function run(picker: PickerCommand): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      picker.command,
      picker.args,
      { env: { ...process.env, ...picker.env }, timeout: PICKER_TIMEOUT_MS, windowsHide: true, encoding: 'utf-8' },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT') return reject(new FolderPickerUnavailableError(`${picker.command} not found`))
          if (typeof code === 'number' && picker.cancelCodes.includes(code)) return resolve(null)
          return reject(new Error(`${picker.command} failed: ${stderr.trim() || error.message}`))
        }
        const raw = stdout.trim()
        // osascript ends folders with a slash; keep one only for a root
        const path = raw.length > 1 && !/^[A-Za-z]:[\\/]$/.test(raw) ? raw.replace(/[\\/]$/, '') : raw
        resolve(path || null)
      }
    )
  })
}

let open = false

/** The folder the user chose, or null if they cancelled */
export async function pickFolder(start: string | null): Promise<string | null> {
  if (open) throw new FolderPickerBusyError('A folder dialog is already open on the server.')
  const startDir = start && existsSync(start) && statSync(start).isDirectory() ? start : null
  open = true
  try {
    let lastError: Error | null = null
    for (const picker of pickerCommands(startDir)) {
      try {
        return await run(picker)
      } catch (error) {
        if (!(error instanceof FolderPickerUnavailableError)) throw error
        lastError = error
      }
    }
    throw new FolderPickerUnavailableError(lastError?.message ?? 'No folder dialog is available on this server.')
  } finally {
    open = false
  }
}

/** Not an existing directory */
export class FolderNotFoundError extends Error {}

/** Shows the folder in the desktop's file manager (Explorer, Finder, ...) */
export async function openFolder(path: string): Promise<void> {
  // Explorer needs backslashes; with forward slashes it opens Documents instead
  const folder = resolve(path)
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new FolderNotFoundError(`Folder does not exist: ${folder}`)
  }
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  await new Promise<void>((resolveSpawn, reject) => {
    const child = spawn(command, [folder], { detached: true, stdio: 'ignore' })
    child.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new FolderPickerUnavailableError(`${command} not found`) : error)
    })
    // Explorer's exit code means nothing (it's 1 on success), so only a failure to start counts
    child.once('spawn', () => {
      child.unref()
      resolveSpawn()
    })
  })
}
