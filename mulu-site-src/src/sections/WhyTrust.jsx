import { whyTrust } from '../lib/content.js'
import { Icon } from '../components/icons.jsx'
import { Kicker, Wordmark } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'

export function WhyTrust() {
  return (
    <section className="relative py-20 sm:py-24">
      {/* soft tinted band */}
      <div className="absolute inset-0 -z-0 bg-gradient-to-b from-mist/70 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <Kicker>
              {whyTrust.kicker} <Wordmark className="text-base sm:text-lg" />
            </Kicker>
            <h2 className="text-3xl font-extrabold leading-tight text-ink sm:text-4xl md:text-[2.75rem]">
              {whyTrust.title}
            </h2>
            <p className="text-lg leading-relaxed text-ink-soft">
              {whyTrust.intro} <Wordmark className="text-lg" /> {whyTrust.introTail}
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {whyTrust.cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.07}>
              <article className="group flex h-full items-start gap-4 rounded-3xl border border-line bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-mist text-primary-deep transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                  <Icon name={c.icon} className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-ink">{c.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink-soft">{c.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
