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

  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
  if (!raw) {
    throw new Error('Falta el secret FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
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
