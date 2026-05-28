/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Permanent light theme — no `.dark` toggle. darkMode kept on 'class'
  // (not 'media') so the OS preference can't accidentally darken the surface.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Surface scale (light) ───────────────────────────────────────────
        // Page sits on a faint off-white; cards/header sit on pure white so
        // they pop one step forward. elevated-2 / high are the hover layers.
        surface: {
          DEFAULT:      '#fafafa',  // page background
          elevated:     '#ffffff',  // cards, header, side rail
          'elevated-2': '#f4f4f5',  // hover surfaces, inset chips
          high:         '#e4e4e7',  // pressed / strong-emphasis chips
        },
        // ── Ink (text) ──────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#18181b',  // zinc-900, primary text
          muted:   '#52525b',  // zinc-600, secondary
          subtle:  '#a1a1aa',  // zinc-400, placeholder / hint
        },
        // ── Border/divider ──────────────────────────────────────────────────
        edge: {
          DEFAULT: '#e4e4e7',  // zinc-200, resting borders
          strong:  '#d4d4d8',  // zinc-300, hover/focus borders
        },
        // ── Admin accent: amber/gold (distinguishes from agent's mint) ──────
        // DEFAULT is kept as the brand amber for surfaces (buttons, soft
        // backgrounds, borders). For TEXT on a white surface, prefer
        // text-admin-deep — admin DEFAULT (#E8B547) fails contrast on white.
        admin: {
          DEFAULT: '#E8B547',
          deep:    '#A87C1B',
          soft:    'rgba(232,181,71,0.16)',
        },
        // ── Semantic states ─────────────────────────────────────────────────
        success: { DEFAULT: '#16a34a', 500: '#22c55e', 600: '#16a34a' },
        warning: { DEFAULT: '#d97706', 500: '#f59e0b', 600: '#d97706' },
        danger:  { DEFAULT: '#dc2626', 500: '#ef4444', 600: '#dc2626' },
        // ── Glass surfaces (light) ──────────────────────────────────────────
        glass: {
          DEFAULT: 'rgba(255,255,255,0.70)',
          border:  'rgba(0,0,0,0.06)',
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
