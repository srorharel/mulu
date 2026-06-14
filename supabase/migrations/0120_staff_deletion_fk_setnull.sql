-- 0120_staff_deletion_fk_setnull.sql
--
-- Extends 0109 (which relaxed orders/order_events) to EVERY remaining FK that
-- referenced public.profiles(id) with ON DELETE NO ACTION / RESTRICT. Those FKs
-- made it impossible to delete a profile (from the admin Edge Function, the
-- Supabase dashboard, or a raw SQL delete) once the user had any staff activity
-- (audit rows, config edits, approvals, impersonation tokens) or chat history.
--
-- Policy (same as 0109's anonymize-vs-delete):
--   • AUTHOR / ACTOR columns on audit, config, financial, and legal rows → SET
--     NULL. The row (and its history/financials) survives; only the link to the
--     now-deleted staff member is nulled. NOT NULL audit columns drop NOT NULL
--     first (like orders.consumer_id did in 0109).
--   • USER-OWNED CHAT (order_messages, support_messages, support_conversations)
--     → CASCADE. The content dies with the user — consistent with support_tickets,
--     which already cascades, and with what delete-account/admin-user-mgmt already
--     delete explicitly. This also makes the raw dashboard delete work.
--   • impersonation_tokens.admin_id → CASCADE. Tokens are short-lived & single-use;
--     the durable audit trail is the admin_user_audit 'impersonation_issued' row.
--
-- After this migration NO FK to profiles(id) is NO ACTION/RESTRICT, so deleting a
-- profile (or its auth.users row) succeeds from any path. The admin/in-app delete
-- functions still additionally anonymize order/receipt PII + purge storage.

-- ── A. Nullable author/actor columns → SET NULL ──────────────────────────────
alter table public.admin_change_history   drop constraint if exists admin_change_history_changed_by_fkey;
alter table public.admin_change_history    add constraint admin_change_history_changed_by_fkey
  foreign key (changed_by) references public.profiles(id) on delete set null;

alter table public.app_branding            drop constraint if exists app_branding_updated_by_fkey;
alter table public.app_branding             add constraint app_branding_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.app_config              drop constraint if exists app_config_updated_by_fkey;
alter table public.app_config               add constraint app_config_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.broadcast_notifications drop constraint if exists broadcast_notifications_created_by_fkey;
alter table public.broadcast_notifications  add constraint broadcast_notifications_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.content_overrides       drop constraint if exists content_overrides_updated_by_fkey;
alter table public.content_overrides        add constraint content_overrides_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.design_overrides        drop constraint if exists design_overrides_updated_by_fkey;
alter table public.design_overrides         add constraint design_overrides_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.legal_documents         drop constraint if exists legal_documents_published_by_fkey;
alter table public.legal_documents          add constraint legal_documents_published_by_fkey
  foreign key (published_by) references public.profiles(id) on delete set null;

alter table public.orders                  drop constraint if exists orders_approved_by_fkey;
alter table public.orders                   add constraint orders_approved_by_fkey
  foreign key (approved_by) references public.profiles(id) on delete set null;

alter table public.orders                  drop constraint if exists orders_created_by_admin_fkey;
alter table public.orders                   add constraint orders_created_by_admin_fkey
  foreign key (created_by_admin) references public.profiles(id) on delete set null;

alter table public.orders                  drop constraint if exists orders_declined_by_fkey;
alter table public.orders                   add constraint orders_declined_by_fkey
  foreign key (declined_by) references public.profiles(id) on delete set null;

alter table public.payout_tier_config      drop constraint if exists payout_tier_config_updated_by_fkey;
alter table public.payout_tier_config       add constraint payout_tier_config_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.pricing_config          drop constraint if exists pricing_config_updated_by_fkey;
alter table public.pricing_config           add constraint pricing_config_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.profiles                drop constraint if exists profiles_suspended_by_fkey;
alter table public.profiles                 add constraint profiles_suspended_by_fkey
  foreign key (suspended_by) references public.profiles(id) on delete set null;

alter table public.washer_verifications    drop constraint if exists washer_verifications_reviewed_by_fkey;
alter table public.washer_verifications     add constraint washer_verifications_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles(id) on delete set null;

-- ── B. NOT NULL audit actor columns → DROP NOT NULL + SET NULL ───────────────
alter table public.admin_order_audit alter column admin_id drop not null;
alter table public.admin_order_audit drop constraint if exists admin_order_audit_admin_id_fkey;
alter table public.admin_order_audit  add constraint admin_order_audit_admin_id_fkey
  foreign key (admin_id) references public.profiles(id) on delete set null;

alter table public.admin_user_audit  alter column admin_id drop not null;
alter table public.admin_user_audit  drop constraint if exists admin_user_audit_admin_id_fkey;
alter table public.admin_user_audit   add constraint admin_user_audit_admin_id_fkey
  foreign key (admin_id) references public.profiles(id) on delete set null;

alter table public.approval_audit    alter column agent_id drop not null;
alter table public.approval_audit    drop constraint if exists approval_audit_agent_id_fkey;
alter table public.approval_audit     add constraint approval_audit_agent_id_fkey
  foreign key (agent_id) references public.profiles(id) on delete set null;

-- ── C. User-owned chat → CASCADE (dies with the user) ────────────────────────
alter table public.order_messages        drop constraint if exists order_messages_sender_id_fkey;
alter table public.order_messages         add constraint order_messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.support_messages      drop constraint if exists support_messages_sender_id_fkey;
alter table public.support_messages       add constraint support_messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.support_conversations drop constraint if exists support_conversations_opener_id_fkey;
alter table public.support_conversations  add constraint support_conversations_opener_id_fkey
  foreign key (opener_id) references public.profiles(id) on delete cascade;

-- ── D. Ephemeral impersonation tokens → CASCADE ─────────────────────────────
alter table public.impersonation_tokens  drop constraint if exists impersonation_tokens_admin_id_fkey;
alter table public.impersonation_tokens   add constraint impersonation_tokens_admin_id_fkey
  foreign key (admin_id) references public.profiles(id) on delete cascade;

NOTIFY pgrst, 'reload schema';
