# Identidad visual del PDF vertical

Coloca en este directorio los archivos:

- `header.png`: encabezado horizontal con transparencia.
- `footer.png`: pie horizontal con transparencia.

Las rutas, anchuras y alturas se configuran en `lib/pdf/manual-pdf.branding.config.ts`.
Las medidas se expresan en puntos PDF; el ancho completo de A4 vertical es `595.28`.
Cuando una imagen usa un ancho menor, se centra automaticamente.
`footerOffsetY` define cuantos puntos se eleva el pie desde el borde inferior.
Como referencia, usa una relacion aproximada de 8:1 para el encabezado y 13.5:1 para el pie.
