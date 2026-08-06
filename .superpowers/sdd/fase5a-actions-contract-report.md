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

## Gate correctivo posterior — hallazgos bloqueantes y Minors

### Correcciones

- El schema enviado como `responseJsonSchema` ya no emite `minLength` ni `maxLength`; los límites de `label` y `reason` permanecen en la normalización de código.
- El gate recursivo usa exactamente el allowlist documentado para Gemini y falla ante cualquier keyword fuera de ese subset.
- Se extrajo el cableado HTTP compartido de respuesta. El endpoint real usa ese seam tanto para el camino de último outbound (`proposedActions: []`) como para generación, que entrega las acciones ya normalizadas.
- La prueba del cliente ejecuta `suggestWhatsAppAgentReply`, simula la respuesta real de `supabase.functions.invoke` y comprueba que `proposedActions` se mapea al resultado público.
- El dedupe de tags y plantillas usa una clave canónica NFKC y case-insensitive, incluyendo variables de plantilla, sin modificar la primera representación aceptada.
- Los IDs generados se validan como UUID v4 y se comprueba su unicidad.

### Evidencia RED → GREEN

- Baseline antes del gate correctivo: `11/11` pruebas enfocadas pasaban, confirmando que la cobertura anterior no detectaba los hallazgos.
- Primer RED: el test del cableado HTTP falló porque el seam compartido todavía no existía.
- Segundo RED: `3` regresiones fallaron de forma específica por `minLength`, dedupe Unicode/case-sensitive y propagación de dos acciones equivalentes en el camino de generación.
- GREEN enfocado: `14/14` pruebas pasan en `2` archivos.
- Suite Vitest completa: `184/184` pruebas pasan en `22` archivos.
- `npm run type-check`: pasa.
- ESLint enfocado a los `5` archivos de código/test del fix: pasa sin hallazgos.
- Diagnósticos IDE de los archivos modificados: sin errores.
- `git diff --check`: pasa.
- `graphify update .`: código `0`; `2.966` nodos, `5.280` edges y `214` comunidades.

### Preocupaciones vigentes

- Graphify continúa sin indexar `71` archivos SQL porque falta `tree_sitter_sql`; también reportó `linked-project.json` sin nodos y recomendó refrescar labels porque cambió el conjunto de comunidades.
- No se hizo deploy ni push.
