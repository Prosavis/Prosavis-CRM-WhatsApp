# Fase 4 — Informe de memoria incremental

Fecha: 2026-08-06
Rama: `master`

## Resultado

Se implementó memoria incremental fail-open para el Inbox IA:

- tabla interna `public.whatsapp_conversation_ai_memory`;
- carga, conteo exacto de mensajes visibles y refresco perezoso cada 20 mensajes o ante historial truncado con progreso;
- una llamada estructurada a Gemini con `GEMINI_MODEL_INBOX_MEMORY` y fallback `gemini-3.6-flash`;
- normalización de resumen, preferencias, objeciones y acuerdos;
- upsert con marcador, conteo total, modelo y fecha de actualización;
- conservación de memoria previa ante fallos de lectura, conteo, Gemini o persistencia;
- sección `=== Memoria del cliente ===` con presupuesto de 3.000 caracteres;
- historial reducido a 57.500 caracteres, conservando su final más reciente y el techo total de 78.000.

No se aplicaron migraciones remotas, no se desplegaron funciones, no se mutaron secretos y no se hizo push.

## Archivos Fase 4

- `supabase/migrations/20260806165834_whatsapp_conversation_ai_memory.sql`
- `supabase/functions/_shared/inboxAiMemory.ts`
- `supabase/functions/_shared/conversationHistory.ts`
- `supabase/functions/_shared/inboxAiContext.ts`
- `supabase/functions/_shared/inboxAiContextFormat.ts`
- `supabase/functions/_shared/geminiClient.ts`
- `src/utils/inboxAiMemory.test.ts`
- `src/utils/conversationHistory.test.ts`
- `src/utils/geminiClient.test.ts`
- `src/utils/inboxAiContextFormat.test.ts`
- `.superpowers/sdd/fase4-memory-report.md`

`geminiClient.ts` ahora lee variables mediante `globalThis.Deno` para que el módulo importado por Vitest/TypeScript sea compatible con Node sin cambiar el comportamiento en Edge. También permite desactivar el preview de respuestas inválidas; memoria lo desactiva para evitar PII en logs.

## Evidencia TDD RED → GREEN

### Normalización

- RED: `npm test -- --run src/utils/inboxAiMemory.test.ts`
  - Falló porque `inboxAiMemory` aún no existía.
- GREEN: mismo comando.
  - `1 passed`.

### Decisión de refresco

- RED: mismo comando.
  - `3 failed`; `shouldRefreshInboxAiMemory is not a function`.
- GREEN: mismo comando.
  - `4 passed`.

### Orquestación, fail-open y upsert

- RED: mismo comando.
  - `4 failed`; `loadOrRefreshInboxAiMemory is not a function`.
- GREEN: mismo comando.
  - `8 passed`.

### Formato y presupuestos

- RED: `npm test -- --run src/utils/inboxAiContextFormat.test.ts`
  - `3 failed`: faltaban sección de memoria y presupuestos 3.000/57.500.
- GREEN: mismo comando.
  - `21 passed`.

### Logs Gemini sin PII

- RED: test enfocado de memoria.
  - `1 failed`: faltaban `logScope: inbox-ai-memory` y supresión de preview.
- GREEN: mismo comando.
  - `8 passed`.

## Correcciones posteriores a revisión

### Deduplicación case-insensitive

- RED: `npm test -- --run src/utils/inboxAiMemory.test.ts`
  - `1 failed`: `Tardes/tardes`, `Precio/PRECIO` y acuerdos con distinto casing permanecían duplicados.
- GREEN: mismo comando.
  - `8 passed`; conserva la primera representación y deduplica por clave lowercase.

### Truncado con progreso y conteos perezosos

- RED: mismo comando.
  - `1 failed`: un segundo request truncado sin mensajes nuevos volvía a llamar Gemini y persistía memoria vacía.
- GREEN: mismo comando.
  - `9 passed`; truncado solo refresca con `newVisibleMessageCount > 0`.
- Con memoria se cuenta primero desde `last_summarized_message_at`; el total solo se consulta si habrá refresco.
- Sin memoria se realiza un único conteo total.
- Se añadieron regresiones de fail-open para fallo de conteo y fallo de upsert.

### Detección real de historial truncado

- RED: `npm test -- --run src/utils/conversationHistory.test.ts`
  - `1 failed`: la consulta pidió `3` en vez de `4` para un límite de `3`.
