/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Surface scale ───────────────────────────────────────────────────────
        surface: {
          DEFAULT:      '#0c0d12',
          elevated:     '#15171f',
          'elevated-2': '#1a1d27',
          high:         '#22252f',
        },
        // ── Ink (text) scale ────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#f4f5f7',
          muted:   '#a3a8b8',
          subtle:  '#6b7388',
        },
        // ── Border/divider ──────────────────────────────────────────────────────
        edge: {
          DEFAULT: '#23262f',
          strong:  '#2e323d',
        },
        // ── Brand: consumer green ───────────────────────────────────────────────
        accent: {
          DEFAULT: '#7DD9A2',
          muted:   'rgba(125,217,162,0.16)',
        },
        // ── Agent green (#3FB58F) — distinct from lighter consumer #7DD9A2 ──────
        agent: {
          DEFAULT: '#3FB58F',
          deep:    '#1F7A5E',
          soft:    'rgba(63,181,143,0.16)',
        },
        // ── Semantic states ─────────────────────────────────────────────────────
        success: { DEFAULT: '#22c55e', 500: '#22c55e', 600: '#16a34a' },
        warning: { DEFAULT: '#f59e0b', 500: '#f59e0b', 600: '#d97706' },
        danger:  { DEFAULT: '#ef4444', 500: '#ef4444', 600: '#dc2626' },
        // ── Glass surfaces ──────────────────────────────────────────────────────
        glass: {
          DEFAULT: 'rgba(21,23,31,0.70)',
          border:  'rgba(255,255,255,0.06)',
        },
        // ── Keep primary for any remaining btn-primary references ───────────────
        primary: {
          50:  '#F3FCF7',
          100: '#E5F6EC',
          500: '#3FB58F',
          600: '#1F7A5E',
          700: '#165a44',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
