import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import './i18n/config'
import './styles/index.css'
import { initDemoBridge } from './demo/demoBridge'

if (
  import.meta.env.VITE_DEMO === 'true' ||
  (typeof window !== 'undefined' && !window.electronAPI && new URLSearchParams(window.location.search).has('demo'))
) {
  initDemoBridge();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
