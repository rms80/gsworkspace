// CodingRobot is disabled — the Claude Agent SDK integration it depended on
// has changed and is no longer viable. The canvas item type, renderers, and
// storage are preserved, but there is no UI path to enable it.
export function getCodingRobotEnabled(): boolean {
  return false
}

export function setCodingRobotEnabled(_enabled: boolean) {
  // no-op
}
