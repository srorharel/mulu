import { useEffect, useRef, useState } from 'react'
import {
  Accessibility, X, Plus, Minus, RotateCcw,
  Contrast, Eye, Droplet, Type, AlignJustify, Link2, Heading, Pause, MousePointer2,
} from 'lucide-react'
import { a11y } from '../lib/content.js'
import { DEFAULTS, FONT_STEPS, loadSettings, saveSettings, applySettings } from '../lib/a11y.js'

const { menu } = a11y

// Order shown in the panel. `contrast`/`invert`/`grayscale` are the visual modes;
// the rest are text/layout aids.
const TOGGLES = [
  { key: 'contrast', icon: Contrast, label: menu.options.contrast },
  { key: 'invert', icon: Eye, label: menu.options.invert },
  { key: 'grayscale', icon: Droplet, label: menu.options.grayscale },
  { key: 'readableFont', icon: Type, label: menu.options.readableFont },
  { key: 'spacing', icon: AlignJustify, label: menu.options.spacing },
  { key: 'links', icon: Link2, label: menu.options.links },
  { key: 'headings', icon: Heading, label: menu.options.headings },
  { key: 'noMotion', icon: Pause, label: menu.options.noMotion },
  { key: 'bigCursor', icon: MousePointer2, label: menu.options.bigCursor },
]

export function AccessibilityMenu() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  // Re-apply saved settings once on mount (covers the visual filter modes, which
  // the pre-paint inline script intentionally skips).
  useEffect(() => {
    applySettings(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = (next) => {
    setSettings(next)
    saveSettings(next)
    applySettings(next)
  }

  const toggle = (key) => commit({ ...settings, [key]: !settings[key] })

  const stepFont = (dir) => {
    const idx = FONT_STEPS.indexOf(settings.fontScale)
    const base = idx === -1 ? 0 : idx
    const nextIdx = Math.min(FONT_STEPS.length - 1, Math.max(0, base + dir))
    commit({ ...settings, fontScale: FONT_STEPS[nextIdx] })
  }

  const reset = () => commit({ ...DEFAULTS })

  // Close on Escape (return focus to the trigger) and on outside click.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    // Move focus into the panel when it opens
    const t = setTimeout(() => panelRef.current?.querySelector('button')?.focus(), 20)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      clearTimeout(t)
    }
  }, [open])

  const fontPct = Math.round(settings.fontScale * 100)
  const fontAtMin = settings.fontScale <= FONT_STEPS[0]
  const fontAtMax = settings.fontScale >= FONT_STEPS[FONT_STEPS.length - 1]

  return (
    <div ref={wrapRef} className="fixed bottom-4 right-4 z-[90] print:hidden">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={menu.title}
          className="absolute bottom-full right-0 mb-3 w-[20rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-line bg-white p-4 text-right shadow-lift"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-ink">{menu.title}</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">{menu.intro}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                btnRef.current?.focus()
              }}
              aria-label={menu.close}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-mist hover:text-ink"
            >
              <X className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>

          {/* Font size */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-wash p-2.5">
            <span className="ps-1 text-sm font-bold text-ink">{menu.fontSize}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepFont(-1)}
                disabled={fontAtMin}
                aria-label={menu.decrease}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-soft shadow-soft transition-colors hover:text-primary-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
              </button>
              <span className="w-12 text-center text-sm font-extrabold tabular-nums text-ink" aria-live="polite">
                {fontPct}%
              </span>
              <button
                type="button"
                onClick={() => stepFont(1)}
                disabled={fontAtMax}
                aria-label={menu.increase}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-soft shadow-soft transition-colors hover:text-primary-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Toggle grid */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {TOGGLES.map(({ key, icon: Ico, label }) => {
              const active = !!settings[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={active}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center text-xs font-bold transition-colors min-h-[72px] ${
                    active
                      ? 'border-primary bg-primary text-white shadow-soft'
                      : 'border-line bg-white text-ink-soft hover:border-primary/50 hover:text-primary-deep'
                  }`}
                >
                  <Ico className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:border-primary/50 hover:text-primary-deep min-h-[44px]"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
              {menu.reset}
            </button>
            <a
              href="/accessibility"
              className="text-center text-sm font-bold text-primary-deep underline underline-offset-4 hover:text-primary"
            >
              {menu.statementLink}
            </a>
          </div>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={menu.button}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-deep text-white shadow-lift transition-transform duration-200 hover:-translate-y-0.5 hover:bg-primary focus-visible:-translate-y-0.5"
      >
        <Accessibility className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  )
}
