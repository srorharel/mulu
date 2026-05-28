// "3 min ago", "yesterday" — minimal formatter that delegates to Intl
// when available, falls back to a hand-rolled English string. Locale is
// inherited from the browser, which is fine for an English-first admin.

const STEPS = [
  { unit: 'year',   ms: 365 * 24 * 3600 * 1000 },
  { unit: 'month',  ms:  30 * 24 * 3600 * 1000 },
  { unit: 'week',   ms:   7 * 24 * 3600 * 1000 },
  { unit: 'day',    ms:   1 * 24 * 3600 * 1000 },
  { unit: 'hour',   ms:        3600 * 1000 },
  { unit: 'minute', ms:          60 * 1000 },
  { unit: 'second', ms:              1000 },
]

export function relativeTime(input, locale) {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  for (const { unit, ms } of STEPS) {
    if (abs >= ms || unit === 'second') {
      const value = Math.round(diffMs / ms)
      try {
        const rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' })
        return rtf.format(value, unit)
      } catch {
        const n = Math.abs(value)
        const word = n === 1 ? unit : `${unit}s`
        return value < 0 ? `${n} ${word} ago` : `in ${n} ${word}`
      }
    }
  }
  return ''
}
