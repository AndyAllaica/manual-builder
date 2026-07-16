-- Ejecuta este script una vez sobre manual_builder si DB_SYNCHRONIZE=false.
-- Las capturas anteriores mantienen false y continuan usando el resaltado calculado al exportar.

BEGIN;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS annotation_baked boolean NOT NULL DEFAULT false;

COMMIT;
