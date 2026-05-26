/**
 * Reporte post-migración: conteos por tabla y umbrales Free de Supabase.
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en scripts/firebase-export/.env
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { getSupabaseAdmin } from './lib/admin-mapper.js';
import { getOutputDir } from './lib/config.js';

type TableMetric = {
  table: string;
  rows: number;
  error?: string;
};

const FREE_DB_MB = 500;
const FREE_STORAGE_MB = 1024;
const WARN_DB_MB = 400;
const WARN_STORAGE_MB = 800;

const MONITORED_TABLES = [
  'whatsapp_message_log',
  'whatsapp_conversations',
  'whatsapp_webhook_events',
  'crm_leads',
  'crm_clients',
  'crm_appointments',
  'crm_chat_messages',
  'crm_chats',
  'migration_id_map',
];

async function fetchTableMetrics(): Promise<TableMetric[]> {
  const supabase = getSupabaseAdmin();
  const metrics: TableMetric[] = [];

  for (const table of MONITORED_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    metrics.push({
      table,
      rows: count ?? 0,
      error: error?.message,
    });
  }

  return metrics;
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const tables = await fetchTableMetrics();
  const messageLogRows =
    tables.find((t) => t.table === 'whatsapp_message_log')?.rows ?? 0;

  const report = {
    generatedAt,
    projectRef: 'djzwjaegxbhlefanmmee',
    thresholds: {
      freeDbMb: FREE_DB_MB,
      freeStorageMb: FREE_STORAGE_MB,
      warnDbMb: WARN_DB_MB,
      warnStorageMb: WARN_STORAGE_MB,
    },
    tables,
    heuristics: {
      messageLogRows,
      estimatedDbPressure:
        messageLogRows > 500_000
          ? 'high'
          : messageLogRows > 100_000
            ? 'medium'
            : 'low',
    },
    manualChecks: [
      'Supabase Dashboard > Settings > Usage: Database size y Storage size.',
      'Bucket whatsapp-media: ~104 MB baseline post-migración (267 objetos GCS).',
      'Upgrade Pro si Storage > 800 MB o DB > 400 MB sostenido.',
    ],
  };

  const outDir = getOutputDir();
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `capacity-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('=== Capacity report (conteos) ===');
  for (const t of tables) {
    console.log(`  ${t.table}: ${t.rows} rows${t.error ? ` (${t.error})` : ''}`);
  }
  console.log(`Reporte: ${outPath}`);
}

main().catch((error) => {
  console.error('Error en capacity-report:', error);
  process.exit(1);
});
