# Manual Builder API

## Descripcion

Backend NestJS para `manual-builder` con persistencia real en PostgreSQL y almacenamiento configurable de imagenes.

En esta etapa el API ya permite:

- Mantener el catalogo `workspace > sistemas > modulos > acciones`.
- Crear manuales persistentes por accion.
- Abrir sesiones de captura.
- Guardar capturas recibidas desde la extension como archivos reales en disco local o OneDrive institucional.
- Registrar capturas pendientes, aprobadas o descartadas.
- Convertir capturas en pasos del manual.
- Servir assets locales bajo `/uploads/...` o redirigir assets OneDrive desde `/api/v1/assets/onedrive/content`.
- Registrar usuarios con login simple.
- Restringir catalogo, manuales y capturas por membresia de workspace.
- Compartir workspaces con otros usuarios por `username`.

Todavia **no** incluye:

- Autenticacion CAS.
- OIDC ni login institucional.
- Generacion DOCX o PDF en backend.

## Tecnologias

- Node.js
- pnpm
- NestJS
- TypeScript
- PostgreSQL
- TypeORM

## Variables de entorno

El backend ya incluye `apps/api/.env` con valores locales de ejemplo y `apps/api/.env.example` como referencia.

Variables principales:

- `PORT`: puerto HTTP del API.
- `APP_PUBLIC_URL`: URL base usada para construir las URLs publicas de los assets.
- `MAX_JSON_BODY_SIZE`: limite del JSON recibido por el API. Debe cubrir las capturas base64 enviadas por la extension.
- `DATABASE_URL`: cadena completa de conexion, opcional.
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SCHEMA`: conexion PostgreSQL cuando no usas `DATABASE_URL`.
- `DB_SSL`: activa SSL si tu base institucional lo requiere.
- `DB_SYNCHRONIZE`: crea/ajusta tablas automaticamente desde las entidades.
- `DB_LOGGING`: logging SQL de TypeORM.
- `DEFAULT_WORKSPACE_NAME`, `DEFAULT_WORKSPACE_DESCRIPTION`: workspace inicial que el sistema crea si la base esta vacia.
- `ASSET_STORAGE_PROVIDER`: proveedor de assets. Usa `local` o `onedrive-business`.
- `STORAGE_ROOT`: carpeta local donde se guardan las imagenes cuando `ASSET_STORAGE_PROVIDER=local`.
- `MAX_ASSET_SIZE_MB`: limite de peso por imagen recibida.
- `AUTH_TOKEN_SECRET`: secreto para firmar tokens Bearer del login simple.
- `AUTH_TOKEN_TTL_SECONDS`: duracion del token en segundos. Por defecto, 8 horas.
- `ONEDRIVE_ROOT_PATH`: carpeta raiz usada en OneDrive para las capturas.
- `TOKEN_ACCESO_SERVICIOS` o `TOKEN_ONEDRIVE`: endpoint para obtener token de servicios de archivos.
- `SUBIR_ARCHIVO`, `OBTENER_ARCHIVO`, `ELIMINAR_ARCHIVO`, `OBTENER_LIST_ARCHIVO`: endpoints institucionales de archivos.
- `ID_APLICACION_ONEDRIVE`, `ID_CREDENCIAL_ONEDRIVE`, `JWT_SECRET_ONEDRIVE`: cabeceras institucionales requeridas por el servicio.

## Almacenamiento de assets

El backend selecciona el proveedor con `ASSET_STORAGE_PROVIDER`.

Para disco local:

```dotenv
ASSET_STORAGE_PROVIDER=local
STORAGE_ROOT=storage
APP_PUBLIC_URL=http://localhost:3001
```

Para OneDrive institucional:

```dotenv
ASSET_STORAGE_PROVIDER=onedrive-business
APP_PUBLIC_URL=http://localhost:3001
ONEDRIVE_ROOT_PATH=MANUAL_BUILDER
TOKEN_ACCESO_SERVICIOS=https://...
SUBIR_ARCHIVO=https://...
OBTENER_ARCHIVO=https://...
ELIMINAR_ARCHIVO=https://...
OBTENER_LIST_ARCHIVO=https://...
ID_APLICACION_ONEDRIVE=...
ID_CREDENCIAL_ONEDRIVE=...
JWT_SECRET_ONEDRIVE=...
```

Cuando se usa OneDrive, el API guarda en PostgreSQL:

- `file_name`: nombre final del archivo.
- `storage_path`: ruta estable dentro de OneDrive.
- `public_url`: URL devuelta por el servicio institucional. Si el servicio no devuelve URL, se guarda una URL estable del backend.

Fallback de URL estable del backend:

```text
http://localhost:3001/api/v1/assets/onedrive/content?path=...
```

Ese endpoint resuelve la URL real de descarga con `OBTENER_ARCHIVO` u `OBTENER_LIST_ARCHIVO` y redirige al archivo.

Para verificar que el backend arranco con el proveedor correcto:

```text
GET http://localhost:3001/api/v1/assets/storage/status
```

Para forzar una prueba de token sin imprimir el token:

```text
GET http://localhost:3001/api/v1/assets/storage/status?checkToken=true
```

La ruta de OneDrive se construye asi:

```text
{ONEDRIVE_ROOT_PATH}/captures/{sessionId}/{kind}-{timestamp}-{uuid}.{extension}
```

Ejemplo:

```text
MANUAL_BUILDER/captures/7f6f9d7f-18f4-4ef7-b332-e59a9ef9e65a/original-1783940000000-3c1d7c6a-4a9b-47c9-9344-6c1e9f6dc995.jpg
```

`ONEDRIVE_ROOT_PATH` define la carpeta raiz en tu nube. Si configuras `ONEDRIVE_ROOT_PATH=DTIC/MANUALES`, las imagenes se guardaran bajo `DTIC/MANUALES/captures/...`.

## Base de datos institucional

Si vas a usar una base PostgreSQL institucional:

1. Crea la base o pide una existente.
2. Ajusta `apps/api/.env` con el host, puerto, usuario, clave y nombre reales.
3. Si tu entorno exige SSL, cambia `DB_SSL=true`.
4. Para el primer arranque puedes usar `DB_SYNCHRONIZE=true`.
5. Cuando la estructura ya quede estable, conviene cambiar a `DB_SYNCHRONIZE=false` y pasar a migraciones.

Se incluye un script base en:

```text
apps/api/database/create-database.sql
```

Para una base que ya existe y no usa `DB_SYNCHRONIZE=true`, aplica tambien:

```text
apps/api/database/2026-07-12-auth-workspaces.sql
```

Si dejas `DB_SYNCHRONIZE=true`, TypeORM crea las tablas `users` y `workspace_members` al levantar el backend. En bases institucionales conviene usar el SQL y luego mantener `DB_SYNCHRONIZE=false`.

## Instalacion

Desde la raiz del monorepo:

```bash
cd manual-builder
pnpm install
```

## Ejecucion

Desde la raiz:

```bash
pnpm dev:api
```

Build y chequeo:

```bash
pnpm typecheck:api
pnpm build:api
```

## URL base

Por defecto:

```text
http://localhost:3001/api
```

Los archivos guardados se sirven por defecto desde:

```text
http://localhost:3001/uploads/
```

## Endpoints disponibles

### Estado general

- `GET /api`

### Assets

- `GET /api/v1/assets/storage/status`
- `GET /api/v1/assets/storage/status?checkToken=true`
- `GET /api/v1/assets/onedrive/content?path=...`

### Autenticacion

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### Workspaces

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:workspaceId/members`
- `POST /api/v1/workspaces/:workspaceId/members`

