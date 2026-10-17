import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BackgroundOperationsProvider } from './contexts/BackgroundOperationsContext'
import { installKeepAliveFetch } from './api/keepAlive'

installKeepAliveFetch()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BackgroundOperationsProvider>
      <App />
    </BackgroundOperationsProvider>
  </React.StrictMode>,
)
