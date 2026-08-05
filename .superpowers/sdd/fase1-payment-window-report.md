# Fase 1B — Payment grounding and Meta session window

## Estado

Implementada y verificada localmente. No se ejecutó deploy ni se modificó el esquema de base de datos.

## Archivos

### Backend y contrato compartido

- `supabase/functions/_shared/metaSessionWindow.ts`
- `supabase/functions/_shared/conversationHistory.ts`
- `supabase/functions/_shared/inboxAiContext.ts`
- `supabase/functions/_shared/inboxAiContextFormat.ts`
- `supabase/functions/get-whatsapp-booking-context/index.ts`
- `supabase/functions/suggest-whatsapp-agent-reply/index.ts`

### Frontend

- `src/services/whatsappService.ts`
- `src/utils/whatsappTemplateSuggestions.ts`
- `src/components/whatsapp/BookingAssistantDrawer.tsx`
- `src/components/whatsapp/ChatArea.tsx`
- `src/components/whatsapp/TemplatesSidePanel.tsx`

### Tests

- `src/utils/inboxAiContextFormat.test.ts`
- `src/utils/metaSessionWindow.test.ts`
- `src/utils/conversationHistory.test.ts`
- `src/services/whatsappService.types.test.ts`

## Implementación

- Se mapearon y formatearon `paymentStatus`, `totalAmount`, `paymentMethod` y `wompiReference` desde citas Firestore.
- `crm_directory` ahora consulta y formatea `payment_status`.
- `groundBookingPayment()` sustituye estado/monto inferidos usando exclusivamente la cita futura relevante más cercana. Si esa cita no tiene pago autoritativo, limpia estado y monto inventados.
- La inferencia se aterriza antes de resolver pricing/checkout, evitando que una afirmación inventada de pago aprobado suprima o genere checkout incorrectamente.
- Se añadió el contrato compartido `MetaSessionWindow` con `open | closed | unknown`, `lastInboundAt`, `expiresAt` y `requiresTemplate`.
- El límite exacto de 24 horas es cerrado (`now >= expiresAt`).
- Solo mensajes inbound con timestamp válido establecen la ventana; se usa el más nuevo.
- `completeMerged` conserva la conversación antes del presupuesto de caracteres, y la ventana se deriva antes de truncar el transcript.
- `InboxAiContext`, ambos Edge responses y los tipos frontend exponen `sessionWindow`.
- Los consumidores frontend usan el helper compartido y degradan a `unknown/requiresTemplate` si una respuesta antigua no trae el contrato.
- El contexto incluye el encabezado exacto `=== Canal / ventana WhatsApp ===`.
- La instrucción del sistema conserva la política de llegada anticipada y exige catálogo oficial, pago autoritativo, disponibilidad real y plantilla cuando la ventana está cerrada.

## Evidencia RED / GREEN

1. Baseline: `npm test -- --run src/utils/inboxAiContextFormat.test.ts`
   - GREEN inicial: 7/7.
2. Grounding/formato de pago:
   - RED: 3 fallos (`groundBookingPayment` inexistente y pago no formateado).
   - GREEN: 9/9.
3. Mapping de pago:
   - RED: 1 fallo (`mapInboxAiAppointmentPayment` inexistente).
   - GREEN: 10/10.
4. Ventana Meta compartida:
   - RED: módulo `metaSessionWindow` inexistente.
   - GREEN: 3/3.
5. Conversación completa antes de truncado:
   - RED: `completeMerged` inexistente.
   - GREEN: 9/9.
6. Contexto y salvaguardas:
   - RED: 3 fallos (payment directory, sección de ventana e instrucción).
   - GREEN: 11/11.
7. Consumidor frontend en el borde de 24 h:
   - RED: devolvía `true` exactamente a las 24 h.
   - GREEN: 4/4.
8. Cita relevante más cercana:
   - RED: tomaba pago de una cita posterior.
   - GREEN: 12/12.
9. Timestamp válido dentro de mensajes inbound fusionados:
   - RED: un timestamp inválido posterior reemplazaba el último válido.
   - GREEN: 10/10 en `conversationHistory.test.ts`.

## Comandos y resultados

- Focused:
  - `npm test -- --run src/utils/inboxAiContextFormat.test.ts src/utils/metaSessionWindow.test.ts src/utils/conversationHistory.test.ts src/services/whatsappService.types.test.ts`
  - 4 archivos, 26 tests, todos aprobados.
- Suite completa:
  - `npm test`
  - 15 archivos, 113 tests, todos aprobados.
- Tipos:
  - `npm run type-check`
  - Exit 0.
- Diagnósticos IDE sobre archivos editados:
  - Sin errores.
- Whitespace:
  - `git diff --check`
  - Exit 0; solo avisos de conversión LF/CRLF.
