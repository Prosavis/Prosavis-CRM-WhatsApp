# Fase 5C — Telemetría + panel "Contexto usado"

Repo: `Prosavis-CRM-WhatsApp` (`master`). Ejecutar después de 5B2 aprobada o en paralelo solo si no toca los mismos archivos UI de chips (preferible secuencial tras 5B2).

## 1. Migración `whatsapp_ai_suggestion_log`

Columnas mínimas:

- `id` uuid PK default gen_random_uuid()
- `stable_key` text not null
- `suggestion` text not null
- `sent_text` text null
- `action_taken` text null
- `edit_ratio` numeric null
- `model` text null
- `context_meta` jsonb not null default '{}'
- `created_at` timestamptz not null default now()
- `closed_at` timestamptz null
- `created_by` uuid/text null

RLS: solo service role / CRM admin patterns del repo (copiar patrón de `whatsapp_conversation_ai_memory` o `crm_directory_ai_suggestions`).

Índice por `stable_key, created_at desc`.

## 2. Escritura al sugerir

En `suggest-whatsapp-agent-reply` (o helper compartido): insertar fila con suggestion, model, context_meta (`historyMeta`, tags, propertySummary, sessionWindow, proposedActionTypes`). Devolver `suggestionLogId` al cliente.

## 3. Cierre al enviar

Desde `ChatArea` al enviar mensaje de texto (no media-only):

- Si hay `suggestionLogId` abierto, invocar Edge/RPC que setea `sent_text`, `edit_ratio`, `closed_at`, `action_taken` opcional.
- `edit_ratio` = distancia normalizada (Levenshtein o ratio caracteres editados / max(len)) entre suggestion y sent_text; documentar fórmula y testear extremos (igual→0, totalmente distinto→~1).

## 4. UI transparencia

Acordeón "Contexto usado" en drawer y/o bajo composer mostrando:

- `historyMeta` (truncated, counts)
- tags de conversación
- `propertySummary`
- `sessionWindow` (open/closed, expiresAt live)

Si la API ya los entrega y el cliente los descarta, mapearlos en `suggestWhatsAppAgentReply` y renderizar.

## 5. Verificación

TDD, tests SQL si el repo los tiene, Vitest, type-check, lint, Graphify, reporte `fase5c-telemetry-transparency-report.md`. No deploy/migración remota (queda para cierre ops).
