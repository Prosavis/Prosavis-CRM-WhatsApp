#!/usr/bin/env node
/**
 * Inventario dry-run: cuenta documentos Firestore CRM/WhatsApp y estima Storage.
 * Solo lectura — no escribe en Supabase.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getOutputDir, getFirebaseConfig } from './lib/config.js';
import {
  countCollection,
  countCollectionGroup,
  countSubcollectionExecutions,
  countChatMessages,
  getDistinctServiceIds,
  getFirebaseStorage,
  initFirebaseAdmin,
} from './lib/firestore-reader.js';

type CollectionInventory = {
  path: string;
  count: number;
  supabaseTable?: string;
  notes?: string;
  skipped?: boolean;
};

type StoragePrefixInventory = {
  prefix: string;
  fileCount: number;
  totalBytes: number;
  totalMb: number;
};

type InventoryReport = {
  generatedAt: string;
  firebaseProject: string;
  storageBucket: string;
  collections: CollectionInventory[];
  storage: {
    prefixes: StoragePrefixInventory[];
    referencedPathsEstimate?: {
      fromMessageLog: number;
      fromStickers: number;
      uniquePaths: number;
    };
  };
  serviceIds: {
    distinctCount: number;
    ids: string[];
  };
  totals: {
    firestoreDocuments: number;
    ephemeralSkipped: number;
  };
  capacityNotes: {
    supabaseFreeStorageLimitMb: 1024;
    supabaseFreeDbLimitMb: 500;
    whatsappMediaBaselineMb: 104;
    recommendedUpgradeStorageMb: 800;
    recommendedUpgradeDbMb: 400;
  };
};

const EPHEMERAL_COLLECTIONS = [
  'whatsapp_rate_limit',
  'whatsapp_inbound_lock',
  'webhook_processed_ids',
  'whatsapp_admin_presence',
  'whatsapp_daily_outreach',
] as const;

const TOP_LEVEL_COLLECTIONS: Array<{
  path: string;
  supabaseTable?: string;
  notes?: string;
}> = [
  { path: 'whatsapp_chat_tags', supabaseTable: 'whatsapp_chat_tags' },
  { path: 'whatsapp_conversations', supabaseTable: 'whatsapp_conversations' },
  { path: 'whatsapp_message_log', supabaseTable: 'whatsapp_message_log', notes: 'Alto volumen' },
  { path: 'leads', supabaseTable: 'crm_leads' },
  { path: 'discount_codes', supabaseTable: 'crm_discount_codes' },
  { path: 'whatsapp_operator_snippets', supabaseTable: 'whatsapp_snippets' },
  { path: 'whatsapp_ia_templates', supabaseTable: 'whatsapp_ia_templates' },
  { path: 'whatsapp_stickers', supabaseTable: 'whatsapp_stickers' },
  { path: 'whatsapp_blocklist', supabaseTable: 'whatsapp_blocklist' },
  { path: 'whatsapp_outbound_batches', supabaseTable: 'whatsapp_outbound_batches' },
  { path: 'whatsapp_broadcast_jobs', supabaseTable: 'whatsapp_broadcast_jobs' },
  { path: 'crmClients', supabaseTable: 'crm_clients' },
  { path: 'chats', supabaseTable: 'crm_chats' },
  { path: 'appointments', supabaseTable: 'crm_appointments' },
  { path: 'faqs', supabaseTable: 'crm_faqs' },
];

async function countPlatformSettings(): Promise<number> {
  const { db } = initFirebaseAdmin();
  const doc = await db.doc('platform_settings/whatsapp_automation').get();
  return doc.exists ? 1 : 0;
}

async function scanStoragePrefix(prefix: string): Promise<StoragePrefixInventory> {
  const bucket = getFirebaseStorage().bucket();
  let fileCount = 0;
  let totalBytes = 0;

  let pageToken: string | undefined;
  do {
    const [files, , response] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 1000,
      pageToken,
    });

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      fileCount += 1;
      totalBytes += Number(metadata.size ?? 0);
    }

    pageToken = (response as { nextPageToken?: string } | undefined)?.nextPageToken;
  } while (pageToken);

  return {
    prefix,
    fileCount,
    totalBytes,
    totalMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
  };
}

async function estimateReferencedStoragePaths(): Promise<InventoryReport['storage']['referencedPathsEstimate']> {
  const { db } = initFirebaseAdmin();
  const paths = new Set<string>();
  let fromMessageLog = 0;
  let fromStickers = 0;

  const stickersSnap = await db.collection('whatsapp_stickers').get();
  for (const doc of stickersSnap.docs) {
    const storagePath = doc.data().storagePath as string | undefined;
    if (storagePath) {
      paths.add(storagePath);
      fromStickers += 1;
    }
  }

  const messagesSnap = await db
    .collection('whatsapp_message_log')
    .select('storagePath', 'storageUrl')
    .limit(5000)
    .get();

  for (const doc of messagesSnap.docs) {
    const data = doc.data();
    const storagePath = data.storagePath as string | undefined;
    if (storagePath) {
      paths.add(storagePath);
      fromMessageLog += 1;
    } else if (data.storageUrl) {
      fromMessageLog += 1;
    }
  }

  return {
    fromMessageLog,
    fromStickers,
    uniquePaths: paths.size,
  };
}

async function main(): Promise<void> {
  initFirebaseAdmin();
  const collections: CollectionInventory[] = [];

  for (const item of TOP_LEVEL_COLLECTIONS) {
    const count = await countCollection(item.path);
    collections.push({
      path: item.path,
      count,
      supabaseTable: item.supabaseTable,
      notes: item.notes,
    });
  }

  collections.push({
    path: 'platform_settings/whatsapp_automation',
    count: await countPlatformSettings(),
    supabaseTable: 'platform_settings',
    notes: 'Documento único',
  });

  for (const path of EPHEMERAL_COLLECTIONS) {
    const count = await countCollection(path);
    collections.push({
      path,
      count,
      skipped: true,
      notes: 'Efímero / runtime bot — no migrar',
    });
  }

  const collectionGroups: Array<{
    group: string;
    supabaseTable: string;
    counter: () => Promise<number>;
  }> = [
    { group: 'messages (chats)', supabaseTable: 'crm_chat_messages', counter: countChatMessages },
    { group: 'externalContacts', supabaseTable: 'crm_external_contacts', counter: () => countCollectionGroup('externalContacts') },
    { group: 'importBatches', supabaseTable: 'crm_import_batches', counter: () => countCollectionGroup('importBatches') },
    { group: 'automations', supabaseTable: 'crm_automations', counter: () => countCollectionGroup('automations') },
    { group: 'executions', supabaseTable: 'crm_automation_executions', counter: countSubcollectionExecutions },
    { group: 'tasks', supabaseTable: 'crm_tasks', counter: () => countCollectionGroup('tasks') },
    { group: 'profileViews', supabaseTable: 'crm_profile_views', counter: () => countCollectionGroup('profileViews') },
    { group: 'teamMembers', supabaseTable: 'crm_team_members', counter: () => countCollectionGroup('teamMembers') },
  ];

  for (const cg of collectionGroups) {
    collections.push({
      path: `collectionGroup:${cg.group}`,
      count: await cg.counter(),
      supabaseTable: cg.supabaseTable,
    });
  }

  const serviceIds = await getDistinctServiceIds();

  const storagePrefixes = await Promise.all([
    scanStoragePrefix('whatsapp-media/'),
    scanStoragePrefix('whatsapp-stickers/'),
  ]);

  const referencedPathsEstimate = await estimateReferencedStoragePaths();

  const firestoreDocuments = collections
    .filter((c) => !c.skipped)
    .reduce((sum, c) => sum + c.count, 0);
  const ephemeralSkipped = collections
    .filter((c) => c.skipped)
    .reduce((sum, c) => sum + c.count, 0);

  const { projectId, storageBucket } = getFirebaseConfig();

  const report: InventoryReport = {
    generatedAt: new Date().toISOString(),
    firebaseProject: projectId,
    storageBucket,
    collections,
    storage: {
      prefixes: storagePrefixes,
      referencedPathsEstimate,
    },
    serviceIds: {
      distinctCount: serviceIds.length,
      ids: serviceIds.slice(0, 50),
    },
    totals: {
      firestoreDocuments,
      ephemeralSkipped,
    },
    capacityNotes: {
      supabaseFreeStorageLimitMb: 1024,
      supabaseFreeDbLimitMb: 500,
      whatsappMediaBaselineMb: 104,
      recommendedUpgradeStorageMb: 800,
      recommendedUpgradeDbMb: 400,
    },
  };

  const outputDir = getOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `inventory-${Date.now()}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== Inventario Firebase CRM/WhatsApp (dry-run) ===\n');
  console.log(`Proyecto: ${report.firebaseProject}`);
  console.log(`Bucket:   ${report.storageBucket}\n`);

  console.log('Colecciones (migración):');
  for (const c of collections.filter((x) => !x.skipped)) {
    const table = c.supabaseTable ? ` → ${c.supabaseTable}` : '';
    console.log(`  ${c.path.padEnd(42)} ${String(c.count).padStart(8)}${table}`);
  }

  console.log('\nOmitidas (efímeras):');
  for (const c of collections.filter((x) => x.skipped)) {
    console.log(`  ${c.path.padEnd(42)} ${String(c.count).padStart(8)}`);
  }

  console.log('\nStorage Firebase:');
  for (const p of storagePrefixes) {
    console.log(`  ${p.prefix.padEnd(24)} ${String(p.fileCount).padStart(6)} archivos  ${p.totalMb} MB`);
  }

  console.log('\nTotales:');
  console.log(`  Documentos a migrar:     ${firestoreDocuments}`);
  console.log(`  Efímeros (omitidos):     ${ephemeralSkipped}`);
  console.log(`  serviceId distintos:     ${serviceIds.length}`);
  console.log(`\nReporte JSON: ${outputPath}\n`);
}

main().catch((error) => {
  console.error('Error en inventario:', error);
  process.exit(1);
});
