import LogoSpotlight from './LogoSpotlight.jsx'

// Welcome header for the auth screens (login + both signups): the shared
// "Spotlight Bubbles" medallion above a greeting title + subtitle. The medallion
// itself lives in LogoSpotlight so the Landing hero can reuse the exact motif.
export default function AuthWelcome({ title, subtitle, logoSize = 46 }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-1">
        <LogoSpotlight size={112} logoSize={logoSize} />
      </div>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-ink leading-tight">{title}</h1>
      {subtitle && (
        <p className="text-neutral-500 dark:text-ink-muted text-sm mt-1.5 max-w-xs leading-relaxed">{subtitle}</p>
      )}
    </div>
  )
}
