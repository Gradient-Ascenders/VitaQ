ALTER TABLE appointments
ADD COLUMN cancelled_at timestamp with time zone,
ADD COLUMN cancellation_reason text,
ADD COLUMN rescheduled_from_slot_id uuid REFERENCES appointment_slots(id),
ADD COLUMN rescheduled_at timestamp with time zone;
ADD COLUMN notes text;