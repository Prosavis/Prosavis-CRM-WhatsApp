import { randomBytes } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { buildAdminUidMap, getSupabaseAdmin } from './lib/admin-mapper.js';
import { initFirebaseAdmin } from './lib/firestore-reader.js';
import { createMigrationContext } from './lib/migration-context.js';
import { migrateBlocklist } from './mappers/whatsapp-blocklist.js';
import { migrateBroadcastJobs } from './mappers/whatsapp-broadcast-jobs.js';
import { migrateConversations } from './mappers/whatsapp-conversations.js';
import { migrateDiscountCodes } from './mappers/whatsapp-discount-codes.js';
import { migrateMessageLog } from './mappers/whatsapp-messages.js';
import { migrateOutboundBatches } from './mappers/whatsapp-outbound-batches.js';
import { migratePlatformSettings } from './mappers/whatsapp-platform-settings.js';
import { migrateSnippets } from './mappers/whatsapp-snippets.js';
import { migrateStickers } from './mappers/whatsapp-stickers.js';
import { migrateWhatsappTags } from './mappers/whatsapp-tags.js';
import type { ExportStepOptions, MapperFn } from './mappers/types.js';

type CrmRole = 'admin' | 'super_admin';

type AdminCandidate = {
  firebaseUid: string;
  email: string;
  displayName: string;
  role: CrmRole;
  isActive: boolean;
  needsAuthUser: boolean;
  needsProfile: boolean;
};

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
    backfill: !argv.includes('--no-backfill'),
    password: process.env.ADMIN_SYNC_DEFAULT_PASSWORD,
  };
}

function normalizeRole(role: string | undefined): CrmRole {
  if (!role) return 'admin';
  const normalized = role.toLowerCase().replace(/-/g, '_');
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'super_admin';
  return 'admin';
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

async function buildSupabaseEmailIndex(): Promise<Map<string, string>> {
  const client = getSupabaseAdmin();
  const emailToId = new Map<string, string>();
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);

    for (const user of data.users) {
      if (user.email) emailToId.set(user.email.toLowerCase(), user.id);
    }

    if (data.users.length < 1000) break;
    page += 1;
  }

  return emailToId;
}

async function loadAdminCandidates(): Promise<AdminCandidate[]> {
  const supabase = getSupabaseAdmin();
  const authByEmail = await buildSupabaseEmailIndex();

  const { data: profiles, error: profilesError } = await supabase
    .from('admin_profiles')
    .select('id, email');
  if (profilesError) throw new Error(profilesError.message);

  const profileEmails = new Set(
    (profiles ?? [])
      .map((row) => (typeof row.email === 'string' ? row.email.toLowerCase() : ''))
      .filter(Boolean)
  );

  const snap = await getFirestore().collection('admins').get();
  const candidates: AdminCandidate[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isActiveFirestoreAdmin(data)) continue;

    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (!email) continue;

    const emailKey = email.toLowerCase();
    const authUserId = authByEmail.get(emailKey);
    const hasProfile = profileEmails.has(emailKey);

    if (authUserId && hasProfile) continue;

    candidates.push({
      firebaseUid: doc.id,
      email,
      displayName: ((data.name ?? data.displayName) as string | undefined) ?? email.split('@')[0],
      role: normalizeRole(data.role as string | undefined),
      isActive: true,
      needsAuthUser: !authUserId,
      needsProfile: !hasProfile,
    });
  }

  return candidates;
}

const BACKFILL_STEPS: Array<{ name: string; run: MapperFn }> = [
  { name: 'tags', run: migrateWhatsappTags },
  { name: 'platform_settings', run: migratePlatformSettings },
  { name: 'snippets', run: migrateSnippets },
  { name: 'stickers', run: migrateStickers },
  { name: 'blocklist', run: migrateBlocklist },
  { name: 'discount_codes', run: migrateDiscountCodes },
  { name: 'conversations', run: migrateConversations },
  { name: 'messages', run: migrateMessageLog },
  { name: 'outbound_batches', run: migrateOutboundBatches },
  { name: 'broadcast_jobs', run: migrateBroadcastJobs },
];

