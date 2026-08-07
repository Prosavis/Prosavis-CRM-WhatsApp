# Fase 5C — Reporte telemetría + panel "Contexto usado"

**Repo:** `Prosavis-CRM-WhatsApp` (`master`)  
**Fecha:** 2026-08-06  
**Base:** 5B2 APPROVED (`bd5313f` / `a9dfc26`)

## Resumen

Telemetría de sugerencias Inbox AI con tabla `whatsapp_ai_suggestion_log` (RLS service_role), escritura al sugerir (`suggestionLogId`), cierre al enviar texto desde `ChatArea` con `edit_ratio` documentado/testeado, y acordeón **Contexto usado** (historial, tags, propertySummary, sessionWindow live) en composer y drawer. Chips/ejecución 5B2 intactos.

## TDD vertical RED → GREEN

| Slice | RED | GREEN |
| --- | --- | --- |
| `edit_ratio` (Levenshtein / max len) | `inboxAiSuggestionLog.test.ts` | `_shared/inboxAiSuggestionLog.ts` |
| context_meta pack + insert/close helpers | mismo test | insert/close/byId |
| Response wiring + log id | `inboxAiActions.test.ts` | `inboxAiSuggestionResponse` + suggest Edge |
| Service mapping | `whatsappService.types.test.ts` | `suggestionLogId` / `propertySummary` / `closeWhatsAppAiSuggestionLog` |
| UI format helpers | `inboxAiUsedContext.test.ts` | `inboxAiUsedContext.ts` + `UsedContextAccordion` |

Fórmula **edit_ratio**:

```
edit_ratio = levenshtein(suggestion, sent_text) / max(len(suggestion), len(sent_text), 1)
```

- Idénticos → `0`
- Ambos vacíos → `0`
- Uno vacío y otro no → `1`
- Totalmente distintos (misma longitud) → `1`

## Implementación

### Migración / RLS

- `supabase/migrations/20260807012709_whatsapp_ai_suggestion_log.sql`
- Columnas: `id`, `stable_key`, `suggestion`, `sent_text`, `action_taken`, `edit_ratio`, `model`, `context_meta`, `created_at`, `closed_at`, `created_by`
- Índice `(stable_key, created_at desc)`
- RLS enabled; revoke `public/anon/authenticated`; grant solo `service_role` (patrón memoria AI)

### Shared / Edge

- `_shared/inboxAiSuggestionLog.ts` — Levenshtein, insert, close, closeById
- `_shared/inboxAiSuggestionResponse.ts` — inserta log al generar; expone `suggestionLogId`, `propertySummary`
- `suggest-whatsapp-agent-reply` — pasa `suggestionLog` + `propertySummary` en responseContext
- `close-whatsapp-ai-suggestion-log` — `requireCrmAdmin`; cierra fila abierta; `config.toml` `verify_jwt = false`

### Cliente / UI

- `SuggestReplyResult`: `suggestionLogId`, `propertySummary` (+ ya existentes `historyMeta` / `conversationTags` / `sessionWindow`)
- `closeWhatsAppAiSuggestionLog()` en `whatsappService`
- `ChatArea`: guarda log id + contexto; cierra al enviar texto (no media-only); acordeón bajo composer
- `BookingAssistantDrawer`: mismo acordeón
- `UsedContextAccordion` + helpers de formato; `sessionWindow` live vía `useMetaSessionWindow`

## Verificaciones

- Focused 5C + wiring: **33 passed** (`inboxAiSuggestionLog`, `inboxAiUsedContext`, `inboxAiActions`, `whatsappService.types`)
- Regresión 5B2 chips/helpers/execution: **24 passed**
- `npm run type-check` → OK
- ESLint archivos tocados → OK
- `graphify update .` desde `GitHub/` → ejecutado
- No push / no deploy / migración remota no aplicada

## Commits locales

| Hash | Mensaje |
| --- | --- |
| `4349ab1` | feat(inbox-ai): add suggestion log telemetry migration and helpers |
| `01b9fc2` | feat(inbox-ai): add Contexto usado panel and close-on-send |
| `771e135` | docs(sdd): add Fase 5C telemetry transparency report |

## Fuera de alcance (respetado)

- Deploy Edge / apply migración remota
- Auto-cierre en envíos media-only
- Cambios a chips 5B2 / execute path
- WIP V5 (sin reset/stash/checkout)

## Preocupaciones

1. **Migración pendiente de apply** en Supabase remoto/local (Docker/Podman puede faltar).
2. **Edge `close-whatsapp-ai-suggestion-log` y suggest** requieren deploy para telemetría en prod.
3. **Fallo de insert de log es soft**: suggest sigue devolviendo sugerencia con `suggestionLogId: null` (warn en logs).
4. **RTL ausente**: UI cubierta con helpers + service mapping; sin montaje React Testing Library.
5. **Cierre solo en texto** desde `ChatArea.handleSend` (media/sticker no cierran el log abierto).
