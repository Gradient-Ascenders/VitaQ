alter table if exists public.queue_entries
alter column patient_id drop not null;

alter table if exists public.queue_entries
add column if not exists patient_label text not null default '';

alter table if exists public.queue_entries
add column if not exists visit_type text;

alter table if exists public.queue_entries
add column if not exists time_label text;

alter table if exists public.queue_entries
add column if not exists created_by_staff_user_id uuid;
