/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand palette (mirrors main Wash app) ──────────────────────────
        primary: {
          50:  '#F3FCF7',
          100: '#E5F6EC',
          500: '#7DD9A2',
          600: '#47D17F',
          700: '#26B55F',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706' },
        danger:  { 50: '#fff1f2', 500: '#ef4444', 600: '#dc2626' },
        indigo:  { 50: '#eef2ff', 500: '#6366f1', 600: '#4f46e5', 900: '#312e81' },

        // ── Semantic tokens — hardcoded to dark values (support app is
        //    dark-only; no runtime CSS-variable theming needed here).
        //    Using direct hex/rgb so that Tailwind's /opacity modifier works
        //    (e.g. ring-accent/30, bg-surface-elevated/60, text-ink-muted/50).
        surface: {
          DEFAULT:  '#0f1117',
          elevated: '#1a1d27',
        },
        ink: {
          DEFAULT: '#f5f5f5',
          muted:   '#a3a3a3',
          subtle:  '#555e73',
        },
        edge: '#2a2d3a',
        accent: {
          DEFAULT: '#7DD9A2',
          // rgba for pre-computed semi-transparent fills (no /opacity modifier needed)
          muted:   'rgba(125, 217, 162, 0.18)',
        },
        glass: {
          DEFAULT: 'rgba(26, 29, 39, 0.50)',
          border:  'rgba(255, 255, 255, 0.08)',
        },

        // ── Agent-specific color ────────────────────────────────────────────
        // Violet (#7C3AED) distinguishes agent messages from washer teal and
        // consumer primary green — per original build spec.
        agent: {
          DEFAULT: '#7C3AED',
          muted:   'rgba(124, 58, 237, 0.18)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
