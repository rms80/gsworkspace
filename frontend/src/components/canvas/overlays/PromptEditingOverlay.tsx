import { PROMPT_HEADER_HEIGHT, PromptThemeColors } from '../../../constants/canvas'
import { PromptEditing } from '../../../hooks/usePromptEditing'

interface PromptEditingOverlayProps {
  item: { x: number; y: number; width: number; height: number; label: string; text: string; fontSize: number }
  theme: PromptThemeColors
  editing: PromptEditing
  stageScale: number
  stagePos: { x: number; y: number }
}

export default function PromptEditingOverlay({
  item,
  theme,
  editing,
  stageScale,
  stagePos,
}: PromptEditingOverlayProps) {
  return (
    <>
      {editing.editingField === 'label' && (
        <input
          ref={editing.labelInputRef}
          type="text"
          defaultValue={item.label}
          onBlur={editing.handleLabelBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              editing.handleLabelBlur()
            }
            editing.handleKeyDown(e)
          }}
          style={{
            position: 'absolute',
            top: item.y * stageScale + stagePos.y + 4 * stageScale,
            left: item.x * stageScale + stagePos.x + 6 * stageScale,
            width: (item.width - 16) * stageScale,
            height: 20 * stageScale,
            fontSize: 14 * stageScale,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            padding: '0 2px',
            margin: 0,
            border: `2px solid ${theme.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            background: theme.inputBg,
            color: theme.inputText,
            boxSizing: 'border-box',
          }}
        />
      )}

      {editing.editingField === 'text' && (
        <textarea
          ref={editing.textareaRef}
          defaultValue={item.text}
          onBlur={editing.handleTextBlur}
          onKeyDown={editing.handleKeyDown}
          style={{
            position: 'absolute',
            top: (item.y + PROMPT_HEADER_HEIGHT + 6) * stageScale + stagePos.y,
            left: (item.x + 6) * stageScale + stagePos.x,
            width: (item.width - 16) * stageScale,
            height: (item.height - PROMPT_HEADER_HEIGHT - 16) * stageScale,
            fontSize: item.fontSize * stageScale,
            fontFamily: 'sans-serif',
            padding: '2px',
            margin: 0,
            border: `2px solid ${theme.inputBorder}`,
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            background: theme.textareaBg,
            color: theme.contentText,
            boxSizing: 'border-box',
          }}
        />
      )}
    </>
  )
}
