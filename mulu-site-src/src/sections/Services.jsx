import { Check, ArrowLeft } from 'lucide-react'
import { services } from '../lib/content.js'
import { Icon } from '../components/icons.jsx'
import { SectionHeading } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useDownload } from '../components/download-context.jsx'

export function Services() {
  const { open } = useDownload()
  return (
    <section id="services" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading title={services.title} sub={services.intro} />
        </Reveal>

        <div className="mt-14 grid items-stretch gap-6 md:grid-cols-3">
          {services.items.map((cat, i) => {
            const featured = Boolean(cat.tag)
            return (
              <Reveal key={cat.title} delay={i * 0.08}>
                <article
                  className={`group relative flex h-full flex-col overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1.5 ${
                    featured
                      ? 'bg-gradient-to-br from-primary-deep to-[#0c5733] text-white shadow-lift ring-2 ring-primary/40'
                      : 'border border-line bg-white text-ink shadow-soft hover:shadow-lift'
                  }`}
                >
                  {featured && (
                    <span className="absolute left-5 top-5 rounded-full bg-shine px-3 py-1 text-xs font-extrabold text-ink shadow-soft">
                      {cat.tag}
                    </span>
                  )}

                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      featured ? 'bg-white/20 text-white' : 'bg-mist text-primary-deep'
                    }`}
                  >
                    <Icon name={cat.icon} className="h-7 w-7" />
                  </span>

                  <h3 className="mt-5 text-2xl font-extrabold">{cat.title}</h3>
                  <p className={`mt-1.5 leading-relaxed ${featured ? 'text-white' : 'text-ink-soft'}`}>
                    {cat.blurb}
                  </p>

                  <ul className="mt-5 flex flex-col gap-2.5">
                    {cat.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm font-medium">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            featured ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary-deep'
                          }`}
                        >
                          <Check className="h-3 w-3" strokeWidth={3.2} />
                        </span>
                        <span className={featured ? 'text-white' : 'text-ink-soft'}>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={open}
                    className={`mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 min-h-[48px] ${
                      featured
                        ? 'bg-white text-primary-deep shadow-soft'
                        : 'bg-primary text-white shadow-glow hover:bg-primary-deep'
                    }`}
                  >
                    {cat.cta}
                    <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" strokeWidth={2.6} />
                  </button>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
