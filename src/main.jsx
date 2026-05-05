import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Eruda in-browser devtools — dev mode only, and only when ?debug=1 is in the URL.
// Loaded from CDN so it never enters the production bundle.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1') {
  const s = document.createElement('script')
  s.src = 'https://cdn.jsdelivr.net/npm/eruda'
  s.onload = () => window.eruda.init()
  document.head.appendChild(s)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
