alter table if exists public.email_notifications
add column if not exists slot_occurrence_key text null;

update public.email_notifications
set slot_occurrence_key = concat(
  appointment_id::text,
  ':',
  metadata ->> 'slot_date',
  ':',
  metadata ->> 'slot_start_time'
)
where notification_type = 'appointment_reminder_30m'
  and slot_occurrence_key is null
  and appointment_id is not null
  and coalesce(metadata ->> 'slot_date', '') <> ''
  and coalesce(metadata ->> 'slot_start_time', '') <> '';

drop index if exists public.unique_appointment_notification;

create unique index if not exists unique_appointment_reminder_slot_occurrence
on public.email_notifications (notification_type, slot_occurrence_key)
where notification_type = 'appointment_reminder_30m'
  and slot_occurrence_key is not null;

create or replace function public.set_email_notifications_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "service role can manage email notifications"
on public.email_notifications;

create policy "service role can manage email notifications"
on public.email_notifications
for all
to service_role
using (true)
with check (true);

create or replace view public.analytics_no_show_events as
with queue_attendance as (
  select
    qe.appointment_id,
    count(*) filter (
      where qe.status <> 'cancelled'
        and qe.joined_at is not null
    ) as attended_queue_count
  from public.queue_entries qe
  where qe.appointment_id is not null
  group by qe.appointment_id
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

  coalesce(qa.attended_queue_count, 0) as queue_entry_count,

  case
    when coalesce(qa.attended_queue_count, 0) > 0
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
      and coalesce(qa.attended_queue_count, 0) = 0
    then true
    else false
  end as is_no_show

from public.appointments a
join public.appointment_slots s
  on s.id = a.slot_id
join public.clinics c
  on c.id = a.clinic_id
left join queue_attendance qa
  on qa.appointment_id = a.id;
