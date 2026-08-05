# V5 Fase 0A — Admin auth dual y CORS estricto

## Contexto

Este bloque crea los helpers de seguridad que usarán todas las Edge Functions
V5. El CRM autentica con Supabase Auth y UserConsole con Firebase ID token.
Existe un guard dual en
`supabase/functions/_shared/directoryMonitorAuth.ts`; se debe reutilizar o
extraer su núcleo, no crear una tercera lógica divergente.

Trabaja en `Prosavis-CRM-WhatsApp` sobre la rama única `master`. Hay actividad
concurrente y cambios ajenos en el working tree: no crees ramas/worktrees, no
reescribas historia y no modifiques ni incluyas archivos fuera de este task.

## Alcance

1. Crear `supabase/functions/_shared/strictCors.ts`.
2. Crear `supabase/functions/_shared/adminAuth.ts` a partir del guard dual
   existente.
3. Si es necesario para evitar duplicación y permitir pruebas, convertir
   `directoryMonitorAuth.ts` en facade compatible o extraer helpers compartidos,
   sin cambiar su interfaz pública `requireDirectoryAdmin`.
4. Crear pruebas Deno junto a los helpers:
   - `strictCors.test.ts`
   - `adminAuth.test.ts`

No crear todavía Edge Functions V5 ni modificar `supabase/config.toml`.

## Contrato de CORS

Allowlist exacta por defecto:

- `https://prosavis-userconsole.web.app`
- `https://prosavis-userconsole.firebaseapp.com`
- `https://userconsole.prosavis.com`
- `https://prosavis-crm-whatsapp.vercel.app`
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3001`

Puede ampliarse con una variable de entorno explícita
`OPS_V5_ALLOWED_ORIGINS`, separada por comas. No se permiten wildcards,
matching por sufijo ni reflejar orígenes desconocidos.

Interfaz pública mínima:

- función que determine si el `Origin` está permitido;
- función que produzca headers CORS para una request;
- función de respuesta JSON estricta;
- función para responder preflight `OPTIONS`.

Comportamiento:

- origen permitido: `Access-Control-Allow-Origin` replica exactamente ese
  origen y añade `Vary: Origin`;
- origen no permitido: no incluye `Access-Control-Allow-Origin`;
- preflight permitido: 204 con métodos `GET, POST, OPTIONS` y headers
  `authorization, x-client-info, apikey, content-type`;
- preflight no permitido: 403 sin header de autorización CORS;
- requests server-to-server sin `Origin` pueden procesarse, pero no reciben
  `Access-Control-Allow-Origin`;
- respuestas JSON siempre usan `Content-Type: application/json`.

## Contrato de autenticación

`adminAuth.ts` exporta un guard V5 (nombre recomendado `requireAdmin`) que:

- exige `Authorization: Bearer <token>`;
- conserva ambos orígenes soportados:
  - Firebase ID token válido + claim admin, email allowlisted o documento
    `admins/{uid}` activo;
  - Supabase Auth válido + `admin_profiles` activo con rol `admin` o
    `super_admin`;
- devuelve el cliente Supabase service-role y actor normalizado
  `{ kind: 'firebase' | 'supabase', uid, email? }`;
- responde 401 cuando falta o es inválida la autenticación;
- responde 403 cuando la identidad existe pero no es admin;
- sus errores usan la respuesta JSON de `strictCors.ts`, por lo que nunca
  reintroducen `Access-Control-Allow-Origin: *`;
- mantiene compatibilidad de `requireDirectoryAdmin` para sus call sites
  existentes.

La lógica debe ser testeable sin red. Usa inyección explícita de dependencias,
una factory o funciones puras; no hagas imports inline. No expongas service
role ni secretos.

## TDD y seams aprobados

Seams públicos:

1. CORS request→Response/headers:
   - cada origen permitido;
   - origen malicioso parecido (subdominio/sufijo), `null` y desconocido;
   - request sin origin;
   - preflight permitido y denegado;
   - JSON permitido/denegado.
2. Guard admin request→contexto o Response:
   - sin bearer → 401;
   - Firebase inválido → 401;
   - Firebase válido no-admin → 403;
   - Firebase admin por claim, allowlist y Firestore → contexto firebase;
   - Supabase inválido → 401;
   - Supabase usuario no-admin → 403;
   - Supabase admin/super_admin activo → contexto supabase;
   - respuestas de error para origin permitido lo reflejan; para origin no
     permitido no incluyen ACAO.

Trabaja verticalmente red → green. Esta máquina no tiene `deno` global; prueba
`npx --yes deno`. Comandos esperados:

```powershell
npx --yes deno fmt --check supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts
npx --yes deno lint supabase/functions/_shared/adminAuth.ts supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.ts supabase/functions/_shared/strictCors.test.ts
npx --yes deno test --allow-env supabase/functions/_shared/adminAuth.test.ts supabase/functions/_shared/strictCors.test.ts
```

Si la resolución inicial de imports remotos exige red, habilita solo el permiso
mínimo requerido para cargar módulos; las pruebas de auth no deben llamar
Firebase ni Supabase reales.

## Fuera de alcance

- Reemplazar el wildcard de funciones legacy distintas a
  `directory-monitor`.
- Crear endpoints V5 o desplegarlos.
- Cambiar auth del frontend.
- Mutar Supabase remoto, Vercel o Firebase.

## Entrega

Escribe el reporte en
`.superpowers/sdd/v5-phase-0a-security-report.md` con estado, archivos, ciclos
red/green, comandos y salida exacta, commits task-scoped y concerns.
