create unique index if not exists idx_appointment_slots_unique_window
  on public.appointment_slots(clinic_id, date, start_time, end_time);
