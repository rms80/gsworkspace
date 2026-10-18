import { CliNotFoundError, runCli } from './cliRunner.js'

/**
 * Detects which agent CLIs (Claude Code, Codex) the server can use: installed, logged in, and not
 * disabled in .env. Needs no configuration; GSWS_DISABLE_CLAUDE_CODE / GSWS_DISABLE_CODEX turn one off.
 * Results are cached briefly, so installing or logging in to a CLI is picked up without a restart.
 */

export type CliName = 'claude-code' | 'codex'

export interface CliStatus {
  available: boolean
  disabled: boolean
  version?: string
  /** Why it isn't available */
  problem?: string
}

interface CliSpec {
  label: string
  commandEnvVar: string
  defaultCommand: string
  disableEnvVar: string
  versionArgs: string[]
  loginArgs: string[]
  isLoggedIn(stdout: string, exitCode: number | null): boolean
  loginHint: string
}

const SPECS: Record<CliName, CliSpec> = {
  'claude-code': {
    label: 'Claude Code',
    commandEnvVar: 'GSWS_CLAUDE_CODE_PATH',
    defaultCommand: 'claude',
    disableEnvVar: 'GSWS_DISABLE_CLAUDE_CODE',
    versionArgs: ['--version'],
    loginArgs: ['auth', 'status'],
    isLoggedIn(stdout) {
      try {
        return JSON.parse(stdout).loggedIn === true
      } catch {
        return false
      }
    },
    loginHint: 'run "claude" on the server and log in',
  },
  codex: {
    label: 'Codex',
    commandEnvVar: 'GSWS_CODEX_PATH',
    defaultCommand: 'codex',
    disableEnvVar: 'GSWS_DISABLE_CODEX',
    versionArgs: ['--version'],
    loginArgs: ['login', 'status'],
    isLoggedIn: (_stdout, exitCode) => exitCode === 0,
    loginHint: 'run "codex login" on the server',
  },
}

export const CLI_NAMES = Object.keys(SPECS) as CliName[]

const CHECK_TIMEOUT_MS = 20000
const MAX_AGE_MS = 60000

export function cliLabel(name: CliName): string {
  return SPECS[name].label
}

export function cliCommand(name: CliName): string {
  return process.env[SPECS[name].commandEnvVar] || SPECS[name].defaultCommand
}

export function cliCommandEnvVar(name: CliName): string {
  return SPECS[name].commandEnvVar
}

function isTruthy(value: string | undefined): boolean {
  return !!value && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

async function check(name: CliName): Promise<CliStatus> {
  const spec = SPECS[name]
  if (isTruthy(process.env[spec.disableEnvVar])) {
    return { available: false, disabled: true, problem: `disabled by ${spec.disableEnvVar}` }
  }
  const run = (args: string[]) => runCli({
    name: spec.label,
    command: cliCommand(name),
    commandEnvVar: spec.commandEnvVar,
    args,
    // Check the login the provider will use (see claudeCode.ts)
    env: { ANTHROPIC_API_KEY: undefined },
    timeoutMs: CHECK_TIMEOUT_MS,
  })
  try {
    const version = await run(spec.versionArgs)
    if (version.exitCode !== 0) {
      return { available: false, disabled: false, problem: `"${cliCommand(name)} ${spec.versionArgs.join(' ')}" failed` }
    }
    const versionLine = version.stdout.trim().split('\n')[0]
    const versionText = versionLine.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? versionLine
    const login = await run(spec.loginArgs)
    if (!spec.isLoggedIn(login.stdout, login.exitCode)) {
      return { available: false, disabled: false, version: versionText, problem: `not logged in (${spec.loginHint})` }
    }
    return { available: true, disabled: false, version: versionText }
  } catch (error) {
    if (error instanceof CliNotFoundError) {
      return { available: false, disabled: false, problem: `not installed ("${cliCommand(name)}" not found; install it or set ${spec.commandEnvVar})` }
    }
    return { available: false, disabled: false, problem: error instanceof Error ? error.message : String(error) }
  }
}

let statuses: Record<CliName, CliStatus> | null = null
let checkedAt = 0
let pending: Promise<Record<CliName, CliStatus>> | null = null

/** The status of every CLI, re-checked if the last check is older than MAX_AGE_MS */
export function detectClis(): Promise<Record<CliName, CliStatus>> {
  if (statuses && Date.now() - checkedAt < MAX_AGE_MS) return Promise.resolve(statuses)
  pending ??= (async () => {
    const results = await Promise.all(CLI_NAMES.map(check))
    const next = Object.fromEntries(CLI_NAMES.map((name, i) => [name, results[i]])) as Record<CliName, CliStatus>
    logChanges(statuses, next)
    statuses = next
    checkedAt = Date.now()
    pending = null
    return next
  })()
  return pending
}

/** The last detected status (detectClis must have run) */
export function cliStatus(name: CliName): CliStatus {
  return statuses?.[name] ?? { available: false, disabled: false, problem: 'not checked yet' }
}

export function cliUnavailableReason(name: CliName): string {
  return `${SPECS[name].label}: ${cliStatus(name).problem ?? 'not available'}`
}

function describe(name: CliName, status: CliStatus): string {
  const version = status.version ? ` ${status.version}` : ''
  return `${SPECS[name].label}${version}: ${status.available ? 'available' : status.problem}`
}

function logChanges(previous: Record<CliName, CliStatus> | null, next: Record<CliName, CliStatus>) {
  const changed = CLI_NAMES.filter((name) => describe(name, next[name]) !== (previous && describe(name, previous[name])))
  if (changed.length > 0) {
    console.log(`[LLM] ${changed.map((name) => describe(name, next[name])).join(' | ')}`)
  }
}
