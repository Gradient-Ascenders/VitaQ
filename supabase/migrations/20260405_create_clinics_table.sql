create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  district text not null,
  area text,
  facility_type text not null,
  address text,
  services_offered text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);