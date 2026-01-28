import { Z_MENU } from '../../../constants/canvas'

interface ModelSelectorMenuProps<M extends string> {
  position: { x: number; y: number }
  models: M[]
  labels: Record<M, string>
  selectedModel: M | undefined
  onSelect: (model: M) => void
}

export default function ModelSelectorMenu<M extends string>({
  position,
  models,
  labels,
  selectedModel,
  onSelect,
}: ModelSelectorMenuProps<M>) {
  return (
    <div
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: Z_MENU,
        minWidth: 100,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {models.map((model) => {
        const isSelected = model === selectedModel
        return (
          <button
            key={model}
            onClick={() => onSelect(model)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: isSelected ? '#e8e8e8' : 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: isSelected ? 'bold' : 'normal',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? '#e0e0e0' : '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? '#e8e8e8' : 'none')}
          >
            {labels[model]}
          </button>
        )
      })}
    </div>
  )
}
