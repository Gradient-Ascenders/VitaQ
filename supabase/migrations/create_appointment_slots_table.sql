create table if not exists public.appointment_slots (
  id uuid primary key default gen_random_uuid(),

  clinic_id uuid not null references public.clinics(id) on delete cascade,

  date date not null,
  start_time time not null,
  end_time time not null,

  capacity integer not null default 1,
  booked_count integer not null default 0,

  status text not null default 'available',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointment_slots_capacity_check
    check (capacity >= 1),

  constraint appointment_slots_booked_count_check
    check (booked_count >= 0 and booked_count <= capacity),

  constraint appointment_slots_time_check
    check (start_time < end_time),

  constraint appointment_slots_status_check
    check (status in ('available', 'cancelled'))
);

create index if not exists idx_appointment_slots_clinic_id
  on public.appointment_slots(clinic_id);

create index if not exists idx_appointment_slots_date
  on public.appointment_slots(date);

create index if not exists idx_appointment_slots_clinic_date
  on public.appointment_slots(clinic_id, date);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_appointment_slots_updated_at on public.appointment_slots;

create trigger set_appointment_slots_updated_at
before update on public.appointment_slots
for each row
execute function public.handle_updated_at();