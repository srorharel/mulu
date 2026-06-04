-- 0109_account_deletion_fk_setnull.sql
--
-- Enables the account-deletion policy (ADR — anonymize-vs-delete): when a
-- consumer/washer deletes their account we PRESERVE their orders + order_events
-- (financial/audit retention) but DELETE the profiles row + auth user. With the
-- original FKs (orders.consumer_id NOT NULL + NO ACTION, orders.washer_id /
-- order_events.actor_id NO ACTION) deleting the profile is impossible while any
-- order references it. This migration relaxes those three FKs to ON DELETE SET
-- NULL (and makes orders.consumer_id nullable) so deleting the profile nulls the
-- references — anonymizing the order's link to the user while keeping the row,
-- its prices, status, timestamps, and the order_events audit trail intact.
--
-- The delete-account Edge Function additionally nulls the order's PII columns
-- (car_*, photo paths, access_notes, submitted coords) before deleting the
-- profile; this migration only handles the structural FK references.
--
-- Active orders are always created with a consumer_id; only orphaned (deleted-
-- user) orders carry NULL, which no RLS policy or app query matches.

-- orders.consumer_id: drop NOT NULL (idempotent) + SET NULL on delete.
alter table public.orders alter column consumer_id drop not null;
alter table public.orders drop constraint if exists orders_consumer_id_fkey;
alter table public.orders
  add constraint orders_consumer_id_fkey
  foreign key (consumer_id) references public.profiles(id) on delete set null;

-- orders.washer_id: already nullable; SET NULL on delete.
alter table public.orders drop constraint if exists orders_washer_id_fkey;
alter table public.orders
  add constraint orders_washer_id_fkey
  foreign key (washer_id) references public.profiles(id) on delete set null;

-- order_events.actor_id: already nullable; SET NULL on delete (preserve the
-- event row even after the actor's profile is gone).
alter table public.order_events drop constraint if exists order_events_actor_id_fkey;
alter table public.order_events
  add constraint order_events_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

NOTIFY pgrst, 'reload schema';
