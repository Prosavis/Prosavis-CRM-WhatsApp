/**
 * Semilla opcional 3k/10k para auditoría local.
 * NO importar desde seed.sql (rompe SQL CI).
 *
 * Uso: npx tsx scripts/audit/seed-perf.ts --count 3000
 */
const count = Number(process.argv.includes('--count')
  ? process.argv[process.argv.indexOf('--count') + 1]
  : 3000);

console.log(
  `Generar ${count} conversaciones en local con supabase db query / seed-perf.sql.`,
);
console.log('Archivo SQL: supabase/seed-perf.sql');
console.log('ENABLE_META_SEND debe permanecer false.');
