# Fase 5A — Contrato `proposedActions` del Inbox IA

Repositorio: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp` (`master`).

## Objetivo

La sugerencia final debe devolver texto más una lista tipada de acciones propuestas. Ninguna acción se ejecuta en Edge ni sin confirmación explícita del agente. Los payloads sensibles deben quedar grounded por código, no confiar en identificadores, precios, links o slots inventados por Gemini.

## Tipos públicos

Crear `_shared/inboxAiActions.ts` con una unión discriminada exportada:

- `create_appointment`
  - payload: `scheduledDate: string`, `duration: 120|180|240|360|480`, `address: string`, `wantsKit: boolean`
- `reschedule_appointment`
  - payload: `appointmentId: string`, `scheduledDate: string`
- `send_payment_link`
  - payload: `url: string`, `amountCOP: number`, `reference?: string`
- `apply_tag`
  - payload: `tagName: string` (nunca aceptar/usar IDs generados por el modelo; la UI resolverá el nombre contra el catálogo real)
- `send_template`
  - payload: `templateName: string`, `languageCode: string`, `variables: Record<string,string>`

Todas comparten:

```ts
{
  id: string;
  type: ...;
  label: string;
  reason: string;
  requiresConfirmation: true;
}
```

Exportar también `InboxAiProposedActionType`, `InboxAiProposedAction`, `InboxAiSuggestionOutput` y el JSON Schema.

## Generación y grounding

1. Cambiar la generación final de `suggest-whatsapp-agent-reply` de texto libre a una sola llamada `geminiGenerateJson` con `responseJsonSchema`:
   - root `{ suggestion: string, proposedActions: array }`;
   - tipos permitidos exactos;
   - `additionalProperties: false`;
   - máximo 5 acciones;
   - `suggestion`, `proposedActions`, `type`, `label`, `reason`, `payload` requeridos.
2. El prompt debe indicar:
   - las acciones son propuestas y no se han ejecutado;
   - proponer solo acciones soportadas por el contexto grounded;
   - todas requieren confirmación humana;
   - no inventar slots, appointment IDs, links, montos, tags ni plantillas.
3. Normalizar/groundear la salida en código:
   - máximo 5, IDs generados por código y `requiresConfirmation: true` incondicional;
   - recortar/limpiar `label` y `reason`; descartar variantes desconocidas o payload inválido;
   - `create_appointment`: `scheduledDate` debe estar en `bookingContext.availableSlots`; duración oficial y dirección provienen del `bookingContext` grounded (el modelo no puede reemplazarlas). Si falta cualquiera, descartar;
   - `reschedule_appointment`: `appointmentId` debe existir en `ctx.appointments` y `scheduledDate` debe estar en slots reales; descartar si no;
   - `send_payment_link`: ignorar payload del modelo y construirlo solo con `wompiCheckoutUrl`, `wompiAmountCOP` y `wompiPaymentReference` calculados por código; sin URL/monto válido, descartar;
   - `apply_tag`: conservar solo un `tagName` no vacío, sin ID; la ejecución posterior exigirá match exacto en catálogo;
   - `send_template`: normalizar nombre/lenguaje/variables, pero la ejecución posterior exigirá match contra plantillas Meta reales;
   - deduplicar acciones equivalentes.
4. Responder `proposedActions: []` en caminos sin sugerencia (último mensaje outbound).
5. Añadir `proposedActions` al tipo/retorno `SuggestReplyResult` en `whatsappService.ts`; no ejecutar nada en servicio/UI todavía.
6. Mantener el contrato existente de `suggestion`, booking, Wompi, ventana y contexto.

## TDD y verificación

Pruebas RED→GREEN para:

- normalización y límite de 5;
- `requiresConfirmation` siempre `true` e IDs no controlados por Gemini;
- pago usa URL/monto/referencia grounded y descarta payload inventado;
- creación/reagenda solo con slot real y cita real;
- tags no aceptan IDs de modelo;
- acciones desconocidas/incompletas se descartan;
- request HTTP real usa `responseJsonSchema`;
- tipos frontend exponen `proposedActions`.

Ejecutar tests enfocados, suite Vitest completa, `npm run type-check`, lint enfocado y `graphify update .`. Crear commit local aislado solo con archivos Fase 5A y reporte `.superpowers/sdd/fase5a-actions-contract-report.md`. No push/deploy/reset/stash/checkout; preservar WIP concurrente.
