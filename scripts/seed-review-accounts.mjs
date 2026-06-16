#!/usr/bin/env node
// scripts/seed-review-accounts.mjs
//
// Creates two demo accounts for Apple/Google app reviewers:
//   • a CONSUMER (with a saved vehicle so booking can be demoed)
//   • a pre-APPROVED WASHER (so the washer side is visible without going
//     through manual verification)
//
// Put the credentials it prints into App Review notes (Apple) and the
// "App access" / testing-instructions (Google).
//
// Requires a SERVICE ROLE key (admin). Reads from env or .env:
//   SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
//
// Run:  node scripts/seed-review-accounts.mjs
// Safe to re-run — if an account already exists it is reused and updated.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Load .env (fallback to process.env) ──────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dir, '..', '.env')
  const out = { ...process.env }
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const eq = t.indexOf('=')
      out[t.slice(0, eq).trim()] ??= t.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
    }
  }
  return out
}
const env = loadEnv()
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in env/.env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── Demo accounts — change the passwords if you like ─────────────────────────
const CONSUMER = { email: 'review.consumer@muluwash.com', password: 'MuluReview!2026', full_name: 'App Review Consumer', phone: '0500000001' }
const WASHER   = { email: 'review.washer@muluwash.com',   password: 'MuluReview!2026', full_name: 'App Review Washer',   phone: '0500000002' }
const SERVICE_AREAS = ['holon', 'rishon_lezion', 'bat_yam']

async function findUserByEmail(email) {
  // Paginate listUsers until found (fine for small projects).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

async function ensureUser({ email, password, full_name, phone, role }) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role, full_name, phone, accepted_legal: 'true' },
  })
  if (!error) { console.log(`  created ${role}: ${email}`); return data.user }

  if (/already.*registered|exists/i.test(error.message)) {
    const existing = await findUserByEmail(email)
    if (!existing) throw new Error(`exists but not found: ${email}`)
    await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    console.log(`  reused ${role}: ${email}`)
    return existing
  }
  throw error
}

async function main() {
  console.log('Seeding app-review accounts…')

  // 1) Consumer + a saved default vehicle
  const consumer = await ensureUser({ ...CONSUMER, role: 'consumer' })
  await admin.from('profiles').update({ locale: 'he', full_name: CONSUMER.full_name, phone: CONSUMER.phone }).eq('id', consumer.id)
  // Upsert one default vehicle (delete-then-insert keeps it idempotent).
  await admin.from('vehicles').delete().eq('consumer_id', consumer.id)
  const { error: vErr } = await admin.from('vehicles').insert({
    consumer_id: consumer.id, plate: '12-345-67', nickname: 'Review car',
    make: 'Toyota', model: 'Corolla', year: 2022, color: 'white',
    category: 'private', is_default: true,
  })
  if (vErr) console.warn('  ! vehicle insert failed (adjust columns?):', vErr.message)

  // 2) Pre-approved washer
  const washer = await ensureUser({ ...WASHER, role: 'washer' })
  const { error: wErr } = await admin.from('profiles').update({
    role: 'washer', locale: 'he',
    full_name: WASHER.full_name, phone: WASHER.phone,
    washer_verification_status: 'approved',
    washer_service_areas: SERVICE_AREAS,
  }).eq('id', washer.id)
  if (wErr) console.warn('  ! washer profile update failed (adjust columns?):', wErr.message)

  console.log('\n✅ Done. Put these in App Review notes / Play testing instructions:\n')
  console.log(`   Consumer — ${CONSUMER.email} / ${CONSUMER.password}`)
  console.log(`   Washer   — ${WASHER.email} / ${WASHER.password}  (pre-approved)\n`)
  console.log('   Note: washer document-verification rows are NOT seeded; the washer')
  console.log('   dashboard is unlocked via profiles.washer_verification_status = approved.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
