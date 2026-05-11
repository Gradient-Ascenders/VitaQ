-- Backfill appointments that were cancelled from the staff queue before the
-- application started syncing queue cancellation back to the appointment row.
WITH staff_cancelled_appointments AS (
  SELECT
    appointment.id,
    appointment.slot_id,
    queue_entry.updated_at AS cancelled_at
  FROM public.appointments AS appointment
  JOIN public.queue_entries AS queue_entry
    ON queue_entry.appointment_id = appointment.id
  WHERE queue_entry.source = 'appointment'
    AND queue_entry.status = 'cancelled'
    AND appointment.status = 'booked'
),
slot_release_counts AS (
  SELECT
    slot_id,
    COUNT(*)::integer AS cancelled_count
  FROM staff_cancelled_appointments
  WHERE slot_id IS NOT NULL
  GROUP BY slot_id
),
released_slots AS (
  UPDATE public.appointment_slots AS slot
  SET
    booked_count = GREATEST(slot.booked_count - slot_release_counts.cancelled_count, 0),
    updated_at = now()
  FROM slot_release_counts
  WHERE slot.id = slot_release_counts.slot_id
  RETURNING slot.id
)
UPDATE public.appointments AS appointment
SET
  status = 'cancelled',
  cancelled_at = COALESCE(appointment.cancelled_at, staff_cancelled_appointments.cancelled_at, now()),
  cancellation_reason = COALESCE(
    NULLIF(BTRIM(appointment.cancellation_reason), ''),
    'Cancelled by clinic staff'
  ),
  updated_at = COALESCE(staff_cancelled_appointments.cancelled_at, now())
FROM staff_cancelled_appointments
WHERE staff_cancelled_appointments.id = appointment.id;
