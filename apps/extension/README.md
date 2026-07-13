# Manual Builder Extension MVP 6

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
- Sincronizar capturas y pasos con el backend NestJS de forma opcional.
- Iniciar sesion con usuario/contrasena simple contra el backend.
- Seleccionar workspaces disponibles para el usuario autenticado.
- Crear workspaces y agregar colaboradores por nombre de usuario.
- Definir metadatos del manual: titulo, autor y descripcion.
- Abrir una vista final del manual.
- Exportar un PDF profesional A4 horizontal generado por codigo.
- Imprimir la vista final con la herramienta nativa del navegador como respaldo.

La exportacion PDF funciona completamente dentro de la extension y no depende del backend. El backend actual se usa solo como sincronizacion opcional para sesiones, capturas y pasos del manual.

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
- `Arrastrar un paso`: cambiar su posicion y renumerar automaticamente todos los pasos.
- Los titulos guardados no incluyen `Paso n:`; ese prefijo se agrega dinamicamente solo al generar el PDF.
- `Subir` y `Bajar`: reordenar pasos del manual.
- `Entrar`: iniciar sesion en el backend.
- `Registrar`: crear un usuario simple en el backend.
- `Crear workspace`: crear un espacio de trabajo propio.
- `Agregar colaborador`: dar acceso a otro usuario al workspace seleccionado.
- `Guardar conexion`: persistir la configuracion del backend remoto.
- `Cargar catalogo`: comprobar token, workspace y catalogo del API NestJS.
- `Crear manual remoto`: generar un manual remoto para la accion seleccionada.
- `Cargar manual remoto`: traer los pasos existentes del backend al editor local.
- `Guardar datos del manual`: persistir titulo, autor y descripcion del documento.
- `Abrir vista final`: abrir la composicion final del manual en una pagina de la extension.
- `Exportar PDF`: abrir la vista final e iniciar automaticamente la misma exportacion profesional disponible en esa pagina.
- `Imprimir`: abrir el dialogo nativo como alternativa de respaldo.
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
7. Si la sincronizacion remota esta activa y configurada:
   - La extension usa el token del usuario autenticado.
   - Solo carga workspaces donde el usuario es miembro.
   - La extension crea o reutiliza una sesion remota para la accion seleccionada.
   - La captura se envia opcionalmente al backend sin bloquear el flujo local.
   - Al confirmar el paso, la extension adjunta tambien el recorte contextual y crea el paso remoto.
   - Al descartar una captura ya sincronizada, intenta marcarla como descartada en el backend.
8. La interfaz de revision permite:
   - Ver la captura en `Contexto` o `Pantalla completa`.
   - Confirmarla y crear un `ManualStep`.
   - Descartarla si no sirve.
9. Si activas `Solo captura`:
   - La extension deja de abrir la revision automaticamente en cada captura.
   - Presionas `ALT + S` una vez y puedes seguir capturando varios elementos.
   - La extension captura primero y luego deja pasar la accion real del elemento seleccionado.
   - El selector continua activo despues de cada captura hasta que presiones `ESC`.
   - Las capturas quedan en la cola temporal para revisarlas despues.
10. Cuando confirmas una captura:
   - Se genera una imagen contextual optimizada.
   - Se guarda un paso persistente en `storage.local`.
   - Si el backend esta activo y hay manual remoto seleccionado, se crea tambien el paso remoto.
   - El paso queda disponible para edicion, reordenacion y exportacion.
11. Si cargas un manual remoto existente:
   - La extension descarga los pasos y sus imagenes desde el backend.
   - El borrador local se reemplaza por esos pasos.
   - Cada paso conserva su `remoteStepId` para sincronizar cambios de titulo y descripcion.
   - La imagen remota se usa como contexto y original local para poder seguir editando/exportando.
12. El editor de pasos permite:
   - Cambiar titulo.
   - Escribir descripcion.
   - Reordenar o eliminar el paso.
   - Descargar su imagen de contexto o la original.
13. La seccion de documento permite:
   - Definir el titulo general del manual.
   - Definir el autor.
   - Agregar una descripcion introductoria.
   - Abrir la vista final del manual.
   - Exportar un PDF real con portada y una pagina por paso.
   - Imprimir usando el dialogo nativo del navegador como respaldo.

### Comportamiento por navegador

- Chrome, Chromium y Edge: la revision puede abrirse en panel lateral.
- Firefox: la extension usa una pestana de revision como fallback compatible.
- La vista final del manual y la impresion a PDF funcionan como pagina interna de la extension en ambos enfoques.

## 8. Exportacion PDF

La generacion se ejecuta en `manual.html`, donde estan disponibles Canvas, Blob y la interfaz de progreso. El service worker no participa en la composicion del archivo.

Caracteristicas principales:

