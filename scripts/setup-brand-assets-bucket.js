#!/usr/bin/env node
// scripts/setup-brand-assets-bucket.js
// Fallback creator for the brand-assets storage bucket (public, 10 MB,
// jpg/png/webp/svg). Mirrors scripts/create-verification-bucket.mjs.
//
// 0071_brand_assets.sql tries to create the bucket via SQL INSERT INTO
// storage.buckets. If that fails on a project where the service role can't
// write to storage.buckets directly, run this script with the service-role
// key — it uses the admin SDK to create the bucket and then re-applies 0071
// to install the RLS policies and the app_branding table.
//
// Usage:
//   node scripts/setup-brand-assets-bucket.js

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  try {
    const raw = readFileSync(envPath, 'utf8')
    const env = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    }
    return env
  } catch {
    return {}
  }
}

const env = { ...parseEnv(), ...process.env }
const supabaseUrl = env.VITE_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const BUCKET_ID = 'brand-assets'

async function run() {
  console.log(`Ensuring bucket "${BUCKET_ID}" exists…`)

  const { data: existing } = await supabase.storage.getBucket(BUCKET_ID)
  if (existing) {
    console.log(`  Bucket already exists (id=${existing.id}, public=${existing.public})`)
    const { error } = await supabase.storage.updateBucket(BUCKET_ID, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    })
    if (error) throw error
    console.log('  Settings updated.')
  } else {
    const { error } = await supabase.storage.createBucket(BUCKET_ID, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    })
    if (error) throw error
    console.log('  Bucket created.')
  }

  console.log('Done. Now run: npm run db:migrate')
}

run().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
