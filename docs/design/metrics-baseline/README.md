# Baseline visual de Métricas

Estado previo al rediseño de la sala de control, capturado el 7 de septiembre de 2026:

- `mapa-antes.jpg`: mapa con calor y puntos superpuestos, filtros y cobertura.
- `calidad-antes.png`: donut de capas, chips y tabla.

Estas imágenes son la referencia de “antes”. La regresión automatizada de las seis vistas vive en `e2e/metrics.visual.spec.ts` y genera el “después” en claro/oscuro y breakpoints definidos por Playwright.

Los criterios normativos están en `PRODUCT.md` y `DESIGN.md`.
