# Fase 1A — Pricing grounded in code

## Estado

**DONE_WITH_CONCERNS**

La resolución de precios quedó determinista, Gemini ya no recibe `calculatedPrice` como campo de salida, el total se recalcula después del parseo y los links Wompi se seleccionan por precio base. Los tests y el type-check del CRM pasan.

## Archivos

### Nuevos

- `supabase/functions/_shared/pricingCatalog.ts`
  - Catálogo oficial por duración.
  - `resolvePriceForDuration(minutes, withKit)`.
  - `formatPricingCatalogBlock()`.
  - `groundBookingPricing()` para sobrescribir o limpiar cualquier precio generado por Gemini.
- `src/utils/pricingCatalog.test.ts`
  - Cobertura del catálogo, kit, duraciones inválidas, formato y post-procesamiento.
- `.superpowers/sdd/fase1-pricing-report.md`
  - Este informe.

### Modificados

- `supabase/functions/suggest-whatsapp-agent-reply/index.ts`
  - Conserva el prompt local de seguridad/llegada anticipada.
  - Gemini devuelve duración en minutos y `wantsKit`, pero no precios ni links.
  - Calcula `calculatedPrice` con código.
  - Selecciona links y referencias Wompi normales o de kit usando el precio base.
- `supabase/functions/get-whatsapp-booking-context/index.ts`
  - Aplica el mismo post-procesamiento y resolución Wompi determinista.
- `supabase/functions/_shared/inboxAiContextFormat.ts`
  - Conserva la política local de seguridad/llegada anticipada.
  - Inserta el catálogo oficial en el contexto grounded.
- `src/utils/inboxAiContextFormat.test.ts`
  - Conserva el test local de llegada anticipada.
  - Sustituye su import dinámico por import de módulo para cumplir la regla de no inline imports.
  - Verifica que el contexto contiene el catálogo oficial.
- `src/services/whatsappService.ts`
  - Expone `wantsKit: boolean` en `BookingContextData`.

## Evidencia RED

### Catálogo y post-procesamiento

Comando:

```powershell
npm test -- src/utils/pricingCatalog.test.ts
```

Resultado inicial: **exit 1**.

- `Test Files 1 failed (1)`
- Fallo esperado: `Cannot find module '../../supabase/functions/_shared/pricingCatalog'`.
- Confirmó que el catálogo y sus funciones todavía no existían.

### Catálogo dentro del contexto grounded

Comando:

```powershell
npm test -- src/utils/inboxAiContextFormat.test.ts
```

Resultado inicial: **exit 1**.

- `Tests 1 failed | 6 passed (7)`
- Fallo esperado: el bloque no contenía `=== Catálogo oficial de precios (fuente de verdad) ===`.

## Evidencia GREEN

### Catálogo

```powershell
npm test -- src/utils/pricingCatalog.test.ts
```

Resultado: **exit 0**, `12 passed (12)`.

### Tests enfocados finales

```powershell
npm test -- src/utils/pricingCatalog.test.ts src/utils/inboxAiContextFormat.test.ts
```

Resultado: **exit 0**.

- `Test Files 2 passed (2)`
- `Tests 19 passed (19)`

### Type-check CRM

```powershell
npm run type-check
```

Resultado: **exit 0** (`tsc -b --noEmit`).

### Suite completa

```powershell
npm test
```

Resultado: **exit 0**.

- `Test Files 13 passed (13)`
- `Tests 90 passed (90)`

### Calidad adicional

```powershell
git diff --check
```

Resultado: **exit 0**. Solo aparecieron advertencias existentes de conversión LF/CRLF, sin errores de whitespace.

Diagnósticos IDE de los siete archivos de código/test tocados: **sin errores de lint**.

## Auto-revisión

- Los cinco precios base coinciden exactamente con el brief: 58.000, 78.000, 88.000, 118.000 y 148.000 COP.
- El kit suma exactamente 30.000 COP y el resultado tipado expone `basePriceCOP`, `kitSurchargeCOP` y `totalCOP`.
- Duraciones inválidas o no soportadas devuelven `null`.
- `groundBookingPricing()` siempre reemplaza `calculatedPrice`; una duración no soportada lo limpia a `null`.
- Ambos prompts omiten `calculatedPrice` de los campos solicitados y piden duración en minutos más `wantsKit`.
- Ambos Edge Functions ejecutan el grounding de cliente y luego el grounding de precio.
- Con kit, Wompi recibe `resolvedPrice.basePriceCOP`, nunca el total con recargo.
- Sin kit, Wompi también recibe el precio base, que coincide con el total.
- El monto expuesto a frontend es `resolvedPrice.totalCOP`.
- El catálogo oficial se incluye en `ctx.formattedBlock`, usado tanto para extracción de booking como para generación de respuesta.
- Los cambios locales previos de seguridad/llegada anticipada y su test siguen presentes y pasan.
- No se creó rama/worktree, ni se ejecutó commit, stash, reset, checkout o deploy.

## Preocupaciones y dudas

1. `STATIC_KIT_WOMPI_LINKS_BY_BASE_COP` solo tiene links para bases 88.000, 118.000 y 148.000 COP. Para 120/180 minutos con kit, el precio se calcula correctamente, pero no se puede devolver un link estático porque no existe uno para bases 58.000/78.000. No se inventaron URLs.
2. El CLI de Deno no está instalado en este entorno (`deno --version` falla), por lo que no se pudo ejecutar `deno check` sobre los entrypoints Edge. El helper compartido sí fue compilado/importado por Vitest y el type-check CRM pasó.
3. `graphify update .` no pudo ejecutarse porque el ejecutable local falla con `ModuleNotFoundError: No module named 'graphify'`. La exploración inicial sí se hizo primero mediante el MCP de Graphify; al no devolver contexto útil se continuó con búsqueda local conforme a la regla.
4. No quedan dudas funcionales sobre el brief. Se interpretó `wantsKit` como campo booleano de primer nivel del booking context y `collectedData.duration` como minutos, ambos explícitos en los prompts y tipos.

