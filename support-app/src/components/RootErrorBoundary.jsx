import { Component } from 'react'

export class RootErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[RootErrorBoundary]', error, info)
  }

  handleReset = async () => {
    try {
      const { supabase } = await import('../lib/supabase')
      await supabase.auth.signOut()
    } catch (_) { /* noop */ }
    try {
      localStorage.clear()
    } catch (_) { /* noop */ }
    window.location.href = '/'
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0f172a] text-white">
          <div className="max-w-sm w-full bg-white/5 rounded-2xl p-6 border border-white/10">
            <h1 className="text-lg font-semibold mb-2">משהו השתבש</h1>
            <p className="text-sm text-white/70 mb-4">
              {this.state.error?.message || 'Unexpected error'}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full h-12 bg-[#7DD9A2] text-[#0f172a] font-semibold rounded-xl"
            >
              איפוס וכניסה מחדש
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
