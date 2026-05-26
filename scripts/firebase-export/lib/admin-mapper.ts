import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { initFirebaseAdmin } from './firestore-reader.js';
import { getSupabaseConfig } from './config.js';

export type AdminUidMap = Map<string, string>;

export type AdminMapWarning = {
  firebaseUid: string;
  email?: string;
  reason: string;
};

let supabase: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (supabase) return supabase;

  const { url, serviceRoleKey } = getSupabaseConfig();
  supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

async function buildSupabaseEmailIndex(): Promise<Map<string, string>> {
  const client = getSupabaseAdmin();
  const emailToId = new Map<string, string>();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Error listando usuarios Supabase: ${error.message}`);
    }

    for (const user of data.users) {
      if (user.email) {
        emailToId.set(user.email.toLowerCase(), user.id);
      }
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return emailToId;
}

function isActiveFirestoreAdmin(data: FirebaseFirestore.DocumentData): boolean {
  if (data.isActive === false || data.active === false) return false;
  const isAdmin =
    data.isAdmin === true ||
    data.role === 'admin' ||
    data.role === 'super_admin' ||
    data.role === 'superadmin';
  return isAdmin || data.isActive === true || data.active === true || data.role != null;
}

async function loadFirestoreAdmins(): Promise<
  Array<{ firebaseUid: string; email: string; source: 'firestore' }>
> {
  const snap = await getFirestore().collection('admins').get();
  const admins: Array<{ firebaseUid: string; email: string; source: 'firestore' }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isActiveFirestoreAdmin(data)) continue;

    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (!email) {
      continue;
    }

    admins.push({ firebaseUid: doc.id, email, source: 'firestore' });
  }

  return admins;
}

/**
 * Cruza admins Firebase (colección `admins` + custom claim `admin`) con auth.users en Supabase por email.
 */
export async function buildAdminUidMap(): Promise<{
  map: AdminUidMap;
  warnings: AdminMapWarning[];
}> {
  initFirebaseAdmin();
  const auth = getAuth();
  const supabaseByEmail = await buildSupabaseEmailIndex();
  const map: AdminUidMap = new Map();
  const warnings: AdminMapWarning[] = [];
  const seenFirebaseUids = new Set<string>();

  const firestoreAdmins = await loadFirestoreAdmins();
  for (const admin of firestoreAdmins) {
    seenFirebaseUids.add(admin.firebaseUid);
    const supabaseId = supabaseByEmail.get(admin.email.toLowerCase());
    if (supabaseId) {
      map.set(admin.firebaseUid, supabaseId);
    } else {
      warnings.push({
        firebaseUid: admin.firebaseUid,
        email: admin.email,
        reason: 'Sin usuario Supabase con el mismo email',
      });
    }
  }

  let pageToken: string | undefined;
  do {
    const listResult = await auth.listUsers(1000, pageToken);
    for (const user of listResult.users) {
      if (seenFirebaseUids.has(user.uid)) continue;

      const isAdmin = user.customClaims?.admin === true;
      if (!isAdmin) continue;

      if (!user.email) {
        warnings.push({
          firebaseUid: user.uid,
          reason: 'Admin Firebase sin email — no se puede mapear',
        });
        continue;
      }

      const supabaseId = supabaseByEmail.get(user.email.toLowerCase());
      if (supabaseId) {
        map.set(user.uid, supabaseId);
      } else {
        warnings.push({
          firebaseUid: user.uid,
          email: user.email,
          reason: 'Sin usuario Supabase con el mismo email',
        });
      }
    }
    pageToken = listResult.pageToken;
  } while (pageToken);

  return { map, warnings };
}

export function mapAdminUid(
  firebaseUid: string | null | undefined,
  adminMap: AdminUidMap
): string | null {
  if (!firebaseUid) return null;
  return adminMap.get(firebaseUid) ?? null;
}
