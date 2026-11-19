// Diagnóstico de cómo respondemos. La rúbrica medible se cuenta en SQL.
// Sonnet escribe una nota estructurada, con tope de dólares y reanudación.
// No envía mensajes ni imprime chats.

import { randomUUID } from 'node:crypto';
import { runDiagnosisBatch } from '../supabase/functions/_shared/sofiaDiagnose.mjs';

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropic = process.env.ANTHROPIC_API_KEY || '';
const model = process.env.ANTHROPIC_MODEL || '';
const usdMax = Number(process.env.SOFIA_DIAGNOSE_USD_MAX || '60');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const countCap = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path.split('?')[0]}`);
  return response.json().catch(() => null);
}

async function measurable() {
  try {
    return await rest('rpc/refresh_whatsapp_study_reviews', { method: 'POST', body: '{}' });
  } catch {
    return 'omitido';
  }
}

async function main() {
  if (!key) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY. No se escribió nada.');
    process.exit(1);
  }
  const counted = await measurable();
  const runId = randomUUID();
  let reviewed = 0;
  let failed = 0;
  let spent = 0;
  let firstFailure = null;
  let stopped = false;
  let passes = 0;
  while (spent < usdMax && reviewed < countCap) {
    const room = Number.isFinite(countCap) ? Math.min(12, countCap - reviewed) : 12;
    if (room <= 0) break;
    const batch = await runDiagnosisBatch({
      supabaseUrl: url,
      serviceKey: key,
      anthropicKey: anthropic,
      model,
      usdMax: usdMax - spent,
      limit: room,
      runId,
    });
    reviewed += batch.revisados ?? 0;
    failed += batch.fallos ?? 0;
    spent += batch.gastado_usd ?? 0;
    if (!firstFailure && batch.primer_fallo) firstFailure = batch.primer_fallo;
    if (batch.sonnet === 'sin_clave' || batch.sonnet === 'sin_modelo') {
      console.log(JSON.stringify({ rubrica_medida: counted, ...batch }));
      return;
    }
    if ((batch.revisados ?? 0) === 0 && (batch.fallos ?? 0) === 0) {
      if (passes >= 1) break;
      const waiting = await rest('whatsapp_study_chat_reviews?select=stable_key&diagnostico_error=eq.reintento&limit=1');
      if (!Array.isArray(waiting) || waiting.length === 0) break;
      await rest('whatsapp_study_chat_reviews?diagnostico_error=eq.reintento', {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ diagnostico_error: null }),
      });
      passes += 1;
      continue;
    }
    if (batch.detenido_por_tope || batch.fallo_sistemico) {
      stopped = true;
      break;
    }
    if ((batch.revisados ?? 0) === 0 && (batch.marcados ?? 0) === 0 && (batch.fallos ?? 0) > 0) break;
  }
  console.log(JSON.stringify({
    rubrica_medida: counted,
    sonnet: model || 'sin_modelo',
    revisados: reviewed,
    fallos: failed,
    gastado_usd: Math.round(spent * 1_000_000) / 1_000_000,
    detenido_por_tope: stopped || spent >= usdMax,
    primer_fallo: firstFailure,
    run_id: runId,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
