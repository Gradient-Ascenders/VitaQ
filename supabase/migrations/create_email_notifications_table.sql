
create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),

  notification_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,

  appointment_id uuid null references public.appointments(id) on delete cascade,
  staff_request_id uuid null references public.staff_requests(id) on delete cascade,

  recipient_email text not null,
  subject text null,

  status text not null default 'pending',
  provider_message_id text null,
  error_message text null,
  attempt_count integer not null default 0,

  scheduled_for timestamptz null,
  sent_at timestamptz null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_notifications_type_check
    check (
      notification_type in (
        'appointment_reminder_30m',
        'staff_request_approved',
        'staff_request_rejected'
      )
    ),

  constraint email_notifications_status_check
    check (
      status in (
        'pending',
        'sent',
        'failed'
      )
    ),

  constraint email_notifications_attempt_count_check
    check (attempt_count >= 0),

  constraint email_notifications_recipient_email_check
    check (position('@' in recipient_email) > 1),

  constraint email_notifications_target_check
    check (
      appointment_id is not null
      or staff_request_id is not null
    )
);

create unique index if not exists unique_appointment_notification
on public.email_notifications (notification_type, appointment_id)
where appointment_id is not null;

create unique index if not exists unique_staff_request_notification
on public.email_notifications (notification_type, staff_request_id)
where staff_request_id is not null;

create index if not exists idx_email_notifications_status
on public.email_notifications (status);

create index if not exists idx_email_notifications_user_id
on public.email_notifications (user_id);

create index if not exists idx_email_notifications_appointment_id
on public.email_notifications (appointment_id);

create index if not exists idx_email_notifications_staff_request_id
on public.email_notifications (staff_request_id);

create index if not exists idx_email_notifications_scheduled_for
on public.email_notifications (scheduled_for);

create index if not exists idx_email_notifications_created_at
on public.email_notifications (created_at);

create or replace function public.set_email_notifications_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_email_notifications_updated_at
on public.email_notifications;

create trigger trg_set_email_notifications_updated_at
before update on public.email_notifications
for each row
execute function public.set_email_notifications_updated_at();

alter table public.email_notifications enable row level security;

revoke all on public.email_notifications from anon;
revoke all on public.email_notifications from authenticated;

grant select, insert, update, delete on public.email_notifications to service_role;

