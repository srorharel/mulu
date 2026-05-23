-- Replace liveness_paths (text[]) with selfie_path (text)
alter table washer_verifications drop column if exists liveness_paths;
alter table washer_verifications add column if not exists selfie_path text not null default '';
