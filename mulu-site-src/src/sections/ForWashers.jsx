import { Star } from 'lucide-react'
import { forWashers } from '../lib/content.js'
import { Icon } from '../components/icons.jsx'
import { Wordmark } from '../components/brand.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useDownload } from '../components/download-context.jsx'

function RankLadder({ ladder }) {
  return (
    <div className="rounded-3xl border border-white/15 bg-black/20 p-6 backdrop-blur-sm sm:p-8">
      <h3 className="text-xl font-extrabold text-white">{ladder.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-white/90">{ladder.sub}</p>

      <div role="img" aria-label={`${ladder.caption}. דרגה 1 הנמוכה ביותר, דרגה 5 הגבוהה ביותר.`}>
        {/* bars — height is accurate; the star floats above and no longer compresses bar 5 */}
        <div className="mt-8 flex h-44 items-end justify-between gap-2.5">
          {ladder.bars.map((h, i) => {
            const top = i === ladder.bars.length - 1
            return (
              <div key={i} className="relative flex-1" style={{ height: `${h}%` }}>
                {top && (
                  <Star
                    className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 text-star"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                )}
                <div
                  className={`h-full w-full rounded-t-xl ${
                    top ? 'bg-gradient-to-t from-star/80 to-star' : 'bg-gradient-to-t from-secondary/60 to-brand'
                  }`}
                />
              </div>
            )
          })}
        </div>
        {/* labels aligned under each bar */}
        <div className="mt-2 flex justify-between gap-2.5">
          {ladder.bars.map((_, i) => (
            <span key={i} className="flex-1 text-center text-xs font-bold text-white/90">
              דרגה {i + 1}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-xs font-medium text-white/90">{ladder.caption}</p>
    </div>
  )
}

export function ForWashers() {
  const { open } = useDownload()
  return (
    <section id="washers" className="relative overflow-hidden py-20 sm:py-24">
      {/* deep brand band */}
      <div className="absolute inset-0 -z-0 bg-gradient-to-br from-primary-deep via-primary-deep to-ink" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-0 opacity-30"
        aria-hidden="true"
        style={{ background: 'radial-gradient(60% 50% at 85% 0%, rgba(125,217,162,0.5), transparent 60%)' }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex max-w-2xl flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-black/25 px-3.5 py-1.5 text-sm font-bold text-white">
              {forWashers.kicker}
            </span>
            <h2 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl md:text-[2.75rem]">
              {forWashers.title}
            </h2>
            <p className="text-lg leading-relaxed text-white">{forWashers.intro}</p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* feature cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {forWashers.cards.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.06}>
                <article className="flex h-full items-start gap-3.5 rounded-2xl border border-white/15 bg-black/20 p-5 backdrop-blur-sm transition-colors duration-300 hover:bg-black/25">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                    <Icon name={c.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-white">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/90">{c.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          {/* rank ladder */}
          <Reveal delay={0.1}>
            <RankLadder ladder={forWashers.ladder} />
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="mt-10 flex justify-center lg:justify-start">
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-extrabold text-primary-deep shadow-lift transition-transform duration-200 hover:-translate-y-0.5 min-h-[52px]"
            >
              {forWashers.cta} <Wordmark className="text-lg" />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
