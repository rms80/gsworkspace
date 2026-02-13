import { CanvasItem } from '../types'
import {
  ChangeRecord,
  ChangeRecordType,
  HistoryState,
  SerializedChangeRecord,
  TransformData,
} from './types'

/**
 * Base class with common functionality for change records
 */
abstract class BaseChangeRecord implements ChangeRecord {
  abstract type: ChangeRecordType
  objectId: string
  timestamp: number

  constructor(objectId: string, timestamp?: number) {
    this.objectId = objectId
    this.timestamp = timestamp ?? Date.now()
  }

  abstract apply(state: HistoryState): HistoryState
  abstract reverse(state: HistoryState): HistoryState
  abstract serialize(): SerializedChangeRecord
}

/**
 * Record for adding a new object to the scene
 */
export class AddObjectChange extends BaseChangeRecord {
  type: ChangeRecordType = 'add_object'
  private object: CanvasItem

  constructor(object: CanvasItem, timestamp?: number) {
    super(object.id, timestamp)
    this.object = { ...object }
  }

  apply(state: HistoryState): HistoryState {
    // Add the object if it doesn't exist
    if (state.items.find((item) => item.id === this.objectId)) {
      return state
    }
    return { ...state, items: [...state.items, { ...this.object }] }
  }

  reverse(state: HistoryState): HistoryState {
    // Remove the object
    return { ...state, items: state.items.filter((item) => item.id !== this.objectId) }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { object: this.object },
    }
  }

  static deserialize(record: SerializedChangeRecord): AddObjectChange {
    return new AddObjectChange(
      record.data.object as CanvasItem,
      record.timestamp
    )
  }
}

/**
 * Record for deleting an object from the scene
 */
export class DeleteObjectChange extends BaseChangeRecord {
  type: ChangeRecordType = 'delete_object'
  private object: CanvasItem

  constructor(object: CanvasItem, timestamp?: number) {
    super(object.id, timestamp)
    this.object = { ...object }
  }

  apply(state: HistoryState): HistoryState {
    // Remove the object and deselect it
    return {
      items: state.items.filter((item) => item.id !== this.objectId),
      selectedIds: state.selectedIds.filter((id) => id !== this.objectId),
    }
  }

  reverse(state: HistoryState): HistoryState {
    // Restore the object if it doesn't exist
    if (state.items.find((item) => item.id === this.objectId)) {
      return state
    }
    return { ...state, items: [...state.items, { ...this.object }] }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { object: this.object },
    }
  }

  static deserialize(record: SerializedChangeRecord): DeleteObjectChange {
    return new DeleteObjectChange(
      record.data.object as CanvasItem,
      record.timestamp
    )
  }
}

/**
 * Record for transforming an object (position, size, rotation, scale)
 */
export class TransformObjectChange extends BaseChangeRecord {
  type: ChangeRecordType = 'transform_object'
  private oldTransform: TransformData
  private newTransform: TransformData

  constructor(
    objectId: string,
    oldTransform: TransformData,
    newTransform: TransformData,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldTransform = { ...oldTransform }
    this.newTransform = { ...newTransform }
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        return { ...item, ...this.newTransform } as CanvasItem
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        return { ...item, ...this.oldTransform } as CanvasItem
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: {
        oldTransform: this.oldTransform,
        newTransform: this.newTransform,
      },
    }
  }

  static deserialize(record: SerializedChangeRecord): TransformObjectChange {
    return new TransformObjectChange(
      record.objectId,
      record.data.oldTransform as TransformData,
      record.data.newTransform as TransformData,
      record.timestamp
    )
  }
}

/**
 * Entry for a single item's transform within a batch
 */
export interface TransformEntry {
  objectId: string
  oldTransform: TransformData
  newTransform: TransformData
}

/**
 * Record for transforming multiple objects at once (batch move/resize).
 * Undo/redo applies all transforms as a single operation.
 */
export class TransformObjectsChange extends BaseChangeRecord {
  type: ChangeRecordType = 'transform_objects'
  private entries: TransformEntry[]

  constructor(entries: TransformEntry[], timestamp?: number) {
    super('', timestamp)
    this.entries = entries.map(e => ({
      objectId: e.objectId,
      oldTransform: { ...e.oldTransform },
      newTransform: { ...e.newTransform },
    }))
  }

