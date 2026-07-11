# Manual Builder API

## Descripcion

Backend NestJS para `manual-builder` con persistencia real en PostgreSQL y almacenamiento local de imagenes.

En esta etapa el API ya permite:

- Mantener el catalogo `workspace > sistemas > modulos > acciones`.
- Crear manuales persistentes por accion.
- Abrir sesiones de captura.
- Guardar capturas recibidas desde la extension como archivos reales en disco.
- Registrar capturas pendientes, aprobadas o descartadas.
- Convertir capturas en pasos del manual.
- Servir los assets guardados mediante URLs locales bajo `/uploads/...`.

Todavia **no** incluye:

- Autenticacion CAS.
- JWT u otro login institucional.
- OneDrive o Microsoft Graph.
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
- `DATABASE_URL`: cadena completa de conexion, opcional.
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SCHEMA`: conexion PostgreSQL cuando no usas `DATABASE_URL`.
- `DB_SSL`: activa SSL si tu base institucional lo requiere.
- `DB_SYNCHRONIZE`: crea/ajusta tablas automaticamente desde las entidades.
- `DB_LOGGING`: logging SQL de TypeORM.
- `DEFAULT_WORKSPACE_NAME`, `DEFAULT_WORKSPACE_DESCRIPTION`: workspace inicial que el sistema crea si la base esta vacia.
- `STORAGE_ROOT`: carpeta local donde se guardan las imagenes.
- `MAX_ASSET_SIZE_MB`: limite de peso por imagen recibida.

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

### Catalogo

- `GET /api/v1/catalog/workspace`
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

1. Consultar `GET /api/v1/catalog/workspace` para obtener el workspace inicial.
2. Crear un sistema con `POST /api/v1/catalog/systems`.
3. Crear un modulo con `POST /api/v1/catalog/modules`.
4. Crear una accion con `POST /api/v1/catalog/actions`.
5. Crear un manual con `POST /api/v1/manuals`.
6. Abrir una sesion de captura con `POST /api/v1/capture-sessions`.
7. Enviar capturas desde la extension usando `POST /api/v1/capture-sessions/:sessionId/captures`.
8. Revisar o descartar con `PATCH /api/v1/capture-sessions/captures/:captureId`.
9. Convertir una captura aprobada en paso con `POST /api/v1/manuals/:manualId/steps/from-capture`.

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
  "framing": "context",
  "originalImageDataUrl": "data:image/jpeg;base64,...",
  "contextImageDataUrl": "data:image/webp;base64,..."
}
```

## Almacenamiento local

- Los archivos se guardan dentro de `apps/api/storage/` por defecto.
- La ruta real se registra en PostgreSQL.
- La respuesta del API devuelve tambien la URL publica local del asset.

## Siguiente etapa recomendada

1. Conectar la extension directamente a este API.
2. Crear autenticacion institucional.
3. Agregar proveedor de almacenamiento OneDrive / SharePoint.
4. Incorporar versionado real de manuales y reorder de pasos.
5. Luego generar PDF y DOCX.
