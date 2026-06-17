import { finalCta, hero } from '../lib/content.js'
import { StoreButtons, Wordmark } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'

export function FinalCTA() {
  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary to-primary-deep px-6 py-12 shadow-lift sm:px-12 sm:py-16">
        {/* glow accent */}
        <div
          className="absolute inset-0 -z-0 opacity-40"
          aria-hidden="true"
          style={{ background: 'radial-gradient(55% 70% at 50% 0%, rgba(255,255,255,0.40), transparent 60%)' }}
        />

        <Reveal className="relative mx-auto flex max-w-2xl flex-col items-center gap-7 text-center">
          <div>
            <h2 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl md:text-[2.75rem]">
              {finalCta.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/90 sm:text-lg">
              {finalCta.sub} <Wordmark className="text-base sm:text-lg" tone="white" /> {finalCta.subTail}
            </p>
          </div>

          <StoreButtons store={hero.store} className="justify-center" />
        </Reveal>
      </div>
    </section>
  )
}
