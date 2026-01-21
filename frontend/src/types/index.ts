export interface Point {
  x: number
  y: number
}

export interface BaseItem {
  id: string
  x: number
  y: number
  selected?: boolean
}

export interface TextItem extends BaseItem {
  type: 'text'
  text: string
  fontSize: number
  width: number
}

export interface ImageItem extends BaseItem {
  type: 'image'
  src: string
  width: number
  height: number
}

export type CanvasItem = TextItem | ImageItem

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}
