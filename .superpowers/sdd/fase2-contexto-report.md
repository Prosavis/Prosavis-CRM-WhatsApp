# Fase 2 — Reporte de implementación

## Estado

Implementación completada localmente en `master`, sin push ni deploy.

## Alcance implementado

- `loadConversationTags` fue reemplazado por un contexto operacional tipado que carga tags activos, notas administrativas, responsable, última intención y estado de automatización inbound.
- El directorio ahora carga y formatea `source`, `service_id`, `classification`, `payment_status` y `opt_out`.
- Las respuestas oficiales se consultan únicamente desde Edge Functions:
  - snippets activos y fijados, ordenados por `sort_order` y `shortcut`;
  - FAQs activas con pregunta, respuesta, categoría y palabras clave;
  - filtros, límites explícitos y clipping por entrada;
  - degradación independiente a listas vacías con warnings JSON estructurados.
- Se añadieron las secciones exactas:
  - `=== Contexto operativo de conversación ===`
  - `=== Clasificación CRM ===`
  - `=== Respuestas oficiales de la casa ===`
- Se exportan `SECTION_CHAR_BUDGETS` y `INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET`.
- El transcript conserva su presupuesto de 60.000 caracteres y los mensajes más recientes. Cada sección se recorta de forma independiente, conserva el heading y marca la truncación. El bloque completo tiene techo de 78.000 caracteres.
- La instrucción de sistema prioriza la redacción oficial antes de improvisar.
- No se añadió acceso Supabase desde el frontend ni se expuso `service_role`.

## TDD y verificación

Se verificaron ciclos red/green para:

- mapeo de contexto operacional y tags activos;
- mapeo de clasificación del directorio;
- filtros y límites de snippets/FAQs;
- clipping por entrada;
- degradación ante errores de consulta;
- formato de las tres secciones nuevas;
- presupuesto independiente por sección;
- bloque de hasta 78.000 caracteres con transcript de 60.000;
- conservación del final del transcript;
- preferencia de respuestas oficiales en la instrucción de sistema.

Resultados:

- Pruebas enfocadas: 25/25.
- Suite CRM completa: 134/134 en 17 archivos.
- Type-check: exitoso.
- ESLint enfocado: 0 errores.
- Diagnósticos del IDE en archivos modificados: 0 errores.
- `git diff --check`: exitoso.

## Archivos de tarea

- `supabase/functions/_shared/inboxAiContext.ts`
- `supabase/functions/_shared/inboxAiKnowledge.ts`
- `supabase/functions/_shared/inboxAiContextFormat.ts`
- `src/utils/inboxAiContextLoad.test.ts`
- `src/utils/inboxAiContextFormat.test.ts`
- `.superpowers/sdd/fase2-contexto-report.md`

## Seguridad y concurrencia

- Todas las consultas nuevas permanecen server-side dentro de `supabase/functions/_shared`.
- No hay claves, secretos ni acceso privilegiado añadido al bundle React.
- El WIP V5 concurrente y su lockfile no fueron modificados ni incluidos en el alcance de esta tarea.

## Preocupaciones

- La actualización posterior del grafo no pudo ejecutarse: el comando local `graphify update .` termina con `ModuleNotFoundError: No module named 'graphify'`. La exploración previa sí se realizó con Graphify MCP. Se requiere reparar la instalación local del CLI para regenerar `graphify-out`.
- No se validaron consultas contra Supabase remoto porque la tarea prohíbe deploy y no requiere mutaciones de esquema. Los contratos de consulta se cubrieron con dobles de Supabase en tests.
