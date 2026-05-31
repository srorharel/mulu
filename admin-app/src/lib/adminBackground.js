// admin-app/src/lib/adminBackground.js
//
// Data layer for the PER-ADMIN personal console background (migration 0102).
// Each super_admin uploads ONE private image stored at
//   admin-backgrounds/{user_id}/background.{ext}
// and keeps a single OWN row in `admin_background_prefs`. RLS guarantees an
// admin can only ever touch their own folder + their own row.
//
// ISOLATION (mission Step 4): this module is the ONLY place the admin app reads
// or writes the personal background. It touches EXACTLY one table
// (`admin_background_prefs`) and one bucket (`admin-backgrounds`). NOTHING in the
// consumer / washer / support apps imports it. The behavioural guard in
// __tests__/adminBackground.test.js asserts no other table/bucket is reached.

import { supabase } from './supabase.js'

export const BUCKET = 'admin-backgrounds'
export const TABLE  = 'admin_background_prefs'

export const MAX_BYTES       = 10 * 1024 * 1024 // 10 MB — matches the bucket limit
export const OPACITY_MAX     = 0.5              // hard cap: bg can never hide text
export const OPACITY_DEFAULT = 0.15             // faint wash by default

// jpg / png / webp — matches the bucket's allowed_mime_types.
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}
export const ALLOWED_TYPES = Object.keys(MIME_EXT)

// Clamp opacity into [0, OPACITY_MAX]. Non-numeric → default. Enforced again by
// a CHECK constraint on the column, so a tampered client cannot store > 0.5.
export function clampOpacity(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return OPACITY_DEFAULT
  return Math.min(OPACITY_MAX, Math.max(0, v))
}

// Resolve a safe extension from the MIME type (falls back to the file name).
export function extForFile(file) {
  if (file?.type && MIME_EXT[file.type]) return MIME_EXT[file.type]
  const fromName = (file?.name?.split('.').pop() || '').toLowerCase()
  if (fromName === 'jpeg') return 'jpg'
  if (fromName === 'jpg' || fromName === 'png' || fromName === 'webp') return fromName
  return null
}

// User-namespaced storage path. ALWAYS prefixed by the user id so the storage
// policy `(storage.foldername(name))[1] = auth.uid()` scopes it to the owner.
export function backgroundPath(userId, ext) {
  return `${userId}/background.${ext}`
}

// Client-side validation, mirrored by the bucket limits + RLS. Returns
// { ok: true } or { ok: false, error }.
export function validateFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Use a JPG, PNG or WebP image.' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'Image is larger than 10 MB.' }
  }
  return { ok: true }
}

// ── Reads ──────────────────────────────────────────────────────────────────

// The caller's own pref row. WHERE user_id = <self>; RLS also enforces own-row,
// so this can only ever return the current admin's preference (or null).
export async function fetchPrefs(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, image_path, opacity, enabled, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Signed URL for the private object (bucket is NOT public-read). Returns null on
// error so the shell can quietly fall back to the plain default background.
export async function signedBackgroundUrl(path, ttl = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl)
  if (error) return null
  return data?.signedUrl ?? null
}

// ── Writes (own folder / own row only) ───────────────────────────────────────

// Validate + upload to the user-namespaced path, returning the stored path.
// upsert:true replaces the object in place so the column path stays stable.
export async function uploadBackground({ userId, file }) {
  const v = validateFile(file)
  if (!v.ok) throw new Error(v.error)
  const ext = extForFile(file)
  if (!ext) throw new Error('Unsupported image type.')
  const path = backgroundPath(userId, ext)
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return path
}

// Upsert the own pref row. opacity is clamped to the cap before persisting.
export async function savePrefs({ userId, image_path, opacity, enabled }) {
  const row = {
    user_id:    userId,
    image_path: image_path ?? null,
    opacity:    clampOpacity(opacity),
    enabled:    enabled !== false,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from(TABLE).upsert(row)
  if (error) throw error
  return row
}

// Remove the stored object + null the path (keeps the row so opacity/enabled
// preferences survive). Reverts the console to the plain default background.
export async function removeBackground({ userId, image_path }) {
  if (image_path) {
    // Best-effort delete; RLS scopes it to the owner's folder.
    await supabase.storage.from(BUCKET).remove([image_path])
  }
  const { error } = await supabase
    .from(TABLE)
    .update({ image_path: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}
