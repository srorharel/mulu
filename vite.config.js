import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      basicSsl(),
    ],
    server: {
      host: true,
      port: 3000,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      exclude: ['support-app/**', '**/node_modules/**', '**/dist/**'],
      alias: {
        // Point to a minimal stub so tests don't require the real npm package.
        // The real package is lazy-loaded only at runtime in the browser.
        '@mediapipe/tasks-vision': new URL('./src/test/__mocks__/mediapipe-tasks-vision.js', import.meta.url).pathname,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'vendor-leaflet'
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion'
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
          },
        },
      },
    },
  }
})
