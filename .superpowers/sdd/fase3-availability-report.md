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

## Corrección post-review

### Causa raíz e hipótesis

`getSlotsForSingleProvider` consultaba `appointments` únicamente por
`providerId` y usaba la duración total del documento. La lógica canónica de
`appointmentTeamAssignment.ts`, en cambio, consulta también
`assignedTeamMemberIds array-contains`, deduplica por ID, incluye `EN_ROUTE`
entre los estados bloqueantes y calcula la duración efectiva del miembro con
`getAppointmentDurationForMember`.

Hipótesis confirmada: al reutilizar esa semántica para disponibilidad, una
auxiliar ocupada como coasignada deja de producir el slot en conflicto, sin
bloquear horas posteriores con la duración total del equipo.

### Archivos

- `functions/src/calendar/appointmentTeamAssignment.ts`
- `functions/src/calendar/getAvailableSlots.ts`
- `functions/src/calendar/getAvailableSlots.test.ts`
- `functions/src/types/calendar.ts`

Se añadió el helper compartido
`getAppointmentsForMemberWithEffectiveDuration`, usado tanto por conflictos
canónicos como por disponibilidad. La prueba recorre la API pública
`getAvailableSlotsInternal(checkEntireTeam: true)` con Firestore simulado y
verifica una auxiliar secundaria con duración propia de 120 minutos. También
se actualizó la documentación del contrato a
`120 | 180 | 240 | 360 | 480`.

### Evidencia RED

```text
npm test -- --runInBand src/calendar/getAvailableSlots.test.ts
Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
Expected not to contain: 2026-08-10T12:00:00.000Z
Received: el slot ocupado por la auxiliar coasignada
```

### Evidencia GREEN y verificación

```text
npm test -- --runInBand src/calendar/getAvailableSlots.test.ts src/calendar/appointmentTeamAssignment.test.ts
Test Suites: 2 passed, 2 total
Tests:       39 passed, 39 total

npm test -- --runInBand
Test Suites: 65 passed, 65 total
Tests:       507 passed, 507 total
Snapshots:   1 passed, 1 total

npm run build
Exit 0

graphify update .
Exit 0 — 59.019 nodos, 169.249 edges, 1.402 comunidades
```

Los diagnósticos IDE de los cuatro archivos no reportaron errores y
`git diff --check` terminó en exit 0.

### Commit

- Firebase: `8a94973` (`Fix co-assigned team availability`).
- El commit contiene exclusivamente los cuatro archivos del fix.
- Este proceso no ejecutó push. Durante el cierre, otro proceso concurrente
  avanzó `origin/main` hasta `8a94973` y creó después el commit local ajeno
  `d6895b7`; no se reescribió ni alteró esa actividad.

### Preocupaciones restantes

- No se modificó código del CRM. Por esa restricción, sigue pendiente el Minor
  de emitir warning estructurado cuando `_shared/availability.ts` recibe un
  payload con contrato inválido.
- El recorrido de miembros del equipo sigue siendo secuencial; su
  paralelización era un Minor de rendimiento y se evitó ampliar el alcance.
- Graphify conservó sus warnings existentes: falta `tree_sitter_sql`, 47
  fuentes no produjeron nodos y las etiquetas de comunidades requieren
  refresco.
- Aunque se solicitó un commit solamente local, `8a94973` apareció en
  `origin/main` por actividad concurrente posterior al commit.