async function backfillAdminReferences(): Promise<void> {
  const ctx = await createMigrationContext();
  const options: ExportStepOptions = {};

  console.log('\n=== Backfill referencias admin (upsert idempotente) ===');
  console.log(`Admins mapeados en contexto: ${ctx.adminMap.size}`);

  for (const step of BACKFILL_STEPS) {
    console.log(`\n→ ${step.name}`);
    const result = await step.run(ctx, options);
    console.log(`  ${step.name}: ${result.upserted}/${result.attempted} upserted`);
    if (result.errors.length) {
      for (const err of result.errors.slice(0, 5)) {
        console.error(`    ERROR: ${err}`);
      }
    }
  }

  const unmapped = ctx.warnings.filter((w) => w.includes('[admin-map] UID sin match'));
  if (unmapped.length) {
    console.log(`\nAdvertencias admin-map restantes (${unmapped.length}):`);
    for (const w of unmapped.slice(0, 10)) {
      console.log(`  - ${w}`);
    }
  } else {
    console.log('\nSin UIDs admin sin mapear en backfill.');
  }
}

async function main(): Promise<void> {
  const { dryRun, backfill, password } = parseArgs(process.argv.slice(2));

  initFirebaseAdmin();

  const { map, warnings } = await buildAdminUidMap();
  const candidates = await loadAdminCandidates();

  console.log('=== Sync admins Firebase → Supabase ===');
  console.log(`Admins mapeados (Firestore → Supabase): ${map.size}`);
  console.log(`Pendientes de provisionar/perfilar: ${candidates.length}`);
  if (dryRun) console.log('Modo: DRY-RUN (no escribe en Supabase)');

  if (warnings.length) {
    console.log('\nAdvertencias de mapeo:');
    for (const w of warnings) {
      console.log(`  - ${w.firebaseUid}${w.email ? ` (${w.email})` : ''}: ${w.reason}`);
    }
  }

  if (candidates.length === 0) {
    console.log('\nTodos los admins de Firestore ya tienen auth + admin_profiles.');
    if (backfill && !dryRun) {
      await backfillAdminReferences();
    }
    return;
  }

  const auth = getAuth();
  const supabase = getSupabaseAdmin();
  const defaultPassword = password ?? randomBytes(18).toString('base64url');
  let createdAuth = 0;
  let upsertedProfiles = 0;

  if (!password && !dryRun && candidates.some((c) => c.needsAuthUser)) {
    console.log(
      '\nContraseña temporal para nuevos admins (compartir por canal seguro; cambiar en primer login):'
    );
    console.log(defaultPassword);
  }

  const authByEmail = await buildSupabaseEmailIndex();

  for (const candidate of candidates) {
    console.log(`\n→ ${candidate.email}`);
    console.log(`  Firebase UID: ${candidate.firebaseUid}`);
    console.log(`  Rol CRM: ${candidate.role}`);

    if (dryRun) continue;

    let supabaseId = authByEmail.get(candidate.email.toLowerCase());

    if (candidate.needsAuthUser) {
      const fbUser = await auth.getUser(candidate.firebaseUid);
      const { data, error } = await supabase.auth.admin.createUser({
        email: candidate.email,
        email_confirm: true,
        password: defaultPassword,
        user_metadata: {
          name: candidate.displayName ?? fbUser.displayName ?? candidate.email.split('@')[0],
          firebase_uid: candidate.firebaseUid,
        },
      });

      if (error) {
        throw new Error(`Error creando auth user ${candidate.email}: ${error.message}`);
      }

      supabaseId = data.user.id;
      authByEmail.set(candidate.email.toLowerCase(), supabaseId);
      createdAuth += 1;
      console.log(`  ✅ Auth user creado: ${supabaseId}`);
    } else if (supabaseId) {
      console.log(`  ℹ Auth user existente: ${supabaseId}`);
    }

    if (!supabaseId) {
      throw new Error(`No se pudo resolver Supabase ID para ${candidate.email}`);
    }

    if (candidate.needsProfile || candidate.needsAuthUser) {
      const { error: profileError } = await supabase.from('admin_profiles').upsert(
        {
          id: supabaseId,
          email: candidate.email,
          display_name: candidate.displayName,
          role: candidate.role,
          is_active: candidate.isActive,
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        throw new Error(`Error en admin_profiles ${candidate.email}: ${profileError.message}`);
      }

      upsertedProfiles += 1;
      console.log('  ✅ admin_profiles upserted');
    }
  }

  console.log(`\nResumen: ${createdAuth} auth user(s) creado(s), ${upsertedProfiles} perfil(es) upserted`);

  if ((createdAuth > 0 || upsertedProfiles > 0) && backfill && !dryRun) {
    await backfillAdminReferences();
  }
}

main().catch((error) => {
  console.error('Error en sync-admins:', error);
  process.exit(1);
});
