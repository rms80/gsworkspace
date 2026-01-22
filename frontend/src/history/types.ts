import { CanvasItem } from '../types'

/**
 * Type identifiers for different change records
 */
export type ChangeRecordType =
  | 'add_object'
  | 'delete_object'
  | 'transform_object'
  | 'update_text'
  | 'update_prompt'
  | 'update_model'

/**
 * Interface for change records that can be undone/redone
 */
export interface ChangeRecord {
  /** Type identifier for serialization */
  type: ChangeRecordType
  /** ID of the object this change applies to */
  objectId: string
  /** Timestamp when the change was made */
  timestamp: number

  /**
   * Apply this change (redo)
   * @param items Current scene items
   * @returns Updated scene items
   */
  apply(items: CanvasItem[]): CanvasItem[]

  /**
   * Reverse this change (undo)
   * @param items Current scene items
   * @returns Updated scene items
   */
  reverse(items: CanvasItem[]): CanvasItem[]

  /**
   * Serialize this change record to a plain object for JSON storage
   */
  serialize(): SerializedChangeRecord
}

/**
 * Serialized format for change records (JSON-compatible)
 */
export interface SerializedChangeRecord {
  type: ChangeRecordType
  objectId: string
  timestamp: number
  data: Record<string, unknown>
}

/**
 * Serialized format for the history stack
 */
export interface SerializedHistory {
  records: SerializedChangeRecord[]
  currentIndex: number
}

/**
 * Transform data for position, scale, rotation changes
 */
export interface TransformData {
  x?: number
  y?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
}
