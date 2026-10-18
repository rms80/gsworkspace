import React from 'react'
import { CodingRobotItem } from '../../../types'
import { COLOR_SELECTED, CODING_ROBOT_THEME } from '../../../constants/canvas'

interface CodingRobotLabelEditingOverlayProps {
  item: CodingRobotItem
  inputRef: React.RefObject<HTMLInputElement>
  stageScale: number
  stagePos: { x: number; y: number }
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

/** Renames a Coding Robot: an input over the label in its header */
export default function CodingRobotLabelEditingOverlay({
  item,
  inputRef,
  stageScale,
  stagePos,
  onBlur,
  onKeyDown,
}: CodingRobotLabelEditingOverlayProps) {
  return (
    <input
      ref={inputRef}
      defaultValue={item.label || 'Coding Robot'}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute',
        top: item.y * stageScale + stagePos.y + 4 * stageScale,
        left: item.x * stageScale + stagePos.x + 6 * stageScale,
        // The label's share of the header; the folder path and button are to its right
        width: item.width * 0.4 * stageScale,
        height: 20 * stageScale,
        fontSize: 14 * stageScale,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        padding: '0 2px',
        margin: 0,
        border: `2px solid ${COLOR_SELECTED}`,
        borderRadius: 2,
        outline: 'none',
        background: CODING_ROBOT_THEME.inputBg,
        color: CODING_ROBOT_THEME.inputText,
        boxSizing: 'border-box',
      }}
    />
  )
}
