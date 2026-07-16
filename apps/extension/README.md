# Manual Builder Extension

## 1. Descripcion del proyecto

Este paquete contiene la extension **Manual Builder** en su etapa actual. Permite:

- Seleccionar elementos en paginas HTTP y HTTPS con `ALT + S`.
- Resaltar el elemento bajo el cursor sin modificar sus estilos originales.
- Bloquear el clic normal al seleccionar en el flujo de revision paso a paso.
- Capturar la pestana visible.
- Revisar siempre la captura de pantalla completa; el recorte contextual se conserva como detalle auxiliar.
- Confirmar o descartar capturas antes de guardarlas.
- Construir una lista de pasos con titulo, descripcion multilinea y resultado esperado opcional.
- Reordenar, eliminar y exportar pasos localmente.
- Sincronizar las capturas confirmadas con el backend NestJS despues de iniciar sesion y seleccionar una accion.
- Iniciar sesion con usuario/contrasena simple contra el backend.
- Seleccionar workspaces disponibles para el usuario autenticado.
- Crear workspaces y agregar colaboradores por nombre de usuario.
- Definir metadatos del manual: titulo, autor y descripcion.
- Exportar un PDF profesional A4 horizontal generado por codigo.
- Imprimir la vista final con la herramienta nativa del navegador como respaldo.

La exportacion PDF funciona dentro de la extension. El backend persiste sesiones, capturas y pasos; el proveedor configurado en la API decide si los binarios se guardan localmente o en OneDrive.

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
- `ALT + SHIFT + M`: capturar la pantalla visible sin seleccionar un elemento.
- `Capturar pantalla`: ejecutar la misma captura completa desde el panel.
- `Clic`: seleccionar el elemento resaltado y capturar la pestana visible.
- `ESC`: cancelar la seleccion.
- `Icono de la extension`: abrir la superficie de revision manualmente.

Edge reserva `ALT + SHIFT + S` para su propia herramienta. Manual Builder usa `ALT + SHIFT + M`; el atajo se puede consultar o reasignar en `edge://extensions/shortcuts`.
- `Agregar al manual`: convertir la captura actual en un paso persistente.
- `Descartar captura`: eliminar la captura pendiente sin guardarla.
- `Guardar cambios`: actualizar titulo y descripcion del paso seleccionado.
- `Arrastrar un paso`: cambiar su posicion y renumerar automaticamente todos los pasos.
- Los titulos guardados no incluyen `Paso n:`; ese prefijo se agrega dinamicamente solo al generar el PDF.
- `Subir` y `Bajar`: reordenar pasos del manual.
- `Entrar`: iniciar sesion en el backend.
- `Crear cuenta`: registrar un usuario simple en el backend.
- `Crear workspace`: crear un espacio de trabajo propio.
- `Agregar colaborador`: dar acceso a otro usuario al workspace seleccionado.
- La sesion y cada seleccion del catalogo se guardan automaticamente.
- `Crear manual remoto`: generar un manual remoto para la accion seleccionada.
- `Cargar manual remoto`: traer los pasos existentes del backend al editor local.
- `Exportar PDF del sistema`: consolidar los modulos, acciones y manuales remotos del sistema seleccionado en un solo documento.
- `Guardar datos del manual`: persistir titulo, autor y descripcion del documento.
- `Exportar PDF`: abrir la pagina de generacion y descargar el documento profesional.
- `Imprimir`: abrir el dialogo nativo como alternativa de respaldo.
- `Exportar JSON`: descargar el borrador completo con metadatos e imagenes embebidas.
- `Exportar imagenes`: descargar las imagenes originales y recortadas de todos los pasos.

## 7. Funcionamiento esperado

1. Al cargar una pagina HTTP o HTTPS, el content script registra:

```text
[Manual Builder] Extension cargada. Presiona ALT + S para seleccionar.
```

2. Al presionar `ALT + S`, aparece el aviso flotante del selector.
3. El aviso se oculta automaticamente despues de 2.8 segundos. Mientras el selector sigue activo, el elemento bajo el cursor se resalta.
4. Al hacer clic, la extension bloquea la accion normal del elemento y genera `SelectedElementData`.
5. El content script envia la seleccion al service worker.
6. El service worker captura primero la pestana visible y solo despues abre la superficie de revision.
7. Si el usuario inicio sesion y selecciono una accion remota:
   - La extension usa el token del usuario autenticado.
   - Solo carga workspaces donde el usuario es miembro.
   - La extension crea o reutiliza una sesion remota para la accion seleccionada.
   - Las capturas pendientes permanecen en la extension y todavia no se envian al backend.
   - Al confirmar, se envian juntos el original completo y el recorte contextual.
   - Si existe un manual remoto seleccionado, la misma confirmacion crea tambien el paso remoto.
