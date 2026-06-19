import { ArrowRight, Check } from 'lucide-react'
import { a11y } from '../lib/content.js'
import { Wordmark } from '../components/brand.jsx'

const { statement: s } = a11y

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

export function AccessibilityStatement() {
  return (
    <div className="min-h-screen bg-wash">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2" aria-label={s.backHome}>
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-[10px]" width="36" height="36" />
            <Wordmark className="text-lg" />
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:border-primary/50 hover:text-primary-deep"
          >
            {s.backHome}
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">{s.title}</h1>
        <p className="mt-2 text-sm font-medium text-ink-mute">{s.updated}</p>

        <div className="mt-6 space-y-3 leading-relaxed text-ink-soft">
          {s.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <Section title={s.doneTitle}>
          <ul className="space-y-2.5">
            {s.done.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
                  <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={s.menuTitle}>
          <p>{s.menuIntro}</p>
          <ul className="space-y-2.5">
            {s.menuFeatures.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
                  <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={s.limitationsTitle}>
          <p>{s.limitations}</p>
        </Section>

        <Section title={s.contactTitle}>
          <p>{s.contactIntro}</p>
          <dl className="mt-2 rounded-2xl border border-line bg-white p-5 shadow-soft">
            {s.coordinator.map((c, i) => (
              <div
                key={i}
                className="flex flex-wrap gap-x-2 gap-y-0.5 py-1.5 first:pt-0 last:pb-0"
              >
                <dt className="font-bold text-ink">{c.label}:</dt>
                <dd className="text-ink-soft">{c.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-ink-mute">{s.responseNote}</p>
        </Section>
      </main>
    </div>
  )
}
