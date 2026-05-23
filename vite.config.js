import { defineConfig } from 'vite'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Resolve @mediapipe/tasks-vision to a local stub when the package is not
// installed (e.g. during CI or on networks that block the npm registry).
// When the package IS installed, the alias is an empty object and Vite uses
// the real package — MediaPipe then works as a face-detection fallback.
const mediapipeStub = fileURLToPath(
  new URL('./src/test/__mocks__/mediapipe-tasks-vision.js', import.meta.url)
)
const mediapipeInstalled = existsSync(
  fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision', import.meta.url))
)
const mediapipeAlias = mediapipeInstalled
  ? {}
  : { '@mediapipe/tasks-vision': mediapipeStub }

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
    resolve: {
      alias: mediapipeAlias,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      exclude: ['support-app/**', '**/node_modules/**', '**/dist/**'],
      alias: {
        // Always use the stub in tests — avoids network access and keeps tests fast.
        '@mediapipe/tasks-vision': mediapipeStub,
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