8. La interfaz de revision permite:
   - Revisar las capturas desde la mas antigua hasta la mas reciente.
   - Ver la captura completa con el elemento resaltado.
   - Marcar una o varias zonas sensibles para difuminarlas de forma irreversible.
   - Confirmarla y crear un `ManualStep`.
   - Descartarla si no sirve.
9. Cuando confirmas una captura:
   - Se genera un original protegido y una imagen contextual protegida y optimizada.
   - Se guarda un paso persistente en `storage.local`.
   - Si el backend esta activo, ambos assets se guardan mediante el proveedor configurado.
   - Si hay manual remoto seleccionado, se crea tambien el paso remoto.
   - El paso queda disponible para edicion, reordenacion y exportacion.
10. Si cargas un manual remoto existente:
   - La extension descarga los pasos y sus imagenes desde el backend.
   - El borrador local se reemplaza por esos pasos.
   - Cada paso conserva su `remoteStepId` para sincronizar cambios de titulo y descripcion.
   - La imagen remota se usa como contexto y original local para poder seguir editando/exportando.
11. El editor de pasos permite:
   - Cambiar titulo.
   - Escribir una accion por linea y usar guiones, asteriscos, vinetas o numeracion.
   - Reordenar o eliminar el paso.
   - Descargar la captura completa.
12. La seccion de documento permite:
   - Definir el titulo general del manual.
   - Definir el autor.
   - Agregar una descripcion introductoria.
   - Exportar un PDF real con portada y una pagina por paso.
   - Imprimir usando el dialogo nativo del navegador como respaldo.

### Modo Solo captura

El boton `Solo captura` mantiene el selector activo para registrar varias acciones consecutivas. En este modo cada clic se intercepta, se captura primero la pestana visible y solo despues se reproduce el clic real del elemento. `ESC` termina la seleccion continua.

El modo continuo no bloquea `pointerdown`, escritura, desplazamiento ni arrastre. Solo retrasa el clic que se esta capturando; los clics adicionales durante una captura pasan normalmente al sitio y no se agregan a la cola.

### Captura sin elemento

El boton `Capturar pantalla` y el atajo `ALT + SHIFT + M` guardan la pestana visible completa sin selector, mascara ni resaltado. Antes de capturar se ocultan todos los componentes visuales propiedad de la extension cuando la pagina permite ejecutar el content script.

### Comportamiento por navegador

- Chrome, Chromium y Edge: la revision puede abrirse en panel lateral.
- Firefox: la extension usa una pestana de revision como fallback compatible.
- La vista final del manual y la impresion a PDF funcionan como pagina interna de la extension en ambos enfoques.

## 8. Exportacion PDF

La generacion se ejecuta en `manual.html`, donde estan disponibles Canvas, Blob y la interfaz de progreso. El service worker no participa en la composicion del archivo.

Caracteristicas principales:

- A4 horizontal con margenes propios, portada y una pagina por paso.
- La descripcion del paso se muestra una sola vez en `ACCION PRINCIPAL`, respetando cada linea como una vineta.
- `PAGINA / RECURSO` aparece solo en el primer paso y usa la informacion de su captura.
- La exportacion por sistema agrega un indice de modulos y acciones, y un breadcrumb de contexto en cada paso.
- Paleta roja, blanca, dorada y acentos verdes para resultados.
- Captura general sin deformacion, detalle contextual y placeholders cuando falta una imagen.
- JPEG, PNG y WebP; WebP se convierte mediante Canvas antes de incrustarse.
- Captura visible en JPEG con calidad 95/100, sin redimensionamiento previo.
- Contexto WebP con calidad 0.94 y PDF con limite de 2560 px y calidad 0.94.
- Instrucciones inferidas cuando la descripcion esta vacia o contiene texto de prueba.
- Compatibilidad con `guide`, `annotationBaked` y alias de imagenes de JSON anteriores.
- Progreso visible y bloqueo de exportaciones simultaneas.

El codigo esta separado en `lib/pdf`: tipos, tema, texto, contenido, imagenes, generador y descarga. `generateManualPdf()` devuelve `Uint8Array`; `exportManualPdf()` genera el Blob y descarga el archivo. La exportacion individual se inicia desde `manual.html`; la consolidada por sistema usa el mismo generador directamente desde el panel.

