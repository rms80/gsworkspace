import { useState, useEffect, RefObject } from 'react'
import Konva from 'konva'

interface UsePulseAnimationParams {
  runningPromptIds: Set<string>
  runningImageGenPromptIds: Set<string>
  runningHtmlGenPromptIds: Set<string>
  runningCodingRobotIds: Set<string>
  layerRef: RefObject<Konva.Layer | null>
}

export interface PulseAnimation {
  pulsePhase: number
}

export function usePulseAnimation({
  runningPromptIds,
  runningImageGenPromptIds,
  runningHtmlGenPromptIds,
  runningCodingRobotIds,
  layerRef,
}: UsePulseAnimationParams): PulseAnimation {
  const [pulsePhase, setPulsePhase] = useState(0)

  // Pulse animation loop
  useEffect(() => {
    if (runningPromptIds.size === 0 && runningImageGenPromptIds.size === 0 && runningHtmlGenPromptIds.size === 0 && runningCodingRobotIds.size === 0) {
      setPulsePhase(0)
      return
    }

    let animationId: number
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000
      lastTime = currentTime
      setPulsePhase((prev) => (prev + delta * 3) % (Math.PI * 2)) // ~2 second full cycle
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationId)
  }, [runningPromptIds.size, runningImageGenPromptIds.size, runningHtmlGenPromptIds.size, runningCodingRobotIds.size])

  // Force Konva layer redraw when pulse phase changes
  const anyRunning = runningPromptIds.size + runningImageGenPromptIds.size + runningHtmlGenPromptIds.size + runningCodingRobotIds.size
  useEffect(() => {
    if (anyRunning > 0 && layerRef.current) {
      layerRef.current.batchDraw()
    }
  }, [pulsePhase, anyRunning])

  return { pulsePhase }
}
