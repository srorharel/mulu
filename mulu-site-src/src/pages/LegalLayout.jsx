import { ArrowRight } from 'lucide-react'
import { Wordmark } from '../components/brand.jsx'

// Shared page chrome for the standalone legal / info pages (privacy, terms,
// account deletion). Header with logo + "back home", a constrained content column.
export function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-wash">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2" aria-label="חזרה לדף הבית">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-[10px]" width="36" height="36" />
            <Wordmark className="text-lg" />
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:border-primary/50 hover:text-primary-deep"
          >
            חזרה לדף הבית
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm font-medium text-ink-mute">עודכן לאחרונה: {updated}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  )
}
