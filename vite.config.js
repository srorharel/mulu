import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const PLACEHOLDER_URL = 'https://your-project-id.supabase.co'
const PLACEHOLDER_KEY = 'your-anon-key-here'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      // Fail the build immediately if Supabase credentials are missing or placeholder.
      // Runs only during `vite build`, not the dev server.
      command === 'build' && {
        name: 'env-guard',
        buildStart() {
          const errors = []
          const url = env.VITE_SUPABASE_URL
          const key = env.VITE_SUPABASE_ANON_KEY
          if (!url || url === PLACEHOLDER_URL)
            errors.push('VITE_SUPABASE_URL is missing or still a placeholder')
          if (!key || key === PLACEHOLDER_KEY)
            errors.push('VITE_SUPABASE_ANON_KEY is missing or still a placeholder')
          if (errors.length)
            throw new Error(`\nBuild aborted — fix .env first:\n  ${errors.join('\n  ')}\n`)
        },
      },
    ].filter(Boolean),
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
