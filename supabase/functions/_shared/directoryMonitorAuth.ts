// Autenticación unificada para el monitor de directorio.
// Acepta dos orígenes de admin:
//  - CRM WhatsApp  → JWT de Supabase Auth (admin_profiles)
//  - User Console  → ID token de Firebase Auth (claim admin / allowlist / admins/{uid})
// El gateway de Supabase tiene verify_jwt=false para esta función; la validación
// real (firma + rol admin) se hace aquí.

import { jsonResponse } from './cors.ts';
import { getServiceClient, requireCrmAdmin } from './supabase.ts';
import { verifyFirebaseToken } from './firebaseAuth.ts';
import { getFirestoreAdminDoc } from './firebaseAdminRest.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface DirectoryAdminActor {
  kind: 'firebase' | 'supabase';
  uid: string;
  email?: string;
}

export interface DirectoryAdminContext {
  supabase: SupabaseClient;
  actor: DirectoryAdminActor;
}

const FALLBACK_ADMIN_EMAILS = [
  'admin@prosavis.com',
  'support@prosavis.com',
  'oliverafrancy@gmail.com',
  'prosavis28@gmail.com',
];

let cachedAdminEmails: string[] | null = null;

function getAuthorizedAdminEmails(): string[] {
  if (cachedAdminEmails) return cachedAdminEmails;
  const env = Deno.env.get('AUTHORIZED_ADMIN_EMAILS');
  const list = env
    ? env.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : FALLBACK_ADMIN_EMAILS.map((e) => e.toLowerCase());
  cachedAdminEmails = list;
  return list;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch (_e) {
    return null;
  }
}

async function isFirebaseAdmin(
  uid: string,
  email: string | undefined,
  payload: Record<string, unknown> | null,
): Promise<boolean> {
  if (payload?.admin === true) return true;

  const allow = getAuthorizedAdminEmails();
  if (email && allow.includes(email.toLowerCase())) return true;

  try {
    const doc = await getFirestoreAdminDoc(uid);
    if (doc) {
      const role = String(doc.role ?? '');
      const isAdmin =
        doc.isAdmin === true || ['admin', 'super_admin', 'superadmin'].includes(role);
      const isActive =
        doc.isActive === true ||
        doc.active === true ||
        (doc.isActive === undefined && doc.active === undefined);
      if (isAdmin && isActive) return true;
    }
  } catch (_e) {
    // Sin acceso a Firestore: cae a 403 más abajo.
  }
  return false;
}

/**
 * Verifica que el solicitante sea administrador (CRM o plataforma) y devuelve un
 * cliente Supabase con service_role para operar sobre el directorio.
 * Lanza una Response (CORS) con 401/403 si no procede.
 */
export async function requireDirectoryAdmin(req: Request): Promise<DirectoryAdminContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw jsonResponse({ error: 'Usuario no autenticado.' }, 401);
  }

  const payload = decodeJwtPayload(token);
  const issuer = String(payload?.iss ?? '');

  if (issuer.includes('securetoken.google.com')) {
    const { uid } = await verifyFirebaseToken(req);
    const email = typeof payload?.email === 'string' ? (payload.email as string) : undefined;
    const admin = await isFirebaseAdmin(uid, email, payload);
    if (!admin) {
      throw jsonResponse({ error: 'Usuario sin permisos de administrador.' }, 403);
    }
    return {
      supabase: getServiceClient(),
      actor: { kind: 'firebase', uid, email },
    };
  }

  // Supabase Auth (CRM WhatsApp): reutiliza la validación existente.
  const { supabase, user, profile } = await requireCrmAdmin(req);
  return {
    supabase,
    actor: { kind: 'supabase', uid: user.id, email: profile.email ?? undefined },
  };
}
