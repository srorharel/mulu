import { timeline } from '../lib/content.js'
import { Icon } from '../components/icons.jsx'
import { Wordmark } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'

const TONE = {
  mist: 'bg-mist text-primary-deep',
  primary: 'bg-primary text-white',
  shine: 'bg-shine text-ink',
}

export function Timeline() {
  return (
    <section id="experience" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <h2 className="text-3xl font-extrabold leading-tight text-ink sm:text-4xl md:text-[2.75rem]">
              {timeline.title} <Wordmark className="text-3xl sm:text-4xl md:text-[2.75rem]" />
            </h2>
            <p className="text-lg leading-relaxed text-ink-soft">{timeline.intro}</p>
          </div>
        </Reveal>

        <ol className="mt-14">
          {timeline.steps.map((s, i) => {
            const last = i === timeline.steps.length - 1
            return (
              <Reveal as="li" key={s.title} delay={i * 0.06} className="relative flex gap-4 pb-7 last:pb-0">
                {!last && (
                  <span
                    className="absolute bottom-0 right-[1.375rem] top-12 w-0.5 bg-gradient-to-b from-primary/40 to-primary/10"
                    aria-hidden="true"
                  />
                )}
                <span className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-soft ${TONE[s.tone]}`}>
                  <Icon name={s.icon} className="h-5 w-5" />
                </span>
                <div className="flex-1 rounded-2xl border border-line bg-white p-4 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                  <h3 className="font-extrabold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </Reveal>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
