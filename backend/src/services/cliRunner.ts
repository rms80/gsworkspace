import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { delimiter, extname, join } from 'path'

/**
 * Runs an AI coding agent's CLI (Claude Code, Codex, ...) as a single-shot headless query.
 *
 * Each run gets a fresh, empty temp directory as its working directory, so the agent picks up no
 * project instructions or settings, and anything the CLI needs as files (a system prompt,
 * attachments) is written there first. The directory is deleted afterwards.
 */

const DEFAULT_TIMEOUT_SECONDS = 600

/** An error whose message is fit to show the user */
export class CliError extends Error {}

/** The CLI isn't installed (or not where its env var says) */
export class CliNotFoundError extends CliError {}

export interface CliRunOptions {
  /** Used in error messages, e.g. 'Claude Code' */
  name: string
  command: string
  /** Env var that sets `command`, named in the error when the command isn't found */
  commandEnvVar: string
  /** Arguments, or a function of the working directory that returns them (for absolute file paths) */
  args: string[] | ((cwd: string) => string[])
  /** Files to create in the working directory, by name */
  files?: Record<string, string | Buffer>
  /** Files the CLI writes in the working directory to read back into the result, by name */
  outputFiles?: string[]
  stdin?: string
  /** Changes to the CLI's environment (inherited from the server); undefined removes a variable */
  env?: Record<string, string | undefined>
  signal?: AbortSignal
  /** Defaults to GSWS_CLI_TIMEOUT_SECONDS */
  timeoutMs?: number
}

export interface CliRunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  /** Contents of the requested outputFiles that exist, by name */
  outputFiles: Record<string, string>
}

function defaultTimeoutMs(): number {
  const seconds = Number(process.env.GSWS_CLI_TIMEOUT_SECONDS)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TIMEOUT_SECONDS) * 1000
}

/**
 * On Windows, finds a bare command name on the PATH with its extension. spawn only finds .exe
 * files by itself, and npm installs CLIs as .cmd shims.
 */
function resolveCommand(command: string): string {
  if (process.platform !== 'win32' || extname(command) || /[\\/]/.test(command)) return command
  const extensions = ['.exe', '.cmd', '.bat']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext)
      if (dir && existsSync(candidate)) return candidate
    }
  }
  return command
}

// .cmd and .bat files only run through a shell
function needsShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
}

function quoteForCmd(arg: string): string {
  return /^[\w.:/\\=@-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`
}

export async function runCli(options: CliRunOptions): Promise<CliRunResult> {
  const { name, signal } = options
  if (signal?.aborted) throw abortError()

  const command = resolveCommand(options.command)
  const cwd = await mkdtemp(join(tmpdir(), 'gsworkspace-cli-'))
  try {
    for (const [file, content] of Object.entries(options.files ?? {})) {
      await writeFile(join(cwd, file), content)
    }
    const args = typeof options.args === 'function' ? options.args(cwd) : options.args

    const result = await new Promise<Omit<CliRunResult, 'outputFiles'>>((resolve, reject) => {
      const shell = needsShell(command)
      const env = { ...process.env }
      for (const [key, value] of Object.entries(options.env ?? {})) {
        if (value === undefined) delete env[key]
        else env[key] = value
      }
      // Through a shell, pass one command line, already quoted
      const child = spawn(shell ? [command, ...args].map(quoteForCmd).join(' ') : command, shell ? [] : args, {
        cwd,
        env,
        shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let failure: Error | null = null
      child.stdout.setEncoding('utf-8').on('data', (chunk: string) => { stdout += chunk })
      child.stderr.setEncoding('utf-8').on('data', (chunk: string) => { stderr += chunk })

      const kill = (error: Error) => {
        failure ??= error
        // Kill the whole tree: through a shell, child is only the shell
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
        } else {
          child.kill('SIGKILL')
        }
      }

      const timeout = options.timeoutMs ?? defaultTimeoutMs()
      const timer = setTimeout(() => kill(new CliError(`${name} timed out after ${timeout / 1000}s.`)), timeout)
      const onAbort = () => kill(abortError())
      signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }

      child.on('error', (error: NodeJS.ErrnoException) => {
        cleanup()
        reject(error.code === 'ENOENT'
          ? new CliNotFoundError(`${name} CLI not found ("${options.command}"). Install it on the server or set ${options.commandEnvVar} in the backend .env file.`)
          : error)
      })
      child.on('close', (exitCode) => {
        cleanup()
        if (failure) reject(failure)
        else resolve({ stdout, stderr, exitCode })
      })

      // The CLI may exit before reading all its input; that shows up as an exit code, not here
      child.stdin.on('error', () => {})
      child.stdin.end(options.stdin ?? '')
    })

    const outputFiles: Record<string, string> = {}
    for (const file of options.outputFiles ?? []) {
      const content = await readFile(join(cwd, file), 'utf-8').catch(() => null)
      if (content !== null) outputFiles[file] = content
    }
    return { ...result, outputFiles }
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => {})
  }
}

function abortError(): Error {
  const error = new Error('Request aborted')
  error.name = 'AbortError'
  return error
}
