import { ImportProgress } from '../utils/sceneImport'

interface ImportProgressDialogProps {
  isOpen: boolean
  progress: ImportProgress | null
}

function ImportProgressDialog({ isOpen, progress }: ImportProgressDialogProps) {
  if (!isOpen || !progress) return null

  const indeterminate = progress.total === 0
  const percent = indeterminate
    ? 0
    : Math.min(100, Math.round((progress.current / progress.total) * 100))

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
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          minWidth: '420px',
          maxWidth: '520px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e0e0e0',
            fontWeight: 600,
            fontSize: '16px',
            color: '#333',
          }}
        >
          Importing scene
        </div>

        <div style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '14px',
              color: '#333',
              marginBottom: '10px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={progress.message}
          >
            {progress.message}
          </div>

          <div
            style={{
              width: '100%',
              height: '10px',
              backgroundColor: '#eee',
              borderRadius: '5px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {indeterminate ? (
              <div
                style={{
                  position: 'absolute',
                  height: '100%',
                  width: '40%',
                  backgroundColor: '#1976d2',
                  borderRadius: '5px',
                  animation: 'import-indeterminate 1.4s ease-in-out infinite',
                }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  width: `${percent}%`,
                  backgroundColor: '#1976d2',
                  borderRadius: '5px',
                  transition: 'width 200ms ease',
                }}
              />
            )}
          </div>

          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              color: '#666',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {indeterminate
                ? 'Preparing files...'
                : `${progress.current} of ${progress.total} items`}
            </span>
            {!indeterminate && <span>{percent}%</span>}
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes import-indeterminate {
            0% { left: -40%; }
            100% { left: 100%; }
          }
        `}
      </style>
    </div>
  )
}

export default ImportProgressDialog
