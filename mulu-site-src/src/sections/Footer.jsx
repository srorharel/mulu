import { footer } from '../lib/content.js'

const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-[11px]" width="40" height="40" />
          <span className="font-wordmark text-lg font-extrabold text-ink">
            MULU · <span className="font-sans font-bold text-primary-deep">{footer.tagline}</span>
          </span>
        </div>

        <nav aria-label="ניווט תחתון">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {footer.links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  className="text-sm font-semibold text-ink-soft transition-colors duration-200 hover:text-primary-deep"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line/70">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-ink-mute sm:px-6 sm:text-right">
          © {YEAR} MULU · כל הזכויות שמורות
        </p>
      </div>
    </footer>
  )
}
