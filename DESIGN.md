---
name: Prosavis CRM — Sala de control
description: Analítica operativa precisa, sobria y profundamente investigable.
colors:
  command-navy: "#002446"
  action-orange: "#FF7700"
  canvas-light: "#F4F7FA"
  surface-light: "#FFFFFF"
  ink-light: "#17212B"
  muted-light: "#526170"
  line-light: "#D8E0E8"
  canvas-dark: "#0F1419"
  surface-dark: "#1E252E"
  ink-dark: "#FFFFFF"
  muted-dark: "#CBD5E0"
  line-dark: "#404B5A"
  quality-favorite: "#237A49"
  quality-recurring: "#1769AA"
  quality-standard: "#667788"
  quality-risk: "#B4232F"
typography:
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  analytics-panel:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.lg}"
    padding: "20px"
  filter-selected:
    backgroundColor: "{colors.command-navy}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  action-primary:
    backgroundColor: "{colors.command-navy}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
---

# Design System: Prosavis CRM — Sala de control

## Overview

**Creative North Star: "La sala de control serena"**

La superficie se comporta como un instrumento operativo bien calibrado: primero orienta, luego permite investigar. La densidad es deliberada y la jerarquía evita que seis vistas, decenas de filtros y cientos de filas compitan al mismo tiempo.

El sistema es familiar para usuarios de producto y evita convertir “premium” en decoración. No usa glassmorphism, sombras teatrales, métricas hero ni motion de landing. La calidad se percibe en alineación, contraste, lenguaje, estados completos, interacción rápida y honestidad estadística.

**Key Characteristics:**
- Contexto temporal y universo siempre visibles.
- Una pregunta principal por visualización.
- Insights enlazados con evidencia y drill-down.
- Navegación, filtros, estados y tablas consistentes.
- Profundidad progresiva sin ocultar datos esenciales en hover.

**The Context First Rule.** Ninguna gráfica aparece sin periodo, universo, unidad y actualización.

**The One Question Rule.** Una visual responde una pregunta; si mezcla unidades o preguntas, se divide.

## Colors

La paleta usa navy Prosavis para estructura, naranja para acción y una escala categórica calmada para calidad.

### Primary
- **Command Navy:** navegación, selección, foco estructural y acciones primarias.

### Secondary
- **Action Orange:** atención y acciones operativas puntuales; nunca relleno decorativo.

### Neutral
- **Operational Canvas:** fondo con contraste tonal suficiente para separar regiones sin convertir todo en cards.
- **Evidence Surface:** superficie de gráficas, tablas y rails.
- **Operational Ink:** texto principal de alta legibilidad.
- **Measured Muted:** texto secundario; no se usa para información necesaria.
- **Hairline Structure:** divisores y ejes.

### Named Rules

**The Red Means Risk Rule.** El rojo se reserva para riesgo, error o pérdida; no representa series neutrales.

**The No Color-Only Rule.** Toda categoría combina color con texto, valor, icono o patrón reconocible.

## Typography

**Display Font:** Inter (con `system-ui`)
**Body Font:** Inter (con `system-ui`)
**Label/Mono Font:** Inter con números tabulares; monospace solo para IDs técnicos.

**Character:** Una sola familia evita que el dashboard se fragmente. La personalidad aparece mediante peso, ritmo, cifras tabulares y una escala compacta, no con tipografía ornamental.

### Hierarchy
- **Headline** (700, 20px, 1.3): título de vista y principal punto de orientación.
- **Title** (650, 16px, 1.4): pregunta de una visual o región.
- **Body** (400, 14px, 1.55): explicaciones y datos secundarios.
- **Label** (600, 12px, 1.4): unidades, denominadores y metadatos; nunca menor de 12px.

### Named Rules

**The Numbers Align Rule.** KPIs, ejes y columnas numéricas usan `font-variant-numeric: tabular-nums`.

**The Technical Code Steps Back Rule.** `COMPLETED`, IDs y nombres internos aparecen después del significado operativo.

## Elevation

La profundidad es tonal y estructural. Las superficies permanecen planas en reposo; una sombra corta puede indicar un popover, tooltip o panel temporal, nunca decorar cada card.

### Shadow Vocabulary
- **Floating Utility** (`0 6px 16px rgba(0,36,70,0.12)`): menús, tooltips y paneles temporales.
- **Focus Halo** (`0 0 0 3px rgba(255,119,0,0.28)`): foco visible sobre controles.

### Named Rules

**The Flat-by-Default Rule.** Si una superficie no flota funcionalmente sobre otra, no recibe sombra.

## Components

### Buttons
- **Shape:** curva funcional (8px).
- **Primary:** navy con texto blanco y altura mínima de 36px.
- **Hover / Focus:** cambio tonal y halo naranja; transición de estado de 150–200ms.
- **Secondary / Ghost:** superficie neutra o texto; nunca compite con la acción primaria.

### Chips
- **Style:** filtro compacto con etiqueta explícita y borde tonal.
- **State:** seleccionado con navy y contraste AA; categorías conservan muestra de color más texto.

### Cards / Containers
- **Corner Style:** radio moderado (12px).
- **Background:** superficie sobre canvas tonal.
- **Shadow Strategy:** plana por defecto.
- **Border:** divisor sutil o contraste de superficie, no ambos con una sombra amplia.
- **Internal Padding:** 16–24px según densidad.

### Inputs / Fields
- **Style:** fondo de superficie, radio de 8px y borde estructural.
- **Focus:** borde navy más halo naranja.
- **Error / Disabled:** texto explicativo y estado semántico; nunca color solo.

### Navigation
- Tabs agrupados por operación, clientes y mensajería. El estado activo combina contraste, peso y un indicador; en móvil conserva scroll y nombre accesible.

### Analytics Panel
- Encabezado con pregunta, unidad, periodo y acción secundaria.
- Insight breve antes de la visual.
- Etiquetas directas para valores necesarios.
- Resumen textual o tabla equivalente para accesibilidad.

### Map Workbench
- Mapa y rail analítico 70/30 en escritorio, panel inferior en tablet y alternancia mapa/lista en móvil.
- Densidad y puntos por capa son modos mutuamente excluyentes.

## Do's and Don'ts

### Do:
- **Do** mostrar periodo, universo, unidad, denominador y última actualización.
- **Do** usar navy para estructura, naranja para acción y rojo solo para riesgo.
- **Do** enlazar cada insight con una visual y cada visual con filas auditables.
- **Do** ofrecer estados loading, error, vacío y populated sin saltos de layout.
- **Do** mantener transiciones funcionales entre 150 y 200ms y respetar movimiento reducido.

### Don't:
- **Don't** exponer nombres de tablas, códigos de estados o instrumentación antes que el significado operativo.
- **Don't** construir dashboards con cards idénticas, donuts pequeños, KPIs gigantes o gráficas sin una pregunta clara.
- **Don't** usar glassmorphism, gradientes decorativos, sombras grandes, tipografía ornamental o animaciones de landing.
- **Don't** esconder denominadores en hover, mezclar unidades en un eje o usar color como único significado.
- **Don't** mostrar `N=0` cuando la consulta falló.
