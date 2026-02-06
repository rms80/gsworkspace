import { validate } from 'uuid'

/** Throw if value is not a valid UUID. Used to guard URL construction. */
export function validateUuid(value: string, label: string): void {
  if (!validate(value)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}
