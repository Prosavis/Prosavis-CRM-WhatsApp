import { mkdirSync, writeFileSync } from 'node:fs';

import { resolve } from 'node:path';

import { getOutputDir } from './lib/config.js';

import { createMigrationContext, type MigrationContext } from './lib/migration-context.js';

import { migrateAppointments } from './mappers/crm-appointments.js';

import { migrateChatMessages } from './mappers/crm-chat-messages.js';

import { migrateChats } from './mappers/crm-chats.js';

import { migrateCrmClients } from './mappers/crm-clients.js';

import { migrateFaqs } from './mappers/crm-faqs.js';

import {

  migrateAutomationExecutions,

  migrateAutomations,

  migrateExternalContacts,

  migrateImportBatches,

  migrateProfileViews,

  migrateTasks,

  migrateTeamMembers,

} from './mappers/crm-service-subcollections.js';

import { migrateBlocklist } from './mappers/whatsapp-blocklist.js';

import { migrateBroadcastJobs } from './mappers/whatsapp-broadcast-jobs.js';

import { migrateConversations } from './mappers/whatsapp-conversations.js';

import { migrateDiscountCodes } from './mappers/whatsapp-discount-codes.js';

import { migrateLeads } from './mappers/whatsapp-leads.js';

import { migrateMessageLog } from './mappers/whatsapp-messages.js';

import { migrateOutboundBatches } from './mappers/whatsapp-outbound-batches.js';

import { migratePlatformSettings } from './mappers/whatsapp-platform-settings.js';

import { migrateSnippets } from './mappers/whatsapp-snippets.js';

import { migrateStickers } from './mappers/whatsapp-stickers.js';

import { migrateWhatsappTags } from './mappers/whatsapp-tags.js';

import type { ExportStepOptions, MapperFn, MapperResult } from './mappers/types.js';



type ExportPhase = 'whatsapp' | 'crm';



type StepDef = {

  name: string;

  run: MapperFn;

};



const WHATSAPP_STEPS: StepDef[] = [

  { name: 'tags', run: migrateWhatsappTags },

  { name: 'platform_settings', run: migratePlatformSettings },

  { name: 'leads', run: migrateLeads },

  { name: 'discount_codes', run: migrateDiscountCodes },

  { name: 'snippets', run: migrateSnippets },

  { name: 'stickers', run: migrateStickers },

  { name: 'blocklist', run: migrateBlocklist },

  { name: 'conversations', run: migrateConversations },

  { name: 'messages', run: migrateMessageLog },

  { name: 'outbound_batches', run: migrateOutboundBatches },

  { name: 'broadcast_jobs', run: migrateBroadcastJobs },

];



const CRM_STEPS: StepDef[] = [

  { name: 'faqs', run: migrateFaqs },

  { name: 'crm_clients', run: migrateCrmClients },

  { name: 'team_members', run: migrateTeamMembers },

  { name: 'external_contacts', run: migrateExternalContacts },

  { name: 'import_batches', run: migrateImportBatches },

  { name: 'automations', run: migrateAutomations },

  { name: 'automation_executions', run: migrateAutomationExecutions },

  { name: 'tasks', run: migrateTasks },

  { name: 'profile_views', run: migrateProfileViews },

  { name: 'appointments', run: migrateAppointments },

  { name: 'chats', run: migrateChats },

  { name: 'chat_messages', run: migrateChatMessages },

];



function parseArgs(argv: string[]) {

  const phaseArg = argv.find((a) => a.startsWith('--phase='))?.split('=')[1] as ExportPhase | undefined;

  const stepArg = argv.find((a) => a.startsWith('--step='))?.split('=')[1];

  const sinceArg = argv.find((a) => a.startsWith('--since='))?.split('=')[1];

  const dryRun = argv.includes('--dry-run');



  return {

    phase: phaseArg ?? 'whatsapp',

    step: stepArg,

    since: sinceArg ? new Date(sinceArg) : undefined,

    dryRun,

  };

}



function printResult(step: string, result: MapperResult): void {

  console.log(

    `  ${step}: ${result.upserted}/${result.attempted} upserted` +

      (result.skipped ? ` (${result.skipped} omitidos)` : '')

  );

  if (result.errors.length) {

    for (const err of result.errors) {

      console.error(`    ERROR: ${err}`);

    }

  }

}



async function runPhase(

  steps: StepDef[],

  ctx: MigrationContext,

  options: ExportStepOptions,

  onlyStep?: string

): Promise<{ results: Record<string, MapperResult>; failed: boolean }> {

  const results: Record<string, MapperResult> = {};

  let failed = false;



  for (const step of steps) {

    if (onlyStep && step.name !== onlyStep) continue;



    console.log(`\n→ ${step.name}`);

    const result = await step.run(ctx, options);

    results[step.name] = result;

    printResult(step.name, result);



    if (result.errors.length > 0) failed = true;

  }



  if (ctx.warnings.length > 0) {

    console.log(`\nAdvertencias (${ctx.warnings.length}):`);

    for (const w of ctx.warnings.slice(0, 20)) {

      console.log(`  - ${w}`);

    }

    if (ctx.warnings.length > 20) {

      console.log(`  ... y ${ctx.warnings.length - 20} más`);

    }

  }



  return { results, failed };

}



async function main(): Promise<void> {

  const { phase, step, since, dryRun } = parseArgs(process.argv.slice(2));

  const options: ExportStepOptions = { since, dryRun };



  console.log('=== Export Firebase → Supabase ===');

  console.log(`Fase: ${phase}${step ? ` | Paso: ${step}` : ''}${dryRun ? ' | DRY-RUN' : ''}`);

  if (since) console.log(`Incremental desde: ${since.toISOString()}`);



  const ctx = await createMigrationContext();

  const steps = phase === 'crm' ? CRM_STEPS : WHATSAPP_STEPS;

  const { results, failed } = await runPhase(steps, ctx, options, step);



  const outputDir = getOutputDir();

  mkdirSync(outputDir, { recursive: true });

  const reportPath = resolve(outputDir, `export-${phase}-${Date.now()}.json`);

  writeFileSync(

    reportPath,

    JSON.stringify(

      {

        generatedAt: new Date().toISOString(),

        phase,

        step: step ?? 'all',

        dryRun,

        since: since?.toISOString() ?? null,

        results,

        warnings: ctx.warnings,

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

  console.error('Error en export:', error);

  process.exit(1);

});


