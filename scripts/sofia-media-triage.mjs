// Reglas fijas y clasificación de imágenes y documentos.
// No analiza el archivo y no toca videos. El análisis de los útiles espera revisión.

import { randomUUID } from 'node:crypto';
import { runTriageClassify, runTriageRules, triageReport } from '../supabase/functions/_shared/sofiaTriage.mjs';

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const gemini = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_TRIAGE_MODEL || 'gemini-3.8-flash';
const usdMax = Number(process.env.SOFIA_TRIAGE_USD_MAX || '8');

async function main() {
  if (!key) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY. No se escribió nada.');
    process.exit(1);
  }
  const rules = await runTriageRules({ supabaseUrl: url, serviceKey: key });
  const runId = randomUUID();
  let classified = 0;
  let spent = 0;
  let doubts = 0;
  let stopped = false;
  let firstFailure = null;
  while (spent < usdMax) {
    const batch = await runTriageClassify({
      supabaseUrl: url,
      serviceKey: key,
      geminiKey: gemini,
      model,
      usdMax: usdMax - spent,
      limit: 12,
      runId,
    });
    classified += batch.clasificados ?? 0;
    doubts += batch.dudas ?? 0;
    spent += batch.gastado_usd ?? 0;
    if (batch.primer_fallo) firstFailure = batch.primer_fallo;
    if (batch.error === 'sin_clave') break;
    if ((batch.clasificados ?? 0) === 0) break;
    if (batch.detenido_por_tope) {
      stopped = true;
      break;
    }
    if (batch.primer_fallo) break;
  }
  const report = await triageReport({ supabaseUrl: url, serviceKey: key });
  console.log(JSON.stringify({
    reglas: rules,
    clasificados: classified,
    dudas: doubts,
    gastado_usd: Math.round(spent * 1_000_000) / 1_000_000,
    detenido_por_tope: stopped,
    primer_fallo: firstFailure,
    ...report,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
