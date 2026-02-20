
-- A) Add purchases table for one-time Bundle payments
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  price_id text,
  amount integer,
  currency text DEFAULT 'eur',
  status text DEFAULT 'completed',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Users can only view own purchases
CREATE POLICY "Users can view own purchases"
ON public.purchases FOR SELECT
USING (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE — only service role (webhook)
CREATE POLICY "Service role manages purchases"
ON public.purchases FOR ALL
USING (false)
WITH CHECK (false);

-- B) Add lifetime_access to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'lifetime_access'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN lifetime_access boolean NOT NULL DEFAULT false;
  END IF;
END$$;

-- C) Add stripe_customer_id to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id text;
  END IF;
END$$;