- A4 horizontal con margenes propios, portada y una pagina por paso.
- Paleta roja, blanca, dorada y acentos verdes para resultados.
- Captura general sin deformacion, detalle contextual y placeholders cuando falta una imagen.
- JPEG, PNG y WebP; WebP se convierte mediante Canvas antes de incrustarse.
- Procesamiento secuencial con limite predeterminado de 1900 px y calidad 0.84.
- Instrucciones inferidas cuando la descripcion esta vacia o contiene texto de prueba.
- Compatibilidad con `guide`, `annotationBaked` y alias de imagenes de JSON anteriores.
- Progreso visible y bloqueo de exportaciones simultaneas.

El codigo esta separado en `lib/pdf`: tipos, tema, texto, contenido, imagenes, generador y descarga. `generateManualPdf()` devuelve `Uint8Array`; `exportManualPdf()` genera el Blob y descarga el archivo.

### Fuentes

Para cobertura Unicode completa agrega estos archivos en `public/fonts`:

- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`

La ausencia de estos archivos no bloquea la exportacion. Se utiliza Helvetica como fallback y se conservan los caracteres habituales del espanol. Consulta `public/fonts/README.md`.

## 9. Persistencia usada

- `browser.storage.session`: cola temporal de capturas pendientes de revision.
- `browser.storage.local`: borrador del manual y pasos confirmados.
- `browser.storage.local`: configuracion de conexion al backend, token de sesion y estado de sincronizacion remota.
- Backend NestJS/PostgreSQL: sesiones, capturas y pasos remotos cuando la sincronizacion esta activada.

## 10. Limitaciones actuales

- El borrador del manual sigue siendo local al navegador actual.
- Las imagenes originales se capturan como JPEG por compatibilidad amplia con `captureVisibleTab()`.
- La imagen contextual se intenta guardar como WebP y usa PNG como fallback si el navegador no soporta esa salida.
- Las imagenes siguen embebidas como Data URL en `storage.local`, por lo que manuales extensos pueden alcanzar la cuota del navegador.
- Helvetica cubre el espanol habitual, pero las fuentes Noto Sans son necesarias para Unicode amplio.
- La cola de `solo captura` sigue siendo temporal y depende del presupuesto de memoria de la extension.
- No existe todavia una plantilla corporativa configurable.
- La autenticacion es simple con usuario/contrasena; no es CAS ni OIDC.
- No hay pantalla administrativa completa para usuarios; el alta se hace desde el panel o por API.
- Al cargar un manual remoto, la extension reemplaza el borrador local actual.
- La edicion remota actual sincroniza titulo y descripcion; eliminar o reordenar pasos sigue siendo local.
- No se guarda nada en OneDrive.
- No se generan archivos DOCX.
- Firefox puede mostrar advertencias de build relacionadas con distribucion, aunque el flujo local sigue funcionando.

## 11. Proxima etapa

La siguiente iteracion deberia incorporar:

- Gestion de manuales por proyecto, no solo un borrador local.
- Migrar los Blob de imagenes a IndexedDB y conservar solo referencias en el JSON.
- Pantalla administrativa completa para usuarios, roles y auditoria.
- Mejora de permisos por manual/accion si se necesita un control mas fino que workspace.
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
15. Arrastrar un paso antes o despues de otro y verificar que todos los numeros se actualicen.
16. Completar titulo, autor y descripcion del manual.
17. Activar `Solo captura`.
18. Volver a la pagina y presionar `ALT + S` una sola vez.
19. Seleccionar varios elementos seguidos y verificar que el selector continue activo y que la accion real de cada clic siga funcionando.
20. Presionar `ESC` y confirmar que el ciclo de seleccion se detiene.
21. Revisar luego la cola de capturas pendientes.
22. Probar `Abrir vista final`.
23. Pulsar `Exportar PDF`, observar el progreso y abrir el archivo descargado.
24. Verificar portada, una pagina por paso, imagenes sin deformacion y texto en espanol.
25. Probar tambien `Imprimir` como alternativa de respaldo.
26. Descargar `Exportar JSON`.
27. Descargar `Exportar imagenes`.
28. Activar la sincronizacion remota, completar `URL base`, usuario y contrasena.
29. Usar `Entrar` o `Registrar`.
30. Seleccionar o crear un workspace.
31. Crear o seleccionar sistema, modulo, accion y manual remoto.
32. Usar `Cargar manual remoto` y confirmar que los pasos existentes aparezcan en el editor.
33. Editar titulo o descripcion de un paso cargado y pulsar `Guardar cambios`.
34. Verificar en el backend que el paso remoto se actualice.
35. Confirmar una captura nueva y verificar en el backend que se haya creado la sesion, la captura y el paso remoto.
36. Agregar un colaborador por username y verificar que ese usuario vea el workspace al iniciar sesion.
37. Probar en una pagina con scroll.
38. Probar despues de navegar dentro de una SPA.
