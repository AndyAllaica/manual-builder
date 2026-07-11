# Manual Builder Extension MVP 5

## 1. Descripcion del proyecto

Este paquete contiene la extension **Manual Builder** en su etapa actual. Permite:

- Seleccionar elementos en paginas HTTP y HTTPS con `ALT + S`.
- Resaltar el elemento bajo el cursor sin modificar sus estilos originales.
- Bloquear el clic normal al seleccionar en el flujo de revision paso a paso.
- Capturar la pestana visible.
- Revisar la captura con un recorte contextual pensado para manuales.
- Confirmar o descartar capturas antes de guardarlas.
- Activar un modo explicito de `solo captura` para acumular capturas en lote.
- Construir una lista de pasos del manual con titulo y descripcion editables.
- Reordenar, eliminar y exportar pasos localmente.
- Definir metadatos del manual: titulo, autor y descripcion.
- Abrir una vista final del manual.
- Imprimir esa vista o guardarla como PDF con la herramienta nativa del navegador.

En esta etapa **no** se implementan backend, base de datos, OneDrive ni DOCX.

## 2. Requisitos

- Node.js 20 o superior.
- pnpm.
- Un navegador compatible con extensiones MV3.
- Para pruebas multiplataforma:
  - Chrome, Chromium o Edge.
  - Firefox.

## 3. Instalacion

Desde la raiz del repositorio:

```bash
cd manual-builder
pnpm install
```

Tambien puedes instalar solo la app:

```bash
cd manual-builder/apps/extension
pnpm install
```

## 4. Ejecucion en modo desarrollo

Desde la raiz:

```bash
pnpm dev
pnpm dev:chrome
pnpm dev:firefox
pnpm typecheck
pnpm build:chrome
pnpm build:firefox
```

Desde `apps/extension`:

```bash
pnpm dev
pnpm dev:chrome
pnpm dev:firefox
pnpm typecheck
pnpm build:chrome
pnpm build:firefox
```

## 5. Como cargar manualmente la extension si WXT no abre el navegador

### Chrome, Chromium o Edge

1. Ejecuta `pnpm dev` o `pnpm dev:chrome`.
2. Abre `chrome://extensions` o `edge://extensions`.
3. Activa el modo desarrollador.
4. Usa **Cargar descomprimida**.
5. Carga `manual-builder/apps/extension/.output/chrome-mv3-dev`.

### Firefox

1. Ejecuta `pnpm dev:firefox`.
2. Abre `about:debugging#/runtime/this-firefox`.
3. Usa **Load Temporary Add-on**.
4. Selecciona el `manifest.json` dentro de `manual-builder/apps/extension/.output/firefox-mv3-dev`.

## 6. Controles disponibles

- `ALT + S`: activar o desactivar el selector.
- `Clic`: seleccionar el elemento resaltado y capturar la pestana visible.
- `ESC`: cancelar la seleccion.
- `Icono de la extension`: abrir la superficie de revision manualmente.
- `Activar solo captura`: cambiar a un flujo por lotes desde el panel.
- `Contexto`: ver el recorte alrededor del elemento.
- `Pantalla completa`: ver toda la captura con el elemento resaltado.
- `Agregar al manual`: convertir la captura actual en un paso persistente.
- `Descartar captura`: eliminar la captura pendiente sin guardarla.
- `Guardar cambios`: actualizar titulo y descripcion del paso seleccionado.
- `Subir` y `Bajar`: reordenar pasos del manual.
- `Guardar datos del manual`: persistir titulo, autor y descripcion del documento.
- `Abrir vista final`: abrir la composicion final del manual en una pagina de la extension.
- `Abrir para PDF`: abrir la vista final y lanzar la impresion nativa para guardar PDF.
- `Exportar JSON`: descargar el borrador completo con metadatos e imagenes embebidas.
- `Exportar imagenes`: descargar las imagenes originales y recortadas de todos los pasos.

## 7. Funcionamiento esperado

1. Al cargar una pagina HTTP o HTTPS, el content script registra:

```text
[Manual Builder] Extension cargada. Presiona ALT + S para seleccionar.
```

2. Al presionar `ALT + S`, aparece el aviso flotante del selector.
3. Mientras el selector esta activo, el elemento bajo el cursor se resalta con un overlay fijo.
4. En `Revision paso a paso`, al hacer clic, la extension bloquea la accion normal del elemento y genera `SelectedElementData`.
5. El content script envia la seleccion al service worker.
6. El service worker captura la pestana visible y guarda el resultado en memoria de sesion para revision.
7. La interfaz de revision permite:
   - Ver la captura en `Contexto` o `Pantalla completa`.
   - Confirmarla y crear un `ManualStep`.
   - Descartarla si no sirve.
