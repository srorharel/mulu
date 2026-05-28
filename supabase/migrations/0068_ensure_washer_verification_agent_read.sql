-- Ensure agents can read every object in the washer-verification bucket.
--
-- The same policy is created by 0061_improve_washer_verification_bucket.sql,
-- but if 0061 was bootstrapped or only partially applied (e.g. the
-- storage.buckets insert succeeded under a privileged role while the
-- storage.objects policies were skipped) the agent-side support app reads
-- selfie / ID / license paths and gets back null signed URLs because the
-- bucket is private and no policy grants agent SELECT.
--
-- Pattern mirrors the job-evidence agent-read policy in 0020_agent_approvals.sql.

drop policy if exists "agent_read_all_verification" on storage.objects;

create policy "agent_read_all_verification"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'washer-verification'
    and exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'agent'
    )
  );
