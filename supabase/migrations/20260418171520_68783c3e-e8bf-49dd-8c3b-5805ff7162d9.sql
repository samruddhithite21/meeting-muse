ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'cloud'
  CHECK (ai_provider IN ('cloud','local'));