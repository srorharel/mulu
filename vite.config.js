import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  return {
    plugins: [
      react(),
    ],
    server: {
      host: true,
      port: 3000,
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
