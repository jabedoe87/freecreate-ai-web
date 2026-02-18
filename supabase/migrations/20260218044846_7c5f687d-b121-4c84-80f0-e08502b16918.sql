
-- Create stripe_events table for idempotent webhook processing
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  type text NOT NULL,
  customer_id text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  error text
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Only service role can write; admins can read
CREATE POLICY "Service role manages stripe events"
  ON public.stripe_events
  FOR ALL
  USING (false)
  WITH CHECK (false);
