import { useState } from 'react'
import OfflineModeSettingsTab from './settings/OfflineModeSettingsTab'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

type TabId = 'offline-mode'

interface TabDef {
  id: TabId
  label: string
}

const tabs: TabDef[] = [
  { id: 'offline-mode', label: 'Offline Mode' },
]

export default function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('offline-mode')

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          width: '600px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333' }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '0',
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs + Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Tab navigation */}
          <div
            style={{
              width: '160px',
              borderRight: '1px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              padding: '8px 0',
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  backgroundColor: activeTab === tab.id ? '#fff' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  color: activeTab === tab.id ? '#1976d2' : '#333',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  borderLeft: activeTab === tab.id ? '3px solid #1976d2' : '3px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
            }}
          >
            {activeTab === 'offline-mode' && (
              <OfflineModeSettingsTab />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
