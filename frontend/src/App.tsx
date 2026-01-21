import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import InfiniteCanvas from './components/InfiniteCanvas'
import Toolbar from './components/Toolbar'
import { CanvasItem } from './types'

function App() {
  const [items, setItems] = useState<CanvasItem[]>([])

  const addTextItem = useCallback(() => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      text: 'Double-click to edit',
      fontSize: 16,
      width: 200,
      height: 100,
    }
    setItems((prev) => [...prev, newItem])
  }, [])

  const addImageItem = useCallback((src: string, width: number, height: number) => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'image',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      src,
      width,
      height,
    }
    setItems((prev) => [...prev, newItem])
  }, [])

  const addTextAt = useCallback((x: number, y: number, text: string) => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x,
      y,
      text,
      fontSize: 16,
      width: 200,
      height: 100,
    }
    setItems((prev) => [...prev, newItem])
  }, [])

  const addImageAt = useCallback((x: number, y: number, src: string, width: number, height: number) => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'image',
      x,
      y,
      src,
      width,
      height,
    }
    setItems((prev) => [...prev, newItem])
  }, [])

  const updateItem = useCallback((id: string, changes: Partial<CanvasItem>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? ({ ...item, ...changes } as CanvasItem) : item
      )
    )
  }, [])

  const deleteSelected = useCallback(() => {
    setItems((prev) => prev.filter((item) => !item.selected))
  }, [])

  const selectItems = useCallback((ids: string[]) => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, selected: ids.includes(item.id) }))
    )
  }, [])

  const getSelectedItems = useCallback(() => {
    return items.filter((item) => item.selected)
  }, [items])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        onAddText={addTextItem}
        onAddImage={addImageItem}
        onDelete={deleteSelected}
        onSendToLLM={() => {
          const selected = getSelectedItems()
          console.log('Send to LLM:', selected)
          // TODO: Implement LLM integration
        }}
        hasSelection={items.some((item) => item.selected)}
      />
      <InfiniteCanvas
        items={items}
        onUpdateItem={updateItem}
        onSelectItems={selectItems}
        onAddTextAt={addTextAt}
        onAddImageAt={addImageAt}
        onDeleteSelected={deleteSelected}
      />
    </div>
  )
}

export default App
