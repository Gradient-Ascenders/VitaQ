-- Bring older appointment tables up to the live Sprint 3 lifecycle schema.
alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists rescheduled_from_slot_id uuid references public.appointment_slots(id) on delete set null,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists notes text;
