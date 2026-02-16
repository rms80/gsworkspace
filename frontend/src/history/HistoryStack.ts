import { ChangeRecord, HistoryState, SerializedHistory, SerializedChangeRecord } from './types'
import { deserializeChangeRecord } from './changeRecords'

const MAX_HISTORY_SIZE = 100

/**
 * Manages a stack of change records for undo/redo functionality
 */
export class HistoryStack {
  private records: ChangeRecord[] = []
  private currentIndex: number = -1
  private maxSize: number

  constructor(maxSize: number = MAX_HISTORY_SIZE) {
    this.maxSize = maxSize
  }

  /**
   * Push a new change record onto the stack
   * This will truncate any "future" records if we're not at the end
   */
  push(record: ChangeRecord): void {
    // Truncate any records after current index (discard redo history)
    if (this.currentIndex < this.records.length - 1) {
      this.records = this.records.slice(0, this.currentIndex + 1)
    }

    // Add the new record
    this.records.push(record)
    this.currentIndex = this.records.length - 1

    // Enforce max size by removing oldest records
    if (this.records.length > this.maxSize) {
      const overflow = this.records.length - this.maxSize
      this.records = this.records.slice(overflow)
      this.currentIndex -= overflow
    }
  }

  /**
   * Undo the current change
   * @param state Current scene state (items + selection)
   * @returns Updated scene state, or null if nothing to undo
   */
  undo(state: HistoryState): HistoryState | null {
    if (!this.canUndo()) return null

    const record = this.records[this.currentIndex]
    this.currentIndex--

    return record.reverse(state)
  }

  /**
   * Redo the next change
   * @param state Current scene state (items + selection)
   * @returns Updated scene state, or null if nothing to redo
   */
  redo(state: HistoryState): HistoryState | null {
    if (!this.canRedo()) return null

    this.currentIndex++
    const record = this.records[this.currentIndex]

    return record.apply(state)
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.records.length - 1
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.records = []
    this.currentIndex = -1
  }

  /**
   * Get the number of records in the stack
   */
  get length(): number {
    return this.records.length
  }

  /**
   * Create a clone of this history stack
   * Used for immutable state updates in React
   */
  clone(): HistoryStack {
    const cloned = new HistoryStack(this.maxSize)
    cloned.records = [...this.records]
    cloned.currentIndex = this.currentIndex
    return cloned
  }

  /**
   * Serialize the history stack to a plain object
   */
  serialize(): SerializedHistory {
    // Only save records up to the current position — discard future (redo) history
    const activeRecords = this.records.slice(0, this.currentIndex + 1)
    return {
      records: activeRecords.map((record) => record.serialize()),
      currentIndex: this.currentIndex,
    }
  }

  /**
   * Serialize the full history stack including future (redo) records.
   * Used for debug display only.
   */
  serializeFull(): SerializedHistory {
    return {
      records: this.records.map((record) => record.serialize()),
      currentIndex: this.currentIndex,
    }
  }

  /**
   * Deserialize a history stack from a plain object
   */
  static deserialize(data: SerializedHistory, maxSize?: number): HistoryStack {
    const stack = new HistoryStack(maxSize)
    stack.records = data.records.map((record: SerializedChangeRecord) =>
      deserializeChangeRecord(record)
    )
    stack.currentIndex = data.currentIndex
    return stack
  }
}
