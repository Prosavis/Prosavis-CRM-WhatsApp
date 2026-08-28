# CRM WhatsApp — rendimiento, sync y usabilidad

Fecha: 2026-08-28  
Repo: `Prosavis-CRM-WhatsApp`  
Fuera de alcance: envío real a Meta, webhook, Coex import, rediseño visual, UserConsole `/calendar`, borrar índices sin EXPLAIN.

## Contrato de harness

- **No WhatsApp real.** `ENABLE_META_SEND=false` en local / e2e / audit.
- **Auth e2e solo local:** usuario `e2e@prosavis.local` + email/password en `supabase/config.toml` + `supabase/seed.sql` (`admin_profiles`). Nunca Google OAuth ni allowlist de producción.
- Playwright usa `storageState` (`e2e/.auth/admin.json`).
- Semilla e2e: pocos chats en `seed.sql`. Carga 3k/10k solo en `supabase/seed-perf.sql` / `scripts/audit/seed-perf.ts` (no en el seed por defecto; rompe SQL CI).
- Marks de performance (`src/utils/inboxPerfMarks.ts`):
  - `inbox:list-ready`
  - `inbox:chat-ready`
  - `inbox:send-optimistic`
  - `inbox:send-ack`

## Presupuestos (P-*)

| Id | Presupuesto | Cómo se mide |
|---|---|---|
| P-inbox-list | 1500 ms | `inbox:list-ready` desde navegación a inbox |
| P-switch-chat INP | 200 ms | INP al abrir/cambiar chat |
| P-switch-chat paint | 400 ms | `inbox:chat-ready` |
| P-send | 50 ms optimistic / 1500 ms ack | `inbox:send-optimistic` / `inbox:send-ack` |
| P-rt-delta | 0 full refetch | eventos Realtime coalescidos; `fetchConversations` no corre en el flush |
| P-tab-switch INP | 200 ms | cambio de tab Cloud |
| P-lcp-login | 2500 ms | LCP login (Lighthouse si hay) |
| P-inp-inbox | 200 ms | INP inbox |
| P-cls | 0.1 | CLS inbox/chat |
| P-dom-list | viewport + overscan (~40) | filas DOM en lista virtualizada |
| P-rq-inbox | keys existen | `inboxQueryKeys.conversations` / `messages` |
| P-sql-rls | 0 WARN en tablas calientes | `auth.uid()` envuelto `(select auth.uid())` |

Baseline 0 puede fallar presupuestos: se **guarda**, no se finge verde.

## Matriz de tests A–I

| Grupo | Qué |
|---|---|
| A | Auth local: login email/password, storageState (A2) |
| B | Humo inbox: lista lista (B1), abrir chat (B2), cambiar chat (B3) |
| C | Sync: C1 N eventos → 1 flush ≤150 ms; C2 UPDATE merge; C3 INSERT top; C4 DELETE; C5 INSERT mensaje; C7 visibility 30s; C8 sibling no entra; C9 no duplicado; C11 reconcile optimistic; C12 fail; C13 mark-read sin refetch |
| F | Postgres/edges: F1 RLS initplan; F4 media URL cache; F6 abort al cambiar chat |
| H | UX: optimistic, load-older, drafts por chat, focus sin salto |
| I | Calidad: I1 vitest; I4 type-check + lint |

## Protocolo de loop

1. `npm run audit` → vitest + playwright (si hay supabase) + lighthouse-si-hay + `supabase db lint` si hay.
2. `scripts/audit/compare.mjs` vs `audits/baselines/current.json`. Exit 1 si algún P-* empeora.
3. `npm run audit:loop` / `scripts/audit/loop.ps1`: hasta 8 iteraciones; si falla, imprime el siguiente parche candidato.

## Decisión de montaje inbox

Al salir de `inbox` / `commercial`, **se desmonta** `WhatsAppLayout`. TanStack Query conserva la cache (`staleTime` 30s); el remount es barato y corta Realtime/presencia de la lista.

## React Doctor

`npx react-doctor@latest` no está disponible en este entorno (CLI ausente / no ejecutado). Baseline manual 2026-08-28: inbox sin virtualizar ~3k filas, Realtime con `select('*')` + refetch completo, MetricsTab import estático. Tras este plan: virtualización, Query inbox, lazy MetricsTab, select estrecho. Re-correr en máquina local con `NODE_OPTIONS=--max-old-space-size=8192`. También se anotó en `prosavis-firebase/docs/desarrollo/react-doctor-calidad-frontend.md` (puede ir en un commit aparte de docs).

## Baseline

Ver `audits/baselines/current.json` y la sección “Resultados baseline 0” al final de este spec (Fase 5).

## Resultados baseline 0 (2026-08-28T18:52:47Z)

Corrida: `npm run audit` (ENABLE_META_SEND=false). **No se fingió verde.**

| Comando | Resultado |
|---|---|
| vitest C1–C13 / media / UX H | pass (24 tests, ~3s) |
| `npm test` | pass (57 files / 386 tests) |
| `npm run type-check` | pass |
| `npm run lint` | **fail** — 8 errores preexistentes en edges (`appointmentPhoneResolver`, `clientSegments`, `inboxAiContext`, `reminderDashboardBuilder`, `whatsappOutbound.mediaUrlForLog`, …) + 7 warnings. No son regresiones del inbox. |
| Playwright A2/B1–B3 | **omitido** — Supabase local `127.0.0.1:54321` no estaba arriba |
| Lighthouse P-lcp | **omitido** — sin dev server en :3001 (`AUDIT_LIGHTHOUSE=1` para activar) |
| `supabase db lint` | **omitido** — `AUDIT_DB_LINT=1` para activar |

| Presupuesto | Estado baseline 0 |
|---|---|
| P-rt-delta | **pass** (coalescer C1, 0 full refetch en flush) |
| P-rq-inbox | **pass** (`inboxQueryKeys` existen) |
| P-inbox-list, P-switch-chat, P-send, P-tab-switch, P-lcp-login, P-inp-inbox, P-cls, P-dom-list | **null** (sin e2e/Lighthouse en esta máquina) |
| P-sql-rls | **null** (db lint no corrido; migración `20260828153100` envuelve `auth.uid()`) |

`npm run audit` sale 1 por lint. `scripts/audit/compare.mjs` trata `null` como no-regresión.

`graphify update .` desde `GitHub/` (2026-08-28): 48458 nodos · 100778 edges · 1783 comunidades. `graphify-out/` es local (gitignore).
