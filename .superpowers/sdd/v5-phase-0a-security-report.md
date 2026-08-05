# V5 Fase 0A — Reporte de auth dual y CORS estricto

## Estado

Implementado en `master` el bloque acotado de auth/CORS de Fase 0A, sin crear
ramas/worktrees, sin reescribir historia, sin desplegar y sin mutaciones
remotas.

Resultado:

- CORS estricto con allowlist exacta, extensión por
  `OPS_V5_ALLOWED_ORIGINS`, JSON estricto y preflight permitido/denegado.
- Guard dual `requireAdmin` para Firebase Auth y Supabase Auth con inyección
  explícita de dependencias.
- Errores 401/403 del guard generados con CORS estricto.
- `requireDirectoryAdmin` conservado como facade compatible.
- 21 pruebas Deno pasan; formato y lint pasan.

## Archivos del task

- `supabase/functions/_shared/strictCors.ts` — helper CORS estricto.
- `supabase/functions/_shared/strictCors.test.ts` — 7 pruebas del seam
  request → headers/Response.
- `supabase/functions/_shared/adminAuth.ts` — guard dual y factory inyectable.
- `supabase/functions/_shared/adminAuth.test.ts` — 14 pruebas del seam
  request → contexto/Response, incluida la facade legacy.
- `supabase/functions/_shared/directoryMonitorAuth.ts` — facade compatible
  delegada a `requireAdmin`.
- `.superpowers/sdd/v5-phase-0a-security-report.md` — este reporte.

No se modificaron `supabase/config.toml`, Edge Functions V5, frontends ni
helpers CORS legacy ajenos.

## Decisiones de implementación

### CORS

- Allowlist por defecto exactamente igual al brief (8 orígenes).
- `OPS_V5_ALLOWED_ORIGINS` se divide por comas, se recorta y descarta cualquier
  entrada que contenga `*`.
- No hay matching por sufijo ni reflexión de orígenes desconocidos.
- Un origen permitido recibe su valor exacto en
  `Access-Control-Allow-Origin` y `Vary: Origin`.
- Requests sin `Origin` no reciben headers CORS.
- Preflight permitido: 204, métodos `GET, POST, OPTIONS` y headers
  `authorization, x-client-info, apikey, content-type`.
- Preflight denegado: 403 JSON sin ACAO.
- Toda respuesta de `strictJsonResponse` usa
  `Content-Type: application/json`.

### Auth

- El header se acepta únicamente con esquema `Bearer`.
- El issuer Firebase solo selecciona la ruta; claims/email se autorizan
  únicamente después de que `verifyFirebaseToken` valida el ID token.
- Firebase admin: claim `admin === true`, email allowlisted o documento
  `admins/{uid}` con rol admin y flag activo explícito.
- Supabase: `auth.getUser(token)` y luego `admin_profiles`; solo
  `is_active === true` con rol `admin` o `super_admin`.
- El service-role key no se retorna ni se serializa; el contrato retorna el
  cliente service-role y el actor normalizado.
- La factory `createAdminGuard` permite pruebas con fakes sin llamadas reales.
- La facade legacy elimina la tercera lógica divergente.

Se consultaron el changelog vigente y las guías actuales de Supabase para
Edge Functions CORS, authorization headers y `auth.getUser`. La resolución
inicial de imports estáticos descargó módulos de `esm.sh`; las pruebas de auth
no invocaron Firebase, Supabase ni Firestore reales.

## Ciclos red → green

Todos los ciclos usaron:

```powershell
npx --yes deno test --allow-env supabase/functions/_shared/<test>.test.ts
```

### CORS

1. Red inicial:

```text
TS2307 [ERROR]: Cannot find module '.../strictCors.ts'.
error: Type checking failed.
```

2. Green tras implementar el helper:

```text
running 7 tests from ./supabase/functions/_shared/strictCors.test.ts
ok | 7 passed | 0 failed
```

### Auth

Los slices se añadieron uno a uno. Cada fallo observado antes de su
implementación fue:

```text
TS2307 [ERROR]: Cannot find module '.../adminAuth.ts'.
Expected 1, received 0
Expected 403, received 401
Response { ... status: 403 ... }  # claim Firebase aún no implementado
Response { ... status: 403 ... }  # allowlist aún no implementada
Response { ... status: 403 ... }  # Firestore admin aún no implementado
Expected 1, received 0             # verificación Supabase no invocada
Expected 1, received 0             # perfil Supabase no consultado
Response { ... status: 403 ... }  # roles Supabase aún no implementados
TS2305 [ERROR]: Module '".../adminAuth.ts"' has no exported member 'requireAdmin'.
Expected false, received true      # facade aún devolvía ACAO wildcard
```

