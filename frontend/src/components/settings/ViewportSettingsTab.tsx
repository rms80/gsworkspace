import { useState } from 'react'
import { getSnapEnabled, setSnapEnabled, getGridSize, setGridSize } from '../../utils/grid'

export default function ViewportSettingsTab() {
  const [snapOn, setSnapOn] = useState(getSnapEnabled)
  const [gridSizeStr, setGridSizeStr] = useState(() => String(getGridSize()))

  const handleSnapToggle = (checked: boolean) => {
    setSnapOn(checked)
    setSnapEnabled(checked)
  }

  const handleGridSizeChange = (raw: string) => {
    setGridSizeStr(raw)
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 1 && n <= 1000) {
      setGridSize(n)
    }
  }

  const gridSizeNum = parseInt(gridSizeStr, 10)
  const gridSizeValid = !isNaN(gridSizeNum) && gridSizeNum >= 1 && gridSizeNum <= 1000

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Grid snapping toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{ fontWeight: 600, color: '#333' }}
          title="When enabled, items snap to the nearest grid point when moved or resized."
        >
          Grid snapping
        </span>
        <input
          type="checkbox"
          checked={snapOn}
          onChange={(e) => handleSnapToggle(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          title="When enabled, items snap to the nearest grid point when moved or resized."
        />
      </div>

      {/* Grid size input */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{ fontWeight: 600, color: '#333' }}
          title="The spacing between grid points in pixels. Integer from 1 to 1000."
        >
          Grid size (px)
        </span>
        <div>
          <input
            type="text"
            inputMode="numeric"
            value={gridSizeStr}
            onChange={(e) => handleGridSizeChange(e.target.value)}
            title="The spacing between grid points in pixels. Integer from 1 to 1000."
            style={{
              width: '80px',
              padding: '6px 10px',
              border: `1px solid ${gridSizeValid ? '#ccc' : '#d32f2f'}`,
              borderRadius: '4px',
              fontSize: '14px',
              textAlign: 'right',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </div>
  )
}
