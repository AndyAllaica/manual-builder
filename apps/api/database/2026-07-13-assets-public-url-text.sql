-- Corrige bases existentes donde assets fue creado antes de public_url.
-- Ejecutar contra la base manual_builder antes de levantar el API con DB_SYNCHRONIZE=true.
--
-- Ejemplo:
-- psql -U postgres -d manual_builder -v app_public_url='http://localhost:3001' -f apps/api/database/2026-07-13-assets-public-url-text.sql

\if :{?app_public_url}
\else
  \set app_public_url http://localhost:3001
\endif

BEGIN;

ALTER TABLE IF EXISTS public.assets
    ADD COLUMN IF NOT EXISTS public_url TEXT;

ALTER TABLE IF EXISTS public.assets
    ALTER COLUMN public_url TYPE TEXT;

UPDATE public.assets
SET public_url = CASE
    WHEN provider = 'local' AND storage_path IS NOT NULL AND storage_path <> ''
        THEN :'app_public_url' || '/uploads/' || storage_path
    WHEN storage_path IS NOT NULL AND storage_path <> ''
        THEN storage_path
    ELSE ''
END
WHERE public_url IS NULL OR public_url = '';

ALTER TABLE IF EXISTS public.assets
    ALTER COLUMN public_url SET DEFAULT '';

ALTER TABLE IF EXISTS public.assets
    ALTER COLUMN public_url SET NOT NULL;

COMMIT;
