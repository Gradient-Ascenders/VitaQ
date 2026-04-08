alter table public.clinics enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "authenticated users can view clinics" on public.clinics;
create policy "authenticated users can view clinics"
on public.clinics
for select
to authenticated
using (true);

drop policy if exists "authenticated users can view appointment slots" on public.appointment_slots;
create policy "authenticated users can view appointment slots"
on public.appointment_slots
for select
to authenticated
using (true);

drop policy if exists "users can view their own appointments" on public.appointments;
create policy "users can view their own appointments"
on public.appointments
for select
to authenticated
using (auth.uid() = patient_id);

drop policy if exists "users can create their own appointments" on public.appointments;
create policy "users can create their own appointments"
on public.appointments
for insert
to authenticated
with check (auth.uid() = patient_id);

drop policy if exists "users can update their own appointments" on public.appointments;
create policy "users can update their own appointments"
on public.appointments
for update
to authenticated
using (auth.uid() = patient_id)
with check (auth.uid() = patient_id);