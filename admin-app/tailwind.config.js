/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Surface scale (deeper than support-app — internal console feel) ──
        surface: {
          DEFAULT:      '#08090d',
          elevated:     '#10131a',
          'elevated-2': '#161a23',
          high:         '#1e222d',
        },
        // ── Ink (text) ──────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#f4f5f7',
          muted:   '#a3a8b8',
          subtle:  '#6b7388',
        },
        // ── Border/divider ──────────────────────────────────────────────────
        edge: {
          DEFAULT: '#23262f',
          strong:  '#2e323d',
        },
        // ── Admin accent: amber/gold (distinguishes from agent's mint) ──────
        admin: {
          DEFAULT: '#E8B547',
          deep:    '#A87C1B',
          soft:    'rgba(232,181,71,0.16)',
        },
        // ── Semantic states ─────────────────────────────────────────────────
        success: { DEFAULT: '#22c55e', 500: '#22c55e', 600: '#16a34a' },
        warning: { DEFAULT: '#f59e0b', 500: '#f59e0b', 600: '#d97706' },
        danger:  { DEFAULT: '#ef4444', 500: '#ef4444', 600: '#dc2626' },
        // ── Glass surfaces ──────────────────────────────────────────────────
        glass: {
          DEFAULT: 'rgba(16,19,26,0.70)',
          border:  'rgba(255,255,255,0.06)',
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
