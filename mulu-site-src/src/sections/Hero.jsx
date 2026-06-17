import { Sparkles, Check } from 'lucide-react'
import { hero } from '../lib/content.js'
import { StoreButtons } from '../components/brand.jsx'
import { PhoneMock } from '../components/PhoneMock.jsx'
import { Reveal } from '../components/Reveal.jsx'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-aurora">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-24 lg:pt-16">
        {/* Copy */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-right">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-2 text-sm font-bold text-primary-deep shadow-soft backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-shine" strokeWidth={2.4} />
              {hero.badge}
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] text-ink sm:text-5xl lg:text-6xl">
              {hero.titleTop}
              <br />
              <span className="text-gradient-brand">{hero.titleBottom}</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">{hero.sub}</p>
          </Reveal>

          <Reveal delay={0.18}>
            <StoreButtons store={hero.store} className="mt-7 justify-center lg:justify-start" />
          </Reveal>

          <Reveal delay={0.24}>
            <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2.5 lg:justify-start">
              {hero.chips.map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
                    <Check className="h-3 w-3" strokeWidth={3.2} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Phone */}
        <Reveal delay={0.1} className="relative flex justify-center lg:justify-start">
          <div className="absolute -inset-6 -z-0 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative z-10">
            <PhoneMock />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
