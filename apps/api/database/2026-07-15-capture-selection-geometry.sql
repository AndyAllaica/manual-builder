-- Ejecuta este script una vez sobre la base manual_builder si DB_SYNCHRONIZE=false.
-- Las capturas anteriores quedan con geometria nula porque esa informacion no se persistia.

BEGIN;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS selection_rect jsonb,
  ADD COLUMN IF NOT EXISTS viewport jsonb,
  ADD COLUMN IF NOT EXISTS capture_target varchar(20) NOT NULL DEFAULT 'element';

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_capture_target_check;

ALTER TABLE captures
  ADD CONSTRAINT captures_capture_target_check
  CHECK (capture_target IN ('element', 'viewport'));

COMMIT;
