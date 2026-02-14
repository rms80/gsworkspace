import localforage from 'localforage'
import { ActivityMessage } from '../types'

// Separate localforage instance so activity data is independent of scene storage
const store = localforage.createInstance({
  name: 'gsworkspace',
  storeName: 'codingRobotActivity',
})

const KEY_PREFIX = 'activity:'
const ACTIVE_SUFFIX = ':active'
const REQUEST_SUFFIX = ':requestId'

function stepsKey(itemId: string): string {
  return `${KEY_PREFIX}${itemId}`
}

function activeKey(itemId: string): string {
  return `${KEY_PREFIX}${itemId}${ACTIVE_SUFFIX}`
}

/** Save completed steps for an item. */
export async function saveActivitySteps(itemId: string, steps: ActivityMessage[][]): Promise<void> {
  await store.setItem(stepsKey(itemId), steps)
}

/** Save the in-progress (active) step for HMR/reload survival. */
export async function saveActiveStep(itemId: string, step: ActivityMessage[]): Promise<void> {
  await store.setItem(activeKey(itemId), step)
}

/** Clear the active step marker (called when a step finishes). */
export async function clearActiveStep(itemId: string): Promise<void> {
  await store.removeItem(activeKey(itemId))
}

/**
 * Load all activity for an item.
 * Merges completed steps with any active step that was interrupted (HMR/reload).
 */
export async function loadActivity(itemId: string): Promise<ActivityMessage[][] | null> {
  const steps = await store.getItem<ActivityMessage[][]>(stepsKey(itemId))
  const active = await store.getItem<ActivityMessage[]>(activeKey(itemId))

  if (!steps && !active) return null

  const result = steps ? [...steps] : []

  // If there was an active step that got interrupted, append it
  if (active && active.length > 0) {
    // Check if the last completed step is the same as the active one
    // (could happen if the step was saved both as active and completed)
    const lastStep = result[result.length - 1]
    if (!lastStep || lastStep.length !== active.length || lastStep[0]?.id !== active[0]?.id) {
      result.push(active)
    }
    // Clean up — the active step has been merged
    await store.removeItem(activeKey(itemId))
  }

  return result.length > 0 ? result : null
}

/** Save the activeRequestId for HMR survival. */
export async function saveActiveRequestId(itemId: string, requestId: string): Promise<void> {
  await store.setItem(`${KEY_PREFIX}${itemId}${REQUEST_SUFFIX}`, requestId)
}

/** Load the activeRequestId (returns null if not set). */
export async function loadActiveRequestId(itemId: string): Promise<string | null> {
  return store.getItem<string>(`${KEY_PREFIX}${itemId}${REQUEST_SUFFIX}`)
}

/** Clear the activeRequestId. */
export async function clearActiveRequestId(itemId: string): Promise<void> {
  await store.removeItem(`${KEY_PREFIX}${itemId}${REQUEST_SUFFIX}`)
}

/** Remove all activity data for an item. */
export async function deleteActivity(itemId: string): Promise<void> {
  await store.removeItem(stepsKey(itemId))
  await store.removeItem(activeKey(itemId))
  await store.removeItem(`${KEY_PREFIX}${itemId}${REQUEST_SUFFIX}`)
}
