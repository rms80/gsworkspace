import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface BackgroundOperationsContextType {
  activeCount: number
  startOperation: () => void
  endOperation: () => void
}

const BackgroundOperationsContext = createContext<BackgroundOperationsContextType | null>(null)

export function BackgroundOperationsProvider({ children }: { children: ReactNode }) {
  const [activeCount, setActiveCount] = useState(0)

  const startOperation = useCallback(() => {
    setActiveCount((c) => c + 1)
  }, [])

  const endOperation = useCallback(() => {
    setActiveCount((c) => Math.max(0, c - 1))
  }, [])

  return (
    <BackgroundOperationsContext.Provider value={{ activeCount, startOperation, endOperation }}>
      {children}
    </BackgroundOperationsContext.Provider>
  )
}

export function useBackgroundOperations() {
  const context = useContext(BackgroundOperationsContext)
  if (!context) {
    throw new Error('useBackgroundOperations must be used within BackgroundOperationsProvider')
  }
  return context
}