- Lint completo:
  - `npm run lint`
  - Exit 1: 12 errores y 6 warnings preexistentes en el repositorio. Incluye reglas `no-useless-assignment` ya presentes en `inboxAiContext.ts` e `inboxAiContextFormat.ts`, además de errores ajenos en appointment resolver, client segments, reminders y webhook.
- Graphify post-cambio:
  - `graphify update .`
  - No pudo ejecutarse: el launcher local falla con `ModuleNotFoundError: No module named 'graphify'`.

## Auto-revisión

- Requisitos 1–3: cubiertos por mapping, formato y grounding puro con pruebas de sobrescritura/limpieza.
- Requisitos 4–6: cubiertos por módulo Deno/frontend compartido, borde determinista y selección inbound previa al truncado.
- Requisitos 7–8: cubiertos en contexto, respuestas Edge, prompt e instrucción.
- Requisitos 9–10: política de seguridad/precios preservada; tipos y consumidores frontend actualizados.
- Requisito 11: cubierto por RED/GREEN y prueba de contrato frontend.
- Requisito 12: focused, suite completa y type-check aprobados; no deploy.
- Sin imports inline, migraciones, ramas, worktrees, stash, reset ni checkout.

## Preocupaciones

- El lint global continúa rojo por deuda previa; no se amplió el alcance para corregir archivos no relacionados.
- El índice Graphify quedó sin refrescar por instalación local rota.
- Durante la ejecución, `HEAD` avanzó externamente a `8f09c6c` (`Ground booking payments and Meta session window`). Este agente no creó commits; se conservaron los cambios concurrentes y el WIP visible.

## Correcciones posteriores a Spec FAIL / Quality CHANGES_REQUIRED

### Implementación

- Los snapshots de `sessionWindow` ya no se consumen como estado congelado:
  - `resolveMetaSessionWindow()` recalcula el estado con el reloj actual.
  - Prefiere el inbound local más reciente frente al snapshot del Edge.
  - `useMetaSessionWindow()` programa un único `setTimeout` para `expiresAt`, sin polling.
  - El efecto cancela el timeout al cambiar dependencias o desmontar el consumidor.
  - `BookingAssistantDrawer`, `TemplatesSidePanel` y la selección de plantillas usan el contrato reevaluado.
- `groundBookingPayment()` ahora:
  - usa `collectedData.date`, `time` y `address` como objetivo de la reserva;
  - compara fecha/hora en `America/Bogota` y dirección normalizada;
  - no toma una cita distinta cuando existe un objetivo explícito sin coincidencia autoritativa;
  - conserva el fallback a la cita próxima solamente cuando no existe objetivo explícito;
  - acepta `totalAmount` como autoritativo únicamente si es finito y mayor que cero.

### RED / GREEN de la corrección

1. Snapshot temporal e inbound posterior:
   - RED: 2 fallos; `resolveMetaSessionWindow` no existía.
   - GREEN: 6/6 en el primer ciclo.
2. Asociación con reserva conversada:
   - RED: el caso objetivo devolvía `APPROVED` de la cita más cercana en vez de `PENDING` de la cita conversada.
   - GREEN: 13/13 en el primer ciclo.
3. Timer único y cleanup:
   - RED: 2 fallos; `scheduleMetaSessionExpiry` no existía.
   - GREEN: 8/8.
4. Casos adicionales:
   - objetivo explícito sin cita coincidente limpia pago inventado;
   - una cita distinta no presta su pago;
   - montos `0` y negativos nunca se exponen como `paymentAmount`;
   - GREEN: 15/15 en `inboxAiContextFormat.test.ts`.

### Verificación posterior

- Focused:
  - `npm test -- --run src/utils/metaSessionWindow.test.ts src/utils/inboxAiContextFormat.test.ts src/services/whatsappService.types.test.ts src/utils/conversationHistory.test.ts`
  - 4 archivos, 35 tests, todos aprobados.
- Suite completa:
  - `npm test`
  - 15 archivos, 120 tests, todos aprobados.
- Tipos:
  - `npm run type-check`
  - Exit 0.
- Diagnósticos IDE:
  - Sin errores en los archivos de la corrección.
- Lint enfocado:
  - Los archivos nuevos y consumidores no presentan hallazgos.
  - Permanecen 2 errores `no-useless-assignment` preexistentes en `inboxAiContextFormat.ts`.
- Graphify:
  - El reintento de `graphify update .` volvió a fallar con `ModuleNotFoundError: No module named 'graphify'`.
- Concurrencia:
  - Durante esta corrección `HEAD` avanzó externamente a `4384112` (`Use MetaSessionWindow for session logic`) y se actualizó `origin/master`.
  - Después avanzó externamente a `02e0fc4`; `origin/master` quedó en `2dd1383`, ambos relacionados con el WIP de autenticación concurrente.
  - Este agente no ejecutó commits, push, deploy, stash, reset ni checkout.
  - El WIP concurrente de `directoryMonitorAuth`, `adminAuth` y `strictCors` se preservó sin editar.