8. Si activas `Solo captura`:
   - La extension deja de abrir la revision automaticamente en cada captura.
   - Presionas `ALT + S` una vez y puedes seguir capturando varios elementos.
   - La extension captura primero y luego deja pasar la accion real del elemento seleccionado.
   - El selector continua activo despues de cada captura hasta que presiones `ESC`.
   - Las capturas quedan en la cola temporal para revisarlas despues.
9. Cuando confirmas una captura:
   - Se genera una imagen contextual optimizada.
   - Se guarda un paso persistente en `storage.local`.
   - El paso queda disponible para edicion, reordenacion y exportacion.
10. El editor de pasos permite:
   - Cambiar titulo.
   - Escribir descripcion.
   - Reordenar o eliminar el paso.
   - Descargar su imagen de contexto o la original.
11. La seccion de documento permite:
   - Definir el titulo general del manual.
   - Definir el autor.
   - Agregar una descripcion introductoria.
   - Abrir la vista final del manual.
   - Imprimir o guardar PDF usando el dialogo nativo del navegador.

### Comportamiento por navegador

- Chrome, Chromium y Edge: la revision puede abrirse en panel lateral.
- Firefox: la extension usa una pestana de revision como fallback compatible.
- La vista final del manual y la impresion a PDF funcionan como pagina interna de la extension en ambos enfoques.

## 8. Persistencia usada

- `browser.storage.session`: cola temporal de capturas pendientes de revision.
- `browser.storage.local`: borrador del manual y pasos confirmados.

## 9. Limitaciones actuales

- El borrador del manual sigue siendo local al navegador actual.
- Las imagenes originales se capturan como JPEG por compatibilidad amplia con `captureVisibleTab()`.
- La imagen contextual se intenta guardar como WebP y usa PNG como fallback si el navegador no soporta esa salida.
- La exportacion PDF depende del motor de impresion del navegador y del destino **Guardar como PDF**.
- La cola de `solo captura` sigue siendo temporal y depende del presupuesto de memoria de la extension.
- No existe todavia una plantilla corporativa configurable.
- No hay sincronizacion entre dispositivos.
- No se envia informacion a un backend.
- No se guarda nada en OneDrive.
- No se generan archivos DOCX.
- Firefox puede mostrar advertencias de build relacionadas con distribucion, aunque el flujo local sigue funcionando.

## 10. Proxima etapa

La siguiente iteracion deberia incorporar:

- Gestion de manuales por proyecto, no solo un borrador local.
- Persistencia remota con backend NestJS.
- Almacenamiento local avanzado o en OneDrive mediante Microsoft Graph.
- Exportacion DOCX.
- Ajustes visuales del documento final para portadas, numeracion y plantillas.

## Pruebas manuales

1. Ejecutar `pnpm dev` o `pnpm dev:firefox`.
2. Abrir una pagina HTTP o HTTPS.
3. Presionar `ALT + S`.
4. Verificar que aparezca el aviso flotante.
5. Mover el mouse sobre varios elementos.
6. Verificar que el recuadro siga correctamente al elemento.
7. Seleccionar un boton o enlace.
8. Verificar que en `Revision paso a paso` el boton o enlace no ejecute su accion.
9. Confirmar que aparezca la captura en la superficie de revision del navegador.
10. Revisar la vista `Contexto`.
11. Cambiar a `Pantalla completa`.
12. Confirmar la captura con `Agregar al manual`.
13. Verificar que aparezca un paso guardado en la lista.
14. Editar titulo y descripcion del paso.
15. Completar titulo, autor y descripcion del manual.
16. Activar `Solo captura`.
17. Volver a la pagina y presionar `ALT + S` una sola vez.
18. Seleccionar varios elementos seguidos y verificar que el selector continue activo y que la accion real de cada clic siga funcionando.
19. Presionar `ESC` y confirmar que el ciclo de seleccion se detiene.
20. Revisar luego la cola de capturas pendientes.
21. Probar `Abrir vista final`.
22. Probar `Abrir para PDF` y usar **Guardar como PDF**.
23. Descargar `Exportar JSON`.
24. Descargar `Exportar imagenes`.
25. Probar en una pagina con scroll.
26. Probar despues de navegar dentro de una SPA.
