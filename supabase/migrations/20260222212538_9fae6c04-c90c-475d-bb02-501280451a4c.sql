-- Processed webhook events table for additional idempotency layer
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON public.processed_webhook_events(processed_at);

-- Ensure unique constraint on stripe_events.event_id (idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stripe_events_event_id_key'
  ) THEN
    ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_event_id_key UNIQUE (event_id);
  END IF;
END $$;

-- RLS on processed_webhook_events (service role only)
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages processed events"
  ON public.processed_webhook_events
  FOR ALL
  USING (false)
  WITH CHECK (false);