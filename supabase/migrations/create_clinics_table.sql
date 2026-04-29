-- Central clinic directory used by bookings, slots, queue entries, and staff assignment.
create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  district text not null,
  area text,
  region text,
  municipality text,
  facility_type text not null,
  address text,
  services_offered text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  contact_website text,
  source_dataset text,
  source_record_id text,
  source_last_updated timestamptz,
  is_active boolean not null default true,
  contact_number text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
