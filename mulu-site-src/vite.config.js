import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Builds the MULU marketing site. Output is synced into ../mulu-site-cloudflare
// (the Cloudflare Pages publish dir) via `npm run sync`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // single CSS/JS chunk keeps the static deploy identical in shape to today's bundle
    cssCodeSplit: false,
  },
})
