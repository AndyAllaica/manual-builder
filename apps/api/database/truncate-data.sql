-- ADVERTENCIA: elimina de forma irreversible todos los datos de Manual Builder.
-- Ejecuta este script conectado a la base manual_builder, no a la base postgres.
-- Si configuraste DB_SCHEMA con otro valor, reemplaza "public" por ese esquema.
-- Este script NO elimina los archivos fisicos de OneDrive ni de apps/api/uploads.

BEGIN;

TRUNCATE TABLE
  public.manual_steps,
  public.manual_versions,
  public.manuals,
  public.captures,
  public.capture_sessions,
  public.assets,
  public.actions,
  public.system_modules,
  public.systems,
  public.workspace_members,
  public.workspaces,
  public.users
RESTART IDENTITY CASCADE;

COMMIT;

-- Al reiniciar la API, DatabaseBootstrapService volvera a crear el workspace inicial.
-- Comprobacion opcional despues de ejecutar el TRUNCATE:
-- SELECT 'assets' AS table_name, COUNT(*) AS rows FROM public.assets
-- UNION ALL
-- SELECT 'captures', COUNT(*) FROM public.captures
-- UNION ALL
-- SELECT 'manuals', COUNT(*) FROM public.manuals
-- UNION ALL
-- SELECT 'users', COUNT(*) FROM public.users;
