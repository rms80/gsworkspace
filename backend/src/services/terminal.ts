import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Opens a terminal window on the server's desktop that runs a command in a folder, for continuing
 * an agent session interactively. Like the folder dialog, only of use to a browser on the server
 * machine. The window stays open (at a shell) after the command exits.
 */

/** No terminal can be opened on this server */
export class TerminalUnavailableError extends Error {}

export interface TerminalCommand {
  /** Window title */
  title: string
  cwd: string
  command: string
  args: string[]
  /** Environment variables to clear first */
  unset?: string[]
}

/** Starts a detached process; resolves once it has started */
function launch(command: string, args: string[], options: { windowsVerbatimArguments?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', ...options })
    child.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new TerminalUnavailableError(`${command} not found`) : error)
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

function posixScript(cmd: TerminalCommand): string {
  return [
    `cd ${shellQuote(cmd.cwd)}`,
    ...(cmd.unset ?? []).map((name) => `unset ${name}`),
    [cmd.command, ...cmd.args].map(shellQuote).join(' '),
  ].join(' && ')
}

async function openWindows(cmd: TerminalCommand, scriptName: string): Promise<void> {
  // A batch file avoids quoting the command through wt/start and cmd's own rules. It's left in
  // place, as cmd reads batch files as it runs them.
  const dir = join(tmpdir(), 'gsworkspace-terminal')
  await mkdir(dir, { recursive: true })
  const script = join(dir, `${scriptName}.cmd`)
  const quote = (value: string) => `"${value.replace(/"/g, '')}"`
  await writeFile(script, [
    '@echo off',
    ...(cmd.unset ?? []).map((name) => `set ${name}=`),
    `cd /d ${quote(cmd.cwd)}`,
    // call works for both .exe and .cmd commands
    `call ${[quote(cmd.command), ...cmd.args.map(quote)].join(' ')}`,
    '',
  ].join('\r\n'))

  const wt = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'wt.exe')
  if (process.env.LOCALAPPDATA && existsSync(wt)) {
    // wt splits commands at ';', and a trailing backslash would escape the closing quote
    const title = quote(cmd.title.replace(/;/g, ','))
    const dir = quote(cmd.cwd.replace(/\\$/, '\\.'))
    await launch(wt, ['-w', 'new', '--title', title, '-d', dir, 'cmd.exe', '/k', quote(script)], { windowsVerbatimArguments: true })
  } else {
    await launch('cmd.exe', ['/c', 'start', quote(cmd.title), 'cmd.exe', '/k', quote(script)], { windowsVerbatimArguments: true })
  }
}

async function openMac(cmd: TerminalCommand): Promise<void> {
  const appleString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  await launch('osascript', [
    '-e', `tell application "Terminal" to do script ${appleString(posixScript(cmd))}`,
    '-e', 'tell application "Terminal" to activate',
  ])
}

async function openLinux(cmd: TerminalCommand): Promise<void> {
  // Keep a shell open once the command exits
  const script = `${posixScript(cmd)}; exec "\${SHELL:-bash}"`
  const terminals: [string, string[]][] = [
    ['gnome-terminal', [`--title=${cmd.title}`, `--working-directory=${cmd.cwd}`, '--', 'bash', '-c', script]],
    ['konsole', ['--workdir', cmd.cwd, '-e', 'bash', '-c', script]],
    ['xterm', ['-T', cmd.title, '-e', 'bash', '-c', script]],
  ]
  for (const [command, args] of terminals) {
    try {
      return await launch(command, args)
    } catch (error) {
      if (!(error instanceof TerminalUnavailableError)) throw error
    }
  }
  throw new TerminalUnavailableError('no terminal found (tried gnome-terminal, konsole, xterm)')
}

/** Opens the terminal; `scriptName` names the Windows batch file (reused for the same name) */
export async function openTerminal(cmd: TerminalCommand, scriptName: string): Promise<void> {
  if (process.platform === 'win32') return openWindows(cmd, scriptName)
  if (process.platform === 'darwin') return openMac(cmd)
  return openLinux(cmd)
}
