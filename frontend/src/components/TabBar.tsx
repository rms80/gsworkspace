import { Scene } from '../types'

interface TabBarProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onRenameScene: (id: string, name: string) => void
  onCloseScene: (id: string) => void
}

function TabBar({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onRenameScene,
  onCloseScene,
}: TabBarProps) {
  const handleDoubleClick = (scene: Scene) => {
    const newName = prompt('Rename scene:', scene.name)
    if (newName && newName.trim()) {
      onRenameScene(scene.id, newName.trim())
    }
  }

  const handleClose = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation()
    onCloseScene(sceneId)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        backgroundColor: '#e0e0e0',
        borderBottom: '1px solid #ccc',
        padding: '8px 8px 0 8px',
        gap: '4px',
        overflowX: 'auto',
        minHeight: '40px',
      }}
    >
      {scenes.map((scene) => (
        <div
          key={scene.id}
          onClick={() => onSelectScene(scene.id)}
          onDoubleClick={() => handleDoubleClick(scene)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: scene.id === activeSceneId ? '#fff' : '#f0f0f0',
            border: '1px solid #ccc',
            borderBottom: scene.id === activeSceneId ? '1px solid #fff' : '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            marginBottom: '-1px',
            cursor: 'pointer',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{scene.name}</span>
          <button
            onClick={(e) => handleClose(e, scene.id)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: '14px',
              color: '#888',
              lineHeight: 1,
            }}
            title="Close scene"
          >
            x
          </button>
        </div>
      ))}
      <button
        onClick={onAddScene}
        style={{
          padding: '6px 12px',
          marginBottom: '4px',
          backgroundColor: '#f0f0f0',
          border: '1px solid #ccc',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
        title="Add new scene"
      >
        +
      </button>
    </div>
  )
}

export default TabBar
