import { CanvasItem } from '../types'
import {
  ChangeRecord,
  ChangeRecordType,
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

  abstract apply(items: CanvasItem[]): CanvasItem[]
  abstract reverse(items: CanvasItem[]): CanvasItem[]
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

  apply(items: CanvasItem[]): CanvasItem[] {
    // Add the object if it doesn't exist
    if (items.find((item) => item.id === this.objectId)) {
      return items
    }
    return [...items, { ...this.object }]
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    // Remove the object
    return items.filter((item) => item.id !== this.objectId)
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

  apply(items: CanvasItem[]): CanvasItem[] {
    // Remove the object
    return items.filter((item) => item.id !== this.objectId)
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    // Restore the object if it doesn't exist
    if (items.find((item) => item.id === this.objectId)) {
      return items
    }
    return [...items, { ...this.object }]
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

  apply(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      return { ...item, ...this.newTransform } as CanvasItem
    })
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      return { ...item, ...this.oldTransform } as CanvasItem
    })
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

  apply(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'text') return item
      return { ...item, text: this.newText }
    })
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'text') return item
      return { ...item, text: this.oldText }
    })
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

  apply(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'prompt' && item.type !== 'image-gen-prompt') return item
      return { ...item, label: this.newLabel, text: this.newText }
    })
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'prompt' && item.type !== 'image-gen-prompt') return item
      return { ...item, label: this.oldLabel, text: this.oldText }
    })
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

  apply(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'prompt' && item.type !== 'image-gen-prompt') return item
      return { ...item, model: this.newModel } as CanvasItem
    })
  }

  reverse(items: CanvasItem[]): CanvasItem[] {
    return items.map((item) => {
      if (item.id !== this.objectId) return item
      if (item.type !== 'prompt' && item.type !== 'image-gen-prompt') return item
      return { ...item, model: this.oldModel } as CanvasItem
    })
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
    case 'update_text':
      return UpdateTextChange.deserialize(record)
    case 'update_prompt':
      return UpdatePromptChange.deserialize(record)
    case 'update_model':
      return UpdateModelChange.deserialize(record)
    default:
      throw new Error(`Unknown change record type: ${record.type}`)
  }
}
