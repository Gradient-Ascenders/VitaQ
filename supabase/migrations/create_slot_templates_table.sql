-- Store recurring weekly slot templates that staff can later expand into appointment slots.
create table if not exists public.slot_templates (
  id uuid primary key default gen_random_uuid(),

  clinic_id uuid not null references public.clinics(id) on delete cascade,

  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  capacity integer not null default 1,
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint slot_templates_day_of_week_check
    check (day_of_week between 0 and 6),

  constraint slot_templates_capacity_check
    check (capacity >= 1),

  constraint slot_templates_time_check
    check (start_time < end_time),

  constraint slot_templates_status_check
    check (status in ('active', 'inactive'))
);

create index if not exists idx_slot_templates_clinic_id
  on public.slot_templates(clinic_id);

create index if not exists idx_slot_templates_clinic_day_status
  on public.slot_templates(clinic_id, day_of_week, status);

create unique index if not exists idx_slot_templates_unique_window
  on public.slot_templates(clinic_id, day_of_week, start_time, end_time);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_slot_templates_updated_at on public.slot_templates;

create trigger set_slot_templates_updated_at
before update on public.slot_templates
for each row
execute function public.handle_updated_at();
