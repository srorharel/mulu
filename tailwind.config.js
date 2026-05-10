/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Existing palette (all consumers of primary-*, success-*, etc. unchanged) ──
        primary: {
          50:  '#F3FCF7',
          100: '#E5F6EC',
          200: '#D4EDDE',
          300: '#B9E5CB',
          400: '#9CDEB6',
          500: '#7DD9A2',
          600: '#47D17F',
          700: '#26B55F',
          800: '#1C8747',
          900: '#135C30',
        },
        success: {
          50:  '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50:  '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50:  '#fff1f2',
          500: '#ef4444',
          600: '#dc2626',
        },
        // ── Semantic tokens — resolved by CSS vars in index.css ──────────────────
        // Light defaults live in :root; Worker dark overrides live in .dark {}
        // Usage: bg-surface, bg-surface-elevated, bg-surface-glass
        //        text-ink, text-ink-muted
        //        border-edge
        //        bg-accent, bg-accent-muted
        surface: {
          DEFAULT:  'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          glass:    'var(--color-surface-glass)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted:   'var(--color-ink-muted)',
        },
        edge:   'var(--color-edge)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          muted:   'var(--color-accent-muted)',
        },
        // Phase C — glass primitives
        // Usage: bg-glass, border-glass-border
        glass: {
          DEFAULT: 'var(--color-glass-surface)',
          border:  'var(--color-glass-border)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
