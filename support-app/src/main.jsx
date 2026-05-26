import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.jsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.jsx'
import { initCapacitor } from './lib/capacitor-init.js'

initCapacitor()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
