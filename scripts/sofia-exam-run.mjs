// Examen de Sofía en lotes. Primero 2 casos; si responden, sigue hasta el tope.
// No imprime borradores ni teléfonos. No activa la versión.

const url = process.env.SUPABASE_URL || 'https://djzwjaegxbhlefanmmee.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usdMax = Number(process.env.SOFIA_EXAM_USD_MAX || '25');
const version = Number(process.env.SOFIA_EXAM_VERSION || '2');

function summarize(payload) {
  return {
    graded: payload.graded ?? null,
    casos: payload.casos ?? null,
    gastado_usd: payload.gastado_usd ?? null,
    resumen: Boolean(payload.resumen),
    passed: payload.passed ?? null,
    pendientes: payload.pendientes ?? null,
    error: typeof payload.error === 'string' ? payload.error.slice(0, 120) : null,
  };
}

async function call(body) {
  const response = await fetch(`${url}/functions/v1/sofia-exam`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = summarize(payload);
    throw new Error(`examen ${response.status} ${detail.error ?? ''}`.trim());
  }
  return payload;
}

async function main() {
  if (!key) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY. No se calificó nada.');
    process.exit(1);
  }
  const runId = process.env.SOFIA_EXAM_RUN_ID || crypto.randomUUID();
  const smoke = await call({
    paso: 'correr',
    version,
    limite: 2,
    usdMax: Math.min(2, usdMax),
    runId,
    gastado: 0,
  });
  console.log(JSON.stringify({ paso: 'humo', runId, ...summarize(smoke) }));
  if (smoke.resumen) return;
  if ((smoke.graded ?? 0) < 1) {
    console.error('El humo no calificó ningún caso.');
    process.exit(1);
  }

  let spent = Number(smoke.gastado_usd) || 0;
  for (let guard = 0; guard < 200 && spent < usdMax; guard += 1) {
    const batch = await call({
      paso: 'correr',
      version,
      limite: 6,
      usdMax,
      runId,
      gastado: spent,
    });
    if (batch.resumen) {
      console.log(JSON.stringify({ paso: 'resumen', runId, ...summarize(batch), gastado_usd: spent }));
      return;
    }
    const next = Number(batch.gastado_usd) || spent;
    console.log(JSON.stringify({ paso: 'lote', runId, ...summarize(batch), gastado_usd: next }));
    if ((batch.graded ?? 0) < 1 || next <= spent && (batch.graded ?? 0) < 1) {
      console.log(JSON.stringify({ paso: 'detenido', runId, gastado_usd: next }));
      return;
    }
    spent = next;
  }
  console.log(JSON.stringify({ paso: 'tope', runId, gastado_usd: spent }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'falló');
  process.exit(1);
});
