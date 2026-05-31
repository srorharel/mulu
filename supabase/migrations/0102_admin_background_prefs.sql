-- Migration 0102: per-admin personal console background (private, own-row only).
--
-- Each super_admin may upload ONE personal background image that renders behind
-- the admin console UI. It is a PERSONAL PREFERENCE, not content management:
--   * PER USER  — keyed by user_id; an admin only ever sees their own image.
--   * PRIVATE   — bucket is NOT public-read; images are reached via short-lived
--                 signed URLs (admin-app/src/lib/adminBackground.js).
--   * ISOLATED  — nothing in the consumer / washer / support apps reads this
--                 table or bucket. Admin-console-only (ADR — Step 4 of the mission).
--
-- Storage:  dedicated PRIVATE bucket `admin-backgrounds` (preferred over reusing
--           the public `brand-assets` bucket, since these are personal and must
--           not mix with public brand assets). 10 MB, jpg/png/webp. One object per
--           admin at `{user_id}/background.{ext}`.
--
-- ISOLATION GUARANTEE — both the storage policies and the table policies are
-- scoped to the OWNER, not blanket super_admin. Admin A can never read, list,
-- overwrite, or delete admin B's image or pref row:
--   * storage : (storage.foldername(name))[1] = auth.uid()::text  (own folder)
--   * table   : user_id = auth.uid()                              (own row)
--
-- Per the 0090 lesson, the own-row SELECT policy is included in THIS migration —
-- a missing super_admin SELECT policy surfaces as a silently-empty read, not an
-- error. No inner BEGIN/COMMIT (the runner wraps each file in one transaction).

-- ── 1. Private storage bucket ────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-backgrounds',
  'admin-backgrounds',
  false,                                          -- PRIVATE (not public-read)
  10485760,                                       -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS — per-user, own-folder only (NOT blanket super_admin) ──────
-- A single FOR ALL policy covers INSERT / SELECT / UPDATE / DELETE. The
-- `(storage.foldername(name))[1] = auth.uid()::text` predicate scopes every
-- operation to the caller's own `{user_id}/` prefix, so admin A's auth.uid()
-- never matches admin B's folder. is_super_admin() is an extra gate so only
-- admins can create objects here at all.
drop policy if exists "admin_backgrounds_own_folder_all" on storage.objects;

create policy "admin_backgrounds_own_folder_all"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'admin-backgrounds'
    and public.is_super_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'admin-backgrounds'
    and public.is_super_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. Preference table — one own-row per admin ──────────────────────────────
create table if not exists public.admin_background_prefs (
  user_id    uuid        primary key references public.profiles(id) on delete cascade,
  image_path text,                                            -- storage path; null = no custom bg
  opacity    numeric     not null default 0.15 check (opacity >= 0 and opacity <= 0.5),
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_background_prefs enable row level security;

-- ── 4. Table RLS — strictly OWN-ROW (user_id = auth.uid()), no anon ───────────
-- Each policy is own-row scoped AND gated to super_admin. This is deliberately
-- NOT a blanket `is_super_admin()` policy (that would let any admin read every
-- admin's row). SELECT is included here per the 0090 lesson.
drop policy if exists "admin_bg_prefs own select" on public.admin_background_prefs;
drop policy if exists "admin_bg_prefs own insert" on public.admin_background_prefs;
drop policy if exists "admin_bg_prefs own update" on public.admin_background_prefs;
drop policy if exists "admin_bg_prefs own delete" on public.admin_background_prefs;

create policy "admin_bg_prefs own select"
  on public.admin_background_prefs for select
  to authenticated
  using (user_id = auth.uid() and public.is_super_admin());

create policy "admin_bg_prefs own insert"
  on public.admin_background_prefs for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_super_admin());

create policy "admin_bg_prefs own update"
  on public.admin_background_prefs for update
  to authenticated
  using (user_id = auth.uid() and public.is_super_admin())
  with check (user_id = auth.uid() and public.is_super_admin());

create policy "admin_bg_prefs own delete"
  on public.admin_background_prefs for delete
  to authenticated
  using (user_id = auth.uid() and public.is_super_admin());
