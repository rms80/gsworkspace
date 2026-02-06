import { useState, useRef, FormEvent } from 'react'

interface LoginScreenProps {
  onSuccess: () => void
}

function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 32,
          backgroundColor: '#2d2d2d',
          borderRadius: 8,
          border: '1px solid #404040',
          minWidth: 300,
        }}
      >
        <div style={{ color: '#ccc', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          gsworkspace
        </div>
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
          style={{
            padding: '8px 12px',
            backgroundColor: '#3a3a3a',
            border: '1px solid #555',
            borderRadius: 4,
            color: '#eee',
            fontSize: 14,
            outline: 'none',
          }}
        />
        {error && (
          <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}

export default LoginScreen