  apply(state: HistoryState): HistoryState {
    const transformMap = new Map(this.entries.map(e => [e.objectId, e.newTransform]))
    return {
      ...state,
      items: state.items.map((item) => {
        const t = transformMap.get(item.id)
        if (!t) return item
        return { ...item, ...t } as CanvasItem
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    const transformMap = new Map(this.entries.map(e => [e.objectId, e.oldTransform]))
    return {
      ...state,
      items: state.items.map((item) => {
        const t = transformMap.get(item.id)
        if (!t) return item
        return { ...item, ...t } as CanvasItem
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { entries: this.entries },
    }
  }

  static deserialize(record: SerializedChangeRecord): TransformObjectsChange {
    return new TransformObjectsChange(
      record.data.entries as TransformEntry[],
      record.timestamp
    )
  }
}

/**
 * Record for updating text content (for text items)
 */
export class UpdateTextChange extends BaseChangeRecord {
  type: ChangeRecordType = 'update_text'
  private oldText: string
  private newText: string

  constructor(
    objectId: string,
    oldText: string,
    newText: string,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldText = oldText
    this.newText = newText
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'text') return item
        return { ...item, text: this.newText }
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'text') return item
        return { ...item, text: this.oldText }
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { oldText: this.oldText, newText: this.newText },
    }
  }

  static deserialize(record: SerializedChangeRecord): UpdateTextChange {
    return new UpdateTextChange(
      record.objectId,
      record.data.oldText as string,
      record.data.newText as string,
      record.timestamp
    )
  }
}

/**
 * Record for updating prompt content (label and text for prompt/image-gen-prompt items)
 */
export class UpdatePromptChange extends BaseChangeRecord {
  type: ChangeRecordType = 'update_prompt'
  private oldLabel: string
  private oldText: string
  private newLabel: string
  private newText: string

  constructor(
    objectId: string,
    oldLabel: string,
    oldText: string,
    newLabel: string,
    newText: string,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldLabel = oldLabel
    this.oldText = oldText
    this.newLabel = newLabel
    this.newText = newText
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'prompt' && item.type !== 'image-gen-prompt' && item.type !== 'html-gen-prompt') return item
        return { ...item, label: this.newLabel, text: this.newText }
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'prompt' && item.type !== 'image-gen-prompt' && item.type !== 'html-gen-prompt') return item
        return { ...item, label: this.oldLabel, text: this.oldText }
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: {
        oldLabel: this.oldLabel,
        oldText: this.oldText,
        newLabel: this.newLabel,
        newText: this.newText,
      },
    }
  }

  static deserialize(record: SerializedChangeRecord): UpdatePromptChange {
    return new UpdatePromptChange(
      record.objectId,
      record.data.oldLabel as string,
      record.data.oldText as string,
      record.data.newLabel as string,
      record.data.newText as string,
      record.timestamp
    )
  }
}

/**
 * Record for updating model selection (for prompt/image-gen-prompt items)
 */
export class UpdateModelChange extends BaseChangeRecord {
  type: ChangeRecordType = 'update_model'
  private oldModel: string
  private newModel: string

  constructor(
    objectId: string,
    oldModel: string,
    newModel: string,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldModel = oldModel
    this.newModel = newModel
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'prompt' && item.type !== 'image-gen-prompt' && item.type !== 'html-gen-prompt') return item
        return { ...item, model: this.newModel } as CanvasItem
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'prompt' && item.type !== 'image-gen-prompt' && item.type !== 'html-gen-prompt') return item
        return { ...item, model: this.oldModel } as CanvasItem
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { oldModel: this.oldModel, newModel: this.newModel },
    }
  }

  static deserialize(record: SerializedChangeRecord): UpdateModelChange {
    return new UpdateModelChange(
      record.objectId,
      record.data.oldModel as string,
      record.data.newModel as string,
      record.timestamp
    )
  }
}

/**
 * Record for updating name/label (for image and video items)
 */
export class UpdateNameChange extends BaseChangeRecord {
  type: ChangeRecordType = 'update_name'
  private oldName: string | undefined
  private newName: string | undefined

  constructor(
    objectId: string,
    oldName: string | undefined,
    newName: string | undefined,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldName = oldName
    this.newName = newName
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'image' && item.type !== 'video' && item.type !== 'pdf' && item.type !== 'text-file') return item
        return { ...item, name: this.newName } as CanvasItem
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'image' && item.type !== 'video' && item.type !== 'pdf' && item.type !== 'text-file') return item
        return { ...item, name: this.oldName } as CanvasItem
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { oldName: this.oldName, newName: this.newName },
    }
  }

  static deserialize(record: SerializedChangeRecord): UpdateNameChange {
    return new UpdateNameChange(
      record.objectId,
      record.data.oldName as string | undefined,
      record.data.newName as string | undefined,
      record.timestamp
    )
  }
}

