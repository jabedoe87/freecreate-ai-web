
-- Server-side function to check if a user can create a prompt based on their plan
CREATE OR REPLACE FUNCTION public.can_create_prompt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      -- Bundle users (lifetime) have unlimited access
      WHEN EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE user_id = _user_id AND plan = 'bundle' AND status = 'active'
      ) THEN true
      -- Pro users have unlimited access
      WHEN EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE user_id = _user_id AND plan = 'pro' AND status = 'active'
      ) THEN true
      -- Free users: max 5 prompts per month
      ELSE (
        SELECT COALESCE(
          (SELECT count FROM public.usage_tracking
           WHERE user_id = _user_id
             AND action = 'generation'
             AND month = to_char(now(), 'YYYY-MM')
           LIMIT 1),
          0
        ) < 5
      )
    END
$$;

-- Update the INSERT policy on user_prompts to enforce plan limits server-side
DROP POLICY IF EXISTS "Users can insert own prompts" ON public.user_prompts;

CREATE POLICY "Users can insert own prompts"
  ON public.user_prompts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_create_prompt(auth.uid())
  );
