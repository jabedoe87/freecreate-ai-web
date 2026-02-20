-- Add length constraints to user_prompts to prevent DoS via massive inserts
ALTER TABLE public.user_prompts ADD CONSTRAINT user_prompts_title_length CHECK (length(title) <= 200);
ALTER TABLE public.user_prompts ADD CONSTRAINT user_prompts_content_length CHECK (length(content) <= 10000);