### Fuentes

Para cobertura Unicode completa agrega estos archivos en `public/fonts`:

- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`

La ausencia de estos archivos no bloquea la exportacion. Se utiliza Helvetica como fallback y se conservan los caracteres habituales del espanol. Consulta `public/fonts/README.md`.

## 9. Persistencia usada

- `IndexedDB`: binarios de las capturas pendientes de revision.
- `browser.storage.session`: metadatos ligeros de la cola temporal.
- `browser.storage.local`: borrador del manual y pasos confirmados.
- `browser.storage.local`: configuracion de conexion al backend, token de sesion y estado de sincronizacion remota.
- Backend NestJS/PostgreSQL: sesiones, capturas y pasos remotos cuando la sincronizacion esta activada.

## 10. Limitaciones actuales

- El borrador del manual sigue siendo local al navegador actual.
- Las imagenes originales se capturan como JPEG por compatibilidad amplia con `captureVisibleTab()`.
- La imagen contextual se intenta guardar como WebP y usa PNG como fallback si el navegador no soporta esa salida.
- Los pasos confirmados mantienen una copia local para editar y exportar; el permiso `unlimitedStorage` evita la cuota reducida de `storage.local`.
- El backend no recomprime los assets: OneDrive recibe el JPEG/WebP generado por la extension.
- Helvetica cubre el espanol habitual, pero las fuentes Noto Sans son necesarias para Unicode amplio.
- No existe todavia una plantilla corporativa configurable.
- La autenticacion es simple con usuario/contrasena; no es CAS ni OIDC.
- No hay pantalla administrativa completa para usuarios; el alta se hace desde el panel o por API.
- Al cargar un manual remoto, la extension reemplaza el borrador local actual.
- La edicion remota actual sincroniza titulo, descripcion y resultado esperado; eliminar o reordenar pasos sigue siendo local.
- El almacenamiento remoto depende de que la API este ejecutandose con `ASSET_STORAGE_PROVIDER=onedrive-business`.
- No se generan archivos DOCX.
- Firefox puede mostrar advertencias de build relacionadas con distribucion, aunque el flujo local sigue funcionando.

## 11. Proxima etapa

La siguiente iteracion deberia incorporar:

- Gestion de manuales por proyecto, no solo un borrador local.
- Migrar los Blob de imagenes a IndexedDB y conservar solo referencias en el JSON.
- Pantalla administrativa completa para usuarios, roles y auditoria.
- Mejora de permisos por manual/accion si se necesita un control mas fino que workspace.
- Autenticacion institucional mediante OIDC/CAS y politicas de acceso por manual.
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
8. Verificar que el boton o enlace no ejecute su accion y que aparezca la captura completa en revision.
9. Confirmar la captura con `Agregar al manual`.
10. Verificar que aparezca un paso guardado en la lista.
11. Editar titulo y descripcion del paso.
12. Arrastrar un paso antes o despues de otro y verificar que todos los numeros se actualicen.
13. Completar titulo, autor y descripcion del manual.
14. Pulsar `Exportar PDF` y verificar portada, numeracion, captura general y detalle contextual.
15. Descargar `Exportar JSON` y `Exportar imagenes`.
16. Completar `Servidor`, usuario y una contrasena de al menos seis caracteres; se admiten letras y numeros.
17. Usar `Entrar` o `Crear cuenta` y comprobar que funciona en el primer intento.
18. Seleccionar o crear workspace, sistema, modulo y accion.
19. Confirmar que el indicador muestre `Sincronizacion activa` sin pulsar un boton adicional de guardado.
20. Realizar una captura nueva y verificar en PostgreSQL que el asset reciente tenga el proveedor esperado.
21. Crear o seleccionar un manual remoto y confirmar un paso.
22. Usar `Cargar manual remoto` y confirmar que los pasos existentes aparezcan en el editor.
23. Editar titulo o descripcion de un paso cargado y pulsar `Guardar cambios`.
24. Probar en una pagina con scroll y despues de navegar dentro de una SPA.
25. Escribir varias acciones separadas por saltos de linea y verificar que el PDF las muestre como vinetas sin repetir la descripcion bajo el titulo.
26. Seleccionar un sistema con manuales remotos, pulsar `Exportar PDF del sistema` y verificar el indice de modulos y acciones.
