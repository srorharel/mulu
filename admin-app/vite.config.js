import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Admin app — web-only. No Capacitor, no leaflet, no mediapipe.
// Distinct storageKey isolates auth from main app + support-app even on the same domain.

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 3002, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('@supabase'))     return 'vendor-supabase'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
  },
})
