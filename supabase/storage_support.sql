-- Run these in the Supabase dashboard SQL editor AFTER creating the support-attachments bucket.
-- Bucket settings: private, max file size 5242880 (5 MB), allowed MIME types: image/jpeg, image/png, image/webp

create policy "Participants can upload support attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] in (
      select id::text from public.support_conversations
      where opener_id = auth.uid()
         or counterparty_id = auth.uid()
         or assigned_agent_id = auth.uid()
         or public.is_agent()
    )
  );

create policy "Participants can read support attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] in (
      select id::text from public.support_conversations
      where opener_id = auth.uid()
         or counterparty_id = auth.uid()
         or assigned_agent_id = auth.uid()
         or public.is_agent()
    )
  );
