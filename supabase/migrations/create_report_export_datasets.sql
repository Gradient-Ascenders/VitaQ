create or replace view public.report_wait_time_export_dataset as
select
  'wait-times'::text as report_type,

  queue_entry_id,
  clinic_id,
  clinic_name,

  queue_date as report_date,
  joined_hour,

  patient_id,
  appointment_id,
  queue_number,
  source,
  status,

  joined_at,
  consultation_started_at,
  completed_at,

  wait_minutes,
  consultation_minutes

from public.analytics_wait_time_events;

create or replace view public.report_no_show_export_dataset as
select
  'no-shows'::text as report_type,

  appointment_id,
  patient_id,
  clinic_id,
  clinic_name,
  slot_id,

  appointment_date as report_date,
  start_time,
  end_time,
  appointment_start_at,

  appointment_status,
  queue_entry_count,
  has_queue_entry,
  is_past_appointment,
  is_no_show

from public.analytics_no_show_events;

create or replace view public.report_no_show_export_dataset as
select
  'no-shows'::text as report_type,

  appointment_id,
  patient_id,
  clinic_id,
  clinic_name,
  slot_id,

  appointment_date as report_date,
  start_time,
  end_time,
  appointment_start_at,

  appointment_status,
  queue_entry_count,
  has_queue_entry,
  is_past_appointment,
  is_no_show

from public.analytics_no_show_events;

create or replace view public.report_no_shows_by_clinic_day_dataset as
select
  clinic_id,
  clinic_name,
  appointment_date as report_date,

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
group by clinic_id, clinic_name, appointment_date;

create or replace view public.report_clinic_summary_export_dataset as
select
  'summary'::text as report_type,

  coalesce(w.clinic_id, n.clinic_id) as clinic_id,
  coalesce(w.clinic_name, n.clinic_name) as clinic_name,

  coalesce(w.completed_queue_count, 0) as completed_queue_count,
  w.average_wait_minutes,
  w.average_consultation_minutes,

  coalesce(n.total_tracked_appointments, 0) as total_tracked_appointments,
  coalesce(n.attended_queue_count, 0) as attended_queue_count,
  coalesce(n.no_show_count, 0) as no_show_count,
  n.no_show_rate_percentage

from public.analytics_wait_times_by_clinic w
full outer join public.analytics_no_shows_by_clinic n
  on n.clinic_id = w.clinic_id;
  
create or replace view public.report_daily_clinic_summary_export_dataset as
select
  'daily-summary'::text as report_type,

  coalesce(w.clinic_id, n.clinic_id) as clinic_id,
  coalesce(w.clinic_name, n.clinic_name) as clinic_name,
  coalesce(w.queue_date, n.report_date) as report_date,

  coalesce(w.completed_queue_count, 0) as completed_queue_count,
  w.average_wait_minutes,
  w.average_consultation_minutes,

  coalesce(n.total_tracked_appointments, 0) as total_tracked_appointments,
  coalesce(n.attended_queue_count, 0) as attended_queue_count,
  coalesce(n.no_show_count, 0) as no_show_count,
  n.no_show_rate_percentage

from public.analytics_wait_times_by_day w
full outer join public.report_no_shows_by_clinic_day_dataset n
  on n.clinic_id = w.clinic_id
 and n.report_date = w.queue_date;
 
 create index if not exists idx_report_queue_entries_clinic_date
on public.queue_entries (clinic_id, queue_date);

create index if not exists idx_report_appointments_clinic_status
on public.appointments (clinic_id, status);

create index if not exists idx_report_appointment_slots_date_time
on public.appointment_slots (date, start_time);

create index if not exists idx_report_queue_entries_appointment
on public.queue_entries (appointment_id);

revoke all on public.report_wait_time_export_dataset from anon, authenticated;
revoke all on public.report_no_show_export_dataset from anon, authenticated;
revoke all on public.report_no_shows_by_clinic_day_dataset from anon, authenticated;
revoke all on public.report_clinic_summary_export_dataset from anon, authenticated;
revoke all on public.report_daily_clinic_summary_export_dataset from anon, authenticated;

grant select on public.report_wait_time_export_dataset to service_role;
grant select on public.report_no_show_export_dataset to service_role;
grant select on public.report_no_shows_by_clinic_day_dataset to service_role;
grant select on public.report_clinic_summary_export_dataset to service_role;
grant select on public.report_daily_clinic_summary_export_dataset to service_role;