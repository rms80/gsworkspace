interface ProcessingOverlayProps {
  x: number
  y: number
  width: number
  height: number
  stageScale: number
  stagePos: { x: number; y: number }
  message?: string
}

/**
 * Semi-transparent overlay with spinner shown during async processing (e.g., video crop).
 */
export default function ProcessingOverlay({
  x,
  y,
  width,
  height,
  stageScale,
  stagePos,
  message = 'Processing video...',
}: ProcessingOverlayProps) {
  const displayWidth = width * stageScale
  const displayHeight = height * stageScale
  const left = x * stageScale + stagePos.x
  const top = y * stageScale + stagePos.y

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: displayWidth,
        height: displayHeight,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid rgba(255, 255, 255, 0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div
        style={{
          marginTop: 12,
          color: 'white',
          fontSize: 14,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {message}
      </div>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}
