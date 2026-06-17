// Sync the Vite build output into ../mulu-site-cloudflare (the Cloudflare Pages
// publish dir) without touching deploy-only files (.wrangler, .claude, _redirects
// is regenerated from public/). Run via `npm run sync` after `npm run build`.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const target = join(here, '..', '..', 'mulu-site-cloudflare')

// Files/dirs in the target we must never delete.
const KEEP = new Set(['.wrangler', '.claude', '.git'])

if (!existsSync(dist)) {
  console.error('✗ No dist/ — run `npm run build` first.')
  process.exit(1)
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const s = join(from, entry)
    const d = join(to, entry)
    if (statSync(s).isDirectory()) copyDir(s, d)
    else copyFileSync(s, d)
  }
}

// 1. Clear stale top-level build artifacts (old index.html + old assets/) but keep KEEP set.
for (const entry of readdirSync(target)) {
  if (KEEP.has(entry)) continue
  rmSync(join(target, entry), { recursive: true, force: true })
}

// 2. Copy fresh build over.
copyDir(dist, target)

console.log('✓ Synced dist/ → mulu-site-cloudflare/')
