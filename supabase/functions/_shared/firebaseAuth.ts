import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import { jsonResponse } from './cors.ts';

// Project de Firebase (App/UserConsole/Panel comparten el mismo proyecto).
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')?.trim() || 'prosavis';

// JWKS público de Google para tokens de Firebase Auth (Secure Token Service).
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

const FIRESTORE_TIMEOUT_MS = 10000;

export interface FirebaseAuthResult {
  uid: string;
  idToken: string;
}

/**
 * Valida un ID token de Firebase Auth recibido en el header Authorization.
 * Lanza una Response (con CORS) si el token falta o es inválido.
 */
export async function verifyFirebaseToken(req: Request): Promise<FirebaseAuthResult> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    throw jsonResponse({ error: 'Token de autenticación ausente.' }, 401);
  }

  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    const uid = (payload.sub ?? (payload as { user_id?: string }).user_id) as
      | string
      | undefined;
    if (!uid) {
      throw new Error('uid ausente en el token');
    }
    return { uid, idToken };
  } catch (_error) {
    throw jsonResponse({ error: 'Token de autenticación inválido o expirado.' }, 401);
  }
}

/**
 * Verifica que el usuario del token sea dueño de la cita (provider/cliente) o admin.
 * Lee el documento vía Firestore REST con el token del usuario: las Security Rules
 * de Firestore hacen cumplir el ownership (allow get solo a clientId/providerId/admin).
 * Lanza una Response (con CORS) si no está autorizado.
 */
export async function verifyAppointmentOwnership(
  idToken: string,
  appointmentId: string,
): Promise<void> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/appointments/${encodeURIComponent(appointmentId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS),
    });
  } catch (_error) {
    throw jsonResponse({ error: 'No se pudo verificar la propiedad de la cita.' }, 502);
  }

  if (res.ok) return;
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw jsonResponse({ error: 'No autorizado para esta cita.' }, 403);
  }
  throw jsonResponse({ error: 'No se pudo verificar la propiedad de la cita.' }, 502);
}
