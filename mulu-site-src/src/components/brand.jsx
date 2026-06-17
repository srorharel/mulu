import { BRAND, download } from '../lib/content.js'
import { useDownload } from './download-context.jsx'

/* ── MULU wordmark ─────────────────────────────────────────────────────── */
export function Wordmark({ className = '', tone = 'ink' }) {
  const color = tone === 'white' ? 'text-white' : 'text-ink'
  return (
    <span className={`font-wordmark font-extrabold tracking-tight ${color} ${className}`}>
      {BRAND}
    </span>
  )
}

/* ── Real store badges (inline SVG, official marks) ────────────────────── */
function AppleGlyph(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.05-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.81 3.15-.46 7.81 1.3 10.37.86 1.25 1.89 2.66 3.23 2.61 1.3-.05 1.79-.84 3.36-.84 1.56 0 2 .84 3.38.81 1.4-.02 2.28-1.28 3.14-2.54.98-1.45 1.39-2.85 1.41-2.93-.03-.01-2.71-1.04-2.73-4.13zM14.7 4.6c.72-.86 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 1.99-1.08 3.17 1.15.09 2.32-.58 3.03-1.45z" />
    </svg>
  )
}

function GooglePlayGlyph(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3.6 1.81a1 1 0 0 0-.6.92v18.54a1 1 0 0 0 .6.92l10.19-10.19L3.6 1.81Z" fill="#00C3FF" />
      <path d="M3.6 1.81a1 1 0 0 1 1.02-.04l12 6.4-2.83 2.83L3.6 1.81Z" fill="#00E676" />
      <path d="m13.79 12 2.83 2.83-12 6.4a1 1 0 0 1-1.02-.04L13.79 12Z" fill="#FF3D00" />
      <path d="m16.62 9.17 4.12 2.36c.75.43.75 1.52 0 1.95l-4.12 2.36L13.79 12l2.83-2.83Z" fill="#FFCE00" />
    </svg>
  )
}

function StoreBadge({ kind, top, name, href }) {
  const Glyph = kind === 'ios' ? AppleGlyph : GooglePlayGlyph
  const soon = !href
  const base =
    'group inline-flex items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-white shadow-soft min-h-[56px] transition-transform duration-200'
  const content = (
    <>
      <Glyph className="h-7 w-7 shrink-0" />
      <span className="flex flex-col leading-none text-start">
        <span className="text-[11px] font-medium text-white/75">{top}</span>
        <span className="font-wordmark text-lg font-bold leading-tight">{name}</span>
      </span>
      {soon && (
        <span className="ms-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white/85">
          {download.comingSoon}
        </span>
      )}
    </>
  )
  if (soon) {
    return (
      <button type="button" disabled aria-label={`${name} — ${download.comingSoon}`} className={`${base} cursor-not-allowed opacity-90`}>
        {content}
      </button>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} hover:-translate-y-0.5 hover:shadow-lift focus-visible:-translate-y-0.5`}
    >
      {content}
    </a>
  )
}

export function StoreButtons({ store, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <StoreBadge kind="ios" top={store.iosTop} name={store.iosBottom} href={store.iosUrl} />
      <StoreBadge kind="android" top={store.androidTop} name={store.androidBottom} href={store.androidUrl} />
    </div>
  )
}

// Opens the global download modal. Use everywhere a "הורידו את האפליקציה" CTA appears.
export function DownloadButton({ children, variant = 'primary', className = '' }) {
  const { open } = useDownload()
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0'
  const styles = {
    primary: 'bg-primary text-white shadow-glow hover:bg-primary-deep px-6 py-3.5 text-base min-h-[52px]',
    light: 'bg-white text-primary-deep shadow-lift px-7 py-3.5 text-base min-h-[52px]',
    nav: 'bg-primary text-white shadow-soft hover:bg-primary-deep px-4 py-2.5 text-sm min-h-[44px]',
  }
  return (
    <button type="button" onClick={open} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  )
}

/* ── Small reusable bits ───────────────────────────────────────────────── */
export function Chip({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 py-1.5 text-sm font-medium text-ink-soft backdrop-blur-sm ${className}`}>
      {children}
    </span>
  )
}

export function Kicker({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-base font-bold text-primary-deep sm:text-lg">
      {children}
    </span>
  )
}

export function SectionHeading({ kicker, title, sub, align = 'center', children }) {
  const alignCls = align === 'center' ? 'items-center text-center mx-auto' : 'items-start text-start'
  return (
    <div className={`flex max-w-2xl flex-col gap-4 ${alignCls}`}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="text-3xl font-extrabold leading-tight text-ink sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {sub && <p className="text-lg leading-relaxed text-ink-soft">{sub}</p>}
      {children}
    </div>
  )
}

export function PrimaryButton({ children, href = '#', className = '', as: Tag = 'a', ...rest }) {
  return (
    <Tag
      href={Tag === 'a' ? href : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-bold text-white shadow-glow transition-all duration-200 hover:bg-primary-deep hover:-translate-y-0.5 active:translate-y-0 min-h-[52px] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function GhostButton({ children, href = '#', className = '' }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-line bg-white px-6 py-3.5 text-base font-bold text-ink transition-all duration-200 hover:border-primary hover:text-primary-deep hover:-translate-y-0.5 min-h-[52px] ${className}`}
    >
      {children}
    </a>
  )
}
