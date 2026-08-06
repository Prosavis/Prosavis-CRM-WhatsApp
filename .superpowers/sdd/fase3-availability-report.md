# Fase 3 — Disponibilidad real — Reporte

Fecha: 2026-08-06

## Resultado

Se implementó el puente HTTP Firebase `crmGetAvailableSlots` y su consumo desde
las dos Edge Functions del CRM. La disponibilidad expuesta al frontend queda
grounded en resultados reales: los slots inferidos por Gemini se reemplazan
siempre por la respuesta normalizada del puente o por `[]` ante degradación.

## Firebase

- Endpoint v2 `onRequest`, región `us-central1`, POST-only y sin CORS de navegador.
- Secret Manager `FIREBASE_CRM_BRIDGE_SECRET` mediante `defineSecret`.
- Autenticación por `x-crm-secret` con comparación constante sobre SHA-256.
- Validación estricta de fechas ISO, horizonte inclusivo máximo de 7 días y
  duraciones oficiales `120 | 180 | 240 | 360 | 480`.
- Servicio fijado en `PROSAVIS_LIMPIEZA_SERVICE_ID` y
  `checkEntireTeam: true`; el caller no puede seleccionar servicio ni proveedor.
- Reutilización de `getAvailableSlotsInternal`, incluyendo las duraciones
  oficiales de 120 y 180 minutos en el modo CRM existente.
- Respuesta tipada `{ slots: string[] }`, filtrada a datetimes ISO disponibles.

## CRM

- `_shared/firebaseHttp.ts`: POST server-side, URL canónica por defecto,
  secret solo desde Edge runtime y timeout máximo de 4 segundos.
- `_shared/availability.ts`: fechas Bogotá, horizonte de 7 días, fallback de
  240 minutos, validación/dedupe/orden ISO y degradación estructurada a `[]`.
- Integración posterior a la extracción de Gemini en:
  - `suggest-whatsapp-agent-reply`
  - `get-whatsapp-booking-context`
- Sobrescritura incondicional de `bookingContext.availableSlots`.
- Sección exacta `=== Disponibilidad real (próximos días) ===` en el contexto
  grounded de la sugerencia, conservando el techo de 78.000 caracteres y el
  historial más reciente cuando hace falta recortar.
- Instrucción de seguridad conservada y reforzada: solo ofrecer slots reales y
  preferir el slot real de llegada anticipada cuando la vivienda quedará sola.

## TDD y verificación

Los ciclos comenzaron en rojo por módulos aún inexistentes y pasaron a verde
tras la implementación.

### Firebase

- Focused Jest: `12/12` tests.
- Full Functions Jest: `64/64` suites, `505/505` tests, snapshot `1/1`.
- `npm run build`: correcto.
- El repositorio no tiene configuración ESLint, por lo que no fue posible
  ejecutar lint local de Functions; TypeScript sí compiló sin errores.

### CRM

- Focused Vitest: `4/4` files, `63/63` tests.
- Full Vitest: `19/19` files, `156/156` tests.
- `npm run type-check`: correcto.
- Focused ESLint sobre archivos Fase 3: correcto.
- Deno CLI no está instalado; no se ejecutó `deno check` ni un serve local de
  Edge Functions. Vitest, TypeScript y ESLint cubrieron los módulos compartidos
  y las integraciones estáticas.

### Graphify

Se reparó el CLI local y se ejecutó `graphify update .`: `59.601` nodos,
`184.095` edges y `1.453` comunidades. Graphify avisó que 70 archivos SQL no
aportaron nodos por faltar `tree_sitter_sql`; no afecta los archivos TypeScript
de Fase 3.

## Estado de commits y concurrencia

Mientras se preparaba el staging explícito, otro proceso concurrente dejó ambos
repositorios limpios, creó commits combinados y movió también los refs remotos:

- Firebase: `ccd5b89` (`Add V5 booking projection, CRM bridge, and sync fixes`).
  Incluye Fase 3 **y** WIP V5/sync; por tanto no es el commit aislado solicitado.
- CRM: `3c880df` (`Inbox AI: operational context + real availability`).
  Incluye Fase 3 **y** artefactos SDD concurrentes de Fase 2/V5; tampoco es
  aislado.

Este proceso no ejecutó `push`, deploy ni mutación de secretos, y no reescribió
historia compartida para evitar perder o alterar el trabajo concurrente. El
presente reporte queda como cambio Fase 3 separado.

## Preocupaciones

1. Los commits de implementación fueron contaminados y publicados por el
   proceso concurrente antes del staging aislado. Separarlos ahora exige
   coordinación y reescritura segura de historia; no debe hacerse
   unilateralmente.
2. Falta verificación con runtime Deno/local Supabase por ausencia del CLI.
3. Graphify requiere instalar `tree_sitter_sql` para cobertura AST de SQL,
   aunque la cobertura TypeScript de esta fase sí fue actualizada.
