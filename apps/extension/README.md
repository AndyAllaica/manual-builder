# Manual Builder Extension MVP 2

## 1. Descripción del proyecto

Este paquete contiene el segundo MVP de la extensión **Manual Builder**. Permite seleccionar elementos en páginas HTTP y HTTPS, capturar automáticamente la pestaña visible y mostrar el resultado en un side panel.

La selección ahora se divide en tres piezas:

- `content.ts`: selector visual y metadatos del elemento.
- `background.ts`: service worker y orquestación de capturas.
- `sidepanel/`: revisión visual de capturas y datos asociados.

En esta etapa **no** se implementan backend, base de datos, almacenamiento en OneDrive ni generación de PDF o DOCX.

## 2. Requisitos

- Node.js 20 o superior.
- pnpm.
- Un navegador Chromium reciente compatible con Manifest V3 y Side Panel API.

## 3. Instalación

Desde la raíz del repositorio:

```bash
cd manual-builder
pnpm install
```

También puedes instalar solo la app:

```bash
cd manual-builder/apps/extension
pnpm install
```

## 4. Ejecución en modo desarrollo

Desde la raíz del workspace:

```bash
cd manual-builder
pnpm dev
```

Desde la carpeta de la extensión:

```bash
cd manual-builder/apps/extension
pnpm dev
```

Comandos adicionales:

```bash
pnpm typecheck
pnpm build
```

## 5. Cómo cargar manualmente la extensión si WXT no abre el navegador

1. Ejecuta `pnpm dev`.
2. Abre `chrome://extensions`, `edge://extensions` o la página equivalente de tu navegador Chromium.
3. Activa el modo desarrollador.
4. Selecciona **Cargar descomprimida**.
5. Carga la carpeta `manual-builder/apps/extension/.output/chrome-mv3-dev`.

## 6. Controles disponibles

- `ALT + S`: activar o desactivar el selector.
- `Clic`: seleccionar el elemento resaltado y capturar la pestaña visible.
- `ESC`: cancelar la selección.
- `Icono de la extensión`: abrir o reabrir el side panel manualmente.
- `Limpiar panel`: borrar el historial temporal de la sesión.

## 7. Funcionamiento esperado

1. Al cargar una página HTTP o HTTPS, el content script registra en consola:

```text
[Manual Builder] Extensión cargada. Presiona ALT + S para seleccionar.
```

2. Al presionar `ALT + S`, aparece el aviso flotante del selector.
3. Mientras el selector está activo, el elemento bajo el cursor se resalta con un overlay fijo.
4. Al hacer clic, la extensión bloquea la acción normal del elemento y mantiene visible el recuadro sobre el elemento seleccionado.
5. El content script envía `SelectedElementData` al service worker.
6. El service worker abre el side panel, captura la pestaña visible y guarda el resultado en memoria de sesión.
7. El side panel muestra:

- La imagen capturada.
- El selector generado.
- El texto detectado.
- La URL y el título de la página.
- La posición del elemento y el viewport.
- Un historial corto de capturas recientes.

## 8. Permisos usados en esta etapa

- `storage`: guardar temporalmente el estado del side panel durante la sesión.
- `sidePanel`: agregado automáticamente por WXT al incluir el entrypoint del side panel.
- `host_permissions: <all_urls>`: necesario para `captureVisibleTab()` en este MVP automático.

## 9. Limitaciones actuales

- La captura se guarda solo durante la sesión del navegador.
- No recorta todavía la imagen al elemento seleccionado; captura la pestaña visible completa.
- No sincroniza capturas entre dispositivos.
- No envía datos a un backend.
- No guarda imágenes ni documentos en OneDrive.
- No genera PDF ni DOCX.

## 10. Próxima etapa

La siguiente iteración debe incorporar:

- Recorte o marcado adicional del elemento dentro de la captura.
- Persistencia local más robusta o almacenamiento remoto.
- Envío de capturas y metadatos a un backend NestJS.
- Guardado opcional en OneDrive mediante Microsoft Graph.
- Generación de documentos PDF y DOCX a partir de las capturas seleccionadas.

## Pruebas manuales

1. Ejecutar `pnpm dev`.
2. Abrir una página HTTP o HTTPS.
3. Presionar `ALT + S`.
4. Verificar que aparezca el aviso flotante.
5. Mover el mouse sobre varios elementos.
6. Verificar que el recuadro siga correctamente al elemento.
7. Seleccionar un botón o enlace.
8. Verificar que el botón o enlace no ejecute su acción.
9. Confirmar que el side panel se abra o pueda reabrirse desde el icono de la extensión.
10. Verificar que aparezca una captura de la pestaña visible.
11. Revisar en el side panel el selector, texto, URL, rectángulo y viewport.
12. Seleccionar un segundo elemento y confirmar que el historial se actualice.
13. Presionar nuevamente `ALT + S` y luego `ESC`.
14. Confirmar que el modo selección se cancela.
15. Probar en una página con scroll.
16. Probar después de navegar dentro de una aplicación SPA.
