import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BackgroundOperationsProvider } from './contexts/BackgroundOperationsContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BackgroundOperationsProvider>
      <App />
    </BackgroundOperationsProvider>
  </React.StrictMode>,
)
