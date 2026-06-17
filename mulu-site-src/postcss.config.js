// Empty on purpose. Tailwind v4 is processed by @tailwindcss/vite (see
// vite.config.js). This local config exists only to stop Vite from walking up
// to the parent app's Tailwind v3 PostCSS config and applying it to this
// project's v4 CSS (which uses @theme / @layer without @tailwind directives).
export default { plugins: {} }
