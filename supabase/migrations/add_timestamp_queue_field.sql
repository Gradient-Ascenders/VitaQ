ALTER TABLE queue_entries
ADD COLUMN joined_at timestamp with time zone DEFAULT now(),
ADD COLUMN consultation_started_at timestamp with time zone,
ADD COLUMN completed_at timestamp with time zone;