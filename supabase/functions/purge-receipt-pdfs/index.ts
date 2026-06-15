// Edge Function: purge-receipt-pdfs
//
// Deletes archived receipt PDFs from the private 'receipts' bucket ~6 months
// (retention_days, default 180) after the receipt was issued, then nulls
// receipts.pdf_path + stamps pdf_purged_at. Reclaims storage only — the receipt
// ROW (a legal/financial חשבונית מס/קבלה record) is KEPT, and the admin "Resend"
// button regenerates an identical PDF from the row snapshot on demand.
//
// Invoked daily by pg_cron → public.purge_receipt_pdfs_tick() → net.http_post
// (migration 0122). Can also be run manually from the Supabase dashboard.
//
// The candidate list comes from the SECURITY DEFINER RPC
// public.list_purgeable_receipt_pdfs(); this function only performs the Storage
// deletion (which raw SQL can't do reliably) and records it via
// public.mark_receipt_pdfs_purged().
//
// Auth: timing-safe Bearer check against TRIGGER_SECRET (= service_role_key),
// matching fan-out-legal-update / send-receipt / purge-stale-photos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'receipts'
const REMOVE_CHUNK = 100 // max object paths per storage.remove() call

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aB = enc.encode(a)
  const bB = enc.encode(b)
  if (aB.length !== bB.length) return false
  let diff = 0
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i]
  return diff === 0
}

interface PurgeRow { receipt_id: string; path: string }

Deno.serve(async (req) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearer        = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!triggerSecret || !timingSafeEqual(bearer, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  let retentionDays = 180
  try {
    const body = await req.json()
    if (typeof body?.retention_days === 'number' && body.retention_days > 0) {
      retentionDays = Math.floor(body.retention_days)
    }
  } catch { /* empty body → default 180 (~6 months) */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, triggerSecret)

  // ── Candidate objects ─────────────────────────────────────────────────────────
  const { data: rows, error } = await supabase.rpc('list_purgeable_receipt_pdfs', {
    p_retention_days: retentionDays,
  })
  if (error) {
    console.error('list_purgeable_receipt_pdfs failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const candidates = (rows ?? []) as PurgeRow[]
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ receipts: 0, deleted: 0, message: 'nothing to purge' }), { status: 200 })
  }

  // Map each storage path back to its receipt so we only mark a receipt purged
  // once its PDF was actually removed (a failed remove leaves it for the next
  // run rather than nulling pdf_path while the blob still exists).
  const receiptIdByPath = new Map<string, string>()
  const paths: string[] = []
  for (const r of candidates) {
    if (!r.path) continue
    receiptIdByPath.set(r.path, r.receipt_id)
    paths.push(r.path)
  }

  const purgedReceiptIds: string[] = []
  let deletedObjects = 0
  let failedChunks   = 0

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK)
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(chunk)
    if (rmErr) {
      console.error(`remove failed (bucket ${BUCKET}, ${chunk.length} paths):`, rmErr.message)
      failedChunks += 1
    } else {
      deletedObjects += chunk.length
      for (const p of chunk) {
        const id = receiptIdByPath.get(p)
        if (id) purgedReceiptIds.push(id)
      }
    }
  }

  // ── Record the purge (null pdf_path + stamp pdf_purged_at) ─────────────────────
  if (purgedReceiptIds.length > 0) {
    const { error: markErr } = await supabase.rpc('mark_receipt_pdfs_purged', {
      p_receipt_ids: purgedReceiptIds,
    })
    if (markErr) {
      console.error('mark_receipt_pdfs_purged failed:', markErr.message)
      return new Response(JSON.stringify({ error: markErr.message, deletedObjects }), { status: 500 })
    }
  }

  return new Response(JSON.stringify({
    receipts:      candidates.length,
    purgedReceipts: purgedReceiptIds.length,
    failedChunks,
    deletedObjects,
    retentionDays,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
