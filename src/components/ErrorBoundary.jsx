import { Component } from 'react'
import { RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[SparkleGo] Render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center bg-white">
          <div className="rounded-2xl bg-danger-50 p-5">
            <RefreshCw className="h-10 w-10 text-danger-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold mb-1">Something went wrong</h1>
            <p className="text-sm text-neutral-500 max-w-xs">
              An unexpected error occurred. Refresh the page to try again.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
