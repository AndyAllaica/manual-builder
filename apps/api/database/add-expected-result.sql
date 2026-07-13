-- Solo es necesario si DB_SYNCHRONIZE=false o si administras el esquema manualmente.
ALTER TABLE public.manual_steps
  ADD COLUMN IF NOT EXISTS expected_result text NOT NULL DEFAULT '';
