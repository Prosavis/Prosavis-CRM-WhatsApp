# Fase 5A — Reporte del contrato `proposedActions`

Fecha: 2026-08-06
Estado: `DONE_WITH_CONCERNS`

## Implementación

- Se creó `_shared/inboxAiActions.ts` con la unión discriminada pública, `InboxAiProposedActionType`, `InboxAiProposedAction`, `InboxAiSuggestionOutput` y un JSON Schema estricto.
- La generación final usa una sola llamada `geminiGenerateJson` con `responseJsonSchema`, `additionalProperties: false`, máximo de cinco acciones y prompt de no ejecución/confirmación/grounding.
- Los discriminadores del schema usan `type: string` + `enum: [valor]`; no se emite `const` ni otra keyword fuera del subset verificado para Gemini.
- `geminiGenerateJson` y `geminiGenerateJsonWithMeta` aceptan `systemInstruction` opcional y lo envían por el canal HTTP dedicado. `INBOX_AI_SYSTEM_INSTRUCTION` vuelve a esa jerarquía y el historial/contexto queda exclusivamente en el prompt de usuario.
- La normalización genera IDs en código, fuerza `requiresConfirmation: true`, limita, limpia, recorta y deduplica acciones.
- Citas, reagendamientos y pagos se reconstruyen o validan contra slots, citas, booking y Wompi grounded. Tags nunca conservan IDs del modelo.
- El camino de último mensaje outbound responde `proposedActions: []`.
- `SuggestReplyResult` y `suggestWhatsAppAgentReply` exponen `proposedActions`; no se añadió ejecución en servicio ni UI.

## TDD vertical RED → GREEN

- Contrato inicial: RED por módulo inexistente; GREEN con normalización, límite, IDs y confirmación.
- Pago grounded: RED por acción ausente; GREEN usando exclusivamente URL, monto y referencia calculados en código.
- Citas/reagenda: RED por variantes ausentes; GREEN al validar slot y cita reales y sobrescribir duración/dirección/kit.
- Tags/plantillas/deduplicación: RED por duplicado y plantilla ausente; GREEN con payloads normalizados.
- Recorte de copy: RED por longitudes 200/800; GREEN con límites 120/500.
- Entradas malformadas: RED porque detenían el procesamiento; GREEN descartándolas y preservando acciones válidas posteriores.
- Transporte JSON: RED por helper inexistente; GREEN verificando el request HTTP real con `generationConfig.responseJsonSchema`.
- Frontend: RED de TypeScript por miembros inexistentes; GREEN con tipos y retorno expuestos.
- Gate schema: RED por `const` fuera del subset; GREEN con discriminadores `enum` y recorrido recursivo de keywords soportadas.
- Gate de jerarquía: RED porque `systemInstruction` no llegaba al body; GREEN verificando canales HTTP separados para sistema y usuario.

## Verificaciones

- Tests enfocados del fix: `11/11` pasan en `2` archivos.
- Vitest completo: `181/181` pasan en `22` archivos.
- `npm run type-check`: pasa.
- ESLint enfocado a archivos Fase 5A: pasa sin hallazgos.
- Diagnósticos IDE de archivos modificados: sin errores.
- `git diff --check`: pasa.
- `graphify update .`: pasa; grafo actualizado a `59.128` nodos, `169.438` edges y `1.426` comunidades.

## Preocupaciones

- `npm run lint` global sigue fallando por `7` errores y `6` warnings preexistentes en archivos no modificados por Fase 5A (`appointmentPhoneResolver.ts`, `clientSegments.ts`, `reminderDashboardBuilder.ts`, `on-whatsapp-webhook/index.ts` y otros warnings). El lint enfocado de Fase 5A está limpio.
- Graphify terminó con código `0`, pero advirtió que `47` fuentes no produjeron nodos y que `71` archivos SQL no se indexaron por faltar `tree_sitter_sql`; también conservó nodos fail-closed por cambios del corpus.
- No se ejecutaron acciones propuestas, deploys ni push.
