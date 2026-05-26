#!/usr/bin/env node

/**

 * Validación post-importación: reconcilia conteos Firestore vs Postgres.

 */

import { mkdirSync, writeFileSync } from 'node:fs';

import { resolve } from 'node:path';

import { getOutputDir } from './lib/config.js';

import {

  countChatMessages,

  countCollection,

  countCollectionGroup,

  countSubcollectionExecutions,

  initFirebaseAdmin,

} from './lib/firestore-reader.js';

import { getTableRowCount } from './lib/supabase-writer.js';



type CountCheck = {
  label: string;
  firestoreCount: () => Promise<number>;
  supabaseTable: string;
  skip?: boolean;
  /** Supabase puede tener filas seed/stubs por encima de Firestore sin fallar */
  allowSupabaseHigher?: boolean;
  allowSupabaseHigherMax?: number;
};



const COUNT_CHECKS: CountCheck[] = [
  {
    label: 'whatsapp_chat_tags',
    firestoreCount: () => countCollection('whatsapp_chat_tags'),
    supabaseTable: 'whatsapp_chat_tags',
    allowSupabaseHigher: true,
    allowSupabaseHigherMax: 5,
  },
  {
    label: 'whatsapp_conversations',
    firestoreCount: () => countCollection('whatsapp_conversations'),
    supabaseTable: 'whatsapp_conversations',
    allowSupabaseHigher: true,
    allowSupabaseHigherMax: 10,
  },
  {
    label: 'whatsapp_message_log',
    firestoreCount: () => countCollection('whatsapp_message_log'),
    supabaseTable: 'whatsapp_message_log',
    allowSupabaseHigher: true,
    allowSupabaseHigherMax: 30,
  },

  { label: 'leads', firestoreCount: () => countCollection('leads'), supabaseTable: 'crm_leads' },

  { label: 'discount_codes', firestoreCount: () => countCollection('discount_codes'), supabaseTable: 'crm_discount_codes' },

  { label: 'whatsapp_operator_snippets', firestoreCount: () => countCollection('whatsapp_operator_snippets'), supabaseTable: 'whatsapp_snippets' },

  { label: 'whatsapp_ia_templates', firestoreCount: () => countCollection('whatsapp_ia_templates'), supabaseTable: 'whatsapp_ia_templates' },

  { label: 'whatsapp_stickers', firestoreCount: () => countCollection('whatsapp_stickers'), supabaseTable: 'whatsapp_stickers' },

  { label: 'whatsapp_blocklist', firestoreCount: () => countCollection('whatsapp_blocklist'), supabaseTable: 'whatsapp_blocklist' },

  { label: 'whatsapp_outbound_batches', firestoreCount: () => countCollection('whatsapp_outbound_batches'), supabaseTable: 'whatsapp_outbound_batches' },

  { label: 'whatsapp_broadcast_jobs', firestoreCount: () => countCollection('whatsapp_broadcast_jobs'), supabaseTable: 'whatsapp_broadcast_jobs' },

  { label: 'crmClients', firestoreCount: () => countCollection('crmClients'), supabaseTable: 'crm_clients' },

  { label: 'chats', firestoreCount: () => countCollection('chats'), supabaseTable: 'crm_chats' },

  { label: 'chat_messages', firestoreCount: countChatMessages, supabaseTable: 'crm_chat_messages' },

  { label: 'appointments', firestoreCount: () => countCollection('appointments'), supabaseTable: 'crm_appointments' },

  { label: 'faqs', firestoreCount: () => countCollection('faqs'), supabaseTable: 'crm_faqs' },

  { label: 'externalContacts', firestoreCount: () => countCollectionGroup('externalContacts'), supabaseTable: 'crm_external_contacts' },

  { label: 'importBatches', firestoreCount: () => countCollectionGroup('importBatches'), supabaseTable: 'crm_import_batches' },

  { label: 'automations', firestoreCount: () => countCollectionGroup('automations'), supabaseTable: 'crm_automations' },

  { label: 'executions', firestoreCount: countSubcollectionExecutions, supabaseTable: 'crm_automation_executions' },

  { label: 'tasks', firestoreCount: () => countCollectionGroup('tasks'), supabaseTable: 'crm_tasks' },

  { label: 'profileViews', firestoreCount: () => countCollectionGroup('profileViews'), supabaseTable: 'crm_profile_views' },

  { label: 'teamMembers', firestoreCount: () => countCollectionGroup('teamMembers'), supabaseTable: 'crm_team_members' },

];



type ValidationRow = {

  label: string;

  firestoreCount: number;

  supabaseCount: number | null;

  delta: number | null;

  deltaPct: number | null;

  ok: boolean;

  note?: string;

};



function parseTolerance(argv: string[]): number {

  const arg = argv.find((a) => a.startsWith('--tolerance='))?.split('=')[1];

  const parsed = arg ? Number(arg) : 0.001;

  return Number.isFinite(parsed) ? parsed : 0.001;

}



async function main(): Promise<void> {

  initFirebaseAdmin();

  const tolerance = parseTolerance(process.argv.slice(2));

  const rows: ValidationRow[] = [];

  let failed = false;



  console.log('\n=== Validación conteos Firebase vs Supabase ===\n');

  console.log(`Tolerancia: ${(tolerance * 100).toFixed(2)}%\n`);



  for (const check of COUNT_CHECKS) {

    const firestoreCount = await check.firestoreCount();

    const supabaseCount = await getTableRowCount(check.supabaseTable);



    let ok = true;

    let delta: number | null = null;

    let deltaPct: number | null = null;

    let note: string | undefined;



    if (supabaseCount == null) {

      ok = false;

      note = 'No se pudo leer conteo Supabase';

    } else {
      delta = supabaseCount - firestoreCount;
      deltaPct = firestoreCount === 0 ? (supabaseCount === 0 ? 0 : 1) : Math.abs(delta) / firestoreCount;

      if (
        check.allowSupabaseHigher &&
        delta > 0 &&
        delta <= (check.allowSupabaseHigherMax ?? 5)
      ) {
        ok = true;
        note = `Supabase +${delta} (seed/stubs/re-ejecución dentro de umbral)`;
      } else {
        ok = deltaPct <= tolerance;
      }
    }



    if (!ok) failed = true;



    rows.push({

      label: check.label,

      firestoreCount,

      supabaseCount,

      delta,

      deltaPct,

      ok,

      note,

    });



    const status = ok ? 'OK' : 'FAIL';

    const supabaseLabel = supabaseCount == null ? 'n/a' : String(supabaseCount);

    console.log(
      `${status.padEnd(5)} ${check.label.padEnd(28)} FS=${String(firestoreCount).padStart(6)}  SB=${supabaseLabel.padStart(6)}` +
        (delta != null ? `  Δ=${delta}` : '') +
        (note ? `  (${note})` : '')
    );

  }



  const outputDir = getOutputDir();

  mkdirSync(outputDir, { recursive: true });

  const reportPath = resolve(outputDir, `validate-${Date.now()}.json`);

  writeFileSync(

    reportPath,

    JSON.stringify(

      {

        generatedAt: new Date().toISOString(),

        tolerance,

        rows,

        passed: !failed,

      },

      null,

      2

    ),

    'utf8'

  );



  console.log(`\nReporte: ${reportPath}`);

  process.exit(failed ? 1 : 0);

}



main().catch((error) => {

  console.error('Error en validate:', error);

  process.exit(1);

});


