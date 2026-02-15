import { useState, useCallback } from 'react'

interface AuthStatus {
  authRequired: boolean
  authenticated: boolean
  serverName?: string
}

interface UseAuthProps {
  onLogout: () => void
}

export function useAuth({ onLogout }: UseAuthProps) {
  const [authRequired, setAuthRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [serverName, setServerName] = useState('gsworkspace')

  /**
   * Check auth status from the server.
   * Returns the auth data so callers can make decisions (e.g. abort init if not authenticated).
   */
  const checkAuthStatus = useCallback(async (): Promise<AuthStatus | null> => {
    try {
      const authRes = await fetch('/api/auth/status')
      const authData = await authRes.json()
      setAuthRequired(authData.authRequired)
      setAuthenticated(authData.authenticated)
      if (authData.serverName) setServerName(authData.serverName)
      return authData as AuthStatus
    } catch {
      // If auth check fails, proceed (server might be down or auth not configured)
      return null
    }
  }, [])

  const handleLoginSuccess = useCallback(() => {
    setAuthenticated(true)
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors — we'll show the login screen anyway
    }
    setAuthenticated(false)
    onLogout()
  }, [onLogout])

  return {
    authRequired,
    authenticated,
    serverName,
    checkAuthStatus,
    handleLoginSuccess,
    handleLogout,
  }
}
