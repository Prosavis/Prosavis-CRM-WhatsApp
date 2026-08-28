# Plan de tareas — auditoría CRM perf / sync / UX

No editar el plan aprobado original. Este archivo es la descomposición ejecutable.

## Fase 0 — harness

- Spec + este plan
- Playwright + auth local + marks
- `scripts/audit/{run,compare,loop}`
- Baseline 0 (honesta)
- CI `crm-quality.yml`
- Nota React Doctor CRM

## Fase 1 — inbox sync

- Utils + tests C1–C13 (TDD)
- `subscribeInboxConversations` / messages incrementales
- `useInboxConversations` + `INBOX_CONVERSATION_SELECT`
- `whatsappService` wrapper; `WhatsAppLayout` sin refetch de 3k

## Fase 2 — render / INP

- Virtualizar lista y chat
- Lazy `MetricsTab` via `metricsConstants`
- Unmount inbox fuera de inbox/commercial
- Path-import iconos MUI + `manualChunks`

## Fase 3 — UX percibida

- Optimistic send + marks
- Load-older (`fetchConversationMessages` desc + reverse)
- RPC `crm_directory_meta_by_phones`
- Drafts por chat (no borrar al cambiar conversación)
- Focus + skeletons

## Fase 4 — tabs + Postgres

- Query metrics / directory
- Monitor solo `visibilityState === visible`
- RLS `(select auth.uid())`
- Cache media; abort al cambiar chat

## Fase 5 — CI loop

- Job `crm-audit` smoke / nightly
- Guardar baseline
- `graphify update .` desde `GitHub/`
