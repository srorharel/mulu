import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { nav } from '../lib/content.js'
import { DownloadButton } from '../components/brand.jsx'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-wash/85 shadow-soft backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="flex items-center gap-2" aria-label="MULU — לדף הבית">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-[11px]" width="40" height="40" />
          <span className="sr-only">MULU</span>
        </a>

        <ul className="hidden items-center gap-7 md:flex">
          {nav.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-semibold text-ink-soft transition-colors duration-200 hover:text-primary-deep"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <DownloadButton variant="nav">
          <Download className="h-4 w-4" strokeWidth={2.4} />
          <span className="hidden sm:inline">{nav.cta}</span>
          <span className="sm:hidden">הורידו</span>
        </DownloadButton>
      </nav>
    </header>
  )
}