Green final de auth:

```text
running 11 tests from ./supabase/functions/_shared/adminAuth.test.ts
ok | 11 passed | 0 failed
```

## Verificación final requerida

### Formato

```powershell
npx --yes deno fmt --check supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts
```

Salida exacta:

```text
Checked 4 files
```

Exit code: `0`.

### Lint

```powershell
npx --yes deno lint supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts
```

Salida exacta:

```text
Checked 4 files
```

Exit code: `0`.

La facade también se verificó por separado:

```text
Checked 1 file
Checked 1 file
```

### Tests

```powershell
npx --yes deno test --allow-env supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.test.ts
```

Salida exacta final (sin códigos ANSI ni tiempos variables):

```text
Check supabase/functions/_shared/adminAuth.test.ts
Check supabase/functions/_shared/strictCors.test.ts
running 11 tests from ./supabase/functions/_shared/adminAuth.test.ts
missing bearer token returns strict 401 JSON ... ok
invalid Firebase token returns 401 ... ok
valid non-admin Firebase identity returns 403 ... ok
Firebase admin claim returns normalized Firebase context ... ok
allowlisted Firebase email returns admin context case-insensitively ... ok
active Firestore admin document returns Firebase context ... ok
invalid Supabase token returns 401 ... ok
valid Supabase user without active admin profile returns 403 ... ok
active Supabase admin and super_admin return normalized contexts ... ok
public guard denies missing auth without reflecting an unknown origin ... ok
requireDirectoryAdmin remains a strict-compatible facade ... ok
running 7 tests from ./supabase/functions/_shared/strictCors.test.ts
allows every exact default origin ... ok
allows exact origins configured through OPS_V5_ALLOWED_ORIGINS ... ok
rejects lookalikes, wildcard configuration, null and unknown origins ... ok
server-to-server requests without Origin receive no ACAO header ... ok
allowed preflight returns the strict methods and headers ... ok
denied preflight returns 403 without ACAO ... ok
JSON responses always set content type and only reflect allowed origins ... ok
ok | 18 passed | 0 failed
```

Exit code: `0`.

IDE diagnostics sobre los cinco archivos de código/prueba: `No linter errors
found`.

## Commit task-scoped

```text
70546ded3afabcf7a7e0fc4558da899b2201ff0e
feat(security): add strict CORS and dual admin auth
```

El commit contiene exclusivamente los cinco archivos de código/prueba del
task. Este reporte se entrega en un commit documental separado para no mezclar
el artefacto de ejecución con el cambio funcional.

## Concerns y límites

1. El `deno check` ampliado de los cuatro call sites legacy alcanzó código
   ajeno y terminó con 5 errores preexistentes, no relacionados con esta
   implementación:

```text
directoryAnalyze.ts:608:71 TS2339 Property 'toLowerCase' does not exist on type '{}'.
directoryAnalyze.ts:818:7 TS2322 Type 'string | null' is not assignable to type 'string | undefined'.
directoryAnalyze.ts:839:9 TS2322 Type 'string | null' is not assignable to type 'string | undefined'.
whatsappMediaStorage.ts:32:56 TS2345 Uint8Array<ArrayBufferLike> is not assignable to BufferSource.
whatsappMediaStorage.ts:271:7 TS2769 Uint8Array<ArrayBufferLike> is not assignable to BodyInit.
Found 5 errors.
error: Type checking failed.
```

   Los tests de este bloque sí type-checkean y pasan. No se tocaron esos
   archivos por estar fuera de alcance.

2. `graphify update .` no pudo ejecutarse por una instalación local rota:

```text
ModuleNotFoundError: No module named 'graphify'
```

   La exploración inicial sí se hizo mediante el MCP Graphify.

3. El hallazgo de compatibilidad sobre documentos Firebase admin legacy quedó
   resuelto en el addendum siguiente: V5 conserva el requisito explícito y la
   facade mantiene exactamente la semántica legacy.

4. No se conectó `strictCors.ts` a respuestas exitosas/preflight de funciones
   legacy. Este bloque entrega el helper y garantiza CORS estricto en errores
   del guard; migrar CORS legacy o crear endpoints V5 quedó fuera de este task.

5. Había cambios y commits concurrentes ajenos durante la ejecución. Se
   preservaron y no se incluyeron en el commit del task.

## Addendum — compatibilidad Firebase admin legacy

### Hallazgo corregido

La revisión task-scoped detectó que la primera facade delegaba al guard V5
estricto y, por tanto, denegaba documentos legacy `admins/{uid}` válidos cuando
`isActive` y `active` estaban ambos ausentes.

