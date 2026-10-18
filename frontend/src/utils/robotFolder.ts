import { FolderPickerUnavailableError, pickServerFolder } from '../api/agentSessions'

/**
 * Choosing a Coding Robot's working folder. Paths are on the server, so the folder dialog is shown
 * by the server (which works when it runs on this desktop); otherwise the path is typed in
 * (CodingRobotFolderPopup).
 */

export const normalizeFolder = (path: string) => path.trim().replace(/\\/g, '/')

export type FolderPickResult =
  | { status: 'picked'; folder: string }
  | { status: 'cancelled' }
  /** No dialog on this server; type the path instead */
  | { status: 'unavailable' }
  | { status: 'failed'; message: string }

/** Shows the server's folder dialog, starting in `current` */
export async function pickRobotFolder(current: string): Promise<FolderPickResult> {
  try {
    const picked = await pickServerFolder(current || null)
    return picked === null ? { status: 'cancelled' } : { status: 'picked', folder: normalizeFolder(picked) }
  } catch (error) {
    if (error instanceof FolderPickerUnavailableError) return { status: 'unavailable' }
    return { status: 'failed', message: error instanceof Error ? error.message : 'The folder dialog failed.' }
  }
}

/**
 * Whether the browser is on the server's machine (so the server's desktop is the user's): the
 * page is served from a loopback address. The server checks too, as a proxy could be in between.
 */
export function browserIsOnServer(): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname)
}

/** Copies text to the clipboard; resolves false if the browser refused */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The async clipboard needs a secure context (https or localhost); fall back to a selection
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  }
}
