// Re-export from the canonical home in the main app's src/lib/.
// support-app/vite.config.js has `server.fs.allow: ['..']` for dev; the
// Vercel build (rooted in support-app/) bundles it via Rollup, which has no
// fs.allow restriction.
export * from '../../../src/lib/designOverrides.js'
