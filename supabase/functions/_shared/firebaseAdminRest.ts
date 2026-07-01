import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5.9.6';

/**
 * Escritura administrativa a Firestore via REST usando una service account de
 * Firebase. El CRM no tiene sesion de Firebase Auth (solo Supabase Auth), por
 * lo que las escrituras privilegiadas a users/{uid} se hacen con OAuth2
 * (JWT-bearer) firmado con la private_key de la service account.
 *
 * Requiere el secret FIREBASE_SERVICE_ACCOUNT_JSON con el JSON de la cuenta de
 * servicio (al menos client_email, private_key y project_id).
 */

interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

let cachedAccount: ServiceAccount | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;

  const raw = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64') ??
    ''
  ).trim();
  if (!raw) {
    throw new Error('Falta el secret FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  // Acepta JSON crudo o base64. El base64 evita que los saltos de linea de la
  // private_key o las comillas rompan el valor al cargarlo como variable de
  // entorno (p.ej. via --env-file).
  let jsonText = raw;
  if (!raw.startsWith('{')) {
    try {
      jsonText = atob(raw);
    } catch (error) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON no es JSON ni base64 valido.',
        { cause: error },
      );
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON valido.', { cause: error });
  }

  const clientEmail = String(parsed.client_email ?? '').trim();
  // La private_key suele venir con saltos de linea escapados (\n) al guardarse
  // como variable de entorno; los normalizamos a saltos reales.
  const privateKey = String(parsed.private_key ?? '').replace(/\\n/g, '\n').trim();
  const projectId =
    String(parsed.project_id ?? '').trim() ||
    Deno.env.get('FIREBASE_PROJECT_ID')?.trim() ||
    'prosavis';

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON incompleto (client_email / private_key).');
  }

  cachedAccount = { clientEmail, privateKey, projectId };
  return cachedAccount;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const key = await importPKCS8(account.privateKey, 'RS256');
  const assertion = await new SignJWT({ scope: DATASTORE_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.clientEmail)
    .setSubject(account.clientEmail)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`No se pudo obtener access token de Google: ${res.status} ${detail}`);
  }

  const payload = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error('Respuesta de OAuth2 sin access_token.');
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return payload.access_token;
}

function toFirestoreValue(value: string): { stringValue: string } {
  return { stringValue: value };
}

/** Access token OAuth2 (scope datastore) de la service account de Firebase. */
export async function getServiceAccountAccessToken(): Promise<string> {
  return getAccessToken(loadServiceAccount());
}

/** Project ID resuelto desde la service account / env. */
export function getServiceAccountProjectId(): string {
  return loadServiceAccount().projectId;
}

/**
 * Lee el documento `admins/{uid}` de Firestore vía REST con la service account.
 * Devuelve los campos como objeto plano (string/bool) o null si no existe.
 */
export async function getFirestoreAdminDoc(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const account = loadServiceAccount();
  const accessToken = await getAccessToken(account);
  const url =
    `https://firestore.googleapis.com/v1/projects/${account.projectId}` +
    `/databases/(default)/documents/admins/${encodeURIComponent(uid)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error al leer admins/${uid}: ${res.status} ${detail}`);
  }
  const payload = (await res.json()) as {
    fields?: Record<string, Record<string, unknown>>;
  };
  const fields = payload.fields ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, wrapper] of Object.entries(fields)) {
    if ('stringValue' in wrapper) out[key] = wrapper.stringValue;
    else if ('booleanValue' in wrapper) out[key] = wrapper.booleanValue;
    else if ('integerValue' in wrapper) out[key] = Number(wrapper.integerValue);
    else out[key] = wrapper;
  }
  return out;
}

/**
 * Actualiza campos string del documento Firestore users/{uid}.
 * Solo escribe los campos provistos (updateMask) y exige que el doc exista
 * (currentDocument.exists=true) para no crear usuarios fantasma.
 */