La corrección mantiene dos políticas sobre un único core:

- `requireAdmin` y `createAdminGuard` usan por defecto
  `requireExplicitFirebaseAdminActive`: solo `isActive === true` o
  `active === true` autorizan.
- `requireDirectoryAdmin` se construye con
  `preserveLegacyFirebaseAdminActive`: autoriza si alguno es `true` o si ambos
  campos están ausentes; deniega un `false` explícito cuando el otro campo no es
  `true`.
- `createDirectoryAdminGuard` expone el mismo wrapper para pruebas con
  dependencias inyectadas, sin duplicar verificación de tokens, roles,
  allowlists, contexto ni respuestas CORS.

### Archivos del fix

- `supabase/functions/_shared/adminAuth.ts`
- `supabase/functions/_shared/adminAuth.test.ts`
- `supabase/functions/_shared/directoryMonitorAuth.ts`

### TDD

Caracterización del contrato V5 estricto antes del cambio:

```text
V5 guard denies Firestore admin document without active flags ... ok
ok | 12 passed | 0 failed
```

Red de compatibilidad legacy:

```text
TS2305 [ERROR]: Module '".../directoryMonitorAuth.ts"' has no exported member 'createDirectoryAdminGuard'.
error: Type checking failed.
```

Green después de introducir la policy inyectable y el wrapper:

```text
legacy facade allows Firestore admin document without active flags ... ok
ok | 13 passed | 0 failed
```

Se añadió además cobertura sensible para documentos explícitamente inactivos:

```text
legacy facade denies explicitly inactive admin documents with strict CORS ... ok
ok | 14 passed | 0 failed
```

Esa prueba cubre tanto un origen permitido —reflejado exactamente— como uno
desconocido —sin `Access-Control-Allow-Origin`—.

### Verificación final del fix

Formato:

```powershell
npx --yes deno fmt --check --no-config supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts supabase/functions/_shared/directoryMonitorAuth.ts
```

Salida exacta:

```text
Checked 5 files
```

Exit code: `0`.

Lint:

```powershell
npx --yes deno lint --no-config supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts supabase/functions/_shared/directoryMonitorAuth.ts
```

Salida exacta:

```text
Checked 5 files
```

Exit code: `0`.

Tests auth/CORS:

```powershell
npx --yes deno test --allow-env --no-lock supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.test.ts
```

Salida exacta final (sin códigos ANSI ni tiempos variables):

```text
Check supabase/functions/_shared/adminAuth.test.ts
Check supabase/functions/_shared/strictCors.test.ts
running 14 tests from ./supabase/functions/_shared/adminAuth.test.ts
missing bearer token returns strict 401 JSON ... ok
invalid Firebase token returns 401 ... ok
valid non-admin Firebase identity returns 403 ... ok
Firebase admin claim returns normalized Firebase context ... ok
allowlisted Firebase email returns admin context case-insensitively ... ok
active Firestore admin document returns Firebase context ... ok
V5 guard denies Firestore admin document without active flags ... ok
legacy facade allows Firestore admin document without active flags ... ok
legacy facade denies explicitly inactive admin documents with strict CORS ... ok
invalid Supabase token returns 401 ... ok
valid Supabase user without active admin profile returns 403 ... ok
active Supabase admin and super_admin return normalized contexts ... ok
public guard denies missing auth without reflecting an unknown origin ... ok
requireDirectoryAdmin remains a strict-compatible facade ... ok
running 7 tests from ./supabase/functions/_shared/strictCors.test.ts
allows every exact default origin ... ok
allows exact origins configured through OPS_V5_ALLOWED_ORIGINS ... ok
rejects lookalikes, wildcard configuration, null and unknown origins ... ok
server-to-server requests without Origin receive no ACAO header ... ok
allowed preflight returns the strict methods and headers ... ok
denied preflight returns 403 without ACAO ... ok
JSON responses always set content type and only reflect allowed origins ... ok
ok | 21 passed | 0 failed
```

Exit code: `0`.

### Commit del fix

```text
2dd1383988b0303a8b18a93392d15ff72407fd73
Make admin guard active-policy configurable
```

El commit contiene exclusivamente los tres archivos del fix. Fue creado
concurrentemente mientras se verificaba el working tree compartido; se auditó
su diff completo y no se duplicó ni reescribió.

### Concern operativo

`graphify update .` volvió a fallar por la instalación local ya documentada:

```text
ModuleNotFoundError: No module named 'graphify'
```

No se realizaron llamadas a Firebase, Supabase o Firestore reales, ni
mutaciones remotas.
