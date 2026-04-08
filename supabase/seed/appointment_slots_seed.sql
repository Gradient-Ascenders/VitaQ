insert into public.appointment_slots (
  clinic_id,
  date,
  start_time,
  end_time,
  capacity,
  booked_count,
  status
)
select
  c.id,
  s.date,
  s.start_time,
  s.end_time,
  s.capacity,
  s.booked_count,
  s.status
from (
  values
    ('Kwaggafontein Community Health Centre', '2026-04-10'::date, '08:00:00'::time, '08:30:00'::time, 5, 0, 'available'),
    ('Kwaggafontein Community Health Centre', '2026-04-10'::date, '08:30:00'::time, '09:00:00'::time, 5, 2, 'available'),
    ('Kwaggafontein Community Health Centre', '2026-04-10'::date, '09:00:00'::time, '09:30:00'::time, 5, 5, 'available'),

    ('Matthew Goniwe Clinic', '2026-04-10'::date, '09:00:00'::time, '09:30:00'::time, 4, 0, 'available'),
    ('Matthew Goniwe Clinic', '2026-04-10'::date, '09:30:00'::time, '10:00:00'::time, 4, 1, 'available'),
    ('Matthew Goniwe Clinic', '2026-04-10'::date, '10:00:00'::time, '10:30:00'::time, 4, 4, 'available'),

    ('Pefferville Clinic', '2026-04-10'::date, '10:00:00'::time, '10:30:00'::time, 6, 0, 'available'),
    ('Pefferville Clinic', '2026-04-10'::date, '10:30:00'::time, '11:00:00'::time, 6, 3, 'available'),
    ('Pefferville Clinic', '2026-04-10'::date, '11:00:00'::time, '11:30:00'::time, 6, 6, 'available'),

    ('Rooihuiskraal Clinic', '2026-04-11'::date, '08:00:00'::time, '08:30:00'::time, 3, 0, 'available'),
    ('Rooihuiskraal Clinic', '2026-04-11'::date, '08:30:00'::time, '09:00:00'::time, 3, 1, 'available'),
    ('Rooihuiskraal Clinic', '2026-04-11'::date, '09:00:00'::time, '09:30:00'::time, 3, 3, 'available'),

    ('Berario Clinic', '2026-04-11'::date, '11:00:00'::time, '11:30:00'::time, 4, 0, 'available'),
    ('Berario Clinic', '2026-04-11'::date, '11:30:00'::time, '12:00:00'::time, 4, 2, 'available'),
    ('Berario Clinic', '2026-04-11'::date, '12:00:00'::time, '12:30:00'::time, 4, 0, 'cancelled'),

    ('Langenhoven Park Clinic', '2026-04-12'::date, '08:00:00'::time, '08:30:00'::time, 5, 0, 'available'),
    ('Langenhoven Park Clinic', '2026-04-12'::date, '08:30:00'::time, '09:00:00'::time, 5, 4, 'available'),
    ('Langenhoven Park Clinic', '2026-04-12'::date, '09:00:00'::time, '09:30:00'::time, 5, 5, 'available')
) as s(clinic_name, date, start_time, end_time, capacity, booked_count, status)
join public.clinics c
  on c.name = s.clinic_name;