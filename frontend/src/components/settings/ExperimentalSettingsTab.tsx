import { useState } from 'react'
import { getCodingRobotEnabled, setCodingRobotEnabled } from '../../utils/experimentalSettings'

export default function ExperimentalSettingsTab() {
  const [codingRobot, setCodingRobot] = useState(getCodingRobotEnabled)

  const handleToggle = (checked: boolean) => {
    setCodingRobot(checked)
    setCodingRobotEnabled(checked)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{ fontWeight: 600, color: '#333' }}
          title="Enable the Coding Robot item type in the Add menu and right-click context menu."
        >
          Coding Robot
        </span>
        <input
          type="checkbox"
          checked={codingRobot}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          title="Enable the Coding Robot item type in the Add menu and right-click context menu."
        />
      </div>
    </div>
  )
}
