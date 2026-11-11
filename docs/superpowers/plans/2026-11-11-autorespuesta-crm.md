# Autorespuesta del CRM Implementation Plan

> **Estado 11/11/2026:** el código de F0 a F3 está en `master` sin commit. No hay deploy, no se aplicaron migraciones y el secreto del puente no se tocó. `INBOX_AI_SUGGEST_PIPELINE` sigue en `legacy`. Streaming y prefetch salen apagados.

**Goal:** Bajar la latencia de la sugerencia del inbox sin que el mensaje salga solo, midiendo antes y dejando rollback por variables de entorno.

**Architecture:** La Edge `suggest-whatsapp-agent-reply` arma el contexto en paralelo, pide disponibilidad de 240/360/480 a la vez que el modelo, y con `INBOX_AI_SUGGEST_PIPELINE=single` fusiona booking y sugerencia en una llamada `gemini-3.8-flash` con thinking `low`. Memoria e imágenes salen del camino crítico. El front queda en un solo ✨.

**Tech Stack:** Supabase Edge (Deno), Gemini `generateContent`, React + MUI, Vitest.

## Global Constraints

- Rama `master`. No abrir `feature/`.
- No desplegar Edges, no aplicar migraciones y no cambiar `FIREBASE_CRM_BRIDGE_SECRET` sin OK de Nicolás en ese momento.
- No tocar `send-whatsapp-chat-message`, `send_template`, `whatsappOutbound.ts` ni las líneas 312/311.
- `get-whatsapp-booking-context` y `get-inbox-ai-context` siguen usando `buildInboxAiContext`. Grok recibe `includeProviderNames: true`.
- Sin valor, `INBOX_AI_SUGGEST_PIPELINE` es `legacy`.
- Tests: `npx vitest run` de los archivos tocados, desde `Prosavis-CRM-WhatsApp`.
- El kit se llama «Kit de limpieza Prosavis». El monto sigue en `PROFESSIONAL_KIT_SURCHARGE_COP`.
- No guardar chats reales en el repo.

---

### Task 1: Spec y contratos

**Files:**
- Create: `docs/superpowers/specs/2026-11-11-autorespuesta-crm-design.md`
- Create: `docs/superpowers/plans/2026-11-11-autorespuesta-crm.md`

**Interfaces:**
- Produces: las variables de la sección Rollback de la spec y los flags de este plan.

- [ ] Escribir la spec y este plan antes de cambiar comportamiento.

### Task 2: Tiempos y tokens (F0)

**Files:**
- Create: `supabase/functions/_shared/suggestTiming.ts`
- Modify: `supabase/functions/_shared/geminiClient.ts`
- Modify: `supabase/functions/_shared/inboxAiSuggestionLog.ts`
- Modify: `supabase/functions/_shared/inboxAiSuggestionResponse.ts`
- Test: `src/utils/suggestTiming.test.ts`, `src/utils/geminiClient.test.ts`

**Interfaces:**
- Produces: `createStageTimer()`, `percentileNearestRank(values, p)`
- Produces: `GeminiJsonResult<T>` con `usage`, `model`, `elapsedMs`, `thinkingLevel`
- Produces: `readGeminiUsageMetadata(source)`
- Consumes: columna `whatsapp_ai_suggestion_log.context_meta` (ya existe)

- [ ] Log `scope: 'suggest-timing'` con etapas `auth`, `images`, `history`, `sibling`, `conversation`, `directory`, `memory_read`, `memory_refresh`, `official_answers`, `appointments`, `format`, `gemini_booking`, `availability`, `gemini_suggestion`, `log_insert`, `total`.
- [ ] En cada llamada JSON, loguear `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`.
- [ ] Guardar timing y usage dentro de `context_meta` sin migración.

### Task 3: Thinking, lecturas en paralelo, disponibilidad, memoria e imágenes (F1)

**Files:**
- Modify: `supabase/functions/_shared/availability.ts`
- Modify: `supabase/functions/_shared/inboxAiContext.ts`
- Modify: `supabase/functions/_shared/inboxAiMemory.ts`
- Modify: `supabase/functions/_shared/inboxAiActions.ts`
- Modify: `supabase/functions/_shared/whatsappMediaHydrate.ts`
- Modify: `supabase/functions/suggest-whatsapp-agent-reply/index.ts`
- Test: `src/utils/availability.test.ts`, `src/utils/inboxAiMemory.test.ts`

**Interfaces:**
- Produces: `resolveGeminiThinkingLevel(envKey, fallback)`
- Produces: `loadRealAvailabilityDetailed()` → `{ slots, outcome }` con `outcome` en `ok | 401 | timeout | error | unconfigured`
- Produces: `loadPrefetchedAvailability([240, 360, 480])`
- Produces: `loadOrRefreshInboxAiMemory({ refreshMode: 'inline' | 'background' })`
- `GEMINI_MODEL_BOOKING` cae a `GEMINI_MODEL_JSON` y luego a `gemini-3.8-flash`
- `GEMINI_THINKING_BOOKING` y `GEMINI_THINKING_SUGGEST` caen a `low`

- [ ] Booking y sugerencia envían `thinkingLevel`.
- [ ] Historial, hermana, conversación, directorio y respuestas oficiales van en `Promise.all`. Las citas también, después del directorio.
- [ ] La sugerencia no analiza imágenes en línea. Al persistir una imagen o un PDF, `scheduleBackgroundWork(analyzeInboundImageById)`.
- [ ] Si la memoria debe refrescarse, la petición usa la fila guardada y el refresco va en segundo plano.
- [ ] No imprimir ni cambiar el secreto del puente. El log de disponibilidad distingue 401 de timeout.

### Task 4: Reglas del prompt (F1)

