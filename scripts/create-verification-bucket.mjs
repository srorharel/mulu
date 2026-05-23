#!/usr/bin/env node
// scripts/create-verification-bucket.mjs
// Fallback: creates the washer-verification storage bucket using the Supabase
// JS admin client (service role key). Run when SQL migrations can't be applied
// directly.
//
// Usage:
//   npm run setup:buckets

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

const BUCKET_ID = 'washer-verification'

async function run() {
  console.log(`Ensuring bucket "${BUCKET_ID}" exists…`)

  const { data: existing } = await supabase.storage.getBucket(BUCKET_ID)
  if (existing) {
    console.log(`  Bucket already exists (id=${existing.id}, public=${existing.public})`)
    const { error: updateErr } = await supabase.storage.updateBucket(BUCKET_ID, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    })
    if (updateErr) throw updateErr
    console.log('  Settings updated.')
  } else {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET_ID, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    })
    if (createErr) throw createErr
    console.log('  Bucket created.')
  }

  console.log('Done. Apply supabase/migrations/0061_improve_washer_verification_bucket.sql')
  console.log('to set Storage RLS policies (run: npm run db:migrate).')
}

run().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
