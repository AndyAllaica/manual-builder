# Fuentes del PDF

La exportación busca estas fuentes locales:

- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`

Descarga archivos TTF legítimos de Noto Sans y colócalos en esta carpeta para obtener cobertura Unicode completa. No cambies los nombres salvo que también actualices las rutas en `entrypoints/manual/main.ts`.

Si los archivos no existen o son inválidos, la exportación continúa con Helvetica y conserva los caracteres habituales del español. Los caracteres no disponibles en esa fuente se sustituyen de forma segura.
