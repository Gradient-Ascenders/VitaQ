
alter table public.queue_entries
add column if not exists joined_at timestamptz null,
add column if not exists consultation_started_at timestamptz null,
add column if not exists completed_at timestamptz null;

create or replace view public.analytics_wait_time_events as
select
  qe.id as queue_entry_id,
  qe.clinic_id,
  c.name as clinic_name,
  qe.patient_id,
  qe.appointment_id,
  qe.queue_number,
  qe.queue_date,
  qe.source,
  qe.status,
  qe.joined_at,
  qe.consultation_started_at,
  qe.completed_at,

  extract(hour from qe.joined_at at time zone 'Africa/Johannesburg') as joined_hour,

  round(
    (extract(epoch from (qe.consultation_started_at - qe.joined_at)) / 60)::numeric,
    2
  ) as wait_minutes,

  round(
    (extract(epoch from (qe.completed_at - qe.consultation_started_at)) / 60)::numeric,
    2
  ) as consultation_minutes

from public.queue_entries qe
join public.clinics c
  on c.id = qe.clinic_id
where qe.status = 'complete'
  and qe.joined_at is not null
  and qe.consultation_started_at is not null
  and qe.completed_at is not null
  and qe.consultation_started_at >= qe.joined_at
  and qe.completed_at >= qe.consultation_started_at;
  
create or replace view public.analytics_wait_times_by_clinic as
select
  clinic_id,
  clinic_name,
  count(*) as completed_queue_count,
  round(avg(wait_minutes)::numeric, 2) as average_wait_minutes,
  round(avg(consultation_minutes)::numeric, 2) as average_consultation_minutes,
  min(queue_date) as first_queue_date,
  max(queue_date) as latest_queue_date
from public.analytics_wait_time_events
group by clinic_id, clinic_name;

create or replace view public.analytics_wait_times_by_day as
select
  clinic_id,
  clinic_name,
  queue_date,
  count(*) as completed_queue_count,
  round(avg(wait_minutes)::numeric, 2) as average_wait_minutes,
  round(avg(consultation_minutes)::numeric, 2) as average_consultation_minutes
from public.analytics_wait_time_events
group by clinic_id, clinic_name, queue_date;

create or replace view public.analytics_wait_times_by_hour as
select
  clinic_id,
  clinic_name,
  joined_hour,
  count(*) as completed_queue_count,
  round(avg(wait_minutes)::numeric, 2) as average_wait_minutes,
  round(avg(consultation_minutes)::numeric, 2) as average_consultation_minutes
from public.analytics_wait_time_events
group by clinic_id, clinic_name, joined_hour;

create or replace view public.analytics_wait_times_summary as
select
  count(*) as completed_queue_count,
  round(avg(wait_minutes)::numeric, 2) as average_wait_minutes,
  round(avg(consultation_minutes)::numeric, 2) as average_consultation_minutes,
  round(min(wait_minutes)::numeric, 2) as minimum_wait_minutes,
  round(max(wait_minutes)::numeric, 2) as maximum_wait_minutes
from public.analytics_wait_time_events;

create index if not exists idx_queue_entries_analytics_clinic_date
on public.queue_entries (clinic_id, queue_date);

create index if not exists idx_queue_entries_analytics_status
on public.queue_entries (status);

create index if not exists idx_queue_entries_analytics_joined_at
on public.queue_entries (joined_at);

create index if not exists idx_queue_entries_analytics_appointment_id
on public.queue_entries (appointment_id);

revoke all on public.analytics_wait_time_events from anon, authenticated;
revoke all on public.analytics_wait_times_by_clinic from anon, authenticated;
revoke all on public.analytics_wait_times_by_day from anon, authenticated;
revoke all on public.analytics_wait_times_by_hour from anon, authenticated;
revoke all on public.analytics_wait_times_summary from anon, authenticated;

grant select on public.analytics_wait_time_events to service_role;
grant select on public.analytics_wait_times_by_clinic to service_role;
grant select on public.analytics_wait_times_by_day to service_role;
grant select on public.analytics_wait_times_by_hour to service_role;
grant select on public.analytics_wait_times_summary to service_role;