/**
 * Record for toggling the minimized state (for PDF items)
 */
export class ToggleMinimizedChange extends BaseChangeRecord {
  type: ChangeRecordType = 'toggle_minimized'
  private oldMinimized: boolean
  private newMinimized: boolean

  constructor(
    objectId: string,
    oldMinimized: boolean,
    newMinimized: boolean,
    timestamp?: number
  ) {
    super(objectId, timestamp)
    this.oldMinimized = oldMinimized
    this.newMinimized = newMinimized
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'pdf' && item.type !== 'text-file') return item
        return { ...item, minimized: this.newMinimized } as CanvasItem
      }),
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      items: state.items.map((item) => {
        if (item.id !== this.objectId) return item
        if (item.type !== 'pdf' && item.type !== 'text-file') return item
        return { ...item, minimized: this.oldMinimized } as CanvasItem
      }),
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { oldMinimized: this.oldMinimized, newMinimized: this.newMinimized },
    }
  }

  static deserialize(record: SerializedChangeRecord): ToggleMinimizedChange {
    return new ToggleMinimizedChange(
      record.objectId,
      record.data.oldMinimized as boolean,
      record.data.newMinimized as boolean,
      record.timestamp
    )
  }
}

/**
 * Record for changing the selection state
 */
export class SelectionChange extends BaseChangeRecord {
  type: ChangeRecordType = 'selection'
  private oldSelectedIds: string[]
  private newSelectedIds: string[]

  constructor(
    oldSelectedIds: string[],
    newSelectedIds: string[],
    timestamp?: number
  ) {
    super('', timestamp) // No specific object ID for selection changes
    this.oldSelectedIds = [...oldSelectedIds]
    this.newSelectedIds = [...newSelectedIds]
  }

  apply(state: HistoryState): HistoryState {
    return {
      ...state,
      selectedIds: [...this.newSelectedIds],
    }
  }

  reverse(state: HistoryState): HistoryState {
    return {
      ...state,
      selectedIds: [...this.oldSelectedIds],
    }
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: {
        oldSelectedIds: this.oldSelectedIds,
        newSelectedIds: this.newSelectedIds,
      },
    }
  }

  static deserialize(record: SerializedChangeRecord): SelectionChange {
    return new SelectionChange(
      record.data.oldSelectedIds as string[],
      record.data.newSelectedIds as string[],
      record.timestamp
    )
  }
}

/**
 * Record that wraps multiple sub-records into one undo/redo step
 */
export class MultiStepChange extends BaseChangeRecord {
  type: ChangeRecordType = 'multi_step'
  private changes: ChangeRecord[]

  constructor(changes: ChangeRecord[], timestamp?: number) {
    super('', timestamp)
    this.changes = changes
  }

  apply(state: HistoryState): HistoryState {
    return this.changes.reduce((s, change) => change.apply(s), state)
  }

  reverse(state: HistoryState): HistoryState {
    return [...this.changes].reverse().reduce((s, change) => change.reverse(s), state)
  }

  serialize(): SerializedChangeRecord {
    return {
      type: this.type,
      objectId: this.objectId,
      timestamp: this.timestamp,
      data: { changes: this.changes.map((c) => c.serialize()) },
    }
  }

  static deserialize(record: SerializedChangeRecord): MultiStepChange {
    const subRecords = (record.data.changes as SerializedChangeRecord[]).map(
      (r) => deserializeChangeRecord(r)
    )
    return new MultiStepChange(subRecords, record.timestamp)
  }
}

/**
 * Deserialize a change record from its serialized form
 */
export function deserializeChangeRecord(
  record: SerializedChangeRecord
): ChangeRecord {
  switch (record.type) {
    case 'add_object':
      return AddObjectChange.deserialize(record)
    case 'delete_object':
      return DeleteObjectChange.deserialize(record)
    case 'transform_object':
      return TransformObjectChange.deserialize(record)
    case 'transform_objects':
      return TransformObjectsChange.deserialize(record)
    case 'update_text':
      return UpdateTextChange.deserialize(record)
    case 'update_prompt':
      return UpdatePromptChange.deserialize(record)
    case 'update_model':
      return UpdateModelChange.deserialize(record)
    case 'update_name':
      return UpdateNameChange.deserialize(record)
    case 'toggle_minimized':
      return ToggleMinimizedChange.deserialize(record)
    case 'selection':
      return SelectionChange.deserialize(record)
    case 'multi_step':
      return MultiStepChange.deserialize(record)
    default:
      throw new Error(`Unknown change record type: ${record.type}`)
  }
}
