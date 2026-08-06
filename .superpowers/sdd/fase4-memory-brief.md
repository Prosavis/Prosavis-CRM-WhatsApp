# Fase 4 — Memoria incremental del Inbox IA

Repositorio: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp` (`master`).

## Objetivo

Persistir una memoria compacta por `stable_key` para que las sugerencias conserven acuerdos, preferencias y objeciones aunque el historial reciente se recorte. La memoria se refresca de forma perezosa y nunca debe bloquear el inbox si Supabase o Gemini fallan.

## Migración

1. Crear la migración con `supabase migration new whatsapp_conversation_ai_memory`; no inventar el timestamp.
2. Crear `public.whatsapp_conversation_ai_memory` con:
   - `stable_key text primary key`
   - `summary text not null default ''`
   - `preferences jsonb not null default '[]'::jsonb`
   - `objections jsonb not null default '[]'::jsonb`
   - `agreements jsonb not null default '[]'::jsonb`
   - `last_summarized_message_at timestamptz`
   - `message_count integer not null default 0 check (message_count >= 0)`
   - `model text`
   - `updated_at timestamptz not null default now()`
3. Habilitar RLS. La tabla es interna: revocar acceso de `PUBLIC`, `anon` y `authenticated`; conceder `SELECT, INSERT, UPDATE, DELETE` solo a `service_role`. No crear policies permisivas ni `SECURITY DEFINER`.
4. La migración debe ser idempotente donde corresponda y coherente con Postgres 17 / Supabase actual.

## Módulo de memoria

1. Crear `_shared/inboxAiMemory.ts`, sin imports inline, con tipos:
   - `InboxAiMemory { stableKey, summary, preferences, objections, agreements, lastSummarizedMessageAt, messageCount, model, updatedAt }`
   - preferencias/objeciones/acuerdos normalizados como `string[]`, sin vacíos, duplicados ni valores no-string.
2. Umbral exacto: `INBOX_AI_MEMORY_REFRESH_MESSAGE_THRESHOLD = 20`.
3. Cargar la fila por `stable_key` con el cliente service-role recibido por `buildInboxAiContext`.
4. Calcular mensajes visibles nuevos en `whatsapp_message_log` desde `last_summarized_message_at` (`hidden_from_panel = false`) usando conteo exacto. En ausencia de memoria, usar el conteo total visible.
5. Refrescar cuando:
   - no existe memoria y hay al menos 20 mensajes visibles; o
   - existen al menos 20 mensajes posteriores al marcador; o
   - `historyMeta.truncated === true`.
   No refrescar si no se cumple ninguna condición.
6. El refresco usa una sola llamada `geminiGenerateJson` con:
   - modelo `GEMINI_MODEL_INBOX_MEMORY` o fallback `DEFAULT_GEMINI_MODEL`;
   - `responseSchema` objeto estricto con `summary: string` y arrays de strings `preferences`, `objections`, `agreements`, todos requeridos;
   - memoria anterior + transcript cronológico disponible como entrada;
   - instrucción explícita de conservar solo hechos observables, acuerdos/preferencias/objeciones vigentes y no inventar.
7. Normalizar la salida antes de persistir. Hacer upsert por `stable_key`, actualizar `last_summarized_message_at` con `historyMeta.newestAt`, `message_count` con el conteo total visible, `model` y `updated_at`.
8. Fail-open:
   - error de lectura/conteo/Gemini/upsert produce warning JSON estructurado con `scope: inbox-ai-memory`;
   - nunca incluir secretos, transcript ni PII completa en logs;
   - conservar/devolver memoria anterior si el refresco falla;
   - devolver `null` si tampoco existía memoria.

## Integración y formato

1. Invocar la carga/refresco dentro de `buildInboxAiContext`, después de construir transcript/meta y antes de formatear el bloque.
2. Añadir `memory: InboxAiMemory | null` a `InboxAiContext`, su retorno y al input del formateador.
3. Añadir la sección exacta `=== Memoria del cliente ===` al inicio del bloque, después de canal/momento y antes de perfil/directorio.
4. La sección muestra resumen, preferencias, objeciones, acuerdos, marcador y modelo; si no existe memoria indica `Sin memoria persistida todavía.`.
5. Presupuesto exacto para memoria: 3.000 caracteres. Reducir el presupuesto de `=== Historial WhatsApp ===` de 60.500 a 57.500 para conservar la suma previa de presupuestos (77.000) y el techo total `INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET = 78_000`. Mantener el final más reciente del transcript.

## TDD y verificación

1. Pruebas RED→GREEN para:
   - normalización de JSON de Gemini;
   - decisión de refresco (umbral 20, marcador y truncado);
   - no refrescar por debajo del umbral;
   - fail-open conservando memoria anterior;
   - upsert con marcador/conteo/modelo correctos;
   - sección de memoria y techo total 78.000.
2. Usar seams públicos y mocks solo en límites externos (Supabase/Gemini), no probar que un mock devuelve lo configurado.
3. Ejecutar tests enfocados, suite Vitest completa, `npm run type-check` y lint enfocado.
4. Intentar validación local de migración solo si el runtime local está disponible; no aplicar migración remota, no desplegar Edge Functions y no mutar secretos todavía.
5. Ejecutar `graphify update .`.
6. Crear un commit local aislado con solo archivos Fase 4. No hacer push.
7. Escribir evidencia completa en `.superpowers/sdd/fase4-memory-report.md`: archivos, RED/GREEN, comandos/resultados, limitaciones y auto-revisión.

## Restricciones globales

- Mantener `gemini-3.6-flash`; no cambiar proveedor.
- Preservar todo WIP V5 y actividad concurrente; no reset/stash/checkout ni reescritura de historia.
- No imports inline.
- No deploy hasta que todas las fases estén revisadas.