### Catalogo

- `GET /api/v1/catalog/workspaces/:workspaceId`
- `GET /api/v1/catalog/systems/:systemId`
- `POST /api/v1/catalog/systems`
- `POST /api/v1/catalog/modules`
- `POST /api/v1/catalog/actions`

### Manuales

- `POST /api/v1/manuals`
- `GET /api/v1/manuals/action/:actionId`
- `GET /api/v1/manuals/:manualId`
- `POST /api/v1/manuals/:manualId/steps/from-capture`

### Sesiones de captura

- `GET /api/v1/capture-sessions`
- `GET /api/v1/capture-sessions/:sessionId`
- `POST /api/v1/capture-sessions`
- `POST /api/v1/capture-sessions/:sessionId/captures`
- `PATCH /api/v1/capture-sessions/captures/:captureId`

## Flujo recomendado

1. Registrar o iniciar sesion con `POST /api/v1/auth/register` o `POST /api/v1/auth/login`.
2. Usar el `accessToken` como `Authorization: Bearer <token>`.
3. Consultar `GET /api/v1/workspaces`.
4. Crear un workspace con `POST /api/v1/workspaces` si el usuario no tiene uno.
5. Consultar `GET /api/v1/catalog/workspaces/:workspaceId`.
6. Crear sistema, modulo y accion.
7. Crear un manual con `POST /api/v1/manuals`.
8. Abrir una sesion de captura con `POST /api/v1/capture-sessions`.
9. Enviar capturas desde la extension usando `POST /api/v1/capture-sessions/:sessionId/captures`.
10. Revisar o descartar con `PATCH /api/v1/capture-sessions/captures/:captureId`.
11. Convertir una captura aprobada en paso con `POST /api/v1/manuals/:manualId/steps/from-capture`.

## Formato de captura

El endpoint de captura espera JSON, no `multipart`, para encajar con la extension actual que ya produce `data URLs`.

Ejemplo:

```json
{
  "selector": "main > section:nth-of-type(2) > button",
  "pageTitle": "Migracion Moodle",
  "pageUrl": "https://localhost:4200/aulas/agendamiento",
  "selectedElementTag": "button",
  "textSnippet": "Guardar",
  "title": "Seleccionar boton Guardar",
  "description": "Captura previa al guardado",
  "framing": "full",
  "originalImageDataUrl": "data:image/jpeg;base64,...",
  "contextImageDataUrl": "data:image/webp;base64,..."
}
```

## Almacenamiento

- Los archivos se guardan dentro de `apps/api/storage/` por defecto cuando `ASSET_STORAGE_PROVIDER=local`.
- Los archivos se suben a OneDrive cuando `ASSET_STORAGE_PROVIDER=onedrive-business`.
- La ruta real se registra en PostgreSQL.
- La respuesta del API devuelve tambien la URL publica del asset segun el proveedor activo.

## Siguiente etapa recomendada

1. Crear administracion visual de usuarios y roles.
2. Evaluar CAS/OIDC solo si el uso temporal pasa a produccion formal.
3. Agregar endpoint de descarga autenticada por asset ID si se requiere control fino de acceso.
4. Incorporar versionado real de manuales y reorder de pasos.
5. Luego generar PDF y DOCX.
