create or replace view public.analytics_no_show_events as
with queue_presence as (
  select
    appointment_id,
    count(*) as queue_entry_count
  from public.queue_entries
  where appointment_id is not null
  group by appointment_id
)
select
  a.id as appointment_id,
  a.patient_id,
  a.clinic_id,
  c.name as clinic_name,
  a.slot_id,

  s.date as appointment_date,
  s.start_time,
  s.end_time,

  (
    (s.date::timestamp + s.start_time)
    at time zone 'Africa/Johannesburg'
  ) as appointment_start_at,

  a.status as appointment_status,

  coalesce(qp.queue_entry_count, 0) as queue_entry_count,

  case
    when coalesce(qp.queue_entry_count, 0) > 0
    then true
    else false
  end as has_queue_entry,

  case
    when (
      (s.date::timestamp + s.start_time)
      at time zone 'Africa/Johannesburg'
    ) < now()
    then true
    else false
  end as is_past_appointment,

  case
    when a.status = 'booked'
      and (
        (s.date::timestamp + s.start_time)
        at time zone 'Africa/Johannesburg'
      ) < now()
      and coalesce(qp.queue_entry_count, 0) = 0
    then true
    else false
  end as is_no_show

from public.appointments a
join public.appointment_slots s
  on s.id = a.slot_id
join public.clinics c
  on c.id = a.clinic_id
left join queue_presence qp
  on qp.appointment_id = a.id;
  
  create or replace view public.analytics_no_shows_by_clinic as
select
  clinic_id,
  clinic_name,

  count(*) filter (
    where is_past_appointment = true
      and appointment_status <> 'cancelled'
  ) as total_tracked_appointments,

  count(*) filter (
    where is_no_show = true
  ) as no_show_count,

  count(*) filter (
    where is_past_appointment = true
      and appointment_status <> 'cancelled'
      and has_queue_entry = true
  ) as attended_queue_count,

  round(
    (
      count(*) filter (where is_no_show = true)::numeric
      / nullif(
          count(*) filter (
            where is_past_appointment = true
              and appointment_status <> 'cancelled'
          ),
          0
        )
    ) * 100,
    2
  ) as no_show_rate_percentage

from public.analytics_no_show_events
group by clinic_id, clinic_name;

create or replace view public.analytics_no_shows_by_day as
select
  appointment_date,

  count(*) filter (
    where is_past_appointment = true
      and appointment_status <> 'cancelled'
  ) as total_tracked_appointments,

  count(*) filter (
    where is_no_show = true
  ) as no_show_count,

  round(
    (
      count(*) filter (where is_no_show = true)::numeric
      / nullif(
          count(*) filter (
            where is_past_appointment = true
              and appointment_status <> 'cancelled'
          ),
          0
        )
    ) * 100,
    2
  ) as no_show_rate_percentage

from public.analytics_no_show_events
group by appointment_date;

create or replace view public.analytics_no_shows_summary as
select
  count(*) filter (
    where is_past_appointment = true
      and appointment_status <> 'cancelled'
  ) as total_tracked_appointments,

  count(*) filter (
    where is_no_show = true
  ) as no_show_count,

  count(*) filter (
    where is_past_appointment = true
      and appointment_status <> 'cancelled'
      and has_queue_entry = true
  ) as attended_queue_count,

  round(
    (
      count(*) filter (where is_no_show = true)::numeric
      / nullif(
          count(*) filter (
            where is_past_appointment = true
              and appointment_status <> 'cancelled'
          ),
          0
        )
    ) * 100,
    2
  ) as no_show_rate_percentage

from public.analytics_no_show_events;

create index if not exists idx_appointments_no_show_clinic_status
on public.appointments (clinic_id, status);

create index if not exists idx_appointments_no_show_slot
on public.appointments (slot_id);

create index if not exists idx_appointment_slots_no_show_date_time
on public.appointment_slots (date, start_time);

create index if not exists idx_queue_entries_no_show_appointment
on public.queue_entries (appointment_id);

revoke all on public.analytics_no_show_events from anon, authenticated;
revoke all on public.analytics_no_shows_by_clinic from anon, authenticated;
revoke all on public.analytics_no_shows_by_day from anon, authenticated;
revoke all on public.analytics_no_shows_summary from anon, authenticated;

grant select on public.analytics_no_show_events to service_role;
grant select on public.analytics_no_shows_by_clinic to service_role;
grant select on public.analytics_no_shows_by_day to service_role;
grant select on public.analytics_no_shows_summary to service_role;
