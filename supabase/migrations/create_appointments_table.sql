-- Store patient bookings that connect one patient to one clinic slot.
-- The unique patient+slot rule prevents duplicate bookings for the same time window.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  slot_id uuid not null references public.appointment_slots(id) on delete cascade,

  status text not null default 'booked',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_status_check
    check (status in ('booked', 'cancelled', 'completed')),

  constraint appointments_patient_slot_unique
    unique (patient_id, slot_id)
);

create index if not exists idx_appointments_patient_id
  on public.appointments(patient_id);

create index if not exists idx_appointments_clinic_id
  on public.appointments(clinic_id);

create index if not exists idx_appointments_slot_id
  on public.appointments(slot_id);

create index if not exists idx_appointments_created_at
  on public.appointments(created_at);

drop trigger if exists set_appointments_updated_at on public.appointments;

create trigger set_appointments_updated_at
before update on public.appointments
for each row
execute function public.handle_updated_at();
