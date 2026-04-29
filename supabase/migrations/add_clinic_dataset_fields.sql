-- Bring older clinic tables up to the live Sprint 3 schema without breaking existing data.
alter table public.clinics
  add column if not exists region text,
  add column if not exists municipality text,
  add column if not exists contact_website text,
  add column if not exists source_dataset text,
  add column if not exists source_record_id text,
  add column if not exists source_last_updated timestamptz,
  add column if not exists is_active boolean not null default true,
  add column if not exists contact_number text,
  add column if not exists contact_email text;