## Corrección posterior a revisión de calidad

### Hallazgos corregidos

- Los endpoints ya no acceden a `bookingContext.collectedData.duration`.
- `resolveBookingPricingCheckout(rawBookingContext)` valida en un único helper compartido:
  - respuesta raíz no-objeto;
  - `collectedData` ausente o malformado;
  - duración soportada;
  - `wantsKit` booleano estricto;
  - pago ya aprobado;
  - disponibilidad real del link estático.
- El helper calcula el precio una sola vez, sobrescribe cualquier `calculatedPrice` inferido y centraliza URL, referencia y monto Wompi.
- Ambos endpoints consumen el mismo resultado y solo aplican después el grounding de datos CRM del cliente.
- El routing normal y con kit usa siempre `basePriceCOP`; el monto publicado sigue siendo `totalCOP`.
- La ausencia de links kit para 120/180 minutos se trata como resultado legítimo: mantiene el precio calculado y omite campos Wompi.

### Evidencia RED de la corrección

Comando:

```powershell
npm test -- src/utils/pricingCatalog.test.ts
```

Resultado: **exit 1**.

- `Test Files 1 failed (1)`
- `Tests 8 failed | 12 passed (20)`
- Los ocho fallos fueron el esperado `resolveBookingPricingCheckout is not a function`.
- Cubrían respuesta parcial, `collectedData` malformado, respuesta raíz no-objeto, routing normal, routing kit por base, ausencia kit 120/180 y pago aprobado.

### Evidencia GREEN de la corrección

Tests enfocados:

```powershell
npm test -- src/utils/pricingCatalog.test.ts src/utils/inboxAiContextFormat.test.ts
```

Resultado: **exit 0**.

- `Test Files 2 passed (2)`
- `Tests 27 passed (27)`

Type-check:

```powershell
npm run type-check
```

Resultado: **exit 0** (`tsc -b --noEmit`).

Validaciones adicionales:

- Suite completa final: `npm test` → **exit 0**, `13` archivos y `98/98` tests.
- Diagnósticos IDE de los cuatro archivos de la corrección: **sin errores de lint**.
- `git diff --check`: **exit 0**, solo advertencias LF/CRLF ya documentadas.
- Búsqueda de acceso directo en los dos endpoints: **sin coincidencias**; el único acceso a `collectedData.duration` está encapsulado detrás de `isRecord()` en el helper compartido.
- Se reintentó `graphify update .`; continúa bloqueado por la instalación local rota (`ModuleNotFoundError: No module named 'graphify'`).

## Segunda corrección posterior a revisión

### Contrato completo normalizado

- Se añadió `supabase/functions/_shared/bookingContext.ts` como contrato compartido y normalizador puro.
- `normalizeBookingContext(rawBookingContext, phone)` convierte cualquier respuesta de Gemini en un objeto completo:
  - `stage`;
  - `collectedData` con `date`, `time`, `duration`, `address` y `addressSource`;
  - `missingData` y `availableSlots`;
  - `paymentStatus`, `paymentAmount`, `wantsKit` y `calculatedPrice`;
  - `clientInfo` completo con teléfono grounded.
- El normalizador valida tipos, descarta campos con forma inválida y fija `calculatedPrice: null`; solo después se ejecuta la resolución determinista de precio/Wompi.
- Los dos endpoints ahora parsean Gemini como `unknown`, normalizan centralmente y eliminaron sus copias de `emptyBookingContext`.
- `BookingContextData` reutiliza `NormalizedBookingContext`, evitando divergencia entre el contrato Edge y ChatArea.
- Por construcción, ChatArea siempre recibe `collectedData` y los demás campos requeridos aunque Gemini responda `{}`, un objeto parcial o un valor no-objeto.

### Evidencia RED de la segunda corrección

Comando:

```powershell
npm test -- src/utils/pricingCatalog.test.ts
```

Resultado: **exit 1**.

- `Test Files 1 failed (1)`
- `Tests 10 failed | 12 passed (22)`
- Los fallos mostraron que la salida solo contenía campos parciales y carecía de `collectedData`, arrays, estados, montos y `clientInfo` requeridos.
- La respuesta parcial con `calculatedPrice: 999999` demostró que el precio inventado debía limpiarse mientras se completaba el contrato.

### Evidencia GREEN de la segunda corrección

Tests enfocados:

```powershell
npm test -- src/utils/pricingCatalog.test.ts src/utils/inboxAiContextFormat.test.ts
```

Resultado: **exit 0**.

- `Test Files 2 passed (2)`
- `Tests 29 passed (29)`

Type-check:

```powershell
npm run type-check
```

Resultado: **exit 0** (`tsc -b --noEmit`).

Verificación adicional:

- Suite completa: `npm test` → **exit 0**, `13` archivos y `100/100` tests.
- Diagnósticos IDE de los seis archivos de la corrección: **sin errores de lint**.
- `git diff --check`: **exit 0**, sin errores de whitespace.
- `graphify update .` se reintentó y sigue bloqueado por `ModuleNotFoundError: No module named 'graphify'`.
