import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 3001,
    strictPort: true,
    // Allow src/lib/contentOverrides.js (one folder up) during dev.
    fs: { allow: ['..'] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('@supabase'))     return 'vendor-supabase'
          if (id.includes('leaflet'))       return 'vendor-leaflet'
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