- GREEN: mismo comando.
  - `11 passed`; consulta `limit + 1`, descarta el elemento sonda y devuelve los mensajes limitados más recientes con `truncated: true`.

### Transporte JSON Schema de Gemini

- RED: `npm test -- --run src/utils/geminiClient.test.ts`
  - `1 failed`: el body HTTP real no contenía `generationConfig.responseJsonSchema`.
- GREEN: `npm test -- --run src/utils/geminiClient.test.ts src/utils/inboxAiMemory.test.ts`
  - `2 files passed`, `10 tests passed`.
- Se validó el `RequestInit.body` producido en el límite externo mediante mock de `fetch`.
- Memoria envía el esquema estricto por `responseJsonSchema`; el body no incluye `responseSchema`.
- Compatibilidad: `responseSchema` sigue disponible y se conserva en el body para callers existentes como `directoryAnalyze`.

El brief inicial pedía un `responseSchema` estricto. La evidencia oficial vigente indica que ese campo usa el tipo OpenAPI `Schema`, está deprecado y no admite `additionalProperties`; `responseJsonSchema` sí acepta JSON Schema y permite `additionalProperties: false`. Por ello la implementación usa `responseJsonSchema` exclusivamente para memoria, manteniendo `responseSchema` como ruta legacy para no romper callers existentes.

### Presupuesto total

- Se añadió aserción literal `INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET === 78_000`.

## Verificación final

- Tests enfocados:
  - `npm test -- --run src/utils/inboxAiMemory.test.ts src/utils/conversationHistory.test.ts src/utils/geminiClient.test.ts src/utils/inboxAiContextFormat.test.ts`
  - `4 files passed`, `46 tests passed`.
- Suite completa:
  - `npm test`
  - `21 files passed`, `171 tests passed`.
- Tipos:
  - `npm run type-check`
  - exit code `0`.
- Lint enfocado:
  - `npx eslint supabase/functions/_shared/inboxAiMemory.ts supabase/functions/_shared/conversationHistory.ts supabase/functions/_shared/geminiClient.ts src/utils/inboxAiMemory.test.ts src/utils/conversationHistory.test.ts src/utils/geminiClient.test.ts src/utils/inboxAiContextFormat.test.ts`
  - exit code `0`.
- Diagnósticos IDE de los archivos editados:
  - sin errores.
- Diff:
  - `git diff --check`
  - exit code `0`; solo avisos de conversión LF/CRLF en Windows.
- Grafo:
  - `graphify update .` desde la raíz `GitHub/`
  - exit code `0`; grafo actualizado a `59.091` nodos y `169.360` edges.

## Migración y seguridad

- Se consultó primero `supabase migration new --help`.
- CLI oficial usada mediante `npx --yes supabase@latest` versión `2.111.0`.
- La migración fue creada por:
  - `supabase migration new whatsapp_conversation_ai_memory`
  - timestamp generado: `20260806165834`.
- La tabla habilita RLS, no crea policies ni funciones `SECURITY DEFINER`, revoca `PUBLIC`, `anon` y `authenticated`, y concede CRUD solo a `service_role`.
- Se revisó el changelog vigente, incluida la no exposición automática de tablas nuevas a Data API.

## Limitaciones y preocupaciones

- No fue posible ejecutar la migración contra Postgres local: `supabase status` informó que Docker/Podman no está instalado o no está disponible en `PATH`.
- `supabase/config.toml` conserva `major_version = 15`, mientras el proyecto remoto informado usa Postgres 17.6.1. La migración usa SQL compatible con ambas versiones, pero esta diferencia preexistente no se modificó.
- Graphify informó que `tree_sitter_sql` no está instalado; actualizó el AST TypeScript, pero los archivos SQL no aportaron nodos al grafo.
- La validación fue únicamente local y estática; no hubo ninguna mutación del proyecto remoto.

## Auto-revisión

- No hay imports inline.
- Los warnings de memoria son JSON estructurado con `scope: inbox-ai-memory` y no incluyen `stable_key`, transcript, secretos ni previews de respuesta.
- Los conteos filtran `hidden_from_panel = false`; con memoria usan `created_at > last_summarized_message_at` y siempre conservan el conteo total visible para el upsert.
- La salida de Gemini se normaliza antes de persistir.
- Ante cualquier fallo, se devuelve la memoria anterior o `null` si no existía.
- El WIP concurrente en `.superpowers/sdd/fase3-availability-report.md`, `.superpowers/sdd/progress.md` y el brief Fase 4 quedó intacto y fuera del staging previsto.