export async function updateFirestoreUser(
  uid: string,
  fields: Record<string, string>,
): Promise<void> {
  const fieldNames = Object.keys(fields);
  if (fieldNames.length === 0) return;

  const account = loadServiceAccount();
  const accessToken = await getAccessToken(account);

  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${account.projectId}` +
      `/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
  );
  for (const name of fieldNames) {
    url.searchParams.append('updateMask.fieldPaths', name);
  }
  // Falla con 404 si el usuario no existe (en vez de crear el documento).
  url.searchParams.set('currentDocument.exists', 'true');

  const body = {
    fields: Object.fromEntries(
      fieldNames.map((name) => [name, toFirestoreValue(fields[name])]),
    ),
  };

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 404) {
      throw new Error(`El usuario Firebase ${uid} no existe.`);
    }
    throw new Error(`Error al actualizar users/${uid} en Firestore: ${res.status} ${detail}`);
  }
}

// ── Lectura / queries (monitor de recordatorios) ─────────────────────────────

type FirestoreValue = Record<string, unknown>;

function unwrapFirestoreValue(wrapper: FirestoreValue): unknown {
  if ('stringValue' in wrapper) return wrapper.stringValue;
  if ('booleanValue' in wrapper) return wrapper.booleanValue;
  if ('integerValue' in wrapper) return Number(wrapper.integerValue);
  if ('doubleValue' in wrapper) return Number(wrapper.doubleValue);
  if ('nullValue' in wrapper) return null;
  if ('timestampValue' in wrapper) return wrapper.timestampValue;
  if ('referenceValue' in wrapper) return wrapper.referenceValue;
  if ('mapValue' in wrapper) {
    const fields = (wrapper.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    return parseFirestoreFields(fields);
  }
  if ('arrayValue' in wrapper) {
    const values = (wrapper.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return values.map((item) => unwrapFirestoreValue(item));
  }
  return wrapper;
}

function parseFirestoreFields(
  fields: Record<string, FirestoreValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, wrapper] of Object.entries(fields)) {
    out[key] = unwrapFirestoreValue(wrapper);
  }
  return out;
}

/** Convierte `fields` de un documento Firestore REST a objeto plano. */
export function parseFirestoreDocument(
  fields: Record<string, FirestoreValue> | undefined,
): Record<string, unknown> {
  return parseFirestoreFields(fields ?? {});
}

function documentNameToId(name: string | undefined): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] ?? '';
}

export interface FirestoreQueryDocument {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Ejecuta `documents:runQuery` contra una colección de Firestore.
 * Devuelve documentos con id y campos parseados.
 */
export async function runFirestoreQuery(
  collectionId: string,
  structuredQuery: Record<string, unknown>,
): Promise<FirestoreQueryDocument[]> {
  const account = loadServiceAccount();
  const accessToken = await getAccessToken(account);
  const url =
    `https://firestore.googleapis.com/v1/projects/${account.projectId}` +
    `/databases/(default)/documents:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...structuredQuery,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error en runQuery(${collectionId}): ${res.status} ${detail}`);
  }

  const rows = (await res.json()) as Array<{
    document?: { name?: string; fields?: Record<string, FirestoreValue> };
  }>;

  const docs: FirestoreQueryDocument[] = [];
  for (const row of rows) {
    if (!row.document?.name) continue;
    docs.push({
      id: documentNameToId(row.document.name),
      data: parseFirestoreDocument(row.document.fields),
    });
  }
  return docs;
}

/**
 * Lee el teléfono de users/{uid} (phone o phoneNumber).
 * Misma lógica que el scheduler de recordatorios en Firebase Functions.
 */
export async function getFirestoreUserPhone(
  uid: string | null | undefined,
): Promise<string | null> {
  if (!uid?.trim()) return null;
  const account = loadServiceAccount();
  const accessToken = await getAccessToken(account);
  const url =
    `https://firestore.googleapis.com/v1/projects/${account.projectId}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid.trim())}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Error al leer users/${uid}: ${res.status} ${detail}`);
  }

  const payload = (await res.json()) as {
    fields?: Record<string, FirestoreValue>;
  };
  const data = parseFirestoreDocument(payload.fields);
  const phone = String(data.phone ?? data.phoneNumber ?? '').trim();
  return phone || null;
}
