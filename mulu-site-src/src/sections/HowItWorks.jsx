import { howItWorks } from '../lib/content.js'
import { Icon } from '../components/icons.jsx'
import { SectionHeading } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'

export function HowItWorks() {
  return (
    <section id="how" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading title={howItWorks.title} sub={howItWorks.sub} />
        </Reveal>

        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          {/* connecting line on desktop */}
          <div
            className="absolute right-[16%] left-[16%] top-12 hidden h-0.5 bg-gradient-to-l from-primary/10 via-primary/40 to-primary/10 md:block"
            aria-hidden="true"
          />
          {howItWorks.steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <article className="group relative h-full rounded-3xl border border-line bg-white p-7 text-center shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift">
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-mist text-primary-deep transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                  <Icon name={s.icon} className="h-7 w-7" />
                  <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-ink">{s.title}</h3>
                <p className="mt-2.5 leading-relaxed text-ink-soft">{s.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
