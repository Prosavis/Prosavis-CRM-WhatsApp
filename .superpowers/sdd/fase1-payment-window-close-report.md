# Fase 1B — Informe de cierre

Fecha: 2026-08-06

## Estado

Implementación de los tres hallazgos del brief completada, sin push ni deploy.

## Cambios

1. `ChatArea` calcula y memoiza el inbound válido más reciente desde el historial cargado completo, usando el helper compartido existente. Reporta el resultado asociado al ID de conversación y `WhatsAppLayout` lo entrega a `TemplatesSidePanel`, sin perderlo cuando el último mensaje es outbound.
2. `groundBookingPayment()` elige primero la cita próxima más cercana que coincide con un objetivo completo o parcial. Solo después valida el pago de esa cita; ya no toma pago de una coincidencia posterior.
3. El contexto de citas solo muestra `totalAmount` cuando es finito y estrictamente positivo.

## Evidencia TDD

- RED — `inboxAiContextFormat.test.ts`: 2 fallos esperados:
  - total cero/negativo todavía se formateaba;
  - el objetivo parcial tomaba pago de una cita posterior.
- GREEN — mismo archivo: 17/17 pruebas aprobadas.
- RED — `metaSessionWindow.test.ts`: el seam de actividad inbound cargada todavía no existía.
- GREEN — mismo archivo: 9/9 pruebas aprobadas, incluido inbound seguido de outbound.

## Verificación

- Pruebas enfocadas: 26/26 aprobadas en 2 archivos.
- Suite CRM completa: 123/123 aprobadas en 15 archivos.
- Type-check: aprobado (`tsc -b --noEmit`).
- Lint enfocado de frontend y pruebas modificadas: aprobado.
- Diagnósticos IDE de todos los archivos modificados: sin errores.
- Graphify AST actualizado desde la raíz de la suite con `py -m graphify update . --no-cluster`: 65.727 nodos y 332.449 edges.

## Salvedades

- Al incluir el archivo backend modificado en el lint enfocado, ESLint reporta dos errores preexistentes `no-useless-assignment` en las líneas 227–228 de `inboxAiContextFormat.ts`. El mismo comando sobre la versión `HEAD` falla con exactamente esos dos errores; no se corrigieron para no ampliar el alcance.
- Se detectaron cambios concurrentes ajenos a Fase 1B en `.superpowers/sdd/progress.md`, briefs/diffs V5 y `deno.lock`. Se excluyeron del commit de esta tarea.

## Corrección posterior a revisión — switching A → B

La revisión detectó que `ChatArea` mantenía `conversation.id`, `messages` y
`loading` en fuentes independientes. Al cambiar de A a B, React podía renderizar
B con los mensajes todavía retenidos de A antes de ejecutar el efecto que los
limpiaba. Además, el fetch inicial de `subscribeToMessages()` podía resolver
después del unsubscribe.

La corrección reemplaza esos estados independientes por un snapshot/reducer
identificado conjuntamente por `conversationId` y `historyKey`. La UI y la
emisión de `LoadedConversationInbound` solo consumen un snapshot `loaded` cuya
identidad coincide con la conversación activa. Las respuestas tardías de una
suscripción anterior se ignoran en el reducer.

### Evidencia TDD adicional

- RED — `conversationMessageHistory.test.ts` no podía cargar el seam de estado
  todavía inexistente.
- GREEN — la prueba A → B verifica:
  - que el snapshot cargado de A no se expone durante el render transitorio de B;
  - que B no emite inbound mientras espera su propio historial;
  - que un callback tardío de A no reemplaza el estado de B;
  - que B emite únicamente su propio inbound después de cargar.

### Verificación adicional

- Pruebas enfocadas switching/ventana: 10/10 aprobadas en 2 archivos.
- Suite CRM completa: 124/124 aprobadas en 16 archivos.
- Type-check: aprobado (`tsc -b --noEmit`).
- Lint enfocado de la corrección: aprobado.
- Diagnósticos IDE de los archivos modificados: sin errores.
- Graphify AST actualizado: 65.759 nodos y 518.390 edges.

## Corrección posterior a revisión — generación de suscripción

La identidad `conversationId + historyKey` no distinguía dos suscripciones
sucesivas de la misma conversación. En StrictMode, una resuscripción same-key o
una secuencia A → B → A podía aceptar un callback tardío de la primera
generación de A.

Cada setup de `subscribeToMessages()` asigna ahora un `subscriptionId`
monotónico. El ID se propaga por el snapshot y por todas las acciones del
reducer (`started`, `loaded`, `failed`). Solo la generación vigente puede
completar o fallar el historial; las anteriores conservan el estado por
identidad de objeto y no producen emisiones. El `switch` mantiene comprobación
exhaustiva con `never`.

### Evidencia TDD de generación

- RED — 2 fallos reproducidos:
  - callback tardío de una suscripción same-key reemplazaba la generación nueva;
  - al volver A → B → A, la primera generación de A volvía a ser aceptada.
- GREEN — `conversationMessageHistory.test.ts`: 3/3 aprobadas.
- Pruebas enfocadas generación/ventana: 12/12 aprobadas en 2 archivos.
- Suite CRM completa: 126/126 aprobadas en 16 archivos.
- Type-check: aprobado (`tsc -b --noEmit`).
- Lint enfocado y diagnósticos IDE: sin errores.
- Graphify AST actualizado: 65.830 nodos y 704.420 edges.
