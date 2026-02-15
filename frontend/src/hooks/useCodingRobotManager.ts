import { useState, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, ChatMessage, ActivityMessage, Scene } from '../types'
import { generateWithClaudeCode, pollClaudeCodeRequest, interruptClaudeCodeRequest, ContentItem } from '../api/llm'
import { saveActivitySteps, saveActiveStep, clearActiveStep, loadActivity, saveActiveRequestId, loadActiveRequestId, clearActiveRequestId, deleteActivity } from '../utils/activityStorage'
import { playNotificationSound } from '../utils/sound'

interface UseCodingRobotManagerParams {
  activeSceneId: string | null
  activeScene: Scene | undefined
  items: CanvasItem[]
  selectedIds: string[]
  updateActiveSceneItems: (updater: (items: CanvasItem[]) => CanvasItem[]) => void
}

interface UseCodingRobotManagerResult {
  runningCodingRobotIds: Set<string>
  reconnectingCodingRobotIds: Set<string>
  codingRobotActivity: Map<string, ActivityMessage[][]>
  handleSendCodingRobotMessage: (itemId: string, message: string) => void
  handleStopCodingRobot: (itemId: string) => void
  handleClearCodingRobotChat: (itemId: string) => void
}

export function useCodingRobotManager({
  activeSceneId,
  activeScene,
  items,
  selectedIds,
  updateActiveSceneItems,
}: UseCodingRobotManagerParams): UseCodingRobotManagerResult {
  const [runningCodingRobotIds, setRunningCodingRobotIds] = useState<Set<string>>(new Set())
  const [reconnectingCodingRobotIds, setReconnectingCodingRobotIds] = useState<Set<string>>(new Set())
  const [codingRobotActivity, setCodingRobotActivity] = useState<Map<string, ActivityMessage[][]>>(new Map())

  // Restore activity from IndexedDB for coding robot items in the active scene
  useEffect(() => {
    if (!activeScene) return
    const robotItems = activeScene.items.filter((item) => item.type === 'coding-robot')
    if (robotItems.length === 0) return

    let cancelled = false
    Promise.all(
      robotItems.map(async (item) => {
        const steps = await loadActivity(item.id)
        return steps ? { itemId: item.id, steps } : null
      })
    ).then((results) => {
      if (cancelled) return
      const toRestore = results.filter((r): r is { itemId: string; steps: ActivityMessage[][] } => r !== null)
      if (toRestore.length === 0) return
      setCodingRobotActivity((prev) => {
        // Only restore if we don't already have data for this item (avoid overwriting live data)
        let changed = false
        const next = new Map(prev)
        for (const { itemId, steps } of toRestore) {
          if (!next.has(itemId) || next.get(itemId)!.length === 0) {
            next.set(itemId, steps)
            changed = true
          }
        }
        return changed ? next : prev
      })
    })
    return () => { cancelled = true }
  }, [activeSceneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling reconnection for coding robot items with an activeRequestId (after HMR)
  // This effect checks both the item's activeRequestId and IndexedDB (for cases where
  // HMR fired before the scene auto-saved).
  useEffect(() => {
    if (!activeScene) return

    const robotItems = activeScene.items.filter(
      (item): item is import('../types').CodingRobotItem => item.type === 'coding-robot'
    )
    if (robotItems.length === 0) return

    let cancelled = false
    const intervalIds: ReturnType<typeof setInterval>[] = []

    // Check all coding robot items — some may have requestId only in IndexedDB
    ;(async () => {
      const toReconnect: Array<{ itemId: string; requestId: string }> = []

      for (const robot of robotItems) {
        // Skip items that are already being processed by an active SSE stream
        if (runningCodingRobotIds.has(robot.id)) continue

        let reqId = robot.activeRequestId
        if (!reqId) {
          // Check IndexedDB as fallback (scene may not have been saved before HMR)
          reqId = await loadActiveRequestId(robot.id) ?? undefined
        }
        if (reqId) {
          toReconnect.push({ itemId: robot.id, requestId: reqId })
        }
      }

      if (cancelled || toReconnect.length === 0) return

      for (const { itemId, requestId } of toReconnect) {
        // Load persisted activity from IndexedDB so previous steps aren't lost
        const persistedSteps = await loadActivity(itemId)
        let eventsSeen = 0

        // Mark as running + reconnecting
        setRunningCodingRobotIds((prev) => {
          if (prev.has(itemId)) return prev
          return new Set(prev).add(itemId)
        })
        setReconnectingCodingRobotIds((prev) => new Set(prev).add(itemId))

        // Restore previous steps and ensure an empty step for the reconnecting run
        setCodingRobotActivity((prev) => {
          const next = new Map(prev)
          const existing = next.get(itemId)
          if (existing && existing.length > 0) {
            // Already have data (e.g. from restore effect) — just ensure trailing empty step
            eventsSeen = existing[existing.length - 1].length
          } else if (persistedSteps && persistedSteps.length > 0) {
            // Restore from IndexedDB + append empty step for new run
            next.set(itemId, [...persistedSteps, []])
            return next
          } else {
            next.set(itemId, [[]])
            return next
          }
          return prev
        })

        const intervalId = setInterval(async () => {
          if (cancelled) return

          try {
            const poll = await pollClaudeCodeRequest(requestId, eventsSeen)

            if (cancelled) return

            // Clear reconnecting indicator after first successful poll
            setReconnectingCodingRobotIds((prev) => {
              if (!prev.has(itemId)) return prev
              const next = new Set(prev)
              next.delete(itemId)
              return next
            })

            if (poll === null) {
              // Request expired or not found — clear activeRequestId
              clearActiveRequestId(itemId)
              updateActiveSceneItems((prev) => prev.map((item) => {
                if (item.id !== itemId || item.type !== 'coding-robot') return item
                return { ...item, activeRequestId: undefined }
              }))
              setRunningCodingRobotIds((prev) => {
                const next = new Set(prev)
                next.delete(itemId)
                return next
              })
              clearInterval(intervalId)
              return
            }

            // Apply new activity events
            if (poll.events.length > 0) {
              const newMsgs: ActivityMessage[] = poll.events.map((e) => ({
                id: e.id,
                type: e.type,
                content: e.content,
                timestamp: e.timestamp,
              }))

              setCodingRobotActivity((prev) => {
                const next = new Map(prev)
                const steps = next.get(itemId) || [[]]
                const updated = [...steps]
                updated[updated.length - 1] = [...updated[updated.length - 1], ...newMsgs]
                next.set(itemId, updated)
                saveActiveStep(itemId, updated[updated.length - 1])
                return next
              })

              eventsSeen += poll.events.length
            }

            // Handle terminal states
            if (poll.status === 'completed' && poll.result) {
              clearInterval(intervalId)
              clearActiveRequestId(itemId)
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: poll.result.result,
                timestamp: new Date().toISOString(),
              }
              updateActiveSceneItems((prev) => prev.map((item) => {
                if (item.id !== itemId || item.type !== 'coding-robot') return item
                return {
                  ...item,
                  chatHistory: [...item.chatHistory, assistantMessage],
                  sessionId: poll.result!.sessionId ?? item.sessionId,
                  activeRequestId: undefined,
                }
              }))
              setRunningCodingRobotIds((prev) => {
                const next = new Set(prev)
                next.delete(itemId)
                return next
              })
              setCodingRobotActivity((prev) => {
                const steps = prev.get(itemId)
                if (steps) {
                  saveActivitySteps(itemId, steps)
                  clearActiveStep(itemId)
                }
                return prev
              })
              playNotificationSound()
            } else if (poll.status === 'error') {
              clearInterval(intervalId)
              clearActiveRequestId(itemId)
              const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `Error: ${poll.error || 'Unknown error'}`,
                timestamp: new Date().toISOString(),
              }
              updateActiveSceneItems((prev) => prev.map((item) => {
                if (item.id !== itemId || item.type !== 'coding-robot') return item
                return {
                  ...item,
                  chatHistory: [...item.chatHistory, errorMessage],
                  activeRequestId: undefined,
                }
              }))
              setRunningCodingRobotIds((prev) => {
                const next = new Set(prev)
                next.delete(itemId)
                return next
              })
              setCodingRobotActivity((prev) => {
                const steps = prev.get(itemId)
                if (steps) {
                  saveActivitySteps(itemId, steps)
                  clearActiveStep(itemId)
                }
                return prev
              })
            }
          } catch (err) {
            console.error('Polling reconnection error:', err)
          }
        }, 2000)

        intervalIds.push(intervalId)
      }
    })()

    return () => {
      cancelled = true
      intervalIds.forEach(clearInterval)
    }
  }, [activeSceneId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendCodingRobotMessage = useCallback(async (itemId: string, message: string) => {
    const robotItem = items.find((item) => item.id === itemId && item.type === 'coding-robot')
    if (!robotItem || robotItem.type !== 'coding-robot') return

    // Generate a requestId for SSE reconnection after HMR
    const requestId = uuidv4()
    saveActiveRequestId(itemId, requestId)

    // Append user message to chat history, clear input, and save requestId
    const userMessage: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() }
    const updatedHistory = [...robotItem.chatHistory, userMessage]
    updateActiveSceneItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, text: '', chatHistory: updatedHistory, activeRequestId: requestId } : item
    ))

    // Mark as running and push a new empty step for this run
    setRunningCodingRobotIds((prev) => new Set(prev).add(itemId))
    setCodingRobotActivity((prev) => {
      const next = new Map(prev)
      const existing = next.get(itemId) || []
      next.set(itemId, [...existing, []])
      return next
    })

    // Gather selected items (excluding the robot itself) as context
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.id !== itemId)
    const contentItems: ContentItem[] = selectedItems.map((item) => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text }
      } else if (item.type === 'image') {
        return { type: 'image' as const, src: item.cropSrc || item.src, id: item.id, sceneId: activeSceneId!, useEdited: !!item.cropSrc }
      } else if (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt' || item.type === 'coding-robot') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      }
      return { type: 'text' as const, text: '' }
    }).filter((item) => item.text || item.src || item.id)

    try {
      const { result, sessionId: newSessionId } = await generateWithClaudeCode(
        contentItems,
        message,
        robotItem.sessionId,
        (event) => {
          const activityMsg: ActivityMessage = {
            id: event.id,
            type: event.type,
            content: event.content,
            timestamp: event.timestamp,
          }
          setCodingRobotActivity((prev) => {
            const next = new Map(prev)
            const steps = next.get(itemId) || [[]]
            const updated = [...steps]
            updated[updated.length - 1] = [...updated[updated.length - 1], activityMsg]
            next.set(itemId, updated)
            // Persist active step to IndexedDB for HMR survival
            saveActiveStep(itemId, updated[updated.length - 1])
            return next
          })
        },
        requestId
      )

      // Append assistant response and clear activeRequestId
      clearActiveRequestId(itemId)
      const assistantMessage: ChatMessage = { role: 'assistant', content: result, timestamp: new Date().toISOString() }
      updateActiveSceneItems((prev) => prev.map((item) => {
        if (item.id !== itemId || item.type !== 'coding-robot') return item
        return {
          ...item,
          chatHistory: [...item.chatHistory, assistantMessage],
          sessionId: newSessionId ?? item.sessionId,
          activeRequestId: undefined,
        }
      }))
    } catch (error) {
      console.error('Failed to run coding robot:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      // If stream ended without result, don't add error — the polling reconnection will handle it
      if (errorMsg === 'Stream ended without a result') {
        // SSE stream was destroyed (e.g., by HMR). The requestId is still on the item,
        // so the polling effect will pick it up and reconnect.
        return
      }
      clearActiveRequestId(itemId)
      const errorMessage: ChatMessage = { role: 'assistant', content: `Error: ${errorMsg}`, timestamp: new Date().toISOString() }
      updateActiveSceneItems((prev) => prev.map((item) => {
        if (item.id !== itemId || item.type !== 'coding-robot') return item
        return { ...item, chatHistory: [...item.chatHistory, errorMessage], activeRequestId: undefined }
      }))
    } finally {
      setRunningCodingRobotIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
      // Persist completed steps to IndexedDB and clear active marker
      setCodingRobotActivity((prev) => {
        const steps = prev.get(itemId)
        if (steps) {
          saveActivitySteps(itemId, steps)
          clearActiveStep(itemId)
        }
        return prev
      })
    }
  }, [items, selectedIds, activeSceneId, updateActiveSceneItems])

  const handleStopCodingRobot = useCallback((itemId: string) => {
    const robotItem = items.find((item) => item.id === itemId && item.type === 'coding-robot')
    if (!robotItem || robotItem.type !== 'coding-robot') return
    const reqId = robotItem.activeRequestId
    if (!reqId) return
    interruptClaudeCodeRequest(reqId)
  }, [items])

  const handleClearCodingRobotChat = useCallback((itemId: string) => {
    updateActiveSceneItems((prev) => prev.map((item) => {
      if (item.id !== itemId || item.type !== 'coding-robot') return item
      return { ...item, chatHistory: [] }
    }))
    setCodingRobotActivity((prev) => {
      const next = new Map(prev)
      next.delete(itemId)
      return next
    })
    deleteActivity(itemId)
  }, [updateActiveSceneItems])

  return {
    runningCodingRobotIds,
    reconnectingCodingRobotIds,
    codingRobotActivity,
    handleSendCodingRobotMessage,
    handleStopCodingRobot,
    handleClearCodingRobotChat,
  }
}
