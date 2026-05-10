import { Component } from 'react'
import { RefreshCw } from 'lucide-react'
import i18n from '../i18n/index.js'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[Wash] Render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center bg-white">
          <div className="rounded-2xl bg-danger-50 p-5">
            <RefreshCw className="h-10 w-10 text-danger-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold mb-1">{i18n.t('error.title')}</h1>
            <p className="text-sm text-neutral-500 max-w-xs">
              {i18n.t('error.message')}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            <RefreshCw className="h-4 w-4" />
            {i18n.t('error.refresh')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
