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
  console.log(JSON.stringify({ paso: 'inicio', run_id: runId, tope_usd: usdMax }));
  let classified = 0;
  let spent = 0;
  let doubts = 0;
  let stopped = false;
  let firstFailure = null;
  let passes = 0;
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
    console.log(JSON.stringify({
      paso: 'lote',
      clasificados: classified,
      dudas: doubts,
      gastado_usd: Math.round(spent * 1_000_000) / 1_000_000,
    }));
    if (batch.primer_fallo) firstFailure = batch.primer_fallo;
    if (batch.error === 'sin_clave') break;
    const stalled = (batch.clasificados ?? 0) === 0;
    if (stalled) {
      const waiting = await fetch(`${url}/rest/v1/whatsapp_message_log?select=id&media_triage_label=is.null&media_triage_reason=eq.reintento&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }).then((response) => response.json()).catch(() => []);
      const hasRetry = Array.isArray(waiting) && waiting.length > 0;
      if (!hasRetry) break;
      if (passes >= 1) {
        await fetch(`${url}/rest/v1/whatsapp_message_log?media_triage_label=is.null&media_triage_reason=eq.reintento`, {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            media_triage_label: 'duda',
            media_triage_reason: 'reintento',
            media_triage_at: new Date().toISOString(),
          }),
        });
        break;
      }
      await fetch(`${url}/rest/v1/whatsapp_message_log?media_triage_label=is.null&media_triage_reason=eq.reintento`, {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ media_triage_reason: null }),
      });
      passes += 1;
      continue;
    }
    if (batch.detenido_por_tope) {
      stopped = true;
      break;
    }
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
