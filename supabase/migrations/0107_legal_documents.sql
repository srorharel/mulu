-- 0107_legal_documents.sql
--
-- DB-backed, admin-managed, versioned legal-documents system for three doc
-- types: consumer_terms, privacy_policy, washer_terms. Content (Markdown) lives
-- in the DB; agents publish new versions from the support-app. On publish a new
-- version row is inserted and atomically marked is_current (Phase 2 adds the
-- push fan-out trigger; this migration only lays the data layer + RPCs).
--
-- Creates:
--   • legal_documents              — versioned doc store, one is_current per (type,locale)
--   • user_legal_acknowledgments   — which version each user has acknowledged
--   • publish_legal_document()           (agent-only, atomic version bump + flip)
--   • get_current_legal_document()       (authenticated read, he-fallback)
--   • pending_legal_acknowledgments()    (role-filtered, locale-resolved)
--   • acknowledge_legal_document()       (own-row upsert)
-- Adds legal_documents to the supabase_realtime publication, and seeds v1 he
-- skeletons for all three doc types (privacy_policy + washer_terms marked
-- [למילוי]; consumer_terms is a labelled placeholder — no drafted terms exist
-- in the repo yet).

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.legal_documents (
  id             uuid        primary key default gen_random_uuid(),
  doc_type       text        not null check (doc_type in ('consumer_terms','privacy_policy','washer_terms')),
  locale         text        not null check (locale in ('he','en')),
  version        int         not null,
  title          text        not null,
  content        text        not null,   -- Markdown
  is_current     boolean     not null default false,
  effective_date date,
  published_at   timestamptz,
  published_by   uuid        references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- At most one current document per (doc_type, locale).
create unique index if not exists legal_documents_one_current_idx
  on public.legal_documents (doc_type, locale)
  where is_current;

-- One row per (doc_type, locale, version).
create unique index if not exists legal_documents_version_uidx
  on public.legal_documents (doc_type, locale, version);

create table if not exists public.user_legal_acknowledgments (
  user_id              uuid        not null references public.profiles(id) on delete cascade,
  doc_type             text        not null check (doc_type in ('consumer_terms','privacy_policy','washer_terms')),
  acknowledged_version int         not null,
  acknowledged_at      timestamptz not null default now(),
  primary key (user_id, doc_type)
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table public.legal_documents          enable row level security;
alter table public.user_legal_acknowledgments enable row level security;

-- Any authenticated user may read the CURRENT version of every doc type (the
-- client decides which to show by role). No direct client writes — publishing
-- goes through publish_legal_document() (SECURITY DEFINER) only.
drop policy if exists "Authenticated read current legal documents" on public.legal_documents;
create policy "Authenticated read current legal documents"
  on public.legal_documents for select
  to authenticated
  using (is_current = true);

-- Agents additionally read ALL versions (the support-app version-history list).
-- Permissive SELECT policies are OR'd: non-agents still only see current rows.
drop policy if exists "Agents read all legal document versions" on public.legal_documents;
create policy "Agents read all legal document versions"
  on public.legal_documents for select
  to authenticated
  using (public.is_agent());

-- Acknowledgments: each user sees / writes only their own rows.
drop policy if exists "Users select own legal acknowledgments" on public.user_legal_acknowledgments;
create policy "Users select own legal acknowledgments"
  on public.user_legal_acknowledgments for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own legal acknowledgments" on public.user_legal_acknowledgments;
create policy "Users insert own legal acknowledgments"
  on public.user_legal_acknowledgments for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own legal acknowledgments" on public.user_legal_acknowledgments;
create policy "Users update own legal acknowledgments"
  on public.user_legal_acknowledgments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Table-level grants (RLS still scopes the rows).
grant select on public.legal_documents to authenticated;
grant select, insert, update on public.user_legal_acknowledgments to authenticated;

-- ── 3. RPCs ───────────────────────────────────────────────────────────────────

-- publish_legal_document — agent-only. Computes the next version for
-- (doc_type, locale), demotes the existing current row, then inserts the new
-- row as is_current. Demote-before-insert keeps the partial unique index happy.
drop function if exists public.publish_legal_document(text, text, text, text, date);
create function public.publish_legal_document(
  p_doc_type      text,
  p_locale        text,
  p_title         text,
  p_content       text,
  p_effective_date date
)
returns public.legal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next int;
  v_row  public.legal_documents;
begin
  if not public.is_agent() then
    raise exception 'agent role required to publish legal documents';
  end if;
  if p_doc_type not in ('consumer_terms','privacy_policy','washer_terms') then
    raise exception 'invalid doc_type: %', p_doc_type;
  end if;
  if p_locale not in ('he','en') then
    raise exception 'invalid locale: %', p_locale;
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_content), '') = '' then
    raise exception 'title and content are required';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.legal_documents
  where doc_type = p_doc_type and locale = p_locale;

  update public.legal_documents
     set is_current = false
   where doc_type = p_doc_type and locale = p_locale and is_current;

  insert into public.legal_documents
    (doc_type, locale, version, title, content, is_current, effective_date, published_at, published_by)
  values
    (p_doc_type, p_locale, v_next, p_title, p_content, true, p_effective_date, now(), auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.publish_legal_document(text, text, text, text, date) from public;
grant execute on function public.publish_legal_document(text, text, text, text, date) to authenticated;

-- get_current_legal_document — returns the current published row for the
-- requested locale, falling back to 'he' if that locale has no current version.
drop function if exists public.get_current_legal_document(text, text);
create function public.get_current_legal_document(p_doc_type text, p_locale text)
returns setof public.legal_documents
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from public.legal_documents d
  where d.doc_type = p_doc_type
    and d.is_current
    and d.locale in (p_locale, 'he')
  order by (d.locale = p_locale) desc   -- exact-locale match wins over he fallback
  limit 1;
$$;

grant execute on function public.get_current_legal_document(text, text) to authenticated;

-- pending_legal_acknowledgments — for the calling user, the current docs they
-- have NOT yet acknowledged at the current version, filtered by role:
--   consumer → consumer_terms + privacy_policy
--   washer   → washer_terms   + privacy_policy
--   agent / super_admin → none
-- Locale resolved from profiles.locale, falling back to 'he'.
drop function if exists public.pending_legal_acknowledgments(uuid);
create function public.pending_legal_acknowledgments(p_user_id uuid)
returns table (
  doc_type       text,
  version        int,
  locale         text,
  title          text,
  content        text,
  effective_date date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   text;
  v_locale text;
  v_types  text[];
begin
  -- Callers may only query their own pending acknowledgments.
  if p_user_id is distinct from auth.uid() then
    raise exception 'can only query your own pending acknowledgments';
  end if;

  select p.role, coalesce(p.locale, 'he')
    into v_role, v_locale
  from public.profiles p
  where p.id = p_user_id;

  if v_role = 'consumer' then
    v_types := array['consumer_terms','privacy_policy'];
  elsif v_role = 'washer' then
    v_types := array['washer_terms','privacy_policy'];
  else
    return;   -- agents / super_admins have nothing to acknowledge
  end if;

  return query
  select d.doc_type, d.version, d.locale, d.title, d.content, d.effective_date
  from unnest(v_types) as ut(doc_type)
  join lateral (
    select ld.*
    from public.legal_documents ld
    where ld.doc_type = ut.doc_type
      and ld.is_current
      and ld.locale in (v_locale, 'he')
    order by (ld.locale = v_locale) desc
    limit 1
  ) d on true
  left join public.user_legal_acknowledgments a
    on a.user_id = p_user_id and a.doc_type = d.doc_type
  where a.acknowledged_version is null
     or a.acknowledged_version < d.version;
end;
$$;

grant execute on function public.pending_legal_acknowledgments(uuid) to authenticated;

-- acknowledge_legal_document — upsert the caller's acknowledgment for a doc type.
drop function if exists public.acknowledge_legal_document(text, int);
create function public.acknowledge_legal_document(p_doc_type text, p_version int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_doc_type not in ('consumer_terms','privacy_policy','washer_terms') then
    raise exception 'invalid doc_type: %', p_doc_type;
  end if;

  insert into public.user_legal_acknowledgments (user_id, doc_type, acknowledged_version, acknowledged_at)
  values (auth.uid(), p_doc_type, p_version, now())
  on conflict (user_id, doc_type)
  do update set acknowledged_version = excluded.acknowledged_version,
                acknowledged_at      = excluded.acknowledged_at;
end;
$$;

revoke all on function public.acknowledge_legal_document(text, int) from public;
grant execute on function public.acknowledge_legal_document(text, int) to authenticated;

-- ── 4. Realtime ───────────────────────────────────────────────────────────────
-- Open clients react to a publish without reload.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'legal_documents'
  ) then
    alter publication supabase_realtime add table public.legal_documents;
  end if;
end $$;

-- ── 5. Seed v1 (he, is_current) ───────────────────────────────────────────────
-- Idempotent: each insert is gated on no existing row for (doc_type, 'he').

insert into public.legal_documents (doc_type, locale, version, title, content, is_current, effective_date, published_at)
select 'consumer_terms', 'he', 1, 'תנאי שימוש',
$md$> **טיוטה — שלד למילוי.** יש להשלים את התוכן המשפטי המלא לפני פרסום ללקוחות.

## כללי
[למילוי]

## הגדרות
[למילוי]

## מהות השירות (פלטפורמת תיווך)
[למילוי]

## כשירות והרשמה
[למילוי]

## תהליך ההזמנה
[למילוי]

## מחירים, תשלום ומע"מ
[למילוי]

## ביטולים והחזרים
[למילוי]

## רמת שירות, נזקים ותלונות
[למילוי]

## פרטיות, מיקום וצילומים
[למילוי]

## התראות
[למילוי]

## שימושים אסורים
[למילוי]

## הגבלת אחריות
[למילוי]

## קניין רוחני
[למילוי]

## שינויים
[למילוי]

## דין וסמכות שיפוט
[למילוי]

## יצירת קשר
[למילוי]
$md$,
true, null, now()
where not exists (
  select 1 from public.legal_documents where doc_type = 'consumer_terms' and locale = 'he'
);

insert into public.legal_documents (doc_type, locale, version, title, content, is_current, effective_date, published_at)
select 'privacy_policy', 'he', 1, 'מדיניות פרטיות',
$md$> **טיוטה — שלד למילוי.** יש להשלים את התוכן המשפטי המלא לפני פרסום.

## כללי ומי אנחנו
[למילוי]

## איזה מידע נאסף (חשבון, רכב, מיקום GPS, צילומים, תשלום, שימוש ומכשיר)
[למילוי]

## כיצד נאסף
[למילוי]

## מטרות השימוש
[למילוי]

## מסירה לצדדים שלישיים (שוטפים, סולק תשלומים, Supabase/אחסון, FCM)
[למילוי]

## העברת מידע מחוץ לישראל
[למילוי]

## עוגיות וטכנולוגיות מעקב
[למילוי]

## אבטחת מידע
[למילוי]

## שמירה ומחיקה
[למילוי]

## זכויות נושא המידע (עיון, תיקון, מחיקה תוך 30 יום)
[למילוי]

## דיוור ושיווק (opt-in)
[למילוי]

## קטינים
[למילוי]

## שינויים
[למילוי]

## יצירת קשר וממונה הגנת פרטיות
[למילוי]
$md$,
true, null, now()
where not exists (
  select 1 from public.legal_documents where doc_type = 'privacy_policy' and locale = 'he'
);

insert into public.legal_documents (doc_type, locale, version, title, content, is_current, effective_date, published_at)
select 'washer_terms', 'he', 1, 'תנאי שימוש לשוטפים',
$md$> **טיוטה — שלד למילוי.** יש להשלים את התוכן המשפטי המלא לפני פרסום לשוטפים.

## כללי והגדרות
[למילוי]

## מעמד השוטף (עוסק עצמאי בלתי תלוי, אין יחסי עובד-מעביד)
[למילוי]

## תנאי הצטרפות ואימות (ת"ז, סלפי, רישיון עסק)
[למילוי]

## חובות וסטנדרט שירות
[למילוי]

## קבלת עבודות וביטול מצד השוטף
[למילוי]

## תמחור, מדרגות payout, עמלת פלטפורמה, מע"מ וחשבוניות
[למילוי]

## ציוד, ביטוח ואחריות
[למילוי]

## תיעוד (צילומי הגעה/סיום) ו-GPS
[למילוי]

## דירוגים, השעיה והשבתה
[למילוי]

## קניין רוחני וסודיות
[למילוי]

## הגנת פרטיות הצרכן
[למילוי]

## שיפוי
[למילוי]

## שינויים
[למילוי]

## דין וסמכות שיפוט
[למילוי]
$md$,
true, null, now()
where not exists (
  select 1 from public.legal_documents where doc_type = 'washer_terms' and locale = 'he'
);

-- ── 6. Reload PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