**Files:**
- Modify: `supabase/functions/_shared/inboxAiContextFormat.ts`
- Modify: `supabase/functions/_shared/pricingCatalog.ts`
- Modify: `supabase/functions/_shared/wompiLinks.ts`
- Modify: `src/constants/cleaningWompiLinks.ts`
- Modify: `supabase/functions/get-inbox-ai-context/index.ts`
- Test: `src/utils/inboxAiContextFormat.test.ts`, `src/utils/pricingCatalog.test.ts`

**Interfaces:**
- `formatInboxAiContextBlock({ includeProviderNames?: boolean; promptLayout?: 'legacy' | 'compact' })`
- `buildInboxAiContext` reenvía esas opciones. Default: sin nombre de auxiliar, layout `legacy`.
- `get-inbox-ai-context` pasa `includeProviderNames: true`.

- [ ] La sugerencia no incluye `auxiliar:` en las citas.
- [ ] El system prohíbe nombrar a la auxiliar y prometer la misma, y nombra el kit «Kit de limpieza Prosavis».
- [ ] El monto del kit no cambia.

### Task 5: Una llamada, historial corto y cajón A (F2)

**Files:**
- Create: `supabase/functions/_shared/inboxAiSuggestConfig.ts`
- Create: `supabase/functions/_shared/inboxAiSuggestPipeline.ts`
- Create: `supabase/functions/_shared/internalNotesSummary.ts`
- Create: `supabase/migrations/20261111133000_crm_directory_notes_summary.sql` (no aplicar)
- Modify: `supabase/functions/_shared/inboxAiKnowledge.ts`
- Modify: `supabase/functions/_shared/inboxAiActions.ts`
- Modify: `supabase/functions/get-whatsapp-booking-context/index.ts`
- Test: `src/utils/internalNotesSummary.test.ts`, `src/utils/inboxAiActions.test.ts`

**Interfaces:**
- `resolveSuggestPipeline(): 'legacy' | 'single'`
- `INBOX_AI_COMBINED_JSON_SCHEMA` con `booking`, `suggestion`, `proposedActions`
- `appendAuthoritativePaymentLink(suggestion, url)`
- `buildInternalNotesSummary(notes)` → bloque `[Vigente]` más las últimas 3 entradas `###` del diario
- `SUGGEST_HISTORY_TURN_LIMIT = 40`, `SUGGEST_TRANSCRIPT_CHAR_BUDGET = 12000` solo en `single`
- `loadReusableBookingContext(supabase, stableKey, anchorNewestAt)`

- [ ] `single` hace una llamada, luego precio, Wompi, slots y saludo en código. El link se agrega al texto si el modelo no lo puso.
- [ ] `legacy` mantiene dos llamadas.
- [ ] El asistente de booking reutiliza `context_meta.bookingReuse` si el ancla del último mensaje coincide.
- [ ] La migración añade `internal_notes_summary` e `internal_notes_summary_at` y un trigger. El select de esas columnas solo con `CRM_DIRECTORY_NOTES_SUMMARY=1`. Sin la columna, el prompt usa el resumen calculado de `internal_notes`, o el recorte de 400 caracteres si la hoja no tiene estructura.

### Task 6: UI, streaming y prefetch (F3)

**Files:**
- Create: `src/components/whatsapp/SuggestionSparkleControl.tsx`
- Create: `src/components/whatsapp/SuggestionSparkleControl.test.tsx`
- Create: `supabase/functions/_shared/suggestionPrefetch.ts`
- Create: `supabase/functions/_shared/inboxAiStream.ts`
- Create: `supabase/migrations/20261111133100_whatsapp_ai_suggestion_prefetch.sql` (no aplicar)
- Modify: `src/components/whatsapp/MessageInput.tsx`
- Modify: `src/components/whatsapp/ChatArea.tsx`
- Modify: `src/services/whatsappService.ts`
- Modify: `supabase/functions/on-whatsapp-webhook/index.ts`
- Test: `src/utils/inboxAiStream.test.ts`, `src/utils/suggestionRubric.test.ts`

**Interfaces:**
- `onRequestSuggestion?: (options?: { extraContext?: string }) => void`
- `extractPartialJsonString(buffer, field)` para el texto de `suggestion`
- `INBOX_AI_SUGGEST_STREAM=1` responde `text/event-stream` (`delta` y `done`). El front solo lo pide si `VITE_INBOX_AI_SUGGEST_STREAM=true`.
- `INBOX_AI_SUGGEST_PREFETCH=1` escribe en `whatsapp_ai_suggestion_prefetch` al llegar un inbound de una conversación asignada. El ✨ lee esa fila si el ancla coincide.

- [ ] Quitar el menú Automático / Con contexto y el diálogo.
- [ ] El toggle de imágenes dice «Usar análisis de imágenes y PDF ya guardados».
- [ ] Streaming y prefetch quedan apagados hasta el OK.

### Task 7: Rúbrica y línea base

**Files:**
- Create: `supabase/functions/_shared/suggestionRubric.ts`
- Create: `scripts/suggest-timing-percentiles.mjs`
- Test: `src/utils/suggestionRubric.test.ts`

**Interfaces:**
- `scoreSuggestionRules({ suggestion, forbiddenNames, catalogAmounts, allowedSlots })` → violaciones deterministas (kit, auxiliar, misma auxiliar, precio, horario).
- `percentileNearestRank` para p50 y p95.

- [ ] No descargar chats reales al repo.
- [ ] La línea base de `edit_ratio` se lee en agregado, sin texto de sugerencias.
- [ ] El experimento Gemini medium/low y Flash-Lite queda como script local. No se llama a Gemini desde el repo ni se despliega para medirlo.

### Task 8: Verificación

- [ ] `npx vitest run` de los tests listados.
- [ ] No hay deploy en esta tarea.
