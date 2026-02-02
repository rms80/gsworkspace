import { useState, useEffect } from 'react'
import {
  getAnthropicApiKey,
  setAnthropicApiKey,
  getGoogleApiKey,
  setGoogleApiKey,
  validateAnthropicKeyFormat,
  validateGoogleKeyFormat,
} from '../../utils/apiKeyStorage'

interface ApiKeyFieldProps {
  label: string
  helpText: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
  isValid: boolean | null
  validationMessage: string
}

function ApiKeyField({
  label,
  helpText,
  value,
  onChange,
  onSave,
  onClear,
  isValid,
  validationMessage,
}: ApiKeyFieldProps) {
  const [showKey, setShowKey] = useState(false)
  const hasValue = value.length > 0

  return (
    <div style={{ marginBottom: '24px' }}>
      <label
        style={{
          display: 'block',
          fontWeight: 600,
          marginBottom: '6px',
          color: '#333',
        }}
      >
        {label}
      </label>
      <p
        style={{
          margin: '0 0 10px 0',
          fontSize: '13px',
          color: '#666',
        }}
      >
        {helpText}
      </p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter API key..."
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              border: `1px solid ${isValid === false ? '#d32f2f' : '#ccc'}`,
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#666',
              fontSize: '12px',
            }}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        <button
          onClick={onSave}
          disabled={!hasValue}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: hasValue ? '#1976d2' : '#ccc',
            color: '#fff',
            cursor: hasValue ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            fontSize: '14px',
          }}
        >
          Save
        </button>
        <button
          onClick={onClear}
          style={{
            padding: '10px 16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px',
          }}
        >
          Clear
        </button>
      </div>
      {isValid !== null && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '12px',
            color: isValid ? '#2e7d32' : '#d32f2f',
          }}
        >
          {validationMessage}
        </p>
      )}
    </div>
  )
}

export default function OfflineModeSettingsTab() {
  const [anthropicKey, setAnthropicKey_] = useState('')
  const [googleKey, setGoogleKey_] = useState('')
  const [anthropicValid, setAnthropicValid] = useState<boolean | null>(null)
  const [googleValid, setGoogleValid] = useState<boolean | null>(null)
  const [anthropicMessage, setAnthropicMessage] = useState('')
  const [googleMessage, setGoogleMessage] = useState('')

  // Load existing keys on mount
  useEffect(() => {
    const existingAnthropic = getAnthropicApiKey()
    const existingGoogle = getGoogleApiKey()
    if (existingAnthropic) {
      setAnthropicKey_(existingAnthropic)
      setAnthropicValid(true)
      setAnthropicMessage('Key saved')
    }
    if (existingGoogle) {
      setGoogleKey_(existingGoogle)
      setGoogleValid(true)
      setGoogleMessage('Key saved')
    }
  }, [])

  const handleSaveAnthropic = () => {
    if (!anthropicKey.trim()) return
    if (!validateAnthropicKeyFormat(anthropicKey.trim())) {
      setAnthropicValid(false)
      setAnthropicMessage('Invalid format: Anthropic keys typically start with "sk-ant-"')
      return
    }
    setAnthropicApiKey(anthropicKey.trim())
    setAnthropicValid(true)
    setAnthropicMessage('Key saved')
  }

  const handleClearAnthropic = () => {
    setAnthropicApiKey(null)
    setAnthropicKey_('')
    setAnthropicValid(null)
    setAnthropicMessage('')
  }

  const handleSaveGoogle = () => {
    if (!googleKey.trim()) return
    if (!validateGoogleKeyFormat(googleKey.trim())) {
      setGoogleValid(false)
      setGoogleMessage('Invalid format: Google API keys are typically 39+ characters, alphanumeric')
      return
    }
    setGoogleApiKey(googleKey.trim())
    setGoogleValid(true)
    setGoogleMessage('Key saved')
  }

  const handleClearGoogle = () => {
    setGoogleApiKey(null)
    setGoogleKey_('')
    setGoogleValid(null)
    setGoogleMessage('')
  }

  return (
    <div>
      <div
        style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '24px',
        }}
      >
        <strong style={{ color: '#856404' }}>Security Notice</strong>
        <p style={{ margin: '8px 0 0 0', color: '#856404', fontSize: '13px' }}>
          API keys are stored in your browser's local storage. While basic obfuscation is applied,
          anyone with access to your browser's developer tools can view them. Only use this feature
          on trusted devices.
        </p>
      </div>

      <ApiKeyField
        label="Anthropic API Key"
        helpText="Required for LLM prompts (Claude) and HTML generation in offline mode. Get your key from console.anthropic.com"
        value={anthropicKey}
        onChange={(v) => {
          setAnthropicKey_(v)
          setAnthropicValid(null)
          setAnthropicMessage('')
        }}
        onSave={handleSaveAnthropic}
        onClear={handleClearAnthropic}
        isValid={anthropicValid}
        validationMessage={anthropicMessage}
      />

      <ApiKeyField
        label="Google API Key"
        helpText="Required for image generation (Imagen) and Gemini models in offline mode. Get your key from console.cloud.google.com or aistudio.google.com"
        value={googleKey}
        onChange={(v) => {
          setGoogleKey_(v)
          setGoogleValid(null)
          setGoogleMessage('')
        }}
        onSave={handleSaveGoogle}
        onClear={handleClearGoogle}
        isValid={googleValid}
        validationMessage={googleMessage}
      />

      <div
        style={{
          borderTop: '1px solid #e0e0e0',
          paddingTop: '16px',
          marginTop: '8px',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
          <strong>Note:</strong> When in offline mode, AI features will use these keys to call
          APIs directly from your browser. In online mode, the server's configured API keys are used
          instead.
        </p>
      </div>
    </div>
  )
}
